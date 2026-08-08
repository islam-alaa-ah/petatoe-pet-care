// KYUM Phase 14.4 — Diagnostics Data Service
(function () {
  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  async function timed(label, callback) {
    const startedAt = performance.now();
    try {
      const value = await callback();
      return {
        label,
        ok: true,
        value,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt))
      };
    } catch (error) {
      return {
        label,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.max(0, Math.round(performance.now() - startedAt))
      };
    }
  }

  async function getHealthSnapshot() {
    return timed("health_snapshot", async () => {
      if (!window.SystemHealthService) {
        throw new Error("SystemHealthService غير محمل.");
      }
      return window.SystemHealthService.getSnapshot();
    });
  }

  async function getSession() {
    return timed("auth_session", async () => {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      return {
        hasSession: Boolean(data.session),
        userId: data.session?.user?.id || null,
        expiresAt: data.session?.expires_at || null
      };
    });
  }

  async function getProfile() {
    return timed("user_profile", async () => {
      const profile = window.CustomerAuth?.getState?.().profile;
      if (!profile) throw new Error("ملف المستخدم غير محمل.");
      return {
        id: profile.id,
        role: profile.role,
        is_active: profile.is_active,
        representative_id: profile.representative_id || null
      };
    });
  }

  async function getScreensAndPermissions() {
    return timed("screen_permissions", async () => {
      const role = window.CustomerAuth?.getState?.().profile?.role;
      if (!role) throw new Error("دور المستخدم غير معروف.");

      const [screensResult, permissionsResult] = await Promise.all([
        client()
          .from("app_screens")
          .select("screen_key,is_active")
          .eq("is_active", true),
        client()
          .from("role_screen_permissions")
          .select("screen_key,can_view,can_add,can_edit,can_delete,can_export")
          .eq("role", role)
      ]);

      if (screensResult.error) throw screensResult.error;
      if (permissionsResult.error) throw permissionsResult.error;

      return {
        role,
        screens: screensResult.data || [],
        permissions: permissionsResult.data || []
      };
    });
  }

  async function getLatestBackup() {
    return timed("latest_backup", async () => {
      const { data, error } = await client()
        .from("backup_operations")
        .select("operation_type,status,total_records,created_at,details")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    });
  }

  async function testFunction(functionName) {
    return timed(`function_${functionName}`, async () => {
      const projectUrl = window.CUSTOMER_SUPABASE_CONFIG?.url
        || window.CUSTOMER_SUPABASE_URL
        || "";

      if (!projectUrl) throw new Error("رابط Supabase غير متاح.");

      const response = await fetch(
        `${projectUrl.replace(/\/$/, "")}/functions/v1/${functionName}`,
        {
          method: "OPTIONS",
          headers: {
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,apikey,content-type"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        status: response.status,
        allowMethods: response.headers.get("access-control-allow-methods") || "",
        allowOrigin: response.headers.get("access-control-allow-origin") || ""
      };
    });
  }

  async function checkAsset(path) {
    return timed(`asset_${path}`, async () => {
      const response = await fetch(path, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return {
        path,
        status: response.status,
        contentType: response.headers.get("content-type") || ""
      };
    });
  }

  async function runDataCollection() {
    const requiredAssets = [
      "index.html",
      "assets/css/style.css",
      "assets/js/app.js",
      "assets/js/supabase-client.js",
      "assets/js/permissions.js",
      "assets/js/system-health-service.js",
      "assets/js/performance-monitor.js",
      "assets/js/health-alerts-engine.js"
    ];

    const [
      health,
      session,
      profile,
      permissions,
      backup,
      backupAdmin,
      manageUser,
      ...assets
    ] = await Promise.all([
      getHealthSnapshot(),
      getSession(),
      getProfile(),
      getScreensAndPermissions(),
      getLatestBackup(),
      testFunction("backup-admin"),
      testFunction("manage-user"),
      ...requiredAssets.map(checkAsset)
    ]);

    return {
      health,
      session,
      profile,
      permissions,
      backup,
      functions: {
        backupAdmin,
        manageUser
      },
      assets,
      performance: window.PerformanceMonitor?.summarize?.() || null,
      location: {
        href: location.href,
        protocol: location.protocol,
        host: location.host,
        online: navigator.onLine
      },
      userAgent: navigator.userAgent,
      collectedAt: new Date().toISOString()
    };
  }

  window.DiagnosticsService = Object.freeze({ runDataCollection });
})();