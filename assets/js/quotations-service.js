// KYUM Phase 10 — Quotations Supabase Service
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

  const QUOTATIONS_CACHE_TTL_MS = 10 * 60 * 1000;
  const QUOTATIONS_CACHE_STALE_MAX_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  const QUOTATIONS_CACHE_SCHEMA_VERSION = 4;
  const quotationRefreshes = new Map();
  let lastReadStatus = null;

  async function currentQuotationNamespace() {
    const localId = window.KYUMOfflineSessionStore?.currentUserId?.();
    if (localId) return `user:${localId}`;
    try {
      const result = await client().auth.getUser();
      return `user:${result?.data?.user?.id || "anonymous"}`;
    } catch (_) {
      return "user:anonymous";
    }
  }

  function quotationScopeCacheKey(scope) {
    const ids = Array.isArray(scope?.representativeIds)
      ? [...scope.representativeIds].filter(Boolean).sort()
      : [];
    return `quotations:v2:${scope?.mode || "none"}:${ids.join(",") || "all"}`;
  }

  function isQuotationTombstone(row) { return Boolean(row?.__deleted); }

  async function pendingQuotationDeleteState(namespace) {
    const quotationIds = new Set();
    const customerIds = new Set();
    if (!window.KYUMOfflineQueue?.list) return { quotationIds, customerIds };
    try {
      const rows = await window.KYUMOfflineQueue.list({ namespace, statuses: ["pending", "retry", "processing"] });
      for (const row of rows) {
        if (row.action !== "delete") continue;
        if (row.entity === "quotations") quotationIds.add(String(row.payload?.id || row.localEntityId || ""));
        if (row.entity === "customers") customerIds.add(String(row.payload?.id || row.localEntityId || ""));
      }
    } catch (_) {}
    return { quotationIds, customerIds };
  }

  async function visibleQuotationRows(rows, namespace) {
    const pending = await pendingQuotationDeleteState(namespace);
    return (rows || []).filter(row => !isQuotationTombstone(row)
      && !pending.quotationIds.has(String(row?.id || ""))
      && !pending.customerIds.has(String(row?.customerId || "")));
  }

  function normalizeQuotationTombstone(row) {
    return { id: row.entity_id, customerId: row.customer_id || "", representativeId: row.representative_id || "",
      __deleted: true, deletedAt: row.deleted_at || "", updatedAt: row.deleted_at || "", sourceUpdatedAt: row.source_updated_at || "" };
  }

  async function fetchQuotationTombstones(since) {
    if (!since) return [];
    const rows = await unwrap(client().rpc("list_crm_sync_tombstones", { p_entity: "quotations", p_since: since }), "تعذر تحميل سجل حذف العقود");
    return (rows || []).map(normalizeQuotationTombstone);
  }

  function emitQuotationCacheUpdate(data, source, cacheKey) {
    window.dispatchEvent(new CustomEvent("kyum-quotation-cache-updated", {
      detail: { data, source, cacheKey, updatedAt: Date.now() }
    }));
  }

  async function persistQuotations(cacheKey, rows, namespace) {
    if (!window.KYUMSmartCache) return null;
    return window.KYUMSmartCache.set(cacheKey, rows, {
      namespace,
      ttlMs: QUOTATIONS_CACHE_TTL_MS,
      staleMaxMs: QUOTATIONS_CACHE_STALE_MAX_MS,
      source: "supabase",
      schemaVersion: QUOTATIONS_CACHE_SCHEMA_VERSION
    });
  }

  async function invalidateQuotationCache() {
    if (!window.KYUMSmartCache) return;
    const namespace = await currentQuotationNamespace();
    await window.KYUMSmartCache.removePrefix("quotations:", { namespace });
  }

  async function unwrap(request, fallbackMessage) {
    const { data, error } = await request;

    if (error) {
      if (error.code === "23505") {
        throw new Error("رقم العقد مسجل بالفعل ولا يمكن تكراره.");
      }

      if (error.code === "23503") {
        throw new Error("تعذر الحفظ بسبب ارتباط العميل أو المندوب أو سبب الرفض.");
      }

      throw new Error(`${fallbackMessage}: ${error.message}`);
    }

    return data;
  }


  function canonicalQuotationStatus(status) {
    const value = String(status || "").trim();
    if (["مقبول", "مرفوض", "قيد التنفيذ"].includes(value)) return value;
    if (["تحت التجهيز", "تم الإرسال", "تحت المراجعة"].includes(value)) return "قيد التنفيذ";
    if (value === "ملغي") return "مرفوض";
    return "قيد التنفيذ";
  }

  function normalizeQuotation(row) {
    return {
      id: row.id,
      code: row.quotation_number || "",
      customerOrderNumber: row.customer_order_number || "",
      installationRequestId: row.installation_request_id || row.installation_requests?.[0]?.id || "",
      installationConvertedAt: row.installation_converted_at || row.installation_requests?.[0]?.created_at || "",
      salesInvoiceId: row.sales_invoices?.[0]?.id || "",
      customerId: row.customer_id,
      customerName: row.customer?.customer_name || "",
      customerPhone: row.customer?.phone || "",
      representative: row.representative?.full_name || "",
      representativeId: row.representative_id || row.representative?.id || null,
      quotationDate: row.quotation_date || "",
      amount: Number(row.amount || 0),
      status: canonicalQuotationStatus(row.status),
      expiryDate: row.expiry_date || "",
      rejectionReason: row.rejection_reason?.name || "",
      rejectionReasonId: row.rejection_reason_id || row.rejection_reason?.id || null,
      description: row.description || "",
      notes: row.notes || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  async function resolveRepresentativeScope() {
    // Canonical resolver keeps the cached scope retained when the network is unavailable.
    if (!window.KYUMDataAccessScope?.resolve) return { mode: "none", representativeIds: [] };
    return window.KYUMDataAccessScope.resolve({ domain: "quotations" });
  }

  async function fetchQuotationsFromNetwork(scope, options = {}) {
    if (scope.mode === "none") return [];

    let request = client()
      .from("quotations")
      .select(`
          id,
          quotation_number,
          customer_order_number,
          installation_request_id,
          installation_converted_at,
          customer_id,
          representative_id,
          quotation_date,
          amount,
          status,
          expiry_date,
          rejection_reason_id,
          description,
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
          rejection_reason:no_sale_reasons (
            id,
            name
          ),
          installation_requests:installation_requests!installation_requests_quotation_id_fkey (
            id,
            created_at
          ),
          sales_invoices:sales_invoices!sales_invoices_quotation_id_fkey (
            id
          )
        `)
      .order("quotation_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (options.updatedSince) request = request.gte("updated_at", options.updatedSince);
    if (scope.mode === "selected") {
      if (!scope.representativeIds.length) return [];
      request = request.in("representative_id", scope.representativeIds);
    }

    const rows = await unwrap(request, "تعذر تحميل عقود العملاء");
    return (rows || []).map(normalizeQuotation);
  }

  async function fetchQuotationDelta(scope, since) {
    const [changedRows, tombstones] = await Promise.all([
      fetchQuotationsFromNetwork(scope, { updatedSince: since }),
      fetchQuotationTombstones(since)
    ]);
    return [...changedRows, ...tombstones];
  }

  function sortQuotations(rows) {
    const active = (rows || []).filter(row => !isQuotationTombstone(row)).sort((a, b) => {
      const dateDiff = String(b?.quotationDate || "").localeCompare(String(a?.quotationDate || ""));
      if (dateDiff) return dateDiff;
      return (Date.parse(b?.createdAt || "") || 0) - (Date.parse(a?.createdAt || "") || 0);
    });
    const deleted = (rows || []).filter(isQuotationTombstone).sort((a,b) => (Date.parse(b?.updatedAt||"")||0)-(Date.parse(a?.updatedAt||"")||0));
    return [...active, ...deleted];
  }

  async function refreshQuotationsInBackground(scope, namespace, cacheKey, previousRows) {
    if (quotationRefreshes.has(cacheKey)) return quotationRefreshes.get(cacheKey);

    const refresh = (async () => {
      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "quotations",
            namespace,
            scopeKey: cacheKey,
            cachedRows: previousRows,
            fetchFull: () => fetchQuotationsFromNetwork(scope),
            fetchDelta: since => fetchQuotationDelta(scope, since),
            sortRows: sortQuotations
          })
        : { rows: await fetchQuotationsFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistQuotations(cacheKey, rows, namespace);
      const previousHash = window.KYUMSmartCache?.hashValue?.(previousRows);
      const nextHash = window.KYUMSmartCache?.hashValue?.(rows);
      if (previousHash !== nextHash) {
        emitQuotationCacheUpdate(await visibleQuotationRows(rows, namespace), `network-${result.mode}`, cacheKey);
      }
      return visibleQuotationRows(rows, namespace);
    })();

    quotationRefreshes.set(cacheKey, refresh);
    try {
      return await refresh;
    } finally {
      quotationRefreshes.delete(cacheKey);
    }
  }

  async function listDailyPerformanceQuotations(workDate) {
    const scope = await resolveRepresentativeScope();
    if (scope.mode === "none") return [];
    if (scope.mode === "selected" && !scope.representativeIds.length) return [];

    let request = client()
      .from("quotations")
      .select(`
        id, quotation_number, customer_order_number, installation_request_id, installation_converted_at, customer_id, representative_id, quotation_date,
        amount, status, expiry_date, rejection_reason_id, description, notes,
        created_at, updated_at,
        customer:customers (id, customer_name, phone),
        representative:sales_representatives (id, full_name),
        rejection_reason:no_sale_reasons (id, name),
        installation_requests:installation_requests!installation_requests_quotation_id_fkey (id, created_at)
      `)
      .eq("quotation_date", workDate)
      .order("quotation_date", { ascending: false });

    if (scope.mode === "selected") {
      request = request.in("representative_id", scope.representativeIds);
    }

    const rows = await unwrap(request, "تعذر تحميل عروض تقرير الأداء");
    return (rows || []).map(normalizeQuotation);
  }

  async function listQuotations(options = {}) {
    const scope = await resolveRepresentativeScope();
    const scopeUserId = window.CustomerAuth?.getState?.().profile?.id;
    if (scopeUserId) window.KYUMOfflineSessionStore?.saveScope?.(scopeUserId, "quotations", scope);
    if (scope.mode === "none") return [];

    const namespace = await currentQuotationNamespace();
    const cacheKey = quotationScopeCacheKey(scope);
    const force = Boolean(options.force);
    let cached = null;

    if (!force && window.KYUMSmartCache) {
      cached = await window.KYUMSmartCache.get(cacheKey, {
        namespace,
        allowStale: true,
        allowStaleAnyAge: true,
        staleMaxMs: QUOTATIONS_CACHE_STALE_MAX_MS
      });
    }

    if (cached?.hit && Array.isArray(cached.data)) {
      lastReadStatus = { source: "cache", stale: Boolean(cached.stale), metadata: cached.metadata || null };
      if (window.customerSupabase) {
        refreshQuotationsInBackground(scope, namespace, cacheKey, cached.data).catch(error => {
          console.warn("Quotation cache background refresh skipped:", error);
        });
      }
      return (await visibleQuotationRows(cached.data, namespace)).map(row => ({ ...row, status: canonicalQuotationStatus(row?.status) }));
    }

    try {
      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "quotations",
            namespace,
            scopeKey: cacheKey,
            cachedRows: cached?.data,
            fetchFull: () => fetchQuotationsFromNetwork(scope),
            fetchDelta: since => fetchQuotationDelta(scope, since),
            sortRows: sortQuotations,
            forceFull: true
          })
        : { rows: await fetchQuotationsFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistQuotations(cacheKey, rows, namespace);
      const visible = await visibleQuotationRows(rows, namespace);
      lastReadStatus = { source: "network", stale: false, metadata: { updatedAt: Date.now(), recordCount: visible.length } };
      return visible;
    } catch (error) {
      if (cached?.data && Array.isArray(cached.data)) return visibleQuotationRows(cached.data, namespace);
      throw error;
    }
  }

  async function findByNumber(quotationNumber, excludeId = null) {
    let query = client()
      .from("quotations")
      .select("id, quotation_number")
      .ilike("quotation_number", quotationNumber.trim())
      .limit(1);

    if (excludeId) query = query.neq("id", excludeId);

    const rows = await unwrap(query, "تعذر التحقق من رقم العقد");
    return rows?.[0] || null;
  }

  async function updateCustomerSnapshot(record) {
  }

  async function recalculateCustomerSnapshot(customerId) {
  }

  async function saveQuotationOnline(record) {
    requirePermission("quotations", record?.id ? "edit" : "add");
    const { data: userData, error: userError } = await client().auth.getUser();

    if (userError) {
      throw new Error(`تعذر تحديد المستخدم الحالي: ${userError.message}`);
    }

    const payload = {
      quotation_number: record.code.trim(),
      customer_order_number: record.customerOrderNumber?.trim() || null,
      customer_id: record.customerId,
      representative_id: record.representativeId || null,
      quotation_date: record.quotationDate,
      amount: Number(record.amount || 0),
      status: canonicalQuotationStatus(record.status),
      expiry_date: record.expiryDate || null,
      rejection_reason_id:
        record.status === "مرفوض" ? (record.rejectionReasonId || null) : null,
      description: record.description?.trim() || null,
      notes: record.notes?.trim() || null
    };

    let saved;

    if (record.id) {
      saved = await unwrap(
        client()
          .from("quotations")
          .update(payload)
          .eq("id", record.id)
          .select("id")
          .single(),
        "تعذر تعديل العقد"
      );
    } else {
      saved = await unwrap(
        client()
          .from("quotations")
          .insert({
            ...payload,
            created_by: userData.user?.id || null
          })
          .select("id")
          .single(),
        "تعذر إضافة العقد"
      );
    }

    await updateCustomerSnapshot(record);

    await audit(record.id ? "update" : "insert", saved.id, {
      quotation_number: payload.quotation_number,
      customer_order_number: payload.customer_order_number,
      customer_id: payload.customer_id,
      representative_id: payload.representative_id,
      quotation_date: payload.quotation_date,
      amount: payload.amount,
      status: payload.status,
      expiry_date: payload.expiry_date,
      rejection_reason_id: payload.rejection_reason_id
    });

    await invalidateQuotationCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("quotations", { action: record.id ? "update" : "create", quotationDate: record.quotationDate, source: "quotations-service" });
    return saved.id;
  }

  async function assertQuotationNotConflicted(record, baseUpdatedAt) {
    if (!record?.id || !baseUpdatedAt) return;
    const { data, error } = await client()
      .from("quotations")
      .select("id, updated_at")
      .eq("id", record.id)
      .maybeSingle();
    if (error) throw new Error(`تعذر التحقق من تعارض العقد: ${error.message}`);
    const serverTime = Date.parse(data?.updated_at || "") || 0;
    const baseTime = Date.parse(baseUpdatedAt || "") || 0;
    if (serverTime && baseTime && serverTime > baseTime + 1000) {
      throw new window.KYUMOfflineQueue.ConflictError("تم تعديل العقد على الخادم بعد آخر مزامنة.", {
        entityId: record.id, serverUpdatedAt: data.updated_at, baseUpdatedAt
      });
    }
  }

  async function queueQuotation(record) {
    const action = record?.id ? "update" : "create";
    const dependencies = [];
    if (String(record?.customerId || "").startsWith("local:")) {
      const parent = await window.KYUMOfflineQueue.findCreateOperationByLocalId(record.customerId);
      if (!parent) throw new Error("تعذر ربط العقد بالعميل المحلي المعلق.");
      dependencies.push(parent.id);
    }
    const queued = await window.KYUMOfflineQueue.enqueue({
      entity: "quotations", action, payload: record, dependsOn: dependencies,
      baseUpdatedAt: record?.updatedAt || record?.updated_at || ""
    });
    await window.KYUMCacheDependencyEngine?.invalidate?.("quotations", { action, quotationDate: record?.quotationDate, source: "quotations-service-queue" });
    return queued.localEntityId;
  }

  async function saveQuotation(record, context = {}) {
    requirePermission("quotations", record?.id ? "edit" : "add");
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      return queueQuotation(record);
    }
    try {
      return await saveQuotationOnline(record);
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        return queueQuotation(record);
      }
      throw error;
    }
  }

  function quotationDeleteOperationKey(record) {
    return `crm-delete:quotations:${record.id}:${record.updatedAt || record.updated_at || "unknown"}`;
  }

  async function deleteQuotationSafeOnline(record, operationKey, baseUpdatedAt) {
    const result = await unwrap(client().rpc("delete_crm_entity_safe", {
      p_entity: "quotations", p_entity_id: record.id, p_base_updated_at: baseUpdatedAt || null, p_operation_key: operationKey
    }), "تعذر حذف العقد");
    if (result?.conflict) throw new window.KYUMOfflineQueue.ConflictError(result.message || "تم تعديل العقد بعد آخر مزامنة.", {
      entityId: record.id, baseUpdatedAt, serverUpdatedAt: result.serverUpdatedAt || result.server_updated_at || null
    });
    if (!result?.ok) throw new Error(result?.message || "تعذر حذف العقد.");
    if (result.applied) await audit("delete", record.id, { quotation_number: record.code, customer_id: record.customerId });
    await invalidateQuotationCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("quotations", { action: "delete", quotationDate: record.quotationDate, source: "quotations-service" });
    return result;
  }

  async function deleteQuotationLegacyOnline(record) {
    await unwrap(client().from("quotations").delete().eq("id", record.id), "تعذر حذف العقد");
    await recalculateCustomerSnapshot(record.customerId);
    await audit("delete", record.id, { quotation_number: record.code, customer_id: record.customerId });
    await invalidateQuotationCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("quotations", { action: "delete", quotationDate: record.quotationDate, source: "quotations-service-legacy-delete" });
  }

  async function queueQuotationDelete(record, operationKey) {
    if (String(record?.id || "").startsWith("local:")) throw new Error("لا يمكن حذف عقد لم تتم مزامنته بعد. انتظر اكتمال المزامنة أولًا.");
    const baseUpdatedAt = record?.updatedAt || record?.updated_at || "";
    if (!baseUpdatedAt) throw new Error("تعذر حذف العقد Offline لأن نسخة السجل المحلية لا تحتوي وقت آخر تحديث.");
    const queued = await window.KYUMOfflineQueue.enqueue({ entity: "quotations", action: "delete", payload: record,
      localEntityId: record.id, baseUpdatedAt, idempotencyKey: operationKey });
    await window.KYUMCacheDependencyEngine?.invalidate?.("quotations", { action: "delete", quotationDate: record.quotationDate, source: "quotations-service-queue" });
    return { queued: true, operationId: queued.operationId };
  }

  async function deleteQuotation(record, context = {}) {
    requirePermission("quotations", "delete");
    if (!record?.id) throw new Error("بيانات العقد غير مكتملة للحذف.");
    const operationKey = context.operationKey || quotationDeleteOperationKey(record);
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) return queueQuotationDelete(record, operationKey);
    try {
      await deleteQuotationSafeOnline(record, operationKey, record.updatedAt || record.updated_at || "");
      return { queued: false };
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) return queueQuotationDelete(record, operationKey);
      throw error;
    }
  }

  async function audit(action, entityId, newData) {
    try {
      const { data } = await client().auth.getUser();

      await client().from("audit_logs").insert({
        user_id: data.user?.id || null,
        action,
        entity_type: "quotations",
        entity_id: String(entityId || ""),
        new_data: newData,
        metadata: {
          source: "petatoe-web",
          phase: "10"
        }
      });
    } catch (error) {
      console.warn("Quotation audit log skipped:", error);
    }
  }

  window.KYUMSyncEngine?.register?.("quotations", () => listQuotations());
  window.KYUMOfflineQueue?.register?.("quotations", async (operation, helpers) => {
    const record = { ...operation.payload };
    if (operation.action === "delete") {
      if (!operation.baseUpdatedAt) {
        await deleteQuotationLegacyOnline(record);
        return { id: record.id };
      }
      await deleteQuotationSafeOnline(record, operation.idempotencyKey, operation.baseUpdatedAt);
      return { id: record.id };
    }
    if (String(record.customerId || "").startsWith("local:")) {
      const resolved = await helpers.resolveServerId(record.customerId, operation.namespace);
      if (!resolved) throw new Error("لم تتم مزامنة العميل المرتبط بالعقد بعد.");
      record.customerId = resolved;
    }
    if (operation.action === "update") await assertQuotationNotConflicted(record, operation.baseUpdatedAt);
    const id = await saveQuotationOnline(record);
    return { id };
  });

  window.QuotationsService = Object.freeze({
    listQuotations,
    listDailyPerformanceQuotations,
    getLastReadStatus: () => lastReadStatus,
    findByNumber,
    saveQuotation,
    deleteQuotation,
    invalidateQuotationCache,
    invalidateCache: invalidateQuotationCache
  });
})();
