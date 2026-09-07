// PETATOE R44R20 — Enterprise Diagnostics Engine localization completion
(function () {
  "use strict";

  const t = (key, vars = {}) => window.PetatoeLocalization?.t?.(key, vars) || key;
  const ref = (key, vars = {}) => Object.freeze({ key, vars });
  const resolve = value => value?.key ? t(value.key, value.vars || {}) : String(value ?? "");

  function result(id, categoryRef, titleRef, status, detailRef, recommendationRef = null) {
    return {
      id,
      category: resolve(categoryRef),
      title: resolve(titleRef),
      status,
      detail: resolve(detailRef),
      recommendation: recommendationRef ? resolve(recommendationRef) : "",
      localization: Object.freeze({ category: categoryRef, title: titleRef, detail: detailRef?.key ? detailRef : null, recommendation: recommendationRef?.key ? recommendationRef : null })
    };
  }

  function statusWeight(status) { return status === "passed" ? 1 : status === "warning" ? 0.55 : 0; }

  function inspect(data) {
    const tests = [];
    const health = data.health?.value || {};
    const tables = Array.isArray(health.tables) ? health.tables : [];

    tests.push(result("database_connection", ref("diagnostics.category.database"), ref("diagnostics.test.databaseConnection"), data.health?.ok && health.database_online ? "passed" : "critical", data.health?.ok ? ref("diagnostics.detail.latency", { value: health.latency_ms ?? data.health.durationMs ?? "—" }) : (data.health?.error || ref("diagnostics.error.healthRpc")), ref("diagnostics.recommend.databaseConnection")));

    const latency = Number(health.latency_ms || data.health?.durationMs || 0);
    tests.push(result("database_latency", ref("diagnostics.category.database"), ref("diagnostics.test.databaseLatency"), latency > 1200 ? "critical" : latency > 700 ? "warning" : "passed", latency ? `${latency} ms` : ref("diagnostics.detail.noReading"), ref("diagnostics.recommend.databaseLatency")));

    const requiredTables = ["customers","customer_followups","quotations","sales_representatives","interest_categories","no_sale_reasons","user_profiles","audit_logs","backup_operations","system_settings","app_screens","role_screen_permissions"];
    const availableTables = new Set(tables.map(item => item.table_name || item.name));
    const missingTables = requiredTables.filter(name => !availableTables.has(name));
    tests.push(result("required_tables", ref("diagnostics.category.database"), ref("diagnostics.test.requiredTables"), missingTables.length ? "critical" : "passed", missingTables.length ? ref("diagnostics.detail.missingTables", { tables: missingTables.join(", ") }) : ref("diagnostics.detail.tablesVerified", { count: requiredTables.length }), ref("diagnostics.recommend.requiredTables")));

    const rlsCoverage = Number(health.security?.rls_coverage_percent || 0);
    tests.push(result("rls_coverage", ref("diagnostics.category.security"), ref("diagnostics.test.rlsCoverage"), rlsCoverage < 90 ? "critical" : rlsCoverage < 100 ? "warning" : "passed", `${rlsCoverage}%`, ref("diagnostics.recommend.rlsCoverage")));

    const policiesCount = Number(health.security?.policies_count || 0);
    tests.push(result("rls_policies", ref("diagnostics.category.security"), ref("diagnostics.test.rlsPolicies"), policiesCount <= 0 ? "critical" : policiesCount < 10 ? "warning" : "passed", ref("diagnostics.detail.policyCount", { count: policiesCount }), ref("diagnostics.recommend.rlsPolicies")));

    tests.push(result("auth_session", ref("diagnostics.category.auth"), ref("diagnostics.test.authSession"), data.session?.ok && data.session.value?.hasSession ? "passed" : "critical", data.session?.ok ? ref(data.session.value?.hasSession ? "diagnostics.detail.sessionActive" : "diagnostics.detail.noSession") : (data.session?.error || ref("diagnostics.detail.noSession")), ref("diagnostics.recommend.authSession")));

    tests.push(result("active_profile", ref("diagnostics.category.auth"), ref("diagnostics.test.activeProfile"), data.profile?.ok && data.profile.value?.is_active ? "passed" : "critical", data.profile?.ok ? ref("diagnostics.detail.profile", { role: data.profile.value?.role || t("diagnostics.common.unspecified"), status: t(data.profile.value?.is_active ? "users.status.active" : "users.status.inactive") }) : (data.profile?.error || ref("diagnostics.error.profileMissing")), ref("diagnostics.recommend.activeProfile")));

    if (data.permissions?.ok) {
      const screenCount = data.permissions.value.screens.length;
      const permissionCount = data.permissions.value.permissions.length;
      tests.push(result("permission_coverage", ref("diagnostics.category.permissions"), ref("diagnostics.test.permissionCoverage"), permissionCount < screenCount ? (data.permissions.value.role === "super_admin" ? "warning" : "critical") : "passed", ref("diagnostics.detail.permissions", { permissions: permissionCount, screens: screenCount, role: data.permissions.value.role }), ref("diagnostics.recommend.permissions")));
    } else {
      tests.push(result("permission_coverage", ref("diagnostics.category.permissions"), ref("diagnostics.test.permissionCoverage"), "critical", data.permissions?.error || ref("diagnostics.error.permissions"), ref("diagnostics.recommend.permissionsError")));
    }

    [["backup_admin","backup-admin",data.functions?.backupAdmin],["manage_user","manage-user",data.functions?.manageUser]].forEach(([id,name,check]) => {
      tests.push(result(id, ref("diagnostics.category.functions"), ref("diagnostics.test.edgeFunction", { name }), check?.ok ? "passed" : "critical", check?.ok ? ref("diagnostics.detail.functionOptions", { status: check.value?.status, cors: check.value?.allowOrigin || t("diagnostics.common.unspecified") }) : (check?.error || ref("diagnostics.error.unreachable")), ref("diagnostics.recommend.edgeFunction", { name })));
    });

    const latestBackup = data.backup?.value;
    if (!data.backup?.ok) tests.push(result("latest_backup", ref("diagnostics.category.backups"), ref("diagnostics.test.latestBackup"), "critical", data.backup?.error || ref("diagnostics.error.backupRead"), ref("diagnostics.recommend.backupRead")));
    else if (!latestBackup) tests.push(result("latest_backup", ref("diagnostics.category.backups"), ref("diagnostics.test.latestBackup"), "warning", ref("diagnostics.detail.noBackup"), ref("diagnostics.recommend.noBackup")));
    else tests.push(result("latest_backup", ref("diagnostics.category.backups"), ref("diagnostics.test.latestBackup"), latestBackup.status === "completed" ? "passed" : "critical", ref("diagnostics.detail.backup", { operation: t(latestBackup.operation_type === "restore" ? "backups.operation.restore" : "backups.operation.export"), status: t(latestBackup.status === "completed" ? "backups.status.completed" : "backups.status.failed"), count: latestBackup.total_records || 0 }), ref("diagnostics.recommend.backupFailed")));

    const failedAssets = (data.assets || []).filter(item => !item.ok);
    tests.push(result("frontend_assets", ref("diagnostics.category.frontend"), ref("diagnostics.test.frontendAssets"), failedAssets.length ? "critical" : "passed", failedAssets.length ? failedAssets.map(item => item.label.replace("asset_", "")).join(", ") : ref("diagnostics.detail.assetsAvailable", { count: (data.assets || []).length }), ref("diagnostics.recommend.frontendAssets")));
    tests.push(result("deployment_protocol", ref("diagnostics.category.frontend"), ref("diagnostics.test.deploymentProtocol"), data.location?.protocol === "https:" ? "passed" : "warning", `${data.location?.protocol || "—"}//${data.location?.host || "—"}`, ref("diagnostics.recommend.deploymentProtocol")));

    const performance = data.performance || {};
    const requests = Number(performance.requestsTotal || 0);
    const failed = Number(performance.failedRequests || 0);
    const avg = Number(performance.averageResponseMs || 0);
    tests.push(result("api_failures", ref("diagnostics.category.performance"), ref("diagnostics.test.apiFailures"), failed >= 3 ? "critical" : failed > 0 ? "warning" : "passed", ref("diagnostics.detail.failedRequests", { failed, total: requests }), ref("diagnostics.recommend.apiFailures")));
    tests.push(result("api_response_time", ref("diagnostics.category.performance"), ref("diagnostics.test.apiResponseTime"), avg > 1500 ? "critical" : avg > 700 ? "warning" : "passed", requests ? `${Math.round(avg)} ms` : ref("diagnostics.detail.insufficientMetrics"), ref("diagnostics.recommend.apiResponseTime")));
    tests.push(result("network_status", ref("diagnostics.category.network"), ref("diagnostics.test.networkStatus"), data.location?.online ? "passed" : "critical", data.location?.online ? t("performance.network.online") : t("performance.network.offline"), ref("diagnostics.recommend.networkStatus")));

    const passed = tests.filter(item => item.status === "passed").length;
    const warnings = tests.filter(item => item.status === "warning").length;
    const critical = tests.filter(item => item.status === "critical").length;
    const score = Math.round(tests.reduce((sum,item)=>sum+statusWeight(item.status),0)/Math.max(1,tests.length)*100);
    return { score, level: score >= 90 ? "passed" : score >= 70 ? "warning" : "critical", passed, warnings, critical, total: tests.length, tests };
  }

  async function run() {
    const startedAt = Date.now();
    const data = await window.DiagnosticsService.runDataCollection();
    const evaluation = inspect(data);
    const finishedAt = Date.now();
    return { product:"PETATOE", report_version:"1.0", started_at:new Date(startedAt).toISOString(), finished_at:new Date(finishedAt).toISOString(), duration_ms:finishedAt-startedAt, environment:location.host||"local", evaluation, raw:data };
  }

  window.DiagnosticsEngine = Object.freeze({ run });
})();
