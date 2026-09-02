// KYUM Phase M13.13 — Offline Write Completion & Sync Recovery Center
(function () {
  "use strict";

  const DB_NAME = "kyum_crm_offline_queue";
  const DB_VERSION = 2;
  const OPS_STORE = "operations";
  const CONFLICTS_STORE = "conflicts";
  const MAP_STORE = "id_map";
  const MAX_ATTEMPTS = 8;
  const PROCESSING_TIMEOUT_MS = 2 * 60 * 1000;
  const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const RESOLVED_CONFLICT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const OPEN_OPERATION_STATUSES = ["pending", "retry", "processing", "failed", "conflict"];
  const handlers = new Map();
  const processors = new Map();
  let dbPromise = null;
  let lifecycleInstalled = false;

  class ConflictError extends Error {
    constructor(message, details = {}) {
      super(message || "offline_sync_conflict");
      this.name = "KYUMOfflineConflictError";
      this.code = "OFFLINE_CONFLICT";
      this.details = details;
    }
  }

  function uid(prefix = "op") {
    if (globalThis.crypto?.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
    return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function stableStringify(value) {
    if (value == null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function openDb() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("indexeddb_unavailable"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        let operations;
        if (!db.objectStoreNames.contains(OPS_STORE)) {
          operations = db.createObjectStore(OPS_STORE, { keyPath: "id" });
          operations.createIndex("namespace", "namespace", { unique: false });
          operations.createIndex("status", "status", { unique: false });
          operations.createIndex("createdAt", "createdAt", { unique: false });
        } else {
          operations = request.transaction.objectStore(OPS_STORE);
        }
        if (!operations.indexNames.contains("dedupeKey")) operations.createIndex("dedupeKey", "dedupeKey", { unique: false });
        if (!operations.indexNames.contains("namespaceStatus")) operations.createIndex("namespaceStatus", ["namespace", "status"], { unique: false });

        if (!db.objectStoreNames.contains(CONFLICTS_STORE)) {
          const store = db.createObjectStore(CONFLICTS_STORE, { keyPath: "id" });
          store.createIndex("namespace", "namespace", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(MAP_STORE)) {
          const store = db.createObjectStore(MAP_STORE, { keyPath: "id" });
          store.createIndex("namespace", "namespace", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("offline_queue_open_failed"));
      request.onblocked = () => reject(new Error("offline_queue_open_blocked"));
    });
    return dbPromise;
  }

  async function transaction(storeName, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("offline_queue_transaction_failed"));
      tx.onabort = () => reject(tx.error || new Error("offline_queue_transaction_aborted"));
    });
  }

  function currentUserId() {
    const candidates = [
      window.OfflineSessionStore?.currentUserId?.(),
      window.CustomerAuth?.getState?.().user?.id,
      window.CustomerAuth?.getCurrentUser?.()?.id
    ];
    return candidates.find(Boolean) || null;
  }

  async function getNamespace(options = {}) {
    const localId = currentUserId();
    if (localId) return `user:${localId}`;
    if (options.allowNetwork !== false) {
      try {
        const session = await window.customerSupabase?.auth?.getSession?.();
        const id = session?.data?.session?.user?.id;
        if (id) return `user:${id}`;
      } catch (_) { /* local identity remains authoritative */ }
    }
    throw new Error("offline_queue_user_namespace_unavailable");
  }

  function emit(type, detail = {}) {
    const payload = { ...detail, at: Date.now() };
    window.dispatchEvent(new CustomEvent(type, { detail: payload }));
    window.dispatchEvent(new CustomEvent("kyum-offline-queue-changed", { detail: payload }));
  }

  async function putOperation(operation) {
    await transaction(OPS_STORE, "readwrite", store => store.put(operation));
    emit("kyum-offline-operation-updated", { operation: clone(operation) });
    return operation;
  }

  async function getOperation(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OPS_STORE, "readonly");
      const req = tx.objectStore(OPS_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("offline_operation_read_failed"));
    });
  }

  async function list(options = {}) {
    const namespace = options.namespace || await getNamespace({ allowNetwork: false });
    const db = await openDb();
    const rows = [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OPS_STORE, "readonly");
      const req = tx.objectStore(OPS_STORE).index("namespace").openCursor(IDBKeyRange.only(namespace));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (!options.statuses || options.statuses.includes(cursor.value.status)) rows.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error("offline_operation_list_failed"));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("offline_operation_list_failed"));
    });
    return rows.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  async function findDuplicate(namespace, dedupeKey) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OPS_STORE, "readonly");
      const req = tx.objectStore(OPS_STORE).index("dedupeKey").openCursor(IDBKeyRange.only(dedupeKey));
      let match = null;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const row = cursor.value;
        if (row.namespace === namespace && ["pending", "retry", "processing", "synced"].includes(row.status)) {
          match = row;
          return;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(match);
      tx.onerror = () => reject(tx.error || new Error("offline_operation_dedupe_failed"));
    });
  }

  async function enqueue(options = {}) {
    const namespace = options.namespace || await getNamespace({ allowNetwork: false });
    if (!namespace.startsWith("user:") || namespace === "user:anonymous") throw new Error("invalid_offline_queue_namespace");
    if (!options.entity || !options.action || !options.payload) throw new Error("invalid_offline_operation");

    const localEntityId = options.localEntityId || (options.action === "create" ? uid("local") : options.payload?.id || null);
    const payload = clone(options.payload);
    const dedupeSeed = options.idempotencyKey || stableStringify({ namespace, entity: options.entity, action: options.action, localEntityId, payload });
    const dedupeKey = `${namespace}:${options.entity}:${hashText(dedupeSeed)}`;
    const duplicate = await findDuplicate(namespace, dedupeKey);
    if (duplicate) return { operationId: duplicate.id, localEntityId: duplicate.localEntityId, duplicate: true };

    const operation = {
      id: uid("operation"), namespace, entity: options.entity, action: options.action,
      payload, localEntityId,
      baseUpdatedAt: options.baseUpdatedAt || payload?.updatedAt || payload?.updated_at || "",
      dependsOn: Array.isArray(options.dependsOn) ? [...new Set(options.dependsOn.filter(Boolean))] : [],
      dedupeKey, idempotencyKey: options.idempotencyKey || dedupeKey,
      status: "pending", attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      nextAttemptAt: 0, lastError: "", resultId: null
    };
    await putOperation(operation);
    emit("kyum-offline-operation-queued", { operation: clone(operation) });
    return { operationId: operation.id, localEntityId, duplicate: false };
  }

  async function writeIdMap(namespace, localId, serverId, entity) {
    if (!localId || !serverId) return;
    const row = { id: `${namespace}::${localId}`, namespace, localId, serverId, entity, updatedAt: Date.now() };
    await transaction(MAP_STORE, "readwrite", store => store.put(row));
  }

  async function resolveServerId(localId, namespace) {
    if (!String(localId || "").startsWith("local:")) return localId;
    const ns = namespace || await getNamespace({ allowNetwork: false });
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MAP_STORE, "readonly");
      const req = tx.objectStore(MAP_STORE).get(`${ns}::${localId}`);
      req.onsuccess = () => resolve(req.result?.serverId || null);
      req.onerror = () => reject(req.error || new Error("offline_id_map_read_failed"));
    });
  }

  async function findCreateOperationByLocalId(localId, namespace) {
    const rows = await list({ namespace: namespace || await getNamespace({ allowNetwork: false }), statuses: ["pending", "retry", "processing", "synced"] });
    return rows.find(row => row.action === "create" && row.localEntityId === localId) || null;
  }

  async function dependenciesReady(operation) {
    for (const dependencyId of operation.dependsOn || []) {
      const dependency = await getOperation(dependencyId);
      if (!dependency || dependency.status !== "synced") return false;
    }
    return true;
  }

  function isRetryableError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    return code === "typeerror" || code === "fetch_error" ||
      /failed to fetch|network|load failed|connection|timeout|offline|fetch|supabase.*unavailable/i.test(message);
  }

  async function saveConflict(operation, error) {
    const conflict = {
      id: uid("conflict"), namespace: operation.namespace, operationId: operation.id,
      entity: operation.entity, action: operation.action, payload: clone(operation.payload),
      baseUpdatedAt: operation.baseUpdatedAt, reason: String(error?.message || "offline_sync_conflict"),
      details: error?.details || {}, createdAt: Date.now(), updatedAt: Date.now(), status: "open"
    };
    await transaction(CONFLICTS_STORE, "readwrite", store => store.put(conflict));
    emit("kyum-offline-conflict-created", { conflict: clone(conflict) });
    return conflict;
  }

  async function recover(namespace) {
    const rows = await list({ namespace });
    let recovered = 0;
    const now = Date.now();
    for (const operation of rows) {
      if (operation.status === "processing" && now - Number(operation.updatedAt || 0) >= PROCESSING_TIMEOUT_MS) {
        operation.status = "retry";
        operation.nextAttemptAt = 0;
        operation.lastError = "Recovered after interrupted synchronization";
        operation.updatedAt = now;
        await putOperation(operation);
        recovered += 1;
      }
    }
    if (recovered) emit("kyum-offline-queue-recovered", { namespace, recovered });
    return recovered;
  }

  async function processOperation(operation) {
    const handler = handlers.get(operation.entity);
    if (!handler || !(await dependenciesReady(operation))) return false;

    operation.status = "processing";
    operation.attempts = Number(operation.attempts || 0) + 1;
    operation.updatedAt = Date.now();
    operation.processingStartedAt = Date.now();
    await putOperation(operation);

    try {
      const result = await handler(operation, { resolveServerId, idempotencyKey: operation.idempotencyKey });
      operation.status = "synced";
      operation.resultId = result?.id || result || null;
      operation.syncedAt = Date.now();
      operation.updatedAt = Date.now();
      operation.lastError = "";
      operation.nextAttemptAt = 0;
      if (operation.action === "create" && operation.localEntityId && operation.resultId) {
        await writeIdMap(operation.namespace, operation.localEntityId, operation.resultId, operation.entity);
      }
      await putOperation(operation);
      emit("kyum-offline-operation-synced", { operation: clone(operation) });
      return true;
    } catch (error) {
      operation.updatedAt = Date.now();
      operation.lastError = String(error?.message || error);
      if (error?.code === "OFFLINE_CONFLICT") {
        operation.status = "conflict";
        await saveConflict(operation, error);
      } else if (isRetryableError(error) && operation.attempts < MAX_ATTEMPTS) {
        operation.status = "retry";
        operation.nextAttemptAt = Date.now() + Math.min(5 * 60 * 1000, 3000 * Math.pow(2, operation.attempts - 1));
      } else {
        operation.status = "failed";
      }
      await putOperation(operation);
      return false;
    }
  }

  async function process(options = {}) {
    const namespace = options.namespace || await getNamespace({ allowNetwork: false });
    if (processors.has(namespace)) return processors.get(namespace);
    const job = (async () => {
      await recover(namespace);
      const rows = await list({ namespace, statuses: ["pending", "retry"] });
      let synced = 0;
      for (const operation of rows) {
        if (operation.nextAttemptAt && operation.nextAttemptAt > Date.now()) continue;
        if (await processOperation(operation)) synced += 1;
      }
      if (synced && window.KYUMSyncEngine?.triggerAll) await window.KYUMSyncEngine.triggerAll("offline-queue");
      emit("kyum-offline-queue-processed", { namespace, processed: rows.length, synced });
      return { processed: rows.length, synced };
    })();
    processors.set(namespace, job);
    try { return await job; } finally { processors.delete(namespace); }
  }

  function register(entity, handler) {
    if (!entity || typeof handler !== "function") return () => {};
    handlers.set(entity, handler);
    installLifecycle();
    return () => handlers.delete(entity);
  }

  async function retryAll(options = {}) {
    const namespace = options.namespace || await getNamespace({ allowNetwork: false });
    const rows = await list({ namespace, statuses: ["failed", "retry", "pending", "conflict"] });
    let updated = 0;
    for (const operation of rows) {
      if (operation.status === "processing") continue;
      operation.status = "retry";
      operation.nextAttemptAt = 0;
      operation.lastError = "";
      operation.updatedAt = Date.now();
      await putOperation(operation);
      updated += 1;
    }
    if (updated) emit("kyum-offline-queue-retry-all", { namespace, updated });
    return process({ namespace });
  }

  async function retry(operationId) {
    const operation = await getOperation(operationId);
    if (!operation) throw new Error("offline_operation_not_found");
    const namespace = await getNamespace({ allowNetwork: false });
    if (operation.namespace !== namespace) throw new Error("offline_operation_namespace_mismatch");
    operation.status = "retry";
    operation.nextAttemptAt = 0;
    operation.lastError = "";
    operation.updatedAt = Date.now();
    await putOperation(operation);
    return process({ namespace });
  }

  async function discard(operationId) {
    const operation = await getOperation(operationId);
    if (!operation) return false;
    const namespace = await getNamespace({ allowNetwork: false });
    if (operation.namespace !== namespace) throw new Error("offline_operation_namespace_mismatch");
    if (operation.status === "processing") throw new Error("offline_operation_is_processing");
    await transaction(OPS_STORE, "readwrite", store => store.delete(operationId));
    emit("kyum-offline-operation-discarded", { operationId, namespace });
    return true;
  }

  async function listConflicts(options = {}) {
    const namespace = options.namespace || await getNamespace({ allowNetwork: false });
    const db = await openDb();
    const rows = [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CONFLICTS_STORE, "readonly");
      const req = tx.objectStore(CONFLICTS_STORE).index("namespace").openCursor(IDBKeyRange.only(namespace));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (!options.statuses || options.statuses.includes(cursor.value.status)) rows.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error("offline_conflict_list_failed"));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("offline_conflict_list_failed"));
    });
    return rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function resolveConflict(conflictId, resolution = "discard") {
    const db = await openDb();
    const conflict = await new Promise((resolve, reject) => {
      const tx = db.transaction(CONFLICTS_STORE, "readonly");
      const req = tx.objectStore(CONFLICTS_STORE).get(conflictId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("offline_conflict_read_failed"));
    });
    if (!conflict) throw new Error("offline_conflict_not_found");
    const namespace = await getNamespace({ allowNetwork: false });
    if (conflict.namespace !== namespace) throw new Error("offline_conflict_namespace_mismatch");
    conflict.status = "resolved";
    conflict.resolution = resolution;
    conflict.resolvedAt = Date.now();
    conflict.updatedAt = Date.now();
    await transaction(CONFLICTS_STORE, "readwrite", store => store.put(conflict));
    if (resolution === "retry") await retry(conflict.operationId);
    if (resolution === "discard") await discard(conflict.operationId);
    emit("kyum-offline-conflict-resolved", { conflict: clone(conflict) });
    return conflict;
  }

  async function cleanup(options = {}) {
    const namespace = options.namespace || await getNamespace({ allowNetwork: false });
    const cutoff = Date.now() - Number(options.retentionMs || COMPLETED_RETENTION_MS);
    const openRows = await list({ namespace, statuses: OPEN_OPERATION_STATUSES });
    const protectedDependencyIds = new Set();
    for (const row of openRows) {
      for (const dependencyId of row.dependsOn || []) if (dependencyId) protectedDependencyIds.add(dependencyId);
    }

    const rows = await list({ namespace, statuses: ["synced"] });
    let removed = 0;
    for (const row of rows) {
      if (protectedDependencyIds.has(row.id)) continue;
      if (Number(row.syncedAt || row.updatedAt || 0) < cutoff) {
        await transaction(OPS_STORE, "readwrite", store => store.delete(row.id));
        removed += 1;
      }
    }

    // Resolved conflicts are recovery history only. Keeping open conflicts is mandatory,
    // but resolved rows can be bounded independently without affecting replay or ID mapping.
    const conflictCutoff = Date.now() - Number(options.resolvedConflictRetentionMs || RESOLVED_CONFLICT_RETENTION_MS);
    const resolvedConflicts = await listConflicts({ namespace, statuses: ["resolved"] }).catch(() => []);
    for (const conflict of resolvedConflicts) {
      if (Number(conflict.resolvedAt || conflict.updatedAt || 0) >= conflictCutoff) continue;
      await transaction(CONFLICTS_STORE, "readwrite", store => store.delete(conflict.id));
    }
    return removed;
  }

  async function stats(options = {}) {
    const rows = await list(options);
    const counts = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    const conflicts = await listConflicts({ namespace: options.namespace, statuses: ["open"] }).catch(() => []);
    return {
      total: rows.length, counts, openConflicts: conflicts.length,
      lastQueuedAt: rows.reduce((max, row) => Math.max(max, row.createdAt || 0), 0) || null,
      lastSyncedAt: rows.reduce((max, row) => Math.max(max, row.syncedAt || 0), 0) || null
    };
  }

  function installLifecycle() {
    if (lifecycleInstalled) return;
    lifecycleInstalled = true;
    const run = () => process().then(() => cleanup()).catch(() => {});
    window.addEventListener("online", run);
    window.addEventListener("kyum-auth-state-changed", run);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") run();
    });
    setTimeout(run, 1500);
  }

  window.KYUMOfflineQueue = Object.freeze({
    version: "M13.13", ConflictError, enqueue, register, process, recover,
    list, stats, retry, retryAll, discard, cleanup, listConflicts, resolveConflict,
    resolveServerId, findCreateOperationByLocalId, isRetryableError, getNamespace
  });
  installLifecycle();
})();
