
const STORAGE_KEY = "customer_management_v1_customers";
const FOLLOWUPS_STORAGE_KEY = "customer_management_v1_followups";
const QUOTATIONS_STORAGE_KEY = "customer_management_v1_quotations";

const interests = [
  "أجهزة منزلية",
  "مكيفات",
  "ثلاجات لحوم",
  "ثلاجات دواجن",
  "ثلاجات خضار",
  "ثلاجات عصائر",
  "تبريد"
];

const noSaleReasons = [
  "لم يتم التواصل بعد",
  "السعر مرتفع",
  "اختار منافسًا آخر",
  "لا توجد ميزانية حاليًا",
  "القرار مؤجل",
  "مدة التوريد",
  "شروط الدفع",
  "لم يتم الرد",
  "أخرى"
];

const representatives = [
  { id: "REP-001", name: "أحمد محمد", phone: "0500000001", email: "ahmed@company.com" },
  { id: "REP-002", name: "محمد علي", phone: "0500000002", email: "mohamed@company.com" },
  { id: "REP-003", name: "خالد حسن", phone: "0500000003", email: "khaled@company.com" }
];

const seedCustomers = [
  {
    id: "C000001",
    name: "شركة النور للتجارة",
    type: "شركة",
    phone: "0501234567",
    city: "الرياض",
    interests: ["مكيفات", "تبريد"],
    representative: "أحمد محمد",
    contactDate: "2026-07-10",
    quotationNumber: "Q-2026-001",
    noSaleReason: "القرار مؤجل",
    notes: "متابعة العميل خلال الأسبوع القادم."
  },
  {
    id: "C000002",
    name: "مؤسسة الصفوة للحوم",
    type: "شركة",
    phone: "0557654321",
    city: "جدة",
    interests: ["ثلاجات لحوم"],
    representative: "محمد علي",
    contactDate: "2026-07-09",
    quotationNumber: "Q-2026-002",
    noSaleReason: "السعر مرتفع",
    notes: "طلب مراجعة السعر."
  },
  {
    id: "C000003",
    name: "عبدالله سالم",
    type: "فردي",
    phone: "0531112233",
    city: "الدمام",
    interests: ["أجهزة منزلية"],
    representative: "خالد حسن",
    contactDate: "2026-07-08",
    quotationNumber: "",
    noSaleReason: "لم يتم التواصل بعد",
    notes: ""
  }
];


const seedFollowups = [
  {
    id: "F000001",
    customerId: "C000001",
    contactDate: "2026-07-10",
    method: "اتصال",
    representative: "أحمد محمد",
    result: "تفاوض",
    quotationNumber: "Q-2026-001",
    noSaleReason: "القرار مؤجل",
    nextFollowupDate: "2026-07-15",
    completed: false,
    notes: "العميل طلب مراجعة التفاصيل الفنية."
  },
  {
    id: "F000002",
    customerId: "C000002",
    contactDate: "2026-07-09",
    method: "واتساب",
    representative: "محمد علي",
    result: "تم إرسال عرض سعر",
    quotationNumber: "Q-2026-002",
    noSaleReason: "السعر مرتفع",
    nextFollowupDate: "2026-07-12",
    completed: false,
    notes: "تم إرسال العرض وينتظر الرد."
  }
];


const seedQuotations = [
  {
    id: "QID000001",
    code: "Q-2026-001",
    customerId: "C000001",
    representative: "أحمد محمد",
    quotationDate: "2026-07-10",
    amount: 18500,
    status: "تحت المراجعة",
    expiryDate: "2026-07-25",
    rejectionReason: "",
    description: "عرض توريد وتركيب نظام تكييف.",
    notes: "بانتظار موافقة الإدارة."
  },
  {
    id: "QID000002",
    code: "Q-2026-002",
    customerId: "C000002",
    representative: "محمد علي",
    quotationDate: "2026-07-09",
    amount: 32000,
    status: "مرفوض",
    expiryDate: "2026-07-20",
    rejectionReason: "السعر مرتفع",
    description: "ثلاجة لحوم تجارية.",
    notes: "طلب العميل مراجعة السعر."
  }
];

let customers = loadCustomers();
let followups = loadFollowups();
let quotations = loadQuotations();
let editingId = null;
let editingFollowupId = null;
let editingQuotationId = null;

const views = {
  dashboard: document.getElementById("dashboardView"),
  customers: document.getElementById("customersView"),
  followups: document.getElementById("followupsView"),
  quotations: document.getElementById("quotationsView"),
  representatives: document.getElementById("representativesView"),
  settings: document.getElementById("settingsView")
};

const pageMeta = {
  dashboard: ["لوحة التحكم", "ملخص بيانات العملاء والمتابعة"],
  customers: ["العملاء", "إدارة بيانات العملاء والبحث والتصفية"],
  followups: ["المتابعات", "سجل التواصل والمتابعات القادمة لكل عميل"],
  quotations: ["عروض الأسعار", "إدارة عروض الأسعار وحالتها وقيمتها"],
  representatives: ["المندوبون", "قائمة مسؤولي متابعة العملاء"],
  settings: ["الإعدادات", "القوائم المرجعية الأساسية"]
};

function loadCustomers() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : seedCustomers;
  } catch {
    return seedCustomers;
  }
}



function loadQuotations() {
  try {
    const stored = JSON.parse(localStorage.getItem(QUOTATIONS_STORAGE_KEY));
    return Array.isArray(stored) ? stored : seedQuotations;
  } catch {
    return seedQuotations;
  }
}

function saveQuotations() {
  localStorage.setItem(QUOTATIONS_STORAGE_KEY, JSON.stringify(quotations));
}

