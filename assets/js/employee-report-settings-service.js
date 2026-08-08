// KYUM Phase M13.22 — Employee targets and report participation management.
(() => {
  "use strict";

  function db() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  function isoDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function canManage() {
    return Boolean(window.CustomerPermissions?.canScreen?.("dailyOperationsSettings", "edit"));
  }

  function normalize(row, user = null) {
    return {
      id: row?.id || null,
      userId: row?.user_id || user?.id || null,
      fullName: user?.full_name || row?.full_name || "مستخدم بدون اسم",
      role: user?.role || row?.role || "",
      representativeId: user?.representative_id || row?.representative_id || null,
      effectiveFrom: row?.effective_from || isoDate(),
      includeInDashboardPerformance: row?.include_in_dashboard_performance !== false,
      includeInDailyReports: row?.include_in_daily_reports !== false,
      includeInTimelineReport: row?.include_in_timeline_report !== false,
      requiresDailyTasks: row?.requires_daily_tasks !== false,
      requiresTargets: row?.requires_targets !== false,
      customersTarget: Math.max(0, Number(row?.customers_target ?? 3)),
      followupsTarget: Math.max(0, Number(row?.followups_target ?? 10)),
      quotationsTarget: Math.max(0, Number(row?.quotations_target ?? 3)),
      isActive: row?.is_active !== false,
      updatedAt: row?.updated_at || null
    };
  }

  async function listForDate(workDate = isoDate(), options = {}) {
    const [{ data: users, error: usersError }, { data: rows, error: rowsError }] = await Promise.all([
      db().from("user_profiles")
        .select("id,full_name,role,is_active,representative_id")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      db().from("daily_employee_report_settings")
        .select("*")
        .lte("effective_from", workDate)
        .order("effective_from", { ascending: false })
    ]);
    if (usersError) throw new Error(`تعذر تحميل الموظفين: ${usersError.message}`);
    if (rowsError) {
      if (String(rowsError.message || "").includes("daily_employee_report_settings")) {
        return (users || []).map(user => normalize(null, user));
      }
      throw new Error(`تعذر تحميل إعدادات التقارير: ${rowsError.message}`);
    }
    const latest = new Map();
    (rows || []).forEach(row => { if (!latest.has(row.user_id)) latest.set(row.user_id, row); });
    return (users || []).map(user => normalize(latest.get(user.id), user));
  }

  async function save(settings) {
    if (!canManage()) throw new Error("لا توجد صلاحية لتعديل أهداف وتقارير الموظفين.");
    const auth = window.CustomerAuth?.getState?.();
    const payload = {
      user_id: settings.userId,
      effective_from: settings.effectiveFrom || isoDate(),
      include_in_dashboard_performance: settings.includeInDashboardPerformance !== false,
      include_in_daily_reports: settings.includeInDailyReports !== false,
      include_in_timeline_report: settings.includeInTimelineReport !== false,
      requires_daily_tasks: settings.requiresDailyTasks !== false,
      requires_targets: settings.requiresTargets !== false,
      customers_target: Math.max(0, Number(settings.customersTarget || 0)),
      followups_target: Math.max(0, Number(settings.followupsTarget || 0)),
      quotations_target: Math.max(0, Number(settings.quotationsTarget || 0)),
      is_active: settings.isActive !== false,
      updated_by: auth?.user?.id || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await db().from("daily_employee_report_settings")
      .upsert(payload, { onConflict: "user_id,effective_from" })
      .select("*").single();
    if (error) throw new Error(`تعذر حفظ إعدادات الموظف: ${error.message}`);
    window.KYUMCacheDependencyEngine?.invalidate?.("daily_operation_targets", { workDate: payload.effective_from });
    return normalize(data);
  }

  async function saveMany(items) {
    const results = [];
    for (const item of items) results.push(await save(item));
    return results;
  }

  window.EmployeeReportSettingsService = Object.freeze({ isoDate, listForDate, save, saveMany, canManage });
})();
