(() => {
  "use strict";

  const CACHE_PREFIX = "sales-reports:v3-complete:";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const CACHE_SCHEMA_VERSION = 3;
  const RPC_PAGE_SIZE = 500;
  const RPC_MAX_PAGES = 200;
  const MONTH_KEYS = Object.freeze([
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ]);
  const WEEKDAY_AR = Object.freeze(["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]);
  const WEEKDAY_EN = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const t = (key, fallback, vars = {}) => {
    const value = window.PetatoeLocalization?.t?.(key, vars);
    return value && !/^\[.+\]$/.test(value) ? value : fallback;
  };
  const lang = () => window.PetatoeLocalization?.getLanguage?.() === "en" ? "en" : "ar";
  const isEnglish = () => lang() === "en";
  const number = value => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
  const decimal = value => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const money = value => `${decimal(value)} SAR`;
  const pct = value => `${Number(value || 0).toFixed(1)}%`;
  const monthLabel = month => {
    const index = Number(month) - 1;
    return index >= 0 && index < 12 ? t(`salesReports.month.${month}`, MONTH_KEYS[index], {}) : "—";
  };
  const currentYear = () => new Date().getFullYear();
  const currentMonth = () => new Date().getMonth() + 1;
  const dateOnly = value => {
    const raw = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dateLabel = value => {
    const d = dateOnly(value);
    if (!d) return "—";
    return new Intl.DateTimeFormat(isEnglish() ? "en-GB" : "en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d);
  };
  const periodStart = (year, month) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const periodEnd = (year, month) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
  const normalizeRow = row => ({
    rowId: row?.row_id || "",
    invoiceNumber: row?.invoice_number || t("salesReports.common.undefined", "غير محدد"),
    requestNumber: row?.request_number || "",
    customerId: row?.customer_id || "",
    customerName: row?.customer_name_ar || t("salesReports.common.undefined", "غير محدد"),
    neighborhoodId: row?.neighborhood_id || "",
    neighborhoodAr: row?.neighborhood_name_ar || "",
    neighborhoodEn: row?.neighborhood_name_en || "",
    invoiceDate: String(row?.invoice_date || "").slice(0, 10),
    status: row?.status || "صادرة",
    paymentMethod: row?.payment_method || "",
    sourceType: row?.source_type || "",
    beforeTax: Number(row?.amount_before_tax || 0),
    tax: Number(row?.tax_amount || 0),
    discount: Number(row?.discount_amount || 0),
    total: Number(row?.amount_incl_tax || 0),
    teamId: row?.team_id || "",
    teamName: row?.team_name || "",
    carId: row?.car_id || "",
    carName: row?.car_name || "",
    plateNumber: row?.plate_number || "",
    historical: Boolean(row?.is_historical),
    recordType: row?.record_type || "invoice"
  });

  let allRows = [];
  let filteredRows = [];
  let initialized = false;
  let loading = false;
  let renderedRows = 10;
  let lastLoadedAt = 0;

  function userId() {
    return window.KYUMOfflineSessionStore?.currentUserId?.()
      || window.CustomerAuth?.getState?.()?.profile?.id
      || window.CustomerAuth?.getState?.()?.user?.id
      || "anonymous";
  }

  async function cacheNamespace() {
    return `user:${userId()}`;
  }

  async function cacheKey() {
    return `${CACHE_PREFIX}${userId()}`;
  }

  async function readCache() {
    if (!window.KYUMSmartCache) return null;
    try {
      const hit = await window.KYUMSmartCache.get(await cacheKey(), {
        namespace: await cacheNamespace(),
        allowStale: true,
        staleMaxMs: CACHE_STALE_MAX_MS
      });
      return hit?.hit ? hit.data : null;
    } catch (_) {
      return null;
    }
  }

  async function writeCache(rows) {
    if (!window.KYUMSmartCache) return;
    try {
      await window.KYUMSmartCache.set(await cacheKey(), rows, {
        namespace: await cacheNamespace(),
        ttlMs: CACHE_TTL_MS,
        staleMaxMs: CACHE_STALE_MAX_MS,
        source: "supabase",
        schemaVersion: CACHE_SCHEMA_VERSION
      });
    } catch (_) {}
  }

  function setStatus(message, type = "") {
    const el = $("salesReportsStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = `data-status${message ? "" : " hidden"}${type ? ` ${type}` : ""}`;
  }

  function selectedFilters() {
    return {
      year: $("salesReportsYear")?.value === "" ? 0 : Number($("salesReportsYear")?.value || currentYear()),
      month: $("salesReportsMonth")?.value === "" ? 0 : Number($("salesReportsMonth")?.value || currentMonth()),
      vehicle: $("salesReportsVehicle")?.value || "",
      customer: $("salesReportsCustomer")?.value || "",
      team: $("salesReportsTeam")?.value || "",
      payment: $("salesReportsPayment")?.value || "",
      status: $("salesReportsStatusFilter")?.value || ""
    };
  }

  function availableYears() {
    const years = new Set(allRows.map(row => dateOnly(row.invoiceDate)?.getFullYear()).filter(Boolean));
    if (!years.size) years.add(currentYear());
    return [...years].sort((a, b) => b - a);
  }

  function availableMonths(year) {
    const months = new Set(
      allRows
        .filter(row => dateOnly(row.invoiceDate)?.getFullYear() === Number(year))
        .map(row => dateOnly(row.invoiceDate)?.getMonth() + 1)
        .filter(Boolean)
    );
    return [...months].sort((a, b) => a - b);
  }

  function option(value, label, selected = false) {
    return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
  }

  function populateYearMonth(preserve = true) {
    const yearSelect = $("salesReportsYear");
    const monthSelect = $("salesReportsMonth");
    if (!yearSelect || !monthSelect) return;
    const previousYear = preserve && yearSelect.value === "" ? 0 : (preserve ? Number(yearSelect.value || currentYear()) : currentYear());
    const years = availableYears();
    const year = previousYear === 0 ? 0 : (years.includes(previousYear) ? previousYear : (years.includes(currentYear()) ? currentYear() : years[0]));
    yearSelect.innerHTML = option("", t("salesReports.filter.allYears", "كل السنوات"), year === 0) + years.map(y => option(y, y, y === year)).join("");

    const previousMonth = preserve && monthSelect.value === "" ? 0 : (preserve ? Number(monthSelect.value || currentMonth()) : currentMonth());
    const months = year === 0 ? [...new Set(allRows.map(row => dateOnly(row.invoiceDate)?.getMonth() + 1).filter(Boolean))].sort((a,b)=>a-b) : availableMonths(year);
    const monthOptions = months.length ? months : [currentMonth()];
    const month = monthOptions.includes(previousMonth)
      ? previousMonth
      : (monthOptions.includes(currentMonth()) ? currentMonth() : monthOptions[monthOptions.length - 1]);
    monthSelect.innerHTML = option("", t("salesReports.filter.allMonths", "كل الشهور المتاحة"), previousMonth === 0 || !months.includes(previousMonth))
      + monthOptions.map(m => option(m, monthLabel(m), m === month)).join("");
    monthSelect.value = previousMonth === 0 || !months.includes(previousMonth) ? "" : String(previousMonth);
  }

  function populateFilters(preserve = true) {
    const filters = selectedFilters();
    populateYearMonth(preserve);
    const values = {
      vehicle: uniqueOptions("carId", "carName", "plateNumber"),
      customer: uniqueOptions("customerId", "customerName"),
      team: uniqueOptions("teamId", "teamName"),
      payment: [...new Set(allRows.map(row => canonicalPaymentMethod(row.paymentMethod)))].sort((a, b) => a.localeCompare(b, isEnglish() ? "en" : "ar")),
      status: uniqueTextOptions("status")
    };
    ["vehicle", "customer", "team", "payment", "status"].forEach(kind => {
      const select = $(kind === "status" ? "salesReportsStatusFilter" : `salesReports${kind[0].toUpperCase()}${kind.slice(1)}`);
      if (!select) return;
      const current = preserve ? (kind === "status" ? filters.status : filters[kind]) : "";
      let html = option("", t("salesReports.filter.all", "الكل"), !current);
      if (kind === "vehicle") html += values.vehicle.map(x => option(x.id, `${x.name}${x.plate ? ` — ${x.plate}` : ""}`, x.id === current)).join("");
      if (kind === "customer") html += values.customer.map(x => option(x.id, x.name, x.id === current)).join("");
      if (kind === "team") html += values.team.map(x => option(x.id, x.name, x.id === current)).join("");
      if (kind === "payment") html += values.payment.map(x => option(x, paymentLabel(x), x === current)).join("");
      if (kind === "status") html += values.status.map(x => option(x, statusLabel(x), x === current)).join("");
      select.innerHTML = html;

    });
  }

  function uniqueOptions(idKey, nameKey, secondaryKey = "") {
    const map = new Map();
    allRows.forEach(row => {
      const id = String(row[idKey] || "");
      if (!id) return;
      const name = String(row[nameKey] || t("salesReports.common.undefined", "غير محدد"));
      const secondary = secondaryKey ? String(row[secondaryKey] || "") : "";
      const existing = map.get(id);
      if (!existing || (!existing.name && name)) map.set(id, { id, name, plate: secondary });
    });
    return [...map.values()].sort((a, b) => `${a.name} ${a.plate}`.localeCompare(`${b.name} ${b.plate}`, isEnglish() ? "en" : "ar"));
  }

  function uniqueTextOptions(key) {
    return [...new Set(allRows.map(row => String(row[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, isEnglish() ? "en" : "ar"));
  }

  // Presentation-only reconciliation of synonymous card/network payment labels.
  // Source values remain unchanged; confirmed website/electronic labels share a report category.
  function canonicalPaymentMethod(value) {
    const key = String(value || "").trim().replace(/\s+/g, " ");
    if (["شبكة", "بطاقة", "بطاقة / شبكة", "بطاقة/شبكة"].includes(key)) return "بطاقة / شبكة";
    if (["دفع إلكتروني", "الدفع الإلكتروني", "الدفع عن طريق الموقع"].includes(key)) return "الدفع عن طريق الموقع";
    return key || "غير محدد";
  }

  function paymentLabel(value) {
    const key = String(value || "").trim();
    if (key === "نقدي") return t("salesReports.common.cash", "نقدي");
    if (key === "آجل") return t("salesReports.common.credit", "آجل");
    if (key === "بطاقة / شبكة") return t("salesReports.common.card", "بطاقة / شبكة");
    if (key === "تحويل بنكي") return t("salesReports.common.bankTransfer", "تحويل بنكي");
    if (key === "الدفع عن طريق الموقع") return isEnglish() ? "Website payment" : "الدفع عن طريق الموقع";
    return key || t("salesReports.common.undefined", "غير محدد");
  }

  function statusLabel(value) {
    const key = String(value || "").trim();
    if (key === "صادرة") return t("salesReports.common.issued", "صادرة");
    if (key === "ملغاة") return t("salesReports.common.cancelled", "ملغاة");
    return key || t("salesReports.common.undefined", "غير محدد");
  }

  function customerNeighborhood(row) {
    return isEnglish() ? (row.neighborhoodEn || row.neighborhoodAr || t("salesReports.common.undefined", "Not specified")) : (row.neighborhoodAr || t("salesReports.common.undefined", "غير محدد"));
  }

  function filterRows(filters) {
    return allRows.filter(row => {
      const d = dateOnly(row.invoiceDate);
      if (!d || (filters.year && d.getFullYear() !== filters.year)) return false;
      if (filters.month && d.getMonth() + 1 !== filters.month) return false;
      if (filters.vehicle && row.carId !== filters.vehicle) return false;
      if (filters.customer && row.customerId !== filters.customer) return false;
      if (filters.team && row.teamId !== filters.team) return false;
      if (filters.payment && canonicalPaymentMethod(row.paymentMethod) !== filters.payment) return false;
      if (filters.status && row.status !== filters.status) return false;
      return true;
    });
  }

  function aggregateInvoiceRows(rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = row.historical
        ? `historical:${row.invoiceNumber}:${row.invoiceDate}:${row.customerId || row.customerName}`
        : `current:${row.rowId}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...row });
        return;
      }
      existing.beforeTax += row.beforeTax;
      existing.tax += row.tax;
      existing.discount += row.discount;
      existing.total += row.total;
    });
    return [...map.values()].sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate)) || String(a.invoiceNumber).localeCompare(String(b.invoiceNumber)));
  }

  function summarize(rows) {
    const issued = rows.filter(row => row.status === "صادرة");
    // All visuals and the detail table must use the same explicit status-filtered dataset.
    // Cash aggregates remain revenue records, not distinct customer invoices.
    const source = rows;
    const invoiceSource = source.filter(row => row.recordType !== "cash_aggregate");
    const invoiceRows = aggregateInvoiceRows(invoiceSource);
    const beforeTax = source.reduce((sum, row) => sum + row.beforeTax, 0);
    const tax = source.reduce((sum, row) => sum + row.tax, 0);
    const discount = source.reduce((sum, row) => sum + row.discount, 0);
    const total = source.reduce((sum, row) => sum + row.total, 0);
    const reconstructedTotal = beforeTax + tax;
    const financialDelta = total - reconstructedTotal;
    const paymentMap = new Map();
    source.forEach(row => {
      const key = canonicalPaymentMethod(row.paymentMethod);
      paymentMap.set(key, (paymentMap.get(key) || 0) + row.total);
    });
    const paymentMethods = [...paymentMap.entries()].filter(([key, value]) => key !== "غير محدد" || Math.abs(value) > 0.005)
      .map(([key, value]) => ({ key, value, pct: total ? value / total * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
    const cash = paymentMap.get("نقدي") || 0;
    const credit = paymentMap.get("آجل") || 0;
    return {
      source,
      issued,
      invoiceRows,
      beforeTax,
      tax,
      discount,
      total,
      reconstructedTotal,
      financialDelta,
      cash,
      credit,
      paymentMethods,
      invoiceCount: invoiceRows.length,
      averageInvoice: invoiceRows.length ? invoiceSource.reduce((sum, row) => sum + row.total, 0) / invoiceRows.length : 0,
      issuedShare: rows.length ? issued.length / rows.length * 100 : 0
    };
  }

  function previousPeriodFilters(filters) {
    let year = filters.year;
    let month = filters.month;
    if (month) {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    } else {
      year -= 1;
    }
    return { ...filters, year, month };
  }

  function currentRowsForComparison(filters) {
    return filterRows(filters);
  }

  function comparisonSummary(filters) {
    const previousFilters = previousPeriodFilters(filters);
    const current = summarize(currentRowsForComparison(filters));
    const previous = summarize(filterRows(previousFilters));
    const delta = previous.total ? ((current.total - previous.total) / Math.abs(previous.total)) * 100 : (current.total ? 100 : 0);
    return { current, previous, delta, previousFilters };
  }

  function renderKpis(summary) {
    const cards = [
      ["totalSales", money(summary.total), "salesReports.kpi.totalSales"],
      ["invoiceCount", number(summary.invoiceCount), "salesReports.kpi.invoiceCount"],
      ["beforeTax", money(summary.beforeTax), "salesReports.kpi.beforeTax"],
      ["tax", money(summary.tax), "salesReports.kpi.tax"],
      ["discount", money(summary.discount), "salesReports.kpi.discount"],
      ["averageInvoice", money(summary.averageInvoice), "salesReports.kpi.averageInvoice"],
      ["cashSales", money(summary.cash), "salesReports.kpi.cashSales"],
      ["creditSales", money(summary.credit), "salesReports.kpi.creditSales"],
      ["issuedShare", pct(summary.issuedShare), "salesReports.kpi.issuedShare"]
    ];
    const host = $("salesReportsKpiGrid");
    if (!host) return;
    host.innerHTML = cards.map(([key, value, labelKey]) => `
      <article class="sales-report-kpi-card sales-report-kpi-card--${esc(key)}">
        <span>${esc(t(labelKey, key))}</span>
        <strong>${esc(value)}</strong>
      </article>`).join("");
  }

  function svgLineChart(rows, year, month, chartWidth) {
    const days = month ? daysInMonth(year, month) : 31;
    const width = Math.max(920, days * 34, chartWidth || 1100), height = 330, pad = { left: 184, right: 32, top: 28, bottom: 58 };
    const values = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      return rows.filter(row => {
        const d = dateOnly(row.invoiceDate);
        return d && d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
      }).reduce((sum, row) => sum + row.total, 0);
    });
    const max = Math.max(...values, 1);
    const x = index => pad.left + (index / Math.max(values.length - 1, 1)) * (width - pad.left - pad.right);
    const y = value => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
    const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
    const grid = Array.from({ length: 5 }, (_, i) => {
      const value = max * i / 4;
      const yy = y(value);
      return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" class="sales-chart-grid"/><text x="${pad.left - 54}" y="${yy + 4}" text-anchor="end" class="sales-chart-label sales-chart-label--axis">${esc(number(value))}</text>`;
    }).join("");
    const labels = values.map((_, i) => {
      const day = i + 1;
      return `<text x="${x(i)}" y="${height - 15}" text-anchor="middle" class="sales-chart-label sales-chart-label--day">${day}</text>`;
    }).join("");
    const circles = values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" class="sales-chart-point" data-day="${index + 1}" data-value="${esc(money(value))}" tabindex="0"><title>${dayLabel(index + 1)}: ${money(value)}</title></circle>`).join("");
    const areaPoints = `${pad.left},${height - pad.bottom} ${points} ${x(values.length - 1)},${height - pad.bottom}`;
    return `<svg class="sales-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t("salesReports.report.daily.title", "المبيعات عبر أيام الشهر"))}">${grid}<polygon points="${areaPoints}" class="sales-chart-area"/><polyline points="${points}" class="sales-chart-line"/>${circles}${labels}</svg>`;
  }

  function dayLabel(day) {
    return `${day}`;
  }

  function bindDailyTooltip(host) {
    const tooltip = host.querySelector('.sales-chart-tooltip');
    if (!tooltip) return;
    const show = (target, clientX, clientY) => {
      const rect = host.getBoundingClientRect();
      tooltip.innerHTML = `<strong>${esc(isEnglish() ? `Day ${target.dataset.day}` : `اليوم ${target.dataset.day}`)}</strong><span>${esc(target.dataset.value || money(0))}</span>`;
      tooltip.hidden = false;
      const left = Math.min(Math.max(12, clientX - rect.left + 14), rect.width - 180);
      const top = Math.max(10, clientY - rect.top - 56);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    const hide = () => { tooltip.hidden = true; };
    host.querySelectorAll('.sales-chart-point').forEach(point => {
      point.addEventListener('mouseenter', event => show(point, event.clientX, event.clientY));
      point.addEventListener('mousemove', event => show(point, event.clientX, event.clientY));
      point.addEventListener('mouseleave', hide);
      point.addEventListener('focus', () => {
        const box = point.getBoundingClientRect();
        show(point, box.left + box.width / 2, box.top);
      });
      point.addEventListener('blur', hide);
    });
  }

  function renderDaily(rows, filters) {
    const host = $("salesReportsDailyChart");
    if (!host) return;
    if (!filters.month) {
      host.innerHTML = `<div class="sales-report-empty-chart">${esc(t("salesReports.report.daily.note", "اختر شهرًا لعرض حركة المبيعات اليومية."))}</div>`;
      return;
    }
    host.innerHTML = `<div class="sales-daily-chart-shell">${svgLineChart(rows, filters.year, filters.month, Math.round(host.getBoundingClientRect().width))}<div class="sales-chart-tooltip" hidden></div></div>`;
    bindDailyTooltip(host);
  }

  const PAYMENT_COLORS = Object.freeze([
    "var(--primary)",
    "#f59e0b",
    "#60a5fa",
    "#22c55e",
    "#8b5cf6",
    "#94a3b8"
  ]);

  function renderDonut(summary) {
    const host = $("salesReportsPaymentChart");
    if (!host) return;
    const total = Math.max(summary.total, 0);
    const methods = summary.paymentMethods || [];
    let cursor = 0;
    const segments = methods.map((method, index) => {
      const start = cursor;
      cursor += method.pct * 3.6;
      return `${PAYMENT_COLORS[index % PAYMENT_COLORS.length]} ${start}deg ${cursor}deg`;
    });
    const gradient = segments.length ? segments.join(", ") : "var(--surface-2) 0deg 360deg";
    const headMethod = esc(isEnglish() ? 'Payment method' : 'طريقة السداد');
    const headAmount = esc(isEnglish() ? 'Sales total' : 'إجمالي المبيعات');
    const headPct = esc(isEnglish() ? 'Share' : 'النسبة');
    host.innerHTML = `<div class="sales-payment-table"><div class="sales-payment-table-head"><span>${headMethod}</span><span>${headAmount}</span><span>${headPct}</span></div>${methods.length ? methods.map((method, index) => `<div class="sales-payment-table-row"><span class="sales-payment-method"><i class="sales-legend-dot" style="background:${PAYMENT_COLORS[index % PAYMENT_COLORS.length]}"></i>${esc(paymentLabel(method.key))}</span><strong><bdi dir="ltr">${esc(money(method.value))}</bdi></strong><span class="sales-payment-share"><bdi dir="ltr">${esc(pct(method.pct))}</bdi></span></div>`).join("") : `<div class="sales-payment-table-row"><span class="sales-payment-method">${esc(t("salesReports.common.undefined", "غير محدد"))}</span><strong><bdi dir="ltr">${esc(money(0))}</bdi></strong><span class="sales-payment-share"><bdi dir="ltr">${esc(pct(0))}</bdi></span></div>`}</div><div class="sales-donut" style="--payment-gradient:${gradient}" aria-hidden="true"><div><strong>${esc(money(total))}</strong><span>${esc(t("salesReports.kpi.totalSales", "إجمالي المبيعات"))}</span></div></div>`;
  }

  function renderMonthly(rows, filters) {
    const host = $("salesReportsMonthlyChart");
    if (!host) return;
    const baseRows = rows.filter(row =>
      (!filters.vehicle || row.carId === filters.vehicle)
      && (!filters.customer || row.customerId === filters.customer)
      && (!filters.team || row.teamId === filters.team)
      && (!filters.payment || canonicalPaymentMethod(row.paymentMethod) === filters.payment)
      && (!filters.status || row.status === filters.status)
    );
    const values = Array.from({ length: 12 }, (_, i) => baseRows.filter(row => {
      const d = dateOnly(row.invoiceDate);
      return d && (!filters.year || d.getFullYear() === filters.year) && d.getMonth() === i;
    }).reduce((sum, row) => sum + row.total, 0));
    const max = Math.max(...values, 1);
    host.innerHTML = values.map((value, i) => {
      const height = value > 0 ? Math.max(3, value / max * 82) : 0;
      const labelBottom = `calc(${height}% + 10px)`;
      return `<div class="sales-month-column"><div class="sales-month-track"><span style="height:${height}%"${filters.month === i + 1 ? " class=\"is-selected\"" : ""}></span><strong class="sales-month-value" style="bottom:${labelBottom}">${esc(number(value))}</strong></div><small>${esc(monthLabel(i + 1))}</small></div>`;
    }).join("");
  }

  function renderNeighborhood(rows) {
    const host = $("salesReportsNeighborhoodTable");
    if (!host) return;
    const map = new Map();
    rows.forEach(row => {
      const key = row.neighborhoodId || "__undefined__";
      const label = key === "__undefined__" ? t("salesReports.common.undefined", "غير محدد") : customerNeighborhood(row);
      const item = map.get(key) || { label, total: 0, invoices: new Set(), customers: new Set() };
      item.total += row.total;
      if (row.recordType !== "cash_aggregate") {
        item.invoices.add(row.historical ? `${row.invoiceNumber}|${row.invoiceDate}|${row.customerId}` : row.rowId);
      }
      if (row.customerId) item.customers.add(row.customerId);
      map.set(key, item);
    });
    const values = [...map.values()].sort((a, b) => b.total - a.total);
    const max = Math.max(...values.map(x => x.total), 1);
    host.innerHTML = values.length ? `<div class="sales-neighborhood-head"><span>${esc(t("salesReports.table.neighborhood", "الحي"))}</span><span>${esc(t("salesReports.table.customer", "العملاء"))}</span><span>${esc(t("salesReports.table.invoice", "الفواتير"))}</span><span>${esc(t("salesReports.kpi.totalSales", "إجمالي المبيعات"))}</span></div>${values.map(item => `<div class="sales-neighborhood-row"><strong>${esc(item.label)}</strong><span>${esc(number(item.customers.size))}</span><span>${esc(number(item.invoices.size))}</span><div><div class="sales-neighborhood-track"><span style="width:${Math.max(2, item.total / max * 100)}%"></span></div><strong>${esc(money(item.total))}</strong></div></div>`).join("")}` : emptyBlock();
  }

  // Year-to-year comparisons always use the full corresponding periods;
  // month selector affects operational charts/KPIs but does not truncate annual comparisons.
  // All non-date filters apply identically to both years.
  function comparisonYears(filters) {
    const year = filters.year || currentYear();
    const baseline = allRows.filter(row =>
      (!filters.vehicle || row.carId === filters.vehicle) &&
      (!filters.customer || row.customerId === filters.customer) &&
      (!filters.team || row.teamId === filters.team) &&
      (!filters.payment || canonicalPaymentMethod(row.paymentMethod) === filters.payment) &&
      (!filters.status || row.status === filters.status)
    );
    const current = Array.from({length: 12}, () => 0);
    const previous = Array.from({length: 12}, () => 0);
    baseline.forEach(row => {
      const d = dateOnly(row.invoiceDate);
      if (!d) return;
      if (d.getFullYear() === year) current[d.getMonth()] += row.total;
      if (d.getFullYear() === year - 1) previous[d.getMonth()] += row.total;
    });
    return { year, current, previous };
  }

  // A7: paired-column visualizations and tables consume the exact same arrays.
  // Values remain in the reporting contract; only their presentation changes.
  function comparisonChart(labels, current, previous, year) {
    const length = labels.length;
    const isMonth = length === 12;
    const isQuarter = length === 4;
    const isYear = length === 1;
    const width = isMonth ? 2160 : isQuarter ? 1180 : 660;
    const height = isYear ? 300 : isMonth ? 430 : 400;
    const pad = isMonth
      ? { left: 142, right: 48, top: 92, bottom: 74 }
      : isYear
        ? { left: 128, right: 42, top: 76, bottom: 58 }
        : { left: 124, right: 44, top: 84, bottom: 68 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const maxValue = Math.max(1, ...current, ...previous);
    const ceiling = maxValue * (isYear ? 1.14 : isMonth ? 1.26 : 1.20);
    const y = value => pad.top + plotHeight * (1 - Math.max(0, value) / ceiling);
    const baseline = y(0);
    const group = plotWidth / length;
    const gap = isMonth ? 30 : isQuarter ? 18 : 20;
    const bar = Math.min(isMonth ? 34 : isQuarter ? 84 : 118, (group - gap) * .36);
    const tick = n => number(n);
    const fractions = isYear ? [0, .33, .66, 1] : [0, .25, .5, .75, 1];
    const grid = fractions.map(fraction => {
      const yy = pad.top + plotHeight * (1 - fraction);
      return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" class="sales-comparison-grid"/><text x="${pad.left - 24}" y="${yy + 5}" text-anchor="end" class="sales-comparison-axis sales-comparison-axis--guide">${esc(tick(ceiling * fraction))}</text>`;
    }).join("");
    const bars = labels.map((label, index) => {
      const center = pad.left + group * (index + .5);
      const prev = { value: previous[index], cx: center - (bar + gap) / 2, kind: 'previous', barYear: year - 1 };
      const curr = { value: current[index], cx: center + (bar + gap) / 2, kind: 'current', barYear: year };
      const entries = [prev, curr].map(entry => {
        entry.top = y(entry.value);
        entry.h = Math.max(0, baseline - entry.top);
        return entry;
      });
      const close = Math.abs(entries[0].top - entries[1].top) < 22;
      const pair = entries.map((entry, lane) => {
        const rect = entry.h > 0 ? `<rect x="${entry.cx - bar / 2}" y="${entry.top}" width="${bar}" height="${entry.h}" rx="6" class="sales-comparison-bar sales-comparison-bar--${entry.kind}"><title>${esc(label)} — ${entry.barYear}: ${esc(money(entry.value))}</title></rect>` : "";
        let labelX = entry.cx;
        let labelAnchor = 'middle';
        let labelY = entry.top - 10;
        if (isMonth) {
          // Keep the label centered above its actual bar; stagger only vertically.
          labelX = entry.cx;
          labelAnchor = 'middle';
          labelY = entry.top - (close ? (lane === 0 ? 28 : 10) : 12);
        } else if (close) {
          labelY = entry.top - (lane === 0 ? 24 : 8);
        }
        labelY = Math.max(26, labelY);
        const valueLabel = entry.value > 0 ? `<text x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}" class="sales-comparison-value sales-comparison-value--${entry.kind}">${esc(tick(entry.value))}</text>` : "";
        return rect + valueLabel;
      }).join("");
      return pair + `<text x="${center}" y="${height - 22}" text-anchor="middle" class="sales-comparison-axis sales-comparison-category">${esc(label)}</text>`;
    }).join("");
    return `<div class="sales-comparison-visual" role="group" aria-label="${esc(isEnglish() ? 'Sales by period, two-year comparison' : 'رسم مقارنة المبيعات بين سنتين')}"><div class="sales-comparison-legend"><span><i class="sales-comparison-legend-current"></i>${esc(String(year))}</span><span><i class="sales-comparison-legend-previous"></i>${esc(String(year - 1))}</span></div><div class="sales-comparison-chart-scroll"><svg class="sales-comparison-svg${isYear ? ' sales-comparison-svg--year' : isMonth ? ' sales-comparison-svg--month' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(isEnglish() ? 'Grouped sales bar chart' : 'رسم أعمدة المبيعات المقارنة')}">${grid}${bars}</svg></div></div>`;
  }

  function comparisonTable(labels, current, previous, year) {
    const totalCurrent = current.reduce((a, b) => a + b, 0);
    const totalPrevious = previous.reduce((a, b) => a + b, 0);
    const headers = isEnglish()
      ? ["Period", String(year), String(year - 1), "Change"]
      : ["الفترة", String(year), String(year - 1), "التغير"];
    const change = (a, b) => b === 0 ? (a === 0 ? "—" : (isEnglish() ? "New" : "جديد")) : `${a >= b ? "+" : ""}${pct((a - b) / Math.abs(b) * 100)}`;
    const cells = (label, a, b, isTotal = false) => `<div class="sales-period-row${isTotal ? " is-total" : ""}"><strong>${esc(label)}</strong><span>${esc(money(a))}</span><span>${esc(money(b))}</span><strong data-role="change" class="${a > b ? "positive" : a < b ? "negative" : "neutral"}"><bdi dir="ltr">${esc(change(a,b))}</bdi></strong></div>`;
    return `<div class="sales-period-comparison"><div class="sales-period-row sales-period-head">${headers.map(h => `<span>${esc(h)}</span>`).join("")}</div>${labels.map((label,i) => cells(label,current[i],previous[i])).join("")}${cells(isEnglish() ? "Total" : "الإجمالي",totalCurrent,totalPrevious,true)}</div>`;
  }

  function renderComparison(filters) {
    const data = comparisonYears(filters);
    const host = $("salesReportsComparisonChart");
    if (!host) return;
    const currentTotal = data.current.reduce((a,b) => a+b,0);
    const previousTotal = data.previous.reduce((a,b) => a+b,0);
    const labels = [isEnglish() ? "Full year" : "السنة كاملة"];
    host.innerHTML = comparisonChart([String(data.year)], [currentTotal], [previousTotal], data.year)
      + comparisonTable(labels, [currentTotal], [previousTotal], data.year);
  }

  function renderQuarterComparison(filters) {
    const host = $("salesReportsQuarterChart");
    if (!host) return;
    const data = comparisonYears(filters);
    const quarters = array => [0,1,2,3].map(q => array.slice(q*3, q*3+3).reduce((a,b) => a+b,0));
    const labels = [1,2,3,4].map(q => isEnglish() ? `Q${q}` : `الربع ${q}`);
    const current = quarters(data.current), previous = quarters(data.previous);
    host.innerHTML = comparisonChart(labels, current, previous, data.year)
      + comparisonTable(labels, current, previous, data.year);
  }

  function renderMonthComparison(filters) {
    const host = $("salesReportsMonthComparisonChart");
    if (!host) return;
    const data = comparisonYears(filters);
    const labels = Array.from({length:12},(_,i) => monthLabel(i+1));
    host.innerHTML = comparisonChart(labels, data.current, data.previous, data.year)
      + comparisonTable(labels, data.current, data.previous, data.year);
  }

  function renderWeekday(rows) {
    const host = $("salesReportsWeekdayChart");
    if (!host) return;
    const values = Array.from({ length: 7 }, () => 0);
    rows.forEach(row => {
      const d = dateOnly(row.invoiceDate);
      if (d) values[d.getDay()] += row.total;
    });
    const max = Math.max(...values, 1);
    const labels = isEnglish() ? WEEKDAY_EN : WEEKDAY_AR;
    host.innerHTML = values.map((value, i) => {
      const height = value > 0 ? Math.max(3, value / max * 80) : 0;
      return `<div class="sales-weekday-column"><div class="sales-weekday-track"><span style="height:${height}%"></span><strong class="sales-weekday-value" style="bottom:calc(${height}% + 10px)">${esc(number(value))}</strong></div><small>${esc(labels[i])}</small></div>`;
    }).join("");
  }

  function renderDiscount(rows) {
    const host = $("salesReportsDiscountChart");
    if (!host) return;
    const gross = rows.reduce((sum, row) => sum + row.beforeTax + row.discount, 0);
    const discount = rows.reduce((sum, row) => sum + row.discount, 0);
    const rate = gross ? discount / gross * 100 : 0;
    host.innerHTML = `<div class="sales-analysis-cards"><article><span>${esc(t("salesReports.kpi.discount", "إجمالي الخصومات"))}</span><strong>${esc(money(discount))}</strong></article><article><span>${esc(t("salesReports.table.beforeTax", "قبل الضريبة"))}</span><strong>${esc(money(gross))}</strong></article><article><span>${esc(t("salesReports.kpi.discount", "نسبة الخصم"))}</span><strong>${esc(pct(rate))}</strong></article></div><div class="sales-analysis-progress"><span style="width:${Math.min(100, Math.max(0, rate))}%"></span></div>`;
  }

  function renderVat(rows) {
    const host = $("salesReportsVatChart");
    if (!host) return;
    const beforeTax = rows.reduce((sum, row) => sum + row.beforeTax, 0);
    const tax = rows.reduce((sum, row) => sum + row.tax, 0);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const taxRate = total ? Math.max(0, Math.min(100, tax / total * 100)) : 0;
    const reconstructionDelta = total - (beforeTax + tax);
    const mismatch = Math.abs(reconstructionDelta) > 0.005;
    host.innerHTML = `<div class="sales-vat-total"><strong>${esc(money(total))}</strong><span>${esc(t("salesReports.table.total", "شامل الضريبة"))}</span></div><div class="sales-vat-stack"><span style="width:${Math.max(0, 100 - taxRate)}%"></span><i style="width:${taxRate}%"></i></div><div class="sales-vat-legend"><span>${esc(t("salesReports.table.beforeTax", "قبل الضريبة"))}<strong>${esc(money(beforeTax))}</strong></span><span>${esc(t("salesReports.table.tax", "الضريبة"))}<strong>${esc(money(tax))}</strong></span></div>${mismatch ? `<div class="sales-vat-note">${esc(t("salesReports.report.vat.mismatch", "يوجد فرق بين الإجمالي الفعلي وإعادة بناء الإجمالي من قبل الضريبة والضريبة"))}: ${esc(money(reconstructionDelta))}</div>` : ""}`;
  }

  function renderTable(summary) {
    const host = $("salesReportsTableBody");
    const more = $("salesReportsShowMore");
    const count = $("salesReportsTableCount");
    if (!host) return;
    const rows = summary.invoiceRows;
    const visible = rows.slice(0, renderedRows);
    host.innerHTML = visible.length ? visible.map(row => `<tr>
      <td>${esc(dateLabel(row.invoiceDate))}</td>
      <td><strong>${esc(row.invoiceNumber)}</strong></td>
      <td>${esc(row.customerName)}</td>
      <td>${esc(customerNeighborhood(row))}</td>
      <td>${esc(row.teamName || t("salesReports.common.undefined", "غير محدد"))}</td>
      <td>${esc([row.carName, row.plateNumber].filter(Boolean).join(" — ") || t("salesReports.common.undefined", "غير محدد"))}</td>
      <td>${esc(paymentLabel(canonicalPaymentMethod(row.paymentMethod)))}</td>
      <td>${esc(statusLabel(row.status))}</td>
      <td>${esc(money(row.beforeTax))}</td>
      <td>${esc(money(row.tax))}</td>
      <td>${esc(money(row.discount))}</td>
      <td><strong>${esc(money(row.total))}</strong></td>
    </tr>`).join("") : `<tr><td colspan="12" class="sales-report-table-empty">${esc(t("salesReports.status.empty", "لا توجد بيانات مبيعات للفلاتر المحددة."))}</td></tr>`;
    if (count) count.textContent = `${number(rows.length)} ${isEnglish() ? "invoices" : "فاتورة"}`;
    if (more) more.classList.toggle("hidden", visible.length >= rows.length);
  }

  function emptyBlock() {
    return `<div class="sales-report-empty-chart">${esc(t("salesReports.status.empty", "لا توجد بيانات مبيعات للفلاتر المحددة."))}</div>`;
  }

  function render() {
    if (!initialized || $("salesReportsView")?.classList.contains("hidden")) return;
    const filters = selectedFilters();
    filteredRows = filterRows(filters);
    const summary = summarize(filteredRows);
    renderKpis(summary);
    renderDaily(summary.source, filters);
    renderDonut(summary);
    renderMonthly(allRows, filters);
    renderNeighborhood(summary.source);
    [["salesReportsComparisonTitle", "Year comparison", "مقارنة السنوات"], ["salesReportsQuarterTitle", "Quarterly comparison", "مقارنة كل ربع"], ["salesReportsMonthTitle", "Monthly comparison", "مقارنة الشهور"]].forEach(([id,en,ar]) => { if ($(id)) $(id).textContent = isEnglish() ? en : ar; });
    renderComparison(filters);
    renderQuarterComparison(filters);
    renderMonthComparison(filters);
    renderWeekday(summary.source);
    renderDiscount(summary.source);
    renderVat(summary.source);
    renderTable(summary);
    const period = $("salesReportsPeriodLabel");
    if (period) period.textContent = filters.year ? (filters.month ? `${monthLabel(filters.month)} ${filters.year}` : String(filters.year)) : t("salesReports.filter.allYears", "كل السنوات");
    const empty = $("salesReportsEmptyState");
    if (empty) empty.classList.toggle("hidden", filteredRows.length > 0);
    setStatus(t("salesReports.status.ready", "تم تحديث تقرير المبيعات."));
  }

  async function load(force = false) {
    if (loading) return;
    loading = true;
    const button = $("refreshSalesReportsBtn");
    if (button) button.disabled = true;
    setStatus(t("salesReports.status.loading", "جاري تحميل بيانات المبيعات..."));
    try {
      let rows = !force ? await readCache() : null;
      if (!Array.isArray(rows)) {
        if (navigator.onLine === false) throw new Error(t("payroll.error.onlineRequired", "هذه العملية تحتاج اتصالًا بالإنترنت."));
        // PostgREST applies its max-rows limit to RPC results. Fetch every page;
        // a single RPC call silently truncates earlier years because SQL sorts DESC.
        rows = [];
        const seen = new Set();
        let complete = false;
        for (let page = 0; page < RPC_MAX_PAGES; page++) {
          const start = page * RPC_PAGE_SIZE;
          const { data, error } = await window.customerSupabase
            .rpc("sales_reports_rows_r44r38r20r35")
            .range(start, start + RPC_PAGE_SIZE - 1);
          if (error) throw error;
          if (!Array.isArray(data)) throw new Error("Unexpected sales RPC response");
          for (const row of data) {
            const id = `${row.is_historical ? "h" : "c"}:${row.row_id}`;
            if (!row.row_id || seen.has(id)) throw new Error("Sales report pagination returned duplicate or missing row identifier");
            seen.add(id);
            rows.push(row);
          }
          if (data.length < RPC_PAGE_SIZE) { complete = true; break; }
        }
        if (!complete) throw new Error("Sales report result exceeded safe pagination limit; refusing incomplete totals");
        await writeCache(rows);
      }
      allRows = rows.map(normalizeRow).filter(row => row.invoiceDate);
      lastLoadedAt = Date.now();
      populateFilters(!force);
      render();
      window.dispatchEvent(new CustomEvent("sales-reports-data-updated", { detail: { rows: allRows, updatedAt: lastLoadedAt } }));
    } catch (error) {
      console.error("Sales reports load failed", error);
      setStatus(`${t("salesReports.error.load", "تعذر تحميل بيانات تقارير المبيعات.")} ${error?.message || ""}`.trim(), "error");
    } finally {
      loading = false;
      if (button) button.disabled = false;
    }
  }

  function resetFilters() {
    const year = $("salesReportsYear");
    const month = $("salesReportsMonth");
    if (year) year.value = String(availableYears().includes(currentYear()) ? currentYear() : availableYears()[0] || currentYear());
    populateYearMonth(false);
    if (month) {
      const months = availableMonths(Number(year?.value || currentYear()));
      month.value = months.includes(currentMonth()) ? String(currentMonth()) : String(months[months.length - 1] || currentMonth());
    }
    ["salesReportsVehicle", "salesReportsCustomer", "salesReportsTeam", "salesReportsPayment"].forEach(id => { if ($(id)) $(id).value = ""; });
    if ($("salesReportsStatusFilter")) $("salesReportsStatusFilter").value = "";
    renderedRows = 10;
    render();
  }

  function bind() {
    if (initialized) return;
    const view = $("salesReportsView");
    if (!view) return;
    initialized = true;
    $("salesReportsYear")?.addEventListener("change", () => {
      const year = $("salesReportsYear")?.value === "" ? 0 : Number($("salesReportsYear")?.value || currentYear());
      const months = year ? availableMonths(year) : [...new Set(allRows.map(row => dateOnly(row.invoiceDate)?.getMonth() + 1).filter(Boolean))].sort((a,b)=>a-b);
      const select = $("salesReportsMonth");
      if (!select) return;
      const current = select.value === "" ? 0 : Number(select.value || currentMonth());
      select.innerHTML = option("", t("salesReports.filter.allMonths", "كل الشهور المتاحة"), !current || !months.includes(current)) + (months.length ? months : [currentMonth()]).map(m => option(m, monthLabel(m), m === current || (!months.includes(current) && m === (months.includes(currentMonth()) ? currentMonth() : months[months.length - 1])))).join("");
      select.value = current && months.includes(current) ? String(current) : "";
      renderedRows = 10;
      render();
    });
    ["salesReportsMonth", "salesReportsVehicle", "salesReportsCustomer", "salesReportsTeam", "salesReportsPayment", "salesReportsStatusFilter"].forEach(id => $(id)?.addEventListener("change", () => { renderedRows = 10; }));
    $("applySalesReportsFilters")?.addEventListener("click", () => { renderedRows = 10; render(); });
    $("resetSalesReportsFilters")?.addEventListener("click", resetFilters);
    $("refreshSalesReportsBtn")?.addEventListener("click", () => load(true));
    $("salesReportsShowMore")?.addEventListener("click", () => { renderedRows += 10; render(); });
    // Recalculate chart width after viewport changes without changing sales data.
    let chartResizeFrame = 0;
    window.addEventListener("resize", () => {
      if (window.KYUMNavigation?.current?.() !== "salesReports") return;
      cancelAnimationFrame(chartResizeFrame);
      chartResizeFrame = requestAnimationFrame(() => {
        const filters = selectedFilters();
        renderDaily(summarize(filterRows(filters)).source, filters);
      });
    });
    window.addEventListener("petatoe-language-changed", () => { if (initialized) { window.PetatoeLocalization?.applyStatic?.(view); populateFilters(true); render(); } });
    window.addEventListener("petatoe-localization-updated", () => { if (initialized) { populateFilters(true); render(); } });
    window.addEventListener("kyum-customer-cache-updated", () => { if (window.KYUMNavigation?.current?.() === "salesReports") load(true); });
    window.addEventListener("kyum-geography-cache-updated", () => { if (window.KYUMNavigation?.current?.() === "salesReports") load(true); });
  }

  async function activate(force = false) {
    bind();
    if (!allRows.length || force) await load(force);
    else {
      populateFilters(true);
      render();
    }
  }

  window.SalesReportsUI = Object.freeze({ activate, load, refresh: () => load(true), render });
  window.addEventListener("kyum-view-changed", event => {
    if (event?.detail?.view === "salesReports") activate(false);
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (window.KYUMNavigation?.current?.() === "salesReports") activate(false);
  }, { once: true });
})();
