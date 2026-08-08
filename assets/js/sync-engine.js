// KYUM Phase M13.13 — Connectivity-resilient Enterprise Delta Sync Engine
(function () {
  "use strict";

  const STATE_PREFIX = "kyum:delta-sync:v1";
  const FULL_RECONCILE_MS = 6 * 60 * 60 * 1000;
  const CURSOR_OVERLAP_MS = 5000;
  const tasks = new Map();
  const inFlight = new Map();
  const retryTimers = new Map();
  let lifecycleInstalled = false;

  function stateKey(namespace, entity, scopeKey) {
    return `${STATE_PREFIX}:${String(namespace || "anonymous")}:${String(entity)}:${String(scopeKey || "default")}`;
  }

  function readState(namespace, entity, scopeKey) {
    try {
      const raw = localStorage.getItem(stateKey(namespace, entity, scopeKey));
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeState(namespace, entity, scopeKey, patch) {
    const key = stateKey(namespace, entity, scopeKey);
    const next = { ...readState(namespace, entity, scopeKey), ...patch };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) { /* storage is optional */ }
    window.dispatchEvent(new CustomEvent("kyum-sync-state-changed", { detail: { entity, scopeKey, state: next } }));
    return next;
  }

  function timestampOf(row) {
    const raw = row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || "";
    const value = Date.parse(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function cursorFromRows(rows, fallback = "") {
    let max = Date.parse(fallback || "") || 0;
    for (const row of rows || []) max = Math.max(max, timestampOf(row));
    return max ? new Date(max).toISOString() : (fallback || "");
  }

  function overlappedCursor(cursor) {
    const value = Date.parse(cursor || "");
    return Number.isFinite(value) ? new Date(Math.max(0, value - CURSOR_OVERLAP_MS)).toISOString() : "";
  }

  function mergeRows(currentRows, deltaRows, sortRows) {
    const byId = new Map();
    for (const row of currentRows || []) if (row?.id != null) byId.set(String(row.id), row);
    for (const row of deltaRows || []) if (row?.id != null) byId.set(String(row.id), row);
    const merged = Array.from(byId.values());
    return typeof sortRows === "function" ? sortRows(merged) : merged;
  }

  function shouldFullSync(state, cachedRows, forceFull) {
    if (forceFull || !Array.isArray(cachedRows)) return true;
    if (!state.cursor || !state.lastFullSyncAt) return true;
    return Date.now() - Number(state.lastFullSyncAt || 0) >= FULL_RECONCILE_MS;
  }

  async function sync(options) {
    const {
      entity, namespace, scopeKey, cachedRows, fetchFull, fetchDelta,
      sortRows, forceFull = false
    } = options || {};
    if (!entity || typeof fetchFull !== "function") throw new Error("invalid_sync_configuration");

    const flightKey = `${namespace}:${entity}:${scopeKey}`;
    if (inFlight.has(flightKey)) return inFlight.get(flightKey);

    const operation = (async () => {
      const previous = readState(namespace, entity, scopeKey);
      const full = shouldFullSync(previous, cachedRows, forceFull) || typeof fetchDelta !== "function";
      writeState(namespace, entity, scopeKey, { status: "syncing", lastAttemptAt: Date.now(), mode: full ? "full" : "delta" });

      try {
        let rows;
        let changedRows = 0;
        if (full) {
          rows = await fetchFull();
          changedRows = Array.isArray(rows) ? rows.length : 0;
        } else {
          const deltaRows = await fetchDelta(overlappedCursor(previous.cursor));
          changedRows = Array.isArray(deltaRows) ? deltaRows.length : 0;
          rows = mergeRows(cachedRows, deltaRows, sortRows);
        }

        const cursor = cursorFromRows(rows, previous.cursor);
        const now = Date.now();
        const state = writeState(namespace, entity, scopeKey, {
          status: "idle",
          mode: full ? "full" : "delta",
          cursor,
          lastSuccessAt: now,
          lastFullSyncAt: full ? now : previous.lastFullSyncAt,
          changedRows,
          recordCount: Array.isArray(rows) ? rows.length : 0,
          failures: 0,
          error: ""
        });
        return { rows, mode: state.mode, changedRows, state };
      } catch (error) {
        const failures = Number(previous.failures || 0) + 1;
        writeState(namespace, entity, scopeKey, {
          status: "error", failures, lastFailureAt: Date.now(), error: String(error?.message || error)
        });
        throw error;
      }
    })();

    inFlight.set(flightKey, operation);
    try { return await operation; } finally { inFlight.delete(flightKey); }
  }

  function register(entity, task) {
    if (!entity || typeof task !== "function") return () => {};
    tasks.set(entity, task);
    installLifecycle();
    return () => tasks.delete(entity);
  }

  async function runTask(entity, reason) {
    const task = tasks.get(entity);
    if (!task) return;
    try {
      await task({ reason });
      const timer = retryTimers.get(entity);
      if (timer) clearTimeout(timer);
      retryTimers.delete(entity);
    } catch (error) {
      const delay = Math.min(5 * 60 * 1000, 5000 * Math.pow(2, Math.min(5, Number(error?.syncFailures || 0))));
      if (!retryTimers.has(entity)) {
        retryTimers.set(entity, setTimeout(() => {
          retryTimers.delete(entity);
          runTask(entity, "retry").catch(() => {});
        }, delay));
      }
    }
  }

  function triggerAll(reason = "manual") {
    return Promise.allSettled(Array.from(tasks.keys()).map(entity => runTask(entity, reason)));
  }

  function installLifecycle() {
    if (lifecycleInstalled) return;
    lifecycleInstalled = true;
    window.addEventListener("online", () => triggerAll("online"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") triggerAll("foreground");
    });
  }

  function clearState(namespace, entity, scopeKey) {
    try { localStorage.removeItem(stateKey(namespace, entity, scopeKey)); } catch (_) { /* no-op */ }
  }

  window.KYUMSyncEngine = Object.freeze({
    version: "M13.13",
    sync,
    register,
    triggerAll,
    getState: readState,
    clearState,
    mergeRows,
    cursorFromRows
  });
})();
