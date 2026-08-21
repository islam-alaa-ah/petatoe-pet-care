const CACHE_VERSION = "petatoe-pwa-18-55-82-overdue-completion-service-hotfix";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const VENDOR_CACHE = `${CACHE_VERSION}-vendor`;
const OFFLINE_URL = "./offline.html";

// Core files must be available for an offline boot. Optional files are cached
// independently so one missing asset can never abort the entire installation.
const CORE_APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./site.webmanifest",
  "./version.json",
  "./assets/css/style.css",
  "./assets/css/mobile.css",
  "./assets/css/responsive-foundation.css",
  "./assets/css/core-screens-responsive.css",
  "./assets/css/daily-reports-responsive.css",
  "./assets/css/mobile-shell-touch-certification.css",
  "./assets/css/tablet-desktop-certification.css",
  "./assets/css/installations-foundation.css",
  "./assets/css/installation-requests.css",
  "./assets/css/installation-request-inline-dialogs.css",
  "./assets/css/installation-scheduling.css",
  "./assets/css/installation-execution.css",
  "./assets/css/installation-completion.css",
  "./assets/css/installation-operations-reports.css",
  "./assets/css/installation-dashboard-settings.css",
  "./assets/css/mobile-theme-canonical.css",
  "./assets/css/sales-invoices.css",
  "./assets/css/global-typography-certification.css",
  "./assets/css/notification-center.css",
  "./assets/css/translation-center.css",
  "./assets/css/petatoe-navigation-shell.css",
  "./assets/js/offline-session-store.js",
  "./assets/js/supabase-client.js",
  "./assets/js/geographic-address.js",
  "./assets/js/permissions.js",
  "./assets/js/permission-engine.js",
  "./assets/js/localization-center-service.js",
  "./assets/js/localization-center.js",
  "./assets/js/translation-center.js",
  "./assets/js/data-access-scope.js",
  "./assets/js/smart-cache.js",
  "./assets/js/offline-read-cache.js",
  "./assets/js/cache-dependency-engine.js",
  "./assets/js/sync-engine.js",
  "./assets/js/offline-queue.js",
  "./assets/js/sync-recovery-center.js",
  "./assets/js/permissions-service.js",
  "./assets/js/notification-center-service.js",
  "./assets/js/auth-session.js",
  "./assets/js/reference-data-service.js",
  "./assets/js/customers-service.js",
  "./assets/js/followups-service.js",
  "./assets/js/quotations-service.js",
  "./assets/js/installations-service.js",
  "./assets/js/sales-invoices.js",
  "./assets/js/sales-invoices-service.js",
  "./assets/js/installations-service-contract.js",
  "./assets/js/app.js",
  "./assets/js/customer-excel-actions-hotfix.js",
  "./assets/js/notification-center.js",
  "./assets/js/installations-module.js",
  "./assets/js/installation-scheduling.js",
  "./assets/js/installation-execution.js",
  "./assets/js/installation-completion.js",
  "./assets/js/installation-operations-reports.js",
  "./assets/js/installation-dashboard-settings.js",
  "./assets/js/installation-settings-management.js",
  "./assets/js/mobile.js",
  "./assets/js/pwa.js"
];

const OPTIONAL_APP_SHELL = [
  "./assets/js/activity-service.js",
  "./assets/js/backup-service.js",
  "./assets/js/customer-excel-center.js",
  "./assets/js/customer360-engine.js",
  "./assets/js/customer360-export.js",
  "./assets/js/daily-activity-service.js",
  "./assets/js/daily-alerts-service.js",
  "./assets/js/daily-operations-service.js",
  "./assets/js/employee-report-settings-service.js",
  "./assets/js/daily-performance-service.js",
  "./assets/js/daily-suggestions-service.js",
  "./assets/js/whatsapp-template-service.js",
  "./assets/js/diagnostics-engine.js",
  "./assets/js/diagnostics-service.js",
  "./assets/js/export-center.js",
  "./assets/js/health-alerts-engine.js",
  "./assets/js/native.js",
  "./assets/js/performance-monitor.js",
  "./assets/js/reports-engine.js",
  "./assets/js/representative-excel-center.js",
  "./assets/js/supabase-config.js",
  "./assets/js/system-health-service.js",
  "./assets/js/system-settings-service.js",
  "./assets/js/users-service.js",
  "./assets/images/android-chrome-192x192.png",
  "./assets/images/android-chrome-512x512.png",
  "./assets/images/apple-touch-icon.png",
  "./assets/images/favicon.ico",
  "./assets/images/favicon-16x16.png",
  "./assets/images/favicon-32x32.png",
  "./assets/images/maskable-icon-192x192.png",
  "./assets/images/maskable-icon-512x512.png",
  "./assets/images/icon-64x64.png",
  "./assets/images/icon-72x72.png",
  "./assets/images/icon-96x96.png",
  "./assets/images/icon-128x128.png",
  "./assets/images/icon-144x144.png",
  "./assets/images/icon-152x152.png",
  "./assets/images/icon-180x180.png",
  "./assets/images/icon-192x192.png",
  "./assets/images/icon-256x256.png",
  "./assets/images/icon-384x384.png",
  "./assets/images/icon-512x512.png",
  "./assets/images/icon-1024x1024.png",
  "./assets/images/favicon-48x48.png",
  "./assets/images/petatoe-app-icon.svg",
  "./assets/images/pwa-splash-landscape.png",
  "./assets/images/pwa-splash-portrait.png",
  "./assets/images/kyum-header-logo.png"
];

