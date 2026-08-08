// KYUM Phase 14.1 — System Health Service
(function () {
  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  async function getSnapshot() {
    const started = performance.now();
    const { data, error } = await client().rpc("get_system_health_snapshot");
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    if (error) throw new Error(`تعذر تنفيذ فحص النظام: ${error.message}`);
    return { ...data, latency_ms: latencyMs };
  }

  window.SystemHealthService = Object.freeze({ getSnapshot });
})();