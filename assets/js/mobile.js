
/* Phase M12.2 — Android runtime capability marker and defensive touch-lock recovery */
(() => {
  "use strict";
  const isAndroid = /Android/i.test(navigator.userAgent || "");
  if (!isAndroid) return;

  document.documentElement.classList.add("kyum-android");

  function recoverTouchLocks() {
    const sidebar = document.getElementById("mainSidebar");
    const launcher = document.getElementById("sidebarMenuToggle");
    const sidebarActuallyOpen = sidebar?.classList.contains("is-open") && launcher?.getAttribute("aria-expanded") === "true";
    if (!sidebarActuallyOpen) document.body.classList.remove("sidebar-menu-open");

    const dashboard = document.getElementById("dashboardView");
    if (!dashboard?.classList.contains("mobile-filters-open")) document.body.classList.remove("mobile-dashboard-sheet-open");

    const customers = document.getElementById("customersView");
    if (!customers?.classList.contains("mobile-customers-filters-open")) document.body.classList.remove("mobile-customers-sheet-open");
  }

  window.addEventListener("pageshow", recoverTouchLocks, { passive: true });
  window.addEventListener("hashchange", recoverTouchLocks, { passive: true });
  window.addEventListener("popstate", recoverTouchLocks, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recoverTouchLocks();
  }, { passive: true });
  window.setTimeout(recoverTouchLocks, 0);
})();

/* Phase M7.1 — Shared Saudi phone normalization */
(() => {
  "use strict";

  function normalizeSaudiPhone(value) {
    let digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("9660")) digits = `966${digits.slice(4)}`;
    else if (digits.startsWith("0") && digits.length === 10) digits = `966${digits.slice(1)}`;
    else if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;

    return /^9665\d{8}$/.test(digits) ? digits : "";
  }

  function whatsappUrl(value, text = "") {
    const phone = normalizeSaudiPhone(value);
    if (!phone) return "";
    return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  }

  function telephoneUrl(value) {
    const phone = normalizeSaudiPhone(value);
    return phone ? `tel:+${phone}` : "";
  }

  window.KYUMMobilePhone = Object.freeze({ normalizeSaudiPhone, whatsappUrl, telephoneUrl });
})();

