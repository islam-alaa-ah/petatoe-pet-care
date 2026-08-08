// Customer Management — Supabase browser client bootstrap
(function () {
  const config = window.CUSTOMER_APP_CONFIG;
  const status = { configured: false, client: null, reason: "" };

  if (!config) status.reason = "ملف إعدادات Supabase غير محمّل.";
  else {
    const url = String(config.supabaseUrl || "").trim();
    const key = String(config.supabasePublishableKey || "").trim();

    if (!url.startsWith("https://") || !url.includes(".supabase.co")) status.reason = "Project URL غير صحيح.";
    else if (!key || key.includes("PASTE_COMPLETE") || !key.startsWith("sb_publishable_")) status.reason = "لم يتم إدخال Publishable Key الكامل بعد.";
    else if (!window.supabase?.createClient) status.reason = "مكتبة Supabase JavaScript غير محمّلة.";
    else {
      try {
        status.client = window.supabase.createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "kyum-customer-management-auth" }
        });
        status.configured = true;
        window.customerSupabase = status.client;
      } catch (error) {
        status.reason = error instanceof Error ? error.message : String(error);
      }
    }
  }

  window.customerSupabaseStatus = status;
})();
