// KYUM Phase M13.17 — Enterprise Cache Dependency Engine
(function () {
  "use strict";

  const DEPENDENCIES = Object.freeze({
    customers: ["daily-performance:", "daily-activity:", "daily-suggestions:", "daily-suggestions-team:", "daily-alerts:"],
    followups: ["daily-performance:", "daily-activity:", "daily-suggestions:", "daily-suggestions-team:", "daily-alerts:"],
    quotations: ["daily-performance:", "daily-activity:", "daily-alerts:"],
    daily_task_completions: ["daily-performance:", "daily-activity:"],
    daily_operation_targets: ["daily-performance:"],
    daily_manager_notes: ["daily-performance:", "daily-activity:"],
    daily_alerts: ["daily-alerts:", "daily-activity:"],
    daily_customer_suggestions: ["daily-suggestions:", "daily-suggestions-team:", "daily-activity:"]
  });

  function normalizeDate(value) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  function resolvePrefixes(entity, context = {}) {
    const base = DEPENDENCIES[entity] || [];
    const date = normalizeDate(context.workDate || context.date || context.contactDate || context.quotationDate || context.createdDate);
    return [...new Set(base.map(prefix => date ? `${prefix}${date}` : prefix))];
  }

  async function invalidate(entity, context = {}) {
    const prefixes = resolvePrefixes(entity, context);
    if (!prefixes.length) return { entity, prefixes: [], invalidated: 0 };

    const results = await Promise.allSettled(prefixes.map(prefix =>
      window.KYUMOfflineReadCache?.invalidate?.(prefix)
    ));
    const invalidated = results.filter(result => result.status === "fulfilled").length;
    const detail = {
      entity,
      action: context.action || "write",
      workDate: normalizeDate(context.workDate || context.date || context.contactDate || context.quotationDate || context.createdDate) || null,
      prefixes,
      invalidated,
      source: context.source || "cache-dependency-engine",
      updatedAt: Date.now()
    };
    window.dispatchEvent(new CustomEvent("kyum-cache-dependencies-invalidated", { detail }));
    return detail;
  }

  function dependencies() {
    return JSON.parse(JSON.stringify(DEPENDENCIES));
  }

  window.KYUMCacheDependencyEngine = Object.freeze({ invalidate, dependencies, resolvePrefixes });
})();
