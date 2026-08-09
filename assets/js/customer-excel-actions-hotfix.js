// PETATOE P4.2 — Customer Import Runtime Recovery
// Bridges customer Excel controls directly to the canonical app functions.
// This survives a missed DOM binding while preserving the existing import engine.
(function () {
  "use strict";

  const XLSX_SRC = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  let xlsxPromise = null;

  const byId = id => document.getElementById(id);

  function show(id, message, type) {
    const node = byId(id);
    if (!node) return;
    node.textContent = message || "";
    node.classList.remove("hidden", "success", "error", "info", "warning");
    if (type) node.classList.add(type);
  }

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = XLSX_SRC;
      script.async = true;
      script.onload = () => window.XLSX
        ? resolve(window.XLSX)
        : reject(new Error("مكتبة Excel لم تبدأ بشكل صحيح."));
      script.onerror = () => reject(new Error("تعذر تحميل مكتبة Excel. تحقق من الاتصال بالإنترنت."));
      document.head.appendChild(script);
    }).finally(() => {
      if (!window.XLSX) xlsxPromise = null;
    });
    return xlsxPromise;
  }

  function requireAppFunction(name) {
    const fn = window[name];
    if (typeof fn !== "function") {
      throw new Error(`تعذر تحميل وظيفة ${name}. نفذ Hard Refresh ثم أعد المحاولة.`);
    }
    return fn;
  }

  async function openImport() {
    await loadXlsx();
    // Use the canonical reset/open functions so the lexical app state is initialized.
    if (typeof window.openCustomerImportDialog === "function") {
      window.openCustomerImportDialog();
      return;
    }
    if (typeof window.resetCustomerImportDialog === "function") {
      window.resetCustomerImportDialog();
    }
    const dialog = byId("customerImportDialog");
    if (!dialog) throw new Error("نافذة استيراد العملاء غير موجودة.");
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  }

  async function previewFile(file) {
    if (!file) return;
    await loadXlsx();
    const fn = requireAppFunction("previewCustomerImportFile");
    await fn(file);
  }

  async function executeImport() {
    const fn = requireAppFunction("executeCustomerImport");
    await fn();
  }

  async function downloadTemplate() {
    await loadXlsx();
    if (!window.CustomerExcelCenter) throw new Error("مركز Excel للعملاء غير محمل.");
    window.CustomerExcelCenter.downloadTemplate();
  }

  function closest(target, id) {
    return target && typeof target.closest === "function" ? target.closest(`#${id}`) : null;
  }

  // Capture-phase routing prevents stale handlers from competing with the canonical action.
  document.addEventListener("click", event => {
    if (closest(event.target, "customersImportBtn") || closest(event.target, "referenceCustomersImportBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openImport().catch(error => show("referenceCustomersStatus", error.message || "تعذر فتح الاستيراد.", "error"));
      return;
    }

    if (closest(event.target, "customersTemplateBtn") || closest(event.target, "referenceCustomersTemplateBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadTemplate()
        .then(() => show("referenceCustomersStatus", "تم تنزيل نموذج العملاء.", "success"))
        .catch(error => show("referenceCustomersStatus", error.message || "تعذر تنزيل النموذج.", "error"));
      return;
    }

    if (closest(event.target, "customerImportChooseFileBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      byId("customerImportFileInput")?.click();
      return;
    }

    if (closest(event.target, "customerImportExecuteBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      executeImport().catch(error => show("customerImportStatus", error.message || "تعذر تنفيذ الاستيراد.", "error"));
    }
  }, true);

  document.addEventListener("change", event => {
    const input = event.target;
    if (!input || input.id !== "customerImportFileInput") return;
    const file = input.files && input.files[0];
    if (!file) return;

    // Stop any stale duplicate change listener. The canonical preview function is invoked directly.
    event.stopImmediatePropagation();
    previewFile(file).catch(error => show("customerImportStatus", error.message || "تعذر قراءة ملف Excel.", "error"));
  }, true);


  // The exceptional-import controls also get a capture-phase bridge so a late
  // unrelated app binding failure cannot make the password path unresponsive.
  document.addEventListener("click", event => {
    if (!closest(event.target, "customerImportOverrideBtn")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      requireAppFunction("openCustomerImportOverrideDialog")();
    } catch (error) {
      show("customerImportStatus", error.message || "تعذر فتح الاعتماد الاستثنائي.", "error");
    }
  }, true);

  document.addEventListener("submit", event => {
    const form = event.target;
    if (!form || form.id !== "customerImportOverrideForm") return;
    // app.js owns the secure re-authentication submit flow. Do not block it when
    // its normal listener exists; this guard only surfaces a deterministic error
    // if app.js failed before installing that listener.
    if (typeof window.executeCustomerImport !== "function") {
      event.preventDefault();
      show("customerImportOverrideStatus", "تعذر تحميل محرك الاستيراد. نفذ Hard Refresh ثم أعد المحاولة.", "error");
    }
  }, true);

  window.PETATOECustomerImportRuntimeRecovery = Object.freeze({
    openImport,
    previewFile,
    executeImport,
    downloadTemplate
  });
})();
