(() => {
  'use strict';

  const CACHE_KEY = 'petatoe-vehicle-treasury-cache-v1';
  let snapshot = { teams: [], movements: [], summary: null, selectedTeamId: '', from: '', to: '', search: '' };
  let readStatus = 'idle';

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
  const saveCache = value => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), value })); } catch (_) {}
  };
  const loadCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')?.value || null; } catch (_) { return null; }
  };
  const normalize = raw => ({
    teams: Array.isArray(raw?.teams) ? raw.teams : [],
    movements: Array.isArray(raw?.movements) ? raw.movements : [],
    summary: raw?.summary && typeof raw.summary === 'object' ? raw.summary : null,
    selectedTeamId: String(raw?.selectedTeamId || ''),
    from: String(raw?.from || ''),
    to: String(raw?.to || ''),
    search: String(raw?.search || '')
  });

  async function load(filters = {}) {
    requireAction('view');
    const selectedTeamId = String(filters.teamId || '').trim();
    const from = String(filters.from || '').trim();
    const to = String(filters.to || '').trim();
    const search = String(filters.search || '').trim();
    if (navigator.onLine === false) {
      const cached = loadCache();
      if (!cached) throw new Error('لا توجد بيانات خزينة سيارة محفوظة للعمل دون اتصال.');
      snapshot = normalize(cached);
      readStatus = 'offline-cache';
      return snapshot;
    }
    const { data, error } = await db().rpc('get_vehicle_treasury_workspace', {
      p_team_id: selectedTeamId || null,
      p_from: from || null,
      p_to: to || null,
      p_search: search || null
    });
    if (error) throw new Error('تعذر تحميل خزينة السيارة: ' + error.message);
    snapshot = normalize({ ...(data || {}), selectedTeamId, from, to, search });
    saveCache(snapshot);
    readStatus = 'network';
    return snapshot;
  }

  async function saveExpense(record, context = {}) {
    requireAction(record?.id ? 'edit' : 'add');
    const payload = {
      id: record?.id || null,
      teamId: String(record?.teamId || '').trim(),
      date: String(record?.date || localDate()).trim(),
      description: String(record?.description || '').trim(),
      amount: num(record?.amount),
      notes: String(record?.notes || '').trim()
    };
    if (!payload.teamId) throw new Error('اختر السيارة / الفرقة.');
    if (!payload.date) throw new Error('تاريخ الصرف مطلوب.');
    if (!payload.description) throw new Error('بيان المصروف مطلوب.');
    if (!(payload.amount > 0)) throw new Error('قيمة المصروف يجب أن تكون أكبر من صفر.');

    const callOnline = async () => {
      const fn = payload.id ? 'update_vehicle_treasury_expense' : 'add_vehicle_treasury_expense';
      const args = payload.id
        ? { p_id: payload.id, p_team_id: payload.teamId, p_expense_date: payload.date, p_description: payload.description, p_amount: payload.amount, p_notes: payload.notes || null }
        : { p_team_id: payload.teamId, p_expense_date: payload.date, p_description: payload.description, p_amount: payload.amount, p_notes: payload.notes || null };
      const { data, error } = await db().rpc(fn, args);
      if (error) throw new Error((payload.id ? 'تعذر تعديل المصروف: ' : 'تعذر تسجيل المصروف: ') + error.message);
      return data;
    };

    if (!context.skipOfflineQueue && navigator.onLine === false) {
      if (!window.KYUMOfflineQueue) throw new Error('نظام المزامنة غير جاهز.');
      const localId = payload.id || `local:vehicle-treasury:${Date.now()}`;
      await window.KYUMOfflineQueue.enqueue({
        entity: 'vehicle_treasury', action: payload.id ? 'expense_update' : 'expense_create',
        payload: { ...payload, id: localId }, localEntityId: localId,
        idempotencyKey: `vehicle_treasury:${payload.id ? 'update' : 'create'}:${localId}`
      });
      const cached = loadCache();
      if (cached) {
        const next = normalize(cached);
        next.movements.unshift({ id: localId, sourceId: localId, movementType: 'expense', movementSerial: 'OFFLINE', movementDate: payload.date, reference: '', description: payload.description, amount: -payload.amount, teamId: payload.teamId, notes: payload.notes, editable: true, pendingSync: true });
        saveCache(next);
        snapshot = next;
      }
      return localId;
    }
    try { return await callOnline(); }
    catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        if (!window.KYUMOfflineQueue) throw error;
        const localId = payload.id || `local:vehicle-treasury:${Date.now()}`;
        await window.KYUMOfflineQueue.enqueue({entity:'vehicle_treasury',action:payload.id?'expense_update':'expense_create',payload:{...payload,id:localId},localEntityId:localId,idempotencyKey:`vehicle_treasury:${payload.id?'update':'create'}:${localId}`});
        return localId;
      }
      throw error;
    }
  }

  async function deleteExpense(id) {
    requireAction('delete');
    if (!id) throw new Error('معرّف المصروف غير موجود.');
    if (navigator.onLine === false) throw new Error('يلزم الاتصال بالإنترنت لحذف حركة من خزينة السيارة.');
    const { error } = await db().rpc('delete_vehicle_treasury_expense', { p_id: id });
    if (error) throw new Error('تعذر حذف المصروف: ' + error.message);
    return true;
  }

  window.KYUMSyncEngine?.register?.('vehicle_treasury', () => load(snapshot));
  window.KYUMOfflineQueue?.register?.('vehicle_treasury', async operation => {
    const p = operation.payload || {};
    if (operation.action === 'expense_create') {
      return { id: await saveExpense({ ...p, id: null }, { skipOfflineQueue: true }) };
    }
    if (operation.action === 'expense_update') {
      const serverId = String(p.id || '').startsWith('local:') ? null : p.id;
      if (!serverId) throw new Error('تعذر مزامنة تعديل مصروف محلي قبل إنشاء السجل الأصلي.');
      return { id: await saveExpense({ ...p, id: serverId }, { skipOfflineQueue: true }) };
    }
    throw new Error('عملية خزينة السيارة غير مدعومة في المزامنة.');
  });

  window.VehicleTreasuryService = Object.freeze({ load, saveExpense, deleteExpense, getSnapshot: () => snapshot, getReadStatus: () => readStatus });
})();
