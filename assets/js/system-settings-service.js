// KYUM Phase 12 — System Settings Service
(function () {
  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  async function loadSettings() {
    const { data, error } = await client()
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "company_name_ar",
        "company_name_en",
        "company_email",
        "company_phone",
        "company_address",
        "currency",
        "timezone",
        "page_size",
        "session_timeout_minutes"
      ]);

    if (error) throw new Error(`تعذر تحميل إعدادات النظام: ${error.message}`);

    return Object.fromEntries(
      (data || []).map(row => [row.setting_key, row.setting_value])
    );
  }

  async function saveSettings(settings) {
    const rows = Object.entries(settings).map(([setting_key, setting_value]) => ({
      setting_key,
      setting_value: String(setting_value ?? ""),
      updated_at: new Date().toISOString()
    }));

    const { error } = await client()
      .from("system_settings")
      .upsert(rows, { onConflict: "setting_key" });

    if (error) throw new Error(`تعذر حفظ إعدادات النظام: ${error.message}`);

    try {
      const { data } = await client().auth.getUser();
      await client().from("audit_logs").insert({
        user_id: data.user?.id || null,
        action: "update",
        entity_type: "system_settings",
        entity_id: "global",
        new_data: settings,
        metadata: { source: "petatoe-web", phase: "12" }
      });
    } catch (error) {
      console.warn("Settings audit skipped:", error);
    }
  }

  window.SystemSettingsService = Object.freeze({ loadSettings, saveSettings });
})();