(() => {
  "use strict";

  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  if (!isNative) return;

  document.documentElement.classList.add("is-capacitor-native");
  document.documentElement.dataset.nativePlatform = capacitor.getPlatform?.() || "native";

  const plugins = capacitor.Plugins || {};
  const App = plugins.App;
  const Browser = plugins.Browser;
  const StatusBar = plugins.StatusBar;

  async function configureStatusBar() {
    if (!StatusBar) return;
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#071b26" });
      await StatusBar.setStyle({ style: "LIGHT" });
    } catch (error) {
      console.warn("KYUM native status bar configuration failed", error);
    }
  }

  function closeTopLayer() {
    const candidates = [
      ".modal.show", ".modal:not(.hidden)", ".bottom-sheet.is-open",
      ".mobile-drawer.is-open", "[role='dialog']:not([hidden])"
    ];
    for (const selector of candidates) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const close = element.querySelector("[data-close], .modal-close, .close, button[aria-label='إغلاق']");
      if (close instanceof HTMLElement) close.click();
      else element.classList.remove("show", "is-open");
      return true;
    }
    return false;
  }

  function bindAndroidBackButton() {
    if (!App?.addListener) return;
    App.addListener("backButton", ({ canGoBack }) => {
      if (closeTopLayer()) return;
      if (canGoBack && history.length > 1) {
        history.back();
        return;
      }
      App.exitApp?.();
    });
  }

  function bindExternalLinks() {
    document.addEventListener("click", async event => {
      const anchor = event.target.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.href;
      if (!/^https?:/i.test(href)) return;
      const url = new URL(href);
      if (url.origin === location.origin || /wa\.me$|api\.whatsapp\.com$/i.test(url.hostname)) return;
      if (!Browser?.open) return;
      event.preventDefault();
      try {
        await Browser.open({ url: href });
      } catch (error) {
        location.href = href;
      }
    }, true);
  }

  document.addEventListener("DOMContentLoaded", () => {
    configureStatusBar();
    bindAndroidBackButton();
    bindExternalLinks();
  });
})();
