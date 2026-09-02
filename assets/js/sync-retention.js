// PETATOE R34 — CRM sync client watermark + safe tombstone retention coordinator
(function () {
  "use strict";

  const CLIENT_ID_KEY = "kyum:sync-retention:v1:client-id";
  const MAINTENANCE_PREFIX = "kyum:sync-retention:v1:last-maintenance";
  const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const ACK_THROTTLE_MS = 15 * 1000;
  const inflightAcks = new Map();
  const lastAckAt = new Map();

  function hashText(value) {
    const input = String(value || "");
    let left = 2166136261;
    let right = 2246822519;
    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      left ^= code;
      left = Math.imul(left, 16777619);
      right ^= code + index;
      right = Math.imul(right, 3266489917);
    }
    return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
  }

  function createClientId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function clientId() {
    try {
      const existing = localStorage.getItem(CLIENT_ID_KEY);
      if (existing && existing.length >= 12) return existing;
      const created = createClientId();
      localStorage.setItem(CLIENT_ID_KEY, created);
      return created;
    } catch (_) {
      if (!clientId.fallback) clientId.fallback = createClientId();
      return clientId.fallback;
    }
  }

  function currentUserId() {
    return window.KYUMOfflineSessionStore?.currentUserId?.()
      || window.CustomerAuth?.getState?.().user?.id
      || window.CustomerAuth?.getCurrentUser?.()?.id
      || null;
  }

  function scopeFingerprint(scopeKey) {
    return `scope:${hashText(scopeKey || "default")}`;
  }

  function isoTimestamp(value) {
    if (!value) return null;
    if (typeof value === "number") {
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  function maintenanceKey(userId) {
    return `${MAINTENANCE_PREFIX}:${String(userId || "anonymous")}`;
  }

  async function maybeRunMaintenance(userId) {
    if (!userId || navigator.onLine === false || !window.customerSupabase?.rpc) return false;
    const key = maintenanceKey(userId);
    let last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch (_) { /* optional */ }
    if (Date.now() - last < MAINTENANCE_INTERVAL_MS) return false;

    // Set the throttle before the request so multiple workspaces cannot create a prune storm.
    try { localStorage.setItem(key, String(Date.now())); } catch (_) { /* optional */ }
    const { error } = await window.customerSupabase.rpc("prune_crm_sync_tombstones_safe", { p_batch_size: 250 });
    if (error) throw new Error(error.message || "sync_retention_maintenance_failed");
    return true;
  }

  async function ack(options = {}) {
    const entity = String(options.entity || "");
    const state = options.state || {};
    const userId = currentUserId();
    if (!userId || navigator.onLine === false || !window.customerSupabase?.rpc) return false;
    if (!["customers", "followups", "quotations"].includes(entity)) return false;

    const cursor = isoTimestamp(state.cursor);
    const lastFullSyncAt = isoTimestamp(state.lastFullSyncAt);
    if (!cursor && !lastFullSyncAt) return false;

    const scopeHash = scopeFingerprint(options.scopeKey || "default");
    const key = `${userId}:${entity}:${scopeHash}`;
    const now = Date.now();
    if (now - Number(lastAckAt.get(key) || 0) < ACK_THROTTLE_MS) return true;
    if (inflightAcks.has(key)) return inflightAcks.get(key);

    const operation = (async () => {
      const { error } = await window.customerSupabase.rpc("ack_sync_client_watermark", {
        p_client_id: clientId(),
        p_entity: entity,
        p_scope_key: scopeHash,
        p_cursor: cursor,
        p_last_full_sync_at: lastFullSyncAt
      });
      if (error) throw new Error(error.message || "sync_watermark_ack_failed");
      lastAckAt.set(key, Date.now());
      maybeRunMaintenance(userId).catch(error => console.warn("Sync retention maintenance skipped:", error));
      return true;
    })();

    inflightAcks.set(key, operation);
    try { return await operation; } finally { inflightAcks.delete(key); }
  }

  window.KYUMSyncRetention = Object.freeze({
    version: "R34",
    clientId,
    scopeFingerprint,
    ack,
    maybeRunMaintenance
  });
})();
