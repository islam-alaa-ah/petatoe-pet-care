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
    const interestLinks = Array.isArray(row.customer_interests)
      ? row.customer_interests
      : [];

    return {
      id: row.id,
      customerNumber: row.customer_number || "",
      name: row.customer_name || "",
      type: row.customer_type || "",
      contactPersonName: row.contact_person_name || "",
      phone: row.phone || "",
      region: row.region || "",
      city: row.city || "",
      district: row.district || "",
      interests: interestLinks
        .map(link => link.interest?.name)
        .filter(Boolean),
      interestIds: interestLinks
        .map(link => link.interest_category_id || link.interest?.id)
        .filter(Boolean),
      representative: row.representative?.full_name || "",
      representativeId: row.representative_id || row.representative?.id || null,
      contactDate: row.last_contact_date || "",
      quotationNumber: row.quotation_number || "",
      noSaleReason: row.no_sale_reason?.name || "",
      noSaleReasonId: row.no_sale_reason_id || row.no_sale_reason?.id || null,
      notes: row.notes || "",
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
  const CUSTOMER_CACHE_SCHEMA_VERSION = 1;
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

  function scopeCacheKey(scope) {
    const ids = Array.isArray(scope?.representativeIds)
      ? [...scope.representativeIds].filter(Boolean).sort()
      : [];
    return `customers:${scope?.mode || "none"}:${ids.join(",") || "all"}`;
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

  async function invalidateCustomerCache() {
    if (!window.KYUMSmartCache) return;
    const namespace = await currentCustomerNamespace();
    await window.KYUMSmartCache.removePrefix("customers:", { namespace });
  }

  function customersSelectQuery() {
    return `
      id,
      customer_number,
      customer_name,
      customer_type,
      contact_person_name,
      phone,
      region,
      city,
      district,
      representative_id,
      last_contact_date,
      quotation_number,
      no_sale_reason_id,
      notes,
      created_at,
      updated_at,
      representative:sales_representatives (
        id,
        representative_code,
        full_name
      ),
      no_sale_reason:no_sale_reasons (
        id,
        name
      ),
      customer_interests (
        interest_category_id,
        interest:interest_categories (
          id,
          name
        )
      )
    `;
  }

  async function resolveCustomerRepresentativeScope() {
    // Canonical resolver keeps the cached scope retained when the network is unavailable.
    if (!window.KYUMDataAccessScope?.resolve) return { mode: "none", representativeIds: [] };
    return window.KYUMDataAccessScope.resolve({ domain: "customers" });
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
      if (scope.mode === "selected") {
        if (!scope.representativeIds.length) return [];
        request = request.in("representative_id", scope.representativeIds);
      }

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
      const result = window.KYUMSyncEngine
        ? await window.KYUMSyncEngine.sync({
            entity: "customers",
            namespace,
            scopeKey: cacheKey,
            cachedRows: previousRows,
            fetchFull: () => fetchCustomersFromNetwork(scope),
            fetchDelta: since => fetchCustomersFromNetwork(scope, { updatedSince: since }),
            sortRows: sortCustomers
          })
        : { rows: await fetchCustomersFromNetwork(scope), mode: "full" };
      const rows = result.rows;
      await persistCustomers(cacheKey, rows, namespace);
      const previousHash = window.KYUMSmartCache?.hashValue?.(previousRows);
      const nextHash = window.KYUMSmartCache?.hashValue?.(rows);
      if (previousHash !== nextHash) {
        emitCustomerCacheUpdate(rows, `network-${result.mode}`, cacheKey);
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

    if (scope.mode === "selected") {
      if (!scope.representativeIds.length) return [];
      request = request.in("representative_id", scope.representativeIds);
    }

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
      customer_type: row.can_access ? (row.customer_type || "") : "",
      contact_person_name: row.can_access ? (row.contact_person_name || "") : "",
      phone: normalizedPhone,
      representative_id: row.can_access ? (row.representative_id || null) : null,
      representative: row.representative_name
        ? { full_name: row.representative_name }
        : null,
      can_access: Boolean(row.can_access),
      outside_scope: !row.can_access
    };
  }

  async function replaceInterests(customerId, interestIds) {
    await unwrap(
      client()
        .from("customer_interests")
        .delete()
        .eq("customer_id", customerId),
      "تعذر تحديث مجالات الاهتمام"
    );

    if (!interestIds.length) return;

    const rows = interestIds.map(interestId => ({
      customer_id: customerId,
      interest_category_id: interestId
    }));

    await unwrap(
      client().from("customer_interests").insert(rows),
      "تعذر حفظ مجالات الاهتمام"
    );
  }

  async function validateCustomerGeography(record = {}) {
    const values = [record.region, record.city, record.district].map(value => String(value || "").trim());
    if (!values.some(Boolean)) return { region: "", city: "", district: "" };
    if (!window.KYUMGeography) throw new Error("مكوّن العنوان الجغرافي غير متاح؛ أعد تحميل التطبيق قبل حفظ عنوان العميل.");
    await window.KYUMGeography.loadCatalog(false);
    const validation = window.KYUMGeography.validateCanonicalAddress({ region: values[0], city: values[1], district: values[2] }, {
      requireRegion: true, requireCity: true, requireDistrict: true
    });
    if (!validation.valid) throw new Error(validation.message);
    return validation.value;
  }

  async function saveCustomerOnline(record, context = {}) {
    requirePermission("customers", record?.id ? "edit" : "add");
    let userId = context.userId || null;
    if (!userId) {
      const { data: userData, error: userError } = await client().auth.getUser();
      if (userError) throw new Error(`تعذر تحديد المستخدم الحالي: ${userError.message}`);
      userId = userData.user?.id || null;
    }

    const canonicalGeo = await validateCustomerGeography(record);

    const payload = {
      customer_name: record.name.trim(),
      customer_type: record.type,
      contact_person_name: record.type === "شركة"
        ? (record.contactPersonName?.trim() || null)
        : null,
      phone: record.phone,
      region: canonicalGeo.region || null,
      city: canonicalGeo.city || null,
      district: canonicalGeo.district || null,
      representative_id: record.representativeId || null,
      last_contact_date: record.contactDate || null,
      quotation_number: record.quotationNumber?.trim() || null,
      no_sale_reason_id: record.noSaleReasonId || null,
      notes: record.notes?.trim() || null
    };

    let saved;
    if (record.id) {
      saved = await unwrap(
        client()
          .from("customers")
          .update(payload)
          .eq("id", record.id)
          .select("id")
          .single(),
        "تعذر تعديل العميل"
      );
    } else {
      saved = await unwrap(
        client()
          .from("customers")
          .insert({
            ...payload,
            created_by: userId
          })
          .select("id")
          .single(),
        "تعذر إضافة العميل"
      );
    }

    try {
      await replaceInterests(saved.id, record.interestIds);
    } catch (error) {
      if (!record.id) {
        await client().from("customers").delete().eq("id", saved.id);
      }
      throw error;
    }

    await audit(record.id ? "update" : "insert", saved.id, {
      customer_name: payload.customer_name,
      phone: payload.phone,
      customer_type: payload.customer_type,
      contact_person_name: payload.contact_person_name,
      representative_id: payload.representative_id,
      interest_ids: record.interestIds
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

  async function listExistingImportedRequestKeys(customerIds = []) {
    const ids = [...new Set((customerIds || []).filter(Boolean))];
    if (!ids.length) return new Set();

    const keys = new Set();
    const batchSize = 200;
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      const batch = ids.slice(offset, offset + batchSize);
      const pageSize = 1000;
      for (let pageStart = 0; ; pageStart += pageSize) {
        const rows = await unwrap(
          client()
            .from("customer_requests")
            .select("customer_id, request_number, quotation_number")
            .in("customer_id", batch)
            .range(pageStart, pageStart + pageSize - 1),
          "تعذر التحقق من البيانات المرفوعة مسبقًا"
        );
        (rows || []).forEach(row => {
          keys.add(importedRequestKey(row.customer_id, row.request_number, row.quotation_number));
        });
        if (!rows || rows.length < pageSize) break;
      }
    }
    return keys;
  }



  async function listImportedRequestIdentities() {
    const rows = [];
    const pageSize = 1000;
    for (let pageStart = 0; ; pageStart += pageSize) {
      const page = await unwrap(
        client()
          .from("customer_requests")
          .select("customer_id,request_number,quotation_number,source_row")
          .range(pageStart, pageStart + pageSize - 1),
        "تعذر تحميل بصمات بيانات الاستيراد السابقة"
      );
      rows.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }
    return rows;
  }

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

    const concurrency = Math.max(2, Math.min(Number(options.concurrency) || 10, 16));
    const results = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      requestsInserted: 0,
      requestsSkipped: 0,
      failed: 0,
      errors: []
    };

    const { data: userData, error: userError } = await client().auth.getUser();
    if (userError) throw new Error(`تعذر تحديد المستخدم الحالي: ${userError.message}`);
    const userId = userData.user?.id || null;

    const customerIdByKey = new Map();
    const groupedRows = new Map();

    rows.forEach(row => {
      const key = row.phone || `no-phone:${row.sourceRow}`;
      if (!groupedRows.has(key)) groupedRows.set(key, []);
      groupedRows.get(key).push(row);
      if (row.existingCustomer?.id) customerIdByKey.set(key, row.existingCustomer.id);
    });

    const customerGroups = [...groupedRows.entries()];
    let processedRows = 0;

    await runConcurrent(customerGroups, concurrency, async ([key, groupRows]) => {
      const row = groupRows[0];
      try {
        let customerId = customerIdByKey.get(key) || null;

        // Re-check the phone against Supabase immediately before INSERT. The
        // preview can become stale, and another import/user may create the same
        // customer after preview generation. This guard prevents avoidable 409
        // conflicts and never re-inserts a customer that already exists.
        if (!customerId && row.phone) {
          const serverExisting = await findByPhone(row.phone);
          if (serverExisting) {
            if (serverExisting.id) {
              customerId = serverExisting.id;
              customerIdByKey.set(key, customerId);
            } else {
              // The phone exists outside the current user's permitted scope.
              // Do not expose or update it and do not attempt a conflicting INSERT.
              results.skipped += groupRows.length;
              groupedRows.delete(key);
              return;
            }
          }
        }

        if (!customerId) {
          try {
            customerId = await saveCustomer({
              id: null,
              name: row.name,
              type: row.type,
              contactPersonName: row.contactPersonName,
              phone: row.phone,
              region: row.region,
              city: row.city,
              district: row.district,
              representativeId: row.representativeId,
              contactDate: row.contactDate,
              quotationNumber: row.quotationNumber,
              noSaleReasonId: row.noSaleReasonId,
              notes: row.notes,
              interestIds: row.interestIds
            }, { userId });
            customerIdByKey.set(key, customerId);
            results.inserted += 1;
          } catch (insertError) {
            // A unique conflict can still happen in the small race window
            // between the pre-check and INSERT. Resolve the existing record and
            // continue safely instead of reporting a false failed import.
            const conflict = /مسجل بالفعل|duplicate|unique|409/i.test(
              insertError instanceof Error ? insertError.message : String(insertError)
            );
            if (!conflict || !row.phone) throw insertError;
            const serverExisting = await findByPhone(row.phone);
            if (serverExisting?.id) {
              customerId = serverExisting.id;
              customerIdByKey.set(key, customerId);
            } else {
              results.skipped += groupRows.length;
              groupedRows.delete(key);
              return;
            }
          }
        } else if (row.existingCustomer && mode === "upsert") {
          await saveCustomer({
            id: customerId,
            name: row.name,
            type: row.type,
            contactPersonName: row.contactPersonName,
            phone: row.phone,
            region: row.region,
            city: row.city,
            district: row.district,
            representativeId: row.representativeId,
            contactDate: row.contactDate,
            quotationNumber: row.quotationNumber,
            noSaleReasonId: row.noSaleReasonId,
            notes: row.notes,
            interestIds: row.interestIds
          }, { userId });
          results.updated += 1;
        }
      } catch (error) {
        groupRows.forEach(groupRow => {
          results.failed += 1;
          results.errors.push({
            sourceRow: groupRow.sourceRow,
            name: groupRow.name,
            phone: groupRow.phone,
            requestNumber: groupRow.requestNumber || "",
            quotationNumber: groupRow.quotationNumber || "",
            message: error instanceof Error ? error.message : String(error)
          });
        });
        groupedRows.delete(key);
      }
    });

    onProgress?.(0, rows.length, null, results);

    await runConcurrent(rows, concurrency, async row => {
      const key = row.phone || `no-phone:${row.sourceRow}`;
      try {
        const customerId = customerIdByKey.get(key);
        if (!customerId) return;

        if (row.requestNumber || row.quotationNumber) {
          const requestResult = await saveImportedRequest(customerId, row, userId);
          if (requestResult.inserted) results.requestsInserted += 1;
          else results.requestsSkipped += 1;
        } else if (groupedRows.get(key)?.[0] !== row) {
          results.skipped += 1;
        }
      } catch (error) {
        results.failed += 1;
        results.errors.push({
          sourceRow: row.sourceRow,
          name: row.name,
          phone: row.phone,
          requestNumber: row.requestNumber || "",
          quotationNumber: row.quotationNumber || "",
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        processedRows += 1;
        onProgress?.(processedRows, rows.length, row, results);
      }
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