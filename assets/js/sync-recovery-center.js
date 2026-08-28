// KYUM Phase M13.13 — Sync Recovery Center
(function () {
  "use strict";

  const statusLabels = { pending: "معلقة", retry: "بانتظار إعادة المحاولة", processing: "قيد المزامنة", failed: "فشلت", conflict: "تعارض", synced: "تمت" };
  const actionLabels = { create: "إضافة", update: "تعديل", delete: "حذف" };
  const entityLabels = { customers: "العملاء", followups: "المتابعات", quotations: "عروض الأسعار", installation_execution: "تنفيذ المواعيد" };
  let refreshTimer = null;

  function text(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  }

  function formatTime(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
    catch (_) { return "—"; }
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
      body.innerHTML = '<tr><td colspan="7"><div class="empty-state">لا توجد عمليات معلقة أو فاشلة.</div></td></tr>';
      return;
    }
    body.innerHTML = visible.map(row => {
      const conflict = openConflictByOperation.get(row.id);
      const actions = ["failed", "retry", "pending"].includes(row.status)
        ? `<button type="button" class="secondary-btn compact-btn" data-sync-retry="${text(row.id)}">إعادة المحاولة</button>` : "";
      const resolve = conflict ? `<button type="button" class="secondary-btn compact-btn" data-sync-resolve="${text(conflict.id)}">حل التعارض</button>` : "";
      const discard = row.status !== "processing" ? `<button type="button" class="secondary-btn compact-btn" data-sync-discard="${text(row.id)}">تجاهل</button>` : "";
      return `<tr><td>${text(entityLabels[row.entity] || row.entity)}</td><td>${text(actionLabels[row.action] || row.action)}</td><td>${text(statusLabels[row.status] || row.status)}</td><td>${Number(row.attempts || 0)}</td><td>${formatTime(row.updatedAt)}</td><td title="${text(row.lastError || "")}">${text(row.lastError || "—")}</td><td><div class="sync-recovery-row-actions">${actions}${resolve}${discard}</div></td></tr>`;
    }).join("");
  }

  async function refresh() {
    try {
      const data = await snapshot();
      renderMetrics(data.stats);
      renderOperations(data.operations, data.conflicts);
    } catch (error) {
      setStatus(`تعذر قراءة مركز المزامنة: ${error.message || error}`, "error");
    }
  }

  async function runAction(action, id) {
    setStatus("جارٍ تنفيذ الإجراء...");
    try {
      if (action === "retry") await window.KYUMOfflineQueue.retry(id);
      if (action === "discard") await window.KYUMOfflineQueue.discard(id);
      if (action === "resolve") await window.KYUMOfflineQueue.resolveConflict(id, "retry");
      if (action === "retryAll") await window.KYUMOfflineQueue.retryAll();
      if (action === "sync") {
        await window.KYUMOfflineQueue.process();
        await window.KYUMSyncEngine?.triggerAll?.("manual-recovery-center");
      }
      setStatus("تم تنفيذ الإجراء بنجاح.", "success");
      await refresh();
    } catch (error) {
      setStatus(`تعذر تنفيذ الإجراء: ${error.message || error}`, "error");
    }
  }

  function install() {
    document.getElementById("syncRetryAllBtn")?.addEventListener("click", () => runAction("retryAll"));
    document.getElementById("syncNowBtn")?.addEventListener("click", () => runAction("sync"));
    document.getElementById("syncRecoveryRows")?.addEventListener("click", event => {
      const retry = event.target.closest("[data-sync-retry]");
      const discard = event.target.closest("[data-sync-discard]");
      const resolve = event.target.closest("[data-sync-resolve]");
      if (retry) runAction("retry", retry.dataset.syncRetry);
      if (discard && confirm("هل تريد تجاهل هذه العملية نهائيًا؟")) runAction("discard", discard.dataset.syncDiscard);
      if (resolve && confirm("هل تريد إعادة محاولة العملية باستخدام النسخة المحلية؟")) runAction("resolve", resolve.dataset.syncResolve);
    });
    ["kyum-offline-queue-changed", "kyum-sync-state-changed", "kyum-auth-state-changed", "online"].forEach(type => window.addEventListener(type, () => {
      clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150);
    }));
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  window.KYUMSyncRecoveryCenter = Object.freeze({ refresh, snapshot });
})();
