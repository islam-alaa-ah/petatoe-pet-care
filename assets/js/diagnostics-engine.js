// KYUM Phase 14.4 — Enterprise Diagnostics Engine
(function () {
  function result(id, category, title, status, detail, recommendation = "") {
    return { id, category, title, status, detail, recommendation };
  }

  function statusWeight(status) {
    return status === "passed" ? 1 : status === "warning" ? 0.55 : 0;
  }

  function inspect(data) {
    const tests = [];
    const health = data.health?.value || {};
    const tables = Array.isArray(health.tables) ? health.tables : [];

    tests.push(result(
      "database_connection",
      "قاعدة البيانات",
      "اتصال Supabase Database",
      data.health?.ok && health.database_online ? "passed" : "critical",
      data.health?.ok
        ? `زمن الاستجابة ${health.latency_ms ?? data.health.durationMs ?? "—"} ms`
        : data.health?.error || "تعذر تنفيذ Health RPC.",
      "راجع حالة مشروع Supabase وإعدادات الاتصال."
    ));

    const latency = Number(health.latency_ms || data.health?.durationMs || 0);
    tests.push(result(
      "database_latency",
      "قاعدة البيانات",
      "زمن استجابة قاعدة البيانات",
      latency > 1200 ? "critical" : latency > 700 ? "warning" : "passed",
      latency ? `${latency} ms` : "لا توجد قراءة.",
      "راجع الشبكة والاستعلامات البطيئة عند تجاوز 700 ms."
    ));

    const requiredTables = [
      "customers",
      "customer_followups",
      "quotations",
      "sales_representatives",
      "interest_categories",
      "no_sale_reasons",
      "user_profiles",
      "audit_logs",
      "backup_operations",
      "system_settings",
      "app_screens",
      "role_screen_permissions"
    ];

    const availableTables = new Set(tables.map(item => item.table_name || item.name));
    const missingTables = requiredTables.filter(name => !availableTables.has(name));
    tests.push(result(
      "required_tables",
      "قاعدة البيانات",
      "الجداول الأساسية",
      missingTables.length ? "critical" : "passed",
      missingTables.length
        ? `الجداول غير الموجودة في Health Snapshot: ${missingTables.join(", ")}`
        : `تم التحقق من ${requiredTables.length} جدولًا أساسيًا.`,
      "شغّل Migrations المفقودة أو راجع دالة Health Snapshot."
    ));

    const rlsCoverage = Number(health.security?.rls_coverage_percent || 0);
    tests.push(result(
      "rls_coverage",
      "الأمان",
      "تغطية Row Level Security",
      rlsCoverage < 90 ? "critical" : rlsCoverage < 100 ? "warning" : "passed",
      `${rlsCoverage}%`,
      "فعّل RLS وأضف السياسات المناسبة لكل جدول تشغيلي."
    ));

    const policiesCount = Number(health.security?.policies_count || 0);
    tests.push(result(
      "rls_policies",
      "الأمان",
      "سياسات قاعدة البيانات",
      policiesCount <= 0 ? "critical" : policiesCount < 10 ? "warning" : "passed",
      `${policiesCount} سياسة`,
      "راجع السياسات وتأكد من تغطية القراءة والإضافة والتعديل والحذف."
    ));

    tests.push(result(
      "auth_session",
      "المصادقة",
      "جلسة المستخدم",
      data.session?.ok && data.session.value?.hasSession ? "passed" : "critical",
      data.session?.ok
        ? (data.session.value?.hasSession ? "جلسة نشطة." : "لا توجد جلسة.")
        : data.session?.error,
      "سجّل الدخول مجددًا وتحقق من Supabase Auth."
    ));

    tests.push(result(
      "active_profile",
      "المصادقة",
      "ملف المستخدم والدور",
      data.profile?.ok && data.profile.value?.is_active ? "passed" : "critical",
      data.profile?.ok
        ? `الدور: ${data.profile.value?.role || "غير معروف"} — الحالة: ${data.profile.value?.is_active ? "نشط" : "غير نشط"}`
        : data.profile?.error,
      "راجع user_profiles وربط المستخدم بالحساب."
    ));

    if (data.permissions?.ok) {
      const screenCount = data.permissions.value.screens.length;
      const permissionCount = data.permissions.value.permissions.length;
      tests.push(result(
        "permission_coverage",
        "الصلاحيات",
        "تغطية صلاحيات الشاشات",
        permissionCount < screenCount
          ? (data.permissions.value.role === "super_admin" ? "warning" : "critical")
          : "passed",
        `${permissionCount} صلاحية لـ ${screenCount} شاشة — الدور: ${data.permissions.value.role}`,
        "احفظ صلاحيات جميع الشاشات للدور الحالي."
      ));
    } else {
      tests.push(result(
        "permission_coverage",
        "الصلاحيات",
        "تغطية صلاحيات الشاشات",
        "critical",
        data.permissions?.error || "تعذر تحميل الصلاحيات.",
        "راجع app_screens وrole_screen_permissions وسياسات RLS."
      ));
    }

    const functionTests = [
      ["backup_admin", "backup-admin", data.functions?.backupAdmin],
      ["manage_user", "manage-user", data.functions?.manageUser]
    ];

    functionTests.forEach(([id, name, check]) => {
      tests.push(result(
        id,
        "Edge Functions",
        `وظيفة ${name}`,
        check?.ok ? "passed" : "critical",
        check?.ok
          ? `OPTIONS ${check.value?.status} — CORS ${check.value?.allowOrigin || "غير محدد"}`
          : check?.error || "تعذر الوصول.",
        `راجع اسم الـEndpoint ونشر ${name} وإعدادات CORS.`
      ));
    });

    const latestBackup = data.backup?.value;
    if (!data.backup?.ok) {
      tests.push(result(
        "latest_backup",
        "النسخ الاحتياطي",
        "آخر عملية نسخ أو استعادة",
        "critical",
        data.backup?.error || "تعذر قراءة سجل النسخ.",
        "راجع backup_operations والعلاقات والسياسات."
      ));
    } else if (!latestBackup) {
      tests.push(result(
        "latest_backup",
        "النسخ الاحتياطي",
        "آخر عملية نسخ أو استعادة",
        "warning",
        "لا توجد عمليات مسجلة.",
        "أنشئ نسخة احتياطية إنتاجية واختبر التحقق منها."
      ));
    } else {
      tests.push(result(
        "latest_backup",
        "النسخ الاحتياطي",
        "آخر عملية نسخ أو استعادة",
        latestBackup.status === "completed" ? "passed" : "critical",
        `${latestBackup.operation_type} — ${latestBackup.status} — ${latestBackup.total_records || 0} سجل`,
        "راجع تفاصيل آخر عملية فاشلة ثم أنشئ نسخة جديدة."
      ));
    }

    const failedAssets = (data.assets || []).filter(item => !item.ok);
    tests.push(result(
      "frontend_assets",
      "الواجهة",
      "ملفات الواجهة الأساسية",
      failedAssets.length ? "critical" : "passed",
      failedAssets.length
        ? failedAssets.map(item => item.label.replace("asset_", "")).join(", ")
        : `${(data.assets || []).length} ملفات متاحة.`,
      "راجع مسارات GitHub Pages وحالة النشر وCache Busting."
    ));

    tests.push(result(
      "deployment_protocol",
      "الواجهة",
      "بيئة التشغيل",
      data.location?.protocol === "https:" ? "passed" : "warning",
      `${data.location?.protocol || "—"}//${data.location?.host || "—"}`,
      "شغّل النسخة الإنتاجية عبر HTTPS."
    ));

    const performance = data.performance || {};
    const requests = Number(performance.requestsTotal || 0);
    const failed = Number(performance.failedRequests || 0);
    const avg = Number(performance.averageResponseMs || 0);

    tests.push(result(
      "api_failures",
      "الأداء",
      "طلبات API الفاشلة",
      failed >= 3 ? "critical" : failed > 0 ? "warning" : "passed",
      `${failed} من ${requests} طلبات`,
      "راجع قائمة أبطأ الطلبات وResponse Body للطلبات الفاشلة."
    ));

    tests.push(result(
      "api_response_time",
      "الأداء",
      "متوسط استجابة API",
      avg > 1500 ? "critical" : avg > 700 ? "warning" : "passed",
      requests ? `${Math.round(avg)} ms` : "لا توجد قياسات كافية.",
      "راجع الاستعلامات البطيئة وقلّل الطلبات المتكررة."
    ));

    tests.push(result(
      "network_status",
      "الشبكة",
      "اتصال المتصفح",
      data.location?.online ? "passed" : "critical",
      data.location?.online ? "Online" : "Offline",
      "تحقق من اتصال الإنترنت."
    ));

    const passed = tests.filter(item => item.status === "passed").length;
    const warnings = tests.filter(item => item.status === "warning").length;
    const critical = tests.filter(item => item.status === "critical").length;
    const score = Math.round(
      tests.reduce((sum, item) => sum + statusWeight(item.status), 0)
      / Math.max(1, tests.length)
      * 100
    );

    return {
      score,
      level: score >= 90 ? "passed" : score >= 70 ? "warning" : "critical",
      passed,
      warnings,
      critical,
      total: tests.length,
      tests
    };
  }

  async function run() {
    const startedAt = Date.now();
    const data = await window.DiagnosticsService.runDataCollection();
    const evaluation = inspect(data);
    const finishedAt = Date.now();

    return {
      product: "PETATOE",
      report_version: "1.0",
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      environment: location.host || "local",
      evaluation,
      raw: data
    };
  }

  window.DiagnosticsEngine = Object.freeze({ run });
})();