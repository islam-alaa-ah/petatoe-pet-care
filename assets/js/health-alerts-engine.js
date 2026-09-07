// KYUM Phase 14.3 — Health Score & Smart Alerts Engine
// PETATOE R44R20 — display localization only; score/threshold logic is unchanged.
(function () {
  const scoreHistory = [];
  const MAX_HISTORY = 20;

  const WEIGHTS = Object.freeze({
    database: 20,
    security: 15,
    backups: 15,
    performance: 20,
    network: 10,
    users: 10,
    errors: 10
  });

  const t = (key, vars = {}) => window.PetatoeLocalization?.t?.(key, vars) || key;
  const ref = (key, vars = {}) => Object.freeze({ key, vars });
  const resolve = value => value?.key ? t(value.key, value.vars || {}) : String(value ?? "");

  function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, Number(value || 0)));
  }

  function calculateComponentScores(snapshot, performanceSummary) {
    const latency = Number(snapshot?.latency_ms || 0);
    const database = !snapshot?.database_online
      ? 0
      : latency > 2000 ? 30
      : latency > 1200 ? 55
      : latency > 700 ? 75
      : latency > 350 ? 90
      : 100;

    const rlsCoverage = Number(snapshot?.security?.rls_coverage_percent || 0);
    const policies = Number(snapshot?.security?.policies_count || 0);
    const superAdmins = Number(snapshot?.super_admins || 0);
    const security = clamp(
      (rlsCoverage * 0.7)
      + (policies > 0 ? 20 : 0)
      + (superAdmins > 0 ? 10 : 0)
    );

    const failedBackups = Number(snapshot?.failed_backups_24h || 0);
    const recentBackups = Array.isArray(snapshot?.recent_backups)
      ? snapshot.recent_backups
      : [];
    const latestBackup = recentBackups[0] || null;
    const backups = failedBackups > 0
      ? Math.max(20, 80 - failedBackups * 20)
      : latestBackup?.status === "completed"
        ? 100
        : recentBackups.length ? 70 : 60;

    const requestCount = Number(performanceSummary?.requestsTotal || 0);
    const failedRequests = Number(performanceSummary?.failedRequests || 0);
    const avgResponse = Number(performanceSummary?.averageResponseMs || 0);
    const failureRate = requestCount ? failedRequests / requestCount : 0;
    let performance = 100;
    if (avgResponse > 2000) performance -= 45;
    else if (avgResponse > 1000) performance -= 30;
    else if (avgResponse > 600) performance -= 15;
    else if (avgResponse > 350) performance -= 7;
    performance -= Math.min(40, failureRate * 100);
    performance = clamp(performance);

    const network = performanceSummary?.network?.online === false
      ? 0
      : Number(performanceSummary?.network?.rttMs || 0) > 1000
        ? 55
        : Number(performanceSummary?.network?.rttMs || 0) > 500
          ? 75
          : 100;

    const totalUsers = Number(snapshot?.users_total || 0);
    const activeUsers = Number(snapshot?.users_active || 0);
    const inactiveRatio = totalUsers ? (totalUsers - activeUsers) / totalUsers : 0;
    const users = clamp(100 - Math.min(40, inactiveRatio * 50));

    const alerts = Array.isArray(snapshot?.alerts) ? snapshot.alerts : [];
    const criticalAlerts = alerts.filter(item =>
      String(item.severity || "").toLowerCase() === "critical"
    ).length;
    const warningAlerts = alerts.length - criticalAlerts;
    const errors = clamp(100 - criticalAlerts * 35 - warningAlerts * 12);

    return { database, security, backups, performance, network, users, errors };
  }

  function weightedScore(components) {
    const totalWeight = Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0);
    const weighted = Object.entries(WEIGHTS).reduce(
      (sum, [key, weight]) => sum + clamp(components[key]) * weight,
      0
    );
    return Math.round(weighted / totalWeight);
  }

  function levelFromScore(score) {
    const key = score >= 90 ? "healthy" : score >= 75 ? "good" : score >= 60 ? "warning" : "critical";
    const labelKey = `systemHealth.smart.level.${key}`;
    return { key, label: t(labelKey), localization: ref(labelKey) };
  }

  function alertItem(code, severity, titleRef, detailRef) {
    return {
      code,
      severity,
      title: resolve(titleRef),
      detail: resolve(detailRef),
      localization: Object.freeze({ title: titleRef, detail: detailRef })
    };
  }

  function buildAlerts(snapshot, performanceSummary, components) {
    const alerts = [];

    if (!snapshot?.database_online) {
      alerts.push(alertItem("database_offline", "critical", ref("systemHealth.smart.alert.databaseOffline.title"), ref("systemHealth.smart.alert.databaseOffline.detail")));
    } else if (Number(snapshot?.latency_ms || 0) > 1200) {
      alerts.push(alertItem("database_latency_critical", "critical", ref("systemHealth.smart.alert.databaseLatencyCritical.title"), ref("systemHealth.smart.alert.latency.detail", { value: snapshot.latency_ms })));
    } else if (Number(snapshot?.latency_ms || 0) > 700) {
      alerts.push(alertItem("database_latency_warning", "warning", ref("systemHealth.smart.alert.databaseLatencyWarning.title"), ref("systemHealth.smart.alert.latency.detail", { value: snapshot.latency_ms })));
    }

    if (Number(snapshot?.security?.rls_coverage_percent || 0) < 100) {
      alerts.push(alertItem("rls_incomplete", "critical", ref("systemHealth.smart.alert.rlsIncomplete.title"), ref("systemHealth.smart.alert.rlsIncomplete.detail", { value: snapshot.security.rls_coverage_percent })));
    }

    if (Number(snapshot?.failed_backups_24h || 0) > 0) {
      alerts.push(alertItem("backup_failed", "critical", ref("systemHealth.smart.alert.backupFailed.title"), ref("systemHealth.smart.alert.backupFailed.detail", { count: snapshot.failed_backups_24h })));
    }

    const failedRequests = Number(performanceSummary?.failedRequests || 0);
    if (failedRequests > 0) {
      alerts.push(alertItem("api_failed", failedRequests >= 3 ? "critical" : "warning", ref("systemHealth.smart.alert.apiFailed.title"), ref("systemHealth.smart.alert.apiFailed.detail", { count: failedRequests })));
    }

    const avg = Number(performanceSummary?.averageResponseMs || 0);
    if (avg > 1000) {
      alerts.push(alertItem("api_slow_critical", "critical", ref("systemHealth.smart.alert.apiSlowCritical.title"), ref("systemHealth.smart.alert.latency.detail", { value: Math.round(avg) })));
    } else if (avg > 600) {
      alerts.push(alertItem("api_slow_warning", "warning", ref("systemHealth.smart.alert.apiSlowWarning.title"), ref("systemHealth.smart.alert.latency.detail", { value: Math.round(avg) })));
    }

    if (performanceSummary?.network?.online === false) {
      alerts.push(alertItem("network_offline", "critical", ref("systemHealth.smart.alert.networkOffline.title"), ref("systemHealth.smart.alert.networkOffline.detail")));
    }

    if (Number(snapshot?.super_admins || 0) === 0) {
      alerts.push(alertItem("no_super_admin", "critical", ref("systemHealth.smart.alert.noSuperAdmin.title"), ref("systemHealth.smart.alert.noSuperAdmin.detail")));
    }

    if (!alerts.length) {
      alerts.push(alertItem("healthy", "healthy", ref("systemHealth.smart.alert.healthy.title"), ref("systemHealth.smart.alert.healthy.detail")));
    }

    return alerts;
  }

  function buildRecommendations(alerts, components) {
    const recommendationKeys = [];
    const codes = new Set(alerts.map(alert => alert.code));

    if (codes.has("database_offline") || codes.has("database_latency_critical") || codes.has("database_latency_warning")) {
      recommendationKeys.push("systemHealth.smart.recommend.database");
    }
    if (codes.has("rls_incomplete")) recommendationKeys.push("systemHealth.smart.recommend.rls");
    if (codes.has("backup_failed")) recommendationKeys.push("systemHealth.smart.recommend.backup");
    if (codes.has("api_failed") || codes.has("api_slow_critical") || codes.has("api_slow_warning")) recommendationKeys.push("systemHealth.smart.recommend.api");
    if (codes.has("no_super_admin")) recommendationKeys.push("systemHealth.smart.recommend.superAdmin");
    if (components.performance < 75) recommendationKeys.push("systemHealth.smart.recommend.performance");
    if (components.security < 90) recommendationKeys.push("systemHealth.smart.recommend.security");
    if (!recommendationKeys.length) recommendationKeys.push("systemHealth.smart.recommend.none");

    const uniqueRefs = [...new Set(recommendationKeys)].slice(0, 6).map(key => ref(key));
    return {
      values: uniqueRefs.map(resolve),
      refs: uniqueRefs
    };
  }

  function evaluate(snapshot, performanceSummary) {
    const components = calculateComponentScores(snapshot, performanceSummary);
    const score = weightedScore(components);
    const level = levelFromScore(score);
    const alerts = buildAlerts(snapshot, performanceSummary, components);
    const recommendations = buildRecommendations(alerts, components);

    scoreHistory.push({ score, timestamp: Date.now() });
    if (scoreHistory.length > MAX_HISTORY) scoreHistory.splice(0, scoreHistory.length - MAX_HISTORY);

    return {
      score,
      level,
      components,
      alerts,
      recommendations: recommendations.values,
      recommendationLocalization: recommendations.refs,
      history: [...scoreHistory],
      weights: WEIGHTS
    };
  }

  function resetHistory() { scoreHistory.length = 0; }

  window.HealthAlertsEngine = Object.freeze({ evaluate, resetHistory });
})();
