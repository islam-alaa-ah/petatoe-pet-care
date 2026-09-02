// PETATOE R38 — Sync retention coordinator: CRM tombstones + queue replay-horizon evidence
(function () {
  "use strict";

  const CLIENT_ID_KEY = "kyum:sync-retention:v1:client-id";
  const MAINTENANCE_PREFIX = "kyum:sync-retention:v1:last-maintenance";
  const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const ACK_THROTTLE_MS = 15 * 1000;
  const QUEUE_ACK_THROTTLE_MS = 60 * 1000;
  const QUEUE_OPEN_STATUSES = new Set(["pending", "retry", "processing", "failed", "conflict"]);
  const QUEUE_DOMAINS = Object.freeze({
    installation_execution: new Set(["installation_execution"]),
    sea_vibe: new Set(["sea_vibe"])
  });
  const inflightAcks = new Map();
  const lastAckAt = new Map();
  const inflightQueueAcks = new Map();
  const lastQueueAckAt = new Map();
  let queueAckTimer = null;

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
    const queueMaintenance = await window.customerSupabase.rpc("prune_sync_queue_watermark_metadata_safe", { p_batch_size: 500 });
    if (queueMaintenance?.error) throw new Error(queueMaintenance.error.message || "sync_queue_retention_metadata_maintenance_failed");
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


  function queueDomainRows(rows, domain) {
    const entities = QUEUE_DOMAINS[domain];
    if (!entities) return [];
    return (rows || []).filter(row => entities.has(String(row?.entity || "")) && QUEUE_OPEN_STATUSES.has(String(row?.status || "")));
  }

  function queueSummary(rows) {
    const counts = { pending: 0, retry: 0, processing: 0, failed: 0, conflict: 0 };
    let oldest = null;
    let newest = null;
    let oldestReplayable = null;
    let latestReplayDeadline = null;
    let replayableFailedConflictCount = 0;
    let expiredFailedConflictCount = 0;
    const replayPolicyVersion = window.KYUMOfflineQueue?.replayPolicyVersion || null;
    const replayHorizonDays = Number(window.KYUMOfflineQueue?.replayHorizonDays || 0) || null;
    for (const row of rows || []) {
      const status = String(row?.status || "");
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      const created = Number(row?.createdAt || 0);
      if (created) {
        oldest = oldest == null ? created : Math.min(oldest, created);
        newest = newest == null ? created : Math.max(newest, created);
      }
      const policy = window.KYUMOfflineQueue?.replayPolicy?.(row);
      if (!policy?.managed) continue;
      if (["failed", "conflict"].includes(status)) {
        if (policy.expired) expiredFailedConflictCount += 1;
        else {
          replayableFailedConflictCount += 1;
          const replayAnchor = Number(policy.anchorAt || row?.updatedAt || row?.createdAt || 0);
          if (replayAnchor) oldestReplayable = oldestReplayable == null ? replayAnchor : Math.min(oldestReplayable, replayAnchor);
        }
      }
      const deadline = Number(policy.deadlineAt || 0);
      if (deadline && !policy.expired) latestReplayDeadline = latestReplayDeadline == null ? deadline : Math.max(latestReplayDeadline, deadline);
    }
    return {
      openCount: Object.values(counts).reduce((sum, value) => sum + value, 0),
      counts,
      oldestOpenAt: isoTimestamp(oldest),
      newestOpenAt: isoTimestamp(newest),
      replayPolicyVersion,
      replayHorizonDays,
      replayableFailedConflictCount,
      expiredFailedConflictCount,
      oldestReplayableAt: isoTimestamp(oldestReplayable),
      latestReplayDeadlineAt: isoTimestamp(latestReplayDeadline)
    };
  }

  async function ackQueueDomain(domain, rows, options = {}) {
    const userId = currentUserId();
    if (!userId || navigator.onLine === false || !window.customerSupabase?.rpc) return false;
    const summary = queueSummary(queueDomainRows(rows, domain));
    const key = `${userId}:${domain}`;
    const now = Date.now();
    if (!options.force && now - Number(lastQueueAckAt.get(key) || 0) < QUEUE_ACK_THROTTLE_MS) return true;
    if (inflightQueueAcks.has(key)) return inflightQueueAcks.get(key);

    const operation = (async () => {
      const { error } = await window.customerSupabase.rpc("ack_sync_queue_watermark_v2", {
        p_client_id: clientId(),
        p_domain: domain,
        p_open_count: summary.openCount,
        p_pending_count: summary.counts.pending,
        p_retry_count: summary.counts.retry,
        p_processing_count: summary.counts.processing,
        p_failed_count: summary.counts.failed,
        p_conflict_count: summary.counts.conflict,
        p_oldest_open_at: summary.oldestOpenAt,
        p_newest_open_at: summary.newestOpenAt,
        p_replay_policy_version: summary.replayPolicyVersion,
        p_replay_horizon_days: summary.replayHorizonDays,
        p_replayable_failed_conflict_count: summary.replayableFailedConflictCount,
        p_expired_failed_conflict_count: summary.expiredFailedConflictCount,
        p_oldest_replayable_at: summary.oldestReplayableAt,
        p_latest_replay_deadline_at: summary.latestReplayDeadlineAt
      });
      if (error) throw new Error(error.message || "sync_queue_watermark_ack_failed");
      lastQueueAckAt.set(key, Date.now());
      return true;
    })();

    inflightQueueAcks.set(key, operation);
    try { return await operation; } finally { inflightQueueAcks.delete(key); }
  }

  async function ackQueueWatermarks(options = {}) {
    if (navigator.onLine === false || !window.KYUMOfflineQueue?.list) return false;
    let rows = [];
    try { rows = await window.KYUMOfflineQueue.list(); }
    catch (_) { return false; }
    await Promise.all(Object.keys(QUEUE_DOMAINS).map(domain => ackQueueDomain(domain, rows, options)));
    return true;
  }

  function scheduleQueueAck(force = false) {
    clearTimeout(queueAckTimer);
    queueAckTimer = setTimeout(() => {
      ackQueueWatermarks({ force }).catch(error => console.warn("Sync queue watermark skipped:", error));
    }, 350);
  }

  function installQueueWatermarkLifecycle() {
    ["kyum-offline-queue-changed", "kyum-auth-state-changed", "online"].forEach(type => {
      window.addEventListener(type, () => scheduleQueueAck(type === "online"));
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleQueueAck(false);
    });
    setTimeout(() => scheduleQueueAck(true), 2200);
  }

  window.KYUMSyncRetention = Object.freeze({
    version: "R38",
    clientId,
    scopeFingerprint,
    ack,
    ackQueueWatermarks,
    maybeRunMaintenance
  });
  installQueueWatermarkLifecycle();
})();