/* Phase M7.1 — Compact mobile application header */
(() => {
  "use strict";
  const MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const header = document.getElementById("appHeader");
  const launcher = document.getElementById("sidebarMenuToggle");
  const title = document.querySelector("#appHeader .topbar-title");
  const originalLauncherMarkup = launcher?.innerHTML || "";
  if (!header || !launcher) return;

  function ensureHeader() {
    let brand = header.querySelector(".mobile-app-brand");
    if (!brand) {
      brand = document.createElement("div");
      brand.className = "mobile-app-brand";
      brand.setAttribute("aria-label", "PETATOE");
      brand.innerHTML = `<span><strong>KYUM</strong><small>CRM</small></span>`;
      title?.insertAdjacentElement("beforebegin", brand);
    }

    launcher.setAttribute("aria-label", "فتح القائمة");
    launcher.innerHTML = `<svg class="mobile-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
  }

  function sync() {
    if (MEDIA.matches) {
      ensureHeader();
      return;
    }
    header.querySelector(".mobile-app-brand")?.remove();
    if (launcher.querySelector(".mobile-menu-icon")) launcher.innerHTML = originalLauncherMarkup;
  }

  sync();
  MEDIA.addEventListener?.("change", sync);
})();
(() => {
  "use strict";

  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const nav = document.getElementById("mobileBottomNav");
  if (!nav) return;

  const viewButtons = [...nav.querySelectorAll("[data-mobile-view]")];
  const menuButton = nav.querySelector("[data-mobile-action='menu']");
  const dashboardView = document.getElementById("dashboardView");
  let dashboardFiltersOpen = false;
  let dashboardAppliedSnapshot = null;
  let pullStartY = 0;
  let pullTracking = false;
  let pullTriggered = false;

  function desktopViewButton(view) {
    return document.querySelector(`.nav-item[data-view="${view}"]`);
  }

  function syncPermissionVisibility() {
    viewButtons.forEach(button => {
      const viewKey = button.dataset.mobileView;
      const engineDecision = window.PermissionEngine?.canView?.(viewKey);
      const source = desktopViewButton(viewKey);
      const unavailable = typeof engineDecision === "boolean"
        ? !engineDecision
        : (!source || source.hidden || source.classList.contains("hidden") || source.getAttribute("aria-hidden") === "true");
      button.hidden = unavailable;
      button.classList.toggle("hidden", unavailable);
      button.setAttribute("aria-hidden", String(unavailable));
      button.disabled = unavailable;
      button.setAttribute("tabindex", unavailable ? "-1" : "0");
    });
  }

  function currentView() {
    const active = document.querySelector(".nav-item[data-view].active");
    if (active?.dataset.view) return active.dataset.view;
    const hash = location.hash.replace(/^#\/?/, "").split(/[?&]/)[0];
    return hash || "dashboard";
  }

  function syncActiveState() {
    const activeView = currentView();
    viewButtons.forEach(button => {
      const active = button.dataset.mobileView === activeView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    menuButton?.classList.remove("is-active");
    if (activeView !== "dashboard") closeDashboardFilters();
  }

  function openView(view) {
    const source = desktopViewButton(view);
    if (!source || source.hidden || source.classList.contains("hidden")) return;
    source.click();
    syncActiveState();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refreshDashboard({ announce = true } = {}) {
    if (!dashboardView || typeof window.renderDashboard !== "function") return;
    dashboardView.classList.add("mobile-dashboard-loading");
    const refreshButton = dashboardView.querySelector("[data-mobile-dashboard-refresh]");
    refreshButton?.classList.add("is-refreshing");
    refreshButton?.setAttribute("aria-busy", "true");

    window.requestAnimationFrame(() => {
      window.renderDashboard();
      window.setTimeout(() => {
        dashboardView.classList.remove("mobile-dashboard-loading");
        refreshButton?.classList.remove("is-refreshing");
        refreshButton?.setAttribute("aria-busy", "false");
        if (announce) {
          const status = dashboardView.querySelector("[data-mobile-dashboard-status]");
          if (status) {
            status.textContent = "تم تحديث لوحة التحكم";
            window.setTimeout(() => { status.textContent = ""; }, 1800);
          }
        }
      }, 280);
    });
  }

  function dashboardFilterControls() {
    return [...dashboardView.querySelectorAll(".dashboard-filters select, .dashboard-filters input")];
  }

  function captureDashboardFilters() {
    return dashboardFilterControls().map(control => [control.id, control.value]);
  }

  function restoreDashboardFilters(snapshot) {
    (snapshot || []).forEach(([id, value]) => {
      const control = document.getElementById(id);
      if (control) control.value = value;
    });
  }

  function closeDashboardFilters({ restore = false } = {}) {
    if (!dashboardView) return;
    if (restore) restoreDashboardFilters(dashboardAppliedSnapshot);
    dashboardFiltersOpen = false;
    dashboardView.classList.remove("mobile-filters-open");
    dashboardView.querySelector("[data-mobile-dashboard-filter]")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-dashboard-sheet-open");
  }

  function toggleDashboardFilters() {
    if (!dashboardView) return;
    const opening = !dashboardFiltersOpen;
    if (opening) dashboardAppliedSnapshot = captureDashboardFilters();
    else restoreDashboardFilters(dashboardAppliedSnapshot);
    dashboardFiltersOpen = opening;
    dashboardView.classList.toggle("mobile-filters-open", dashboardFiltersOpen);
    dashboardView.querySelector("[data-mobile-dashboard-filter]")?.setAttribute("aria-expanded", String(dashboardFiltersOpen));
    document.body.classList.toggle("mobile-dashboard-sheet-open", dashboardFiltersOpen);
  }

  function installDashboardShell() {
    if (!MOBILE_MEDIA.matches || !dashboardView || dashboardView.querySelector(".mobile-dashboard-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "mobile-dashboard-toolbar";
    toolbar.innerHTML = `
      <div class="mobile-dashboard-heading">
        <span>نظرة سريعة</span>
        <strong>لوحة التحكم</strong>
      </div>
      <div class="mobile-dashboard-actions">
        <button type="button" class="mobile-dashboard-action" data-mobile-dashboard-filter aria-expanded="false" aria-label="فتح فلاتر لوحة التحكم">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
          <span>الفلاتر</span>
        </button>
        <button type="button" class="mobile-dashboard-action" data-mobile-dashboard-refresh aria-label="تحديث لوحة التحكم">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7"/></svg>
          <span>تحديث</span>
        </button>
      </div>
      <span class="mobile-dashboard-status" data-mobile-dashboard-status aria-live="polite"></span>`;

    dashboardView.prepend(toolbar);

    const filterBar = dashboardView.querySelector(".dashboard-filter-bar");
    if (filterBar) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "mobile-filter-close";
      closeButton.setAttribute("aria-label", "إغلاق الفلاتر");
      closeButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
      filterBar.prepend(closeButton);
      closeButton.addEventListener("click", () => closeDashboardFilters({ restore: true }));

      const filtersGrid = filterBar.querySelector(".dashboard-filters");
      if (filtersGrid && !filtersGrid.querySelector("[data-mobile-dashboard-apply]")) {
        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.className = "primary-btn mobile-filter-apply";
        applyButton.dataset.mobileDashboardApply = "";
        applyButton.textContent = "تنفيذ الفلترة";
        filtersGrid.append(applyButton);
        applyButton.addEventListener("click", () => {
          dashboardAppliedSnapshot = captureDashboardFilters();
          closeDashboardFilters();
          document.dispatchEvent(new CustomEvent("kyum-apply-dashboard-filters"));
        });
      }
    }

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "mobile-dashboard-filter-backdrop";
    backdrop.setAttribute("aria-label", "إغلاق فلاتر لوحة التحكم");
    dashboardView.append(backdrop);

    toolbar.querySelector("[data-mobile-dashboard-filter]")?.addEventListener("click", toggleDashboardFilters);
    toolbar.querySelector("[data-mobile-dashboard-refresh]")?.addEventListener("click", () => refreshDashboard());
    backdrop.addEventListener("click", () => closeDashboardFilters({ restore: true }));
  }

  function installPullToRefresh() {
    if (!dashboardView) return;

    document.addEventListener("touchstart", event => {
      if (!MOBILE_MEDIA.matches || currentView() !== "dashboard" || dashboardFiltersOpen || window.scrollY > 0) return;
      pullStartY = event.touches[0]?.clientY || 0;
      pullTracking = true;
      pullTriggered = false;
    }, { passive: true });

    document.addEventListener("touchmove", event => {
      if (!pullTracking || pullTriggered) return;
      const currentY = event.touches[0]?.clientY || 0;
      const distance = currentY - pullStartY;
      dashboardView.classList.toggle("mobile-pull-ready", distance > 72);
      if (distance > 96) pullTriggered = true;
    }, { passive: true });

    document.addEventListener("touchend", () => {
      if (!pullTracking) return;
      dashboardView.classList.remove("mobile-pull-ready");
      pullTracking = false;
      if (pullTriggered) refreshDashboard();
      pullTriggered = false;
    }, { passive: true });
  }

  viewButtons.forEach(button => {
    button.addEventListener("click", () => openView(button.dataset.mobileView));
  });

  menuButton?.addEventListener("click", () => {
    const launcher = document.getElementById("sidebarMenuToggle");
    if (!launcher) return;
    launcher.click();
    menuButton.classList.toggle("is-active", launcher.getAttribute("aria-expanded") === "true");
  });

  document.getElementById("sidebarBackdrop")?.addEventListener("click", () => menuButton?.classList.remove("is-active"));
  document.getElementById("mainSidebar")?.addEventListener("click", event => {
    if (event.target.closest(".nav-item[data-view]")) menuButton?.classList.remove("is-active");
  });

  const observer = new MutationObserver(() => {
    syncPermissionVisibility();
    syncActiveState();
  });

  document.querySelectorAll(".nav-item[data-view]").forEach(button => {
    observer.observe(button, { attributes: true, attributeFilter: ["class", "hidden", "aria-hidden"] });
  });

  window.addEventListener("hashchange", syncActiveState);
  window.addEventListener("popstate", syncActiveState);
  window.addEventListener("customer-auth-ready", () => {
    syncPermissionVisibility();
    syncActiveState();
    if (MOBILE_MEDIA.matches) {
      installDashboardShell();
      installCustomersShell();
      // The main application already renders after authentication. Avoid a second
      // full dashboard render, which is expensive on Android WebView.
    }
  });

  MOBILE_MEDIA.addEventListener?.("change", event => {
    if (event.matches) {
      installDashboardShell();
      installCustomersShell();
      syncPermissionVisibility();
      syncActiveState();
      return;
    }
    menuButton?.classList.remove("is-active");
    closeDashboardFilters();
    closeCustomersFilters();
  });

  const customersView = document.getElementById("customersView");
  let customersFiltersOpen = false;

  function customerPhoneFromRow(row) {
    const cell = row?.querySelector("td:first-child strong");
    return String(cell?.textContent || "").replace(/[^\d+]/g, "");
  }

  function decorateCustomerRows() {
    if (!customersView) return;
    const labels = ["رقم العميل", "اسم العميل", "اسم المسؤول", "التصنيف", "مجال الاهتمام", "المندوب", "تاريخ التواصل", "رقم عرض السعر", "سبب عدم البيع", "الإجراءات"];
    const fields = ["phone", "name", "contact", "type", "interests", "representative", "date", "quotation", "reason", "actions"];
    customersView.querySelectorAll("#customersTableBody tr").forEach(row => {
      const cells = [...row.children];
      if (cells.length !== 10) return;
      cells.forEach((cell, index) => {
        cell.dataset.mobileLabel = labels[index];
        cell.dataset.mobileField = fields[index];
      });
      const actions = cells[9]?.querySelector(".row-actions");
      const phone = customerPhoneFromRow(row);
      if (!actions || !phone) return;
      if (!actions.querySelector(".mobile-customer-call")) {
        const call = document.createElement("a");
        call.className = "mobile-customer-call";
        call.href = window.KYUMMobilePhone.telephoneUrl(phone) || `tel:${phone}`;
        call.textContent = "اتصال";
        call.setAttribute("aria-label", `اتصال بالعميل ${phone}`);
        actions.append(call);
      }
      if (!actions.querySelector(".mobile-customer-whatsapp")) {
        const whatsapp = document.createElement("a");
        whatsapp.className = "mobile-customer-whatsapp";
        whatsapp.href = window.KYUMMobilePhone.whatsappUrl(phone);
        whatsapp.target = "_blank";
        whatsapp.rel = "noopener noreferrer";
        whatsapp.textContent = "WhatsApp";
        whatsapp.setAttribute("aria-label", `فتح واتساب للعميل ${phone}`);
        actions.append(whatsapp);
      }
    });
  }

  function closeCustomersFilters() {
    if (!customersView) return;
    customersFiltersOpen = false;
    customersView.classList.remove("mobile-customers-filters-open");
    customersView.querySelector("[data-mobile-customers-filter]")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-customers-sheet-open");
  }

  function syncCustomersFilterState() {
    if (!customersView) return;
    const active = [...customersView.querySelectorAll(".filters-row select")].some(select => Boolean(select.value));
    customersView.querySelector("[data-mobile-customers-filter]")?.classList.toggle("has-filter", active);
  }

  function installCustomersShell() {
    if (!MOBILE_MEDIA.matches || !customersView || customersView.querySelector("[data-mobile-customers-filter]")) return;
    const actions = customersView.querySelector(".actions-row");
    const filters = customersView.querySelector(".filters-row");
    if (!actions || !filters) return;

    const filterButton = document.createElement("button");
    filterButton.type = "button";
    filterButton.className = "mobile-customers-filter-btn";
    filterButton.dataset.mobileCustomersFilter = "";
    filterButton.setAttribute("aria-label", "فتح فلاتر العملاء");
    filterButton.setAttribute("aria-expanded", "false");
    filterButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`;
    actions.append(filterButton);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "mobile-customers-filter-close";
    close.setAttribute("aria-label", "إغلاق فلاتر العملاء");
    close.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
    filters.prepend(close);

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "mobile-customers-filter-backdrop";
    backdrop.setAttribute("aria-label", "إغلاق فلاتر العملاء");
    customersView.append(backdrop);

    filterButton.addEventListener("click", () => {
      customersFiltersOpen = !customersFiltersOpen;
      customersView.classList.toggle("mobile-customers-filters-open", customersFiltersOpen);
      filterButton.setAttribute("aria-expanded", String(customersFiltersOpen));
      document.body.classList.toggle("mobile-customers-sheet-open", customersFiltersOpen);
    });
    close.addEventListener("click", closeCustomersFilters);
    backdrop.addEventListener("click", closeCustomersFilters);
    filters.querySelectorAll("select").forEach(select => select.addEventListener("change", () => {
      syncCustomersFilterState();
      window.setTimeout(closeCustomersFilters, 120);
    }));

    const body = customersView.querySelector("#customersTableBody");
    if (body) new MutationObserver(decorateCustomerRows).observe(body, { childList: true, subtree: true });
    decorateCustomerRows();
    syncCustomersFilterState();
  }


  function normalizeCustomer360Phone(value) {
    return String(value || "").replace(/[^\d+]/g, "").trim();
  }

  function decorateCustomer360() {
    const dialog = document.getElementById("customerDetailsDialog");
    const content = document.getElementById("customerDetailsContent");
    const subtitle = document.getElementById("customerDetailsSubtitle");
    if (!dialog || !content || !dialog.open || !MOBILE_MEDIA.matches) return;

    document.body.classList.add("mobile-customer360-open");
    const phoneCandidate = normalizeCustomer360Phone((subtitle?.textContent || "").split("·")[0]);
    const hasPhone = /\d{7,}/.test(phoneCandidate);

    let actions = content.querySelector(".mobile-customer360-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "mobile-customer360-actions";
      content.prepend(actions);
    }
    actions.innerHTML = hasPhone ? `
      <a href="tel:${phoneCandidate}" data-kind="call" aria-label="اتصال بالعميل">اتصال بالعميل</a>
      <a href="${window.KYUMMobilePhone.whatsappUrl(phoneCandidate)}" target="_blank" rel="noopener noreferrer" data-kind="whatsapp" aria-label="فتح واتساب للعميل">WhatsApp</a>
    ` : "";
    actions.hidden = !hasPhone;

    let jumpNav = content.querySelector(".mobile-customer360-jumpnav");
    if (!jumpNav) {
      jumpNav = document.createElement("nav");
      jumpNav.className = "mobile-customer360-jumpnav";
      jumpNav.setAttribute("aria-label", "أقسام ملف العميل");
      const sections = [...content.querySelectorAll(".customer360-section")];
      const wanted = ["البيانات الأساسية", "عروض الأسعار", "ملخص المتابعة", "سجل النشاط الموحد", "سجل المتابعات"];
      wanted.forEach(label => {
        const target = sections.find(section => section.querySelector("h3")?.textContent.trim() === label);
        if (!target) return;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label.replace("سجل النشاط الموحد", "النشاط").replace("البيانات الأساسية", "البيانات").replace("ملخص المتابعة", "المتابعة").replace("سجل المتابعات", "السجل");
        button.addEventListener("click", () => target.scrollIntoView({ behavior: "smooth", block: "start" }));
        jumpNav.append(button);
      });
      actions.after(jumpNav);
    }
  }

  function installCustomer360Shell() {
    const dialog = document.getElementById("customerDetailsDialog");
    const content = document.getElementById("customerDetailsContent");
    if (!dialog || !content) return;
    const observer = new MutationObserver(() => window.requestAnimationFrame(decorateCustomer360));
    observer.observe(content, { childList: true, subtree: false });
    dialog.addEventListener("close", () => document.body.classList.remove("mobile-customer360-open"));
    dialog.addEventListener("cancel", () => document.body.classList.remove("mobile-customer360-open"));
  }

  if (MOBILE_MEDIA.matches) {
    installDashboardShell();
    installCustomersShell();
  }
  installPullToRefresh();
  installCustomer360Shell();
  window.addEventListener("kyum-permissions-refreshed", () => {
    syncPermissionVisibility();
    syncActiveState();
  });
  window.addEventListener("kyum-navigation-permissions-applied", syncPermissionVisibility);

  syncPermissionVisibility();
  syncActiveState();
})();