function nextQuotationId() {
  const max = quotations.reduce((highest, item) => {
    const value = Number(String(item.id).replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `QID${String(max + 1).padStart(6, "0")}`;
}

function nextQuotationCode() {
  const year = new Date().getFullYear();
  const max = quotations.reduce((highest, item) => {
    const match = String(item.code).match(/(\d+)$/);
    const value = match ? Number(match[1]) : 0;
    return Math.max(highest, value);
  }, 0);
  return `Q-${year}-${String(max + 1).padStart(3, "0")}`;
}

function quotationStatusClass(status) {
  return {
    "تحت التجهيز": "draft",
    "تم الإرسال": "sent",
    "تحت المراجعة": "review",
    "مقبول": "accepted",
    "مرفوض": "rejected",
    "ملغي": "cancelled"
  }[status] || "draft";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}


function loadFollowups() {
  try {
    const stored = JSON.parse(localStorage.getItem(FOLLOWUPS_STORAGE_KEY));
    return Array.isArray(stored) ? stored : seedFollowups;
  } catch {
    return seedFollowups;
  }
}

function saveFollowups() {
  localStorage.setItem(FOLLOWUPS_STORAGE_KEY, JSON.stringify(followups));
}

function nextFollowupId() {
  const max = followups.reduce((highest, item) => {
    const value = Number(String(item.id).replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `F${String(max + 1).padStart(6, "0")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function followupStatus(item) {
  if (item.completed) return "completed";
  if (!item.nextFollowupDate) return "upcoming";
  const today = todayIso();
  if (item.nextFollowupDate === today) return "today";
  if (item.nextFollowupDate < today) return "overdue";
  return "upcoming";
}

function statusLabel(status) {
  return {
    today: "اليوم",
    overdue: "متأخرة",
    upcoming: "قادمة",
    completed: "مكتملة"
  }[status] || status;
}

function saveCustomers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
}


function normalizePhone(value) {
  let phone = String(value || "").replace(/\D/g, "");

  if (phone.startsWith("00966")) phone = phone.slice(5);
  else if (phone.startsWith("966")) phone = phone.slice(3);

  if (phone.startsWith("5") && phone.length === 9) {
    phone = `0${phone}`;
  }

  return phone;
}

function isValidSaudiMobile(value) {
  return /^05\d{8}$/.test(normalizePhone(value));
}

function findCustomerByPhone(phone, excludeId = null) {
  const normalized = normalizePhone(phone);
  return customers.find(customer =>
    normalizePhone(customer.phone) === normalized && customer.id !== excludeId
  );
}

function nextCustomerId() {
  const max = customers.reduce((highest, customer) => {
    const value = Number(String(customer.id).replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `C${String(max + 1).padStart(6, "0")}`;
}

function setOptions() {
  const interestFilter = document.getElementById("interestFilter");
  const customerInterest = document.getElementById("customerInterest");
  const repFilter = document.getElementById("repFilter");
  const customerRepresentative = document.getElementById("customerRepresentative");
  const noSaleReason = document.getElementById("noSaleReason");
  const followupCustomer = document.getElementById("followupCustomer");
  const followupRepresentative = document.getElementById("followupRepresentative");
  const followupNoSaleReason = document.getElementById("followupNoSaleReason");
  const followupRepFilter = document.getElementById("followupRepFilter");
  const quotationCustomer = document.getElementById("quotationCustomer");
  const quotationRepresentative = document.getElementById("quotationRepresentative");
  const quotationRejectionReason = document.getElementById("quotationRejectionReason");
  const quotationRepFilter = document.getElementById("quotationRepFilter");
  const dashboardRepFilter = document.getElementById("dashboardRepFilter");
  const dashboardInterestFilter = document.getElementById("dashboardInterestFilter");

  interests.forEach(item => {
    interestFilter.add(new Option(item, item));
    customerInterest.add(new Option(item, item));
    dashboardInterestFilter.add(new Option(item, item));
  });

  representatives.forEach(rep => {
    repFilter.add(new Option(rep.name, rep.name));
    customerRepresentative.add(new Option(rep.name, rep.name));
    followupRepresentative.add(new Option(rep.name, rep.name));
    followupRepFilter.add(new Option(rep.name, rep.name));
    quotationRepresentative.add(new Option(rep.name, rep.name));
    quotationRepFilter.add(new Option(rep.name, rep.name));
    dashboardRepFilter.add(new Option(rep.name, rep.name));
  });

  noSaleReasons.forEach(reason => {
    noSaleReason.add(new Option(reason, reason));
    followupNoSaleReason.add(new Option(reason, reason));
    quotationRejectionReason.add(new Option(reason, reason));
  });

  customers.forEach(customer => {
    followupCustomer.add(new Option(`${customer.name} — ${customer.phone}`, customer.id));
    quotationCustomer.add(new Option(`${customer.name} — ${customer.phone}`, customer.id));
  });

  document.getElementById("settingsInterests").innerHTML =
    interests.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join("");

  document.getElementById("settingsReasons").innerHTML =
    noSaleReasons.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join("");
}

function switchView(name) {
  Object.entries(views).forEach(([key, element]) => element.classList.toggle("hidden", key !== name));
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));
  document.getElementById("pageTitle").textContent = pageMeta[name][0];
  document.getElementById("pageSubtitle").textContent = pageMeta[name][1];

  if (name === "dashboard") renderDashboard();
  if (name === "customers") renderCustomers();
  if (name === "followups") renderFollowups();
  if (name === "quotations") renderQuotations();
  if (name === "representatives") renderRepresentatives();
}


function dashboardFilterState() {
  return {
    representative: document.getElementById("dashboardRepFilter")?.value || "",
    type: document.getElementById("dashboardTypeFilter")?.value || "",
    interest: document.getElementById("dashboardInterestFilter")?.value || "",
    from: document.getElementById("dashboardDateFrom")?.value || "",
    to: document.getElementById("dashboardDateTo")?.value || ""
  };
}

function dateInRange(value, from, to) {
  if (!value) return !from && !to;
  return (!from || value >= from) && (!to || value <= to);
}

function dashboardData() {
  const filters = dashboardFilterState();

  const filteredCustomers = customers.filter(customer =>
    (!filters.representative || customer.representative === filters.representative)
    && (!filters.type || customer.type === filters.type)
    && (!filters.interest || customer.interests.includes(filters.interest))
    && dateInRange(customer.contactDate, filters.from, filters.to)
  );

  const allowedCustomerIds = new Set(filteredCustomers.map(customer => customer.id));

  const filteredFollowups = followups.filter(item =>
    allowedCustomerIds.has(item.customerId)
    && (!filters.representative || item.representative === filters.representative)
    && dateInRange(item.contactDate, filters.from, filters.to)
  );

  const filteredQuotations = quotations.filter(item =>
    allowedCustomerIds.has(item.customerId)
    && (!filters.representative || item.representative === filters.representative)
    && dateInRange(item.quotationDate, filters.from, filters.to)
  );

  return { filters, customers: filteredCustomers, followups: filteredFollowups, quotations: filteredQuotations };
}

function renderDashboard() {
  const data = dashboardData();
  const filteredCustomers = data.customers;
  const filteredFollowups = data.followups;
  const filteredQuotations = data.quotations;

  const companies = filteredCustomers.filter(c => c.type === "شركة").length;
  const individuals = filteredCustomers.filter(c => c.type === "فردي").length;
  const dueToday = filteredFollowups.filter(item => followupStatus(item) === "today").length;
  const overdue = filteredFollowups.filter(item => followupStatus(item) === "overdue").length;
  const accepted = filteredQuotations.filter(item => item.status === "مقبول");
  const rejected = filteredQuotations.filter(item => item.status === "مرفوض");
  const totalQuotationValue = filteredQuotations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const acceptedValue = accepted.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const conversionRate = filteredQuotations.length
    ? (accepted.length / filteredQuotations.length) * 100
    : 0;

  const stats = [
    ["إجمالي العملاء", filteredCustomers.length],
    ["عملاء الشركات", companies],
    ["العملاء الأفراد", individuals],
    ["إجمالي المتابعات", filteredFollowups.length],
    ["متابعات اليوم", dueToday],
    ["متابعات متأخرة", overdue],
    ["عدد عروض الأسعار", filteredQuotations.length],
    ["قيمة العروض", formatCurrency(totalQuotationValue)],
    ["العروض المقبولة", accepted.length],
    ["قيمة المقبول", formatCurrency(acceptedValue)],
    ["العروض المرفوضة", rejected.length],
    ["نسبة التحويل", `${conversionRate.toFixed(1)}%`]
  ];

  document.getElementById("statsGrid").innerHTML = stats
    .map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");

  const periodText = data.filters.from || data.filters.to
    ? `الفترة: ${data.filters.from ? formatDate(data.filters.from) : "البداية"} — ${data.filters.to ? formatDate(data.filters.to) : "اليوم"}`
    : "الفترة: جميع البيانات";
  document.getElementById("dashboardPeriodLabel").textContent = periodText;

  renderRepresentativePerformance(data);
  renderInterestAnalytics(filteredCustomers);
  renderQuotationStatusAnalytics(filteredQuotations);
  renderNoSaleReasonAnalytics(filteredCustomers, filteredQuotations);
  renderActivityTrend(data);

  const latest = [...filteredCustomers]
    .sort((a, b) => String(b.contactDate).localeCompare(String(a.contactDate)))
    .slice(0, 5);

  document.getElementById("recentCustomers").innerHTML = latest.length
    ? `<div class="simple-list">${latest.map(c => `
        <div class="simple-item">
          <div><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.phone)} · ${escapeHtml(c.representative)}</span></div>
          <span>${formatDate(c.contactDate)}</span>
        </div>`).join("")}</div>`
    : `<div class="empty-state">لا توجد بيانات عملاء ضمن الفلاتر.</div>`;

  const attention = filteredFollowups
    .filter(item => ["today", "overdue"].includes(followupStatus(item)))
    .sort((a, b) => String(a.nextFollowupDate).localeCompare(String(b.nextFollowupDate)))
    .slice(0, 6);

  document.getElementById("attentionFollowups").innerHTML = attention.length
    ? `<div class="simple-list">${attention.map(item => {
        const customer = customerById(item.customerId);
        const status = followupStatus(item);
        return `
          <div class="attention-item ${status === "overdue" ? "overdue" : ""}">
            <div>
              <strong>${escapeHtml(customer?.name || "عميل غير معروف")}</strong>
              <span>${escapeHtml(item.representative)} · ${escapeHtml(item.result)}</span>
            </div>
            <span>${statusLabel(status)} · ${formatDate(item.nextFollowupDate)}</span>
          </div>`;
      }).join("")}</div>`
    : `<div class="empty-state">لا توجد متابعات تحتاج انتباهًا حاليًا.</div>`;
}

function renderRepresentativePerformance(data) {
  const rows = representatives.map(rep => {
    const repCustomers = data.customers.filter(c => c.representative === rep.name);
    const repFollowups = data.followups.filter(f => f.representative === rep.name);
    const repQuotations = data.quotations.filter(q => q.representative === rep.name);
    const accepted = repQuotations.filter(q => q.status === "مقبول");
    const conversion = repQuotations.length ? (accepted.length / repQuotations.length) * 100 : 0;
    const quotationValue = repQuotations.reduce((sum, q) => sum + Number(q.amount || 0), 0);

    return {
      name: rep.name,
      customers: repCustomers.length,
      followups: repFollowups.length,
      quotations: repQuotations.length,
      quotationValue,
      conversion
    };
  }).filter(row => row.customers || row.followups || row.quotations);

  document.getElementById("representativePerformance").innerHTML = rows.length
    ? rows.map(row => `
      <article class="performance-card">
        <div class="performance-card-head">
          <strong>${escapeHtml(row.name)}</strong>
          <span>نسبة التحويل ${row.conversion.toFixed(1)}%</span>
        </div>
        <div class="performance-metrics">
          <div class="performance-metric"><span>العملاء</span><strong>${row.customers}</strong></div>
          <div class="performance-metric"><span>المتابعات</span><strong>${row.followups}</strong></div>
          <div class="performance-metric"><span>العروض</span><strong>${row.quotations}</strong></div>
          <div class="performance-metric"><span>قيمة العروض</span><strong>${formatCurrency(row.quotationValue)}</strong></div>
          <div class="performance-metric"><span>التحويل</span><strong>${row.conversion.toFixed(1)}%</strong></div>
        </div>
      </article>`).join("")
    : `<div class="empty-state">لا توجد بيانات أداء ضمن الفلاتر.</div>`;
}

function renderBarChart(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">لا توجد بيانات كافية.</div>`;
    return;
  }

  const max = Math.max(1, ...rows.map(row => row.value));
  container.innerHTML = rows.map(row => `
    <div class="chart-row">
      <span class="chart-label">${escapeHtml(row.label)}</span>
      <div class="chart-track"><div class="chart-fill" style="width:${(row.value / max) * 100}%"></div></div>
      <span class="chart-value">${row.value}</span>
    </div>`).join("");
}

function renderInterestAnalytics(filteredCustomers) {
  const rows = interests.map(interest => ({
    label: interest,
    value: filteredCustomers.filter(c => c.interests.includes(interest)).length
  })).filter(row => row.value > 0).sort((a, b) => b.value - a.value);

  renderBarChart("interestAnalytics", rows);
}

function renderQuotationStatusAnalytics(filteredQuotations) {
  const statuses = ["تحت التجهيز", "تم الإرسال", "تحت المراجعة", "مقبول", "مرفوض", "ملغي"];
  const rows = statuses.map(status => ({
    label: status,
    value: filteredQuotations.filter(q => q.status === status).length
  })).filter(row => row.value > 0);

  renderBarChart("quotationStatusAnalytics", rows);
}

function renderNoSaleReasonAnalytics(filteredCustomers, filteredQuotations) {
  const counts = new Map();

  filteredCustomers.forEach(customer => {
    const reason = customer.noSaleReason;
    if (reason && reason !== "لم يتم التواصل بعد") {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  });

  filteredQuotations.forEach(quotation => {
    const reason = quotation.rejectionReason;
    if (quotation.status === "مرفوض" && reason) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  });

  const rows = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  renderBarChart("noSaleReasonAnalytics", rows);
}

function renderActivityTrend(data) {
  const dateMap = new Map();

  function ensureDate(date) {
    if (!date) return null;
    if (!dateMap.has(date)) {
      dateMap.set(date, { customers: 0, followups: 0, quotations: 0 });
    }
    return dateMap.get(date);
  }

  data.customers.forEach(item => {
    const row = ensureDate(item.contactDate);
    if (row) row.customers += 1;
  });
  data.followups.forEach(item => {
    const row = ensureDate(item.contactDate);
    if (row) row.followups += 1;
  });
  data.quotations.forEach(item => {
    const row = ensureDate(item.quotationDate);
    if (row) row.quotations += 1;
  });

  const rows = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);

  const container = document.getElementById("activityTrend");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">لا توجد بيانات زمنية كافية.</div>`;
    return;
  }

  const max = Math.max(1, ...rows.flatMap(([, v]) => [v.customers, v.followups, v.quotations]));
  container.innerHTML = `
    <div class="trend-legend">
      <span>العملاء</span>
      <span>المتابعات</span>
      <span>العروض</span>
    </div>
    <div class="trend-bars">
      ${rows.map(([date, values]) => `
        <div class="trend-day">
          <div class="trend-day-bars">
            <div class="trend-bar" title="العملاء: ${values.customers}" style="height:${Math.max(2, (values.customers / max) * 160)}px"></div>
            <div class="trend-bar followups" title="المتابعات: ${values.followups}" style="height:${Math.max(2, (values.followups / max) * 160)}px"></div>
            <div class="trend-bar quotations" title="العروض: ${values.quotations}" style="height:${Math.max(2, (values.quotations / max) * 160)}px"></div>
          </div>
          <span class="trend-day-label">${formatDate(date)}</span>
        </div>`).join("")}
    </div>`;
}

function filteredCustomers() {
  const query = document.getElementById("customerSearch").value.trim().toLowerCase();
  const type = document.getElementById("typeFilter").value;
  const interest = document.getElementById("interestFilter").value;
  const rep = document.getElementById("repFilter").value;

  return customers.filter(customer => {
    const searchable = [
      customer.name,
      customer.representative,
      customer.phone,
      customer.city,
      customer.quotationNumber
    ].join(" ").toLowerCase();

    return (!query || searchable.includes(query))
      && (!type || customer.type === type)
      && (!interest || customer.interests.includes(interest))
      && (!rep || customer.representative === rep);
  });
}

function renderCustomers() {
  const rows = filteredCustomers();
  const body = document.getElementById("customersTableBody");

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-state">لا توجد نتائج مطابقة.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(customer => `
    <tr>
      <td><strong>${escapeHtml(customer.phone || "—")}</strong></td>
      <td>
        <strong>${escapeHtml(customer.name)}</strong><br>
        <small>${customer.city ? escapeHtml(customer.city) : ""}</small>
      </td>
      <td><span class="badge">${escapeHtml(customer.type)}</span></td>
      <td>${customer.interests.map(item => `<span class="badge">${escapeHtml(item)}</span>`).join("")}</td>
      <td>${escapeHtml(customer.representative)}</td>
      <td>${formatDate(customer.contactDate)}</td>
      <td>${escapeHtml(customer.quotationNumber || "—")}</td>
      <td>${escapeHtml(customer.noSaleReason || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-details="${customer.id}">عرض</button>
          <button class="edit-btn" data-add-followup="${customer.id}">متابعة</button>
          <button class="edit-btn" data-edit="${customer.id}">تعديل</button>
          <button class="delete-btn" data-delete="${customer.id}">حذف</button>
        </div>
      </td>
    </tr>`).join("");
}

function renderRepresentatives() {
  document.getElementById("representativesGrid").innerHTML = representatives.map(rep => {
    const count = customers.filter(c => c.representative === rep.name).length;
    return `
      <article class="rep-card">
        <strong>${escapeHtml(rep.name)}</strong>
        <span>${escapeHtml(rep.id)}</span>
        <p>${escapeHtml(rep.phone)}<br>${escapeHtml(rep.email)}</p>
        <span>عدد العملاء: ${count}</span>
      </article>`;
  }).join("");
}

function openCustomerDialog(customer = null) {
  editingId = customer?.id || null;
  document.getElementById("dialogTitle").textContent = customer ? "تعديل بيانات العميل" : "إضافة عميل جديد";
  document.getElementById("customerId").value = customer?.id || nextCustomerId();
  document.getElementById("customerName").value = customer?.name || "";
  document.getElementById("customerType").value = customer?.type || "شركة";
  document.getElementById("customerPhone").value = customer?.phone || "";
  document.getElementById("customerCity").value = customer?.city || "";
  document.getElementById("customerRepresentative").value = customer?.representative || representatives[0].name;
  document.getElementById("contactDate").value = customer?.contactDate || new Date().toISOString().slice(0, 10);
  document.getElementById("quotationNumber").value = customer?.quotationNumber || "";
  document.getElementById("noSaleReason").value = customer?.noSaleReason || noSaleReasons[0];
  document.getElementById("customerNotes").value = customer?.notes || "";

  [...document.getElementById("customerInterest").options].forEach(option => {
    option.selected = customer ? customer.interests.includes(option.value) : false;
  });

  document.getElementById("customerDialog").showModal();
}

function closeCustomerDialog() {
  document.getElementById("customerDialog").close();
  document.getElementById("customerForm").reset();
  editingId = null;
}

function handleCustomerSubmit(event) {
  event.preventDefault();

  const selectedInterests = [...document.getElementById("customerInterest").selectedOptions].map(o => o.value);
  if (!selectedInterests.length) {
    alert("اختر مجال اهتمام واحدًا على الأقل.");
    return;
  }

  const phoneInput = document.getElementById("customerPhone").value;
  const normalizedPhone = normalizePhone(phoneInput);

  if (!isValidSaudiMobile(normalizedPhone)) {
    alert("أدخل رقم جوال سعودي صحيحًا بصيغة 05XXXXXXXX.");
    document.getElementById("customerPhone").focus();
    return;
  }

  const duplicateCustomer = findCustomerByPhone(normalizedPhone, editingId);
  if (duplicateCustomer) {
    alert(`لا يمكن حفظ العميل. رقم الجوال ${normalizedPhone} مسجل بالفعل باسم: ${duplicateCustomer.name}`);
    document.getElementById("customerPhone").focus();
    return;
  }

  const customer = {
    id: document.getElementById("customerId").value,
    name: document.getElementById("customerName").value.trim(),
    type: document.getElementById("customerType").value,
    phone: normalizedPhone,
    city: document.getElementById("customerCity").value.trim(),
    interests: selectedInterests,
    representative: document.getElementById("customerRepresentative").value,
    contactDate: document.getElementById("contactDate").value,
    quotationNumber: document.getElementById("quotationNumber").value.trim(),
    noSaleReason: document.getElementById("noSaleReason").value,
    notes: document.getElementById("customerNotes").value.trim()
  };

  if (editingId) {
    customers = customers.map(item => item.id === editingId ? customer : item);
  } else {
    customers.unshift(customer);
  }

  saveCustomers();
  closeCustomerDialog();
  renderCustomers();
  renderDashboard();
}

function deleteCustomer(id) {
  const customer = customers.find(item => item.id === id);
  if (!customer) return;
  if (!confirm(`هل تريد حذف العميل: ${customer.name}؟`)) return;

  customers = customers.filter(item => item.id !== id);
  followups = followups.filter(item => item.customerId !== id);
  quotations = quotations.filter(item => item.customerId !== id);
  saveCustomers();
  saveFollowups();
  saveQuotations();
  renderCustomers();
  renderDashboard();
}


function customerById(id) {
  return customers.find(customer => customer.id === id);
}

function filteredFollowups() {
  const query = document.getElementById("followupSearch").value.trim().toLowerCase();
  const status = document.getElementById("followupStatusFilter").value;
  const rep = document.getElementById("followupRepFilter").value;

  return [...followups]
    .filter(item => {
      const customer = customerById(item.customerId);
      if (!customer) return false;
      const searchable = [
        customer.name,
        customer.phone,
        item.representative,
        item.result,
        item.quotationNumber
      ].join(" ").toLowerCase();

      return (!query || searchable.includes(query))
        && (!status || followupStatus(item) === status)
        && (!rep || item.representative === rep);
    })
    .sort((a, b) => String(b.contactDate).localeCompare(String(a.contactDate)));
}

function renderFollowups() {
  const counts = {
    total: followups.length,
    today: followups.filter(item => followupStatus(item) === "today").length,
    overdue: followups.filter(item => followupStatus(item) === "overdue").length,
    upcoming: followups.filter(item => followupStatus(item) === "upcoming").length
  };

  document.getElementById("followupStats").innerHTML = [
    ["إجمالي المتابعات", counts.total],
    ["متابعات اليوم", counts.today],
    ["المتابعات المتأخرة", counts.overdue],
    ["المتابعات القادمة", counts.upcoming]
  ].map(([label, value]) =>
    `<article class="followup-stat"><span>${label}</span><strong>${value}</strong></article>`
  ).join("");

  const rows = filteredFollowups();
  const body = document.getElementById("followupsTableBody");

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-state">لا توجد متابعات مطابقة.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(item => {
    const customer = customerById(item.customerId);
    const status = followupStatus(item);
    return `
      <tr>
        <td><strong>${escapeHtml(customer.name)}</strong></td>
        <td>${escapeHtml(customer.phone)}</td>
        <td>${formatDate(item.contactDate)}</td>
        <td><span class="badge">${escapeHtml(item.method)}</span></td>
        <td>${escapeHtml(item.representative)}</td>
        <td>${escapeHtml(item.result)}</td>
        <td>${escapeHtml(item.quotationNumber || "—")}</td>
        <td>${formatDate(item.nextFollowupDate)}</td>
        <td><span class="status-badge status-${status}">${statusLabel(status)}</span></td>
        <td>
          <div class="row-actions">
            <button class="edit-btn" data-edit-followup="${item.id}">تعديل</button>
            <button class="delete-btn" data-delete-followup="${item.id}">حذف</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function openFollowupDialog(customerId = null, followup = null) {
  editingFollowupId = followup?.id || null;
  document.getElementById("followupDialogTitle").textContent =
    followup ? "تعديل المتابعة" : "إضافة متابعة جديدة";
  document.getElementById("followupId").value = followup?.id || nextFollowupId();
  document.getElementById("followupCustomer").value = followup?.customerId || customerId || customers[0]?.id || "";
  document.getElementById("followupContactDate").value = followup?.contactDate || todayIso();
  document.getElementById("followupMethod").value = followup?.method || "اتصال";
  document.getElementById("followupRepresentative").value =
    followup?.representative || customerById(customerId)?.representative || representatives[0].name;
  document.getElementById("followupResult").value = followup?.result || "تم التواصل";
  document.getElementById("followupQuotationNumber").value = followup?.quotationNumber || "";
  document.getElementById("followupNoSaleReason").value = followup?.noSaleReason || noSaleReasons[0];
  document.getElementById("nextFollowupDate").value = followup?.nextFollowupDate || "";
  document.getElementById("followupCompleted").value = String(followup?.completed || false);
  document.getElementById("followupNotes").value = followup?.notes || "";
  document.getElementById("followupDialog").showModal();
}

function closeFollowupDialog() {
  document.getElementById("followupDialog").close();
  document.getElementById("followupForm").reset();
  editingFollowupId = null;
}

function handleFollowupSubmit(event) {
  event.preventDefault();

  const item = {
    id: document.getElementById("followupId").value,
    customerId: document.getElementById("followupCustomer").value,
    contactDate: document.getElementById("followupContactDate").value,
    method: document.getElementById("followupMethod").value,
    representative: document.getElementById("followupRepresentative").value,
    result: document.getElementById("followupResult").value,
    quotationNumber: document.getElementById("followupQuotationNumber").value.trim(),
    noSaleReason: document.getElementById("followupNoSaleReason").value,
    nextFollowupDate: document.getElementById("nextFollowupDate").value,
    completed: document.getElementById("followupCompleted").value === "true",
    notes: document.getElementById("followupNotes").value.trim()
  };

  if (editingFollowupId) {
    followups = followups.map(existing => existing.id === editingFollowupId ? item : existing);
  } else {
    followups.unshift(item);
  }

  const customer = customerById(item.customerId);
  if (customer) {
    customer.contactDate = item.contactDate;
    if (item.quotationNumber) customer.quotationNumber = item.quotationNumber;
    if (item.noSaleReason) customer.noSaleReason = item.noSaleReason;
    if (item.notes) customer.notes = item.notes;
  }

  saveFollowups();
  saveCustomers();
  closeFollowupDialog();
  renderFollowups();
  renderCustomers();
  renderDashboard();
}

function deleteFollowup(id) {
  const item = followups.find(followup => followup.id === id);
  if (!item) return;
  if (!confirm("هل تريد حذف هذه المتابعة؟")) return;

  followups = followups.filter(followup => followup.id !== id);
  saveFollowups();
  renderFollowups();
  renderDashboard();
}

function showCustomerDetails(customerId) {
  const customer = customerById(customerId);
  if (!customer) return;
  const history = followups
    .filter(item => item.customerId === customerId)
    .sort((a, b) => String(b.contactDate).localeCompare(String(a.contactDate)));

  document.getElementById("customerDetailsTitle").textContent = customer.name;
  document.getElementById("customerDetailsSubtitle").textContent =
    `${customer.phone} · ${customer.type} · ${customer.representative}`;

  const profile = [
    ["رقم العميل", customer.phone],
    ["التصنيف", customer.type],
    ["المدينة", customer.city || "—"],
    ["المندوب", customer.representative],
    ["آخر تواصل", formatDate(customer.contactDate)],
    ["آخر عرض سعر", customer.quotationNumber || "—"]
  ];

  document.getElementById("customerDetailsContent").innerHTML = `
    <div class="customer-profile-grid">
      ${profile.map(([label, value]) =>
        `<div class="profile-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`
      ).join("")}
    </div>
    <h3>مجالات الاهتمام</h3>
    <div class="tag-list">${customer.interests.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
    <h3 style="margin-top:22px">عروض الأسعار</h3>
    ${quotations.filter(q => q.customerId === customerId).length ? `
      <div class="simple-list">
        ${quotations.filter(q => q.customerId === customerId).map(q => `
          <div class="simple-item">
            <div>
              <strong>${escapeHtml(q.code)}</strong>
              <span>${escapeHtml(q.status)} · ${formatDate(q.quotationDate)}</span>
            </div>
            <strong>${formatCurrency(q.amount)}</strong>
          </div>
        `).join("")}
      </div>
    ` : `<div class="empty-state">لا توجد عروض أسعار لهذا العميل.</div>`}
    <h3 style="margin-top:22px">سجل المتابعات</h3>
    ${history.length ? `<div class="timeline">${history.map(item => `
      <div class="timeline-item">
        <span class="timeline-dot"></span>
        <div class="timeline-card">
          <div class="timeline-card-header">
            <strong>${escapeHtml(item.result)}</strong>
            <span>${formatDate(item.contactDate)}</span>
          </div>
          <p>${escapeHtml(item.method)} · ${escapeHtml(item.representative)}</p>
          ${item.quotationNumber ? `<p>عرض السعر: ${escapeHtml(item.quotationNumber)}</p>` : ""}
          ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
          ${item.nextFollowupDate ? `<p>المتابعة القادمة: ${formatDate(item.nextFollowupDate)}</p>` : ""}
        </div>
      </div>`).join("")}</div>` : `<div class="empty-state">لم تتم إضافة متابعات لهذا العميل.</div>`}
  `;

  document.getElementById("customerDetailsDialog").showModal();
}


function filteredQuotations() {
  const query = document.getElementById("quotationSearch").value.trim().toLowerCase();
  const status = document.getElementById("quotationStatusFilter").value;
  const rep = document.getElementById("quotationRepFilter").value;

  return [...quotations]
    .filter(item => {
      const customer = customerById(item.customerId);
      if (!customer) return false;
      const searchable = [
        item.code,
        customer.name,
        customer.phone,
        item.representative,
        item.status
      ].join(" ").toLowerCase();

      return (!query || searchable.includes(query))
        && (!status || item.status === status)
        && (!rep || item.representative === rep);
    })
    .sort((a, b) => String(b.quotationDate).localeCompare(String(a.quotationDate)));
}

function renderQuotations() {
  const totalValue = quotations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const accepted = quotations.filter(item => item.status === "مقبول");
  const acceptedValue = accepted.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const rejected = quotations.filter(item => item.status === "مرفوض").length;

  document.getElementById("quotationStats").innerHTML = [
    ["إجمالي العروض", quotations.length],
    ["إجمالي القيمة", formatCurrency(totalValue)],
    ["العروض المقبولة", accepted.length],
    ["قيمة العروض المقبولة", formatCurrency(acceptedValue)],
    ["العروض المرفوضة", rejected]
  ].map(([label, value]) =>
    `<article class="followup-stat"><span>${label}</span><strong>${value}</strong></article>`
  ).join("");

  const rows = filteredQuotations();
  const body = document.getElementById("quotationsTableBody");

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-state">لا توجد عروض أسعار مطابقة.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(item => {
    const customer = customerById(item.customerId);
    const statusClass = quotationStatusClass(item.status);
    return `
      <tr>
        <td><strong>${escapeHtml(item.code)}</strong></td>
        <td>${escapeHtml(customer.name)}</td>
        <td>${escapeHtml(customer.phone)}</td>
        <td>${escapeHtml(item.representative)}</td>
        <td>${formatDate(item.quotationDate)}</td>
        <td class="quotation-value">${formatCurrency(item.amount)}</td>
        <td><span class="quotation-status quotation-status-${statusClass}">${escapeHtml(item.status)}</span></td>
        <td>${formatDate(item.expiryDate)}</td>
        <td>${escapeHtml(item.rejectionReason || "—")}</td>
        <td>
          <div class="row-actions">
            <button class="edit-btn" data-edit-quotation="${item.id}">تعديل</button>
            <button class="delete-btn" data-delete-quotation="${item.id}">حذف</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function openQuotationDialog(quotation = null, customerId = null) {
  editingQuotationId = quotation?.id || null;
  document.getElementById("quotationDialogTitle").textContent =
    quotation ? "تعديل عرض السعر" : "إضافة عرض سعر";

  document.getElementById("quotationId").value = quotation?.id || nextQuotationId();
  document.getElementById("quotationCode").value = quotation?.code || nextQuotationCode();
  document.getElementById("quotationCustomer").value =
    quotation?.customerId || customerId || customers[0]?.id || "";
  document.getElementById("quotationRepresentative").value =
    quotation?.representative || customerById(customerId)?.representative || representatives[0].name;
  document.getElementById("quotationDate").value = quotation?.quotationDate || todayIso();
  document.getElementById("quotationAmount").value = quotation?.amount ?? "";
  document.getElementById("quotationStatus").value = quotation?.status || "تحت التجهيز";
  document.getElementById("quotationExpiryDate").value = quotation?.expiryDate || "";
  document.getElementById("quotationRejectionReason").value =
    quotation?.rejectionReason || noSaleReasons[0];
  document.getElementById("quotationDescription").value = quotation?.description || "";
  document.getElementById("quotationNotes").value = quotation?.notes || "";

  document.getElementById("quotationDialog").showModal();
}

function closeQuotationDialog() {
  document.getElementById("quotationDialog").close();
  document.getElementById("quotationForm").reset();
  editingQuotationId = null;
}

function handleQuotationSubmit(event) {
  event.preventDefault();

  const code = document.getElementById("quotationCode").value.trim();
  const duplicate = quotations.find(item =>
    item.code.toLowerCase() === code.toLowerCase() && item.id !== editingQuotationId
  );

  if (duplicate) {
    alert(`رقم عرض السعر ${code} مسجل بالفعل ولا يمكن تكراره.`);
    document.getElementById("quotationCode").focus();
    return;
  }

  const item = {
    id: document.getElementById("quotationId").value,
    code,
    customerId: document.getElementById("quotationCustomer").value,
    representative: document.getElementById("quotationRepresentative").value,
    quotationDate: document.getElementById("quotationDate").value,
    amount: Number(document.getElementById("quotationAmount").value || 0),
    status: document.getElementById("quotationStatus").value,
    expiryDate: document.getElementById("quotationExpiryDate").value,
    rejectionReason: document.getElementById("quotationStatus").value === "مرفوض"
      ? document.getElementById("quotationRejectionReason").value
      : "",
    description: document.getElementById("quotationDescription").value.trim(),
    notes: document.getElementById("quotationNotes").value.trim()
  };

  if (editingQuotationId) {
    quotations = quotations.map(existing => existing.id === editingQuotationId ? item : existing);
  } else {
    quotations.unshift(item);
  }

  const customer = customerById(item.customerId);
  if (customer) {
    customer.quotationNumber = item.code;
    if (item.status === "مرفوض" && item.rejectionReason) {
      customer.noSaleReason = item.rejectionReason;
    }
  }

  saveQuotations();
  saveCustomers();
  closeQuotationDialog();
  renderQuotations();
  renderCustomers();
  renderDashboard();
}

function deleteQuotation(id) {
  const item = quotations.find(quotation => quotation.id === id);
  if (!item) return;
  if (!confirm(`هل تريد حذف عرض السعر ${item.code}؟`)) return;

  quotations = quotations.filter(quotation => quotation.id !== id);
  saveQuotations();
  renderQuotations();
  renderDashboard();
}


function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ar-SA").format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("loginForm").addEventListener("submit", event => {
  event.preventDefault();
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  renderDashboard();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  document.getElementById("appView").classList.add("hidden");
  document.getElementById("loginView").classList.remove("hidden");
});

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelector("[data-open-customers]").addEventListener("click", () => switchView("customers"));

["dashboardRepFilter", "dashboardTypeFilter", "dashboardInterestFilter", "dashboardDateFrom", "dashboardDateTo"].forEach(id => {
  document.getElementById(id).addEventListener("change", renderDashboard);
});

document.getElementById("resetDashboardFilters").addEventListener("click", () => {
  document.getElementById("dashboardRepFilter").value = "";
  document.getElementById("dashboardTypeFilter").value = "";
  document.getElementById("dashboardInterestFilter").value = "";
  document.getElementById("dashboardDateFrom").value = "";
  document.getElementById("dashboardDateTo").value = "";
  renderDashboard();
});

document.querySelector("[data-open-followups]").addEventListener("click", () => switchView("followups"));

document.getElementById("addCustomerBtn").addEventListener("click", () => openCustomerDialog());
document.getElementById("addFollowupBtn").addEventListener("click", () => openFollowupDialog());
document.getElementById("addQuotationBtn").addEventListener("click", () => openQuotationDialog());
document.getElementById("closeQuotationDialogBtn").addEventListener("click", closeQuotationDialog);
document.getElementById("cancelQuotationDialogBtn").addEventListener("click", closeQuotationDialog);
document.getElementById("quotationForm").addEventListener("submit", handleQuotationSubmit);
document.getElementById("closeFollowupDialogBtn").addEventListener("click", closeFollowupDialog);
document.getElementById("cancelFollowupDialogBtn").addEventListener("click", closeFollowupDialog);
document.getElementById("followupForm").addEventListener("submit", handleFollowupSubmit);
document.getElementById("closeCustomerDetailsBtn").addEventListener("click", () => document.getElementById("customerDetailsDialog").close());
document.getElementById("closeDialogBtn").addEventListener("click", closeCustomerDialog);
document.getElementById("cancelDialogBtn").addEventListener("click", closeCustomerDialog);
document.getElementById("customerForm").addEventListener("submit", handleCustomerSubmit);

["customerSearch", "typeFilter", "interestFilter", "repFilter"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderCustomers);
  document.getElementById(id).addEventListener("change", renderCustomers);
});

["followupSearch", "followupStatusFilter", "followupRepFilter"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderFollowups);
  document.getElementById(id).addEventListener("change", renderFollowups);
});

["quotationSearch", "quotationStatusFilter", "quotationRepFilter"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderQuotations);
  document.getElementById(id).addEventListener("change", renderQuotations);
});

document.getElementById("customersTableBody").addEventListener("click", event => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  const detailsId = event.target.dataset.details;
  const addFollowupCustomerId = event.target.dataset.addFollowup;

  if (editId) {
    const customer = customers.find(item => item.id === editId);
    if (customer) openCustomerDialog(customer);
  }

  if (deleteId) deleteCustomer(deleteId);
  if (detailsId) showCustomerDetails(detailsId);
  if (addFollowupCustomerId) openFollowupDialog(addFollowupCustomerId);
});

document.getElementById("followupsTableBody").addEventListener("click", event => {
  const editId = event.target.dataset.editFollowup;
  const deleteId = event.target.dataset.deleteFollowup;

  if (editId) {
    const item = followups.find(followup => followup.id === editId);
    if (item) openFollowupDialog(null, item);
  }

  if (deleteId) deleteFollowup(deleteId);
});

document.getElementById("quotationsTableBody").addEventListener("click", event => {
  const editId = event.target.dataset.editQuotation;
  const deleteId = event.target.dataset.deleteQuotation;

  if (editId) {
    const item = quotations.find(quotation => quotation.id === editId);
    if (item) openQuotationDialog(item);
  }

  if (deleteId) deleteQuotation(deleteId);
});

setOptions();