const VENDOR_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
];

function isDynamicOrSensitive(url) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return host.includes("supabase") ||
    path.includes("/rest/v1/") ||
    path.includes("/auth/v1/") ||
    path.includes("/functions/v1/") ||
    path.includes("/api/");
}

function isStaticAsset(request, url) {
  return request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font" ||
    /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);
}

function isApprovedVendor(url) {
  return url.hostname === "cdn.jsdelivr.net" ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
}

async function cacheIndividually(cacheName, urls, { required = false } = {}) {
  const cache = await caches.open(cacheName);
  const results = await Promise.allSettled(urls.map(async assetUrl => {
    const request = new Request(new URL(assetUrl, self.registration.scope).href, { cache: "reload" });
    const response = await fetch(request);
    if (!response || (!response.ok && response.type !== "opaque")) {
      throw new Error(`Unable to cache ${assetUrl}`);
    }
    await cache.put(request, response);
  }));

  if (required) {
    const failed = results
      .map((result, index) => ({ result, assetUrl: urls[index] }))
      .filter(item => item.result.status === "rejected");
    if (failed.length) {
      throw new Error(`Core app shell cache failed: ${failed.map(item => item.assetUrl).join(", ")}`);
    }
  }
}

async function matchIgnoringVersion(request, cacheName) {
  const cache = await caches.open(cacheName);
  return cache.match(request, { ignoreSearch: true });
}

async function cacheFirstSameOrigin(request) {
  const requestUrl = new URL(request.url);
  const shellCache = await caches.open(APP_SHELL_CACHE);
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  // The current-version App Shell is cached with canonical, unversioned URLs.
  // Versioned index requests must be able to reuse those same current-shell assets
  // during the first controlled offline boot, before Runtime Cache is warmed.
  const cached = await shellCache.match(request) ||
    await runtimeCache.match(request) ||
    await matchIgnoringVersion(request, APP_SHELL_CACHE) ||
    await matchIgnoringVersion(request, RUNTIME_CACHE);

  const networkPromise = fetch(request, { cache: requestUrl.search ? "reload" : "default" }).then(async response => {
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  });

  if (cached) {
    networkPromise.catch(() => undefined);
    return cached;
  }

  return networkPromise;
}

async function cacheFirstVendor(request) {
  const cache = await caches.open(VENDOR_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await cacheIndividually(APP_SHELL_CACHE, CORE_APP_SHELL, { required: true });
    await Promise.all([
      cacheIndividually(APP_SHELL_CACHE, OPTIONAL_APP_SHELL),
      cacheIndividually(VENDOR_CACHE, VENDOR_URLS)
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => !key.startsWith(CACHE_VERSION))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => matchIgnoringVersion(request, APP_SHELL_CACHE)));
    return;
  }

  if (isDynamicOrSensitive(url) && !isApprovedVendor(url)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return (await matchIgnoringVersion(request, RUNTIME_CACHE)) ||
          (await matchIgnoringVersion(new Request("./index.html"), APP_SHELL_CACHE)) ||
          (await matchIgnoringVersion(new Request(OFFLINE_URL), APP_SHELL_CACHE));
      }
    })());
    return;
  }

  if (url.origin === self.location.origin && isStaticAsset(request, url)) {
    event.respondWith(cacheFirstSameOrigin(request).catch(() => new Response("", { status: 504, statusText: "Offline asset unavailable" })));
    return;
  }

  if (isApprovedVendor(url) && (request.destination === "script" || request.destination === "style" || request.destination === "font")) {
    event.respondWith(cacheFirstVendor(request));
  }
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Phase M15.12.2 — Web Push / External Notifications
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { body: event.data?.text?.() || "" }; }
    const title = payload.title || "PETATOE";
    await self.registration.showNotification(title, {
      body: payload.body || "لديك إشعار جديد.",
      icon: payload.icon || "./assets/images/android-chrome-192x192.png",
      badge: payload.badge || "./assets/images/favicon-48x48.png",
      tag: payload.tag || undefined,
      renotify: false,
      data: payload.data || {},
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    const targetUrl = new URL("./", self.registration.scope);
    if (data.targetView) targetUrl.searchParams.set("notificationView", data.targetView);
    if (data.notificationId) targetUrl.searchParams.set("notificationId", data.notificationId);
    if (data.requestId) targetUrl.searchParams.set("requestId", data.requestId);
    if (data.visitId) targetUrl.searchParams.set("visitId", data.visitId);

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === targetUrl.origin);
    if (existing) {
      existing.postMessage({ type: "OPEN_NOTIFICATION_TARGET", targetView: data.targetView || "", notificationId: data.notificationId || "", requestId: data.requestId || "", visitId: data.visitId || "" });
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl.href);
  })());
});