/* KYUM Mobile Enterprise — Phase M5: Follow-ups */
(() => {
  "use strict";

  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const followupsView = document.getElementById("followupsView");
  if (!followupsView) return;

  let filtersOpen = false;
  let rowObserver = null;

  const labels = [
    "العميل",
    "رقم العميل",
    "تاريخ التواصل",
    "طريقة التواصل",
    "المندوب",
    "نتيجة التواصل",
    "عرض السعر",
    "المتابعة القادمة",
    "الحالة",
    "الإجراءات"
  ];

  const fields = [
    "customer",
    "phone",
    "contact-date",
    "method",
    "representative",
    "result",
    "quotation",
    "next-date",
    "status",
    "actions"
  ];

  function normalizePhone(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function closeFilters() {
    filtersOpen = false;
    followupsView.classList.remove("mobile-followups-filters-open");
    followupsView.querySelector("[data-mobile-followups-filter]")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-followups-sheet-open");
  }

  function toggleFilters() {
    filtersOpen = !filtersOpen;
    followupsView.classList.toggle("mobile-followups-filters-open", filtersOpen);
    followupsView.querySelector("[data-mobile-followups-filter]")?.setAttribute("aria-expanded", String(filtersOpen));
    document.body.classList.toggle("mobile-followups-sheet-open", filtersOpen);
  }

  function activeStatusLabel() {
    const select = document.getElementById("followupStatusFilter");
    return select?.selectedOptions?.[0]?.textContent?.trim() || "كل المتابعات";
  }

  function updateToolbarState() {
    const active = followupsView.querySelector("[data-mobile-followups-active-filter]");
    if (active) active.textContent = activeStatusLabel();

    const selected = document.getElementById("followupStatusFilter")?.value || "";
    followupsView.querySelectorAll("[data-mobile-followups-status]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.mobileFollowupsStatus === selected);
    });
  }

  function applyQuickStatus(status) {
    const select = document.getElementById("followupStatusFilter");
    if (!select) return;
    select.value = status;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    updateToolbarState();
  }

  function installShell() {
    if (followupsView.querySelector(".mobile-followups-toolbar")) return;

    const actions = followupsView.querySelector(":scope > .actions-row");
    const stats = document.getElementById("followupStats");
    const filters = followupsView.querySelector(".followup-filters");

    const toolbar = document.createElement("div");
    toolbar.className = "mobile-followups-toolbar";
    toolbar.innerHTML = `
      <div class="mobile-followups-heading">
        <span>إدارة التواصل</span>
        <strong>المتابعات</strong>
        <small data-mobile-followups-active-filter>كل المتابعات</small>
      </div>
      <button type="button" class="mobile-followups-filter-button" data-mobile-followups-filter aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        <span>الفلاتر</span>
      </button>`;

    actions?.insertAdjacentElement("afterend", toolbar);

    const quickNav = document.createElement("div");
    quickNav.className = "mobile-followups-quicknav";
    quickNav.setAttribute("aria-label", "فلترة المتابعات حسب الحالة");
    quickNav.innerHTML = `
      <button type="button" data-mobile-followups-status="">الكل</button>
      <button type="button" data-mobile-followups-status="today">اليوم</button>
      <button type="button" data-mobile-followups-status="overdue">المتأخرة</button>
      <button type="button" data-mobile-followups-status="upcoming">القادمة</button>
      <button type="button" data-mobile-followups-status="completed">المكتملة</button>`;
    stats?.insertAdjacentElement("afterend", quickNav);

    if (filters) {
      filters.classList.add("mobile-followups-filter-sheet");
      const header = document.createElement("div");
      header.className = "mobile-followups-sheet-header";
      header.innerHTML = `
        <div><span>خيارات العرض</span><strong>فلترة المتابعات</strong></div>
        <button type="button" class="mobile-followups-filter-close" aria-label="إغلاق الفلاتر">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>`;
      filters.prepend(header);
      header.querySelector("button")?.addEventListener("click", closeFilters);
    }

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "mobile-followups-filter-backdrop";
    backdrop.setAttribute("aria-label", "إغلاق فلاتر المتابعات");
    followupsView.append(backdrop);

    toolbar.querySelector("[data-mobile-followups-filter]")?.addEventListener("click", toggleFilters);
    backdrop.addEventListener("click", closeFilters);

    quickNav.querySelectorAll("[data-mobile-followups-status]").forEach(button => {
      button.addEventListener("click", () => applyQuickStatus(button.dataset.mobileFollowupsStatus || ""));
    });

    followupsView.querySelectorAll("#followupStatusFilter, #followupRepFilter").forEach(control => {
      control.addEventListener("change", () => {
        updateToolbarState();
        window.setTimeout(closeFilters, 120);
      });
    });

    updateToolbarState();
  }

  function decorateRows() {
    followupsView.querySelectorAll("#followupsTableBody tr").forEach(row => {
      const cells = [...row.children];
      if (cells.length !== 10) return;

      cells.forEach((cell, index) => {
        cell.dataset.mobileLabel = labels[index];
        cell.dataset.mobileField = fields[index];
      });

      const actionCell = cells[9];
      const actions = actionCell?.querySelector(".row-actions");
      const phone = normalizePhone(cells[1]?.textContent);
      const editButton = actions?.querySelector("[data-edit-followup]");
      if (!actions) return;

      if (phone && !actions.querySelector(".mobile-followup-call")) {
        const call = document.createElement("a");
        call.className = "mobile-followup-call";
        call.href = window.KYUMMobilePhone.telephoneUrl(phone) || `tel:${phone}`;
        call.textContent = "اتصال";
        call.setAttribute("aria-label", "اتصال بالعميل");
        actions.prepend(call);
      }

      if (phone && !actions.querySelector(".mobile-followup-whatsapp")) {
        const whatsapp = document.createElement("a");
        whatsapp.className = "mobile-followup-whatsapp";
        whatsapp.href = window.KYUMMobilePhone.whatsappUrl(phone);
        whatsapp.target = "_blank";
        whatsapp.rel = "noopener noreferrer";
        whatsapp.textContent = "واتساب";
        whatsapp.setAttribute("aria-label", "فتح واتساب للعميل");
        actions.insertBefore(whatsapp, editButton || actions.firstChild);
      }

      if (editButton && !actions.querySelector(".mobile-followup-update")) {
        const update = document.createElement("button");
        update.type = "button";
        update.className = "mobile-followup-update";
        update.dataset.editFollowup = editButton.dataset.editFollowup;
        update.textContent = "تحديث الحالة";
        actions.insertBefore(update, editButton);
        editButton.textContent = "تعديل التفاصيل";
      }
    });
  }

  function observeRows() {
    const body = document.getElementById("followupsTableBody");
    if (!body || rowObserver) return;
    rowObserver = new MutationObserver(decorateRows);
    rowObserver.observe(body, { childList: true, subtree: true });
    decorateRows();
  }

  function syncMobileState() {
    if (!MOBILE_MEDIA.matches) closeFilters();
    updateToolbarState();
    decorateRows();
  }

  installShell();
  observeRows();
  syncMobileState();

  window.addEventListener("customer-auth-ready", syncMobileState);
  window.addEventListener("hashchange", syncMobileState);
  MOBILE_MEDIA.addEventListener?.("change", syncMobileState);
})();

