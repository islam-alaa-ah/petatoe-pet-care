// KYUM Phase 14.3 — Health Score & Smart Alerts Engine
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
    if (score >= 90) return { key: "healthy", label: "Healthy", arabic: "سليم" };
    if (score >= 75) return { key: "good", label: "Good", arabic: "جيد" };
    if (score >= 60) return { key: "warning", label: "Warning", arabic: "تحذير" };
    return { key: "critical", label: "Critical", arabic: "حرج" };
  }

  function buildAlerts(snapshot, performanceSummary, components) {
    const alerts = [];

    if (!snapshot?.database_online) {
      alerts.push({
        severity: "critical",
        title: "قاعدة البيانات غير متصلة",
        detail: "تعذر الوصول إلى Supabase Database."
      });
    } else if (Number(snapshot?.latency_ms || 0) > 1200) {
      alerts.push({
        severity: "critical",
        title: "زمن استجابة قاعدة البيانات مرتفع جدًا",
        detail: `${snapshot.latency_ms} ms`
      });
    } else if (Number(snapshot?.latency_ms || 0) > 700) {
      alerts.push({
        severity: "warning",
        title: "زمن استجابة قاعدة البيانات مرتفع",
        detail: `${snapshot.latency_ms} ms`
      });
    }

    if (Number(snapshot?.security?.rls_coverage_percent || 0) < 100) {
      alerts.push({
        severity: "critical",
        title: "تغطية RLS غير مكتملة",
        detail: `${snapshot.security.rls_coverage_percent}% فقط`
      });
    }

    if (Number(snapshot?.failed_backups_24h || 0) > 0) {
      alerts.push({
        severity: "critical",
        title: "فشل عملية نسخ احتياطي",
        detail: `${snapshot.failed_backups_24h} عملية فاشلة خلال 24 ساعة`
      });
    }

    const failedRequests = Number(performanceSummary?.failedRequests || 0);
    if (failedRequests > 0) {
      alerts.push({
        severity: failedRequests >= 3 ? "critical" : "warning",
        title: "طلبات API فاشلة",
        detail: `${failedRequests} طلبات فاشلة في الجلسة الحالية`
      });
    }

    const avg = Number(performanceSummary?.averageResponseMs || 0);
    if (avg > 1000) {
      alerts.push({
        severity: "critical",
        title: "متوسط استجابة API بطيء جدًا",
        detail: `${Math.round(avg)} ms`
      });
    } else if (avg > 600) {
      alerts.push({
        severity: "warning",
        title: "متوسط استجابة API يحتاج متابعة",
        detail: `${Math.round(avg)} ms`
      });
    }

    if (performanceSummary?.network?.online === false) {
      alerts.push({
        severity: "critical",
        title: "المتصفح غير متصل بالإنترنت",
        detail: "العمليات السحابية لن تعمل حتى عودة الاتصال."
      });
    }

    if (Number(snapshot?.super_admins || 0) === 0) {
      alerts.push({
        severity: "critical",
        title: "لا يوجد مدير نظام نشط",
        detail: "يجب وجود Super Admin نشط واحد على الأقل."
      });
    }

    if (!alerts.length) {
      alerts.push({
        severity: "healthy",
        title: "لا توجد مشكلات حرجة",
        detail: "جميع المؤشرات الحالية ضمن النطاق الطبيعي."
      });
    }

    return alerts;
  }

  function buildRecommendations(alerts, components) {
    const recommendations = [];
    const titles = new Set(alerts.map(alert => alert.title));

    if ([...titles].some(title => title.includes("قاعدة البيانات"))) {
      recommendations.push("راجع اتصال Supabase وحالة المشروع وزمن الشبكة.");
    }

    if ([...titles].some(title => title.includes("RLS"))) {
      recommendations.push("راجع الجداول غير المحمية وأضف سياسات RLS المفقودة.");
    }

    if ([...titles].some(title => title.includes("نسخ احتياطي"))) {
      recommendations.push("افتح مركز النسخ الاحتياطي وراجع آخر عملية فاشلة ثم أنشئ نسخة جديدة.");
    }

    if ([...titles].some(title => title.includes("API"))) {
      recommendations.push("افتح قائمة أبطأ الطلبات وحدد الـEndpoint المسؤول عن البطء أو الفشل.");
    }

    if ([...titles].some(title => title.includes("مدير نظام"))) {
      recommendations.push("فعّل حساب Super Admin موثوقًا قبل تنفيذ أي إدارة حساسة.");
    }

    if (components.performance < 75) {
      recommendations.push("قلل الطلبات المتكررة وراجع أبطأ الشاشات والطلبات.");
    }

    if (components.security < 90) {
      recommendations.push("نفّذ فحص أمان شامل للصلاحيات والسياسات.");
    }

    if (!recommendations.length) {
      recommendations.push("لا يوجد إجراء عاجل. استمر في مراقبة النسخ الاحتياطي والأداء دوريًا.");
    }

    return [...new Set(recommendations)].slice(0, 6);
  }

  function evaluate(snapshot, performanceSummary) {
    const components = calculateComponentScores(snapshot, performanceSummary);
    const score = weightedScore(components);
    const level = levelFromScore(score);
    const alerts = buildAlerts(snapshot, performanceSummary, components);
    const recommendations = buildRecommendations(alerts, components);

    scoreHistory.push({
      score,
      timestamp: Date.now()
    });
    if (scoreHistory.length > MAX_HISTORY) {
      scoreHistory.splice(0, scoreHistory.length - MAX_HISTORY);
    }

    return {
      score,
      level,
      components,
      alerts,
      recommendations,
      history: [...scoreHistory],
      weights: WEIGHTS
    };
  }

  function resetHistory() {
    scoreHistory.length = 0;
  }

  window.HealthAlertsEngine = Object.freeze({
    evaluate,
    resetHistory
  });
})();