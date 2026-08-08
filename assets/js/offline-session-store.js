// KYUM Phase M13.7.4 — Offline-first session bootstrap store
(function () {
  "use strict";

  const AUTH_STORAGE_KEY = "kyum-customer-management-auth";
  const PREFIX = "kyum-offline-bootstrap:v1";

  function safeParse(value, fallback = null) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function readAuthSession() {
    const stored = safeParse(localStorage.getItem(AUTH_STORAGE_KEY));
    if (!stored || typeof stored !== "object") return null;
    if (stored.currentSession?.user) return stored.currentSession;
    if (stored.session?.user) return stored.session;
    if (stored.user && (stored.access_token || stored.refresh_token)) return stored;
    return null;
  }

  function currentUserId() {
    return window.CustomerAuth?.getState?.().user?.id
      || readAuthSession()?.user?.id
      || safeParse(localStorage.getItem(`${PREFIX}:last-user`))?.id
      || null;
  }

  function userKey(userId, suffix) {
    return `${PREFIX}:${String(userId || "").trim()}:${suffix}`;
  }

  function saveProfile(profile, sessionUser = null) {
    const userId = profile?.id || sessionUser?.id;
    if (!userId || !profile) return;
    localStorage.setItem(userKey(userId, "profile"), JSON.stringify(profile));
    localStorage.setItem(`${PREFIX}:last-user`, JSON.stringify({ id: userId, email: sessionUser?.email || profile.email || "" }));
  }

  function loadProfile(userId) {
    return safeParse(localStorage.getItem(userKey(userId, "profile")));
  }

  function savePermissions(userId, rows) {
    if (!userId || !Array.isArray(rows)) return;
    localStorage.setItem(userKey(userId, "permissions"), JSON.stringify(rows));
  }

  function loadPermissions(userId) {
    const rows = safeParse(localStorage.getItem(userKey(userId, "permissions")), []);
    return Array.isArray(rows) ? rows : [];
  }

  function saveScope(userId, domain, scope) {
    if (!userId || !domain || !scope) return;
    localStorage.setItem(userKey(userId, `scope:${domain}`), JSON.stringify(scope));
  }

  function loadScope(userId, domain) {
    return safeParse(localStorage.getItem(userKey(userId, `scope:${domain}`)));
  }

  function clearUser(userId) {
    if (!userId) return;
    ["profile", "permissions", "scope:customers", "scope:followups", "scope:quotations"].forEach(suffix => {
      localStorage.removeItem(userKey(userId, suffix));
    });
  }

  window.KYUMOfflineSessionStore = Object.freeze({
    readAuthSession,
    currentUserId,
    saveProfile,
    loadProfile,
    savePermissions,
    loadPermissions,
    saveScope,
    loadScope,
    clearUser
  });
})();
