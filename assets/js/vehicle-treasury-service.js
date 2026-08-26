(() => {
  'use strict';

  const LEGACY_CACHE_KEY = 'petatoe-vehicle-treasury-cache-v1';
  const CACHE_PREFIX = 'vehicle-treasury:workspace:v2:';
  const SCOPE_CACHE_KEY = 'vehicle-treasury:scope:v2';
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const CACHE_STALE_MAX_MS = 365 * 24 * 60 * 60 * 1000;
  const CACHE_SCHEMA_VERSION = 2;

  let snapshot = { teams: [], movements: [], summary: null, selectedTeamId: '', from: '', to: '', search: '' };
  let readStatus = 'idle';

  // The old cache was global across users. Never migrate it into a user namespace because
  // its owner cannot be proven safely. Remove it once this service is loaded.
  try { localStorage.removeItem(LEGACY_CACHE_KEY); } catch (_) {}

  const db = () => {
    const client = window.customerSupabase || window.supabaseClient || window.supabase;
    if (!client) throw new Error('خدمة قاعدة البيانات غير جاهزة.');
    return client;
  };
  const requireAction = (action='view') => {
    const ok = window.PermissionEngine?.requireAction?.('vehicleTreasury', action, { silent: true })
      ?? window.CustomerPermissions?.requireAction?.('vehicleTreasury', action, { silent: true });
    if (ok !== true) throw new Error('لا توجد صلاحية لهذه العملية في خزينة السيارة.');
  };
  const num = value => Number(value || 0);
  const localDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0,10);
  };
  const clone = value => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  const normalizeFilters = filters => ({
    teamId: String(filters?.teamId || filters?.selectedTeamId || '').trim(),
    from: String(filters?.from || '').trim(),
    to: String(filters?.to || '').trim(),
    search: String(filters?.search || '').trim()
  });
  const normalize = raw => ({
    teams: Array.isArray(raw?.teams) ? raw.teams : [],
    movements: Array.isArray(raw?.movements) ? raw.movements : [],
    summary: raw?.summary && typeof raw.summary === 'object' ? raw.summary : null,
    selectedTeamId: String(raw?.selectedTeamId || ''),
    from: String(raw?.from || ''),
    to: String(raw?.to || ''),
    search: String(raw?.search || '')
  });

  async function namespace() {
    const localId = window.KYUMOfflineSessionStore?.currentUserId?.();
    if (localId) return `user:${localId}`;
    if (window.KYUMOfflineQueue?.getNamespace) {
      try { return await window.KYUMOfflineQueue.getNamespace({ allowNetwork: false }); } catch (_) {}
    }
    try {
      const session = await db().auth?.getSession?.();
      const id = session?.data?.session?.user?.id;
      if (id) return `user:${id}`;
    } catch (_) {}
    throw new Error('تعذر تحديد المستخدم الحالي لعزل بيانات خزينة السيارة.');
  }

  function scopeHash(teamIds) {
    const ids = [...new Set((teamIds || []).filter(Boolean).map(String))].sort();
    return window.KYUMSmartCache?.hashValue?.(ids) || `teams:${ids.join(',')}`;
  }

  function filterToken(filters) {
    const f = normalizeFilters(filters);
    return [f.teamId || '*', f.from || '*', f.to || '*', f.search || '*']
      .map(value => encodeURIComponent(String(value).toLowerCase()))
      .join('|');
  }

  function workspaceKey(filters, hash) {
    return `${CACHE_PREFIX}${hash}:${filterToken(filters)}`;
  }

  async function readScope(ns) {
    if (!window.KYUMSmartCache) return null;
    const hit = await window.KYUMSmartCache.get(SCOPE_CACHE_KEY, {
      namespace: ns,
      allowStale: true,
      allowStaleAnyAge: true,
      staleMaxMs: CACHE_STALE_MAX_MS
    });
    return hit?.hit && hit.data?.hash ? hit.data : null;
  }

  async function reconcileScope(ns, teams) {
    if (!window.KYUMSmartCache) return scopeHash((teams || []).map(x => x?.id));
    const teamIds = [...new Set((teams || []).map(x => x?.id).filter(Boolean).map(String))].sort();
    const hash = scopeHash(teamIds);
    const previous = await readScope(ns);
    if (previous?.hash && previous.hash !== hash) {
      await window.KYUMSmartCache.removePrefix(CACHE_PREFIX, { namespace: ns });
    }
    await window.KYUMSmartCache.set(SCOPE_CACHE_KEY, { hash, teamIds }, {
      namespace: ns,
      ttlMs: CACHE_TTL_MS,
      staleMaxMs: CACHE_STALE_MAX_MS,
      source: 'supabase-scope',
      schemaVersion: CACHE_SCHEMA_VERSION
    });
    return hash;
  }

  async function persistCache(value, filters, source = 'supabase') {
    if (!window.KYUMSmartCache) return;
    const ns = await namespace();
    const hash = source === 'supabase'
      ? await reconcileScope(ns, value?.teams || [])
      : (await readScope(ns))?.hash;
    if (!hash) return;
    await window.KYUMSmartCache.set(workspaceKey(filters, hash), value, {
      namespace: ns,
      ttlMs: CACHE_TTL_MS,
      staleMaxMs: CACHE_STALE_MAX_MS,
      source,
      schemaVersion: CACHE_SCHEMA_VERSION
    });
  }

  async function loadCache(filters) {
    if (!window.KYUMSmartCache) return null;
    const ns = await namespace();
    const scope = await readScope(ns);
    if (!scope?.hash) return null;
    const hit = await window.KYUMSmartCache.get(workspaceKey(filters, scope.hash), {
      namespace: ns,
      allowStale: true,
      allowStaleAnyAge: true,
      staleMaxMs: CACHE_STALE_MAX_MS
    });
    return hit?.hit ? normalize(hit.data) : null;
  }

  async function invalidateCache() {
    if (!window.KYUMSmartCache) return;
    const ns = await namespace();
    await window.KYUMSmartCache.removePrefix(CACHE_PREFIX, { namespace: ns });
  }

  async function attachExpenseVersions(workspace) {
    const next = normalize(workspace);
    const ids = [...new Set(next.movements
      .filter(row => row?.editable && row?.movementType === 'expense')
      .map(row => String(row?.sourceId || row?.id || '').trim())
      .filter(id => id && !id.startsWith('local:')))];
    if (!ids.length) return next;

    const versions = new Map();
    const pageSize = 200;
    for (let offset = 0; offset < ids.length; offset += pageSize) {
      const page = ids.slice(offset, offset + pageSize);
      const { data, error } = await db()
        .from('vehicle_treasury_expenses')
        .select('id,updated_at')
        .in('id', page);
      if (error) throw new Error('تعذر التحقق من إصدارات حركات خزينة السيارة: ' + error.message);
      for (const row of data || []) versions.set(String(row.id), row.updated_at || '');
    }

    next.movements = next.movements.map(row => {
      const id = String(row?.sourceId || row?.id || '');
      return versions.has(id) ? { ...row, updatedAt: versions.get(id) } : row;
    });
    return next;
  }

  function snapshotFilters() {
    return normalizeFilters({
      teamId: snapshot.selectedTeamId,
      from: snapshot.from,
      to: snapshot.to,
      search: snapshot.search
    });
  }

  function movementMatchesFilters(row, filters) {
    const f = normalizeFilters(filters);
    if (f.teamId && String(row?.teamId || '') !== f.teamId) return false;
    const date = String(row?.movementDate || '');
    if (f.from && date && date < f.from) return false;
    if (f.to && date && date > f.to) return false;
    if (f.search) {
      const haystack = [row?.reference, row?.description, row?.carName, row?.teamName]
        .map(value => String(value || '').toLowerCase()).join(' ');
      if (!haystack.includes(f.search.toLowerCase())) return false;
    }
    return true;
  }

  function recalcSummary(data) {
    const amounts = (data.movements || []).map(row => num(row?.amount));
    const revenue = amounts.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
    const expenseSigned = amounts.filter(value => value < 0).reduce((sum, value) => sum + value, 0);
    data.summary = { revenue, expense: Math.abs(expenseSigned), balance: revenue + expenseSigned, count: amounts.length };
    return data;
  }

  async function applyOptimisticExpense(payload, localId) {
    const next = normalize(clone(snapshot));
    const filters = snapshotFilters();
    const existingIndex = next.movements.findIndex(row => String(row?.sourceId || row?.id || '') === String(localId));
    const existing = existingIndex >= 0 ? next.movements[existingIndex] : null;
    const team = next.teams.find(row => String(row?.id || '') === String(payload.teamId)) || {};
    const row = {
      ...(existing || {}),
      id: localId,
      sourceId: localId,
      movementType: 'expense',
      movementSerial: existing?.movementSerial || 'OFFLINE',
      movementDate: payload.date,
      reference: existing?.reference || 'OFFLINE',
      description: payload.description,
      amount: -Math.abs(num(payload.amount)),
      teamId: payload.teamId,
      teamName: team.teamName || existing?.teamName || '',
      carName: team.carName || existing?.carName || '',
      plateNumber: team.plateNumber || existing?.plateNumber || '',
      notes: payload.notes,
      editable: true,
      pendingSync: true,
      // Keep the last authoritative server version. Local edit time is separate so conflict
      // comparison never mistakes an optimistic timestamp for a server timestamp.
      updatedAt: existing?.updatedAt || payload.baseUpdatedAt || '',
      localUpdatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) next.movements.splice(existingIndex, 1);
    if (movementMatchesFilters(row, filters)) next.movements.unshift(row);
    recalcSummary(next);
    snapshot = next;
    await persistCache(next, filters, 'offline-optimistic');
  }

  function makeLocalToken() {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `local:vehicle-treasury:${suffix}`;
  }

  function clientOperationKey(localId) {
    return `vehicle_treasury:create:${String(localId || '').replace(/^local:/, '')}`;
  }

  async function load(filters = {}) {
    requireAction('view');
    const f = normalizeFilters(filters);

    const useCached = async () => {
      const cached = await loadCache(f);
      if (!cached) return null;
      snapshot = cached;
      readStatus = 'offline-cache';
      return snapshot;
    };

    if (navigator.onLine === false) {
      const cached = await useCached();
      if (!cached) throw new Error('لا توجد بيانات خزينة سيارة محفوظة لهذا المستخدم وهذا النطاق للعمل دون اتصال.');
      return cached;
    }

    try {
      const { data, error } = await db().rpc('get_vehicle_treasury_workspace', {
        p_team_id: f.teamId || null,
        p_from: f.from || null,
        p_to: f.to || null,
        p_search: f.search || null
      });
      if (error) throw new Error('تعذر تحميل خزينة السيارة: ' + error.message);
      const enriched = await attachExpenseVersions({ ...(data || {}), selectedTeamId: f.teamId, from: f.from, to: f.to, search: f.search });
      snapshot = enriched;
      await persistCache(snapshot, f, 'supabase');
      readStatus = 'network';
      return snapshot;
    } catch (error) {
      if (window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        const cached = await useCached();
        if (cached) return cached;
      }
      throw error;
    }
  }

  async function addExpenseOnline(payload) {
    const { data, error } = await db().rpc('add_vehicle_treasury_expense_idempotent', {
      p_team_id: payload.teamId,
      p_expense_date: payload.date,
      p_description: payload.description,
      p_amount: payload.amount,
      p_notes: payload.notes || null,
      p_client_operation_key: payload.clientOperationKey
    });
    if (error) throw new Error('تعذر تسجيل المصروف: ' + error.message);
    await invalidateCache();
    return data;
  }

  async function updateExpenseOnline(payload, options = {}) {
    const guarded = options.guarded !== false;
    const rpcName = guarded ? 'update_vehicle_treasury_expense_guarded' : 'update_vehicle_treasury_expense';
    const args = guarded
      ? {
          p_id: payload.id,
          p_team_id: payload.teamId,
          p_expense_date: payload.date,
          p_description: payload.description,
          p_amount: payload.amount,
          p_notes: payload.notes || null,
          p_base_updated_at: payload.baseUpdatedAt || null
        }
      : {
          p_id: payload.id,
          p_team_id: payload.teamId,
          p_expense_date: payload.date,
          p_description: payload.description,
          p_amount: payload.amount,
          p_notes: payload.notes || null
        };
    const { data, error } = await db().rpc(rpcName, args);
    if (error) {
      const message = String(error.message || error);
      if (guarded && /VEHICLE_TREASURY_SYNC_CONFLICT|VT_SYNC_BASE_REQUIRED/i.test(message)) {
        throw new window.KYUMOfflineQueue.ConflictError('تم تعديل حركة خزينة السيارة على الخادم بعد آخر مزامنة.', {
          entityId: payload.id,
          baseUpdatedAt: payload.baseUpdatedAt || ''
        });
      }
      throw new Error('تعذر تعديل المصروف: ' + message);
    }
    await invalidateCache();
    return data;
  }

  async function findVehicleCreateOperation(localId, namespaceValue) {
    if (!localId || !window.KYUMOfflineQueue?.list) return null;
    const rows = await window.KYUMOfflineQueue.list({
      namespace: namespaceValue,
      statuses: ['pending', 'retry', 'processing', 'synced']
    });
    return rows.find(row => row.entity === 'vehicle_treasury'
      && ['create', 'expense_create'].includes(row.action)
      && String(row.localEntityId || '') === String(localId)) || null;
  }

  async function queueExpense(payload, localIdHint = '') {
    if (!window.KYUMOfflineQueue) throw new Error('نظام المزامنة غير جاهز.');
    const isCreate = !payload.id;
    const localId = isCreate ? (localIdHint || makeLocalToken()) : String(payload.id);
    const ns = await window.KYUMOfflineQueue.getNamespace({ allowNetwork: false });
    const dependsOn = [];

    if (!isCreate && localId.startsWith('local:')) {
      const parent = await findVehicleCreateOperation(localId, ns);
      if (!parent?.id) throw new Error('تعذر ربط تعديل المصروف المحلي بعملية الإنشاء الأصلية.');
      dependsOn.push(parent.id);
    }

    const queuePayload = {
      ...payload,
      id: localId,
      clientOperationKey: isCreate
        ? (payload.clientOperationKey || clientOperationKey(localId))
        : payload.clientOperationKey
    };
    const queued = await window.KYUMOfflineQueue.enqueue({
      entity: 'vehicle_treasury',
      action: isCreate ? 'create' : 'update',
      payload: queuePayload,
      localEntityId: localId,
      baseUpdatedAt: payload.baseUpdatedAt || '',
      dependsOn,
      idempotencyKey: isCreate ? queuePayload.clientOperationKey : undefined
    });

    await applyOptimisticExpense(queuePayload, localId);
    if (navigator.onLine !== false) {
      window.KYUMOfflineQueue.process({ namespace: ns }).catch(() => {});
    }
    return queued.localEntityId || localId;
  }

  async function saveExpense(record, context = {}) {
    requireAction(record?.id ? 'edit' : 'add');
    const payload = {
      id: record?.id || null,
      teamId: String(record?.teamId || '').trim(),
      date: String(record?.date || localDate()).trim(),
      description: String(record?.description || '').trim(),
      amount: num(record?.amount),
      notes: String(record?.notes || '').trim(),
      baseUpdatedAt: String(record?.baseUpdatedAt || record?.updatedAt || record?.updated_at || '').trim(),
      clientOperationKey: String(record?.clientOperationKey || '').trim()
    };
    if (!payload.teamId) throw new Error('اختر السيارة / الفرقة.');
    if (!payload.date) throw new Error('تاريخ الصرف مطلوب.');
    if (!payload.description) throw new Error('بيان المصروف مطلوب.');
    if (!(payload.amount > 0)) throw new Error('قيمة المصروف يجب أن تكون أكبر من صفر.');

    const isLocalUpdate = Boolean(payload.id && String(payload.id).startsWith('local:'));
    if (!context.skipOfflineQueue && isLocalUpdate) return queueExpense(payload);

    if (!context.skipOfflineQueue && navigator.onLine === false) {
      if (payload.id && !payload.baseUpdatedAt) {
        throw new Error('يلزم تحديث بيانات حركة الصرف مرة واحدة أثناء الاتصال قبل تعديلها دون اتصال.');
      }
      return queueExpense(payload);
    }

    const createLocalId = payload.id ? '' : makeLocalToken();
    if (!payload.id && !payload.clientOperationKey) payload.clientOperationKey = clientOperationKey(createLocalId);

    try {
      if (payload.id) {
        if (!context.skipOfflineQueue && !payload.baseUpdatedAt) {
          throw new Error('نسخة حركة الصرف غير محدثة. حدّث خزينة السيارة ثم أعد التعديل.');
        }
        return await updateExpenseOnline(payload, { guarded: context.skipConflictGuard !== true });
      }
      return await addExpenseOnline(payload);
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        if (payload.id && !payload.baseUpdatedAt) throw error;
        return queueExpense(payload, createLocalId);
      }
      throw error;
    }
  }

  async function deleteExpense(id) {
    requireAction('delete');
    if (!id) throw new Error('معرّف المصروف غير موجود.');
    if (String(id).startsWith('local:')) throw new Error('لا يمكن حذف حركة محلية قبل اكتمال مزامنتها.');
    if (navigator.onLine === false) throw new Error('يلزم الاتصال بالإنترنت لحذف حركة من خزينة السيارة.');
    const { error } = await db().rpc('delete_vehicle_treasury_expense', { p_id: id });
    if (error) throw new Error('تعذر حذف المصروف: ' + error.message);
    await invalidateCache();
    return true;
  }

  window.KYUMSyncEngine?.register?.('vehicle_treasury', () => load(snapshotFilters()));
  window.KYUMOfflineQueue?.register?.('vehicle_treasury', async (operation, helpers = {}) => {
    const p = operation.payload || {};
    if (['create', 'expense_create'].includes(operation.action)) {
      const createPayload = {
        ...p,
        id: null,
        clientOperationKey: p.clientOperationKey || operation.idempotencyKey || clientOperationKey(operation.localEntityId)
      };
      return { id: await addExpenseOnline(createPayload) };
    }
    if (['update', 'expense_update'].includes(operation.action)) {
      let serverId = p.id;
      const wasLocal = String(serverId || '').startsWith('local:');
      if (wasLocal) {
        serverId = await helpers.resolveServerId?.(serverId, operation.namespace);
        if (!serverId) {
          const parent = await findVehicleCreateOperation(p.id, operation.namespace);
          if (parent?.status === 'synced' && parent.resultId) serverId = parent.resultId;
          else throw new Error('offline_dependency_pending_vehicle_treasury_create');
        }
      }
      if (!serverId) throw new Error('تعذر تحديد معرّف حركة الصرف على الخادم.');
      const updatePayload = { ...p, id: serverId, baseUpdatedAt: operation.baseUpdatedAt || p.baseUpdatedAt || '' };
      return {
        id: await updateExpenseOnline(updatePayload, {
          // A local create followed by a local update is already ordered by dependency and has
          // no authoritative base version before the create is replayed. Existing server rows
          // always use the atomic guarded RPC.
          guarded: !wasLocal
        })
      };
    }
    throw new Error('عملية خزينة السيارة غير مدعومة في المزامنة.');
  });

  window.VehicleTreasuryService = Object.freeze({
    load,
    saveExpense,
    deleteExpense,
    getSnapshot: () => snapshot,
    getReadStatus: () => readStatus,
    invalidateCache
  });
})();
