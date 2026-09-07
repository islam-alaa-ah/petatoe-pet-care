// KYUM Phase M13.13 — Sync Recovery Center
(function () {
  "use strict";

  const statusKeys = { pending: "syncRecovery.status.pending", retry: "syncRecovery.status.retry", processing: "syncRecovery.status.processing", failed: "syncRecovery.status.failed", conflict: "syncRecovery.status.conflict", synced: "syncRecovery.status.synced" };
  const actionKeys = { create: "syncRecovery.action.create", update: "syncRecovery.action.update", delete: "syncRecovery.action.delete" };
  const entityKeys = { customers: "syncRecovery.entity.customers", followups: "syncRecovery.entity.followups", quotations: "syncRecovery.entity.quotations", installation_execution: "syncRecovery.entity.installationExecution", sea_vibe: "syncRecovery.entity.seaVibe" };
  const t = (key, vars = {}) => window.PetatoeLocalization?.t?.(key, vars) || key;
  let refreshTimer = null;

  function text(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  }

  function formatTime(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat(window.PetatoeLocalization?.effectiveLanguage?.() === "en" ? "en-US-u-ca-gregory-nu-latn" : "ar-SA-u-ca-gregory-nu-latn", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
    catch (_) { return "—"; }
  }

  function replayPolicy(row) {
    return window.KYUMOfflineQueue?.replayPolicy?.(row) || { managed: false, canReplay: true, expired: false, horizonDays: null, deadlineAt: null };
  }

  function replayExpiredText(policy) {
    if (!policy?.expired) return "";
    return t("syncRecovery.replay.expiredDetail", { days: Number(policy.horizonDays || 90), deadline: formatTime(policy.deadlineAt) });
  }

  function setStatus(message, kind = "") {
    const node = document.getElementById("syncRecoveryStatus");
    if (!node) return;
    node.textContent = message || "";
    node.className = `data-status${message ? "" : " hidden"}${kind ? ` ${kind}` : ""}`;
  }

  async function snapshot() {
    if (!window.KYUMOfflineQueue) return { operations: [], conflicts: [], stats: { counts: {}, total: 0, openConflicts: 0 } };
    const [operations, conflicts, stats] = await Promise.all([
      window.KYUMOfflineQueue.list(),
      window.KYUMOfflineQueue.listConflicts({ statuses: ["open"] }),
      window.KYUMOfflineQueue.stats()
    ]);
    return { operations, conflicts, stats };
  }

  function renderMetrics(stats) {
    const counts = stats.counts || {};
    const values = {
      syncPendingCount: (counts.pending || 0) + (counts.retry || 0),
      syncProcessingCount: counts.processing || 0,
      syncFailedCount: counts.failed || 0,
      syncConflictCount: stats.openConflicts || 0,
      syncLastSuccessAt: formatTime(stats.lastSyncedAt)
    };
    Object.entries(values).forEach(([id, value]) => { const node = document.getElementById(id); if (node) node.textContent = value; });
  }

  function renderOperations(rows, conflicts) {
    const body = document.getElementById("syncRecoveryRows");
    if (!body) return;
    const openConflictByOperation = new Map((conflicts || []).map(item => [item.operationId, item]));
    const visible = rows.filter(row => row.status !== "synced").sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    if (!visible.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state">${text(t("syncRecovery.empty"))}</div></td></tr>`;
      return;
    }
    body.innerHTML = visible.map(row => {
      const conflict = openConflictByOperation.get(row.id);
      const policy = replayPolicy(row);
      const expired = policy.managed && policy.expired;
      const actions = !expired && ["failed", "retry", "pending"].includes(row.status)
        ? `<button type="button" class="secondary-btn compact-btn" data-sync-retry="${text(row.id)}">${text(t("syncRecovery.action.retry"))}</button>` : "";
      const resolve = conflict && !expired ? `<button type="button" class="secondary-btn compact-btn" data-sync-resolve="${text(conflict.id)}">${text(t("syncRecovery.action.resolve"))}</button>` : "";
      const manual = expired ? `<button type="button" class="secondary-btn compact-btn" data-sync-manual-review="${text(row.id)}">${text(t("syncRecovery.action.manualReview"))}</button>` : "";
      const discard = row.status !== "processing" ? `<button type="button" class="secondary-btn compact-btn" data-sync-discard="${text(row.id)}">${text(t("syncRecovery.action.discard"))}</button>` : "";
      const stateLabel = expired ? t("syncRecovery.status.replayExpired") : (statusKeys[row.status] ? t(statusKeys[row.status]) : row.status);
      const errorText = expired ? replayExpiredText(policy) : (row.lastError || "—");
      return `<tr><td>${text(entityKeys[row.entity] ? t(entityKeys[row.entity]) : row.entity)}</td><td>${text(actionKeys[row.action] ? t(actionKeys[row.action]) : row.action)}</td><td>${text(stateLabel)}</td><td>${Number(row.attempts || 0)}</td><td>${formatTime(row.updatedAt)}</td><td title="${text(errorText)}">${text(errorText)}</td><td><div class="sync-recovery-row-actions">${actions}${resolve}${manual}${discard}</div></td></tr>`;
    }).join("");
  }

  async function refresh() {
    try {
      const data = await snapshot();
      renderMetrics(data.stats);
      renderOperations(data.operations, data.conflicts);
    } catch (error) {
      setStatus(t("syncRecovery.error.read", { error: error.message || error }), "error");
    }
  }

  async function runAction(action, id) {
    setStatus(t("syncRecovery.status.running"));
    try {
      let result = null;
      if (action === "retry") result = await window.KYUMOfflineQueue.retry(id);
      if (action === "discard") result = await window.KYUMOfflineQueue.discard(id);
      if (action === "resolve") result = await window.KYUMOfflineQueue.resolveConflict(id, "retry");
      if (action === "retryAll") result = await window.KYUMOfflineQueue.retryAll();
      if (action === "manualReview") {
        const row = (await window.KYUMOfflineQueue.list()).find(item => item.id === id);
        const policy = replayPolicy(row);
        setStatus(replayExpiredText(policy) || t("syncRecovery.manual.required"), "info");
        return;
      }
      if (action === "sync") {
        result = await window.KYUMOfflineQueue.process();
        await window.KYUMSyncEngine?.triggerAll?.("manual-recovery-center");
      }
      if (action === "retryAll" && Number(result?.replayBlocked || 0) > 0) {
        setStatus(t("syncRecovery.retryAll.blocked", { count: Number(result.replayBlocked) }), "info");
      } else {
        setStatus(t("syncRecovery.action.success"), "success");
      }
      await refresh();
    } catch (error) {
      if (error?.code === "OFFLINE_REPLAY_HORIZON_EXPIRED" || String(error?.message || "") === "OFFLINE_REPLAY_HORIZON_EXPIRED") {
        setStatus(t("syncRecovery.replay.expiredAction"), "info");
      } else {
        setStatus(t("syncRecovery.error.action", { error: error.message || error }), "error");
      }
    }
  }

  function install() {
    document.getElementById("syncRetryAllBtn")?.addEventListener("click", () => runAction("retryAll"));
    document.getElementById("syncNowBtn")?.addEventListener("click", () => runAction("sync"));
    document.getElementById("syncRecoveryRows")?.addEventListener("click", event => {
      const retry = event.target.closest("[data-sync-retry]");
      const discard = event.target.closest("[data-sync-discard]");
      const resolve = event.target.closest("[data-sync-resolve]");
      const manual = event.target.closest("[data-sync-manual-review]");
      if (retry) runAction("retry", retry.dataset.syncRetry);
      if (discard && confirm(t("syncRecovery.confirm.discard"))) runAction("discard", discard.dataset.syncDiscard);
      if (resolve && confirm(t("syncRecovery.confirm.resolve"))) runAction("resolve", resolve.dataset.syncResolve);
      if (manual) runAction("manualReview", manual.dataset.syncManualReview);
    });
    ["kyum-offline-queue-changed", "kyum-sync-state-changed", "kyum-auth-state-changed", "online", "petatoe-language-changed"].forEach(type => window.addEventListener(type, () => {
      clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150);
    }));
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  window.KYUMSyncRecoveryCenter = Object.freeze({ refresh, snapshot });
})();