/* KYUM Mobile Enterprise — Phase M6: Daily Operations */
(() => {
  "use strict";

  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const view = document.getElementById("dailyOperationsView");
  if (!view) return;

  const tableLabels = new Map([
    ["dailyFollowupsBody", ["العميل", "المندوب", "طريقة التواصل", "النتيجة", "المتابعة القادمة"]],
    ["dailyCustomersBody", ["العميل", "التصنيف", "اسم المسؤول", "المندوب", "وقت الإضافة"]],
    ["dailyQuotationsBody", ["العميل", "المندوب", "رقم العرض", "الحالة", "القيمة"]],
    ["dailyOverdueBody", ["العميل", "المندوب", "الموعد", "التأخير", "النتيجة السابقة"]]
  ]);

  let observer = null;
  let refreshTimer = null;

  function labelRows(body, labels) {
    if (!body) return;
    [...body.rows].forEach(row => {
      [...row.cells].forEach((cell, index) => {
        if (!cell.classList.contains("empty-state")) {
          cell.dataset.mobileLabel = labels[index] || "بيان";
        }
      });
    });
  }

  function syncTables() {
    tableLabels.forEach((labels, id) => labelRows(document.getElementById(id), labels));
  }

  function completionPercent() {
    const value = document.getElementById("dailyTasksCompletionRate")?.textContent || "0";
    return Math.max(0, Math.min(100, Number.parseInt(value, 10) || 0));
  }

  function syncProgress() {
    const ring = view.querySelector(".mobile-daily-progress-ring");
    const value = view.querySelector("[data-mobile-daily-progress-value]");
    const meta = view.querySelector("[data-mobile-daily-progress-meta]");
    const percent = completionPercent();
    if (ring) ring.style.setProperty("--progress", String(percent));
    if (value) value.textContent = `${percent}%`;
    if (meta) meta.textContent = document.getElementById("dailyTasksCompletionText")?.textContent || "0 من 0";
  }

  function scrollToSelector(selector) {
    const target = view.querySelector(selector);
    if (!target) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function openView(viewName) {
    document.querySelector(`.nav-item[data-view="${viewName}"]`)?.click();
  }

  function refreshDailyOperations() {
    if (!MOBILE_MEDIA.matches) return;
    view.classList.add("mobile-daily-refreshing");
    document.querySelector('.nav-item[data-view="dailyOperations"]')?.click();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      syncTables();
      syncProgress();
      view.classList.remove("mobile-daily-refreshing");
    }, 900);
  }

  function ensureToolbar() {
    if (view.querySelector(".mobile-daily-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.className = "mobile-daily-toolbar";
    toolbar.innerHTML = `
      <div class="mobile-daily-toolbar-head">
        <div class="mobile-daily-progress">
          <div class="mobile-daily-progress-ring" aria-hidden="true"><strong data-mobile-daily-progress-value>0%</strong></div>
          <div class="mobile-daily-progress-copy">
            <strong>تقدم يوم العمل</strong>
            <small data-mobile-daily-progress-meta>0 من 0</small>
          </div>
        </div>
      </div>
      <div class="mobile-daily-toolbar-actions">
        <button type="button" class="secondary-btn" data-mobile-daily-refresh>تحديث اليوم</button>
        <button type="button" class="primary-btn" data-mobile-daily-report>تقرير الأداء</button>
      </div>
      <nav class="mobile-daily-jump-nav" aria-label="أقسام التشغيل اليومي">
        <button type="button" data-mobile-daily-jump=".daily-checklist-panel">المهام</button>
        <button type="button" data-mobile-daily-jump=".daily-targets-panel">الأهداف</button>
        <button type="button" data-mobile-daily-jump="#dailyFollowupsBody">المتابعات</button>
        <button type="button" data-mobile-daily-jump="#dailyCustomersBody">العملاء</button>
        <button type="button" data-mobile-daily-jump=".daily-alerts-panel">التنبيهات</button>
        <button type="button" data-mobile-daily-jump=".daily-overdue-panel">المتأخرة</button>
      </nav>`;
    view.prepend(toolbar);

    toolbar.querySelector("[data-mobile-daily-refresh]")?.addEventListener("click", refreshDailyOperations);
    toolbar.querySelector("[data-mobile-daily-report]")?.addEventListener("click", () => openView("dailyPerformanceReport"));
    toolbar.querySelectorAll("[data-mobile-daily-jump]").forEach(button => {
      button.addEventListener("click", () => scrollToSelector(button.dataset.mobileDailyJump));
    });
  }

  function connectObserver() {
    observer?.disconnect();
    observer = new MutationObserver(() => {
      syncTables();
      syncProgress();
    });
    [
      document.getElementById("dailyChecklist"),
      document.getElementById("dailyFollowupsBody"),
      document.getElementById("dailyCustomersBody"),
      document.getElementById("dailyQuotationsBody"),
      document.getElementById("dailyOverdueBody"),
      document.getElementById("dailyTasksCompletionRate"),
      document.getElementById("dailyTasksCompletionText")
    ].filter(Boolean).forEach(node => observer.observe(node, { childList: true, subtree: true, characterData: true }));
  }

  function initialize() {
    ensureToolbar();
    syncTables();
    syncProgress();
    connectObserver();
  }

  initialize();
  MOBILE_MEDIA.addEventListener?.("change", initialize);
})();


/* Phase M7 — Mobile Quotations */
(() => {
  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const view = document.getElementById("quotationsView");
  const body = document.getElementById("quotationsTableBody");
  const filters = view?.querySelector(".quotation-filters");
  if (!view || !body || !filters) return;

  let observer;
  const labels = ["رقم العرض", "العميل", "رقم العميل", "المندوب", "تاريخ العرض", "القيمة", "الحالة", "تاريخ الانتهاء", "سبب الرفض", "الإجراءات"];

  function normalizePhone(value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "—") return "";
    return raw.replace(/[^\d+]/g, "");
  }

  function getRowData(row) {
    const cells = [...row.cells];
    return {
      code: cells[0]?.textContent.trim() || "—",
      customer: cells[1]?.textContent.trim() || "—",
      phone: cells[2]?.textContent.trim() || "",
      representative: cells[3]?.textContent.trim() || "—",
      date: cells[4]?.textContent.trim() || "—",
      amount: cells[5]?.textContent.trim() || "—",
      status: cells[6]?.textContent.trim() || "—",
      expiry: cells[7]?.textContent.trim() || "—",
      rejection: cells[8]?.textContent.trim() || "—"
    };
  }

  function quotationText(data) {
    return `عرض سعر ${data.code}\nالعميل: ${data.customer}\nالمندوب: ${data.representative}\nالتاريخ: ${data.date}\nالقيمة: ${data.amount}\nالحالة: ${data.status}\nتاريخ الانتهاء: ${data.expiry}`;
  }

  async function shareQuotation(data) {
    const text = quotationText(data);
    if (navigator.share) {
      try { await navigator.share({ title: `عرض سعر ${data.code}`, text }); return; } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      window.alert("تم نسخ بيانات عرض السعر.");
    } catch {
      window.prompt("انسخ بيانات عرض السعر:", text);
    }
  }

  function printQuotation(data) {
    const popup = window.open("", "_blank", "width=720,height=900");
    if (!popup) return;
    const escape = value => String(value ?? "").replace(/[&<>\"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>عرض سعر ${escape(data.code)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#172033}h1{font-size:24px;margin:0 0 24px}.card{border:1px solid #d8dee9;border-radius:16px;padding:20px}.row{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:11px 0;border-bottom:1px solid #edf0f5}.row:last-child{border:0}.label{color:#667085;font-weight:700}@media print{body{padding:0}.card{border-color:#aaa}}</style></head><body><h1>عرض سعر ${escape(data.code)}</h1><div class="card"><div class="row"><span class="label">العميل</span><strong>${escape(data.customer)}</strong></div><div class="row"><span class="label">رقم العميل</span><strong>${escape(data.phone || "—")}</strong></div><div class="row"><span class="label">المندوب</span><strong>${escape(data.representative)}</strong></div><div class="row"><span class="label">تاريخ العرض</span><strong>${escape(data.date)}</strong></div><div class="row"><span class="label">القيمة</span><strong>${escape(data.amount)}</strong></div><div class="row"><span class="label">الحالة</span><strong>${escape(data.status)}</strong></div><div class="row"><span class="label">تاريخ الانتهاء</span><strong>${escape(data.expiry)}</strong></div><div class="row"><span class="label">سبب الرفض</span><strong>${escape(data.rejection)}</strong></div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }

  function enhanceRows() {
    if (!MOBILE_MEDIA.matches) return;
    [...body.rows].forEach(row => {
      if (row.querySelector(".empty-state")) return;
      [...row.cells].forEach((cell, index) => cell.dataset.mobileLabel = labels[index] || "");
      if (row.dataset.mobileQuotationReady === "true") return;
      row.dataset.mobileQuotationReady = "true";
      const data = getRowData(row);
      const actions = row.cells[9]?.querySelector(".row-actions") || row.cells[9];
      if (!actions) return;

      const phone = normalizePhone(data.phone);
      if (phone) {
        const call = document.createElement("a");
        call.className = "mobile-quotation-call";
        call.href = window.KYUMMobilePhone.telephoneUrl(phone) || `tel:${phone}`;
        call.textContent = "اتصال";
        actions.prepend(call);

        const whatsapp = document.createElement("a");
        whatsapp.className = "mobile-quotation-whatsapp";
        whatsapp.href = window.KYUMMobilePhone.whatsappUrl(phone, quotationText(data));
        whatsapp.target = "_blank";
        whatsapp.rel = "noopener";
        whatsapp.textContent = "WhatsApp";
        actions.append(whatsapp);
      }

      const share = document.createElement("button");
      share.type = "button";
      share.className = "mobile-quotation-share";
      share.textContent = "مشاركة";
      share.addEventListener("click", () => shareQuotation(getRowData(row)));
      actions.append(share);

      const print = document.createElement("button");
      print.type = "button";
      print.className = "mobile-quotation-print";
      print.textContent = "PDF / طباعة";
      print.addEventListener("click", () => printQuotation(getRowData(row)));
      actions.append(print);
    });
  }

  let appliedFilterSnapshot = null;

  function quoteFilterControls() {
    return [...filters.querySelectorAll("input, select")];
  }

  function captureQuoteFilters() {
    return quoteFilterControls().map(control => [control.id, control.value]);
  }

  function restoreQuoteFilters(snapshot) {
    (snapshot || []).forEach(([id, value]) => {
      const control = document.getElementById(id);
      if (control) control.value = value;
    });
  }

  function closeFilters({ restore = false } = {}) {
    if (restore) restoreQuoteFilters(appliedFilterSnapshot);
    view.classList.remove("mobile-quotations-filters-open");
    view.querySelector("[data-mobile-quotations-filter]")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-quotations-sheet-open");
  }

  function ensureToolbar() {
    if (view.querySelector(".mobile-quotations-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.className = "mobile-quotations-toolbar";
    toolbar.innerHTML = `<div><strong>عروض الأسعار</strong><small>ابحث وراجع وشارك العروض بسهولة</small></div><button type="button" data-mobile-quotations-filter aria-expanded="false">الفلاتر</button>`;
    view.querySelector(".actions-row")?.after(toolbar);

    filters.classList.add("mobile-quotations-filter-sheet");
    const sheetHeader = document.createElement("div");
    sheetHeader.className = "mobile-quotations-sheet-header";
    sheetHeader.innerHTML = `<div><strong>فلترة عروض الأسعار</strong><small>البحث والحالة والمندوب</small></div><button type="button" aria-label="إغلاق">×</button>`;
    filters.prepend(sheetHeader);

    if (!filters.querySelector("[data-mobile-quotations-apply]")) {
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.className = "primary-btn mobile-filter-apply";
      applyButton.dataset.mobileQuotationsApply = "";
      applyButton.textContent = "تنفيذ الفلترة";
      filters.append(applyButton);
      applyButton.addEventListener("click", () => {
        appliedFilterSnapshot = captureQuoteFilters();
        closeFilters();
        document.dispatchEvent(new CustomEvent("kyum-apply-quotation-filters"));
        window.setTimeout(enhanceRows, 0);
      });
    }

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "mobile-quotations-filter-backdrop";
    backdrop.setAttribute("aria-label", "إغلاق الفلاتر");
    view.append(backdrop);

    toolbar.querySelector("button")?.addEventListener("click", () => {
      const open = !view.classList.contains("mobile-quotations-filters-open");
      if (open) appliedFilterSnapshot = captureQuoteFilters();
      else restoreQuoteFilters(appliedFilterSnapshot);
      view.classList.toggle("mobile-quotations-filters-open", open);
      toolbar.querySelector("button")?.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("mobile-quotations-sheet-open", open);
    });
    sheetHeader.querySelector("button")?.addEventListener("click", () => closeFilters({ restore: true }));
    backdrop.addEventListener("click", () => closeFilters({ restore: true }));
  }

  function initialize() {
    ensureToolbar();
    enhanceRows();
    observer?.disconnect();
    observer = new MutationObserver(enhanceRows);
    observer.observe(body, { childList: true, subtree: true });
  }

  initialize();
  MOBILE_MEDIA.addEventListener?.("change", initialize);
})();

/* Phase M8 — Mobile Reports */
(() => {
  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const view = document.getElementById("reportsOverviewView");
  const filters = view?.querySelector(".reports-filter-bar");
  const performanceBody = document.getElementById("representativePerformanceBody");
  if (!view || !filters) return;

  let observer;
  let refreshTimer;
  const performanceLabels = ["المندوب", "العملاء", "المتابعات", "العروض", "المقبولة", "قيمة العروض", "نسبة التحويل"];
  const jumpTargets = [
    ["المؤشرات", ".reports-kpi-grid"],
    ["المبيعات", ".report-funnel-panel"],
    ["العملاء", "#customerAnalyticsBreakdown"],
    ["الخسارة", "#lossReasonsAnalytics"],
    ["الاتجاه", "#reportsMonthlyTrend"],
    ["المندوبون", "#representativeLeaderboard"],
    ["أفضل 10", ".top10-grid"],
    ["الأداء", "#representativePerformanceBody"]
  ];

  function scrollToTarget(selector) {
    const target = view.querySelector(selector);
    if (!target) return;
    const panel = target.closest(".panel") || target;
    panel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function closeFilters() {
    view.classList.remove("mobile-reports-filters-open");
    document.body.classList.remove("mobile-reports-sheet-open");
    view.querySelector("[data-mobile-reports-filter]")?.setAttribute("aria-expanded", "false");
  }

  function syncPeriodSummary() {
    const current = document.getElementById("executiveCurrentPeriod")?.textContent?.trim() || "—";
    const target = document.getElementById("executiveTargetAchievement")?.textContent?.trim() || "0%";
    const currentNode = view.querySelector("[data-mobile-report-period]");
    const targetNode = view.querySelector("[data-mobile-report-target]");
    if (currentNode) currentNode.textContent = current;
    if (targetNode) targetNode.textContent = target;
  }

  function enhancePerformanceTable() {
    if (!performanceBody || !MOBILE_MEDIA.matches) return;
    [...performanceBody.rows].forEach(row => {
      if (row.querySelector(".empty-state")) return;
      [...row.cells].forEach((cell, index) => cell.dataset.mobileLabel = performanceLabels[index] || "");
    });
  }

  function setLoading(active) {
    view.classList.toggle("mobile-reports-loading", active);
  }

  function refreshReports() {
    if (!MOBILE_MEDIA.matches) return;
    setLoading(true);
    document.getElementById("refreshReportsBtn")?.click();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      syncPeriodSummary();
      enhancePerformanceTable();
      setLoading(false);
    }, 900);
  }

  function ensureToolbar() {
    if (view.querySelector(".mobile-reports-toolbar")) return;
    const toolbar = document.createElement("section");
    toolbar.className = "mobile-reports-toolbar";
    toolbar.innerHTML = `
      <div class="mobile-reports-toolbar-copy">
        <span>ملخص تنفيذي</span>
        <strong>التقارير والتحليلات</strong>
        <small><b data-mobile-report-period>—</b><i>تحقيق الهدف <b data-mobile-report-target>0%</b></i></small>
      </div>
      <div class="mobile-reports-toolbar-actions">
        <button type="button" data-mobile-reports-refresh aria-label="تحديث التقارير">تحديث</button>
        <button type="button" data-mobile-reports-filter aria-expanded="false">الفلاتر</button>
        <button type="button" data-mobile-reports-export>تصدير</button>
      </div>
      <nav class="mobile-reports-jump-nav" aria-label="أقسام التقارير">
        ${jumpTargets.map(([label, selector], index) => `<button type="button" data-mobile-report-jump="${selector}"${index === 0 ? ' class="active"' : ""}>${label}</button>`).join("")}
      </nav>`;
    view.prepend(toolbar);

    toolbar.querySelector("[data-mobile-reports-refresh]")?.addEventListener("click", refreshReports);
    toolbar.querySelector("[data-mobile-reports-export]")?.addEventListener("click", () => document.getElementById("openExportCenterBtn")?.click());
    toolbar.querySelector("[data-mobile-reports-filter]")?.addEventListener("click", event => {
      const open = !view.classList.contains("mobile-reports-filters-open");
      view.classList.toggle("mobile-reports-filters-open", open);
      document.body.classList.toggle("mobile-reports-sheet-open", open);
      event.currentTarget.setAttribute("aria-expanded", String(open));
    });
    toolbar.querySelectorAll("[data-mobile-report-jump]").forEach(button => {
      button.addEventListener("click", () => {
        toolbar.querySelectorAll("[data-mobile-report-jump]").forEach(item => item.classList.toggle("active", item === button));
        scrollToTarget(button.dataset.mobileReportJump);
      });
    });
  }

  function ensureFilterSheet() {
    if (filters.classList.contains("mobile-reports-filter-sheet")) return;
    filters.classList.add("mobile-reports-filter-sheet");
    const header = document.createElement("div");
    header.className = "mobile-reports-sheet-header";
    header.innerHTML = `<div><strong>فلاتر التقارير</strong><small>حدد الفترة والمندوب والهدف</small></div><button type="button" aria-label="إغلاق">×</button>`;
    filters.prepend(header);
    header.querySelector("button")?.addEventListener("click", closeFilters);

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "mobile-reports-filter-backdrop";
    backdrop.setAttribute("aria-label", "إغلاق الفلاتر");
    backdrop.addEventListener("click", closeFilters);
    view.append(backdrop);

    document.getElementById("resetReportsFiltersBtn")?.addEventListener("click", () => window.setTimeout(syncPeriodSummary, 0));
    filters.querySelectorAll("input, select").forEach(control => control.addEventListener("change", () => window.setTimeout(syncPeriodSummary, 0)));
  }

  function connectObserver() {
    observer?.disconnect();
    observer = new MutationObserver(() => {
      syncPeriodSummary();
      enhancePerformanceTable();
    });
    [
      document.getElementById("executiveCurrentPeriod"),
      document.getElementById("executiveTargetAchievement"),
      performanceBody,
      document.getElementById("reportsStatus")
    ].filter(Boolean).forEach(node => observer.observe(node, { childList: true, subtree: true, characterData: true }));
  }

  function initialize() {
    ensureToolbar();
    ensureFilterSheet();
    syncPeriodSummary();
    enhancePerformanceTable();
    connectObserver();
  }

  initialize();
  MOBILE_MEDIA.addEventListener?.("change", initialize);
})();

/* Phase M9 — Mobile Administration */
(() => {
  "use strict";
  const MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const ADMIN_VIEWS = [
    ["users", "المستخدمون"],
    ["permissions", "الصلاحيات"],
    ["representatives", "المندوبون"],
    ["settings", "البيانات المرجعية"],
    ["backups", "النسخ الاحتياطي"],
    ["notificationCenter", "مركز الإشعارات"],
    ["systemSettings", "الإعدادات"]
  ];

  const configs = {
    usersView: { title: "إدارة المستخدمين", note: "الحسابات والأدوار وحالة الدخول", filters: ".users-filters", labels: ["المستخدم","البريد","الدور","المندوب المرتبط","الحالة","آخر دخول","الإجراءات"] },
    representativesView: { title: "مندوبي المبيعات", note: "الإدارة والربط وحالة النشاط", filters: ".representatives-list-toolbar", labels: ["كود المندوب","اسم المندوب","الجوال","البريد الإلكتروني","العملاء المرتبطون","الحالة","الإجراءات"] },
    permissionsView: { title: "إدارة الصلاحيات", note: "صلاحيات الأدوار على مستوى الشاشات" },
    settingsView: { title: "البيانات المرجعية", note: "الاهتمامات والأسباب والعملاء", filters: ".reference-data-toolbar" },
    backupsView: { title: "النسخ الاحتياطي", note: "التصدير والفحص والاستعادة الآمنة", labels: ["التاريخ","النوع","الحالة","المستخدم","الملف","التفاصيل"] },
    notificationCenterView: { title: "مركز الإشعارات", note: "تفعيل الأحداث وتحديد المستلمين" },
    systemSettingsView: { title: "إعدادات النظام", note: "بيانات الشركة والإعدادات العامة" }
  };

  function clickOriginalView(view) {
    document.querySelector(`.nav-item[data-view="${view}"]`)?.click();
  }

  function closeFilters(section) {
    section?.classList.remove("mobile-admin-filters-open");
    document.body.classList.remove("mobile-overlay-open");
  }

  function makeToolbar(section, cfg) {
    let toolbar = section.querySelector(":scope > .mobile-admin-toolbar");
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.className = "mobile-admin-toolbar";
    toolbar.innerHTML = `
      <div class="mobile-admin-title"><span>الإدارة</span><strong>${cfg.title}</strong><small>${cfg.note}</small></div>
      <div class="mobile-admin-toolbar-actions">
        ${cfg.filters ? '<button type="button" data-mobile-admin-filter>الفلاتر</button>' : ''}
        <button type="button" data-mobile-admin-refresh>تحديث</button>
      </div>
      <nav class="mobile-admin-nav" aria-label="أقسام الإدارة">
        ${ADMIN_VIEWS.map(([view,label]) => `<button type="button" data-mobile-admin-view="${view}">${label}</button>`).join("")}
      </nav>`;
    section.prepend(toolbar);
    toolbar.querySelectorAll("[data-mobile-admin-view]").forEach(btn => btn.addEventListener("click", () => clickOriginalView(btn.dataset.mobileAdminView)));
    toolbar.querySelector("[data-mobile-admin-filter]")?.addEventListener("click", () => {
      section.classList.add("mobile-admin-filters-open");
      document.body.classList.add("mobile-overlay-open");
    });
    toolbar.querySelector("[data-mobile-admin-refresh]")?.addEventListener("click", () => {
      const preferred = section.querySelector("#refreshHealthBtn,#createBackupBtn,#savePermissionsBtn,#saveSystemSettingsBtn");
      if (preferred && !preferred.disabled) preferred.click();
      else window.dispatchEvent(new Event("resize"));
      toolbar.classList.add("is-refreshing");
      setTimeout(() => toolbar.classList.remove("is-refreshing"), 700);
    });
    return toolbar;
  }

  function prepareFilterSheet(section, cfg) {
    if (!cfg.filters) return;
    const filters = section.querySelector(cfg.filters);
    if (!filters || filters.classList.contains("mobile-admin-filter-sheet")) return;
    filters.classList.add("mobile-admin-filter-sheet");
    const head = document.createElement("div");
    head.className = "mobile-admin-filter-head";
    head.innerHTML = `<div><strong>الفلاتر</strong><small>حدد معايير العرض</small></div><button type="button" aria-label="إغلاق">×</button>`;
    filters.prepend(head);
    head.querySelector("button").addEventListener("click", () => closeFilters(section));
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "mobile-admin-filter-backdrop";
    backdrop.setAttribute("aria-label", "إغلاق الفلاتر");
    backdrop.addEventListener("click", () => closeFilters(section));
    section.append(backdrop);
  }

  function labelTableRows(section, cfg) {
    if (!cfg.labels) return;
    section.querySelectorAll("tbody tr").forEach(row => {
      [...row.children].forEach((cell, i) => cell.dataset.mobileLabel = cfg.labels[i] || "");
    });
  }

  function enhancePermissions(section) {
    section.querySelectorAll(".permission-row[data-screen-key]").forEach(row => {
      row.querySelectorAll('input[type="checkbox"]').forEach((input, index) => {
        input.setAttribute("aria-label", ["عرض","إضافة","تعديل","حذف","تصدير"][index] || "صلاحية");
      });
    });
  }

  function syncActiveNav() {
    const visible = ADMIN_VIEWS.find(([view]) => !document.getElementById(`${view}View`)?.classList.contains("hidden"));
    document.querySelectorAll("[data-mobile-admin-view]").forEach(btn => btn.classList.toggle("active", visible?.[0] === btn.dataset.mobileAdminView));
  }

  const observer = new MutationObserver(() => {
    if (!MEDIA.matches) return;
    Object.entries(configs).forEach(([id,cfg]) => {
      const section = document.getElementById(id);
      if (!section) return;
      labelTableRows(section,cfg);
      if (id === "permissionsView") enhancePermissions(section);
    });
    syncActiveNav();
  });

  function cleanupDesktopAdministration() {
    Object.entries(configs).forEach(([id,cfg]) => {
      const section = document.getElementById(id);
      if (!section) return;

      section.querySelectorAll(":scope > .mobile-admin-toolbar, :scope > .mobile-admin-filter-backdrop").forEach(node => node.remove());
      section.classList.remove("mobile-admin-filters-open");

      if (cfg.filters) {
        const filters = section.querySelector(cfg.filters);
        if (filters) {
          filters.classList.remove("mobile-admin-filter-sheet");
          filters.querySelector(":scope > .mobile-admin-filter-head")?.remove();
        }
      }
    });
    document.body.classList.remove("mobile-overlay-open");
  }

  function initialize() {
    observer.disconnect();

    if (!MEDIA.matches) {
      cleanupDesktopAdministration();
      return;
    }

    Object.entries(configs).forEach(([id,cfg]) => {
      const section = document.getElementById(id);
      if (!section) return;
      makeToolbar(section,cfg);
      prepareFilterSheet(section,cfg);
      labelTableRows(section,cfg);
      if (id === "permissionsView") enhancePermissions(section);
    });
    syncActiveNav();
    observer.observe(document.querySelector("main") || document.body, { subtree:true, childList:true, attributes:true, attributeFilter:["class"] });
  }

  initialize();
  MEDIA.addEventListener?.("change", initialize);
})();

/* Phase M12.1 — Keep mobile views anchored to the viewport */
(() => {
  "use strict";

  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  let resetRaf = 0;

  function resetHorizontalViewport() {
    resetRaf = 0;
    if (!MOBILE_MEDIA.matches) return;
    const root = document.scrollingElement || document.documentElement;
    if (root && root.scrollLeft !== 0) root.scrollLeft = 0;
    if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
  }

  function scheduleReset() {
    if (!resetRaf) resetRaf = requestAnimationFrame(resetHorizontalViewport);
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-mobile-view], .nav-item, .nav-group-content button")) {
      scheduleReset();
    }
  }, { passive: true });

  window.addEventListener("orientationchange", scheduleReset, { passive: true });
  window.addEventListener("resize", scheduleReset, { passive: true });
  window.addEventListener("pageshow", scheduleReset, { passive: true });
  document.addEventListener("DOMContentLoaded", scheduleReset, { once: true });
})();

/* Phase M8.3.5 — Mobile Scroll & Navigation Performance Recovery */
(() => {
  "use strict";

  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const nav = document.getElementById("mobileBottomNav");
  const header = document.getElementById("appHeader");
  if (!nav) return;

  let indicator = nav.querySelector(".mobile-nav-active-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "mobile-nav-active-indicator";
    indicator.setAttribute("aria-hidden", "true");
    nav.prepend(indicator);
  }

  let gesture = null;
  let moveRaf = 0;
  let pendingClientX = 0;
  let suppressClickUntil = 0;
  const DRAG_START_PX = 12;
  const VERTICAL_CANCEL_PX = 10;
  let lastScrollY = Math.max(0, window.scrollY);
  let compact = false;
  let scrollTimer = 0;
  let syncRaf = 0;

  const visibleItems = () => [...nav.querySelectorAll(".mobile-nav-item:not([hidden])")]
    .filter(item => !item.classList.contains("hidden") && item.getClientRects().length);

  function setLogoMobileState() {
    document.getElementById("kyumScrollControl")?.classList.toggle("mobile-floating-logo", MOBILE_MEDIA.matches);
  }

  function activeItem() {
    return nav.querySelector(".mobile-nav-item.is-active:not([hidden])")
      || nav.querySelector('.mobile-nav-item[aria-current="page"]:not([hidden])')
      || visibleItems()[0]
      || null;
  }

  function setBubbleToItem(item, immediate = false) {
    if (!item || !MOBILE_MEDIA.matches) return;
    const navRect = nav.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (immediate) indicator.classList.add("is-immediate");
    indicator.style.setProperty("--indicator-x", `${Math.round(itemRect.left - navRect.left)}px`);
    indicator.style.setProperty("--indicator-w", `${Math.round(itemRect.width)}px`);
    if (immediate) requestAnimationFrame(() => indicator.classList.remove("is-immediate"));
  }

  function positionBubbleAt(clientX) {
    const navRect = nav.getBoundingClientRect();
    const items = visibleItems();
    if (!items.length) return null;
    const itemWidth = items[0].getBoundingClientRect().width;
    const bubbleWidth = Math.max(48, Math.min(itemWidth, navRect.width));
    const x = Math.max(0, Math.min(clientX - navRect.left - bubbleWidth / 2, navRect.width - bubbleWidth));
    indicator.style.setProperty("--indicator-x", `${Math.round(x)}px`);
    indicator.style.setProperty("--indicator-w", `${Math.round(bubbleWidth)}px`);

    let nearest = items[0];
    let nearestDistance = Infinity;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function preview(item) {
    for (const entry of visibleItems()) entry.classList.toggle("is-press-preview", entry === item);
  }

  function activate(item) {
    if (!item) return;
    const view = item.dataset.mobileView;
    if (view) {
      const source = document.querySelector(`.nav-item[data-view="${CSS.escape(view)}"]`);
      if (source && !source.hidden && !source.classList.contains("hidden")) source.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (item.dataset.mobileAction === "menu") {
      document.getElementById("sidebarMenuToggle")?.click();
    }
  }

  function flushMove() {
    moveRaf = 0;
    if (!gesture) return;
    const target = positionBubbleAt(pendingClientX) || gesture.target;
    if (target !== gesture.target) {
      gesture.target = target;
      preview(target);
    }
  }

  function clearGestureState() {
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
    }
    gesture = null;
    nav.classList.remove("is-live-tracking", "is-hold-navigating");
    preview(null);
    indicator.classList.remove("is-immediate");
  }

  function beginGesture(event) {
    if (!MOBILE_MEDIA.matches || (event.pointerType === "mouse" && event.button !== 0)) return;
    const item = event.target.closest(".mobile-nav-item:not([hidden])");
    if (!item || !nav.contains(item)) return;

    // Do not cancel a normal tap. Android must be allowed to emit its native click.
    pendingClientX = event.clientX;
    gesture = {
      pointerId: event.pointerId,
      target: item,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
    preview(item);
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    // A vertical movement belongs to page scrolling, not bottom-nav dragging.
    if (!gesture.dragging && Math.abs(dy) > VERTICAL_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
      clearGestureState();
      return;
    }

    if (!gesture.dragging) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      gesture.dragging = true;
      nav.classList.add("is-live-tracking", "is-hold-navigating");
      indicator.classList.add("is-immediate");
      try { nav.setPointerCapture?.(event.pointerId); } catch (_) {}
    }

    // Only an intentional horizontal drag suppresses native browser handling.
    event.preventDefault();
    pendingClientX = event.clientX;
    if (!moveRaf) moveRaf = requestAnimationFrame(flushMove);
  }

  function endGesture(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const wasDragging = gesture.dragging;
    const target = gesture.target;

    if (wasDragging) {
      event.preventDefault();
      if (moveRaf) {
        cancelAnimationFrame(moveRaf);
        moveRaf = 0;
        pendingClientX = event.clientX;
        flushMove();
      }
    }

    clearGestureState();

    if (wasDragging && !cancelled) {
      suppressClickUntil = performance.now() + 450;
      activate(target);
    }
    // For a normal tap do nothing here: the existing click handler performs navigation.
    scheduleSync(true);
  }

  nav.addEventListener("pointerdown", beginGesture, { passive: true });
  nav.addEventListener("pointermove", moveGesture, { passive: false });
  nav.addEventListener("pointerup", event => endGesture(event, false), { passive: false });
  nav.addEventListener("pointercancel", event => endGesture(event, true), { passive: true });
  nav.addEventListener("lostpointercapture", event => {
    if (gesture && event.pointerId === gesture.pointerId) endGesture(event, true);
  });

  nav.addEventListener("click", event => {
    if (performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    scheduleSync(false);
  }, true);
  nav.addEventListener("contextmenu", event => event.preventDefault());
  nav.addEventListener("selectstart", event => event.preventDefault());
  nav.addEventListener("dragstart", event => event.preventDefault());

  function applyCompactState() {
    scrollTimer = 0;
    if (!MOBILE_MEDIA.matches || gesture) return;
    const currentY = Math.max(0, window.scrollY);
    const delta = currentY - lastScrollY;
    let nextCompact = compact;
    if (currentY < 36) nextCompact = false;
    else if (delta > 8) nextCompact = true;
    else if (delta < -8) nextCompact = false;
    lastScrollY = currentY;
    if (nextCompact === compact) return;
    compact = nextCompact;
    nav.classList.toggle("is-compact", compact);
    document.documentElement.classList.toggle("mobile-nav-is-compact", compact);
    scheduleSync(true);
  }

  window.addEventListener("scroll", () => {
    if (gesture) return;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(applyCompactState, 45);
  }, { passive: true });

  function scheduleSync(immediate = true) {
    if (syncRaf) return;
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0;
      setBubbleToItem(activeItem(), immediate);
    });
  }

  const observer = new MutationObserver(mutations => {
    if (gesture) return;
    const relevant = mutations.some(mutation => mutation.attributeName === "hidden" || mutation.attributeName === "aria-current");
    if (relevant) scheduleSync(true);
  });
  observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ["hidden", "aria-current"] });

  const sync = () => {
    setLogoMobileState();
    header?.classList.toggle("mobile-header-stable", MOBILE_MEDIA.matches);
    scheduleSync(true);
  };

  const mobileLogoutButton = document.getElementById("mobileSidebarLogoutBtn");
  if (mobileLogoutButton && !mobileLogoutButton.dataset.bound) {
    mobileLogoutButton.dataset.bound = "true";
    mobileLogoutButton.addEventListener("click", () => {
      document.getElementById("logoutBtn")?.click();
      document.getElementById("sidebarMenuToggle")?.classList.remove("is-active");
    });
  }

  window.addEventListener("resize", sync, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(sync, 120), { passive: true });
  window.addEventListener("hashchange", sync, { passive: true });
  window.addEventListener("customer-auth-ready", sync, { passive: true });
  MOBILE_MEDIA.addEventListener?.("change", sync);
  document.addEventListener("DOMContentLoaded", sync, { once: true });
  sync();
})();

