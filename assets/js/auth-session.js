(function () {
  "use strict";
  const state = { session: null, user: null, profile: null, initialized: false, offline: false };
  const el = () => ({
    overlay: document.getElementById("authLoadingOverlay"), loginView: document.getElementById("loginView"),
    appView: document.getElementById("appView"), loginForm: document.getElementById("loginForm"),
    email: document.getElementById("loginEmail"), password: document.getElementById("loginPassword"),
    submit: document.getElementById("loginSubmitBtn"), message: document.getElementById("loginMessage"),
    logout: document.getElementById("logoutBtn"), userName: document.getElementById("currentUserName"),
    userMeta: document.getElementById("currentUserMeta")
  });

  function message(text = "", type = "error") {
    const node = el().message; if (!node) return;
    node.textContent = text; node.className = text ? `auth-message ${type}` : "auth-message hidden";
  }
  function loading(on) { const button = el().submit; if (!button) return; button.disabled = on; button.textContent = on ? "جاري تسجيل الدخول..." : "تسجيل الدخول"; }
  function showLogin(text = "") { const e = el(); e.overlay?.classList.add("hidden"); e.loginView?.classList.remove("hidden"); e.appView?.classList.add("hidden"); if (text) message(text); }
  function showApp() { const e = el(); e.overlay?.classList.add("hidden"); e.loginView?.classList.add("hidden"); e.appView?.classList.remove("hidden"); }

  async function loadProfileOnline(userId) {
    const { data, error } = await window.customerSupabase.from("user_profiles")
      .select("id, full_name, email, role, representative_id, is_active, must_change_password, last_login_at")
      .eq("id", userId).single();
    if (error) throw new Error(`تعذر تحميل ملف المستخدم: ${error.message}`);
    if (!data?.is_active) throw new Error("هذا الحساب غير نشط.");
    return data;
  }

  function applyIdentity(session, profile, offline) {
    state.session = session; state.user = session.user; state.profile = profile; state.offline = Boolean(offline);
    const e = el();
    const roleLabel = window.CustomerPermissions?.roleLabels?.[profile.role] || profile.role;
    if (e.userName) e.userName.textContent = profile.full_name || session.user.email || "مستخدم";
    if (e.userMeta) e.userMeta.textContent = `${roleLabel} · ${session.user.email || ""}`;
    const avatar = document.querySelector(".avatar");
    if (avatar) avatar.textContent = (profile.full_name || session.user.email || "م").trim().charAt(0).toUpperCase();
    window.CustomerPermissions?.apply(profile);
  }

  async function activate(session, options = {}) {
    if (!session?.user) return showLogin();
    const offline = Boolean(options.offline);
    const store = window.KYUMOfflineSessionStore;
    const profile = offline ? store?.loadProfile(session.user.id) : await loadProfileOnline(session.user.id);
    if (!profile) throw new Error("لا توجد جلسة محفوظة صالحة لهذا الحساب. اتصل بالإنترنت وسجل الدخول مرة واحدة.");
    if (profile.is_active === false) throw new Error("هذا الحساب غير نشط.");
    if (!offline) store?.saveProfile(profile, session.user);
    applyIdentity(session, profile, offline);
    await window.CustomerPermissions?.loadCurrentPermissions?.({ offline });
    if (window.PermissionEngine?.refresh) {
      window.PermissionEngine.refresh({ validateCurrentView: false });
    } else {
      window.CustomerPermissions?.applyScreenVisibility?.();
      window.CustomerPermissions?.applyActionVisibility?.();
    }
    showApp();
    window.dispatchEvent(new CustomEvent("customer-auth-ready", { detail: { session, user: session.user, profile, offline } }));
  }

  async function offlineBootstrap(reason = "") {
    const session = window.KYUMOfflineSessionStore?.readAuthSession?.();
    if (!session?.user) {
      showLogin(reason || "لا توجد جلسة محفوظة. اتصل بالإنترنت وسجل الدخول مرة واحدة على هذا الجهاز.");
      return false;
    }
    try { await activate(session, { offline: true }); return true; }
    catch (error) { showLogin(error instanceof Error ? error.message : "تعذر فتح الجلسة المحفوظة."); return false; }
  }

  async function initialize() {
    try {
      if (navigator.onLine === false || !window.customerSupabaseStatus?.configured || !window.customerSupabase) {
        await offlineBootstrap(window.customerSupabaseStatus?.reason || "");
        return;
      }
      const { data, error } = await window.customerSupabase.auth.getSession();
      if (error) throw error;
      if (data.session) await activate(data.session);
      else showLogin();
    } catch (error) {
      const opened = await offlineBootstrap();
      if (!opened) showLogin(error instanceof Error ? error.message : "تعذر التحقق من الجلسة.");
    } finally { state.initialized = true; }
  }

  async function signIn(email, password) {
    message(""); loading(true);
    try {
      if (navigator.onLine === false) throw new Error("لا يمكن تنفيذ تسجيل دخول جديد بدون اتصال. افتح التطبيق بالحساب المحفوظ سابقًا.");
      if (!window.customerSupabase) throw new Error(window.customerSupabaseStatus?.reason || "اتصال Supabase غير جاهز.");
      const { data, error } = await window.customerSupabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await activate(data.session);
    } catch (error) {
      const text = error?.message === "Invalid login credentials" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : (error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
      message(text);
    } finally { loading(false); }
  }

  async function signOut() {
    const userId = state.user?.id;
    try { if (navigator.onLine !== false) await window.customerSupabase?.auth.signOut(); }
    finally {
      state.session = null; state.user = null; state.profile = null; state.offline = false;
      window.CustomerPermissions?.reset?.();
      // Explicit logout invalidates offline bootstrap credentials for this device.
      window.KYUMOfflineSessionStore?.clearUser?.(userId);
      localStorage.removeItem("kyum-customer-management-auth");
      showLogin(); message("تم تسجيل الخروج بنجاح.", "success");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const e = el();
    e.loginForm?.addEventListener("submit", event => { event.preventDefault(); signIn(e.email.value, e.password.value); });
    e.logout?.addEventListener("click", event => { event.preventDefault(); signOut(); });
    initialize();
    window.customerSupabase?.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") { state.session = null; state.user = null; state.profile = null; state.offline = false; showLogin(); return; }
      if (event === "TOKEN_REFRESHED" && session) { state.session = session; state.user = session.user || state.user; return; }
      if (["SIGNED_IN", "USER_UPDATED"].includes(event) && session) {
        const sameUserAlreadyActive = Boolean(state.profile && state.user?.id === session.user?.id && event === "SIGNED_IN");
        if (sameUserAlreadyActive) { state.session = session; state.user = session.user; return; }
        try { await activate(session); }
        catch (error) { await window.customerSupabase.auth.signOut(); showLogin(error instanceof Error ? error.message : "تعذر تفعيل الجلسة."); }
      }
    });
  });
  window.CustomerAuth = { getState: () => ({ ...state }), signIn, signOut, offlineBootstrap };
})();
