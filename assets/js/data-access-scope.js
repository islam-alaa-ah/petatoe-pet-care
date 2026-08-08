(() => {
  "use strict";

  const cache = new Map();
  const VALID_MODES = new Set(["own", "selected", "all"]);

  function client() {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    return window.customerSupabase;
  }

  function profile() {
    return window.CustomerAuth?.getState?.().profile || null;
  }

  function normalize(scope, currentProfile = profile()) {
    const mode = VALID_MODES.has(scope?.mode) ? scope.mode : "none";
    const representativeIds = [...new Set((scope?.representativeIds || []).filter(Boolean))];
    if (mode === "all") return Object.freeze({ mode: "all", representativeIds: [] });
    if (mode === "none") return Object.freeze({ mode: "none", representativeIds: [] });
    if (mode === "own") {
      const ownId = currentProfile?.representative_id || null;
      return Object.freeze({ mode: ownId ? "selected" : "none", representativeIds: ownId ? [ownId] : [] });
    }
    return Object.freeze({ mode: representativeIds.length ? "selected" : "none", representativeIds });
  }

  function cacheKey(userId) { return String(userId || "anonymous"); }

  function current(userId = profile()?.id) {
    return cache.get(cacheKey(userId)) || Object.freeze({ mode: "none", representativeIds: [] });
  }

  function remember(userId, scope) {
    const normalized = normalize(scope);
    cache.set(cacheKey(userId), normalized);
    return normalized;
  }

  async function resolve(options = {}) {
    const currentProfile = options.profile || profile();
    if (!currentProfile) return Object.freeze({ mode: "none", representativeIds: [] });
    if (currentProfile.role === "super_admin") return remember(currentProfile.id, { mode: "all", representativeIds: [] });

    const domain = options.domain || "customers";
    const cached = window.KYUMOfflineSessionStore?.loadScope?.(currentProfile.id, domain);
    const safeFallback = cached || (currentProfile.representative_id
      ? { mode: "own", representativeIds: [currentProfile.representative_id] }
      : { mode: "none", representativeIds: [] });

    if (!window.customerSupabase) return remember(currentProfile.id, safeFallback);

    try {
      const { data: accessProfile, error: accessError } = await client()
        .from("user_data_access_profiles")
        .select("access_mode")
        .eq("user_id", currentProfile.id)
        .maybeSingle();
      if (accessError) throw accessError;

      const mode = VALID_MODES.has(accessProfile?.access_mode) ? accessProfile.access_mode : (currentProfile.representative_id ? "own" : "selected");
      if (mode === "all") return remember(currentProfile.id, { mode: "all", representativeIds: [] });
      if (mode === "own") return remember(currentProfile.id, { mode: "own", representativeIds: [] });

      const { data: allowedRows, error: allowedError } = await client()
        .from("user_data_access_representatives")
        .select("representative_id")
        .eq("user_id", currentProfile.id);
      if (allowedError) throw allowedError;

      const ids = (allowedRows || []).map(row => row.representative_id).filter(Boolean);
      if (currentProfile.representative_id) ids.unshift(currentProfile.representative_id);
      return remember(currentProfile.id, { mode: "selected", representativeIds: ids });
    } catch (error) {
      console.warn("Canonical data scope refresh failed; safe cached scope retained.", error);
      return remember(currentProfile.id, safeFallback);
    }
  }

  function allowsRepresentative(representativeId, scope = current()) {
    if (scope.mode === "all") return true;
    if (scope.mode !== "selected") return false;
    return Boolean(representativeId) && scope.representativeIds.includes(representativeId);
  }

  function filterRows(rows, scope = current(), key = "representativeId") {
    if (scope.mode === "all") return [...(rows || [])];
    if (scope.mode !== "selected") return [];
    const allowed = new Set(scope.representativeIds);
    return (rows || []).filter(row => allowed.has(row?.[key]));
  }

  function filterRepresentatives(rows, scope = current()) {
    if (scope.mode === "all") return [...(rows || [])];
    if (scope.mode !== "selected") return [];
    const allowed = new Set(scope.representativeIds);
    return (rows || []).filter(row => allowed.has(row?.uuid || row?.id || row?.representative_id));
  }

  window.KYUMDataAccessScope = Object.freeze({ resolve, current, remember, normalize, allowsRepresentative, filterRows, filterRepresentatives });
})();
