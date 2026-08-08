// KYUM Phase 14.2 — Lightweight Performance Monitor
(function () {
  const sessionStartedAt = Date.now();
  const requests = [];
  const renders = [];
  const maxEntries = 200;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function monitoredFetch(input, init) {
    const startedAt = performance.now();
    const method = String(init?.method || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input?.url || "unknown";
    let status = 0;
    let ok = false;

    try {
      const response = await originalFetch(input, init);
      status = response.status;
      ok = response.ok;
      return response;
    } catch (error) {
      throw error;
    } finally {
      const durationMs = Math.max(0, performance.now() - startedAt);
      requests.push({
        method,
        url,
        status,
        ok,
        durationMs,
        timestamp: Date.now()
      });
      if (requests.length > maxEntries) requests.splice(0, requests.length - maxEntries);
    }
  };

  function recordRender(screen, durationMs) {
    renders.push({
      screen: String(screen || "unknown"),
      durationMs: Math.max(0, Number(durationMs || 0)),
      timestamp: Date.now()
    });
    if (renders.length > maxEntries) renders.splice(0, renders.length - maxEntries);
  }

  function navigationMetrics() {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (!navigation) {
      return { pageLoadMs: null, domReadyMs: null };
    }

    return {
      pageLoadMs: Math.max(0, Math.round(navigation.loadEventEnd || navigation.duration || 0)),
      domReadyMs: Math.max(0, Math.round(navigation.domContentLoadedEventEnd || 0))
    };
  }

  function memoryMetrics() {
    const memory = performance.memory;
    if (!memory) return null;

    return {
      usedBytes: Number(memory.usedJSHeapSize || 0),
      totalBytes: Number(memory.totalJSHeapSize || 0),
      limitBytes: Number(memory.jsHeapSizeLimit || 0)
    };
  }

  function networkMetrics() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      online: navigator.onLine,
      effectiveType: connection?.effectiveType || "unknown",
      downlinkMbps: Number(connection?.downlink || 0),
      rttMs: Number(connection?.rtt || 0),
      saveData: Boolean(connection?.saveData)
    };
  }

  function summarize() {
    const apiRequests = requests.filter(item =>
      item.url.includes(".supabase.co/")
      || item.url.includes("/rest/v1/")
      || item.url.includes("/functions/v1/")
      || item.url.includes("/auth/v1/")
    );

    const failed = apiRequests.filter(item => !item.ok);
    const durations = apiRequests.map(item => item.durationMs);
    const averageMs = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;

    const slowest = [...apiRequests]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);

    const renderByScreen = new Map();
    renders.forEach(item => {
      const current = renderByScreen.get(item.screen) || {
        screen: item.screen,
        count: 0,
        totalMs: 0,
        maxMs: 0
      };
      current.count += 1;
      current.totalMs += item.durationMs;
      current.maxMs = Math.max(current.maxMs, item.durationMs);
      renderByScreen.set(item.screen, current);
    });

    const screenRenders = [...renderByScreen.values()]
      .map(item => ({
        ...item,
        averageMs: item.count ? item.totalMs / item.count : 0
      }))
      .sort((a, b) => b.averageMs - a.averageMs)
      .slice(0, 10);

    return {
      sessionStartedAt,
      sessionDurationMs: Date.now() - sessionStartedAt,
      lastUpdatedAt: Date.now(),
      requestsTotal: apiRequests.length,
      failedRequests: failed.length,
      averageResponseMs: averageMs,
      slowestResponseMs: slowest[0]?.durationMs || 0,
      slowestRequests: slowest,
      screenRenders,
      navigation: navigationMetrics(),
      memory: memoryMetrics(),
      network: networkMetrics()
    };
  }

  function reset() {
    requests.length = 0;
    renders.length = 0;
  }

  window.PerformanceMonitor = Object.freeze({
    recordRender,
    summarize,
    reset
  });
})();