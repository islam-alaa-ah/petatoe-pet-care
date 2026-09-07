(function () {
  async function listActivity(limit = 300) {
    if (!window.customerSupabase) throw new Error(window.PetatoeLocalization.t("auth.error.supabaseNotReady"));
    const { data, error } = await window.customerSupabase
      .from("audit_logs")
      .select("id,user_id,action,entity_type,entity_id,new_data,metadata,created_at,user:user_profiles!audit_logs_user_profile_fkey(full_name,email)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(window.PetatoeLocalization.t("activityLog.error.load", { error: error.message }));
    return data || [];
  }
  window.ActivityService = Object.freeze({ listActivity });
})();