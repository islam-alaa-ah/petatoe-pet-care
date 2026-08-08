// Supabase browser client bootstrap.
// Phase 5B will activate database CRUD after the full Publishable Key is configured.

(function initializeCustomerSupabase() {
  const config = window.CUSTOMER_APP_CONFIG;
  const status = {
    configured: false,
    client: null,
    reason: ""
  };

  if (!config) {
    status.reason = "ملف إعدادات Supabase غير محمّل.";
    window.customerSupabaseStatus = status;
    return;
  }

  const key = String(config.supabasePublishableKey || "").trim();
  if (!key || key.includes("PASTE_COMPLETE")) {
    status.reason = "لم يتم إدخال Publishable Key الكامل بعد.";
    window.customerSupabaseStatus = status;
    return;
  }

  if (!window.supabase?.createClient) {
    status.reason = "مكتبة Supabase JavaScript غير محمّلة.";
    window.customerSupabaseStatus = status;
    return;
  }

  try {
    status.client = window.supabase.createClient(
      config.supabaseUrl,
      key,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
    status.configured = true;
    window.customerSupabase = status.client;
  } catch (error) {
    status.reason = error instanceof Error ? error.message : String(error);
  }

  window.customerSupabaseStatus = status;
})();
