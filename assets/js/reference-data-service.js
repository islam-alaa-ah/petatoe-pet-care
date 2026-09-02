// KYUM Phase 07 — Reference Data Supabase Service
(function () {
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const PERSISTENT_TTL_MS = 24 * 60 * 60 * 1000;
  const PERSISTENT_STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const cache = new Map();
  const inFlight = new Map();

  function client() {
    if (!window.customerSupabase) {
      throw new Error("اتصال Supabase غير جاهز.");
    }
    return window.customerSupabase;
  }

  function requireOnlineWrite(label = "هذه العملية") {
    if (navigator.onLine === false) {
      throw new Error(`${label} تحتاج اتصالًا بالإنترنت.`);
    }
  }

  async function unwrap(request, fallbackMessage) {
    const { data, error } = await request;
    if (error) {
      if (error.code === "23505") {
        throw new Error("لا يمكن الحفظ لأن القيمة مسجلة مسبقًا.");
      }
      throw new Error(`${fallbackMessage}: ${error.message}`);
    }
    return data;
  }

  function cacheKey(name, includeInactive) {
    return `${name}:${includeInactive ? "all" : "active"}`;
  }

  async function currentNamespace() {
    const localId = window.KYUMOfflineSessionStore?.currentUserId?.();
    if (localId) return `user:${localId}`;
    try {
      const result = await client().auth.getUser();
      return `user:${result?.data?.user?.id || "anonymous"}`;
    } catch (_) {
      return "user:anonymous";
    }
  }

  function emitCacheUpdate(key, data, source) {
    window.dispatchEvent(new CustomEvent("kyum-reference-cache-updated", {
      detail: { key, data, source, updatedAt: Date.now() }
    }));
  }

  async function persist(key, data, namespace) {
    if (!window.KYUMSmartCache) return null;
    return window.KYUMSmartCache.set(`reference:${key}`, data, {
      namespace,
      ttlMs: PERSISTENT_TTL_MS,
      staleMaxMs: PERSISTENT_STALE_MAX_MS,
      source: "supabase",
      schemaVersion: 1
    });
  }

  async function refreshFromNetwork(key, loader, namespace, previousData = null) {
    const data = await loader();
    cache.set(key, { data, timestamp: Date.now() });
    await persist(key, data, namespace);
    if (previousData && window.KYUMSmartCache?.hashValue(previousData) !== window.KYUMSmartCache?.hashValue(data)) {
      emitCacheUpdate(key, data, "network-refresh");
    }
    return data;
  }

  async function cachedList(key, loader) {
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data;
    }

    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    const request = (async () => {
      const namespace = await currentNamespace();
      let persistent = null;

      if (window.KYUMSmartCache) {
        persistent = await window.KYUMSmartCache.get(`reference:${key}`, {
          namespace,
          allowStale: true,
          allowStaleAnyAge: true,
          staleMaxMs: PERSISTENT_STALE_MAX_MS
        });
      }

      if (persistent?.hit) {
        cache.set(key, { data: persistent.data, timestamp: Date.now() });
        if (window.customerSupabase) {
          refreshFromNetwork(key, loader, namespace, persistent.data).catch(error => {
            console.warn(`Reference data background refresh skipped for ${key}:`, error);
          });
        }
        return persistent.data;
      }

      try {
        return await refreshFromNetwork(key, loader, namespace);
      } catch (error) {
        if (persistent?.data) return persistent.data;
        throw error;
      }
    })();

    inFlight.set(key, request);

    try {
      return await request;
    } finally {
      inFlight.delete(key);
    }
  }

  function invalidate(prefix = "") {
    if (!prefix) {
      cache.clear();
    } else {
      for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
      }
    }

    currentNamespace().then(namespace => {
      window.KYUMSmartCache?.removePrefix(`reference:${prefix}`, { namespace });
    }).catch(() => {});
  }

  async function listRepresentatives(includeInactive = true) {
    const key = cacheKey("sales_representatives", includeInactive);

    return cachedList(key, async () => {
      let query = client()
        .from("sales_representatives")
        .select("id, representative_code, full_name, phone, email, is_active, created_at")
        .order("full_name", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      return unwrap(query, "تعذر تحميل المندوبين");
    });
  }

  async function saveRepresentative(record) {
    requireOnlineWrite(record?.id ? "تعديل المندوب" : "إضافة المندوب");
    const payload = {
      representative_code: record.representative_code.trim(),
      full_name: record.full_name.trim(),
      phone: record.phone?.trim() || null,
      email: record.email?.trim() || null,
      is_active: Boolean(record.is_active)
    };

    if (record.id) {
      const rows = await unwrap(
        client().from("sales_representatives").update(payload).eq("id", record.id).select().single(),
        "تعذر تعديل المندوب"
      );
      await audit("update", "sales_representatives", record.id, payload);
      invalidate("sales_representatives:");
      return rows;
    }

    const rows = await unwrap(
      client().from("sales_representatives").insert(payload).select().single(),
      "تعذر إضافة المندوب"
    );
    await audit("insert", "sales_representatives", rows.id, payload);
    invalidate("sales_representatives:");
    return rows;
  }

  async function setRepresentativeStatus(id, isActive) {
    requireOnlineWrite("تغيير حالة المندوب");
    const row = await unwrap(
      client().from("sales_representatives")
        .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, representative_code, full_name, phone, email, is_active, created_at")
        .single(),
      "تعذر تغيير حالة المندوب"
    );
    await audit("update", "sales_representatives", id, { is_active: Boolean(isActive) });
    invalidate("sales_representatives:");
    return row;
  }

  async function deleteRepresentative(id) {
    requireOnlineWrite("حذف المندوب");
    await unwrap(
      client().from("sales_representatives").delete().eq("id", id),
      "تعذر حذف المندوب"
    );
    await audit("delete", "sales_representatives", id, { id });
    invalidate("sales_representatives:");
    return { id };
  }

  async function listReference(table, includeInactive = true) {
    const key = cacheKey(table, includeInactive);

    return cachedList(key, async () => {
      let query = client()
        .from(table)
        .select("id, name, is_active, created_at")
        .order("name", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      return unwrap(query, "تعذر تحميل البيانات المرجعية");
    });
  }

  async function saveReference(table, record) {
    requireOnlineWrite(record?.id ? "تعديل البيانات المرجعية" : "إضافة البيانات المرجعية");
    const payload = {
      name: record.name.trim(),
      is_active: Boolean(record.is_active)
    };

    if (record.id) {
      const row = await unwrap(
        client().from(table).update(payload).eq("id", record.id).select().single(),
        "تعذر تعديل البيانات المرجعية"
      );
      await audit("update", table, record.id, payload);
      invalidate(`${table}:`);
      return row;
    }

    const row = await unwrap(
      client().from(table).insert(payload).select().single(),
      "تعذر إضافة البيانات المرجعية"
    );
    await audit("insert", table, row.id, payload);
    invalidate(`${table}:`);
    return row;
  }

  async function deleteReference(table, id) {
    requireOnlineWrite("حذف البيانات المرجعية");
    await unwrap(
      client().from(table).delete().eq("id", id),
      "تعذر حذف البيانات المرجعية"
    );
    await audit("delete", table, id, { id });
    invalidate(`${table}:`);
    return { id };
  }

  async function audit(action, entityType, entityId, newData) {
    try {
      await client().from("audit_logs").insert({
        user_id: (await client().auth.getUser()).data.user?.id || null,
        action,
        entity_type: entityType,
        entity_id: String(entityId || ""),
        new_data: newData,
        metadata: { source: "petatoe-web", phase: "07" }
      });
    } catch (error) {
      console.warn("Audit log skipped:", error);
    }
  }

  window.ReferenceDataService = Object.freeze({
    listRepresentatives,
    saveRepresentative,
    setRepresentativeStatus,
    deleteRepresentative,
    listInterests: (includeInactive = true) =>
      listReference("interest_categories", includeInactive),
    saveInterest: record => saveReference("interest_categories", record),
    deleteInterest: id => deleteReference("interest_categories", id),
    listReasons: (includeInactive = true) =>
      listReference("no_sale_reasons", includeInactive),
    saveReason: record => saveReference("no_sale_reasons", record),
    deleteReason: id => deleteReference("no_sale_reasons", id),
    invalidate
  });
})();