/* Phase M13.23.4 — Mobile Shell & Touch Certification */
(() => {
  "use strict";

  const MOBILE_MEDIA = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)");
  const root = document.documentElement;
  let viewportRaf = 0;

  function syncVisualViewport() {
    viewportRaf = 0;
    const viewportHeight = Math.round(window.visualViewport?.height || window.innerHeight || root.clientHeight || 0);
    if (viewportHeight > 0) root.style.setProperty("--kyum-visual-viewport-height", `${viewportHeight}px`);
    root.classList.toggle("kyum-mobile-shell", MOBILE_MEDIA.matches);
    root.classList.toggle("kyum-mobile-landscape", MOBILE_MEDIA.matches && window.matchMedia("(orientation: landscape)").matches);
  }

  function scheduleViewportSync() {
    if (viewportRaf) return;
    viewportRaf = requestAnimationFrame(syncVisualViewport);
  }

  function recoverShellLocks() {
    if (!MOBILE_MEDIA.matches) {
      document.body.classList.remove("sidebar-menu-open", "mobile-dashboard-sheet-open", "mobile-customers-sheet-open", "mobile-reports-sheet-open");
      return;
    }

    const lockMap = [
      ["sidebar-menu-open", document.getElementById("mainSidebar")?.classList.contains("is-open")],
      ["mobile-dashboard-sheet-open", document.getElementById("dashboardView")?.classList.contains("mobile-filters-open")],
      ["mobile-customers-sheet-open", document.getElementById("customersView")?.classList.contains("mobile-customers-filters-open")],
      ["mobile-reports-sheet-open", document.getElementById("reportsView")?.classList.contains("mobile-reports-filters-open")]
    ];

    for (const [className, isOpen] of lockMap) {
      if (!isOpen) document.body.classList.remove(className);
    }
  }

  function certifyShell() {
    syncVisualViewport();
    recoverShellLocks();
    document.getElementById("appHeader")?.classList.toggle("mobile-header-stable", MOBILE_MEDIA.matches);
  }

  window.visualViewport?.addEventListener("resize", scheduleViewportSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleViewportSync, { passive: true });
  window.addEventListener("resize", scheduleViewportSync, { passive: true });
  window.addEventListener("orientationchange", () => window.setTimeout(certifyShell, 120), { passive: true });
  window.addEventListener("pageshow", certifyShell, { passive: true });
  window.addEventListener("hashchange", recoverShellLocks, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) certifyShell();
  }, { passive: true });
  MOBILE_MEDIA.addEventListener?.("change", certifyShell);
  document.addEventListener("DOMContentLoaded", certifyShell, { once: true });
  certifyShell();
})();
