// Phase M10.6.2 — persisted daily customer suggestions service.
(function () {
  // Offline reads are persisted by KYUMOfflineReadCache on top of KYUMSmartCache.
  function client() {
    return window.customerSupabase || null;
  }

  function currentUserId() {
    return window.CustomerAuth?.getState?.().user?.id || null;
  }

  async function resolveAuthenticatedUserId(explicitUserId = null) {
    if (explicitUserId) return explicitUserId;
    const cached = currentUserId();
    if (cached) return cached;

    const supabase = client();
    if (!supabase) return null;

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id) return sessionData.session.user.id;

    // Authentication and page rendering can complete in different ticks.
    await new Promise(resolve => setTimeout(resolve, 150));
    const { data: retryData } = await supabase.auth.getSession();
    return retryData?.session?.user?.id || currentUserId();
  }

  function riyadhDate() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  async function loadOnline(options = {}) {
    const supabase = client();
    const suggestionDate = options.date || riyadhDate();

    if (!supabase) throw new Error("Supabase client is not available.");
    const userId = await resolveAuthenticatedUserId(options.userId || null);
    if (!userId) throw new Error("Authenticated user is required.");

    const { data: activeRows, error: activeError } = await supabase.rpc(
      "get_daily_customer_suggestions",
      { p_suggestion_date: suggestionDate, p_user_id: userId }
    );
    if (activeError) throw activeError;

    const { data: statusRows, error: statusError } = await supabase
      .from("daily_customer_suggestions")
      .select("status")
      .eq("user_id", userId)
      .eq("suggestion_date", suggestionDate);
    if (statusError) throw statusError;
    const progress = { active: 0, completed: 0, total: 0 };
    (statusRows || []).forEach(row => {
      if (row.status === "completed") progress.completed += 1;
      if (row.status === "active") progress.active += 1;
      progress.total += 1;
    });
    return { date: suggestionDate, rows: Array.isArray(activeRows) ? activeRows : [], progress };
  }

  async function load(options = {}) {
    const suggestionDate = options.date || riyadhDate();
    const userId = await resolveAuthenticatedUserId(options.userId || null);
    if (!userId) throw new Error("Authenticated user is required.");
    if (!window.KYUMOfflineReadCache) return loadOnline({ ...options, userId, date: suggestionDate });
    return window.KYUMOfflineReadCache.read(
      `daily-suggestions:${suggestionDate}:${userId}`,
      () => loadOnline({ ...options, userId, date: suggestionDate }),
      options
    );
  }

  async function loadTeamSummaryOnline(options = {}) {
    const supabase = client();
    const suggestionDate = options.date || riyadhDate();

    if (!supabase) throw new Error("Supabase client is not available.");

    const { data, error } = await supabase.rpc(
      "get_daily_customer_suggestions_team_summary",
      { p_suggestion_date: suggestionDate }
    );
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadTeamSummary(options = {}) {
    const suggestionDate = options.date || riyadhDate();
    if (!window.KYUMOfflineReadCache) return loadTeamSummaryOnline(options);
    return window.KYUMOfflineReadCache.read(
      `daily-suggestions-team:${suggestionDate}`,
      () => loadTeamSummaryOnline({ ...options, date: suggestionDate }),
      options
    );
  }

  async function complete(options = {}) {
    const supabase = client();
    const suggestionId = options.suggestionId;
    const followupId = options.followupId;

    if (!supabase) throw new Error("Supabase client is not available.");
    if (!suggestionId) throw new Error("Suggestion id is required.");
    if (!followupId) throw new Error("Follow-up id is required.");

    const { data, error } = await supabase.rpc(
      "complete_daily_customer_suggestion",
      { p_suggestion_id: suggestionId, p_followup_id: followupId }
    );
    if (error) throw error;
    await window.KYUMCacheDependencyEngine?.invalidate?.("daily_customer_suggestions", { date: options.date || riyadhDate(), action: "complete", source: "daily-suggestions-service" });
    return Number(data || 0);
  }

  async function completeForCustomer(options = {}) {
    const supabase = client();
    const followupId = options.followupId;
    const customerId = options.customerId;
    const suggestionDate = options.date || riyadhDate();
    const userId = await resolveAuthenticatedUserId(options.userId || null);

    if (!supabase) throw new Error("Supabase client is not available.");
    if (!followupId) throw new Error("Follow-up id is required.");
    if (!customerId) throw new Error("Customer id is required.");
    if (!userId) throw new Error("Authenticated user is required.");

    let suggestionId = options.suggestionId || null;
    if (!suggestionId) {
      const { data, error } = await supabase
        .from("daily_customer_suggestions")
        .select("id")
        .eq("user_id", userId)
        .eq("customer_id", customerId)
        .eq("suggestion_date", suggestionDate)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      suggestionId = data?.id || null;
    }

    if (!suggestionId) return 0;
    return complete({ suggestionId, followupId, date: suggestionDate });
  }

  window.DailySuggestionsService = { load, loadTeamSummary, complete, completeForCustomer, riyadhDate };
})();
