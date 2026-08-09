// PETATOE P4.1 — Customer Excel Actions Runtime Hotfix
// Robust delegated handlers for the Customers Excel import/template buttons.
// This script is intentionally isolated from app.js so the two actions remain
// available even if an unrelated late app.js binding fails during startup.
(function () {
  "use strict";

  const XLSX_SRC = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  let xlsxPromise = null;

  function status(message, type) {
    const node = document.getElementById("customersStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.remove("hidden", "success", "error", "info", "warning");
    if (type) node.classList.add(type);
  }

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;

    xlsxPromise = new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(script =>
        String(script.src || "").includes("xlsx.full.min.js")
      );

      if (existing) {
        const started = Date.now();
        const wait = () => {
          if (window.XLSX) return resolve(window.XLSX);
          if (Date.now() - started > 8000) {
            reject(new Error("تعذر تحميل مكتبة Excel. تحقق من الاتصال بالإنترنت ثم أعد المحاولة."));
            return;
          }
          setTimeout(wait, 100);
        };
        wait();
        return;
      }

      const script = document.createElement("script");
      script.src = XLSX_SRC;
      script.async = true;
      script.onload = () => window.XLSX
        ? resolve(window.XLSX)
        : reject(new Error("تم تحميل ملف Excel لكن المكتبة لم تبدأ بشكل صحيح."));
      script.onerror = () => reject(new Error("تعذر تحميل مكتبة Excel. تحقق من الاتصال بالإنترنت ثم أعد المحاولة."));
      document.head.appendChild(script);
    }).finally(() => {
      if (!window.XLSX) xlsxPromise = null;
    });

    return xlsxPromise;
  }

  function excelCenter() {
    const center = window.CustomerExcelCenter;
    if (!center) {
      throw new Error("مركز Excel للعملاء غير محمل. نفذ Hard Refresh مرة واحدة ثم أعد المحاولة.");
    }
    return center;
  }

  function openImport() {
    const dialog = document.getElementById("customerImportDialog");
    if (!dialog) throw new Error("نافذة رفع العملاء غير موجودة في الصفحة الحالية.");

    // Reset the native file field so selecting the same file twice still fires change.
    const input = document.getElementById("customerImportFileInput");
    if (input) input.value = "";

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      dialog.classList.remove("hidden");
    }

    // Preload XLSX after the dialog opens. The user can see the UI immediately.
    loadXlsx().catch(error => {
      const importStatus = document.getElementById("customerImportStatus");
      if (importStatus) {
        importStatus.textContent = error.message;
        importStatus.classList.remove("hidden");
        importStatus.classList.add("error");
      }
    });
  }

  async function downloadTemplate() {
    status("جاري تجهيز نموذج العملاء...", "info");
    await loadXlsx();
    excelCenter().downloadTemplate();
    status("تم تنزيل نموذج العملاء: code | name | address | mobile", "success");
  }

  function isTarget(target, id) {
    return target && typeof target.closest === "function" && target.closest(`#${id}`);
  }

  // Capture phase deliberately wins over any stale/broken legacy click binding.
  document.addEventListener("click", event => {
    if (isTarget(event.target, "customersImportBtn") || isTarget(event.target, "referenceCustomersImportBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        openImport();
      } catch (error) {
        status(error instanceof Error ? error.message : "تعذر فتح نافذة رفع العملاء.", "error");
      }
      return;
    }

    if (isTarget(event.target, "customersTemplateBtn") || isTarget(event.target, "referenceCustomersTemplateBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadTemplate().catch(error => {
        status(error instanceof Error ? error.message : "تعذر تنزيل نموذج العملاء.", "error");
      });
    }
  }, true);

  // File chooser fallback: guarantees parsing is reachable even if the old binding
  // was skipped due to an unrelated startup exception.
  document.addEventListener("click", event => {
    if (!isTarget(event.target, "customerImportChooseFileBtn")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = document.getElementById("customerImportFileInput");
    if (input) input.click();
  }, true);

  document.addEventListener("change", event => {
    const input = event.target;
    if (!input || input.id !== "customerImportFileInput") return;
    if (input.dataset.p4HotfixProcessing === "1") return;

    const file = input.files && input.files[0];
    if (!file) return;

    // If app.js has its normal preview function bound, let its handler execute too.
    // This fallback only reports library readiness and never writes to Supabase.
    input.dataset.p4HotfixProcessing = "1";
    loadXlsx()
      .then(() => {
        const fileName = document.getElementById("customerImportFileName");
        if (fileName) fileName.textContent = file.name;
      })
      .catch(error => {
        const importStatus = document.getElementById("customerImportStatus");
        if (importStatus) {
          importStatus.textContent = error.message;
          importStatus.classList.remove("hidden");
          importStatus.classList.add("error");
        }
      })
      .finally(() => {
        delete input.dataset.p4HotfixProcessing;
      });
  }, true);

  window.PETATOECustomerExcelActionsHotfix = Object.freeze({
    openImport,
    downloadTemplate,
    loadXlsx
  });
})();
