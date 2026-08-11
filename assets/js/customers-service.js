// KYUM Phase 08 — Customers Supabase Service
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

  function normalizeCustomer(row) {
    return {
      id: row.id,
      customerNumber: row.customer_number || "",
      code: row.customer_number || "",
      name: row.customer_name || "",
      address: row.address || "",
      phone: row.phone || "",
      googleMapsUrl: row.google_maps_url || "",
      neighborhoodId: row.neighborhood_id || "",
      mobile: row.phone || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  async function unwrap(request, fallbackMessage) {
    const { data, error } = await request;
    if (error) {
      if (error.code === "23505") {
        throw new Error("رقم الجوال مسجل بالفعل لعميل آخر.");
      }
      if (error.code === "23503") {
        throw new Error("تعذر الحفظ بسبب ارتباط مرجعي غير صالح.");
      }
      throw new Error(`${fallbackMessage}: ${error.message}`);
    }
    return data;
  }

  const CUSTOMER_PAGE_SIZE = 250;
  const CUSTOMER_CACHE_TTL_MS = 15 * 60 * 1000;
  const CUSTOMER_CACHE_STALE_MAX_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  const CUSTOMER_CACHE_SCHEMA_VERSION = 2;
  const customerRefreshes = new Map();
  let lastReadStatus = null;

  async function currentCustomerNamespace() {
    const localId = window.KYUMOfflineSessionStore?.currentUserId?.();
    if (localId) return `user:${localId}`;
    try {
      const result = await client().auth.getUser();
      return `user:${result?.data?.user?.id || "anonymous"}`;
    } catch (_) {
      return "user:anonymous";
    }
  }

  function scopeCacheKey() {
    return "customers:master-v2";
  }

  function emitCustomerCacheUpdate(data, source, cacheKey) {
    window.dispatchEvent(new CustomEvent("kyum-customer-cache-updated", {
      detail: { data, source, cacheKey, updatedAt: Date.now() }
    }));
  }

  async function persistCustomers(cacheKey, rows, namespace) {
    if (!window.KYUMSmartCache) return null;
    return window.KYUMSmartCache.set(cacheKey, rows, {
      namespace,
      ttlMs: CUSTOMER_CACHE_TTL_MS,
      staleMaxMs: CUSTOMER_CACHE_STALE_MAX_MS,
      source: "supabase",
      schemaVersion: CUSTOMER_CACHE_SCHEMA_VERSION
    });
  }

  async function invalidateCustomerCache(options = {}) {
    const namespace = options.namespace || await currentCustomerNamespace();
    if (window.KYUMSmartCache) {
      await window.KYUMSmartCache.removePrefix("customers:", { namespace });
    }
    if (options.clearSyncState && window.KYUMSyncEngine?.clearState) {
      window.KYUMSyncEngine.clearState(namespace, "customers", scopeCacheKey());
    }
  }

  function customersSelectQuery() {
    return `
      id,
      customer_number,
      customer_name,
      address,
      phone,
      google_maps_url,
      neighborhood_id,
      created_at,
      updated_at
    `;
  }

  async function resolveCustomerRepresentativeScope() {
    // cached scope retained compatibility marker. Resolve the canonical access state
    // for offline/session certification, but customer master itself is no longer representative-owned.
    if (window.KYUMDataAccessScope?.resolve) {
      try { await window.KYUMDataAccessScope.resolve({ domain: "customers" }); } catch (_) {}
    }
    return { mode: "all", representativeIds: [] };
  }

  async function fetchCustomerServerCount(scope) {
    if (scope.mode === "none") return 0;
    const { count, error } = await client()
      .from("customers")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(`تعذر التحقق من عدد العملاء: ${error.message}`);
    return Number.isFinite(Number(count)) ? Number(count) : null;
  }

  async function fetchCustomersFromNetwork(scope, options = {}) {
    if (scope.mode === "none") return [];

    const allRows = [];
    for (let pageStart = 0; ; pageStart += CUSTOMER_PAGE_SIZE) {
      let request = client()
        .from("customers")
        .select(customersSelectQuery())
        .order("created_at", { ascending: false })
        .range(pageStart, pageStart + CUSTOMER_PAGE_SIZE - 1);

      if (options.updatedSince) request = request.gte("updated_at", options.updatedSince);

      const page = await unwrap(request, "تعذر تحميل العملاء");
      allRows.push(...(page || []));
      if (!page || page.length < CUSTOMER_PAGE_SIZE) break;
    }

    return allRows.map(normalizeCustomer);
  }

  function sortCustomers(rows) {
    return [...(rows || [])].sort((a, b) => {
      const left = Date.parse(a?.createdAt || "") || 0;
      const right = Date.parse(b?.createdAt || "") || 0;
      return right - left;
    });
  }

  async function refreshCustomersInBackground(scope, namespace, cacheKey, previousRows) {
    if (customerRefreshes.has(cacheKey)) return customerRefreshes.get(cacheKey);

    const refresh = (async () => {
      let forceFull = false;
      try {
        const serverCount = await fetchCustomerServerCount(scope);
        if (serverCount != null && serverCount !== previousRows.length) {
          forceFull = true;
          window.KYUMSyncEngine?.clearState?.(namespace, "customers", cacheKey);
        }
      } catch (error) {
        console.warn("Customer cache count verification skipped:", error);
      }

      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "customers",
            namespace,
            scopeKey: cacheKey,
            cachedRows: previousRows,
            fetchFull: () => fetchCustomersFromNetwork(scope),
            fetchDelta: since => fetchCustomersFromNetwork(scope, { updatedSince: since }),
            sortRows: sortCustomers,
            forceFull
          })
        : { rows: await fetchCustomersFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistCustomers(cacheKey, rows, namespace);
      const previousHash = window.KYUMSmartCache?.hashValue?.(previousRows);
      const nextHash = window.KYUMSmartCache?.hashValue?.(rows);
      if (previousHash !== nextHash) {
        emitCustomerCacheUpdate(rows, forceFull ? "network-self-heal" : `network-${result.mode}`, cacheKey);
      }
      return rows;
    })();

    customerRefreshes.set(cacheKey, refresh);
    try {
      return await refresh;
    } finally {
      customerRefreshes.delete(cacheKey);
    }
  }


  async function getCustomerById(customerId) {
    if (!customerId) return null;
    const row = await unwrap(
      client()
        .from("customers")
        .select(customersSelectQuery())
        .eq("id", customerId)
        .maybeSingle(),
      "تعذر تحميل بيانات العميل"
    );
    return row ? normalizeCustomer(row) : null;
  }

  async function listCustomers(options = {}) {
    const scope = await resolveCustomerRepresentativeScope();
    const scopeUserId = window.CustomerAuth?.getState?.().profile?.id;
    if (scopeUserId) window.KYUMOfflineSessionStore?.saveScope?.(scopeUserId, "customers", scope);
    if (scope.mode === "none") return [];

    const namespace = await currentCustomerNamespace();
    const cacheKey = scopeCacheKey(scope);
    const force = Boolean(options.force);
    let cached = null;

    if (!force && window.KYUMSmartCache) {
      cached = await window.KYUMSmartCache.get(cacheKey, {
        namespace,
        allowStale: true,
        allowStaleAnyAge: true,
        staleMaxMs: CUSTOMER_CACHE_STALE_MAX_MS
      });
    }

    if (cached?.hit && Array.isArray(cached.data)) {
      lastReadStatus = { source: "cache", stale: Boolean(cached.stale), metadata: cached.metadata || null };
      if (window.customerSupabase) {
        refreshCustomersInBackground(scope, namespace, cacheKey, cached.data).catch(error => {
          console.warn("Customer cache background refresh skipped:", error);
        });
      }
      return cached.data;
    }

    try {
      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "customers",
            namespace,
            scopeKey: cacheKey,
            cachedRows: cached?.data,
            fetchFull: () => fetchCustomersFromNetwork(scope),
            fetchDelta: since => fetchCustomersFromNetwork(scope, { updatedSince: since }),
            sortRows: sortCustomers,
            forceFull: true
          })
        : { rows: await fetchCustomersFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistCustomers(cacheKey, rows, namespace);
      lastReadStatus = { source: "network", stale: false, metadata: { updatedAt: Date.now(), recordCount: rows.length } };
      return rows;
    } catch (error) {
      if (cached?.data && Array.isArray(cached.data)) return cached.data;
      throw error;
    }
  }

  function reportDayBounds(workDate) {
    const start = new Date(`${workDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function listDailyPerformanceCustomers(workDate) {
    const scope = await resolveCustomerRepresentativeScope();
    if (scope.mode === "none") return [];
    const bounds = reportDayBounds(workDate);
    let request = client()
      .from("customers")
      .select(customersSelectQuery())
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.end)
      .order("created_at", { ascending: false });


    const rows = await unwrap(request, "تعذر تحميل عملاء تقرير الأداء");
    return (rows || []).map(normalizeCustomer);
  }

  async function findByPhone(normalizedPhone, excludeId = null) {
    const rows = await unwrap(
      client().rpc("check_customer_phone_ownership", {
        p_normalized_phone: normalizedPhone,
        p_exclude_customer_id: excludeId || null
      }),
      "تعذر التحقق من رقم الجوال"
    );

    const row = rows?.[0];
    if (!row?.phone_exists) return null;

    return {
      id: row.can_access ? row.customer_id : null,
      customer_name: row.customer_name || "",
      phone: normalizedPhone,
      can_access: Boolean(row.can_access),
      outside_scope: !row.can_access
    };
  }

  async function replaceInterests() { return; }
  async function validateCustomerGeography() { return {}; }

  async function saveCustomerOnline(record, context = {}) {
    requirePermission("customers", record?.id ? "edit" : "add");
    let userId = context.userId || null;
    if (!userId) {
      const { data: userData, error: userError } = await client().auth.getUser();
      if (userError) throw new Error(`تعذر تحديد المستخدم الحالي: ${userError.message}`);
      userId = userData.user?.id || null;
    }

    const name = String(record.name || "").trim();
    const phone = String(record.phone || record.mobile || "").trim();
    const code = String(record.customerNumber || record.code || "").trim();
    const address = String(record.address || "").trim();
    const neighborhoodId = String(record.neighborhoodId || record.neighborhood_id || "").trim();
    const googleMapsUrl = String(record.googleMapsUrl || "").trim();
    if (!name) throw new Error("اسم العميل مطلوب.");
    if (!phone) throw new Error("رقم الجوال مطلوب.");
    if (!code) throw new Error("كود العميل مطلوب.");
    if (!neighborhoodId) throw new Error("اختر الحي من قائمة الأحياء.");

    const neighborhood = await unwrap(
      client().from("installation_neighborhoods").select("id,name,is_active").eq("id", neighborhoodId).eq("is_active", true).maybeSingle(),
      "تعذر التحقق من الحي المختار"
    );
    if (!neighborhood?.id) throw new Error("الحي المختار غير موجود أو غير نشط.");

    const payload = {
      customer_number: code,
      customer_name: name,
      address: String(neighborhood.name || address || "").trim() || null,
      neighborhood_id: neighborhood.id,
      google_maps_url: googleMapsUrl || null,
      phone
    };

    let saved;
    if (record.id) {
      saved = await unwrap(
        client().from("customers").update(payload).eq("id", record.id).select("id").single(),
        "تعذر تعديل العميل"
      );
    } else {
      saved = await unwrap(
        client().from("customers").insert({ ...payload, created_by: userId }).select("id").single(),
        "تعذر إضافة العميل"
      );
    }

    await audit(record.id ? "update" : "insert", saved.id, {
      customer_number: payload.customer_number,
      customer_name: payload.customer_name,
      address: payload.address,
      neighborhood_id: payload.neighborhood_id,
      phone: payload.phone
    }, userId);

    await invalidateCustomerCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("customers", { action: record.id ? "update" : "create", createdDate: record.createdAt || record.created_at, source: "customers-service" });
    return saved.id;
  }

  async function assertCustomerNotConflicted(record, baseUpdatedAt) {
    if (!record?.id || !baseUpdatedAt) return;
    const { data, error } = await client()
      .from("customers")
      .select("id, updated_at")
      .eq("id", record.id)
      .maybeSingle();
    if (error) throw new Error(`تعذر التحقق من تعارض العميل: ${error.message}`);
    const serverTime = Date.parse(data?.updated_at || "") || 0;
    const baseTime = Date.parse(baseUpdatedAt || "") || 0;
    if (serverTime && baseTime && serverTime > baseTime + 1000) {
      throw new window.KYUMOfflineQueue.ConflictError("تم تعديل العميل على الخادم بعد آخر مزامنة.", {
        entityId: record.id, serverUpdatedAt: data.updated_at, baseUpdatedAt
      });
    }
  }

  async function queueCustomer(record) {
    const action = record?.id ? "update" : "create";
    const queued = await window.KYUMOfflineQueue.enqueue({
      entity: "customers",
      action,
      payload: record,
      localEntityId: action === "create" ? undefined : record.id,
      baseUpdatedAt: record?.updatedAt || record?.updated_at || ""
    });
    await window.KYUMCacheDependencyEngine?.invalidate?.("customers", { action, createdDate: record?.createdAt || record?.created_at, source: "customers-service-queue" });
    return queued.localEntityId;
  }

  async function saveCustomer(record, context = {}) {
    requirePermission("customers", record?.id ? "edit" : "add");
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      return queueCustomer(record);
    }
    try {
      return await saveCustomerOnline(record, context);
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        return queueCustomer(record);
      }
      throw error;
    }
  }

  async function deleteCustomerOnline(customerId, customerName) {
    await unwrap(
      client().from("customers").delete().eq("id", customerId),
      "تعذر حذف العميل"
    );
    await audit("delete", customerId, { customer_name: customerName });
    await invalidateCustomerCache();
    await window.KYUMCacheDependencyEngine?.invalidate?.("customers", { action: "delete", source: "customers-service" });
  }

  async function deleteCustomer(customerId, customerName, context = {}) {
    requirePermission("customers", "delete");
    const queueDelete = () => window.KYUMOfflineQueue.enqueue({
      entity: "customers", action: "delete", payload: { id: customerId, name: customerName },
      localEntityId: customerId, idempotencyKey: `customers:delete:${customerId}`
    });
    if (!context.skipOfflineQueue && navigator.onLine === false && window.KYUMOfflineQueue) {
      await queueDelete();
      await invalidateCustomerCache();
      return { queued: true };
    }
    try {
      await deleteCustomerOnline(customerId, customerName);
      return { queued: false };
    } catch (error) {
      if (!context.skipOfflineQueue && window.KYUMOfflineQueue?.isRetryableError?.(error)) {
        await queueDelete();
        await invalidateCustomerCache();
        return { queued: true };
      }
      throw error;
    }
  }

  async function audit(action, entityId, newData, userId = null) {
    try {
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data } = await client().auth.getUser();
        resolvedUserId = data.user?.id || null;
      }
      await client().from("audit_logs").insert({
        user_id: resolvedUserId,
        action,
        entity_type: "customers",
        entity_id: String(entityId || ""),
        new_data: newData,
        metadata: {
          source: "petatoe-web",
          phase: "08"
        }
      });
    } catch (error) {
      console.warn("Customer audit log skipped:", error);
    }
  }


  function importedRequestKey(customerId, requestNumber, quotationNumber) {
    return `${String(customerId || "")}::${String(requestNumber || "").trim().toLowerCase() || "-"}::${String(quotationNumber || "").trim().toLowerCase() || "-"}`;
  }

  async function listExistingImportedRequestKeys() { return new Set(); }



  async function listImportedRequestIdentities() { return []; }

  async function saveImportedRequest(customerId, row, userId = null) {
    if (!row.requestNumber && !row.quotationNumber) return { inserted: false, skipped: true };

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: userData, error: userError } = await client().auth.getUser();
      if (userError) throw new Error(`تعذر تحديد المستخدم الحالي: ${userError.message}`);
      resolvedUserId = userData.user?.id || null;
    }

    const payload = {
      customer_id: customerId,
      request_number: row.requestNumber?.trim() || null,
      representative_id: row.representativeId || null,
      request_date: row.contactDate || new Date().toISOString().slice(0, 10),
      quotation_number: row.quotationNumber?.trim() || null,
      notes: row.notes?.trim() || null,
      source_row: row.sourceRow || null,
      created_by: resolvedUserId
    };

    const { error } = await client()
      .from("customer_requests")
      .insert(payload);

    if (error?.code === "23505") {
      return { inserted: false, skipped: true };
    }
    if (error) throw new Error(`تعذر حفظ طلب العميل: ${error.message}`);

    return { inserted: true, skipped: false };
  }

  async function runConcurrent(items, concurrency, worker) {
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);

    async function runWorker() {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    }

    await Promise.all(Array.from({ length: workerCount }, runWorker));
  }

  async function importCustomers(rows, mode = "new_only", onProgress = null, options = {}) {
    requirePermission("customers", "add");
    if (mode === "upsert") requirePermission("customers", "edit");

    const inputRows = Array.isArray(rows) ? rows : [];
    const batchSize = Math.min(200, Math.max(1, Number(options.batchSize || 200)));
    const totalBatches = Math.ceil(inputRows.length / batchSize);
    const results = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    for (let offset = 0, batchIndex = 0; offset < inputRows.length; offset += batchSize, batchIndex += 1) {
      const batch = inputRows.slice(offset, offset + batchSize);
      const payload = batch.map(row => ({
        sourceRow: Number(row.sourceRow || 0) || null,
        code: String(row.customerNumber || row.code || "").trim(),
        name: String(row.name || "").trim(),
        address: String(row.address || "").trim(),
        mobile: String(row.phone || row.mobile || "").trim(),
        existingCustomerId: row.existingCustomer?.id || null
      }));

      const { data, error } = await client().rpc("import_customers_batch", {
        p_rows: payload,
        p_mode: mode
      });

      if (error) {
        results.failed += batch.length;
        results.errors.push(...batch.map(row => ({
          sourceRow: row.sourceRow,
          customerNumber: row.customerNumber || row.code || "",
          name: row.name || "",
          address: row.address || "",
          phone: row.phone || row.mobile || "",
          message: `فشل دفعة ${batchIndex + 1}/${totalBatches}: ${error.message}`
        })));
      } else {
        results.inserted += Number(data?.inserted || 0);
        results.updated += Number(data?.updated || 0);
        results.skipped += Number(data?.skipped || 0);
        results.failed += Number(data?.failed || 0);
        if (Array.isArray(data?.errors)) results.errors.push(...data.errors);
      }

      const processed = Math.min(offset + batch.length, inputRows.length);
      onProgress?.(
        processed,
        inputRows.length,
        batch[batch.length - 1] || null,
        results,
        {
          batchIndex: batchIndex + 1,
          totalBatches,
          batchSize: batch.length
        }
      );
    }

    await invalidateCustomerCache({ clearSyncState: true });
    await window.KYUMCacheDependencyEngine?.invalidate?.("customers", {
      action: "import",
      source: "customers-service"
    });
    return results;
  }

  window.KYUMSyncEngine?.register?.("customers", () => listCustomers());
  window.KYUMOfflineQueue?.register?.("customers", async operation => {
    if (operation.action === "delete") {
      await deleteCustomerOnline(operation.payload.id, operation.payload.name || "");
      return { id: operation.payload.id };
    }
    const record = { ...operation.payload };
    if (operation.action === "update") {
      await assertCustomerNotConflicted(record, operation.baseUpdatedAt);
    }
    const id = await saveCustomerOnline(record, { skipOfflineQueue: true });
    return { id };
  });

  window.CustomersService = Object.freeze({
    listCustomers,
    getCustomerById,
    listDailyPerformanceCustomers,
    getLastReadStatus: () => lastReadStatus,
    findByPhone,
    saveCustomer,
    deleteCustomer,
    importCustomers,
    listExistingImportedRequestKeys,
    listImportedRequestIdentities,
    importedRequestKey,
    invalidateCustomerCache
  });
})();