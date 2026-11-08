// KYUM Phase M13.1 — Enterprise Smart Cache Foundation
(function () {
  "use strict";

  const DB_NAME = "kyum_crm_smart_cache";
  const DB_VERSION = 1;
  const STORE_NAME = "entries";
  const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const memoryFallback = new Map();
  const OPEN_RETRY_MS = 5000;
  let databaseEntry = null;
  let retryAfter = 0;
  let reloadRequired = false;
  const connectionStatus = { openAttempts: 0, successfulOpens: 0, openFailures: 0, blockedOpens: 0, invalidations: 0, transactionRetries: 0 };

  function now() {
    return Date.now();
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  function hashValue(value) {
    const input = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function normalizeNamespace(namespace) {
    const value = String(namespace || "anonymous").trim();
    return value || "anonymous";
  }

  function entryId(namespace, key) {
    return `${normalizeNamespace(namespace)}::${String(key || "").trim()}`;
  }

  function retireDatabase(database) {
    const entry = databaseEntry;
    // A late event from an older handle must not retire its replacement.
    if (!entry || entry.database !== database) return;
    entry.retired = true;
    databaseEntry = null;
    connectionStatus.invalidations++;
    try { database.close(); } catch (_) {}
  }

  function openDatabase() {
    if (!("indexedDB" in window) || reloadRequired) return Promise.resolve(null);
    if (databaseEntry) return databaseEntry.promise;
    if (now() < retryAfter) return Promise.resolve(null);

    const entry = { database: null, promise: null, retired: false };
    databaseEntry = entry;
    connectionStatus.openAttempts++;
    entry.promise = new Promise(resolve => {
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        entry.retired = true;
        if (databaseEntry === entry) {
          databaseEntry = null;
          retryAfter = now() + OPEN_RETRY_MS;
        }
        connectionStatus.openFailures++;
        console.warn("KYUM SmartCache: IndexedDB unavailable, using memory fallback.", error);
        resolve(null);
      };
      let request;
      try { request = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        if (entry.retired || databaseEntry !== entry) {
          try { request.transaction.abort(); } catch (_) {}
          return;
        }
        try {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
            store.createIndex("namespace", "namespace", { unique: false });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        } catch (error) {
          try { request.transaction.abort(); } catch (_) {}
          fail(error);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        // A blocked request can succeed after its callers already used memory.
        if (entry.retired || databaseEntry !== entry) {
          try { database.close(); } catch (_) {}
          return;
        }
        settled = true;
        entry.database = database;
        retryAfter = 0;
        connectionStatus.successfulOpens++;
        database.onclose = () => retireDatabase(database);
        database.onversionchange = () => {
          if (databaseEntry !== entry) return;
          // Let another tab upgrade/delete; this old page waits for a reload.
          reloadRequired = true;
          retireDatabase(database);
        };
        resolve(database);
      };
      request.onerror = () => fail(request.error || new Error("smart_cache_open_failed"));
      request.onblocked = () => {
        connectionStatus.blockedOpens++;
        fail(new Error("smart_cache_open_blocked"));
      };
    });

    return entry.promise;
  }

  async function withTransaction(mode, operation) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const database = await openDatabase();
      if (!database) return operation(null);
      let transaction;
      try { transaction = database.transaction(STORE_NAME, mode); }
      catch (error) {
        if (error?.name !== "InvalidStateError") throw error;
        retireDatabase(database);
        if (attempt === 0) { connectionStatus.transactionRetries++; continue; }
        retryAfter = now() + OPEN_RETRY_MS;
        throw error;
      }
      // Queue requests synchronously while the new transaction is still active.
      // Once started, a transaction or its operations are never auto-replayed.
      return operation(transaction);
    }
  }

  async function run(mode, operation) {
    return withTransaction(mode, transaction => {
      if (!transaction) return operation(null, null);
      return new Promise((resolve, reject) => {
        const store = transaction.objectStore(STORE_NAME);
        let result;
        try {
          result = operation(store, transaction);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error("smart_cache_transaction_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("smart_cache_transaction_aborted"));
      });
    });
  }

  async function get(key, options = {}) {
    const namespace = normalizeNamespace(options.namespace);
    const id = entryId(namespace, key);
    let entry = null;

    entry = await withTransaction("readonly", transaction => {
      if (!transaction) return memoryFallback.get(id) || null;
      return new Promise((resolve, reject) => {
        const request = transaction.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("smart_cache_read_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("smart_cache_read_aborted"));
      });
    }).catch(error => {
      console.warn("KYUM SmartCache read failed.", error);
      return memoryFallback.get(id) || null;
    });

    if (!entry) return { hit: false, stale: false, data: null, metadata: null };

    const expectedHash = hashValue(entry.data);
    if (entry.hash !== expectedHash) {
      await remove(key, { namespace });
      return { hit: false, stale: false, data: null, metadata: null, integrityFailed: true };
    }

    const ageMs = Math.max(0, now() - Number(entry.updatedAt || 0));
    const ttlMs = Number(entry.ttlMs || DEFAULT_TTL_MS);
    const staleMaxMs = Number(options.staleMaxMs || entry.staleMaxMs || DEFAULT_STALE_MAX_MS);
    const stale = ageMs > ttlMs;

    const allowStaleAnyAge = options.allowStaleAnyAge === true;
    if (stale && (!options.allowStale || (!allowStaleAnyAge && ageMs > staleMaxMs))) {
      return { hit: false, stale: true, data: null, metadata: { ageMs, ...entry } };
    }

    return {
      hit: true,
      stale,
      data: entry.data,
      metadata: {
        namespace,
        key: entry.key,
        updatedAt: entry.updatedAt,
        expiresAt: entry.updatedAt + ttlMs,
        ageMs,
        recordCount: entry.recordCount,
        hash: entry.hash,
        source: entry.source,
        schemaVersion: entry.schemaVersion
      }
    };
  }

  async function set(key, data, options = {}) {
    const namespace = normalizeNamespace(options.namespace);
    const id = entryId(namespace, key);
    const updatedAt = now();
    const entry = {
      id,
      namespace,
      key: String(key || "").trim(),
      data,
      hash: hashValue(data),
      updatedAt,
      ttlMs: Number(options.ttlMs || DEFAULT_TTL_MS),
      staleMaxMs: Number(options.staleMaxMs || DEFAULT_STALE_MAX_MS),
      recordCount: Array.isArray(data) ? data.length : (data && typeof data === "object" ? Object.keys(data).length : 1),
      source: String(options.source || "unknown"),
      schemaVersion: Number(options.schemaVersion || 1)
    };

    memoryFallback.set(id, entry);
    await run("readwrite", store => {
      if (store) store.put(entry);
    }).catch(error => console.warn("KYUM SmartCache write failed.", error));

    return {
      namespace,
      key: entry.key,
      updatedAt,
      hash: entry.hash,
      recordCount: entry.recordCount
    };
  }

  async function remove(key, options = {}) {
    const namespace = normalizeNamespace(options.namespace);
    const id = entryId(namespace, key);
    memoryFallback.delete(id);
    await run("readwrite", store => {
      if (store) store.delete(id);
    }).catch(error => console.warn("KYUM SmartCache delete failed.", error));
  }

  async function removePrefix(prefix = "", options = {}) {
    const namespace = normalizeNamespace(options.namespace);
    const normalizedPrefix = String(prefix || "");
    for (const id of Array.from(memoryFallback.keys())) {
      if (id.startsWith(`${namespace}::${normalizedPrefix}`)) memoryFallback.delete(id);
    }

    await withTransaction("readwrite", transaction => {
      if (!transaction) return;
      return new Promise((resolve, reject) => {
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value = cursor.value;
          if (value.namespace === namespace && String(value.key || "").startsWith(normalizedPrefix)) cursor.delete();
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error("smart_cache_prefix_delete_failed"));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("smart_cache_prefix_delete_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("smart_cache_prefix_delete_aborted"));
      });
    }).catch(error => console.warn("KYUM SmartCache prefix delete failed.", error));
  }

  async function stats(options = {}) {
    const namespace = normalizeNamespace(options.namespace);
    const entries = [];

    await withTransaction("readonly", transaction => {
      if (!transaction) {
        for (const value of memoryFallback.values()) {
          if (value.namespace === namespace) entries.push(value);
        }
        return;
      }
      return new Promise((resolve, reject) => {
        const request = transaction.objectStore(STORE_NAME).index("namespace").openCursor(IDBKeyRange.only(namespace));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          entries.push(cursor.value);
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error("smart_cache_stats_failed"));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("smart_cache_stats_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("smart_cache_stats_aborted"));
      });
    }).catch(error => console.warn("KYUM SmartCache stats failed.", error));

    return {
      namespace,
      entries: entries.length,
      records: entries.reduce((sum, entry) => sum + Number(entry.recordCount || 0), 0),
      lastUpdatedAt: entries.reduce((latest, entry) => Math.max(latest, Number(entry.updatedAt || 0)), 0) || null
    };
  }

  window.KYUMSmartCache = Object.freeze({
    version: "M13.5",
    runtimeVersion: "SC1",
    get,
    set,
    remove,
    removePrefix,
    stats,
    hashValue,
    getConnectionStatus: () => ({
      runtime: "SC1", database: DB_NAME, schemaVersion: DB_VERSION,
      state: reloadRequired ? "reload-required" : !("indexedDB" in window) ? "unavailable"
        : databaseEntry?.database ? "open" : databaseEntry ? "opening" : now() < retryAfter ? "backoff" : "idle",
      reloadRequired, retryInMs: Math.max(0, retryAfter - now()), ...connectionStatus
    }),
    health: async () => ({ indexedDB: Boolean(await openDatabase()), database: DB_NAME, schemaVersion: DB_VERSION })
  });
})();
