// KYUM Phase 16.4 — Expanded Daily Performance Analytics
(function () {
  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  function localDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  }

  async function loadTaskDefinitions() {
    const { data, error } = await client()
      .from("daily_task_definitions")
      .select("task_key,task_name,description,display_order,permission_key,is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw new Error(`تعذر تحميل تعريفات المهام: ${error.message}`);
    return data || [];
  }

  async function loadTaskCompletions(workDate) {
    const { data, error } = await client()
      .from("daily_task_completions")
      .select(`
        id, task_key, work_date, user_id, representative_id,
        is_completed, completed_at, updated_at,
        user_profile:user_profiles!daily_task_completions_user_profile_fkey(full_name, role, is_active),
        representative:sales_representatives(id, full_name, representative_code, is_active)
      `)
      .eq("work_date", workDate);

    if (error) throw new Error(`تعذر تحميل تنفيذ المهام: ${error.message}`);
    return data || [];
  }

  async function loadTargets(workDate) {
    const { data, error } = await client()
      .from("daily_operation_targets")
      .select("work_date,customers_target,followups_target,quotations_target,updated_at")
      .eq("work_date", workDate)
      .maybeSingle();

    if (error) throw new Error(`تعذر تحميل أهداف اليوم: ${error.message}`);

    return data || {
      work_date: workDate,
      customers_target: 3,
      followups_target: 10,
      quotations_target: 3,
      updated_at: null
    };
  }

  async function loadManagerNote(workDate) {
    const { data, error } = await client()
      .from("daily_manager_notes")
      .select("work_date,title,note_text,created_by,audience_scope,recipient_user_ids,updated_at")
      .eq("work_date", workDate)
      .maybeSingle();

    if (error) throw new Error(`تعذر تحميل ملاحظة المدير: ${error.message}`);
    return data || null;
  }

  async function loadRepresentatives() {
    const { data, error } = await client()
      .from("sales_representatives")
      .select("id, representative_code, full_name, is_active")
      .order("full_name", { ascending: true });

    if (error) throw new Error(`تعذر تحميل المندوبين: ${error.message}`);
    return data || [];
  }

  async function loadUsers() {
    const { data, error } = await client()
      .from("user_profiles")
      .select("id, full_name, role, is_active, representative_id")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) throw new Error(`تعذر تحميل المستخدمين: ${error.message}`);
    return data || [];
  }

  async function loadEmployeeSettings(workDate) {
    if (!window.EmployeeReportSettingsService?.listForDate) return [];
    return window.EmployeeReportSettingsService.listForDate(workDate);
  }

  function sameDate(value, date) {
    return localDate(value) === date;
  }

  function assignedTo(row, employee) {
    return Boolean(
      (employee.representativeId && row.representativeId === employee.representativeId)
      || (employee.representativeName && row.representative === employee.representativeName)
      || (employee.userId && row.createdBy === employee.userId)
    );
  }

  function buildEmployees(users, representatives) {
    const repById = new Map(representatives.map(rep => [rep.id, rep]));
    const employees = [];
    const usedRepresentativeIds = new Set();

    users.forEach(user => {
      const rep = user.representative_id
        ? repById.get(user.representative_id)
        : null;

      if (rep?.id) usedRepresentativeIds.add(rep.id);

      employees.push({
        key: `user:${user.id}`,
        userId: user.id,
        representativeId: rep?.id || user.representative_id || null,
        representativeName: rep?.full_name || "",
        name: user.full_name || rep?.full_name || "مستخدم بدون اسم",
        code: rep?.representative_code || "",
        role: user.role || "",
        active: user.is_active !== false
      });
    });

    representatives.forEach(rep => {
      if (usedRepresentativeIds.has(rep.id)) return;
      employees.push({
        key: `rep:${rep.id}`,
        userId: null,
        representativeId: rep.id,
        representativeName: rep.full_name || "",
        name: rep.full_name || "مندوب بدون اسم",
        code: rep.representative_code || "",
        role: "sales_representative",
        active: rep.is_active !== false
      });
    });

    return employees.filter(item => item.active);
  }

  function targetAchievement(actual, target) {
    const safeTarget = Math.max(0, Number(target || 0));
    if (!safeTarget) return actual > 0 ? 100 : 0;
    return Math.min(100, Math.round(Number(actual || 0) / safeTarget * 100));
  }

  function buildReport({
    workDate,
    definitions,
    taskCompletions,
    targets,
    managerNote,
    users,
    representatives,
    employeeSettings,
    customers,
    followups,
    quotations
  }) {
    const settingsByUser = new Map((employeeSettings || []).map(item => [item.userId, item]));
    const employees = buildEmployees(users, representatives)
      .map(employee => ({ ...employee, reportSettings: settingsByUser.get(employee.userId) || null }))
      .filter(employee => employee.reportSettings?.isActive !== false && employee.reportSettings?.includeInDailyReports !== false);

    const rows = employees.map(employee => {
      const requiresDailyTasks = employee.reportSettings?.requiresDailyTasks !== false;
      const requiresTargets = employee.reportSettings?.requiresTargets !== false;
      const employeeTargets = {
        customers: Number(employee.reportSettings?.customersTarget ?? targets.customers_target ?? 0),
        followups: Number(employee.reportSettings?.followupsTarget ?? targets.followups_target ?? 0),
        quotations: Number(employee.reportSettings?.quotationsTarget ?? targets.quotations_target ?? 0)
      };
      const taskStates = (requiresDailyTasks ? definitions : []).map(definition => {
        const completion = taskCompletions.find(item =>
          item.task_key === definition.task_key
          && (
            (employee.userId && item.user_id === employee.userId)
            || (
              employee.representativeId
              && item.representative_id === employee.representativeId
            )
          )
        );

        return {
          taskKey: definition.task_key,
          taskName: definition.task_name,
          completed: Boolean(completion?.is_completed),
          completedAt: completion?.completed_at || null
        };
      });

      const employeeCustomers = customers.filter(item =>
        sameDate(item.createdAt || item.contactDate, workDate)
        && assignedTo(item, employee)
      );

      const employeeFollowups = followups.filter(item =>
        sameDate(item.contactDate || item.createdAt, workDate)
        && assignedTo(item, employee)
      );

      const employeeQuotations = quotations.filter(item =>
        sameDate(item.quotationDate || item.createdAt, workDate)
        && assignedTo(item, employee)
      );

      const overdueFollowups = followups.filter(item =>
        item.nextFollowupDate
        && localDate(item.nextFollowupDate) < workDate
        && !item.completed
        && assignedTo(item, employee)
      );

      const completedTasks = taskStates.filter(item => item.completed).length;
      const checklistRate = taskStates.length
        ? Math.round(completedTasks / taskStates.length * 100)
        : 0;

      const customerTargetRate = targetAchievement(
        employeeCustomers.length,
        employeeTargets.customers
      );
      const followupTargetRate = targetAchievement(
        employeeFollowups.length,
        employeeTargets.followups
      );
      const quotationTargetRate = targetAchievement(
        employeeQuotations.length,
        employeeTargets.quotations
      );

      const taskPoints = completedTasks * 10;
      const activityPoints =
        employeeCustomers.length * 10
        + employeeFollowups.length * 5
        + employeeQuotations.length * 15;

      const targetBonus =
        (customerTargetRate >= 100 ? 10 : 0)
        + (followupTargetRate >= 100 ? 10 : 0)
        + (quotationTargetRate >= 100 ? 10 : 0);

      const overduePenalty = Math.min(30, overdueFollowups.length * 3);
      const points = Math.max(
        0,
        taskPoints + activityPoints + targetBonus - overduePenalty
      );

      const completionRate = requiresTargets
        ? Math.round(checklistRate * 0.4 + customerTargetRate * 0.2 + followupTargetRate * 0.2 + quotationTargetRate * 0.2)
        : checklistRate;

      return {
        ...employee,
        taskStates,
        completedTasks,
        checklistRate,
        customers: employeeCustomers,
        followups: employeeFollowups,
        quotations: employeeQuotations,
        overdueFollowups,
        reportSettings: employee.reportSettings,
        requiresDailyTasks,
        requiresTargets,
        targets: employeeTargets,
        targetRates: {
          customers: customerTargetRate,
          followups: followupTargetRate,
          quotations: quotationTargetRate
        },
        targetsMet: {
          customers: requiresTargets && customerTargetRate >= 100,
          followups: requiresTargets && followupTargetRate >= 100,
          quotations: requiresTargets && quotationTargetRate >= 100
        },
        points,
        completionRate
      };
    })
      .sort((a, b) =>
        b.points - a.points
        || b.completionRate - a.completionRate
        || a.name.localeCompare(b.name, "ar")
      )
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const totalTaskSlots = rows.length * definitions.length;
    const totalCompletedTasks = rows.reduce(
      (sum, item) => sum + item.completedTasks,
      0
    );

    return {
      workDate,
      definitions,
      targets: {
        customers: Number(targets.customers_target || 0),
        followups: Number(targets.followups_target || 0),
        quotations: Number(targets.quotations_target || 0)
      },
      managerNote: managerNote ? {
        title: managerNote.title || "",
        noteText: managerNote.note_text || "",
        createdBy: managerNote.created_by || null,
        audienceScope: managerNote.audience_scope || "all",
        recipientUserIds: Array.isArray(managerNote.recipient_user_ids) ? managerNote.recipient_user_ids : [],
        updatedAt: managerNote.updated_at || null
      } : null,
      rows,
      totals: {
        employees: rows.length,
        completedTasks: totalCompletedTasks,
        totalTaskSlots,
        checklistRate: totalTaskSlots
          ? Math.round(totalCompletedTasks / totalTaskSlots * 100)
          : 0,
        targetEmployees: rows.filter(item => item.requiresTargets).length,
        customersTargetMet: rows.filter(item => item.targetsMet.customers).length,
        followupsTargetMet: rows.filter(item => item.targetsMet.followups).length,
        quotationsTargetMet: rows.filter(item => item.targetsMet.quotations).length,
        overdue: rows.reduce(
          (sum, item) => sum + item.overdueFollowups.length,
          0
        )
      },
      generatedAt: new Date().toISOString()
    };
  }

  async function loadReportOnline(workDate, existingData) {
    const [
      definitions,
      taskCompletions,
      targets,
      managerNote,
      representatives,
      users,
      employeeSettings
    ] = await Promise.all([
      loadTaskDefinitions(),
      loadTaskCompletions(workDate),
      loadTargets(workDate),
      loadManagerNote(workDate),
      loadRepresentatives(),
      loadUsers(),
      loadEmployeeSettings(workDate)
    ]);

    return buildReport({
      workDate,
      definitions,
      taskCompletions,
      targets,
      managerNote,
      users,
      representatives,
      employeeSettings,
      customers: existingData.customers || [],
      followups: existingData.followups || [],
      quotations: existingData.quotations || []
    });
  }

  async function loadReport(workDate, existingData, options = {}) {
    if (!window.KYUMOfflineReadCache) return loadReportOnline(workDate, existingData);
    return window.KYUMOfflineReadCache.read(
      `daily-performance:${workDate}`,
      () => loadReportOnline(workDate, existingData),
      options
    );
  }

  function toCsv(report) {
    const taskHeaders = report.definitions.map(item => item.task_name);

    const lines = [
      ["KYUM Expanded Daily Performance Report", report.workDate],
      ["Generated At", report.generatedAt],
      ["Manager Note", report.managerNote?.title || "", report.managerNote?.noteText || ""],
      [],
      [
        "Rank",
        "Employee",
        "Code",
        ...taskHeaders,
        "Checklist %",
        "New Customers",
        "Customer Target %",
        "Follow-ups",
        "Follow-up Target %",
        "Quotations",
        "Quotation Target %",
        "Overdue",
        "Completion %",
        "Points"
      ],
      ...report.rows.map(item => [
        item.rank,
        item.name,
        item.code,
        ...item.taskStates.map(task => task.completed ? "Completed" : "Not Completed"),
        item.checklistRate,
        item.customers.length,
        item.targetRates.customers,
        item.followups.length,
        item.targetRates.followups,
        item.quotations.length,
        item.targetRates.quotations,
        item.overdueFollowups.length,
        item.completionRate,
        item.points
      ])
    ];

    return "\ufeff" + lines.map(row =>
      row.map(value =>
        `"${String(value ?? "").replaceAll('"', '""')}"`
      ).join(",")
    ).join("\n");
  }

  window.DailyPerformanceService = Object.freeze({
    localDate,
    loadReport,
    toCsv
  });
})();