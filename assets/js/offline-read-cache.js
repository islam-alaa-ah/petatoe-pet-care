// KYUM Phase M13.11 — Shared Offline Read Cache
(function () {
  "use strict";
  const DEFAULT_TTL_MS = 5 * 60 * 1000;

  function userId() {
    return window.KYUMOfflineSessionStore?.currentUserId?.()
      || window.CustomerAuth?.getState?.().user?.id
      || null;
  }

  function namespace() {
    const id = userId();
    if (!id) throw new Error("تعذر تحديد المستخدم الحالي للتخزين المحلي.");
    return `user:${id}`;
  }

  function available() {
    return Boolean(window.customerSupabase);
  }

  function emit(key, data, source, metadata = null) {
    window.dispatchEvent(new CustomEvent("kyum-offline-read-updated", {
      detail: { key, data, source, metadata, updatedAt: Date.now() }
    }));
  }

  async function read(key, loader, options = {}) {
    const ns = options.namespace || namespace();
    const cacheKey = `offline-read:${key}`;
    const ttlMs = Number(options.ttlMs || DEFAULT_TTL_MS);
    const cached = window.KYUMSmartCache
      ? await window.KYUMSmartCache.get(cacheKey, {
          namespace: ns,
          allowStale: true,
          allowStaleAnyAge: true
        })
      : { hit: false };

    const refresh = async () => {
      if (!available()) throw new Error("network_client_unavailable");
      const data = await loader();
      await window.KYUMSmartCache?.set(cacheKey, data, {
        namespace: ns,
        ttlMs,
        staleMaxMs: 3650 * 24 * 60 * 60 * 1000,
        source: "supabase",
        schemaVersion: 1
      });
      if (!cached.hit || window.KYUMSmartCache?.hashValue(cached.data) !== window.KYUMSmartCache?.hashValue(data)) {
        emit(key, data, "network-refresh");
      }
      return data;
    };

    if (cached.hit && !options.force) {
      if (available()) refresh().catch(error => console.warn(`Offline read refresh skipped for ${key}:`, error));
      return cached.data;
    }

    try {
      return await refresh();
    } catch (error) {
      if (cached.hit) return cached.data;
      throw error;
    }
  }

  async function invalidate(prefix = "") {
    const ns = namespace();
    return window.KYUMSmartCache?.removePrefix(`offline-read:${prefix}`, { namespace: ns });
  }

  window.KYUMOfflineReadCache = Object.freeze({ read, invalidate, namespace, available });
})();
