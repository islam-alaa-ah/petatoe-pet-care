// KYUM Phase M9.4 — Sales Representatives Excel Import
(function () {
  const t = (key, fallback, vars = {}) => { const value=window.PetatoeLocalization?.t?.(key, vars); return value && !/^\[.+\]$/.test(value) ? value : fallback; };
  const HEADERS = ["كود المندوب", "اسم المندوب", "رقم الجوال", "البريد الإلكتروني", "الحالة"];
  const HEADER_ALIASES = {
    representativeCode: ["كود المندوب", "كود", "representative code", "code"],
    fullName: ["اسم المندوب", "الاسم", "مندوب المبيعات", "representative name", "full name", "name"],
    phone: ["رقم الجوال", "الجوال", "رقم الهاتف", "phone", "mobile", "mobile number"],
    email: ["البريد الإلكتروني", "البريد الالكتروني", "البريد", "email", "e-mail"],
    status: ["الحالة", "حالة المندوب", "status", "active"]
  };

  function requireXlsx() {
    if (!window.XLSX) throw new Error(t('representatives.import.excelMissing','Excel library is not loaded.'));
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
    if (!file) throw new Error(t('representatives.import.fileRequired','Choose an Excel file first.'));
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error(t('representatives.import.sheetMissing','The Excel file does not contain a data sheet.'));
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

      if (!representativeCode) errors.push(t('representatives.import.validation.codeRequired','Representative code is required'));
      if (!fullName) errors.push(t('representatives.import.validation.nameRequired','Representative name is required'));
      if (phone && !/^05\d{8}$/.test(phone)) errors.push(t('representatives.import.validation.phoneInvalid','Invalid mobile number'));
      if (!validEmail(email)) errors.push(t('representatives.import.validation.emailInvalid','Invalid email address'));
      if (statusValue === null) errors.push(t('representatives.import.validation.statusInvalid','Status must be Active or Suspended'));

      let duplicateInFile = false;
      if (codeKey && fileCodes.has(codeKey)) duplicateInFile = true;
      if (phone && filePhones.has(phone)) duplicateInFile = true;
      if (email && fileEmails.has(email)) duplicateInFile = true;
      if (duplicateInFile) {
        errors.push(t('representatives.import.validation.duplicateFile','Duplicate in file'));
        duplicates += 1;
      }

      const existsInSystem = Boolean(
        (codeKey && existingCodes.has(codeKey)) ||
        (phone && existingPhones.has(phone)) ||
        (email && existingEmails.has(email))
      );
      if (existsInSystem) {
        errors.push(t('representatives.import.validation.exists','Representative already exists in the system'));
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
    if (typeof saveRepresentative !== "function") throw new Error(t('representatives.import.error.saveService','Representative save service is unavailable.'));
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
    const localizedHeaders = [
      t('representatives.col.code','Representative Code'),
      t('representatives.col.name','Representative Name'),
      t('representatives.field.phone','Mobile Number'),
      t('representatives.field.email','Email'),
      t('representatives.col.status','Status')
    ];
    const rows = [{
      [localizedHeaders[0]]: "REP-001",
      [localizedHeaders[1]]: window.PetatoeLocalization?.effectiveLanguage?.()==='en' ? "Ahmed Mohamed" : "أحمد محمد",
      [localizedHeaders[2]]: "0500000001",
      [localizedHeaders[3]]: "ahmed@company.com",
      [localizedHeaders[4]]: t('representatives.status.active','Active')
    }];
    const sheet = window.XLSX.utils.json_to_sheet(rows, { header: localizedHeaders });
    applyLayout(sheet);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, sheet, t('representatives.import.sheet.template','Representative Template').slice(0,31));
    window.XLSX.writeFile(workbook, "PETATOE_Sales_Representatives_Import_Template.xlsx");
  }

  function exportFailedRows(rows) {
    requireXlsx();
    if (!Array.isArray(rows) || !rows.length) throw new Error(t('representatives.import.error.noFailedRows','There are no failed rows to export.'));
    const h = [
      t('representatives.import.header.row','Row Number'),
      t('representatives.col.code','Representative Code'),
      t('representatives.col.name','Representative Name'),
      t('representatives.field.phone','Mobile Number'),
      t('representatives.field.email','Email'),
      t('representatives.import.header.failure','Failure Reason')
    ];
    const data = rows.map(row => ({
      [h[0]]: row.sourceRow, [h[1]]: row.representativeCode || "", [h[2]]: row.fullName || "",
      [h[3]]: row.phone || "", [h[4]]: row.email || "", [h[5]]: row.message || ""
    }));
    const sheet = window.XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 55 }];
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, sheet, t('representatives.import.sheet.failed','Failed Rows').slice(0,31));
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
