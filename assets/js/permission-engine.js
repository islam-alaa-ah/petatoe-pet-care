(() => {
  "use strict";

  const ACTION_FIELD_MAP = Object.freeze({
    view: "can_view",
    add: "can_add",
    edit: "can_edit",
    delete: "can_delete",
    export: "can_export",
    import: "can_add"
  });

  const ACTION_BINDINGS = Object.freeze([
    Object.freeze({ selector: "#addCustomerBtn,#referenceAddCustomerBtn,[data-daily-suggested-add-customer]", screen: "customers", action: "add" }),
    Object.freeze({ selector: "#customersImportBtn,#referenceCustomersImportBtn,#customerImportChooseFileBtn,#customerImportExecuteBtn,#customerImportOverrideBtn,#customerImportOverrideConfirmBtn,[data-daily-suggested-import]", screen: "customers", action: "import" }),
    Object.freeze({ selector: "#customersTemplateBtn,#referenceCustomersExportBtn,#referenceCustomersTemplateBtn,#customerImportFailedExportBtn", screen: "customers", action: "export" }),
    Object.freeze({ selector: "[data-edit],[data-reference-customer-edit]", screen: "customers", action: "edit" }),
    Object.freeze({ selector: "[data-delete],[data-reference-customer-delete]", screen: "customers", action: "delete" }),
    Object.freeze({ selector: "#addFollowupBtn,#customer360AddFollowupBtn,[data-add-followup],[data-daily-suggested-followup],[data-daily-suggested-contacted]", screen: "followups", action: "add" }),
    Object.freeze({ selector: "[data-edit-followup]", screen: "followups", action: "edit" }),
    Object.freeze({ selector: "[data-delete-followup]", screen: "followups", action: "delete" }),
    Object.freeze({ selector: "#addQuotationBtn", screen: "quotations", action: "add" }),
    Object.freeze({ selector: "[data-install-edit]", screen: "installationRequests", action: "edit" }),
    Object.freeze({ selector: "[data-install-delete]", screen: "installationRequests", action: "delete" }),
    Object.freeze({ selector: "#saveInstallationAssignment", screen: "installationSchedule", action: "edit", deniedMode: "disable", deniedMessage: "ليس لديك صلاحية جدولة وإسناد طلبات التركيبات." }),
    Object.freeze({ selector: "[data-technician-edit]", screen: "installationSchedule", action: "edit" }),
    Object.freeze({ selector: "[data-technician-delete]", screen: "installationSchedule", action: "delete" }),
    Object.freeze({ selector: "[data-installation-execute],#saveInstallationExecution", screen: "installationExecution", action: "edit" }),
    Object.freeze({ selector: "[data-installation-completion]", screen: "installationCompletion", action: "edit" }),
    Object.freeze({ selector: "#printInstallationCompletion", screen: "installationCompletion", action: "export" }),
    Object.freeze({ selector: "[data-installation-revisit],#saveInstallationRevisit", screen: "installationExceptions", action: "edit" }),
    Object.freeze({ selector: "#exportInstallationReportsBtn", screen: "installationReports", action: "export" }),
    Object.freeze({ selector: "[data-edit-quotation]", screen: "quotations", action: "edit" }),
    Object.freeze({ selector: "[data-delete-quotation]", screen: "quotations", action: "delete" }),
    Object.freeze({ selector: "#representativesImportBtn,#representativeImportChooseFileBtn,#representativeImportExecuteBtn", screen: "representatives", action: "import" }),
    Object.freeze({ selector: "#representativesTemplateBtn,#representativeImportFailedExportBtn", screen: "representatives", action: "export" }),
    Object.freeze({ selector: "#openExportCenterBtn,#exportDailyPerformanceCsvBtn,#exportReportsExcelBtn,#exportReportsPdfBtn,#exportReportsPngBtn,#exportReportsCsvBtn", screen: "reportsOverview", action: "export" }),
    Object.freeze({ selector: "#customer360ExportBtn,#customer360ExportPdfBtn,#customer360ExportExcelBtn,#customer360ExportPngBtn", screen: "customers", action: "export" }),
    Object.freeze({ selector: "#addUserBtn", screen: "users", action: "add" }),
    Object.freeze({ selector: "[data-edit-user],[data-reset-password]", screen: "users", action: "edit" }),
    Object.freeze({ selector: "#savePermissionsBtn", screen: "permissions", action: "edit" }),
    Object.freeze({ selector: "#createBackupBtn,#restoreBackupBtn", screen: "backups", action: "add" }),
    Object.freeze({ selector: "#downloadBackupBtn", screen: "backups", action: "export" }),
    Object.freeze({ selector: "#saveSystemSettingsBtn", screen: "systemSettings", action: "edit" }),
    Object.freeze({ selector: "#saveNotificationCenterBtn", screen: "notificationCenter", action: "edit" }),
    Object.freeze({ selector: "[data-add-reference]", screen: "settings", action: "add" })
  ]);

  const DEFAULT_NAVIGATION_GROUPS = Object.freeze({
    "main-navigation": Object.freeze(["dashboard", "dailyOperations"]),
    "customer-management": Object.freeze(["customers", "followups", "quotations", "representatives", "settings"]),
    "installations-management": Object.freeze(["installationsOverview", "installationRequestNew", "installationRequests", "installationSchedule", "installationExecution", "installationCompletion", "installationExceptions", "installationReports", "installationSettings"]),
    "reports-analytics": Object.freeze(["reportsOverview", "dailyPerformanceReport"]),
    "settings-privacy": Object.freeze(["users", "permissions", "activityLog", "backups", "systemHealth", "notificationCenter", "systemSettings", "aboutApp"])
  });

  function legacyPermissions() {
    return window.CustomerPermissions || null;
  }

  function normalizeKey(value) {
    return String(value || "").trim();
  }

  function normalizeAction(value) {
    const action = String(value || "view").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ACTION_FIELD_MAP, action) ? action : "view";
  }

  function frozenResult(payload) {
    return Object.freeze({ ...payload });
  }

  function setNavigationElementVisibility(element, visible) {
    if (!element) return;
    element.classList.toggle("hidden", !visible);
    element.hidden = !visible;
    element.setAttribute("aria-hidden", String(!visible));
    if ("disabled" in element) element.disabled = !visible;
    element.setAttribute("tabindex", visible ? "0" : "-1");
  }

  const engine = {
    version: "1.2.0-action-authorization",
    debugEnabled: false,
    navigationGroups: DEFAULT_NAVIGATION_GROUPS,
    actionBindings: ACTION_BINDINGS,
    actionGuardInstalled: false,

    initialize() {
      const source = legacyPermissions();
      const ready = Boolean(source?.permissionsLoaded || source?.currentRole?.() === "super_admin");
      this.applyNavigationVisibility();
      this.applyActionVisibility();
      this.installActionGuard();
      window.dispatchEvent(new CustomEvent("kyum-permission-engine-ready", {
        detail: frozenResult({ ready, role: this.currentRole(), version: this.version })
      }));
      return ready;
    },

    currentRole() {
      return legacyPermissions()?.currentRole?.() || "viewer";
    },

    isLoaded() {
      const source = legacyPermissions();
      return Boolean(source?.permissionsLoaded || this.currentRole() === "super_admin");
    },

    can(screenKey, action = "view") {
      const key = normalizeKey(screenKey);
      const normalizedAction = normalizeAction(action);
      if (!key) return false;
      const source = legacyPermissions();
      if (!source) return false;
      return source.canScreen?.(key, normalizedAction) === true;
    },

    canView(screenKey) { return this.can(screenKey, "view"); },
    canAdd(screenKey) { return this.can(screenKey, "add"); },
    canEdit(screenKey) { return this.can(screenKey, "edit"); },
    canDelete(screenKey) { return this.can(screenKey, "delete"); },
    canExport(screenKey) { return this.can(screenKey, "export"); },
    canImport(screenKey) { return this.can(screenKey, "import"); },

    requireAction(screenKey, action = "view", options = {}) {
      const key = normalizeKey(screenKey);
      const normalizedAction = normalizeAction(action);
      const allowed = this.can(key, normalizedAction);
      if (allowed) return true;
      const labels = { view: "عرض", add: "إضافة", edit: "تعديل", delete: "حذف", export: "تصدير", import: "استيراد" };
      const message = options.message || `لا توجد صلاحية ${labels[normalizedAction] || normalizedAction} لهذه الشاشة.`;
      window.dispatchEvent(new CustomEvent("kyum-permission-denied", {
        detail: frozenResult({ screenKey: key, action: normalizedAction, message })
      }));
      if (!options.silent) alert(message);
      return false;
    },

    applyActionBindings(root = document) {
      this.actionBindings.forEach(binding => {
        root.querySelectorAll?.(binding.selector).forEach(element => {
          element.dataset.permissionScreen = binding.screen;
          element.dataset.permissionAction = binding.action;
          if (binding.deniedMode) element.dataset.permissionDeniedMode = binding.deniedMode;
          if (binding.deniedMessage) element.dataset.permissionDeniedMessage = binding.deniedMessage;
        });
      });
    },

    applyActionVisibility(root = document) {
      this.applyActionBindings(root);
      root.querySelectorAll?.("[data-permission-screen][data-permission-action]").forEach(element => {
        const allowed = this.can(element.dataset.permissionScreen, element.dataset.permissionAction);
        const deniedMode = element.dataset.permissionDeniedMode || "hide";
        const keepVisibleDisabled = !allowed && deniedMode === "disable";
        element.classList.toggle("hidden", !allowed && !keepVisibleDisabled);
        element.hidden = !allowed && !keepVisibleDisabled;
        element.setAttribute("aria-hidden", String(!allowed && !keepVisibleDisabled));
        if ("disabled" in element) element.disabled = !allowed;
        element.setAttribute("aria-disabled", String(!allowed));
        element.setAttribute("tabindex", allowed ? "0" : keepVisibleDisabled ? "0" : "-1");
        if (keepVisibleDisabled) {
          element.title = element.dataset.permissionDeniedMessage || "لا توجد صلاحية لتنفيذ هذا الإجراء.";
        } else if (allowed && element.dataset.permissionDeniedMessage) {
          element.removeAttribute("title");
        }
      });
    },

    installActionGuard() {
      if (this.actionGuardInstalled) return;
      this.actionGuardInstalled = true;
      document.addEventListener("click", event => {
        let target = event.target?.closest?.("[data-permission-screen][data-permission-action]");
        if (!target) {
          const binding = this.actionBindings.find(item => event.target?.closest?.(item.selector));
          if (binding) {
            target = event.target.closest(binding.selector);
            target.dataset.permissionScreen = binding.screen;
            target.dataset.permissionAction = binding.action;
            if (binding.deniedMode) target.dataset.permissionDeniedMode = binding.deniedMode;
            if (binding.deniedMessage) target.dataset.permissionDeniedMessage = binding.deniedMessage;
          }
        }
        if (!target) return;
        if (this.can(target.dataset.permissionScreen, target.dataset.permissionAction)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.requireAction(target.dataset.permissionScreen, target.dataset.permissionAction, {
          message: target.dataset.permissionDeniedMessage || undefined
        });
      }, true);
    },

    allowedScreens() {
      return Object.freeze([...(legacyPermissions()?.allowedScreenKeys?.() || [])]);
    },

    authorize(screenKey, preferred = "dashboard") {
      const key = normalizeKey(screenKey);
      const result = legacyPermissions()?.authorizeView?.(key, preferred);
      if (result) return result;
      return frozenResult({
        allowed: false,
        requested: key,
        target: null,
        reason: key ? "permission_engine_unavailable" : "invalid_view"
      });
    },

    firstAllowedScreen(preferred = "dashboard") {
      return legacyPermissions()?.firstAllowedScreen?.(preferred) || null;
    },

    groupScreens(groupKey, root = document) {
      const key = normalizeKey(groupKey);
      const declared = this.navigationGroups[key];
      if (declared) return [...declared];
      const group = root.querySelector?.(`[data-nav-group="${CSS.escape(key)}"]`);
      if (!group) return [];
      return [...group.querySelectorAll(".nav-item[data-view]")]
        .map(item => normalizeKey(item.dataset.view))
        .filter(Boolean);
    },

    canShowGroup(groupKey, root = document) {
      return this.groupScreens(groupKey, root).some(screenKey => this.canView(screenKey));
    },

    applyNavigationVisibility(root = document) {
      root.querySelectorAll?.(".nav-item[data-view]").forEach(button => {
        setNavigationElementVisibility(button, this.canView(button.dataset.view));
      });

      root.querySelectorAll?.(".nav-group[data-nav-group]").forEach(group => {
        const groupKey = normalizeKey(group.dataset.navGroup);
        const visible = this.canShowGroup(groupKey, root);
        setNavigationElementVisibility(group, visible);
        if (!visible) {
          group.classList.add("is-collapsed");
          group.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "false");
        }
      });

      root.querySelectorAll?.("[data-mobile-view]").forEach(button => {
        setNavigationElementVisibility(button, this.canView(button.dataset.mobileView));
      });

      window.dispatchEvent(new CustomEvent("kyum-navigation-permissions-applied", {
        detail: frozenResult({ role: this.currentRole(), allowedScreens: this.allowedScreens() })
      }));
    },

    validateCurrentView(preferred = "dashboard") {
      const current = window.KYUMNavigation?.current?.()
        || String(location.hash || "").replace(/^#\/?/, "").split(/[?&]/)[0]
        || preferred;
      const authorization = this.authorize(current, preferred);
      if (authorization.allowed) return authorization;
      if (authorization.target && authorization.target !== current) {
        window.KYUMNavigation?.open?.(authorization.target, {
          silent: true,
          permissionFallback: true,
          replaceHistory: true
        });
      }
      return authorization;
    },

    snapshot() {
      const source = legacyPermissions();
      const rows = source?.screenPermissions instanceof Map
        ? [...source.screenPermissions.entries()].map(([screenKey, row]) => frozenResult({ screenKey, ...row }))
        : [];
      return frozenResult({
        engineVersion: this.version,
        role: this.currentRole(),
        loaded: this.isLoaded(),
        allowedScreens: this.allowedScreens(),
        rows: Object.freeze(rows)
      });
    },

    refresh(options = {}) {
      this.applyNavigationVisibility(options.root || document);
      this.applyActionVisibility(options.root || document);
      if (options.validateCurrentView !== false) this.validateCurrentView(options.preferred || "dashboard");
      const snapshot = this.snapshot();
      window.dispatchEvent(new CustomEvent("kyum-permissions-refreshed", { detail: snapshot }));
      return snapshot;
    },

    setDebug(enabled) {
      this.debugEnabled = enabled === true && this.currentRole() === "super_admin";
      return this.debugEnabled;
    },

    explain(screenKey, action = "view") {
      if (!this.debugEnabled || this.currentRole() !== "super_admin") return null;
      const key = normalizeKey(screenKey);
      const normalizedAction = normalizeAction(action);
      const source = legacyPermissions();
      const row = source?.screenPermissions?.get?.(key) || null;
      return frozenResult({
        screenKey: key,
        action: normalizedAction,
        field: ACTION_FIELD_MAP[normalizedAction],
        allowed: this.can(key, normalizedAction),
        role: this.currentRole(),
        permissionsLoaded: Boolean(source?.permissionsLoaded),
        source: row ? "current_user_screen_permissions" : (this.currentRole() === "super_admin" ? "super_admin_override" : "missing_permission_row")
      });
    }
  };

  window.PermissionEngine = Object.seal(engine);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => engine.initialize(), { once: true });
  } else {
    engine.initialize();
  }
})();
