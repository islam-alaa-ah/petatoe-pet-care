(() => {
  "use strict";

  const CURRENT_VERSION = "18.55.91";
  const VERSION_ENDPOINT = "./version.json";
  const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let deferredPrompt = null;
  let serviceWorkerRegistration = null;
  let updateInProgress = false;
  const updateState = {
    checking: false,
    lastCheckedAt: null,
    lastError: null,
    latestRelease: null,
    manifest: null
  };

  function emitUpdateState() {
    window.dispatchEvent(new CustomEvent("kyum-update-state", { detail: { ...updateState } }));
  }

  window.KYUM_RELEASE_VERSION = CURRENT_VERSION;

  function normalizeVersion(value) {
    return String(value || "0").trim().replace(/^v/i, "").split(".").map(part => Number.parseInt(part, 10) || 0);
  }

  function compareVersions(left, right) {
    const a = normalizeVersion(left);
    const b = normalizeVersion(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (a[index] || 0) - (b[index] || 0);
      if (delta !== 0) return delta > 0 ? 1 : -1;
    }
    return 0;
  }

  function readExpectedRelease() {
    try {
      return String(localStorage.getItem("kyumExpectedRelease") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function clearCompletedUpdateMarker() {
    const expectedRelease = readExpectedRelease();
    if (!expectedRelease || compareVersions(CURRENT_VERSION, expectedRelease) < 0) return;
    try {
      localStorage.removeItem("kyumExpectedRelease");
      localStorage.removeItem("kyumUpdateRequestedAt");
      localStorage.setItem("kyumActiveRelease", CURRENT_VERSION);
    } catch (_) {}
  }

  function createInstallBanner() {
    if (document.getElementById("pwaInstallBanner") || isStandalone()) return null;
    const banner = document.createElement("aside");
    banner.id = "pwaInstallBanner";
    banner.className = "pwa-install-banner";
    banner.hidden = true;
    banner.innerHTML = `
      <div class="pwa-install-icon" aria-hidden="true"><img src="assets/images/icon-128x128.png" alt=""></div>
      <div class="pwa-install-copy"><strong>تثبيت PETATOE</strong><span>افتح النظام كتطبيق مستقل على هاتفك.</span></div>
      <button type="button" class="pwa-install-action" data-pwa-install>تثبيت</button>
      <button type="button" class="pwa-install-close" data-pwa-dismiss aria-label="إغلاق">×</button>`;
    document.body.appendChild(banner);
    banner.querySelector("[data-pwa-dismiss]").addEventListener("click", () => {
      banner.hidden = true;
      sessionStorage.setItem("kyumPwaInstallDismissed", "1");
    });
    banner.querySelector("[data-pwa-install]").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.hidden = true;
    });
    return banner;
  }

  function showIosHint() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!ios || isStandalone() || sessionStorage.getItem("kyumPwaIosHintDismissed")) return;
    const hint = document.createElement("aside");
    hint.className = "pwa-ios-hint";
    hint.innerHTML = `<strong>تثبيت PETATOE على iPhone</strong><span>من زر المشاركة اختر «إضافة إلى الشاشة الرئيسية».</span><button type="button" aria-label="إغلاق">×</button>`;
    document.body.appendChild(hint);
    hint.querySelector("button").addEventListener("click", () => {
      sessionStorage.setItem("kyumPwaIosHintDismissed", "1");
      hint.remove();
    });
  }

  function openShortcutView() {
    const view = new URLSearchParams(location.search).get("view");
    if (!view) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      const target = document.querySelector(`.nav-item[data-view="${CSS.escape(view)}"]`);
      if (target && !target.classList.contains("hidden")) {
        target.click();
        window.clearInterval(timer);
        history.replaceState({}, document.title, location.pathname + location.hash);
      } else if (++attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 300);
  }

  function ensureUpdateDialog() {
    let dialog = document.getElementById("kyumUpdateDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "kyumUpdateDialog";
    dialog.className = "kyum-update-dialog";
    dialog.innerHTML = `
      <div class="kyum-update-shell" dir="rtl">
        <div class="kyum-update-icon" aria-hidden="true">↻</div>
        <h2 data-update-title>يوجد إصدار أحدث</h2>
        <p class="kyum-update-version">الإصدار الجديد <strong data-update-version></strong></p>
        <ul class="kyum-update-notes" data-update-notes></ul>
        <p class="kyum-update-status" data-update-status hidden></p>
        <div class="kyum-update-actions">
          <button type="button" class="primary-btn kyum-update-now" data-update-now>تحديث</button>
          <button type="button" class="secondary-btn kyum-update-later" data-update-later>لاحقًا</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("cancel", event => {
      if (dialog.dataset.forceUpdate === "true") event.preventDefault();
    });
    dialog.querySelector("[data-update-later]").addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-update-now]").addEventListener("click", () => activateLatestVersion(dialog));
    return dialog;
  }

  function showUpdateDialog(release) {
    const dialog = ensureUpdateDialog();
    dialog.dataset.forceUpdate = String(Boolean(release.forceUpdate));
    dialog.querySelector("[data-update-title]").textContent = release.title || "يوجد إصدار أحدث";
    dialog.querySelector("[data-update-version]").textContent = `v${release.version}`;
    const notes = dialog.querySelector("[data-update-notes]");
    notes.replaceChildren(...(Array.isArray(release.notes) ? release.notes : []).map(note => {
      const item = document.createElement("li");
      item.textContent = note;
      return item;
    }));
    const laterButton = dialog.querySelector("[data-update-later]");
    laterButton.hidden = Boolean(release.forceUpdate);
    dialog.querySelector("[data-update-status]").hidden = true;
    dialog.querySelector("[data-update-now]").disabled = false;
    if (!dialog.open) dialog.showModal();
  }

  async function fetchLatestRelease() {
    const separator = VERSION_ENDPOINT.includes("?") ? "&" : "?";
    const response = await fetch(`${VERSION_ENDPOINT}${separator}t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
    const manifest = await response.json();
    updateState.manifest = manifest;
    window.KYUM_RELEASE_BUILD = manifest.build || null;
    return manifest;
  }

  async function checkForUpdate({ silent = true, showDialog = true } = {}) {
    if (isNative || location.protocol === "file:") return null;
    updateState.checking = true;
    updateState.lastError = null;
    emitUpdateState();
    if (!navigator.onLine) {
      updateState.checking = false;
      updateState.lastCheckedAt = new Date().toISOString();
      updateState.lastError = "offline";
      emitUpdateState();
      return null;
    }
    try {
      const release = await fetchLatestRelease();
      updateState.lastCheckedAt = new Date().toISOString();
      updateState.latestRelease = release?.version && compareVersions(release.version, CURRENT_VERSION) > 0 ? release : null;
      if (updateState.latestRelease && showDialog) {
        const expectedRelease = readExpectedRelease();
        if (expectedRelease && compareVersions(expectedRelease, updateState.latestRelease.version) >= 0) {
          // The user already requested this exact release. Do not reopen the modal
          // forever; complete the stale-runtime recovery automatically.
          await withTimeout(clearApplicationCaches(), 5000).catch(() => undefined);
          await withTimeout(unregisterServiceWorkers(), 5000).catch(() => undefined);
          window.setTimeout(() => reloadWithCacheBuster(expectedRelease), 100);
          return updateState.latestRelease;
        }
        showUpdateDialog(updateState.latestRelease);
      }
      return updateState.latestRelease;
    } catch (error) {
      updateState.lastCheckedAt = new Date().toISOString();
      updateState.lastError = error?.message || "update_check_failed";
      updateState.latestRelease = null;
      if (!silent) console.warn("PETATOE update check failed", error);
      return null;
    } finally {
      updateState.checking = false;
      emitUpdateState();
    }
  }

  async function clearApplicationCaches() {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("petatoe-pwa-")).map(key => caches.delete(key)));
  }

  function reloadWithCacheBuster(targetVersion = "") {
    const url = new URL(location.href);
    url.searchParams.set("updated", Date.now().toString());
    if (targetVersion) url.searchParams.set("release", targetVersion);
    location.replace(url.toString());
  }

  function withTimeout(promise, timeoutMs = 5000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("update_timeout")), timeoutMs))
    ]);
  }

  async function unregisterServiceWorkers() {
    if (!("serviceWorker" in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)));
    serviceWorkerRegistration = null;
  }

  async function activateLatestVersion(dialog) {
    if (updateInProgress) return;
    updateInProgress = true;
    const button = dialog.querySelector("[data-update-now]");
    const status = dialog.querySelector("[data-update-status]");
    button.disabled = true;
    status.hidden = false;
    status.textContent = "جارٍ تنزيل التحديث وتفعيله...";

    try {
      const targetVersion = updateState.latestRelease?.version || updateState.manifest?.version || "";
      status.textContent = "جارٍ إزالة النسخة المخزنة...";

      // A hard reset is required on iOS standalone PWAs because an already active
      // service worker may keep serving the previous JavaScript bundle even after
      // registration.update() succeeds.
      await withTimeout(clearApplicationCaches(), 5000).catch(() => undefined);
      await withTimeout(unregisterServiceWorkers(), 5000).catch(() => undefined);
      await withTimeout(clearApplicationCaches(), 5000).catch(() => undefined);

      try {
        localStorage.setItem("kyumExpectedRelease", targetVersion);
        localStorage.setItem("kyumUpdateRequestedAt", new Date().toISOString());
      } catch (_) {}

      status.textContent = "تم تنزيل التحديث. جارٍ إعادة تشغيل التطبيق...";
      window.setTimeout(() => reloadWithCacheBuster(targetVersion), 250);
    } catch (error) {
      console.error("PETATOE update activation failed", error);
      status.textContent = "تعذر إكمال التحديث. تحقق من الاتصال ثم حاول مرة أخرى.";
      button.disabled = false;
      updateInProgress = false;
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:" || isNative) return;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register(`./service-worker.js?v=${encodeURIComponent(CURRENT_VERSION)}`, { scope: "./", updateViaCache: "none" });
      await serviceWorkerRegistration.update();
      serviceWorkerRegistration.addEventListener("updatefound", () => {
        const worker = serviceWorkerRegistration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) checkForUpdate({ silent: true, showDialog: false });
        });
      });
    } catch (error) {
      console.warn("PETATOE PWA registration failed", error);
    }
  }

  window.KYUM_UPDATE = Object.freeze({
    currentVersion: CURRENT_VERSION,
    check: () => checkForUpdate({ silent: false }),
    checkDetailed: async () => {
      await checkForUpdate({ silent: false, showDialog: false });
      return { ...updateState };
    },
    getStatus: () => ({ ...updateState }),
    updateNow: release => {
      if (release) showUpdateDialog(release);
    },
    clearCaches: clearApplicationCaches,
    reload: reloadWithCacheBuster
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    if (sessionStorage.getItem("kyumPwaInstallDismissed")) return;
    const banner = createInstallBanner();
    if (banner) banner.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    document.getElementById("pwaInstallBanner")?.remove();
  });

  window.addEventListener("online", () => {
    document.documentElement.classList.remove("is-offline");
    checkForUpdate({ silent: true, showDialog: false });
  });
  window.addEventListener("offline", () => document.documentElement.classList.add("is-offline"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate({ silent: true, showDialog: false });
  });

  window.addEventListener("kyum-view-changed", () => {
    if (updateInProgress || document.getElementById("kyumUpdateDialog")?.open) return;
    if (updateState.latestRelease) showUpdateDialog(updateState.latestRelease);
    else checkForUpdate({ silent: true, showDialog: true });
  });

  document.addEventListener("DOMContentLoaded", async () => {
    if (!navigator.onLine) document.documentElement.classList.add("is-offline");
    clearCompletedUpdateMarker();
    await registerServiceWorker();
    openShortcutView();
    checkForUpdate({ silent: true, showDialog: true });
    window.setInterval(() => checkForUpdate({ silent: true, showDialog: false }), UPDATE_CHECK_INTERVAL_MS);
    setTimeout(showIosHint, 1800);
  });
})();
