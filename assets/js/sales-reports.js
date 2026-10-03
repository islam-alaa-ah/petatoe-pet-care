(() => {
  "use strict";

  const CACHE_PREFIX = "sales-reports:v1:";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const CACHE_SCHEMA_VERSION = 1;
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
      year: Number($("salesReportsYear")?.value || currentYear()),
      month: Number($("salesReportsMonth")?.value || currentMonth()),
      vehicle: $("salesReportsVehicle")?.value || "",
      customer: $("salesReportsCustomer")?.value || "",
      team: $("salesReportsTeam")?.value || "",
      payment: $("salesReportsPayment")?.value || "",
      status: $("salesReportsStatusFilter")?.value || "صادرة"
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
    const previousYear = preserve ? Number(yearSelect.value || currentYear()) : currentYear();
    const years = availableYears();
    const year = years.includes(previousYear) ? previousYear : (years.includes(currentYear()) ? currentYear() : years[0]);
    yearSelect.innerHTML = years.map(y => option(y, y, y === year)).join("");

    const previousMonth = preserve ? Number(monthSelect.value || currentMonth()) : currentMonth();
    const months = availableMonths(year);
    const monthOptions = months.length ? months : [currentMonth()];
    const month = monthOptions.includes(previousMonth)
      ? previousMonth
      : (monthOptions.includes(currentMonth()) ? currentMonth() : monthOptions[monthOptions.length - 1]);
    monthSelect.innerHTML = option("", t("salesReports.filter.allMonths", "كل الشهور المتاحة"), previousMonth === 0 || !months.includes(previousMonth))
      + monthOptions.map(m => option(m, monthLabel(m), m === month)).join("");
    if (previousMonth === 0) monthSelect.value = "";
  }

  function populateFilters(preserve = true) {
    const filters = selectedFilters();
    populateYearMonth(preserve);
    const values = {
      vehicle: uniqueOptions("carId", "carName", "plateNumber"),
      customer: uniqueOptions("customerId", "customerName"),
      team: uniqueOptions("teamId", "teamName"),
      payment: uniqueTextOptions("paymentMethod"),
      status: uniqueTextOptions("status")
    };
    ["vehicle", "customer", "team", "payment", "status"].forEach(kind => {
      const select = $(kind === "status" ? "salesReportsStatusFilter" : `salesReports${kind[0].toUpperCase()}${kind.slice(1)}`);
      if (!select) return;
      const current = preserve ? (kind === "status" ? filters.status : filters[kind]) : "";
      let html = option("", t("salesReports.filter.all", "الكل"), !current);
      if (kind === "vehicle") html += values.vehicle.map(x => option(x.id, `${x.name}${x.plate ? ` — ${x.plate}` : ""}`, x.id === current)).join("");
      if (kind === "customer") html += values.customer.map(x => option(x.id, x.label, x.id === current)).join("");
      if (kind === "team") html += values.team.map(x => option(x.id, x.label, x.id === current)).join("");
      if (kind === "payment") html += values.payment.map(x => option(x, paymentLabel(x), x === current)).join("");
      if (kind === "status") html += values.status.map(x => option(x, statusLabel(x), x === current)).join("");
      select.innerHTML = html;
      if (kind === "status" && !preserve) select.value = "صادرة";
      if (kind === "status" && preserve && !current) select.value = "صادرة";
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

  function paymentLabel(value) {
    const key = String(value || "").trim();
    if (key === "نقدي") return t("salesReports.common.cash", "نقدي");
    if (key === "آجل") return t("salesReports.common.credit", "آجل");
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
      if (!d || d.getFullYear() !== filters.year) return false;
      if (filters.month && d.getMonth() + 1 !== filters.month) return false;
      if (filters.vehicle && row.carId !== filters.vehicle) return false;
      if (filters.customer && row.customerId !== filters.customer) return false;
      if (filters.team && row.teamId !== filters.team) return false;
      if (filters.payment && row.paymentMethod !== filters.payment) return false;
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
    const invoiceRows = aggregateInvoiceRows(issued);
    const source = issued.length ? issued : rows;
    const beforeTax = source.reduce((sum, row) => sum + row.beforeTax, 0);
    const tax = source.reduce((sum, row) => sum + row.tax, 0);
    const discount = source.reduce((sum, row) => sum + row.discount, 0);
    const total = source.reduce((sum, row) => sum + row.total, 0);
    const cash = source.filter(row => row.paymentMethod === "نقدي").reduce((sum, row) => sum + row.total, 0);
    const credit = source.filter(row => row.paymentMethod === "آجل").reduce((sum, row) => sum + row.total, 0);
    return {
      source,
      issued,
      invoiceRows,
      beforeTax,
      tax,
      discount,
      total,
      cash,
      credit,
      invoiceCount: invoiceRows.length,
      averageInvoice: invoiceRows.length ? total / invoiceRows.length : 0,
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

  function svgLineChart(rows, year, month) {
    const width = 1000, height = 300, pad = { left: 55, right: 20, top: 22, bottom: 42 };
    const days = month ? daysInMonth(year, month) : 31;
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
      return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" class="sales-chart-grid"/><text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" class="sales-chart-label">${esc(number(value))}</text>`;
    }).join("");
    const labels = values.map((_, i) => {
      const day = i + 1;
      if (day !== 1 && day !== 5 && day !== 10 && day !== 15 && day !== 20 && day !== 25 && day !== values.length) return "";
      return `<text x="${x(i)}" y="${height - 13}" text-anchor="middle" class="sales-chart-label">${day}</text>`;
    }).join("");
    const circles = values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="3.2" class="sales-chart-point"><title>${dayLabel(index + 1)}: ${money(value)}</title></circle>`).join("");
    const areaPoints = `${pad.left},${height - pad.bottom} ${points} ${x(values.length - 1)},${height - pad.bottom}`;
    return `<svg class="sales-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t("salesReports.report.daily.title", "المبيعات عبر أيام الشهر"))}">
      ${grid}
      <polygon points="${areaPoints}" class="sales-chart-area"/>
      <polyline points="${points}" class="sales-chart-line"/>
      ${circles}${labels}
    </svg>`;
  }

  function dayLabel(day) {
    return `${day}`;
  }

  function renderDaily(rows, filters) {
    const host = $("salesReportsDailyChart");
    if (!host) return;
    host.innerHTML = filters.month
      ? svgLineChart(rows, filters.year, filters.month)
      : `<div class="sales-report-empty-chart">${esc(t("salesReports.report.daily.note", "اختر شهرًا لعرض حركة المبيعات اليومية."))}</div>`;
  }

  function renderDonut(summary) {
    const host = $("salesReportsPaymentChart");
    if (!host) return;
    const cash = summary.cash, credit = summary.credit, other = Math.max(summary.total - cash - credit, 0);
    const total = Math.max(summary.total, 0);
    const cashPct = total ? cash / total * 100 : 0;
    const creditPct = total ? credit / total * 100 : 0;
    const cashDeg = cashPct * 3.6;
    const creditDeg = creditPct * 3.6;
    host.innerHTML = `<div class="sales-donut" style="--cash:${cashDeg}deg;--credit:${creditDeg}deg" aria-hidden="true"><div><strong>${esc(money(total))}</strong><span>${esc(t("salesReports.kpi.totalSales", "إجمالي المبيعات"))}</span></div></div>
      <div class="sales-chart-legend">
        <div><i class="sales-legend-dot sales-legend-dot--cash"></i><span>${esc(paymentLabel("نقدي"))}</span><strong>${esc(money(cash))} · ${esc(pct(cashPct))}</strong></div>
        <div><i class="sales-legend-dot sales-legend-dot--credit"></i><span>${esc(paymentLabel("آجل"))}</span><strong>${esc(money(credit))} · ${esc(pct(creditPct))}</strong></div>
        ${other ? `<div><i class="sales-legend-dot sales-legend-dot--other"></i><span>${esc(t("salesReports.common.undefined", "غير محدد"))}</span><strong>${esc(money(other))}</strong></div>` : ""}
      </div>`;
  }

  function renderStatus(rows) {
    const host = $("salesReportsStatusChart");
    if (!host) return;
    const map = new Map();
    rows.forEach(row => map.set(row.status, (map.get(row.status) || 0) + row.total));
    const values = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(...values.map(x => x[1]), 1);
    host.innerHTML = values.length ? values.map(([status, value]) => `<div class="sales-status-row"><div><span>${esc(statusLabel(status))}</span><strong>${esc(money(value))}</strong></div><div class="sales-status-track"><span style="width:${Math.max(2, value / max * 100)}%"></span></div></div>`).join("") : emptyBlock();
  }

  function renderMonthly(rows, filters) {
    const host = $("salesReportsMonthlyChart");
    if (!host) return;
    const baseRows = rows.filter(row =>
      (!filters.vehicle || row.carId === filters.vehicle)
      && (!filters.customer || row.customerId === filters.customer)
      && (!filters.team || row.teamId === filters.team)
      && (!filters.payment || row.paymentMethod === filters.payment)
      && (!filters.status || row.status === filters.status)
    );
    const values = Array.from({ length: 12 }, (_, i) => baseRows.filter(row => {
      const d = dateOnly(row.invoiceDate);
      return d && d.getFullYear() === filters.year && d.getMonth() === i;
    }).reduce((sum, row) => sum + row.total, 0));
    const max = Math.max(...values, 1);
    host.innerHTML = values.map((value, i) => `<div class="sales-month-column"><div class="sales-month-value">${esc(number(value))}</div><div class="sales-month-track"><span style="height:${Math.max(3, value / max * 100)}%"${filters.month === i + 1 ? " class=\"is-selected\"" : ""}></span></div><small>${esc(monthLabel(i + 1))}</small></div>`).join("");
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
      item.invoices.add(row.historical ? `${row.invoiceNumber}|${row.invoiceDate}|${row.customerId}` : row.rowId);
      if (row.customerId) item.customers.add(row.customerId);
      map.set(key, item);
    });
    const values = [...map.values()].sort((a, b) => b.total - a.total);
    const max = Math.max(...values.map(x => x.total), 1);
    host.innerHTML = values.length ? `<div class="sales-neighborhood-head"><span>${esc(t("salesReports.table.neighborhood", "الحي"))}</span><span>${esc(t("salesReports.table.customer", "العملاء"))}</span><span>${esc(t("salesReports.table.invoice", "الفواتير"))}</span><span>${esc(t("salesReports.kpi.totalSales", "إجمالي المبيعات"))}</span></div>${values.map(item => `<div class="sales-neighborhood-row"><strong>${esc(item.label)}</strong><span>${esc(number(item.customers.size))}</span><span>${esc(number(item.invoices.size))}</span><div><div class="sales-neighborhood-track"><span style="width:${Math.max(2, item.total / max * 100)}%"></span></div><strong>${esc(money(item.total))}</strong></div></div>`).join("")}` : emptyBlock();
  }

  function renderComparison(filters) {
    const host = $("salesReportsComparisonChart");
    if (!host) return;
    const { current, previous, delta, previousFilters } = comparisonSummary(filters);
    const max = Math.max(current.total, previous.total, 1);
    const currentLabel = filters.month ? `${monthLabel(filters.month)} ${filters.year}` : String(filters.year);
    const previousLabel = previousFilters.month ? `${monthLabel(previousFilters.month)} ${previousFilters.year}` : String(previousFilters.year);
    const tone = delta >= 0 ? "positive" : "negative";
    host.innerHTML = `<div class="sales-comparison-summary"><strong class="${tone}">${delta >= 0 ? "+" : ""}${esc(delta.toFixed(1))}%</strong><span>${esc(currentLabel)} مقابل ${esc(previousLabel)}</span></div><div class="sales-comparison-bars"><div><span>${esc(currentLabel)}</span><div><i style="height:${Math.max(4, current.total / max * 100)}%"></i></div><strong>${esc(money(current.total))}</strong></div><div><span>${esc(previousLabel)}</span><div><i style="height:${Math.max(4, previous.total / max * 100)}%"></i></div><strong>${esc(money(previous.total))}</strong></div></div>`;
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
    host.innerHTML = values.map((value, i) => `<div class="sales-weekday-column"><strong>${esc(number(value))}</strong><div><span style="height:${Math.max(3, value / max * 100)}%"></span></div><small>${esc(labels[i])}</small></div>`).join("");
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
    const total = beforeTax + tax;
    const taxRate = total ? tax / total * 100 : 0;
    host.innerHTML = `<div class="sales-vat-total"><strong>${esc(money(total))}</strong><span>${esc(t("salesReports.table.total", "شامل الضريبة"))}</span></div><div class="sales-vat-stack"><span style="width:${Math.max(0, 100 - taxRate)}%"></span><i style="width:${Math.max(0, taxRate)}%"></i></div><div class="sales-vat-legend"><span>${esc(t("salesReports.table.beforeTax", "قبل الضريبة"))}<strong>${esc(money(beforeTax))}</strong></span><span>${esc(t("salesReports.table.tax", "الضريبة"))}<strong>${esc(money(tax))}</strong></span></div>`;
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
      <td>${esc(paymentLabel(row.paymentMethod))}</td>
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
    renderStatus(filteredRows);
    renderMonthly(allRows, filters);
    renderNeighborhood(summary.source);
    renderComparison(filters);
    renderWeekday(summary.source);
    renderDiscount(summary.source);
    renderVat(summary.source);
    renderTable(summary);
    const period = $("salesReportsPeriodLabel");
    if (period) period.textContent = filters.month ? `${monthLabel(filters.month)} ${filters.year}` : String(filters.year);
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
        const { data, error } = await window.customerSupabase.rpc("sales_reports_rows_r44r38r20r35");
        if (error) throw error;
        rows = Array.isArray(data) ? data : [];
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
    if ($("salesReportsStatusFilter")) $("salesReportsStatusFilter").value = "صادرة";
    renderedRows = 10;
    render();
  }

  function bind() {
    if (initialized) return;
    const view = $("salesReportsView");
    if (!view) return;
    initialized = true;
    $("salesReportsYear")?.addEventListener("change", () => {
      const year = Number($("salesReportsYear")?.value || currentYear());
      const months = availableMonths(year);
      const select = $("salesReportsMonth");
      if (!select) return;
      const current = Number(select.value || currentMonth());
      select.innerHTML = option("", t("salesReports.filter.allMonths", "كل الشهور المتاحة"), !current || !months.includes(current)) + (months.length ? months : [currentMonth()]).map(m => option(m, monthLabel(m), m === current || (!months.includes(current) && m === (months.includes(currentMonth()) ? currentMonth() : months[months.length - 1])))).join("");
      if (months.includes(current)) select.value = String(current);
      render();
    });
    ["salesReportsMonth", "salesReportsVehicle", "salesReportsCustomer", "salesReportsTeam", "salesReportsPayment", "salesReportsStatusFilter"].forEach(id => $(id)?.addEventListener("change", () => { renderedRows = 10; }));
    $("applySalesReportsFilters")?.addEventListener("click", () => { renderedRows = 10; render(); });
    $("resetSalesReportsFilters")?.addEventListener("click", resetFilters);
    $("refreshSalesReportsBtn")?.addEventListener("click", () => load(true));
    $("salesReportsShowMore")?.addEventListener("click", () => { renderedRows += 10; render(); });
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
