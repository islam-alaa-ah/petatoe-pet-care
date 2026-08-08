// KYUM Phase 17.4-C2 — Customer Excel Export & Template
(function () {
  const EXPORT_HEADERS = [
    "رقم العميل",
    "اسم العميل",
    "رقم الجوال",
    "التصنيف",
    "اسم المسؤول",
    "المنطقة",
    "المدينة",
    "الحي",
    "مجالات الاهتمام",
    "مندوب المبيعات",
    "تاريخ آخر تواصل",
    "رقم عرض السعر",
    "سبب عدم البيع",
    "الملاحظات"
  ];

  function requireXlsx() {
    if (!window.XLSX) {
      throw new Error("مكتبة Excel غير محملة.");
    }
  }

  function safeText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function customerToRow(customer) {
    return {
      "رقم العميل": safeText(customer.customerNumber),
      "اسم العميل": safeText(customer.name),
      "رقم الجوال": safeText(customer.phone),
      "التصنيف": safeText(customer.type),
      "اسم المسؤول": safeText(customer.contactPersonName),
      "المنطقة": safeText(customer.region),
      "المدينة": safeText(customer.city),
      "الحي": safeText(customer.district),
      "مجالات الاهتمام": Array.isArray(customer.interests)
        ? customer.interests.join("، ")
        : safeText(customer.interests),
      "مندوب المبيعات": safeText(customer.representative),
      "تاريخ آخر تواصل": safeText(customer.contactDate),
      "رقم عرض السعر": safeText(customer.quotationNumber),
      "سبب عدم البيع": safeText(customer.noSaleReason),
      "الملاحظات": safeText(customer.notes)
    };
  }

  function applySheetLayout(sheet, rowCount) {
    sheet["!cols"] = [
      { wch: 16 },
      { wch: 28 },
      { wch: 18 },
      { wch: 12 },
      { wch: 24 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
      { wch: 34 },
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 },
      { wch: 38 }
    ];

    sheet["!autofilter"] = {
      ref: `A1:N${Math.max(1, rowCount + 1)}`
    };

    for (let row = 2; row <= rowCount + 1; row += 1) {
      const phoneCell = sheet[`C${row}`];
      if (phoneCell) {
        phoneCell.t = "s";
        phoneCell.z = "@";
        phoneCell.v = safeText(phoneCell.v);
      }
      const customerNumberCell = sheet[`A${row}`];
      if (customerNumberCell) {
        customerNumberCell.t = "s";
        customerNumberCell.z = "@";
      }
    }
  }

  function exportCustomers(customers, options = {}) {
    requireXlsx();

    const rows = (customers || []).map(customerToRow);
    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: EXPORT_HEADERS,
      skipHeader: false
    });

    applySheetLayout(sheet, rows.length);

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "PETATOE Customers Export",
      Subject: options.filtered ? "Filtered customers" : "All customers",
      Author: "PETATOE",
      CreatedDate: new Date()
    };

    XLSX.utils.book_append_sheet(workbook, sheet, "Customers");

    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(":", "-");

    const scope = options.filtered ? "Filtered" : "All";
    XLSX.writeFile(workbook, `PETATOE_Customers_${scope}_${timestamp}.xlsx`, {
      compression: true
    });

    return rows.length;
  }

  function downloadTemplate() {
    requireXlsx();

    const sampleRow = {
      "رقم العميل": "",
      "اسم العميل": "مثال: شركة كيوم للتجارة",
      "رقم الجوال": "0500000000",
      "التصنيف": "شركة",
      "اسم المسؤول": "اسم المسؤول داخل الشركة",
      "المنطقة": "منطقة الرياض",
      "المدينة": "الرياض",
      "الحي": "حي العليا",
      "مجالات الاهتمام": "تبريد، أجهزة منزلية",
      "مندوب المبيعات": "اسم المندوب الموجود بالنظام",
      "تاريخ آخر تواصل": "2026-07-21",
      "رقم عرض السعر": "Q-2026-001",
      "سبب عدم البيع": "",
      "الملاحظات": "ملاحظات اختيارية"
    };

    const sheet = XLSX.utils.json_to_sheet([sampleRow], {
      header: EXPORT_HEADERS,
      skipHeader: false
    });

    applySheetLayout(sheet, 1);

    const instructions = [
      ["تعليمات نموذج استيراد العملاء"],
      ["اسم العميل ورقم الجوال حقول إلزامية."],
      ["رقم الجوال يجب أن يظل نصًا للحفاظ على الصفر الأول."],
      ["التصنيف يقبل فقط: شركة أو فردي."],
      ["اسم المسؤول مطلوب عند اختيار التصنيف شركة."],
      ["يمكن فصل مجالات الاهتمام بالفاصلة العربية أو الإنجليزية."],
      ["اسم المندوب ومجالات الاهتمام وسبب عدم البيع يجب أن تكون مسجلة مسبقًا في النظام."],
      ["لا تغيّر أسماء الأعمدة أو ترتيبها."]
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
    instructionsSheet["!cols"] = [{ wch: 95 }];

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "PETATOE Customers Import Template",
      Subject: "Customer import template",
      Author: "PETATOE",
      CreatedDate: new Date()
    };
    XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    XLSX.writeFile(workbook, "PETATOE_Customers_Import_Template.xlsx", {
      compression: true
    });
  }

  const HEADER_ALIASES = Object.freeze({
    customerNumber: ["رقم العميل", "customer_number", "customer number"],
    name: ["اسم العميل", "customer_name", "customer name"],
    phone: ["رقم الجوال", "الجوال", "phone", "mobile"],
    type: ["التصنيف", "نوع العميل", "customer_type", "customer type"],
    contactPersonName: ["اسم المسؤول", "المسؤول", "contact_person_name", "contact person"],
    region: ["المنطقة", "region", "province"],
    city: ["المدينة", "city"],
    district: ["الحي", "district", "neighborhood", "neighbourhood"],
    interests: ["مجالات الاهتمام", "مجال الاهتمام", "interests", "interest"],
    representative: ["مندوب المبيعات", "المندوب", "representative", "sales representative"],
    contactDate: ["تاريخ آخر تواصل", "last_contact_date", "contact date"],
    quotationNumber: ["رقم عرض السعر", "quotation_number", "quotation number"],
    noSaleReason: ["سبب عدم البيع", "no_sale_reason", "no sale reason"],
    notes: ["الملاحظات", "notes"]
  });

  function normalizeHeader(value) {
    return safeText(value).trim().toLowerCase().replace(/\s+/g, " ");
  }

  function resolveField(header) {
    const normalized = normalizeHeader(header);
    return Object.entries(HEADER_ALIASES).find(([, aliases]) =>
      aliases.some(alias => normalizeHeader(alias) === normalized)
    )?.[0] || null;
  }

  function normalizePhone(value) {
    let phone = safeText(value).trim().replace(/[^\d+]/g, "");
    if (phone.startsWith("+966")) phone = `0${phone.slice(4)}`;
    if (phone.startsWith("966")) phone = `0${phone.slice(3)}`;
    if (phone.startsWith("5") && phone.length === 9) phone = `0${phone}`;
    return phone.replace(/\D/g, "");
  }

  function splitInterests(value) {
    return safeText(value)
      .split(/[،,;|]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function excelDateToIso(value) {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        return [
          parsed.y,
          String(parsed.m).padStart(2, "0"),
          String(parsed.d).padStart(2, "0")
        ].join("-");
      }
    }
    const text = safeText(value).trim();
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
  }

  async function parseImportFile(file) {
    requireXlsx();
    if (!file) throw new Error("اختر ملف Excel أولًا.");

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      raw: false
    });

    const sheetName = workbook.SheetNames.find(name =>
      normalizeHeader(name) === "customers"
    ) || workbook.SheetNames[0];

    if (!sheetName) throw new Error("ملف Excel لا يحتوي على أوراق بيانات.");

    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false
    });

    if (matrix.length < 2) {
      throw new Error("ملف Excel لا يحتوي على صفوف عملاء.");
    }

    const headers = matrix[0].map(resolveField);
    if (!headers.includes("name") || !headers.includes("phone")) {
      throw new Error("يجب أن يحتوي الملف على عمودي اسم العميل ورقم الجوال.");
    }

    return matrix.slice(1)
      .filter(row => row.some(cell => safeText(cell).trim()))
      .map((row, index) => {
        const record = {
          sourceRow: index + 2,
          customerNumber: "",
          name: "",
          phone: "",
          type: "",
          contactPersonName: "",
          region: "",
          city: "",
          district: "",
          interests: [],
          representative: "",
          contactDate: "",
          quotationNumber: "",
          noSaleReason: "",
          notes: ""
        };

        headers.forEach((field, columnIndex) => {
          if (!field) return;
          const value = row[columnIndex];

          if (field === "phone") record.phone = normalizePhone(value);
          else if (field === "interests") record.interests = splitInterests(value);
          else if (field === "contactDate") record.contactDate = excelDateToIso(value);
          else record[field] = safeText(value).trim();
        });

        return record;
      });
  }

  function buildImportPreview(rows, context) {
    const representativeMap = new Map(
      (context.representatives || []).map(item => [
        normalizeHeader(item.full_name || item.name),
        item
      ])
    );
    const interestMap = new Map(
      (context.interests || []).map(item => [normalizeHeader(item.name), item])
    );
    const reasonMap = new Map(
      (context.reasons || []).map(item => [normalizeHeader(item.name), item])
    );
    const existingMap = new Map(
      (context.customers || [])
        .filter(item => normalizePhone(item.phone))
        .map(item => [normalizePhone(item.phone), item])
    );

    const normalizeIdentityPart = value => safeText(value).trim().toLowerCase();
    const requestIdentity = (requestNumber, quotationNumber) => {
      const request = normalizeIdentityPart(requestNumber);
      const quotation = normalizeIdentityPart(quotationNumber);
      return request || quotation ? `${request || "-"}::${quotation || "-"}` : "";
    };

    const importedByCustomer = new Set();
    const importedGlobally = new Set();
    (context.importedRequests || []).forEach(item => {
      const identity = requestIdentity(item.request_number, item.quotation_number);
      if (!identity) return;
      importedGlobally.add(identity);
      if (item.customer_id) importedByCustomer.add(`${item.customer_id}::${identity}`);
    });

    // Duplicate detection is operation-aware. Repeating a customer phone is valid
    // when the request number or quotation number differs, because that represents
    // another sales operation for the same customer.
    const operationCounts = rows.reduce((map, row) => {
      if (!row.phone) return map;
      const identity = requestIdentity(row.requestNumber, row.quotationNumber);
      const operationKey = `${row.phone}::${identity || "no-operation"}`;
      map.set(operationKey, (map.get(operationKey) || 0) + 1);
      return map;
    }, new Map());

    const previewRows = rows.map(row => {
      const geoProvided = [row.region, row.city, row.district].some(value => safeText(value).trim());
      const geoResolved = geoProvided && window.KYUMGeography
        ? window.KYUMGeography.canonicalizeAddress({ region: row.region, city: row.city, district: row.district })
        : null;
      const canonicalRow = geoResolved?.complete
        ? { ...row, region: geoResolved.region, city: geoResolved.city, district: geoResolved.district }
        : row;
      const existing = row.phone ? (existingMap.get(row.phone) || null) : null;
      const identity = requestIdentity(row.requestNumber, row.quotationNumber);
      const previouslyUploaded = Boolean(
        (identity && existing?.id && importedByCustomer.has(`${existing.id}::${identity}`))
        || (identity && importedGlobally.has(identity))
        || (existing && !identity)
      );

      // Existing-data detection intentionally runs before validation. A row that
      // was saved previously (including through an admin override) must not be
      // reported as an error when the same file is previewed again.
      if (previouslyUploaded) {
        return {
          ...canonicalRow,
          normalizedPhone: row.phone,
          representativeId: existing?.representativeId || existing?.representative_id || null,
          interestIds: existing?.interestIds || [],
          noSaleReasonId: existing?.noSaleReasonId || existing?.no_sale_reason_id || null,
          existingCustomer: existing,
          previouslyUploaded: true,
          status: "existing",
          errors: [],
          statusNote: "تم رفع هذا السجل مسبقًا"
        };
      }

      const errors = [];
      if (geoProvided && !geoResolved?.complete) {
        errors.push("العنوان يجب أن يطابق المنطقة ثم المدينة ثم الحي من القوائم المعتمدة");
      }
      if (!row.name) errors.push("اسم العميل مطلوب");
      if (!/^05\d{8}$/.test(row.phone)) errors.push("رقم الجوال غير صالح");
      if (!["شركة", "فردي"].includes(row.type)) errors.push("التصنيف يجب أن يكون شركة أو فردي");
      if (row.type === "شركة" && !row.contactPersonName) {
        errors.push("اسم المسؤول مطلوب للشركة");
      }
      if (row.phone) {
        const operationKey = `${row.phone}::${identity || "no-operation"}`;
        if ((operationCounts.get(operationKey) || 0) > 1) {
          errors.push(identity
            ? "نفس العميل ونفس رقم الطلب أو عرض السعر مكرر داخل الملف"
            : "رقم الجوال مكرر داخل الملف بدون رقم طلب أو عرض سعر مختلف");
        }
      }

      const representative = row.representative
        ? representativeMap.get(normalizeHeader(row.representative))
        : null;
      if (row.representative && !representative) errors.push("المندوب غير مسجل");

      const interestIds = [];
      for (const interestName of row.interests) {
        const interest = interestMap.get(normalizeHeader(interestName));
        if (!interest) errors.push(`مجال اهتمام غير مسجل: ${interestName}`);
        else interestIds.push(interest.id);
      }

      // No-sale reason is optional import metadata. An unknown or missing value
      // must never block saving the customer or the related sales operation.
      const reason = row.noSaleReason
        ? reasonMap.get(normalizeHeader(row.noSaleReason))
        : null;

      return {
        ...canonicalRow,
        normalizedPhone: row.phone,
        representativeId: representative?.id || null,
        interestIds,
        noSaleReasonId: reason?.id || null,
        existingCustomer: existing,
        previouslyUploaded: false,
        status: errors.length ? "error" : (existing ? "existing" : "new"),
        errors,
        statusNote: errors.length ? errors.join(" — ") : (existing ? "عميل موجود" : "جاهز")
      };
    });

    return {
      rows: previewRows,
      summary: {
        total: previewRows.length,
        valid: previewRows.filter(row => !row.errors.length && !row.previouslyUploaded).length,
        errors: previewRows.filter(row => row.errors.length).length,
        newCustomers: previewRows.filter(row => row.status === "new").length,
        existingCustomers: previewRows.filter(row => row.previouslyUploaded).length,
        duplicates: previewRows.filter(row =>
          !row.previouslyUploaded && row.errors.includes("رقم الجوال مكرر داخل الملف")
        ).length
      }
    };
  }


  function exportFailedRows(failedRows) {
    requireXlsx();
    const rows = (failedRows || []).map(item => ({
      "رقم الصف في الملف": item.sourceRow || "",
      "رقم العميل": item.customerNumber || "",
      "اسم العميل": item.name || "",
      "رقم الجوال": item.phone || "",
      "التصنيف": item.type || "",
      "اسم المسؤول": item.contactPersonName || "",
      "المنطقة": item.region || "",
      "المدينة": item.city || "",
      "الحي": item.district || "",
      "مجالات الاهتمام": Array.isArray(item.interests) ? item.interests.join("، ") : (item.interests || ""),
      "مندوب المبيعات": item.representative || "",
      "تاريخ آخر تواصل": item.contactDate || "",
      "رقم عرض السعر": item.quotationNumber || "",
      "سبب عدم البيع": item.noSaleReason || "",
      "الملاحظات": item.notes || "",
      "سبب الخطأ": item.message || item.errors?.join(" — ") || ""
    }));
    if (!rows.length) throw new Error("لا توجد صفوف فاشلة للتصدير.");
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      {wch:18},{wch:16},{wch:30},{wch:18},{wch:12},{wch:24},{wch:18},{wch:18},
      {wch:20},{wch:32},{wch:24},{wch:18},{wch:18},{wch:24},{wch:36},{wch:60}
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Failed Rows");
    XLSX.writeFile(workbook, `PETATOE_Customers_Failed_${new Date().toISOString().slice(0,19).replaceAll(":","-")}.xlsx`, { compression: true });
    return rows.length;
  }

  window.CustomerExcelCenter = Object.freeze({
    exportCustomers,
    downloadTemplate,
    parseImportFile,
    buildImportPreview,
    normalizePhone,
    exportFailedRows,
    headers: [...EXPORT_HEADERS]
  });
})();