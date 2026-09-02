// KYUM Phase 09 — Follow-ups Supabase Service
(function () {

  function requirePermission(screenKey, action) {
    if (!window.CustomerPermissions?.requireAction?.(screenKey, action, { silent: true })) {
      throw new Error(`Permission denied: ${screenKey}.${action}`);
    }
  }
  function client() {
    if (!window.customerSupabase) {
      throw new Error("اتصال Supabase غير جاهز.");
    }
    return window.customerSupabase;
  }


  const FOLLOWUPS_CACHE_TTL_MS = 10 * 60 * 1000;
  const FOLLOWUPS_CACHE_STALE_MAX_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  const FOLLOWUPS_CACHE_SCHEMA_VERSION = 2;
  const followupRefreshes = new Map();
  let lastReadStatus = null;

  async function currentFollowupNamespace() {
    const localId = window.KYUMOfflineSessionStore?.currentUserId?.();
    if (localId) return `user:${localId}`;
    try {
      const result = await client().auth.getUser();
      return `user:${result?.data?.user?.id || "anonymous"}`;
    } catch (_) {
      return "user:anonymous";
    }
  }

  function followupScopeCacheKey(scope) {
    const ids = Array.isArray(scope?.representativeIds)
      ? [...scope.representativeIds].filter(Boolean).sort()
      : [];
    return `followups:v2:${scope?.mode || "none"}:${ids.join(",") || "all"}`;
  }

  function isFollowupTombstone(row) { return Boolean(row?.__deleted); }

  async function pendingFollowupDeleteState(namespace) {
    const followupIds = new Set();
    const customerIds = new Set();
    if (!window.KYUMOfflineQueue?.list) return { followupIds, customerIds };
    try {
      const rows = await window.KYUMOfflineQueue.list({ namespace, statuses: ["pending", "retry", "processing"] });
      for (const row of rows) {
        if (row.action !== "delete") continue;
        if (row.entity === "followups") followupIds.add(String(row.payload?.id || row.localEntityId || ""));
        if (row.entity === "customers") customerIds.add(String(row.payload?.id || row.localEntityId || ""));
      }
    } catch (_) {}
    return { followupIds, customerIds };
  }

  async function visibleFollowupRows(rows, namespace) {
    const pending = await pendingFollowupDeleteState(namespace);
    return (rows || []).filter(row => !isFollowupTombstone(row)
      && !pending.followupIds.has(String(row?.id || ""))
      && !pending.customerIds.has(String(row?.customerId || "")));
  }

  function normalizeFollowupTombstone(row) {
    return { id: row.entity_id, customerId: row.customer_id || "", representativeId: row.representative_id || "",
      __deleted: true, deletedAt: row.deleted_at || "", updatedAt: row.deleted_at || "", sourceUpdatedAt: row.source_updated_at || "" };
  }

  async function fetchFollowupTombstones(since) {
    if (!since) return [];
    const rows = await unwrap(client().rpc("list_crm_sync_tombstones", { p_entity: "followups", p_since: since }), "تعذر تحميل سجل حذف المتابعات");
    return (rows || []).map(normalizeFollowupTombstone);
  }

  function emitFollowupCacheUpdate(data, source, cacheKey) {
    window.dispatchEvent(new CustomEvent("kyum-followup-cache-updated", {
      detail: { data, source, cacheKey, updatedAt: Date.now() }
    }));
  }

  async function persistFollowups(cacheKey, rows, namespace) {
    if (!window.KYUMSmartCache) return null;
    return window.KYUMSmartCache.set(cacheKey, rows, {
      namespace,
      ttlMs: FOLLOWUPS_CACHE_TTL_MS,
      staleMaxMs: FOLLOWUPS_CACHE_STALE_MAX_MS,
      source: "supabase",
      schemaVersion: FOLLOWUPS_CACHE_SCHEMA_VERSION
    });
  }

  async function invalidateFollowupCache() {
    if (!window.KYUMSmartCache) return;
    const namespace = await currentFollowupNamespace();
    await window.KYUMSmartCache.removePrefix("followups:", { namespace });
  }

  async function unwrap(request, fallbackMessage) {
    const { data, error } = await request;
    if (error) {
      if (error.code === "23503") {
        throw new Error("تعذر الحفظ بسبب ارتباط العميل أو المندوب أو سبب عدم البيع.");
      }
      throw new Error(`${fallbackMessage}: ${error.message}`);
    }
    return data;
  }

  function normalizeFollowup(row) {
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer?.customer_name || "",
      customerPhone: row.customer?.phone || "",
      contactDate: row.contact_date || "",
      method: row.contact_method || "",
      representative: row.representative?.full_name || "",
      representativeId: row.representative_id || row.representative?.id || null,
      result: row.contact_result || "",
      quotationNumber: row.quotation_number || "",
      noSaleReason: row.no_sale_reason?.name || "",
      noSaleReasonId: row.no_sale_reason_id || row.no_sale_reason?.id || null,
      nextFollowupDate: row.next_followup_date || "",
      completed: Boolean(row.is_completed),
      notes: row.notes || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  async function resolveRepresentativeScope() {
    // Canonical resolver keeps the cached scope retained when the network is unavailable.
    if (!window.KYUMDataAccessScope?.resolve) return { mode: "none", representativeIds: [] };
    return window.KYUMDataAccessScope.resolve({ domain: "followups" });
  }

  async function fetchFollowupsFromNetwork(scope, options = {}) {
    if (scope.mode === "none") return [];

    let request = client()
      .from("customer_followups")
      .select(`
          id,
          customer_id,
          contact_date,
          contact_method,
          representative_id,
          contact_result,
          quotation_number,
          no_sale_reason_id,
          next_followup_date,
          is_completed,
          notes,
          created_at,
          updated_at,
          customer:customers (
            id,
            customer_name,
            phone
          ),
          representative:sales_representatives (
            id,
            full_name
          ),
          no_sale_reason:no_sale_reasons (
            id,
            name
          )
        `)
      .order("contact_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (options.updatedSince) request = request.gte("updated_at", options.updatedSince);
    if (scope.mode === "selected") {
      if (!scope.representativeIds.length) return [];
      request = request.in("representative_id", scope.representativeIds);
    }

    const rows = await unwrap(request, "تعذر تحميل المتابعات");
    return (rows || []).map(normalizeFollowup);
  }

  async function fetchFollowupDelta(scope, since) {
    const [changedRows, tombstones] = await Promise.all([
      fetchFollowupsFromNetwork(scope, { updatedSince: since }),
      fetchFollowupTombstones(since)
    ]);
    return [...changedRows, ...tombstones];
  }

  function sortFollowups(rows) {
    const active = (rows || []).filter(row => !isFollowupTombstone(row)).sort((a, b) => {
      const dateDiff = String(b?.contactDate || "").localeCompare(String(a?.contactDate || ""));
      if (dateDiff) return dateDiff;
      return (Date.parse(b?.createdAt || "") || 0) - (Date.parse(a?.createdAt || "") || 0);
    });
    const deleted = (rows || []).filter(isFollowupTombstone).sort((a,b) => (Date.parse(b?.updatedAt||"")||0)-(Date.parse(a?.updatedAt||"")||0));
    return [...active, ...deleted];
  }

  async function refreshFollowupsInBackground(scope, namespace, cacheKey, previousRows) {
    if (followupRefreshes.has(cacheKey)) return followupRefreshes.get(cacheKey);

    const refresh = (async () => {
      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "followups",
            namespace,
            scopeKey: cacheKey,
            cachedRows: previousRows,
            fetchFull: () => fetchFollowupsFromNetwork(scope),
            fetchDelta: since => fetchFollowupDelta(scope, since),
            sortRows: sortFollowups
          })
        : { rows: await fetchFollowupsFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistFollowups(cacheKey, rows, namespace);
      window.KYUMSyncRetention?.ack?.({ entity: "followups", scopeKey: cacheKey, state: result.state }).catch(error => {
        console.warn("Followups sync watermark ack skipped:", error);
      });
      const previousHash = window.KYUMSmartCache?.hashValue?.(previousRows);
      const nextHash = window.KYUMSmartCache?.hashValue?.(rows);
      if (previousHash !== nextHash) {
        emitFollowupCacheUpdate(await visibleFollowupRows(rows, namespace), `network-${result.mode}`, cacheKey);
      }
      return visibleFollowupRows(rows, namespace);
    })();

    followupRefreshes.set(cacheKey, refresh);
    try {
      return await refresh;
    } finally {
      followupRefreshes.delete(cacheKey);
    }
  }

  async function listDailyPerformanceFollowups(workDate) {
    const scope = await resolveRepresentativeScope();
    if (scope.mode === "none") return [];

    const select = `
      id, customer_id, contact_date, contact_method, representative_id,
      contact_result, quotation_number, no_sale_reason_id, next_followup_date,
      is_completed, notes, created_at, updated_at,
      customer:customers (id, customer_name, phone),
      representative:sales_representatives (id, full_name),
      no_sale_reason:no_sale_reasons (id, name)
    `;

    function applyScope(request) {
      if (scope.mode !== "selected") return request;
      return request.in("representative_id", scope.representativeIds);
    }

    if (scope.mode === "selected" && !scope.representativeIds.length) return [];

    const [dailyResult, overdueResult] = await Promise.all([
      applyScope(client().from("customer_followups").select(select).eq("contact_date", workDate)),
      applyScope(
        client().from("customer_followups").select(select)
          .lt("next_followup_date", workDate)
          .eq("is_completed", false)
      )
    ]);

    if (dailyResult.error) throw new Error(`تعذر تحميل متابعات اليوم: ${dailyResult.error.message}`);
    if (overdueResult.error) throw new Error(`تعذر تحميل المتابعات المتأخرة: ${overdueResult.error.message}`);

    const byId = new Map();
    [...(dailyResult.data || []), ...(overdueResult.data || [])].forEach(row => byId.set(row.id, row));
    return [...byId.values()].map(normalizeFollowup);
  }

  async function listFollowups(options = {}) {
    const scope = await resolveRepresentativeScope();
    const scopeUserId = window.CustomerAuth?.getState?.().profile?.id;
    if (scopeUserId) window.KYUMOfflineSessionStore?.saveScope?.(scopeUserId, "followups", scope);
    if (scope.mode === "none") return [];

    const namespace = await currentFollowupNamespace();
    const cacheKey = followupScopeCacheKey(scope);
    const force = Boolean(options.force);
    let cached = null;

    if (!force && window.KYUMSmartCache) {
      cached = await window.KYUMSmartCache.get(cacheKey, {
        namespace,
        allowStale: true,
        allowStaleAnyAge: true,
        staleMaxMs: FOLLOWUPS_CACHE_STALE_MAX_MS
      });
    }

    if (cached?.hit && Array.isArray(cached.data)) {
      lastReadStatus = { source: "cache", stale: Boolean(cached.stale), metadata: cached.metadata || null };
      if (window.customerSupabase) {
        refreshFollowupsInBackground(scope, namespace, cacheKey, cached.data).catch(error => {
          console.warn("Follow-up cache background refresh skipped:", error);
        });
      }
      return visibleFollowupRows(cached.data, namespace);
    }

    try {
      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "followups",
            namespace,
            scopeKey: cacheKey,
            cachedRows: cached?.data,
            fetchFull: () => fetchFollowupsFromNetwork(scope),
            fetchDelta: since => fetchFollowupDelta(scope, since),
            sortRows: sortFollowups,
            forceFull: true
          })
        : { rows: await fetchFollowupsFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistFollowups(cacheKey, rows, namespace);
      window.KYUMSyncRetention?.ack?.({ entity: "followups", scopeKey: cacheKey, state: result.state }).catch(error => {
        console.warn("Followups sync watermark ack skipped:", error);
      });
      const visible = await visibleFollowupRows(rows, namespace);
      lastReadStatus = { source: "network", stale: false, metadata: { updatedAt: Date.now(), recordCount: visible.length } };
      return visible;
    } catch (error) {
      if (cached?.data && Array.isArray(cached.data)) return visibleFollowupRows(cached.data, namespace);
      throw error;
    }
  }

  async function updateCustomerSnapshot(record) {
  }

  async function recalculateLastContact(customerId) {
  }

  async function saveFollowupOnline(record) {
    requirePermission("followups", record?.id ? "edit" : "add");
    const { data: userData, error: userError } = await client().auth.getUser();
    if (userError) {
      throw new Error(`تعذر تحديد المستخدم الحالي: ${userError.message}`);
    }

    const payload = {
      customer_id: record.customerId,
      contact_date: record.contactDate,
      contact_method: record.method,
      representative_id: record.representativeId || null,
      contact_result: record.result,
      quotation_number: record.quotationNumber?.trim() || null,
      no_sale_reason_id: record.noSaleReasonId || null,
      next_followup_date: record.nextFollowupDate || null,
      is_completed: Boolean(record.completed),
      notes: record.notes?.trim() || null
    };

    let saved;
    if (record.id) {
      saved = await unwrap(
        client()
          .from("customer_followups")
          .update(payload)
          .eq("id", record.id)
          .select("id")
          .single(),
        "تعذر تعديل المتابعة"
      );
    } else {
      saved = await unwrap(
        client()
          .from("customer_followups")
          .insert({
            ...payload,
            created_by: userData.user?.id || null
          })
          .select("id")
          .single(),
        "تعذر إضافة المتابعة"
      );
    }

    await updateCustomerSnapshot(record);
    await audit(record.id ? "update" : "insert", saved.id, {
      customer_id: record.customerId,
      contact_date: record.contactDate,
      contact_method: record.method,
      contact_result: record.result,
      next_followup_date: record.nextFollowupDate || null,
      is_completed: Boolean(record.completed)
    });

    await invalidateFollowupCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("followups", { action: record.id ? "update" : "create", contactDate: record.contactDate, source: "followups-service" });
    return saved.id;
  }

  async function assertFollowupNotConflicted(record, baseUpdatedAt) {
    if (!record?.id || !baseUpdatedAt) return;
    const { data, error } = await client()
      .from("customer_followups")
      .select("id, updated_at")
      .eq("id", record.id)
      .maybeSingle();
    if (error) throw new Error(`تعذر التحقق من تعارض المتابعة: ${error.message}`);
    const serverTime = Date.parse(data?.updated_at || "") || 0;
    const baseTime = Date.parse(baseUpdatedAt || "") || 0;
    if (serverTime && baseTime && serverTime > baseTime + 1000) {
      throw new window.KYUMOfflineQueue.ConflictError("تم تعديل المتابعة على الخادم بعد آخر مزامنة.", {
        entityId: record.id, serverUpdatedAt: data.updated_at, baseUpdatedAt
      });
    }
  }

  async function queueFollowup(record) {
    const action = record?.id ? "update" : "create";
    const dependencies = [];
    if (String(record?.customerId || "").startsWith("local:")) {
      const parent = await window.KYUMOfflineQueue.findCreateOperationByLocalId(record.customerId);
      if (!parent) throw new Error("تعذر ربط المتابعة بالعميل المحلي المعلق.");
      dependencies.push(parent.id);
    }
    const queued = await window.KYUMOfflineQueue.enqueue({
      entity: "followups", action, payload: record, dependsOn: dependencies,
      baseUpdatedAt: record?.updatedAt || record?.updated_at || ""
    });
    await window.KYUMCacheDependencyEngine?.invalidate?.("followups", { action, contactDate: record?.contactDate, source: "followups-service-queue" });
    return queued.localEntityId;
  }

  async function saveFollowup(record, context = {}) {
    requirePermission("followups", record?.id ? "edit" : "add");
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      return queueFollowup(record);
    }
    try {
      return await saveFollowupOnline(record);
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        return queueFollowup(record);
      }
      throw error;
    }
  }

  function followupDeleteOperationKey(record) {
    return `crm-delete:followups:${record.id}:${record.updatedAt || record.updated_at || "unknown"}`;
  }

  async function deleteFollowupSafeOnline(record, operationKey, baseUpdatedAt) {
    const result = await unwrap(client().rpc("delete_crm_entity_safe", {
      p_entity: "followups", p_entity_id: record.id, p_base_updated_at: baseUpdatedAt || null, p_operation_key: operationKey
    }), "تعذر حذف المتابعة");
    if (result?.conflict) throw new window.KYUMOfflineQueue.ConflictError(result.message || "تم تعديل المتابعة بعد آخر مزامنة.", {
      entityId: record.id, baseUpdatedAt, serverUpdatedAt: result.serverUpdatedAt || result.server_updated_at || null
    });
    if (!result?.ok) throw new Error(result?.message || "تعذر حذف المتابعة.");
    if (result.applied) await audit("delete", record.id, { customer_id: record.customerId, contact_date: record.contactDate });
    await invalidateFollowupCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("followups", { action: "delete", contactDate: record.contactDate, source: "followups-service" });
    return result;
  }

  async function deleteFollowupLegacyOnline(record) {
    await unwrap(client().from("customer_followups").delete().eq("id", record.id), "تعذر حذف المتابعة");
    await recalculateLastContact(record.customerId);
    await audit("delete", record.id, { customer_id: record.customerId, contact_date: record.contactDate });
    await invalidateFollowupCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("followups", { action: "delete", contactDate: record.contactDate, source: "followups-service-legacy-delete" });
  }

  async function queueFollowupDelete(record, operationKey) {
    if (String(record?.id || "").startsWith("local:")) throw new Error("لا يمكن حذف متابعة لم تتم مزامنتها بعد. انتظر اكتمال المزامنة أولًا.");
    const baseUpdatedAt = record?.updatedAt || record?.updated_at || "";
    if (!baseUpdatedAt) throw new Error("تعذر حذف المتابعة Offline لأن نسخة السجل المحلية لا تحتوي وقت آخر تحديث.");
    const queued = await window.KYUMOfflineQueue.enqueue({ entity: "followups", action: "delete", payload: record,
      localEntityId: record.id, baseUpdatedAt, idempotencyKey: operationKey });
    await window.KYUMCacheDependencyEngine?.invalidate?.("followups", { action: "delete", contactDate: record.contactDate, source: "followups-service-queue" });
    return { queued: true, operationId: queued.operationId };
  }

  async function deleteFollowup(record, context = {}) {
    requirePermission("followups", "delete");
    if (!record?.id) throw new Error("بيانات المتابعة غير مكتملة للحذف.");
    const operationKey = context.operationKey || followupDeleteOperationKey(record);
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) return queueFollowupDelete(record, operationKey);
    try {
      await deleteFollowupSafeOnline(record, operationKey, record.updatedAt || record.updated_at || "");
      return { queued: false };
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) return queueFollowupDelete(record, operationKey);
      throw error;
    }
  }

  async function audit(action, entityId, newData) {
    try {
      const { data } = await client().auth.getUser();
      await client().from("audit_logs").insert({
        user_id: data.user?.id || null,
        action,
        entity_type: "customer_followups",
        entity_id: String(entityId || ""),
        new_data: newData,
        metadata: {
          source: "kyum-crm-web",
          phase: "09"
        }
      });
    } catch (error) {
      console.warn("Follow-up audit log skipped:", error);
    }
  }

  window.KYUMSyncEngine?.register?.("followups", () => listFollowups());
  window.KYUMOfflineQueue?.register?.("followups", async (operation, helpers) => {
    const record = { ...operation.payload };
    if (operation.action === "delete") {
      if (!operation.baseUpdatedAt) {
        await deleteFollowupLegacyOnline(record);
        return { id: record.id };
      }
      await deleteFollowupSafeOnline(record, operation.idempotencyKey, operation.baseUpdatedAt);
      return { id: record.id };
    }
    if (String(record.customerId || "").startsWith("local:")) {
      const resolved = await helpers.resolveServerId(record.customerId, operation.namespace);
      if (!resolved) throw new Error("لم تتم مزامنة العميل المرتبط بالمتابعة بعد.");
      record.customerId = resolved;
    }
    if (operation.action === "update") await assertFollowupNotConflicted(record, operation.baseUpdatedAt);
    const id = await saveFollowupOnline(record);
    return { id };
  });

  window.FollowupsService = Object.freeze({
    listFollowups,
    listDailyPerformanceFollowups,
    getLastReadStatus: () => lastReadStatus,
    saveFollowup,
    deleteFollowup,
    invalidateFollowupCache
  });
})();
