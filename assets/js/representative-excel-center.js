// KYUM Phase M9.4 — Sales Representatives Excel Import
(function () {
  const HEADERS = ["كود المندوب", "اسم المندوب", "رقم الجوال", "البريد الإلكتروني", "الحالة"];
  const HEADER_ALIASES = {
    representativeCode: ["كود المندوب", "كود", "representative code", "code"],
    fullName: ["اسم المندوب", "الاسم", "مندوب المبيعات", "representative name", "full name", "name"],
    phone: ["رقم الجوال", "الجوال", "رقم الهاتف", "phone", "mobile"],
    email: ["البريد الإلكتروني", "البريد الالكتروني", "البريد", "email", "e-mail"],
    status: ["الحالة", "حالة المندوب", "status", "active"]
  };

  function requireXlsx() {
    if (!window.XLSX) throw new Error("مكتبة Excel غير محملة.");
  }

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeHeader(value) {
    return text(value).toLowerCase().replace(/[\s_\-]+/g, " ").trim();
  }

  function getMappedValue(row, aliases) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    for (const [key, value] of Object.entries(row || {})) {
      if (aliasSet.has(normalizeHeader(key))) return value;
    }
    return "";
  }

  function normalizePhone(value) {
    const digits = text(value).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
    if (digits.startsWith("966")) return `0${digits.slice(3)}`;
    if (digits.length === 9 && digits.startsWith("5")) return `0${digits}`;
    return digits;
  }

  function normalizeEmail(value) {
    return text(value).toLowerCase();
  }

  function parseStatus(value) {
    const raw = text(value).toLowerCase();
    if (!raw || ["نشط", "active", "true", "1", "نعم", "yes"].includes(raw)) return true;
    if (["موقوف", "متوقف", "غير نشط", "inactive", "false", "0", "لا", "no"].includes(raw)) return false;
    return null;
  }

  function validEmail(value) {
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function rowIsEmpty(row) {
    return !Object.values(row || {}).some(value => text(value));
  }

  async function parseImportFile(file) {
    requireXlsx();
    if (!file) throw new Error("اختر ملف Excel أولًا.");
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("ملف Excel لا يحتوي على ورقة بيانات.");
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
    return rows.filter(row => !rowIsEmpty(row));
  }

  function buildImportPreview(rawRows, existingRepresentatives) {
    const existingCodes = new Set();
    const existingPhones = new Set();
    const existingEmails = new Set();
    (existingRepresentatives || []).forEach(item => {
      const code = text(item.representative_code).toLowerCase();
      const phone = normalizePhone(item.phone);
      const email = normalizeEmail(item.email);
      if (code) existingCodes.add(code);
      if (phone) existingPhones.add(phone);
      if (email) existingEmails.add(email);
    });

    const fileCodes = new Set();
    const filePhones = new Set();
    const fileEmails = new Set();
    let duplicates = 0;
    let existing = 0;

    const rows = (rawRows || []).map((source, index) => {
      const representativeCode = text(getMappedValue(source, HEADER_ALIASES.representativeCode));
      const fullName = text(getMappedValue(source, HEADER_ALIASES.fullName));
      const phone = normalizePhone(getMappedValue(source, HEADER_ALIASES.phone));
      const email = normalizeEmail(getMappedValue(source, HEADER_ALIASES.email));
      const statusValue = parseStatus(getMappedValue(source, HEADER_ALIASES.status));
      const errors = [];
      const codeKey = representativeCode.toLowerCase();

      if (!representativeCode) errors.push("كود المندوب إلزامي");
      if (!fullName) errors.push("اسم المندوب إلزامي");
      if (phone && !/^05\d{8}$/.test(phone)) errors.push("رقم الجوال غير صحيح");
      if (!validEmail(email)) errors.push("البريد الإلكتروني غير صحيح");
      if (statusValue === null) errors.push("الحالة يجب أن تكون نشط أو موقوف");

      let duplicateInFile = false;
      if (codeKey && fileCodes.has(codeKey)) duplicateInFile = true;
      if (phone && filePhones.has(phone)) duplicateInFile = true;
      if (email && fileEmails.has(email)) duplicateInFile = true;
      if (duplicateInFile) {
        errors.push("مكرر داخل الملف");
        duplicates += 1;
      }

      const existsInSystem = Boolean(
        (codeKey && existingCodes.has(codeKey)) ||
        (phone && existingPhones.has(phone)) ||
        (email && existingEmails.has(email))
      );
      if (existsInSystem) {
        errors.push("مندوب موجود مسبقًا في النظام");
        existing += 1;
      }

      if (codeKey) fileCodes.add(codeKey);
      if (phone) filePhones.add(phone);
      if (email) fileEmails.add(email);

      return {
        sourceRow: index + 2,
        representativeCode,
        fullName,
        phone,
        email,
        isActive: statusValue === null ? true : statusValue,
        errors
      };
    });

    const valid = rows.filter(row => !row.errors.length).length;
    return {
      rows,
      summary: {
        total: rows.length,
        valid,
        errors: rows.length - valid,
        newRepresentatives: valid,
        duplicates,
        existing
      }
    };
  }

  async function importRows(rows, saveRepresentative, onProgress, options = {}) {
    if (typeof saveRepresentative !== "function") throw new Error("خدمة حفظ المندوبين غير متاحة.");
    const chunkSize = Math.max(1, Number(options.chunkSize) || 200);
    const validRows = Array.isArray(rows) ? rows : [];
    const errors = [];
    let inserted = 0;
    let processed = 0;

    for (let offset = 0; offset < validRows.length; offset += chunkSize) {
      const chunk = validRows.slice(offset, offset + chunkSize);
      for (const row of chunk) {
        try {
          await saveRepresentative({
            representative_code: row.representativeCode,
            full_name: row.fullName,
            phone: row.phone,
            email: row.email,
            is_active: row.isActive
          });
          inserted += 1;
        } catch (error) {
          errors.push({
            sourceRow: row.sourceRow,
            representativeCode: row.representativeCode,
            fullName: row.fullName,
            phone: row.phone,
            email: row.email,
            message: error instanceof Error ? error.message : String(error)
          });
        }
        processed += 1;
        if (typeof onProgress === "function") onProgress(processed, validRows.length);
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return { inserted, failed: errors.length, errors };
  }

  function applyLayout(sheet) {
    sheet["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 14 }];
    sheet["!autofilter"] = { ref: `A1:E${Math.max(2, (sheet["!ref"] || "A1:E2").split(":")[1].replace(/\D/g, "") || 2)}` };
  }

  function downloadTemplate() {
    requireXlsx();
    const rows = [
      {
        "كود المندوب": "REP-001",
        "اسم المندوب": "أحمد محمد",
        "رقم الجوال": "0500000001",
        "البريد الإلكتروني": "ahmed@company.com",
        "الحالة": "نشط"
      }
    ];
    const sheet = window.XLSX.utils.json_to_sheet(rows, { header: HEADERS });
    applyLayout(sheet);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, sheet, "نموذج المندوبين");
    window.XLSX.writeFile(workbook, "PETATOE_Sales_Representatives_Import_Template.xlsx");
  }

  function exportFailedRows(rows) {
    requireXlsx();
    if (!Array.isArray(rows) || !rows.length) throw new Error("لا توجد صفوف فاشلة للتصدير.");
    const data = rows.map(row => ({
      "رقم الصف": row.sourceRow,
      "كود المندوب": row.representativeCode || "",
      "اسم المندوب": row.fullName || "",
      "رقم الجوال": row.phone || "",
      "البريد الإلكتروني": row.email || "",
      "سبب الفشل": row.message || ""
    }));
    const sheet = window.XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 55 }];
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, sheet, "الصفوف الفاشلة");
    window.XLSX.writeFile(workbook, "PETATOE_Sales_Representatives_Failed_Rows.xlsx");
  }

  window.RepresentativeExcelCenter = Object.freeze({
    parseImportFile,
    buildImportPreview,
    importRows,
    downloadTemplate,
    exportFailedRows
  });
})();
