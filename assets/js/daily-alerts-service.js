// KYUM Phase 16.5 — Daily Alerts Service
(function () {
  // Offline reads are persisted by KYUMOfflineReadCache on top of KYUMSmartCache.
  const syncCache = new Map();
  const syncInFlight = new Map();
  const SYNC_TTL_MS = 60 * 1000;

  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  function todayIso() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  }

  async function listOnline(workDate = todayIso()) {
    const { data, error } = await client()
      .from("daily_alerts")
      .select(`
        id, work_date, alert_type, severity, status, title, details,
        user_id, representative_id, source_key, created_at, updated_at,
        resolved_at, escalated_at, supervisor_note,
        user_profile:user_profiles!daily_alerts_user_profile_fkey(full_name,role),
        representative:sales_representatives(full_name,representative_code)
      `)
      .eq("work_date", workDate)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`تعذر تحميل التنبيهات: ${error.message}`);
    return data || [];
  }

  async function list(workDate = todayIso(), options = {}) {
    if (!window.KYUMOfflineReadCache) return listOnline(workDate);
    return window.KYUMOfflineReadCache.read(`daily-alerts:${workDate}`, () => listOnline(workDate), options);
  }

  async function sync(workDate = todayIso(), options = {}) {
    const dateKey = String(workDate || todayIso());
    const force = Boolean(options?.force);
    const cached = syncCache.get(dateKey);

    if (!force && cached && (Date.now() - cached.timestamp) < SYNC_TTL_MS) {
      return cached.data;
    }

    if (syncInFlight.has(dateKey)) {
      return syncInFlight.get(dateKey);
    }

    const request = (async () => {
      const { data, error } = await client().rpc(
        "sync_daily_operational_alerts",
        { p_work_date: dateKey }
      );

      if (error) {
        throw new Error(`تعذر مزامنة التنبيهات: ${error.message}`);
      }

      syncCache.set(dateKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    })();

    syncInFlight.set(dateKey, request);

    try {
      return await request;
    } finally {
      syncInFlight.delete(dateKey);
    }
  }

  async function act(alertId, actionType, note = "") {
    const auth = window.CustomerAuth?.getState?.();
    const userId = auth?.user?.id;
    if (!userId) throw new Error("تعذر تحديد المستخدم الحالي.");

    const mapping = {
      start: "in_progress",
      escalate: "escalated",
      close: "closed",
      reopen: "open"
    };
    const nextStatus = mapping[actionType];
    if (!nextStatus) throw new Error("نوع الإجراء غير مدعوم.");

    const patch = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      supervisor_note: note || null
    };
    if (actionType === "escalate") patch.escalated_at = new Date().toISOString();
    if (actionType === "close") patch.resolved_at = new Date().toISOString();
    if (actionType === "reopen") {
      patch.resolved_at = null;
      patch.escalated_at = null;
    }

    const { data, error } = await client()
      .from("daily_alerts")
      .update(patch)
      .eq("id", alertId)
      .select("*")
      .single();

    if (error) throw new Error(`تعذر تحديث التنبيه: ${error.message}`);

    const { error: actionError } = await client()
      .from("daily_alert_actions")
      .insert({
        alert_id: alertId,
        action_type: actionType,
        note: note || null,
        action_by: userId
      });

    if (actionError) {
      console.warn("Alert action history failed:", actionError);
    }

    await window.KYUMCacheDependencyEngine?.invalidate?.("daily_alerts", { workDate: data?.work_date, action: actionType, source: "daily-alerts-service" });
    return data;
  }

  window.DailyAlertsService = Object.freeze({
    todayIso,
    list,
    sync,
    act
  });
})();