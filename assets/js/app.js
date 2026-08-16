
const STORAGE_KEY = "customer_management_v1_customers";
const FOLLOWUPS_STORAGE_KEY = "customer_management_v1_followups";
const QUOTATIONS_STORAGE_KEY = "customer_management_v1_quotations";

let interestRecords = [];
let reasonRecords = [];
let representativeRecords = [];

let interests = [];
let noSaleReasons = [];
let representatives = [];

let referenceDataLoaded = false;
let referenceDataLoading = false;
let referenceDataLoadPromise = null;
let referenceDataLoadedAt = 0;
const REFERENCE_DATA_TTL_MS = 5 * 60 * 1000;
let editingRepresentativeId = null;
let editingReferenceItemId = null;
let referenceCustomersPage = 1;
let customerImportPreview = null;
let customerImportFile = null;
let customerImportFailedRows = [];
let customerImportOverrideAuditId = null;
let representativeImportPreview = null;
let representativeImportFailedRows = [];
const REFERENCE_CUSTOMERS_PAGE_SIZE = 10;

const seedCustomers = [
  { id: "C000001", customerNumber: "CUST-001", name: "عميل تجريبي", address: "جدة", phone: "0500000000" }
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
    result: "تم إرسال عقد",
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

let customers = [];
let customersLoaded = false;
let customersLoading = false;
let customersPage = 1;
const CUSTOMERS_PAGE_SIZE = 10;
let followups = [];
let followupsLoaded = false;
let followupsLoading = false;
let followupsPage = 1;
const FOLLOWUPS_PAGE_SIZE = 10;
let quotations = [];
let quotationsLoaded = false;
let quotationsLoading = false;
let quotationsPage = 1;
const QUOTATIONS_PAGE_SIZE = 10;
let userRecords = [];
let installationTeamRecords = [];
let usersLoaded = false;
let usersLoading = false;
let editingUserId = null;
let permissionScreens = [];
let rolePermissionRows = [];
let permissionsLoaded = false;
let activityRecords = [];
let activityLoaded = false;
let selectedBackupPayload = null;
let backupHistoryRecords = [];
let backupHistoryLoaded = false;
let systemSettingsLoaded = false;
let systemHealthSnapshot = null;
let latestDiagnosticsReport = null;
let diagnosticsRunning = false;
let currentReportsSnapshot = null;
let customer360ActivityFilter = "all";
let currentCustomer360View = null;
let activeCustomerAnalyticsTab = "types";
let systemHealthLoading = false;
let systemHealthTimer = null;
let dailyTaskRecords = [];
let dailyTaskDefinitions = [];
let dailyOperationTargets = null;
let dailyManagerNote = null;
let employeeReportSettings = [];
let employeeTargetsDialogRows = [];
let dailyOperationsLoading = false;
let dailyOperationsCrmSnapshot = null;
let dailySuggestedSuggestionRows = [];
let dailySuggestedSuggestionProgress = { active: 0, completed: 0, total: 0 };
let dailySuggestedSuggestionsLoading = false;
let dailySuggestedSuggestionsError = "";
let pendingDailySuggestionCompletion = null;
let dailySuggestedTeamRows = [];
let dailySuggestedTeamLoading = false;
let dailySuggestedTeamError = "";
let dailyWhatsAppTemplate = { message_text: "", image_path: null, image_name: null, image_mime: null };
let dailyWhatsAppTemplatePendingFile = null;
let dailyWhatsAppTemplateRemoveImage = false;
let dailyWhatsAppTemplateLoading = false;
let dailyWhatsAppTemplatePreviewUrl = "";
let dailyAlerts = [];
let dailyAlertsLoading = false;
let dailyAlertPendingAction = null;
let dailyActivitySnapshot = null;
let dailyActivityLoading = false;
let dailyPerformanceSnapshot = null;
let dailyPerformanceLoading = false;
let dailyPerformanceDetailType = "tasks";
let dailyActivityReportRequested = false;
let dailyTasksReportRequested = false;


let editingId = null;
let editingFollowupId = null;
let editingQuotationId = null;

const views = {
  dailyOperations: document.getElementById("dailyOperationsView"),
  dashboard: document.getElementById("dashboardView"),
  customers: document.getElementById("customersView"),
  followups: document.getElementById("followupsView"),
  quotations: document.getElementById("quotationsView"),
  salesInvoices: document.getElementById("salesInvoicesView"),
  representatives: document.getElementById("representativesView"),
  settings: document.getElementById("settingsView"),
  installationsOverview: document.getElementById("installationsOverviewView"),
  installationSettings: document.getElementById("installationSettingsView"),
  installationRequestNew: document.getElementById("installationRequestNewView"),
  installationRequests: document.getElementById("installationRequestsView"),
  installationSchedule: document.getElementById("installationScheduleView"),
  installationExecution: document.getElementById("installationExecutionView"),
  installationCompletion: document.getElementById("installationCompletionView"),
  installationExceptions: document.getElementById("installationExceptionsView"),
  installationReports: document.getElementById("installationReportsView"),
  users: document.getElementById("usersView"),
  permissions: document.getElementById("permissionsView"),
  activityLog: document.getElementById("activityLogView"),
  backups: document.getElementById("backupsView"),
  systemHealth: document.getElementById("systemHealthView"),
  reportsOverview: document.getElementById("reportsOverviewView"),
  dailyPerformanceReport: document.getElementById("dailyPerformanceReportView"),
  notificationCenter: document.getElementById("notificationCenterView"),
  translationCenter: document.getElementById("translationCenterView"),
  systemSettings: document.getElementById("systemSettingsView"),
  aboutApp: document.getElementById("aboutAppView")
};

const pageMeta = {
  dailyOperations: ["إدارة المهام اليومية", "مركز التشغيل اليومي للمندوبين"],
  dashboard: ["لوحة التحكم", "ملخص بيانات العملاء والمتابعة"],
  customers: ["العملاء", "إدارة بيانات العملاء والبحث والتصفية"],
  followups: ["المتابعات", "سجل التواصل والمتابعات القادمة لكل عميل"],
  quotations: ["عقود العملاء", "إدارة عقود العملاء وحالتها وقيمتها"],
  salesInvoices: ["فواتير المبيعات", "سجل الفواتير المرتبطة بالعقود والمواعيد"],
  representatives: ["مندوبو المبيعات", "قائمة مسؤولي متابعة العملاء"],
  settings: ["البيانات المرجعية", "مجالات الاهتمام وأسباب عدم البيع"],
  installationsOverview: ["إدارة المواعيد", "المواعيد والجدولة والتنفيذ الميداني"],
  installationSettings: ["إعدادات المواعيد", "إعدادات التشغيل والمهلة والقيم الافتراضية"],
  installationRequestNew: ["إضافة موعد جديد", "إنشاء موعد بعقد أو بدونه"],
  installationRequests: ["المواعيد", "عرض ومتابعة وتعديل المواعيد"],
  installationSchedule: ["جدولة وتوزيع المواعيد", "تقويم التشغيل وإسناد الطلبات إلى الفنيين"],
  installationExecution: ["تنفيذ المواعيد", "تحديث حالات الزيارات الميدانية وتوثيق التنفيذ"],
  installationCompletion: ["تأكيد انتهاء المواعيد", "مراجعة واعتماد انتهاء الموعد وتحويله إلى فاتورة"],
  installationExceptions: ["الاستثناءات وإعادة الزيارة", "متابعة التعثر وجدولة الزيارات اللاحقة"],
  installationReports: ["تقارير المواعيد", "تحليل الإنتاجية والالتزام وأسباب التعثر"],
  users: ["المستخدمون", "إدارة حسابات مستخدمي النظام"],
  permissions: ["الصلاحيات", "إدارة الأدوار وصلاحيات الوصول"],
  activityLog: ["سجل النشاط", "متابعة العمليات والتغييرات داخل النظام"],
  backups: ["النسخ الاحتياطي", "التصدير والاستعادة وحماية البيانات"],
  systemHealth: ["مراقبة النظام", "الحالة الصحية والأمان والأداء التشغيلي"],
  reportsOverview: ["مركز التقارير", "تحليلات العملاء والمتابعات والعروض وأداء المندوبين"],
  dailyPerformanceReport: ["تقرير الأداء اليومي", "متابعة تنفيذ المهام والنشاط اليومي للموظفين"],
  notificationCenter: ["مركز الإشعارات", "إدارة الأحداث والمستلمين وقنوات الإشعار"],
  translationCenter: ["مركز الترجمه", "إدارة قاموس الترجمة المركزي ومراجعة تغطية الشاشات"],
  systemSettings: ["إعدادات النظام", "الخيارات العامة وبيانات الشركة"],
  aboutApp: ["حول التطبيق", "معلومات الإصدار وحالة التحديثات"]
};

function loadCustomers() {
  return [];
}



function loadQuotations() {
  return [];
}

function saveQuotations() {
  // Quotations use Supabase as the only production data source from Phase 10.
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

function canonicalQuotationStatus(status) {
  const value = String(status || "").trim();
  if (["قيد التنفيذ", "مقبول", "مرفوض"].includes(value)) return value;
  if (["تحت التجهيز", "تم الإرسال", "تحت المراجعة"].includes(value)) return "قيد التنفيذ";
  if (value === "ملغي") return "مرفوض";
  return "قيد التنفيذ";
}

function quotationStatusClass(status) {
  return {
    "قيد التنفيذ": "review",
    "مقبول": "accepted",
    "مرفوض": "rejected"
  }[canonicalQuotationStatus(status)] || "review";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    currencyDisplay: "code",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}


function loadFollowups() {
  return [];
}

function saveFollowups() {
  // Follow-ups use Supabase as the only production data source from Phase 09.
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
  const map = {
    today: ["followups.status.today","اليوم"],
    overdue: ["followups.status.overdue","متأخرة"],
    upcoming: ["followups.status.upcoming","قادمة"],
    completed: ["followups.status.completed","مكتملة"]
  };
  return map[status] ? customerT(map[status][0], map[status][1]) : status;
}
function followupMethodLabel(value) {
  const map={"اتصال":"followups.method.call","واتساب":"followups.method.whatsapp","زيارة":"followups.method.visit","بريد إلكتروني":"followups.method.email","اجتماع":"followups.method.meeting"};
  return map[value]?customerT(map[value],value):String(value||"");
}
function followupResultLabel(value) {
  const map={"تم التواصل":"followups.result.contacted","لم يتم الرد":"followups.result.noAnswer","طلب عقد":"followups.result.requestContract","تم إرسال عقد":"followups.result.sentContract","تفاوض":"followups.result.negotiation","تم البيع":"followups.result.sold","لم يتم البيع":"followups.result.notSold","مؤجل":"followups.result.deferred"};
  return map[value]?customerT(map[value],value):String(value||"");
}
function quotationStatusLabel(value) {
  const canonical=canonicalQuotationStatus(value);
  const map={"قيد التنفيذ":"contracts.status.inProgress","مقبول":"contracts.status.accepted","مرفوض":"contracts.status.rejected"};
  return map[canonical]?customerT(map[canonical],canonical):canonical;
}

function saveCustomers() {
  // Customers use Supabase as the only production data source from Phase 08.
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

async function findCustomerByPhone(phone, excludeId = null) {
  const normalized = normalizePhone(phone);
  if (navigator.onLine === false) {
    return customers.find(customer =>
      String(customer.id) !== String(excludeId || "")
      && normalizePhone(customer.phone) === normalized
    ) || null;
  }
  return window.CustomersService.findByPhone(normalized, excludeId);
}

function customerPhoneOwnershipDetails(customer) {
  if (!customer) return null;
  return {
    id: customer.id || "",
    name: customer.customer_name || customer.name || "عميل غير مسمى",
    phone: normalizePhone(customer.phone || ""),
    canAccess: customer.can_access !== false && customer.outside_scope !== true
  };
}

function duplicateCustomerWarningMessage(customer, phone) {
  const details=customerPhoneOwnershipDetails(customer);
  if(!details)return "رقم الجوال مسجل بالفعل لعميل آخر.";
  return `لا يمكن إضافة العميل. رقم الجوال ${normalizePhone(phone)} مرتبط بالعميل «${details.name}».`;
}

function nextCustomerId() {
  const max = customers.reduce((highest, customer) => {
    const value = Number(String(customer.id).replace(/\D/g, "")) || 0;
    return Math.max(highest, value);
  }, 0);
  return `C${String(max + 1).padStart(6, "0")}`;
}

function replaceSelectOptions(select, options, placeholder = null, selectedValue = null) {
  if (!select) return;
  select.innerHTML = "";
  if (placeholder) select.add(new Option(placeholder, ""));
  options.forEach(option => select.add(new Option(option.label, option.value)));
  if (selectedValue !== null && [...select.options].some(option => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}



function normalizeQuotationCustomerSearch(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function quotationCustomerDisplay(customer) {
  if (!customer) return "";
  const details = [customer.phone, customer.customerNumber].filter(Boolean).join(" · ");
  return details ? `${customer.name} — ${details}` : customer.name;
}

function selectedQuotationCustomer() {
  const select = document.getElementById("quotationCustomer");
  return customers.find(customer => String(customer.id) === String(select?.value || "")) || null;
}

function closeQuotationCustomerOptions() {
  const wrapper = document.getElementById("quotationCustomerCombobox");
  const input = document.getElementById("quotationCustomerSearch");
  const options = document.getElementById("quotationCustomerOptions");
  if (!wrapper || !input || !options) return;
  wrapper.dataset.open = "false";
  input.setAttribute("aria-expanded", "false");
  options.classList.add("hidden");
}

function renderQuotationCustomerOptions(query = "") {
  const options = document.getElementById("quotationCustomerOptions");
  if (!options) return;

  const normalizedQuery = normalizeQuotationCustomerSearch(query);
  const digitQuery = String(query || "").replace(/\D/g, "");
  const currentValue = document.getElementById("quotationCustomer")?.value || "";

  const ranked = customers
    .map(customer => {
      const name = normalizeQuotationCustomerSearch(customer.name);
      const phone = String(customer.phone || "").replace(/\D/g, "");
      const code = normalizeQuotationCustomerSearch(customer.customerNumber);
      let rank = 99;

      if (!normalizedQuery && !digitQuery) rank = 10;
      else if (name === normalizedQuery || phone === digitQuery || code === normalizedQuery) rank = 0;
      else if (name.startsWith(normalizedQuery) || (digitQuery && phone.startsWith(digitQuery)) || code.startsWith(normalizedQuery)) rank = 1;
      else if (name.includes(normalizedQuery) || (digitQuery && phone.includes(digitQuery)) || code.includes(normalizedQuery)) rank = 2;

      return { customer, rank };
    })
    .filter(item => item.rank < 99)
    .sort((a, b) => a.rank - b.rank || String(a.customer.name || "").localeCompare(String(b.customer.name || ""), "ar"))
    .slice(0, 80);

  if (!ranked.length) {
    options.innerHTML = '<div class="searchable-select-empty">لا توجد نتائج مطابقة.</div>';
    return;
  }

  options.innerHTML = ranked.map(({ customer }) => {
    const isSelected = String(customer.id) === String(currentValue);
    return `
      <button
        type="button"
        class="searchable-select-option${isSelected ? " is-selected" : ""}"
        role="option"
        aria-selected="${isSelected ? "true" : "false"}"
        data-quotation-customer-id="${escapeHtml(String(customer.id))}"
      >
        <strong>${escapeHtml(customer.name || "عميل بدون اسم")}</strong>
        <span>${escapeHtml(customer.phone || "بدون رقم جوال")}${customer.customerNumber ? ` · ${escapeHtml(customer.customerNumber)}` : ""}</span>
      </button>
    `;
  }).join("");
}

function openQuotationCustomerOptions() {
  const wrapper = document.getElementById("quotationCustomerCombobox");
  const input = document.getElementById("quotationCustomerSearch");
  const options = document.getElementById("quotationCustomerOptions");
  if (!wrapper || !input || !options) return;
  renderQuotationCustomerOptions(input.value);
  wrapper.dataset.open = "true";
  input.setAttribute("aria-expanded", "true");
  options.classList.remove("hidden");
}

function setQuotationCustomerSelection(customerId, { close = true } = {}) {
  const select = document.getElementById("quotationCustomer");
  const input = document.getElementById("quotationCustomerSearch");
  if (!select || !input) return;

  const customer = customers.find(item => String(item.id) === String(customerId || "")) || null;
  select.value = customer ? String(customer.id) : "";
  input.value = customer ? quotationCustomerDisplay(customer) : "";
  input.dataset.selectedCustomerId = customer ? String(customer.id) : "";
  input.setCustomValidity(customer ? "" : "اختر العميل من نتائج البحث.");
  renderQuotationCustomerOptions("");
  if (close) closeQuotationCustomerOptions();
}

function syncQuotationCustomerSearchFromSelect() {
  const select = document.getElementById("quotationCustomer");
  setQuotationCustomerSelection(select?.value || "", { close: true });
}

function getSelectedCustomerInterestIds() {
  const select = document.getElementById("customerInterest");
  if (!select) return [];
  return [...select.selectedOptions].map(option => option.value);
}

function updateCustomerInterestDropdownSummary() {
  const select = document.getElementById("customerInterest");
  const text = document.getElementById("customerInterestDropdownText");
  const count = document.getElementById("customerInterestSelectedCount");
  const trigger = document.getElementById("customerInterestDropdownButton");
  if (!select || !text || !count || !trigger) return;

  const selectedOptions = [...select.selectedOptions];
  const selectedLabels = selectedOptions.map(option => option.textContent.trim());
  const selectedCount = selectedLabels.length;

  count.textContent = `تم اختيار ${selectedCount}`;
  trigger.classList.toggle("has-selection", selectedCount > 0);

  if (!selectedCount) {
    text.textContent = "اختر مجال الاهتمام";
    trigger.title = "";
  } else if (selectedCount <= 2) {
    text.textContent = selectedLabels.join("، ");
    trigger.title = selectedLabels.join("، ");
  } else {
    text.textContent = `${selectedLabels[0]} +${selectedCount - 1}`;
    trigger.title = selectedLabels.join("، ");
  }
}

function syncCustomerInterestCheckboxes() {
  const select = document.getElementById("customerInterest");
  const optionsContainer = document.getElementById("customerInterestOptions");
  if (!select || !optionsContainer) return;

  const selectedIds = new Set(getSelectedCustomerInterestIds());
  optionsContainer.querySelectorAll('input[type="checkbox"][data-interest-id]').forEach(checkbox => {
    checkbox.checked = selectedIds.has(checkbox.dataset.interestId);
    checkbox.closest(".checkbox-dropdown-option")?.classList.toggle("selected", checkbox.checked);
  });

  updateCustomerInterestDropdownSummary();
}

function renderCustomerInterestDropdownOptions() {
  const select = document.getElementById("customerInterest");
  const optionsContainer = document.getElementById("customerInterestOptions");
  const searchInput = document.getElementById("customerInterestSearch");
  if (!select || !optionsContainer) return;

  const query = (searchInput?.value || "").trim().toLowerCase();
  const options = [...select.options].filter(option =>
    !query || option.textContent.toLowerCase().includes(query)
  );

  if (!options.length) {
    optionsContainer.innerHTML = '<div class="checkbox-dropdown-empty">لا توجد نتائج مطابقة.</div>';
    updateCustomerInterestDropdownSummary();
    return;
  }

  optionsContainer.innerHTML = options.map(option => `
    <label class="checkbox-dropdown-option${option.selected ? " selected" : ""}">
      <input
        type="checkbox"
        data-interest-id="${escapeHtml(option.value)}"
        ${option.selected ? "checked" : ""}
      >
      <span>${escapeHtml(option.textContent)}</span>
    </label>
  `).join("");

  optionsContainer.querySelectorAll('input[type="checkbox"][data-interest-id]').forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const nativeOption = [...select.options].find(option => option.value === checkbox.dataset.interestId);
      if (nativeOption) nativeOption.selected = checkbox.checked;
      checkbox.closest(".checkbox-dropdown-option")?.classList.toggle("selected", checkbox.checked);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      updateCustomerInterestDropdownSummary();
    });
  });

  updateCustomerInterestDropdownSummary();
}

function setCustomerInterestDropdownOpen(isOpen) {
  const dropdown = document.getElementById("customerInterestDropdown");
  const menu = document.getElementById("customerInterestDropdownMenu");
  const trigger = document.getElementById("customerInterestDropdownButton");
  const search = document.getElementById("customerInterestSearch");
  if (!dropdown || !menu || !trigger) return;

  dropdown.classList.toggle("open", isOpen);
  menu.classList.toggle("hidden", !isOpen);
  trigger.setAttribute("aria-expanded", String(isOpen));

  if (isOpen) {
    renderCustomerInterestDropdownOptions();
    requestAnimationFrame(() => search?.focus());
  } else if (search) {
    search.value = "";
  }
}

function initializeCustomerInterestDropdown() {
  const dropdown = document.getElementById("customerInterestDropdown");
  const trigger = document.getElementById("customerInterestDropdownButton");
  const search = document.getElementById("customerInterestSearch");
  const selectAll = document.getElementById("customerInterestSelectAll");
  const clearAll = document.getElementById("customerInterestClearAll");
  const select = document.getElementById("customerInterest");
  if (!dropdown || !trigger || !select || dropdown.dataset.initialized === "true") return;

  dropdown.dataset.initialized = "true";

  trigger.addEventListener("click", () => {
    setCustomerInterestDropdownOpen(trigger.getAttribute("aria-expanded") !== "true");
  });

  search?.addEventListener("input", renderCustomerInterestDropdownOptions);

  selectAll?.addEventListener("click", () => {
    const query = (search?.value || "").trim().toLowerCase();
    [...select.options].forEach(option => {
      if (!query || option.textContent.toLowerCase().includes(query)) {
        option.selected = true;
      }
    });
    select.dispatchEvent(new Event("change", { bubbles: true }));
    renderCustomerInterestDropdownOptions();
  });

  clearAll?.addEventListener("click", () => {
    const query = (search?.value || "").trim().toLowerCase();
    [...select.options].forEach(option => {
      if (!query || option.textContent.toLowerCase().includes(query)) {
        option.selected = false;
      }
    });
    select.dispatchEvent(new Event("change", { bubbles: true }));
    renderCustomerInterestDropdownOptions();
  });

  select.addEventListener("change", syncCustomerInterestCheckboxes);

  document.addEventListener("click", event => {
    if (!dropdown.contains(event.target)) {
      setCustomerInterestDropdownOpen(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && trigger.getAttribute("aria-expanded") === "true") {
      setCustomerInterestDropdownOpen(false);
      trigger.focus();
    }
  });

  updateCustomerInterestDropdownSummary();
}

function refreshReferenceOptions() {
  interests = interestRecords.filter(item => item.is_active).map(item => item.name);
  noSaleReasons = reasonRecords.filter(item => item.is_active).map(item => item.name);
  representatives = representativeRecords
    .filter(item => item.is_active)
    .map(item => ({
      id: item.representative_code,
      uuid: item.id,
      name: item.full_name,
      phone: item.phone || "",
      email: item.email || ""
    }));

  const current = {
    interestFilter: document.getElementById("interestFilter")?.value || "",
    repFilter: document.getElementById("repFilter")?.value || "",
    followupRepFilter: document.getElementById("followupRepFilter")?.value || "",
    quotationRepFilter: document.getElementById("quotationRepFilter")?.value || "",
    dashboardRepFilter: document.getElementById("dashboardRepFilter")?.value || "",
    dashboardInterestFilter: document.getElementById("dashboardInterestFilter")?.value || "",
    dailyAlertsRepresentativeFilter: document.getElementById("dailyAlertsRepresentativeFilter")?.value || ""
  };

  replaceSelectOptions(
    document.getElementById("interestFilter"),
    interests.map(value => ({ label: value, value })),
    "كل مجالات الاهتمام",
    current.interestFilter
  );

  const customerInterestSelect = document.getElementById("customerInterest");
  const currentCustomerInterestIds = customerInterestSelect
    ? [...customerInterestSelect.selectedOptions].map(option => option.value)
    : [];

  replaceSelectOptions(
    customerInterestSelect,
    interestRecords
      .filter(item => item.is_active)
      .map(item => ({ label: item.name, value: item.id }))
  );

  if (customerInterestSelect) {
    [...customerInterestSelect.options].forEach(option => {
      option.selected = currentCustomerInterestIds.includes(option.value);
    });
  }

  initializeCustomerInterestDropdown();
  renderCustomerInterestDropdownOptions();

  ["repFilter", "followupRepFilter", "quotationRepFilter", "dashboardRepFilter"].forEach(id => {
    const labels = {
      repFilter: "كل المندوبين",
      followupRepFilter: "كل المندوبين",
      quotationRepFilter: "كل المندوبين",
      dashboardRepFilter: "كل المندوبين"
    };
    replaceSelectOptions(
      document.getElementById(id),
      representatives.map(rep => ({ label: rep.name, value: rep.name })),
      labels[id],
      current[id]
    );
  });

  replaceSelectOptions(
    document.getElementById("dailyAlertsRepresentativeFilter"),
    representatives.map(rep => ({ label: rep.name, value: rep.uuid })),
    "كل المندوبين",
    current.dailyAlertsRepresentativeFilter
  );

  const authProfile = window.CustomerAuth?.getState?.().profile;
  const canonicalDataScope = window.KYUMDataAccessScope?.current?.(authProfile?.id);
  const customerRepresentativeOptions = window.KYUMDataAccessScope?.filterRepresentatives
    ? window.KYUMDataAccessScope.filterRepresentatives(representatives, canonicalDataScope)
    : representatives;

  replaceSelectOptions(
    document.getElementById("customerRepresentative"),
    customerRepresentativeOptions.map(rep => ({ label: rep.name, value: rep.uuid }))
  );
  const followupRepresentativeOptions = [...customerRepresentativeOptions];

  replaceSelectOptions(
    document.getElementById("followupRepresentative"),
    followupRepresentativeOptions.map(rep => ({ label: rep.name, value: rep.uuid }))
  );
  const quotationRepresentativeOptions = [...customerRepresentativeOptions];

  replaceSelectOptions(
    document.getElementById("quotationRepresentative"),
    quotationRepresentativeOptions.map(rep => ({ label: rep.name, value: rep.uuid }))
  );

  replaceSelectOptions(
    document.getElementById("noSaleReason"),
    reasonRecords
      .filter(item => item.is_active)
      .map(item => ({ label: item.name, value: item.id })),
    "بدون سبب",
    ""
  );
  replaceSelectOptions(
    document.getElementById("followupNoSaleReason"),
    reasonRecords
      .filter(item => item.is_active)
      .map(item => ({ label: item.name, value: item.id })),
    "بدون سبب",
    ""
  );
  replaceSelectOptions(
    document.getElementById("quotationRejectionReason"),
    reasonRecords
      .filter(item => item.is_active)
      .map(item => ({ label: item.name, value: item.id })),
    "اختر سبب الرفض",
    ""
  );

  replaceSelectOptions(
    document.getElementById("dashboardInterestFilter"),
    interests.map(value => ({ label: value, value })),
    "كل مجالات الاهتمام",
    current.dashboardInterestFilter
  );

  const customerOptions = customers.map(customer => ({
    label: `${customer.name} — ${customer.phone}`,
    value: customer.id
  }));
  replaceSelectOptions(document.getElementById("followupCustomer"), customerOptions);
  replaceSelectOptions(document.getElementById("quotationCustomer"), customerOptions);
  syncQuotationCustomerSearchFromSelect();

  renderReferenceData();
  syncReferenceDataPanel();
  renderRepresentatives();
}

function showDataStatus(id, message = "", type = "info") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = message ? `data-status ${type}` : "data-status hidden";
}


function formatOfflineCacheStatus(status) {
  if (!status || status.source !== "cache") return "";
  const updatedAt = Number(status.metadata?.updatedAt || 0);
  if (!updatedAt) return status.stale ? customerT("shared.cache.local","يتم عرض آخر بيانات محفوظة محليًا.") : "";
  const minutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60000));
  if (minutes < 1) return customerT("shared.cache.lessMinute","يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.");
  if (minutes < 60) return customerT("shared.cache.minutes",`يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ ${minutes} دقيقة.`,{count:minutes});
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return customerT("shared.cache.hours",`يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ ${hours} ساعة.`,{count:hours});
  const days = Math.floor(hours / 24);
  return customerT("shared.cache.days",`يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ ${days} يوم.`,{count:days});
}

function applyReferenceCacheUpdate(event) {
  const detail = event?.detail || {};
  const key = String(detail.key || "");
  const data = Array.isArray(detail.data) ? detail.data : null;
  if (!data) return;

  if (key === "sales_representatives:all") representativeRecords = data;
  else if (key === "interest_categories:all") interestRecords = data;
  else if (key === "no_sale_reasons:all") reasonRecords = data;
  else return;

  referenceDataLoaded = true;
  referenceDataLoadedAt = Date.now();
  refreshReferenceOptions();
}

window.addEventListener("kyum-reference-cache-updated", applyReferenceCacheUpdate);

function applyCustomerCacheUpdate(event) {
  const rows = event?.detail?.data;
  if (!Array.isArray(rows)) return;

  customers = rows;
  customersLoaded = true;
  customersPage = 1;
  showDataStatus("customersStatus", "");
  refreshReferenceOptions();
  renderCustomers();
  renderReferenceCustomers();
  renderDashboard();
  renderRepresentatives();
}

window.addEventListener("kyum-customer-cache-updated", applyCustomerCacheUpdate);

function applyFollowupCacheUpdate(event) {
  const rows = event?.detail?.data;
  if (!Array.isArray(rows)) return;

  followups = rows;
  followupsLoaded = true;
  followupsPage = 1;
  showDataStatus("followupsStatus", "");
  renderFollowups();
  renderDashboard();
}

window.addEventListener("kyum-followup-cache-updated", applyFollowupCacheUpdate);

function applyQuotationCacheUpdate(event) {
  const rows = event?.detail?.data;
  if (!Array.isArray(rows)) return;

  quotations = rows;
  quotationsLoaded = true;
  quotationsPage = 1;
  showDataStatus("quotationsStatus", "");
  renderQuotations();
  renderCustomers();
  renderDashboard();
}

window.addEventListener("kyum-quotation-cache-updated", applyQuotationCacheUpdate);

function applyDailyOperationsCacheUpdate(event) {
  const detail = event?.detail || {};
  const workDate = detail.workDate || window.DailyOperationsService?.todayIso?.();
  if (workDate && workDate !== window.DailyOperationsService?.todayIso?.() && workDate !== "global") return;

  if (detail.type === "definitions" && Array.isArray(detail.data)) {
    dailyTaskDefinitions = detail.data;
  } else if (detail.type === "completions" && Array.isArray(detail.data)) {
    dailyTaskRecords = detail.data;
  } else if (detail.type === "targets" && detail.data) {
    dailyOperationTargets = detail.data;
  } else if (detail.type === "manager-note") {
    dailyManagerNote = detail.data || null;
  } else if (detail.type === "permission-crm:dailyOperations" && detail.data && typeof detail.data === "object") {
    dailyOperationsCrmSnapshot = detail.data;
  } else {
    return;
  }

  renderDailyOperations();
}

window.addEventListener("kyum-daily-operations-cache-updated", applyDailyOperationsCacheUpdate);
window.addEventListener("kyum-offline-read-updated", event => {
  const detail = event?.detail || {};
  const selectedDate = dailyPerformanceSelectedDate?.();
  if (detail.key === `daily-performance:${selectedDate}` && detail.data) {
    dailyPerformanceSnapshot = detail.data;
    populateDailyPerformanceEmployees();
    populateDailyTasksEmployees();
    resetDailyTasksReportView();
    dailyActivityReportRequested = false;
    renderDailyPerformanceReport();
  }
  if (detail.key === `daily-activity:${selectedDate}` && detail.data) {
    dailyActivitySnapshot = detail.data;
    populateDailyActivityEmployees();
    renderDailyAttendance();
    dailyActivityReportRequested = false;
    renderDailyActivityTimeline();
  }

  const dailySuggestionsDate = window.DailySuggestionsService?.riyadhDate?.() || dailyLocalDate();
  const dailySuggestionsUserId = window.CustomerAuth?.getState?.().user?.id || null;
  if (dailySuggestionsUserId
    && detail.key === `daily-suggestions:${dailySuggestionsDate}:${dailySuggestionsUserId}`
    && detail.data
    && typeof detail.data === "object") {
    dailySuggestedSuggestionRows = Array.isArray(detail.data.rows) ? detail.data.rows : [];
    dailySuggestedSuggestionProgress = detail.data.progress || dailySuggestedSuggestionProgress;
    dailySuggestedSuggestionsError = "";
    renderDailySuggestedCustomers();
  }
  if (detail.key === `daily-suggestions-team:${dailySuggestionsDate}` && Array.isArray(detail.data)) {
    dailySuggestedTeamRows = detail.data;
    dailySuggestedTeamError = "";
    renderDailySuggestedTeam();
  }
});

window.addEventListener("kyum-daily-derived-invalidated", event => {
  const workDate = event?.detail?.workDate;
  const reportView = document.getElementById("dailyPerformanceReport");
  if (workDate === dailyPerformanceSelectedDate?.() && reportView && !reportView.classList.contains("hidden")) {
    loadDailyPerformanceReport(true);
  }
});

let cacheDependencyRefreshTimer = null;
window.addEventListener("kyum-cache-dependencies-invalidated", event => {
  const detail = event?.detail || {};
  clearTimeout(cacheDependencyRefreshTimer);
  cacheDependencyRefreshTimer = setTimeout(() => {
    const selectedDate = dailyPerformanceSelectedDate?.();
    const sameDate = !detail.workDate || detail.workDate === selectedDate;
    const prefixes = Array.isArray(detail.prefixes) ? detail.prefixes : [];

    if (sameDate && prefixes.some(prefix => prefix.startsWith("daily-performance:"))) {
      const view = document.getElementById("dailyPerformanceReportView");
      if (view && !view.classList.contains("hidden")) loadDailyPerformanceReport(true);
    }
    if (sameDate && prefixes.some(prefix => prefix.startsWith("daily-activity:"))) {
      const view = document.getElementById("dailyActivityReportView");
      if (view && !view.classList.contains("hidden")) loadDailyActivityReport?.(true);
    }
    if (prefixes.some(prefix => prefix.startsWith("daily-suggestions:"))) {
      const dailyView = document.getElementById("dailyOperationsView");
      if (dailyView && !dailyView.classList.contains("hidden")) loadDailySuggestedCustomers(true);
    }
    if (detail.entity === "customers" || detail.entity === "followups" || detail.entity === "quotations") {
      renderDashboard();
    }
  }, 120);
});

let customerRegionCatalog = [];
let customerCityCatalog = [];
let customerDistrictCatalog = [];
let customerDistrictCatalogLoaded = false;
let customerDistrictCatalogPromise = null;
let customerGeoController = null;

function resetGeoOptionsPosition(options){
  if(!options)return;
  options.classList.remove('is-positioned','opens-upward');
  options.style.removeProperty('max-height');
}
function positionCustomerGeoOptions(type){
  const controller=customerGeoController;
  const {search,options}=controller?.elements(type)||{};
  const dialog=document.getElementById('customerDialog');
  if(!search||!options||!dialog)return;
  if(window.matchMedia('(max-width: 767px)').matches){resetGeoOptionsPosition(options);return}
  const inputRect=search.getBoundingClientRect();
  const dialogRect=dialog.getBoundingClientRect();
  const viewportHeight=window.innerHeight||document.documentElement.clientHeight;
  const safeTop=Math.max(12,dialogRect.top+16);
  const safeBottom=Math.min(viewportHeight-12,dialogRect.bottom-16);
  const gap=8,minUsefulHeight=160,preferredHeight=280;
  const below=Math.max(0,safeBottom-inputRect.bottom-gap);
  const above=Math.max(0,inputRect.top-safeTop-gap);
  const opensUpward=below<minUsefulHeight&&above>below;
  const available=opensUpward?above:below;
  const maxHeight=Math.max(132,Math.min(preferredHeight,available||preferredHeight));
  options.classList.add('is-positioned');
  options.classList.toggle('opens-upward',opensUpward);
  options.style.maxHeight=`${Math.round(maxHeight)}px`;
}
function ensureCustomerGeoController(){
  if(customerGeoController)return customerGeoController;
  if(!window.KYUMGeography)throw new Error('مكوّن العنوان الجغرافي غير محمّل.');
  customerGeoController=window.KYUMGeography.createController({
    ids:{
      region:{wrapper:'customerRegionCombobox',hidden:'customerRegion',search:'customerRegionSearch',options:'customerRegionOptions'},
      city:{wrapper:'customerCityCombobox',hidden:'customerCity',search:'customerCitySearch',options:'customerCityOptions'},
      district:{wrapper:'customerDistrictCombobox',hidden:'customerDistrict',search:'customerDistrictSearch',options:'customerDistrictOptions'}
    },
    optionLimit:250,
    boundAttribute:'customerGeoUnifiedBound',
    onOpen:type=>requestAnimationFrame(()=>positionCustomerGeoOptions(type)),
    onClose:(_type,{options})=>resetGeoOptionsPosition(options)
  }).bind();
  const customerDialog=document.getElementById('customerDialog');
  if(customerDialog&&!customerDialog.dataset.geoUnifiedScrollBound){
    customerDialog.dataset.geoUnifiedScrollBound='1';
    const closeAll=()=>['region','city','district'].forEach(type=>customerGeoController?.close(type));
    customerDialog.addEventListener('scroll',closeAll,{passive:true});
    customerDialog.querySelector('form')?.addEventListener('scroll',closeAll,{passive:true});
    customerDialog.addEventListener('close',closeAll);
    window.addEventListener('resize',closeAll,{passive:true});
  }
  return customerGeoController;
}
function renderCustomerGeography(current={}){return ensureCustomerGeoController().setValue(current)}
function renderCustomerDistrictOptions(currentValue=''){return renderCustomerGeography({district:currentValue})}
function bindCustomerGeographyCascade(){return ensureCustomerGeoController()}
function normalizeCustomerNeighborhoodSearch(value="") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}
function customerNeighborhoodElements(){
  return {
    wrapper:document.getElementById("customerNeighborhoodCombobox"),
    hidden:document.getElementById("customerNeighborhoodId"),
    search:document.getElementById("customerAddress"),
    toggle:document.getElementById("customerNeighborhoodToggle"),
    options:document.getElementById("customerNeighborhoodOptions")
  };
}
function closeCustomerNeighborhoodOptions(){
  const {wrapper,search,options}=customerNeighborhoodElements();
  if(!wrapper||!search||!options)return;
  wrapper.dataset.open="false";
  search.setAttribute("aria-expanded","false");
  options.classList.add("hidden");
}
function renderCustomerNeighborhoodOptions(query=""){
  const {hidden,options}=customerNeighborhoodElements();
  if(!options)return;
  const q=normalizeCustomerNeighborhoodSearch(query);
  const matches=(customerDistrictCatalog||[])
    .filter(row=>row?.is_active!==false)
    .filter(row=>{const label=customerNeighborhoodLabel(row?.id,row?.name);return !q||normalizeCustomerNeighborhoodSearch(`${row?.name||""} ${label}`).includes(q)})
    .slice(0,250);
  options.replaceChildren();
  if(!matches.length){
    const empty=document.createElement("div");
    empty.className="geo-searchable-empty";
    empty.textContent="لا توجد نتائج مطابقة.";
    options.appendChild(empty);
    return;
  }
  matches.forEach(row=>{
    const button=document.createElement("button");
    button.type="button";
    button.className=`geo-searchable-option${String(hidden?.value||"")===String(row.id)?" is-selected":""}`;
    button.setAttribute("role","option");
    button.setAttribute("aria-selected",String(String(hidden?.value||"")===String(row.id)));
    button.dataset.customerNeighborhoodId=String(row.id);
    button.textContent=customerNeighborhoodLabel(row.id,row.name);
    options.appendChild(button);
  });
}
function openCustomerNeighborhoodOptions(){
  const {wrapper,search,options}=customerNeighborhoodElements();
  if(!wrapper||!search||!options||search.disabled)return;
  renderCustomerNeighborhoodOptions(search.value);
  wrapper.dataset.open="true";
  search.setAttribute("aria-expanded","true");
  options.classList.remove("hidden");
}
function setCustomerNeighborhood(neighborhoodId="", fallbackAddress=""){
  const {hidden,search}=customerNeighborhoodElements();
  if(!hidden||!search)return null;
  const row=(customerDistrictCatalog||[]).find(item=>String(item.id)===String(neighborhoodId))
    ||(!neighborhoodId&&fallbackAddress?(customerDistrictCatalog||[]).find(item=>normalizeCustomerNeighborhoodSearch(item.name)===normalizeCustomerNeighborhoodSearch(fallbackAddress)):null);
  hidden.value=row?String(row.id):"";
  search.value=row?customerNeighborhoodLabel(row.id,row.name):String(fallbackAddress||"");
  search.dataset.selectedId=row?String(row.id):"";
  search.setCustomValidity("");
  return row||null;
}
function bindCustomerNeighborhoodSearch(){
  const {wrapper,hidden,search,toggle,options}=customerNeighborhoodElements();
  if(!wrapper||!hidden||!search||!options||wrapper.dataset.customerNeighborhoodBound)return;
  wrapper.dataset.customerNeighborhoodBound="1";
  search.addEventListener("focus",openCustomerNeighborhoodOptions);
  search.addEventListener("input",()=>{
    hidden.value="";
    search.dataset.selectedId="";
    search.setCustomValidity("");
    openCustomerNeighborhoodOptions();
  });
  toggle?.addEventListener("click",()=>{
    if(options.classList.contains("hidden"))openCustomerNeighborhoodOptions();else closeCustomerNeighborhoodOptions();
  });
  options.addEventListener("click",event=>{
    const button=event.target.closest("[data-customer-neighborhood-id]");
    if(!button)return;
    setCustomerNeighborhood(button.dataset.customerNeighborhoodId||"");
    closeCustomerNeighborhoodOptions();
    search.focus();
  });
  document.addEventListener("pointerdown",event=>{if(!wrapper.contains(event.target))closeCustomerNeighborhoodOptions();});
}

async function loadCustomerDistrictCatalog(force=false){
  if(!force&&customerDistrictCatalogLoaded)return customerDistrictCatalog;
  if(customerDistrictCatalogPromise)return customerDistrictCatalogPromise;
  if(!window.customerSupabase){bindCustomerGeographyCascade();bindCustomerNeighborhoodSearch();return customerDistrictCatalog}
  customerDistrictCatalogPromise=(async()=>{
    const geo=await window.KYUMGeography.loadCatalog(force);
    customerRegionCatalog=geo.regions;
    customerCityCatalog=geo.cities;
    customerDistrictCatalog=geo.districts;
    customerDistrictCatalogLoaded=true;
    bindCustomerGeographyCascade();
    console.info('[KYUM Geography] unified catalog loaded',{regions:geo.regions.length,cities:geo.cities.length,districts:geo.districts.length});
    return customerDistrictCatalog;
  })();
  try{return await customerDistrictCatalogPromise}catch(error){throw new Error(`تعذر تحميل بيانات المناطق والمدن والأحياء كاملة: ${error.message}`)}finally{customerDistrictCatalogPromise=null}
}

function operationalDefaultRepresentativeId(preferredId = "") {
  const profile = window.CustomerAuth?.getState?.().profile || {};
  const allowedIds = new Set(representatives.map(rep => String(rep.uuid || "")).filter(Boolean));
  const candidates = [preferredId, profile.representative_id, representatives[0]?.uuid]
    .map(value => String(value || ""))
    .filter(Boolean);
  return candidates.find(value => allowedIds.has(value)) || "";
}

async function ensureOperationalReferenceData() {
  try {
    await loadReferenceDataFromSupabase(false);
    refreshReferenceOptions();
    return true;
  } catch (error) {
    console.error("Operational reference data unavailable:", error);
    alert(error instanceof Error
      ? error.message
      : "تعذر تحميل القوائم المرجعية المطلوبة. أعد المحاولة بعد تحديث الصفحة.");
    return false;
  }
}

async function loadReferenceDataFromSupabase(force = false) {
  if (!window.ReferenceDataService) return;

  const cacheIsFresh =
    referenceDataLoaded &&
    (Date.now() - referenceDataLoadedAt) < REFERENCE_DATA_TTL_MS;

  if (!force && cacheIsFresh) return;
  if (referenceDataLoadPromise) return referenceDataLoadPromise;

  if (force) {
    window.ReferenceDataService.invalidate?.();
  }

  referenceDataLoading = true;
  showDataStatus("referenceDataStatus", "جاري تحميل البيانات المرجعية...", "info");
  showDataStatus("representativesStatus", "جاري تحميل المندوبين...", "info");

  referenceDataLoadPromise = (async () => {
    try {
      const results = await Promise.allSettled([
        window.ReferenceDataService.listRepresentatives(true),
        window.ReferenceDataService.listInterests(true),
        window.ReferenceDataService.listReasons(true)
      ]);

      const [representativesResult, interestsResult, reasonsResult] = results;
      const failures = [];

      if (representativesResult.status === "fulfilled") {
        representativeRecords = representativesResult.value || [];
      } else {
        failures.push("المندوبين");
        console.error("Representatives reference load failed:", representativesResult.reason);
      }

      if (interestsResult.status === "fulfilled") {
        interestRecords = interestsResult.value || [];
      } else {
        failures.push("مجالات الاهتمام");
        console.error("Interest categories load failed:", interestsResult.reason);
      }

      if (reasonsResult.status === "fulfilled") {
        reasonRecords = reasonsResult.value || [];
      } else {
        failures.push("أسباب عدم البيع");
        console.error("No-sale reasons load failed:", reasonsResult.reason);
      }

      referenceDataLoaded = results.some(result => result.status === "fulfilled");
      referenceDataLoadedAt = Date.now();
      refreshReferenceOptions();

      const failureMessage = failures.length
        ? `تعذر تحميل: ${failures.join("، ")}. تحقق من صلاحيات البيانات المرجعية.`
        : "";
      showDataStatus("referenceDataStatus", failureMessage, failures.length ? "error" : "info");
      showDataStatus("representativesStatus", representativesResult.status === "rejected"
        ? "تعذر تحميل قائمة المندوبين المسموحين."
        : "", representativesResult.status === "rejected" ? "error" : "info");

      if (failures.length === results.length) {
        throw new Error(failureMessage || "تعذر تحميل البيانات المرجعية.");
      }
    } catch (error) {
      console.error("Reference data load failed:", error);
      const message = error instanceof Error ? error.message : "تعذر تحميل البيانات.";
      showDataStatus("referenceDataStatus", message, "error");
      showDataStatus("representativesStatus", message, "error");
      throw error;
    } finally {
      referenceDataLoading = false;
      referenceDataLoadPromise = null;
    }
  })();

  return referenceDataLoadPromise;
}

function setOptions() {
  refreshReferenceOptions();
}

let activeViewKey = null;

function routeFromLocation() {
  const raw = String(window.location.hash || "").replace(/^#\/?/, "").trim();
  return raw || null;
}

function syncRouteLocation(viewKey, replace = false) {
  if (!viewKey) return;
  const nextHash = `#/${encodeURIComponent(viewKey)}`;
  if (window.location.hash === nextHash) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ kyumView: viewKey }, "", nextHash);
}

function switchView(requestedName, options = {}) {
  const requestedView = String(requestedName || "").trim();
  const permissions = window.PermissionEngine || window.CustomerPermissions;
  const authState = window.CustomerAuth?.getState?.();

  if (!views[requestedView]) {
    console.warn(`Unknown view blocked: ${requestedView}`);
    window.dispatchEvent(new CustomEvent("kyum-navigation-blocked", {
      detail: { requestedView, reason: "unknown_view" }
    }));
    return false;
  }

  if (authState?.profile) {
    const authorization = permissions?.authorize?.(requestedView, "dashboard")
      || permissions?.authorizeView?.(requestedView, "dashboard")
      || {
        allowed: permissions?.canView?.(requestedView) === true || permissions?.canScreen?.(requestedView, "view") === true,
        target: permissions?.firstAllowedScreen?.("dashboard") || null,
        reason: "permission_denied"
      };

    const visibleTrustedDailyNavigation = requestedView === "dailyOperations"
      && options.trustedNavigation === true
      && !document.querySelector('.nav-item[data-view="dailyOperations"]')?.classList.contains("hidden")
      && document.querySelector('.nav-item[data-view="dailyOperations"]')?.disabled !== true;

    if (!authorization.allowed && !visibleTrustedDailyNavigation) {
      console.warn(`Unauthorized view blocked: ${requestedView}`);
      window.dispatchEvent(new CustomEvent("kyum-navigation-blocked", {
        detail: { requestedView, reason: authorization.reason, fallback: authorization.target }
      }));
      if (authorization.target && authorization.target !== requestedView) {
        return switchView(authorization.target, {
          silent: true,
          permissionFallback: true,
          replaceHistory: true
        });
      }
      return false;
    }
  }

  const name = requestedView;
  const viewRenderStartedAt = performance.now();
  if (name !== "systemHealth") stopSystemHealthAutoRefresh();
  Object.entries(views).forEach(([key, element]) => {
    const isActive = key === name;
    element.classList.toggle("hidden", !isActive);
    element.setAttribute("aria-hidden", String(!isActive));
    if ("inert" in element) element.inert = !isActive;
  });
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));


  if (name === "aboutApp") {
    initializeAboutAppCenter();
    renderAboutAppCenter();
  }

  if (name === "dailyOperations") {
    loadDailyOperations(false);
  }
  if (name === "users") {
    populateSecurityOptions();
    loadUsersFromSupabase();
    renderUsers();
  }
  if (name === "permissions") {
    populateSecurityOptions();
    loadPermissionsMatrix();
  }
  if (name === "activityLog") {
    loadActivity();
  }

  if (name === "backups") {
    loadBackupHistory();
  }
  if (name === "systemHealth") {
    loadSystemHealth(true);
    startSystemHealthAutoRefresh();
  }
  if (name === "reportsOverview") {
    ensureReportsData().then(renderReportsOverview);
  }
  if (name === "dailyPerformanceReport") {
    loadDailyPerformanceReport(true);
  }
  if (name === "notificationCenter") {
    window.NotificationCenterUI?.loadConfig?.(true);
  }
  if (name === "translationCenter") {
    window.TranslationCenterUI?.load?.(false);
  }
  if (name === "systemSettings") {
    loadSystemSettings();
  }

  const localizedPageMetaKeys = { dashboard:["dashboard.page.title","dashboard.page.subtitle"], customers:["customers.page.title","customers.page.subtitle"], followups:["followups.page.title","followups.page.subtitle"], quotations:["contracts.page.title","contracts.page.subtitle"], salesInvoices:["invoices.page.title","invoices.page.subtitle"] };
  const localizedMetaKeys = localizedPageMetaKeys[name];
  const activePageMeta = name === "installationExecution" && window.PetatoeLocalization?.pageMeta ? window.PetatoeLocalization.pageMeta() : localizedMetaKeys ? localizedMetaKeys.map((key,index)=>customerT(key,pageMeta[name][index])) : pageMeta[name];
  document.getElementById("pageTitle").textContent = activePageMeta[0];
  requestAnimationFrame(() => {
    window.PerformanceMonitor?.recordRender(
      name,
      performance.now() - viewRenderStartedAt
    );
  });
  document.getElementById("pageSubtitle").textContent = activePageMeta[1];

  if (name === "dashboard") {
    renderDashboard();
    ensureDashboardRepresentativeSettings().then(() => renderDashboard());
  }
  if (name === "customers") {
    loadCustomersFromSupabase();
    renderCustomers();
  }
  if (name === "followups") {
    loadFollowupsFromSupabase();
    renderFollowups();
  }
  if (name === "quotations") {
    loadQuotationsFromSupabase();
    renderQuotations();
  }
  if (name === "representatives") {
    loadReferenceDataFromSupabase();
    renderRepresentatives();
  }
  if (name === "settings") {
    loadReferenceDataFromSupabase();
    loadCustomersFromSupabase();
    renderReferenceData();
    renderReferenceCustomers();
  }

  activeViewKey = name;
  if (!options.fromHistory) {
    syncRouteLocation(name, Boolean(options.replaceHistory || options.permissionFallback));
  }
  window.dispatchEvent(new CustomEvent("kyum-view-changed", { detail: { view: name } }));
  return true;
}


window.addEventListener("petatoe-language-changed", () => {
  window.PetatoeLocalization?.applyStatic?.(document);
  const current = activeViewKey;
  const localizedPageMetaKeys = { dashboard:["dashboard.page.title","dashboard.page.subtitle"], customers:["customers.page.title","customers.page.subtitle"], followups:["followups.page.title","followups.page.subtitle"], quotations:["contracts.page.title","contracts.page.subtitle"], salesInvoices:["invoices.page.title","invoices.page.subtitle"] };
  let meta = null;
  if (current === "installationExecution") meta = window.PetatoeLocalization?.pageMeta?.();
  else if (localizedPageMetaKeys[current]) meta = localizedPageMetaKeys[current].map((key,index)=>customerT(key,pageMeta[current][index]));
  if (meta) { document.getElementById("pageTitle").textContent = meta[0]; document.getElementById("pageSubtitle").textContent = meta[1]; }
  if (current === "followups") { renderFollowups(); showDataStatus("followupsStatus", formatOfflineCacheStatus(window.FollowupsService?.getLastReadStatus?.()), "info"); }
});
window.addEventListener("petatoe-localization-updated", () => {
  window.PetatoeLocalization?.applyStatic?.(document);
});

window.KYUMNavigation = Object.freeze({
  open: (viewKey, options = {}) => switchView(viewKey, options),
  current: () => activeViewKey,
  canOpen: viewKey => Boolean(views[viewKey]) && Boolean(
    window.PermissionEngine?.canView?.(viewKey)
      ?? window.CustomerPermissions?.canScreen?.(viewKey, "view")
  )
});


function dashboardRepresentativeSettingMap() {
  const map = new Map();
  employeeReportSettings.forEach(item => {
    const representativeId = String(item?.representativeId || "").trim();
    if (!representativeId) return;
    const current = map.get(representativeId);
    const visible = item.includeInDashboardPerformance !== false;
    map.set(representativeId, current === undefined ? visible : (current || visible));
  });
  return map;
}

function dashboardVisibleRepresentatives() {
  if (!employeeReportSettings.length) return representatives;
  const settingMap = dashboardRepresentativeSettingMap();
  return representatives.filter(rep => !settingMap.has(String(rep.uuid || "")) || settingMap.get(String(rep.uuid || "")) !== false);
}

function dashboardHiddenRepresentativeNames() {
  const visibleNames = new Set(dashboardVisibleRepresentatives().map(rep => rep.name));
  return new Set(representatives.filter(rep => !visibleNames.has(rep.name)).map(rep => rep.name));
}

function refreshDashboardRepresentativeOptions() {
  const select = document.getElementById("dashboardRepFilter");
  if (!select) return;
  const current = select.value || "";
  const visibleRepresentatives = dashboardVisibleRepresentatives();
  replaceSelectOptions(
    select,
    visibleRepresentatives.map(rep => ({ label: rep.name, value: rep.name })),
    "كل المندوبين",
    visibleRepresentatives.some(rep => rep.name === current) ? current : ""
  );
}

async function ensureDashboardRepresentativeSettings(force = false) {
  if (!window.EmployeeReportSettingsService?.listForDate) return;
  if (employeeReportSettings.length && !force) return;
  try {
    employeeReportSettings = await window.EmployeeReportSettingsService.listForDate(undefined, { force });
    refreshDashboardRepresentativeOptions();
  } catch (error) {
    console.warn("[Dashboard] Employee visibility settings unavailable; using default representatives.", error);
  }
}

function dashboardFilterState() {
  return {
    representative: document.getElementById("dashboardRepFilter")?.value || "",
    from: document.getElementById("dashboardDateFrom")?.value || "",
    to: document.getElementById("dashboardDateTo")?.value || ""
  };
}

function dateInRange(value, from, to) {
  if (!value) return !from && !to;
  return (!from || value >= from) && (!to || value <= to);
}

function dashboardData() {
  const filters=dashboardFilterState();
  const filteredCustomers=[...customers];
  const filteredFollowups=followups.filter(item=>(!filters.representative||item.representative===filters.representative)&&dateInRange(item.contactDate,filters.from,filters.to));
  const filteredQuotations=quotations.filter(item=>(!filters.representative||item.representative===filters.representative)&&dateInRange(item.quotationDate,filters.from,filters.to));
  return {filters,customers:filteredCustomers,followups:filteredFollowups,quotations:filteredQuotations};
}

function renderDashboard() {
  const settingsButton=document.getElementById("dashboardRepresentativeVisibilityBtn"); settingsButton?.classList.toggle("hidden",!window.EmployeeReportSettingsService?.canManage?.());
  const data=dashboardData(),filteredCustomers=data.customers,filteredFollowups=data.followups,filteredQuotations=data.quotations;
  const dueToday=filteredFollowups.filter(item=>followupStatus(item)==="today").length,overdue=filteredFollowups.filter(item=>followupStatus(item)==="overdue").length,accepted=filteredQuotations.filter(item=>item.status==="مقبول"),rejected=filteredQuotations.filter(item=>item.status==="مرفوض");
  const totalQuotationValue=filteredQuotations.reduce((s,i)=>s+Number(i.amount||0),0),acceptedValue=accepted.reduce((s,i)=>s+Number(i.amount||0),0),conversionRate=filteredQuotations.length?(accepted.length/filteredQuotations.length)*100:0;
  const stats=[[customerT("dashboard.stats.customers","إجمالي العملاء"),filteredCustomers.length],[customerT("dashboard.stats.followups","إجمالي المتابعات"),filteredFollowups.length],[customerT("dashboard.stats.today","متابعات اليوم"),dueToday],[customerT("dashboard.stats.overdue","متابعات متأخرة"),overdue],[customerT("dashboard.stats.contracts","عدد عقود العملاء"),filteredQuotations.length],[customerT("dashboard.stats.contractValue","قيمة العقود"),formatCurrency(totalQuotationValue)],[customerT("dashboard.stats.accepted","العقود المقبولة"),accepted.length],[customerT("dashboard.stats.acceptedValue","قيمة المقبول"),formatCurrency(acceptedValue)],[customerT("dashboard.stats.rejected","العقود المرفوضة"),rejected.length],[customerT("dashboard.stats.conversion","نسبة التحويل"),`${conversionRate.toFixed(1)}%`]];
  const dashboardKpiIcons=[
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6M4 21h16"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M6 4h12l2 16H4L6 4Zm3 7h6"/></svg>'
  ];
  document.getElementById("statsGrid").innerHTML=stats.map(([l,v],index)=>`<article class="stat-card"><span class="petatoe-kpi-icon">${dashboardKpiIcons[index%dashboardKpiIcons.length]}</span><span>${l}</span><strong>${v}</strong></article>`).join("");
  const periodText=data.filters.from||data.filters.to?customerT("dashboard.period.range","الفترة: {from} — {to}",{from:data.filters.from?formatDate(data.filters.from):customerT("dashboard.period.start","البداية"),to:data.filters.to?formatDate(data.filters.to):customerT("dashboard.period.today","اليوم")}):customerT("dashboard.period.all","الفترة: جميع البيانات"); document.getElementById("dashboardPeriodLabel").textContent=periodText;
  renderRepresentativePerformance(data); renderQuotationStatusAnalytics(filteredQuotations); renderNoSaleReasonAnalytics([],filteredQuotations); renderActivityTrend(data);
  const latest=[...filteredCustomers].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,5);
  document.getElementById("recentCustomers").innerHTML=latest.length?`<div class="simple-list">${latest.map(c=>`<div class="simple-item"><div><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.customerNumber||"—")} · ${escapeHtml(c.phone||"—")}</span></div><span>${escapeHtml(customerNeighborhoodLabel(c.neighborhoodId,c.address)||"—")}</span></div>`).join("")}</div>`:`<div class="empty-state">${customerT("dashboard.recent.empty","لا توجد بيانات عملاء.")}</div>`;
  const attention=filteredFollowups.filter(item=>["today","overdue"].includes(followupStatus(item))).sort((a,b)=>String(a.nextFollowupDate).localeCompare(String(b.nextFollowupDate))).slice(0,6);
  document.getElementById("attentionFollowups").innerHTML=attention.length?`<div class="simple-list">${attention.map(item=>{const c=customerById(item.customerId),status=followupStatus(item);return `<div class="attention-item ${status==="overdue"?"overdue":""}"><div><strong>${escapeHtml(c?.name||customerT("customers.unknown","عميل غير معروف"))}</strong><span>${escapeHtml(item.representative)} · ${escapeHtml(followupResultLabel(item.result))}</span></div><span>${statusLabel(status)} · ${formatDate(item.nextFollowupDate)}</span></div>`;}).join("")}</div>`:`<div class="empty-state">${customerT("dashboard.attention.empty","لا توجد متابعات تحتاج انتباهًا حاليًا.")}</div>`;
}

function renderRepresentativePerformance(data) {
  const rows=dashboardVisibleRepresentatives().map(rep=>{const f=data.followups.filter(x=>x.representative===rep.name),q=data.quotations.filter(x=>x.representative===rep.name),accepted=q.filter(x=>x.status==="مقبول"),conversion=q.length?(accepted.length/q.length)*100:0;return{name:rep.name,followups:f.length,quotations:q.length,quotationValue:q.reduce((s,x)=>s+Number(x.amount||0),0),conversion};}).filter(r=>r.followups||r.quotations);
  document.getElementById("representativePerformance").innerHTML=rows.length?rows.map(r=>`<article class="performance-card"><div class="performance-card-head"><strong>${escapeHtml(r.name)}</strong><span>${customerT("dashboard.reps.conversion","نسبة التحويل {value}%",{value:r.conversion.toFixed(1)})}</span></div><div class="performance-metrics"><div class="performance-metric"><span>${customerT("dashboard.reps.followups","المتابعات")}</span><strong>${r.followups}</strong></div><div class="performance-metric"><span>${customerT("dashboard.reps.contracts","العقود")}</span><strong>${r.quotations}</strong></div><div class="performance-metric"><span>${customerT("dashboard.reps.contractValue","قيمة العقود")}</span><strong>${formatCurrency(r.quotationValue)}</strong></div><div class="performance-metric"><span>${customerT("dashboard.reps.conversionLabel","التحويل")}</span><strong>${r.conversion.toFixed(1)}%</strong></div></div></article>`).join(""):`<div class="empty-state">${customerT("dashboard.reps.empty","لا توجد بيانات أداء ضمن الفلاتر.")}</div>`;
}

function renderBarChart(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">${customerT("dashboard.chart.empty","لا توجد بيانات كافية.")}</div>`;
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

function renderInterestAnalytics() {}

function renderQuotationStatusAnalytics(filteredQuotations) {
  const statuses = ["قيد التنفيذ", "مقبول", "مرفوض"];
  const rows = statuses.map(status => ({
    label: customerT(status === "قيد التنفيذ" ? "contracts.status.inProgress" : status === "مقبول" ? "contracts.status.accepted" : "contracts.status.rejected", status),
    value: filteredQuotations.filter(q => canonicalQuotationStatus(q.status) === status).length
  })).filter(row => row.value > 0);

  renderBarChart("quotationStatusAnalytics", rows);
}

function renderNoSaleReasonAnalytics(_filteredCustomers, filteredQuotations) {
  const counts=new Map(); filteredQuotations.forEach(q=>{const reason=q.rejectionReason;if(q.status==="مرفوض"&&reason)counts.set(reason,(counts.get(reason)||0)+1);});
  const rows=[...counts.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value); renderBarChart("noSaleReasonAnalytics",rows);
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
    container.innerHTML = `<div class="empty-state">${customerT("dashboard.activity.empty","لا توجد بيانات زمنية كافية.")}</div>`;
    return;
  }

  const max = Math.max(1, ...rows.flatMap(([, v]) => [v.customers, v.followups, v.quotations]));
  container.innerHTML = `
    <div class="trend-legend">
      <span>${customerT("dashboard.activity.customers","العملاء")}</span>
      <span>${customerT("dashboard.activity.followups","المتابعات")}</span>
      <span>${customerT("dashboard.activity.contracts","العروض")}</span>
    </div>
    <div class="trend-bars">
      ${rows.map(([date, values]) => `
        <div class="trend-day">
          <div class="trend-day-bars">
            <div class="trend-bar" title="${escapeHtml(customerT("dashboard.activity.customersTitle","العملاء: {count}",{count:values.customers}))}" style="height:${Math.max(2, (values.customers / max) * 160)}px"></div>
            <div class="trend-bar followups" title="${escapeHtml(customerT("dashboard.activity.followupsTitle","المتابعات: {count}",{count:values.followups}))}" style="height:${Math.max(2, (values.followups / max) * 160)}px"></div>
            <div class="trend-bar quotations" title="${escapeHtml(customerT("dashboard.activity.contractsTitle","العروض: {count}",{count:values.quotations}))}" style="height:${Math.max(2, (values.quotations / max) * 160)}px"></div>
          </div>
          <span class="trend-day-label">${formatDate(date)}</span>
        </div>`).join("")}
    </div>`;
}

function canScreenAction(screenKey, action = "view") {
  if (window.PermissionEngine?.can) return window.PermissionEngine.can(screenKey, action);
  return Boolean(window.CustomerPermissions?.canScreen?.(screenKey, action));
}

function requireScreenAction(screenKey, action, message) {
  if (window.PermissionEngine?.requireAction) {
    return window.PermissionEngine.requireAction(screenKey, action, { message });
  }
  return Boolean(window.CustomerPermissions?.requireAction?.(screenKey, action, { message }));
}

function roleLabel(role) {
  return window.CustomerPermissions?.roleLabels?.[role] || role;
}

function dataAccessLabel(user) {
  const mode = user?.data_access_mode || "own";
  if (mode === "all") return "جميع البيانات";
  if (mode === "own") return "بياناته فقط";
  const names = (user?.data_access_representatives || []).map(item => item.full_name).filter(Boolean);
  return names.length ? `بياناته + ${names.join("، ")}` : "بياناته فقط";
}

function syncUserDataAccessFields() {
  const mode = document.getElementById("userDataAccessMode")?.value || "own";
  const label = document.getElementById("userAllowedRepresentativesLabel");
  if (label) label.classList.toggle("hidden", mode !== "selected");
  if (mode === "selected") {
    filterAllowedRepresentativesList();
    updateAllowedRepresentativesCount();
  }
}

function selectedAllowedRepresentativeIds() {
  return [...document.querySelectorAll('#userAllowedRepresentativesList input[type="checkbox"]:checked')]
    .map(input => input.value)
    .filter(Boolean);
}

function updateAllowedRepresentativesCount() {
  const count = selectedAllowedRepresentativeIds().length;
  const element = document.getElementById("userAllowedRepresentativesCount");
  if (element) element.textContent = `تم اختيار ${count}`;
}

function selectedInstallationRepresentativeIds() {
  return [...document.querySelectorAll('#userInstallationRepresentativesList input[type="checkbox"]:checked')]
    .map(input => input.value)
    .filter(Boolean);
}

function updateInstallationRepresentativesCount() {
  const count = selectedInstallationRepresentativeIds().length;
  const element = document.getElementById("userInstallationRepresentativesCount");
  if (element) element.textContent = `تم اختيار ${count}`;
}

function filterInstallationRepresentativesList() {
  const query = (document.getElementById("userInstallationRepresentativesSearch")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#userInstallationRepresentativesList .representative-check-item").forEach(item => {
    item.classList.toggle("hidden", Boolean(query) && !String(item.dataset.representativeName || "").includes(query));
  });
}

function renderInstallationRepresentativesChecklist(selectedIds = null) {
  const list = document.getElementById("userInstallationRepresentativesList");
  if (!list) return;
  const currentIds = selectedIds instanceof Set
    ? selectedIds
    : new Set(selectedInstallationRepresentativeIds());
  list.innerHTML = representativeRecords.length
    ? representativeRecords.map(rep => `
      <label class="representative-check-item" data-representative-name="${escapeHtml(String(rep.full_name || '').toLowerCase())}">
        <input class="representative-check-input" type="checkbox" value="${escapeHtml(rep.id)}" ${currentIds.has(rep.id) ? "checked" : ""}>
        <span class="representative-check-name">${escapeHtml(rep.full_name)}</span>
      </label>`).join("")
    : '<div class="representatives-checklist-empty">لا يوجد مندوبون متاحون.</div>';
  filterInstallationRepresentativesList();
  updateInstallationRepresentativesCount();
}

function syncUserInstallationAccessFields() {
  const mode = document.getElementById("userInstallationAccessMode")?.value || "own";
  const tools = document.getElementById("userInstallationRepresentativesTools");
  const list = document.getElementById("userInstallationRepresentativesList");
  const showSelected = mode === "selected";
  tools?.classList.toggle("hidden", !showSelected);
  list?.classList.toggle("hidden", !showSelected);
  if (showSelected) {
    filterInstallationRepresentativesList();
    updateInstallationRepresentativesCount();
  }
}

function setInstallationRepresentativesSelection(mode) {
  const linkedRepresentativeId = document.getElementById("userRepresentative")?.value || "";
  document.querySelectorAll('#userInstallationRepresentativesList input[type="checkbox"]').forEach(input => {
    if (mode === "all") input.checked = true;
    else if (mode === "none") input.checked = false;
    else input.checked = Boolean(linkedRepresentativeId) && input.value === linkedRepresentativeId;
  });
  updateInstallationRepresentativesCount();
}

function renderAllowedRepresentativesChecklist(selectedIds = null) {
  const list = document.getElementById("userAllowedRepresentativesList");
  if (!list) return;
  const currentIds = selectedIds instanceof Set
    ? selectedIds
    : new Set(selectedAllowedRepresentativeIds());
  list.innerHTML = representativeRecords.length
    ? representativeRecords.map(rep => `
      <label class="representative-check-item" data-representative-name="${escapeHtml(String(rep.full_name || '').toLowerCase())}">
        <input class="representative-check-input" type="checkbox" value="${escapeHtml(rep.id)}" ${currentIds.has(rep.id) ? "checked" : ""}>
        <span class="representative-check-name">${escapeHtml(rep.full_name)}</span>
      </label>`).join("")
    : '<div class="representatives-checklist-empty">لا يوجد مندوبون متاحون.</div>';
  filterAllowedRepresentativesList();
  updateAllowedRepresentativesCount();
}

function filterAllowedRepresentativesList() {
  const query = (document.getElementById("userAllowedRepresentativesSearch")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#userAllowedRepresentativesList .representative-check-item").forEach(item => {
    item.classList.toggle("hidden", Boolean(query) && !String(item.dataset.representativeName || "").includes(query));
  });
}

function setAllowedRepresentativesSelection(mode) {
  const linkedRepresentativeId = document.getElementById("userRepresentative")?.value || "";
  document.querySelectorAll('#userAllowedRepresentativesList input[type="checkbox"]').forEach(input => {
    if (mode === "all") input.checked = true;
    else if (mode === "none") input.checked = false;
    else input.checked = Boolean(linkedRepresentativeId) && input.value === linkedRepresentativeId;
  });
  updateAllowedRepresentativesCount();
}

function populateSecurityOptions() {
  const roles = (window.CustomerPermissions?.roleOptions || []).map(role => ({ label: roleLabel(role), value: role }));
  replaceSelectOptions(document.getElementById("userRole"), roles);
  replaceSelectOptions(document.getElementById("usersRoleFilter"), roles, "كل الأدوار", document.getElementById("usersRoleFilter")?.value || "");
  replaceSelectOptions(document.getElementById("permissionsRoleSelect"), roles, null, document.getElementById("permissionsRoleSelect")?.value || "sales_manager");
  replaceSelectOptions(
    document.getElementById("userRepresentative"),
    representativeRecords.map(rep => ({ label: rep.full_name, value: rep.id })),
    "بدون ربط",
    document.getElementById("userRepresentative")?.value || ""
  );
  replaceSelectOptions(
    document.getElementById("userInstallationTeam"),
    installationTeamRecords.map(team => ({ label: team.name, value: team.id })),
    "اختر الفرقة",
    document.getElementById("userInstallationTeam")?.value || ""
  );
  renderAllowedRepresentativesChecklist();
  renderInstallationRepresentativesChecklist();
}

async function loadUsersFromSupabase(force = false) {
  if (usersLoading || (usersLoaded && !force) || !window.UsersService) return;
  usersLoading = true;
  showDataStatus("usersStatus", "جاري تحميل المستخدمين...", "info");
  try {
    [userRecords, installationTeamRecords] = await Promise.all([
      window.UsersService.listUsers(),
      window.UsersService.listInstallationTeams()
    ]);
    populateSecurityOptions();
    usersLoaded = true;
    showDataStatus("usersStatus", "");
    renderUsers();
  } catch (error) {
    showDataStatus("usersStatus", error.message || "تعذر تحميل المستخدمين.", "error");
  } finally {
    usersLoading = false;
  }
}

function renderUsers() {
  const body = document.getElementById("usersTableBody");
  if (!body) return;
  const search = (document.getElementById("usersSearch")?.value || "").trim().toLowerCase();
  const role = document.getElementById("usersRoleFilter")?.value || "";
  const status = document.getElementById("usersStatusFilter")?.value || "";
  const rows = userRecords.filter(user => {
    const matchesText = !search || `${user.full_name || ""} ${user.email || ""}`.toLowerCase().includes(search);
    const matchesRole = !role || user.role === role;
    const matchesStatus = !status || (status === "active" ? user.is_active : !user.is_active);
    return matchesText && matchesRole && matchesStatus;
  });

  body.innerHTML = rows.length ? rows.map(user => `
    <tr>
      <td><strong>${escapeHtml(user.full_name || "بدون اسم")}</strong></td>
      <td>${escapeHtml(user.email || "—")}</td>
      <td><span class="badge">${escapeHtml(roleLabel(user.role))}</span></td>
      <td>${escapeHtml(user.representative?.full_name || "—")}</td>
      <td><span class="data-access-badge" title="${escapeHtml(dataAccessLabel(user))}">${escapeHtml(dataAccessLabel(user))}</span></td>
      <td><span class="record-status ${user.is_active ? "active" : "inactive"}">${user.is_active ? "نشط" : "غير نشط"}</span></td>
      <td>${user.last_login_at ? new Date(user.last_login_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn") : "لم يسجل الدخول"}</td>
      <td><div class="row-actions"><button class="edit-btn" data-edit-user="${user.id}">تعديل</button><button class="secondary-btn compact-btn" data-reset-password="${user.id}">كلمة مرور مؤقتة</button></div></td>
    </tr>`).join("") : `<tr><td colspan="8" class="empty-state">لا توجد نتائج.</td></tr>`;
}

function syncInstallationTechnicianBindingFields() {
  const isTeamOperatorRole = (document.getElementById("userRole")?.value || "") === "viewer";
  const shell = document.getElementById("userInstallationTechnicianBinding");
  shell?.classList.toggle("hidden", !isTeamOperatorRole);

  const representativeField = document.getElementById("userRepresentative")?.closest("label");
  representativeField?.classList.toggle("hidden", isTeamOperatorRole);

  const dataAccessField = document.getElementById("userDataAccessMode")?.closest("label");
  dataAccessField?.classList.toggle("hidden", isTeamOperatorRole);
  document.getElementById("userAllowedRepresentativesLabel")?.classList.toggle("hidden", isTeamOperatorRole || (document.getElementById("userDataAccessMode")?.value || "") !== "selected");

  const installationAccessField = document.getElementById("userInstallationAccessMode")?.closest("label");
  installationAccessField?.classList.toggle("hidden", isTeamOperatorRole);
  document.getElementById("userInstallationRepresentativesLabel")?.classList.toggle("hidden", isTeamOperatorRole || (document.getElementById("userInstallationAccessMode")?.value || "") !== "selected");

  const team = document.getElementById("userInstallationTeam");
  if (team) team.required = isTeamOperatorRole;

  if (isTeamOperatorRole) {
    if (document.getElementById("userRepresentative")) document.getElementById("userRepresentative").value = "";
    if (document.getElementById("userDataAccessMode")) document.getElementById("userDataAccessMode").value = "selected";
    if (document.getElementById("userInstallationAccessMode")) document.getElementById("userInstallationAccessMode").value = "own";
    document.querySelectorAll('#userAllowedRepresentativesList input[type="checkbox"], #userInstallationRepresentativesList input[type="checkbox"]').forEach(input => { input.checked = false; });
  }
}

function openUserDialog(user = null) {
  const action = user ? "edit" : "add";
  if (!requireScreenAction("users", action, `لا توجد صلاحية ${user ? "تعديل" : "إضافة"} المستخدمين.`)) return;
  editingUserId = user?.id || null;
  document.getElementById("userDialogTitle").textContent = user ? "تعديل المستخدم" : "إضافة مستخدم";
  document.getElementById("userFullName").value = user?.full_name || "";
  document.getElementById("userEmail").value = user?.email || "";
  document.getElementById("userEmail").disabled = Boolean(user);
  document.getElementById("userPassword").value = "";
  document.getElementById("userPassword").required = !user;
  document.getElementById("userPasswordLabel").classList.toggle("hidden", Boolean(user));
  document.getElementById("userRole").value = user?.role || "viewer";
  document.getElementById("userInstallationTeam").value = user?.installation_technician_binding?.installation_team_id || "";
  document.getElementById("userInstallationTechnicianName").value = user?.installation_technician_binding?.technician_name || user?.full_name || "";
  syncInstallationTechnicianBindingFields();
  document.getElementById("userRepresentative").value = user?.representative_id || "";
  document.getElementById("userDataAccessMode").value = user?.data_access_mode || (user?.representative_id ? "own" : "selected");
  const allowedIds = new Set((user?.data_access_representatives || []).map(item => item.id));
  document.getElementById("userAllowedRepresentativesSearch").value = "";
  renderAllowedRepresentativesChecklist(allowedIds);
  syncUserDataAccessFields();
  document.getElementById("userInstallationAccessMode").value = user?.installation_access_mode || (user?.role === "super_admin" ? "all" : "own");
  const installationAllowedIds = new Set((user?.installation_access_representatives || []).map(item => item.id));
  document.getElementById("userInstallationRepresentativesSearch").value = "";
  renderInstallationRepresentativesChecklist(installationAllowedIds);
  syncUserInstallationAccessFields();
  document.getElementById("userActive").value = String(user?.is_active ?? true);
  document.getElementById("userMustChangePassword").value = String(user?.must_change_password ?? true);
  document.getElementById("userDefaultLanguage").value = user?.default_language === "en" ? "en" : "ar";
  document.getElementById("userDialog").showModal();
}

function closeUserDialog() {
  document.getElementById("userDialog").close();
  document.getElementById("userForm").reset();
  document.getElementById("userEmail").disabled = false;
  editingUserId = null;
}

async function saveUserForm(event) {
  const action = editingUserId ? "edit" : "add";
  if (!requireScreenAction("users", action, "لا توجد صلاحية حفظ المستخدمين.")) return;
  event.preventDefault();
  const button = event.submitter;
  try {
    if (button) { button.disabled = true; button.textContent = "جاري الحفظ..."; }
    const payload = {
      id: editingUserId,
      fullName: document.getElementById("userFullName").value,
      email: document.getElementById("userEmail").value,
      password: document.getElementById("userPassword").value,
      role: document.getElementById("userRole").value,
      representativeId: document.getElementById("userRole").value === "viewer" ? null : (document.getElementById("userRepresentative").value || null),
      accessMode: document.getElementById("userRole").value === "viewer" ? "selected" : document.getElementById("userDataAccessMode").value,
      allowedRepresentativeIds: document.getElementById("userRole").value === "viewer" ? [] : selectedAllowedRepresentativeIds(),
      installationAccessMode: document.getElementById("userRole").value === "viewer" ? "own" : document.getElementById("userInstallationAccessMode").value,
      allowedInstallationRepresentativeIds: document.getElementById("userRole").value === "viewer" ? [] : selectedInstallationRepresentativeIds(),
      installationTeamId: document.getElementById("userInstallationTeam").value || null,
      installationTechnicianName: document.getElementById("userRole").value === "viewer" ? document.getElementById("userFullName").value.trim() : document.getElementById("userInstallationTechnicianName").value.trim(),
      isActive: document.getElementById("userActive").value === "true",
      mustChangePassword: document.getElementById("userMustChangePassword").value === "true",
      defaultLanguage: document.getElementById("userDefaultLanguage").value === "en" ? "en" : "ar"
    };
    if (payload.role !== "viewer" && payload.accessMode === "selected" && !payload.representativeId && payload.allowedRepresentativeIds.length === 0) {
      throw new Error("اختر مندوبًا مرتبطًا أو مندوبًا واحدًا على الأقل ضمن نطاق البيانات.");
    }
    if (payload.role !== "viewer" && payload.installationAccessMode === "selected" && !payload.representativeId && payload.allowedInstallationRepresentativeIds.length === 0) {
      throw new Error("اختر مندوبًا مرتبطًا أو مندوب مواعيد واحدًا على الأقل.");
    }
    if (payload.role === "viewer" && !payload.installationTeamId) {
      throw new Error("اختر فرقة المواعيد المرتبطة بالجرومر / السائق.");
    }
    if (editingUserId) await window.UsersService.updateUser(payload);
    else await window.UsersService.createUser(payload);
    closeUserDialog();
    usersLoaded = false;
    await loadUsersFromSupabase(true);
  } catch (error) {
    alert(error.message || "تعذر حفظ المستخدم.");
  } finally {
    if (button) { button.disabled = false; button.textContent = "حفظ المستخدم"; }
  }
}

async function resetUserPassword(userId) {
  if (!requireScreenAction("users", "edit", "لا توجد صلاحية إعادة تعيين كلمات المرور.")) return;
  const password = prompt("أدخل كلمة مرور مؤقتة من 8 أحرف على الأقل:");
  if (!password) return;
  if (password.length < 8) return alert("كلمة المرور قصيرة.");
  try {
    await window.UsersService.resetPassword(userId, password);
    alert("تم تحديث كلمة المرور المؤقتة.");
  } catch (error) {
    alert(error.message || "تعذر إعادة تعيين كلمة المرور.");
  }
}

async function loadPermissionsMatrix(force = false) {
  if (permissionsLoaded && !force) return;
  showDataStatus("permissionsStatus", "جاري تحميل الصلاحيات...", "info");
  try {
    permissionScreens = await window.PermissionsService.listScreens();
    permissionsLoaded = true;
    await loadRolePermissions(document.getElementById("permissionsRoleSelect")?.value || "sales_manager");
    showDataStatus("permissionsStatus", "");
  } catch (error) {
    showDataStatus("permissionsStatus", error.message || "تعذر تحميل الصلاحيات.", "error");
  }
}

async function loadRolePermissions(role) {
  rolePermissionRows = await window.PermissionsService.getRolePermissions(role);
  renderPermissionsMatrix(role);
}

function renderPermissionsMatrix(role) {
  const container = document.getElementById("permissionsMatrix");
  if (!container) return;
  const map = new Map(rolePermissionRows.map(row => [row.screen_key, row]));
  const groups = [...new Set(permissionScreens.map(screen => screen.group_name))];
  container.innerHTML = groups.map(group => `
    <section class="permission-group"><h4>${escapeHtml(group)}</h4><div class="permission-table">
      <div class="permission-row permission-header"><strong>الشاشة</strong><span>عرض</span><span>إضافة</span><span>تعديل</span><span>حذف</span><span>تصدير</span></div>
      ${permissionScreens.filter(screen => screen.group_name === group).map(screen => {
        const row = map.get(screen.screen_key) || {};
        return `<div class="permission-row" data-screen-key="${screen.screen_key}"><strong>${escapeHtml(screen.screen_name)}</strong>${
          ["can_view","can_add","can_edit","can_delete","can_export"].map(key =>
            `<input type="checkbox" data-permission="${key}" ${(role === "super_admin" || row[key]) ? "checked" : ""} ${role === "super_admin" ? "disabled" : ""}>`
          ).join("")
        }</div>`;
      }).join("")}
    </div></section>`).join("");
}

async function savePermissions() {
  if (!requireScreenAction("permissions", "edit", "لا توجد صلاحية تعديل الصلاحيات.")) return;
  const role = document.getElementById("permissionsRoleSelect").value;
  if (role === "super_admin") return alert("مدير النظام يمتلك كل الصلاحيات تلقائيًا.");
  const rows = [...document.querySelectorAll(".permission-row[data-screen-key]")].map(row => ({
    screenKey: row.dataset.screenKey,
    canView: row.querySelector('[data-permission="can_view"]').checked,
    canAdd: row.querySelector('[data-permission="can_add"]').checked,
    canEdit: row.querySelector('[data-permission="can_edit"]').checked,
    canDelete: row.querySelector('[data-permission="can_delete"]').checked,
    canExport: row.querySelector('[data-permission="can_export"]').checked
  }));
  try {
    rolePermissionRows = await window.PermissionsService.saveRolePermissions(role, rows);
    renderPermissionsMatrix(role);
    if (window.CustomerPermissions?.currentRole?.() === role) {
      await window.CustomerPermissions.loadCurrentPermissions();
      if (window.PermissionEngine?.refresh) {
        window.PermissionEngine.refresh({ validateCurrentView: true });
      } else {
        window.CustomerPermissions.applyScreenVisibility();
        window.CustomerPermissions.applyActionVisibility();
      }
    }
    showDataStatus("permissionsStatus", "تم حفظ الصلاحيات والتحقق منها بنجاح.", "success");
  } catch (error) {
    showDataStatus("permissionsStatus", error.message || "تعذر حفظ الصلاحيات.", "error");
  }
}

async function loadActivity(force = false) {
  if (activityLoaded && !force) return;
  showDataStatus("activityStatus", "جاري تحميل سجل النشاط...", "info");
  try {
    activityRecords = await window.ActivityService.listActivity();
    activityLoaded = true;
    showDataStatus("activityStatus", "");
    renderActivity();
  } catch (error) {
    showDataStatus("activityStatus", error.message || "تعذر تحميل سجل النشاط.", "error");
  }
}

function renderActivity() {
  const body = document.getElementById("activityTableBody");
  if (!body) return;
  const search = (document.getElementById("activitySearch")?.value || "").toLowerCase();
  const action = document.getElementById("activityActionFilter")?.value || "";
  const rows = activityRecords.filter(item => {
    const text = `${item.user?.full_name || ""} ${item.user?.email || ""} ${item.action} ${item.entity_type} ${JSON.stringify(item.new_data || {})}`.toLowerCase();
    return (!search || text.includes(search)) && (!action || item.action === action);
  });
  body.innerHTML = rows.length ? rows.map(item => `<tr><td>${escapeHtml(item.user?.full_name || item.user?.email || "مستخدم محذوف")}</td><td><span class="badge">${escapeHtml(item.action)}</span></td><td>${escapeHtml(item.entity_type)}</td><td class="activity-details">${escapeHtml(JSON.stringify(item.new_data || {}))}</td><td>${new Date(item.created_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn")}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-state">لا توجد عمليات مطابقة.</td></tr>`;
}

function canScreenAction(screenKey, action = "view") {
  return window.PermissionEngine?.can?.(screenKey, action)
    ?? window.CustomerPermissions?.canScreen?.(screenKey, action)
    ?? false;
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function backupOperationLabel(value) {
  return value === "export" ? "تصدير" : value === "restore" ? "استعادة" : value;
}

async function exportBackup() {
  if (!requireScreenAction("backups", "export", "لا توجد صلاحية تصدير النسخ الاحتياطية.")) return;

  const buttons = [
    document.getElementById("createBackupBtn"),
    document.getElementById("downloadBackupBtn")
  ].filter(Boolean);

  buttons.forEach(button => {
    button.disabled = true;
    button.textContent = "جاري تجهيز النسخة...";
  });

  showDataStatus("backupStatus", "جاري تجميع بيانات النظام...", "info");

  try {
    const result = await window.BackupService.createBackup();
    downloadJsonFile(result.file_name, result.backup);
    showDataStatus(
      "backupStatus",
      `تم إنشاء النسخة وتنزيلها بنجاح — ${result.total_records} سجل.`,
      "success"
    );
    backupHistoryLoaded = false;
    await loadBackupHistory(true);
  } catch (error) {
    showDataStatus("backupStatus", error.message || "تعذر إنشاء النسخة.", "error");
  } finally {
    buttons.forEach((button, index) => {
      button.disabled = false;
      button.textContent = index === 0 ? "إنشاء نسخة احتياطية" : "تصدير وتنزيل";
    });
  }
}

async function inspectBackupFile(file) {
  selectedBackupPayload = null;
  document.getElementById("restoreBackupBtn").disabled = true;

  if (!file) {
    document.getElementById("backupInspectionPanel").classList.add("hidden");
    return;
  }

  showDataStatus("backupStatus", "جاري قراءة وفحص ملف النسخة...", "info");

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const result = await window.BackupService.validateBackup(payload);

    selectedBackupPayload = payload;
    document.getElementById("restoreBackupBtn").disabled = !canScreenAction("backups", "edit");
    document.getElementById("backupInspectionPanel").classList.remove("hidden");
    document.getElementById("backupInspectionSummary").textContent =
      `الملف صالح — الإصدار ${result.version} — إجمالي ${result.total_records} سجل.`;

    document.getElementById("backupTableCounts").innerHTML =
      Object.entries(result.table_counts)
        .map(([table, count]) => `
          <article><span>${escapeHtml(table)}</span><strong>${count}</strong></article>
        `).join("");

    showDataStatus("backupStatus", "تم التحقق من ملف النسخة بنجاح.", "success");
  } catch (error) {
    document.getElementById("backupInspectionPanel").classList.add("hidden");
    showDataStatus("backupStatus", error.message || "ملف النسخة غير صالح.", "error");
  }
}

async function restoreSelectedBackup() {
  if (!selectedBackupPayload) {
    alert("اختر ملف نسخة احتياطية صالحًا أولًا.");
    return;
  }

  const phrase = prompt('اكتب العبارة التالية للتأكيد:\nRESTORE PETATOE DATA');
  if (phrase !== "RESTORE PETATOE DATA") {
    alert("لم يتم تنفيذ الاستعادة لأن عبارة التأكيد غير مطابقة.");
    return;
  }

  if (!confirm("سيتم استبدال البيانات التشغيلية الحالية ببيانات النسخة. هل تريد المتابعة؟")) {
    return;
  }

  const button = document.getElementById("restoreBackupBtn");
  button.disabled = true;
  button.textContent = "جاري الاستعادة...";
  showDataStatus("backupStatus", "جاري استعادة البيانات. لا تغلق الصفحة...", "info");

  try {
    const result = await window.BackupService.restoreBackup(
      selectedBackupPayload,
      phrase
    );

    showDataStatus(
      "backupStatus",
      `تمت الاستعادة بنجاح — ${result.total_records} سجل.`,
      "success"
    );

    customersLoaded = false;
    followupsLoaded = false;
    quotationsLoaded = false;
    referenceDataLoaded = false;
    usersLoaded = false;
    backupHistoryLoaded = false;

    await loadReferenceDataFromSupabase(true);
    await loadCustomersFromSupabase(true);
    await loadFollowupsFromSupabase(true);
    await loadQuotationsFromSupabase(true);
    await loadUsersFromSupabase(true);
    await loadBackupHistory(true);
  } catch (error) {
    showDataStatus("backupStatus", error.message || "فشلت استعادة النسخة.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "استعادة النسخة";
  }
}

async function loadBackupHistory(force = false) {
  if (backupHistoryLoaded && !force) return;
  if (!window.BackupService) return;

  try {
    backupHistoryRecords = await window.BackupService.listHistory();
    backupHistoryLoaded = true;
    renderBackupHistory();
  } catch (error) {
    showDataStatus("backupStatus", error.message || "تعذر تحميل سجل النسخ.", "error");
  }
}

function renderBackupHistory() {
  const body = document.getElementById("backupHistoryBody");
  if (!body) return;

  body.innerHTML = backupHistoryRecords.length
    ? backupHistoryRecords.map(item => `
      <tr>
        <td><span class="badge">${escapeHtml(backupOperationLabel(item.operation_type))}</span></td>
        <td>${escapeHtml(item.file_name || "—")}</td>
        <td>${Number(item.total_records || 0)}</td>
        <td>${escapeHtml(item.user?.full_name || item.user?.email || "—")}</td>
        <td><span class="record-status ${item.status === "completed" ? "active" : "inactive"}">${escapeHtml(quotationStatusLabel(canonicalStatus))}</span></td>
        <td>${new Date(item.created_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty-state">لا توجد عمليات نسخ أو استعادة مسجلة.</td></tr>`;
}

async function loadSystemSettings(force = false) {
  if (systemSettingsLoaded && !force) return;
  if (!window.SystemSettingsService) return;

  showDataStatus("systemSettingsStatus", "جاري تحميل الإعدادات...", "info");

  try {
    const settings = await window.SystemSettingsService.loadSettings();

    document.getElementById("companyNameAr").value = settings.company_name_ar || "شركة كيوم للتجارة";
    document.getElementById("companyNameEn").value = settings.company_name_en || "PETATOE";
    document.getElementById("companyEmail").value = settings.company_email || "";
    document.getElementById("companyPhone").value = settings.company_phone || "";
    document.getElementById("companyAddress").value = settings.company_address || "";
    document.getElementById("systemCurrency").value = settings.currency || "SAR";
    document.getElementById("systemTimezone").value = settings.timezone || "Asia/Riyadh";
    document.getElementById("systemPageSize").value = settings.page_size || "10";
    document.getElementById("systemSessionTimeout").value =
      settings.session_timeout_minutes || "480";

    systemSettingsLoaded = true;
    showDataStatus("systemSettingsStatus", "");
  } catch (error) {
    showDataStatus(
      "systemSettingsStatus",
      error.message || "تعذر تحميل إعدادات النظام.",
      "error"
    );
  }
}

async function saveSystemSettings(event) {
  event?.preventDefault();

  if (!requireScreenAction("systemSettings", "edit", "لا توجد صلاحية تعديل إعدادات النظام.")) return;

  const button = document.getElementById("saveSystemSettingsBtn");
  button.disabled = true;
  button.textContent = "جاري الحفظ...";

  try {
    const settings = {
      company_name_ar: document.getElementById("companyNameAr").value.trim(),
      company_name_en: document.getElementById("companyNameEn").value.trim(),
      company_email: document.getElementById("companyEmail").value.trim(),
      company_phone: document.getElementById("companyPhone").value.trim(),
      company_address: document.getElementById("companyAddress").value.trim(),
      currency: document.getElementById("systemCurrency").value,
      timezone: document.getElementById("systemTimezone").value,
      page_size: document.getElementById("systemPageSize").value,
      session_timeout_minutes: document.getElementById("systemSessionTimeout").value
    };

    await window.SystemSettingsService.saveSettings(settings);
    showDataStatus("systemSettingsStatus", "تم حفظ إعدادات النظام بنجاح.", "success");

    const brand = document.querySelector(".sidebar-brand strong");
    if (brand && settings.company_name_en) brand.textContent = settings.company_name_en;
  } catch (error) {
    showDataStatus(
      "systemSettingsStatus",
      error.message || "تعذر حفظ إعدادات النظام.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "حفظ الإعدادات";
  }
}

function formatDuration(milliseconds) {
  const ms = Math.max(0, Number(milliseconds || 0));
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes} د ${seconds} ث`;
}

function shortRequestName(url) {
  try {
    const parsed = new URL(url, location.origin);
    return `${parsed.pathname}${parsed.search}`.slice(0, 100);
  } catch {
    return String(url || "unknown").slice(0, 100);
  }
}

function renderPerformanceMonitor() {
  const summary = window.PerformanceMonitor?.summarize?.();
  if (!summary) return;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText(
    "performancePageLoad",
    summary.navigation.pageLoadMs
      ? formatDuration(summary.navigation.pageLoadMs)
      : "غير متاح"
  );
  setText(
    "performanceDomReady",
    `DOM: ${
      summary.navigation.domReadyMs
        ? formatDuration(summary.navigation.domReadyMs)
        : "غير متاح"
    }`
  );
  setText("performanceApiRequests", String(summary.requestsTotal));
  setText("performanceFailedRequests", `الفاشلة: ${summary.failedRequests}`);
  setText(
    "performanceAverageResponse",
    summary.requestsTotal
      ? formatDuration(summary.averageResponseMs)
      : "لا توجد طلبات"
  );
  setText(
    "performanceSlowestResponse",
    `الأبطأ: ${
      summary.slowestResponseMs
        ? formatDuration(summary.slowestResponseMs)
        : "—"
    }`
  );

  setText(
    "performanceNetworkStatus",
    summary.network.online ? "Online" : "Offline"
  );

  const connectionDetails = [
    summary.network.effectiveType !== "unknown"
      ? summary.network.effectiveType
      : null,
    summary.network.downlinkMbps
      ? `${summary.network.downlinkMbps} Mbps`
      : null,
    summary.network.rttMs
      ? `RTT ${summary.network.rttMs} ms`
      : null
  ].filter(Boolean).join(" — ");

  setText(
    "performanceConnectionType",
    `الاتصال: ${connectionDetails || "غير متاح"}`
  );

  if (summary.memory) {
    setText(
      "performanceMemoryUsage",
      `${formatBytes(summary.memory.usedBytes)} مستخدم`
    );
    setText(
      "performanceMemoryLimit",
      `الحد: ${formatBytes(summary.memory.limitBytes)}`
    );
  } else {
    setText("performanceMemoryUsage", "غير مدعوم");
    setText("performanceMemoryLimit", "الحد: غير متاح");
  }

  setText(
    "performanceLastUpdated",
    new Date(summary.lastUpdatedAt).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn")
  );
  setText(
    "performanceSessionDuration",
    `مدة الجلسة: ${formatDuration(summary.sessionDurationMs)}`
  );

  const slowRequests = document.getElementById("performanceSlowRequests");
  if (slowRequests) {
    slowRequests.innerHTML = summary.slowestRequests.length
      ? summary.slowestRequests.map(item => `
        <div class="performance-request-item">
          <div>
            <strong>${escapeHtml(item.method)} ${escapeHtml(shortRequestName(item.url))}</strong>
            <small>${item.status || "Network Error"} — ${new Date(item.timestamp).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn")}</small>
          </div>
          <b class="${item.ok ? "" : "performance-failed"}">${formatDuration(item.durationMs)}</b>
        </div>
      `).join("")
      : '<div class="empty-state">لا توجد طلبات API مسجلة في الجلسة الحالية.</div>';
  }

  const renderList = document.getElementById("performanceScreenRenders");
  if (renderList) {
    renderList.innerHTML = summary.screenRenders.length
      ? summary.screenRenders.map(item => `
        <div class="performance-request-item">
          <div>
            <strong>${escapeHtml(pageMeta[item.screen]?.[0] || item.screen)}</strong>
            <small>${item.count} عملية عرض — الحد الأقصى ${formatDuration(item.maxMs)}</small>
          </div>
          <b>${formatDuration(item.averageMs)}</b>
        </div>
      `).join("")
      : '<div class="empty-state">لا توجد قياسات عرض شاشات بعد.</div>';
  }
}

function healthStatusItem(label, value, ok = true, detail = "") {
  return `<div class="health-list-item"><span class="health-indicator ${ok ? "ok" : "warn"}"></span><div><strong>${escapeHtml(label)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div><b>${escapeHtml(String(value))}</b></div>`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function calculateHealthScore(snapshot) {
  const performanceSummary = window.PerformanceMonitor?.summarize?.() || {};
  const evaluation = window.HealthAlertsEngine?.evaluate?.(
    snapshot,
    performanceSummary
  );
  return evaluation?.score ?? 0;
}

async function loadSystemHealth(force = false) {
  if (systemHealthLoading || (!force && systemHealthSnapshot)) return;
  if (!window.SystemHealthService) return;
  if (!canScreenAction("systemHealth", "view")) {
    showDataStatus("systemHealthStatus", "لا توجد صلاحية عرض مراقبة النظام.", "error");
    return;
  }

  systemHealthLoading = true;
  showDataStatus("systemHealthStatus", "جاري تنفيذ الفحص الصحي...", "info");
  try {
    systemHealthSnapshot = await window.SystemHealthService.getSnapshot();
    renderSystemHealth();
    showDataStatus("systemHealthStatus", "");
  } catch (error) {
    showDataStatus("systemHealthStatus", error.message || "تعذر تنفيذ فحص النظام.", "error");
  } finally {
    systemHealthLoading = false;
  }
}

function renderSystemHealth() {
  const s = systemHealthSnapshot;
  if (!s) return;

  const performanceSummary = window.PerformanceMonitor?.summarize?.() || {};
  const healthEvaluation = window.HealthAlertsEngine?.evaluate?.(
    s,
    performanceSummary
  );

  const score = healthEvaluation?.score ?? calculateHealthScore(s);
  const label = healthEvaluation?.level?.arabic
    || (score >= 90 ? "ممتاز" : score >= 75 ? "جيد" : score >= 60 ? "يحتاج متابعة" : "حرج");
  document.getElementById("healthScoreValue").textContent = `${score}%`;
  document.getElementById("healthScoreRing").style.setProperty("--health-score", `${score * 3.6}deg`);
  document.getElementById("healthOverallLabel").textContent = `حالة النظام: ${label}`;
  document.getElementById("healthLastChecked").textContent = `آخر فحص: ${new Date().toLocaleString("ar-SA-u-ca-gregory-nu-latn")}`;
  document.getElementById("healthDatabaseStatus").textContent = s.database_online ? "متصل" : "غير متصل";
  document.getElementById("healthDatabaseLatency").textContent = `زمن الاستجابة: ${s.latency_ms} ms`;
  document.getElementById("healthUsersTotal").textContent = Number(s.users_total || 0);
  document.getElementById("healthUsersActive").textContent = `النشطون: ${Number(s.users_active || 0)}`;
  document.getElementById("healthRlsCoverage").textContent = `${Number(s.security?.rls_coverage_percent || 0)}%`;
  document.getElementById("healthPoliciesCount").textContent = `السياسات: ${Number(s.security?.policies_count || 0)}`;

  document.getElementById("healthServicesList").innerHTML = [
    healthStatusItem("Supabase Database", s.database_online ? "Online" : "Offline", s.database_online, `${s.latency_ms} ms`),
    healthStatusItem("backup-admin", "Configured", true, "Export / Validate / Restore"),
    healthStatusItem("manage-user", "Configured", true, "User administration"),
    healthStatusItem("GitHub Pages", navigator.onLine ? "Online" : "Offline", navigator.onLine, location.hostname)
  ].join("");

  document.getElementById("healthDatabaseMetrics").innerHTML = [
    ["الجداول", s.tables_count], ["إجمالي الصفوف", s.rows_total], ["حجم البيانات", formatBytes(s.database_size_bytes)], ["الفهارس", s.indexes_count]
  ].map(([a,b]) => `<article><span>${a}</span><strong>${b}</strong></article>`).join("");

  document.getElementById("healthSecurityList").innerHTML = [
    healthStatusItem("Row Level Security", `${s.security.rls_enabled_tables}/${s.security.public_tables}`, s.security.rls_coverage_percent === 100),
    healthStatusItem("Database Policies", s.security.policies_count, s.security.policies_count > 0),
    healthStatusItem("Edge Authentication", "Enabled", true, "Custom JWT verification"),
    healthStatusItem("Active Super Admin", s.super_admins, s.super_admins > 0)
  ].join("");

  document.getElementById("healthVersionMetrics").innerHTML = [
    ["النظام", "PETATOE"], ["الإصدار", s.version || "1.0"], ["البيئة", "Production"], ["وقت الخادم", new Date(s.server_time).toLocaleString("ar-SA-u-ca-gregory-nu-latn")]
  ].map(([a,b]) => `<article><span>${a}</span><strong>${escapeHtml(String(b))}</strong></article>`).join("");

  document.getElementById("healthTablesBody").innerHTML = (s.tables || []).map(t => `<tr><td><strong>${escapeHtml(t.table_name)}</strong></td><td>${Number(t.row_count || 0)}</td><td>${formatBytes(t.total_bytes)}</td><td>${t.rls_enabled ? '<span class="record-status active">مفعّل</span>' : '<span class="record-status inactive">غير مفعّل</span>'}</td><td>${Number(t.policies_count || 0)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">لا توجد بيانات.</td></tr>';

  document.getElementById("healthBackupsList").innerHTML = (s.recent_backups || []).map(b => healthStatusItem(
    b.operation_type === "restore" ? "استعادة" : "تصدير",
    b.status,
    b.status === "completed",
    `${b.total_records || 0} سجل — ${new Date(b.created_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn")}`
  )).join("") || '<div class="empty-state">لا توجد عمليات نسخ مسجلة.</div>';

  document.getElementById("healthAlertsList").innerHTML = (s.alerts || []).map(a => healthStatusItem(
    a.title || "تنبيه",
    a.severity || "warning",
    false,
    a.detail || ""
  )).join("") || healthStatusItem("لا توجد تنبيهات حرجة", "سليم", true, "آخر 24 ساعة");

  renderSmartHealthInsights(healthEvaluation);
  renderPerformanceMonitor();
}

function reportCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    currencyDisplay: "code",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function reportFilterValues() {
  return {
    from: document.getElementById("reportsDateFrom")?.value || "",
    to: document.getElementById("reportsDateTo")?.value || "",
    representative: document.getElementById("reportsRepresentativeFilter")?.value || "",
    target: Number(document.getElementById("reportsSalesTarget")?.value || 0)
  };
}

function populateReportsRepresentativeFilter() {
  const select = document.getElementById("reportsRepresentativeFilter");
  if (!select) return;

  const selected = select.value;
  const names = [...new Set([
    ...customers.map(item => item.representative),
    ...followups.map(item => item.representative),
    ...quotations.map(item => item.representative)
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));

  replaceSelectOptions(
    select,
    names.map(name => ({ label: name, value: name })),
    "كل المندوبين",
    selected
  );
}

async function ensureReportsData() {
  showDataStatus("reportsStatus", "جاري تحديث بيانات التقارير...", "info");
  try {
    await Promise.all([
      loadReferenceDataFromSupabase(),
      loadCustomersFromSupabase(),
      loadFollowupsFromSupabase(),
      loadQuotationsFromSupabase()
    ]);
    populateReportsRepresentativeFilter();
    showDataStatus("reportsStatus", "");
  } catch (error) {
    showDataStatus(
      "reportsStatus",
      error instanceof Error ? error.message : "تعذر تحميل بيانات التقارير.",
      "error"
    );
  }
}

function analyticsLabel(type, key) {
  if (type === "activity") {
    const labels = {
      active_7_days: "نشط خلال 7 أيام",
      active_30_days: "نشط خلال 30 يومًا",
      inactive_30_days: "غير نشط أكثر من 30 يومًا",
      never_contacted: "لم يتم التواصل"
    };
    return labels[key] || key;
  }
  return key;
}

function renderAnalyticsBars(containerId, entries, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const rows = Object.entries(entries || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, options.limit || 10);

  const max = Math.max(1, ...rows.map(([, value]) => Number(value || 0)));

  container.innerHTML = rows.length
    ? rows.map(([label, value], index) => `
      <div class="analytics-bar-row">
        <div>
          <span>${index + 1}</span>
          <strong>${escapeHtml(options.labeler ? options.labeler(label) : label)}</strong>
        </div>
        <div class="analytics-bar-track">
          <span style="width:${Number(value || 0) / max * 100}%"></span>
        </div>
        <b>${Number(value || 0)}</b>
      </div>
    `).join("")
    : '<div class="empty-state">لا توجد بيانات داخل النطاق المحدد.</div>';
}

function renderCustomerAnalytics(report) {
  renderAnalyticsBars(
    "customerAnalyticsBreakdown",
    report.customerAnalytics?.[activeCustomerAnalyticsTab] || {},
    {
      labeler: label => analyticsLabel(activeCustomerAnalyticsTab, label)
    }
  );
}

function reportStatusColorClass(status) {
  if (status === "مقبول") return "accepted";
  if (status === "مرفوض" || status === "ملغي") return "rejected";
  return "pending";
}

function reportPeriodLabel(from, to) {
  if (!from || !to) return "كل الفترات";
  return `${formatDate(from)} — ${formatDate(to)}`;
}

function renderReportDelta(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  const numeric = Number(value || 0);
  const direction = numeric > 0 ? "positive" : numeric < 0 ? "negative" : "neutral";
  element.className = `kpi-delta ${direction}`;
  element.textContent = `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}%`;
}

function saveReportsTarget() {
  const value = Number(document.getElementById("reportsSalesTarget")?.value || 0);
  localStorage.setItem("kyum_reports_sales_target", String(Math.max(0, value)));
}

function renderReportsOverview() {
  if (!window.ReportsEngine) return;

  const report = window.ReportsEngine.build(
    { customers, followups, quotations },
    reportFilterValues()
  );
  currentReportsSnapshot = report;

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText("executiveCurrentPeriod", reportPeriodLabel(report.filters.from, report.filters.to));
  setText("executivePreviousPeriod", reportPeriodLabel(report.previousFilters.from, report.previousFilters.to));
  setText("executiveTargetAchievement", `${report.totals.targetAchievement.toFixed(1)}%`);

  setText("reportCustomersTotal", report.totals.customers);
  setText("reportCustomersNew", `الجدد: ${report.totals.newCustomers}`);
  setText("reportTodayFollowups", report.totals.todayFollowups);
  setText("reportFollowupsTotal", report.totals.followups);
  setText("reportFollowupsOverdue", `المتأخرة: ${report.totals.overdueFollowups}`);
  setText("reportCompletedFollowups", `المكتملة: ${report.totals.completedFollowups}`);
  setText("reportQuotationsTotal", report.totals.quotations);
  setText("reportQuotationsAccepted", `المقبولة: ${report.totals.acceptedQuotations}`);
  setText("reportQuotationsValue", reportCurrency(report.totals.quotationValue));
  setText("reportAcceptedValue", `المقبولة: ${reportCurrency(report.totals.acceptedValue)}`);
  setText("reportConversionRate", `${report.totals.conversionRate.toFixed(1)}%`);
  setText("reportTargetAchievement", `${report.totals.targetAchievement.toFixed(1)}%`);
  setText("reportTargetRemaining", `المتبقي: ${reportCurrency(report.totals.targetRemaining)}`);
  setText("reportCustomersWithoutFollowup", report.totals.customersWithoutFollowup);

  renderReportDelta("reportCustomersDelta", report.deltas.customers);
  renderReportDelta("reportTodayFollowupsDelta", report.deltas.todayFollowups);
  renderReportDelta("reportFollowupsDelta", report.deltas.followups);
  renderReportDelta("reportQuotationsDelta", report.deltas.quotations);
  renderReportDelta("reportQuotationValueDelta", report.deltas.quotationValue);
  renderReportDelta("reportConversionDelta", report.deltas.conversionRate);
  renderReportDelta("reportTargetDelta", report.deltas.targetAchievement);
  renderReportDelta("reportWithoutFollowupDelta", report.deltas.customersWithoutFollowup);

  const maxFunnel = Math.max(1, ...report.funnel.map(item => item.value));
  document.getElementById("reportsFunnel").innerHTML = report.funnel.map((item, index) => `
    <div class="executive-funnel-stage stage-${item.key}">
      <div class="executive-funnel-stage-head">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.arabic)}</small>
        </div>
        <b>${item.value}</b>
      </div>
      <div class="executive-funnel-bar">
        <span style="width:${Math.max(3, item.value / maxFunnel * 100)}%"></span>
      </div>
      <div class="executive-funnel-rates">
        <small>من المرحلة السابقة: ${item.stageConversion.toFixed(1)}%</small>
        <small>من إجمالي العملاء: ${item.totalConversion.toFixed(1)}%</small>
      </div>
    </div>
  `).join("");

  const won = report.funnel.find(item => item.key === "won");
  const lead = report.funnel.find(item => item.key === "lead");
  const negotiation = report.funnel.find(item => item.key === "negotiation");
  document.getElementById("executiveFunnelSummary").innerHTML = `
    <article>
      <span>Lead → Won</span>
      <strong>${lead?.value ? (won.value / lead.value * 100).toFixed(1) : "0.0"}%</strong>
    </article>
    <article>
      <span>تحت التفاوض</span>
      <strong>${negotiation?.value || 0}</strong>
    </article>
    <article>
      <span>صفقات ناجحة</span>
      <strong>${won?.value || 0}</strong>
    </article>
  `;

  const statusEntries = Object.entries(report.quotationStatuses)
    .sort((a, b) => b[1] - a[1]);
  const maxStatus = Math.max(1, ...statusEntries.map(([, value]) => value));

  document.getElementById("quotationStatusBreakdown").innerHTML = statusEntries.length
    ? statusEntries.map(([status, value]) => `
      <div class="report-status-row">
        <div>
          <span class="report-status-dot ${reportStatusColorClass(status)}"></span>
          <strong>${escapeHtml(status)}</strong>
        </div>
        <div class="report-status-track">
          <span class="${reportStatusColorClass(status)}" style="width:${value / maxStatus * 100}%"></span>
        </div>
        <b>${value}</b>
      </div>
    `).join("")
    : '<div class="empty-state">لا توجد عروض داخل النطاق المحدد.</div>';

  const maxMonthValue = Math.max(
    1,
    ...report.months.flatMap(item => [item.customers, item.followups, item.quotations])
  );

  document.getElementById("reportsMonthlyTrend").innerHTML = report.months.map(item => `
    <div class="monthly-column">
      <div class="monthly-bars">
        <span class="customers" style="height:${item.customers / maxMonthValue * 100}%" title="العملاء: ${item.customers}"></span>
        <span class="followups" style="height:${item.followups / maxMonthValue * 100}%" title="المتابعات: ${item.followups}"></span>
        <span class="quotations" style="height:${item.quotations / maxMonthValue * 100}%" title="العروض: ${item.quotations}"></span>
      </div>
      <small>${escapeHtml(item.label)}</small>
    </div>
  `).join("");

  const followupItems = [
    ["متأخرة", report.followupStates.overdue || 0, "critical"],
    ["اليوم", report.followupStates.today || 0, "warning"],
    ["قادمة", report.followupStates.upcoming || 0, "info"],
    ["مكتملة", report.followupStates.completed || 0, "healthy"],
    ["بدون موعد", report.followupStates.no_date || 0, "muted"]
  ];

  document.getElementById("followupReportSummary").innerHTML = followupItems.map(([label, value, type]) => `
    <article class="${type}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  renderCustomerAnalytics(report);

  setText("quotationAverageValue", reportCurrency(report.quotationAnalytics.averageValue));
  setText("quotationHighestValue", reportCurrency(report.quotationAnalytics.highestValue));
  setText("quotationLowestValue", reportCurrency(report.quotationAnalytics.lowestValue));
  setText("quotationOpenValue", reportCurrency(report.quotationAnalytics.openValue));
  setText("quotationRejectedValue", reportCurrency(report.quotationAnalytics.rejectedValue));
  setText("quotationRejectionRate", `${report.quotationAnalytics.rejectionRate.toFixed(1)}%`);

  renderAnalyticsBars(
    "lossReasonsAnalytics",
    report.lossReasons,
    { limit: 10 }
  );

  const topCustomers = document.getElementById("topCustomersByValue");
  topCustomers.innerHTML = report.topCustomersByValue.length
    ? report.topCustomersByValue.map((item, index) => `
      <article class="top-customer-item">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${item.quotations} عروض — ${item.accepted} مقبولة</small>
        </div>
        <b>${reportCurrency(item.totalValue)}</b>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد عروض أسعار داخل النطاق المحدد.</div>';

  const inactiveList = document.getElementById("inactiveCustomersList");
  inactiveList.innerHTML = report.inactiveCustomers.length
    ? report.inactiveCustomers.map(item => `
      <article class="customer-action-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.phone || "بدون جوال")} — ${escapeHtml(item.representative)}</small>
        </div>
        <span>${item.daysInactive} يوم</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا يوجد عملاء غير نشطين داخل النطاق المحدد.</div>';

  const needsFollowup = document.getElementById("customersNeedingFollowupList");
  needsFollowup.innerHTML = report.customersNeedingFollowup.length
    ? report.customersNeedingFollowup.map(item => `
      <article class="customer-action-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.phone || "بدون جوال")} — ${escapeHtml(item.representative)}</small>
        </div>
        <span class="${item.reason === "متابعة متأخرة" ? "critical" : "warning"}">${escapeHtml(item.reason)}</span>
      </article>
    `).join("")
    : '<div class="empty-state">كل العملاء لديهم متابعة سليمة.</div>';

  const leaderboard = document.getElementById("representativeLeaderboard");
  leaderboard.innerHTML = report.representativePerformance.length
    ? report.representativePerformance.slice(0, 8).map(item => `
      <article class="representative-rank-card rank-${item.rank}">
        <div class="rank-number">${item.rank}</div>
        <div class="rank-main">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${item.accepted} عروض مقبولة — ${reportCurrency(item.acceptedValue)}</small>
          <div class="rank-progress"><span style="width:${Math.min(100, item.activityScore)}%"></span></div>
        </div>
        <div class="rank-stats">
          <b>${item.conversion.toFixed(1)}%</b>
          <small>تحويل</small>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد بيانات مندوبي مبيعات.</div>';

  const comparison = document.getElementById("representativeComparison");
  comparison.innerHTML = report.representativePerformance.length
    ? report.representativePerformance.slice(0, 8).map(item => `
      <article class="representative-comparison-row">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>الفترة الحالية مقابل السابقة</small>
        </div>
        <div class="comparison-metric">
          <span>القيمة</span>
          <b class="${item.deltas.value >= 0 ? "positive" : "negative"}">${item.deltas.value >= 0 ? "+" : ""}${item.deltas.value.toFixed(1)}%</b>
        </div>
        <div class="comparison-metric">
          <span>التحويل</span>
          <b class="${item.deltas.conversion >= 0 ? "positive" : "negative"}">${item.deltas.conversion >= 0 ? "+" : ""}${item.deltas.conversion.toFixed(1)}%</b>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد بيانات مقارنة.</div>';

  const yearly = report.yearlyTrend || [];
  const maxCount = Math.max(
    1,
    ...yearly.flatMap(item => [item.customers, item.followups, item.quotations])
  );
  const maxValue = Math.max(1, ...yearly.map(item => item.value));

  document.getElementById("reportsYearlyTrend").innerHTML = yearly.map(item => `
    <div class="yearly-trend-column">
      <div class="yearly-bars">
        <span class="customers" style="height:${item.customers / maxCount * 100}%" title="العملاء: ${item.customers}"></span>
        <span class="followups" style="height:${item.followups / maxCount * 100}%" title="المتابعات: ${item.followups}"></span>
        <span class="quotations" style="height:${item.quotations / maxCount * 100}%" title="العروض: ${item.quotations}"></span>
        <span class="value" style="height:${item.value / maxValue * 100}%" title="القيمة: ${reportCurrency(item.value)}"></span>
      </div>
      <small>${escapeHtml(item.label)}</small>
    </div>
  `).join("");

  const renderTopList = (id, items, valueRenderer) => {
    const container = document.getElementById(id);
    container.innerHTML = items.length
      ? items.map((item, index) => `
        <article class="top10-item">
          <span>${index + 1}</span>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.subtitle ? `<small>${escapeHtml(item.subtitle)}</small>` : ""}
          </div>
          <b>${valueRenderer(item)}</b>
        </article>
      `).join("")
      : '<div class="empty-state">لا توجد بيانات.</div>';
  };

  renderTopList(
    "topRepresentativesList",
    (report.topRepresentatives || []).map(item => ({
      ...item,
      subtitle: `${item.accepted} مقبولة — ${item.conversion.toFixed(1)}% تحويل`
    })),
    item => reportCurrency(item.acceptedValue)
  );

  renderTopList(
    "topInterestsList",
    report.topInterests || [],
    item => item.count
  );

  renderTopList(
    "topCustomersExecutiveList",
    (report.topCustomersByValue || []).map(item => ({
      ...item,
      subtitle: `${item.quotations} عروض — ${item.accepted} مقبولة`
    })),
    item => reportCurrency(item.totalValue)
  );

  renderTopList(
    "topLossReasonsList",
    report.topLossReasons || [],
    item => item.count
  );

  const body = document.getElementById("representativePerformanceBody");
  body.innerHTML = report.representativePerformance.length
    ? report.representativePerformance.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${item.customers}</td>
        <td>${item.followups}</td>
        <td>${item.quotations}</td>
        <td>${item.accepted}</td>
        <td>${reportCurrency(item.value)}</td>
        <td><span class="badge">${item.conversion.toFixed(1)}%</span></td>
      </tr>
    `).join("")
    : '<tr><td colspan="7" class="empty-state">لا توجد بيانات أداء داخل النطاق المحدد.</td></tr>';

  showDataStatus(
    "reportsStatus",
    `تم تحديث التقرير في ${new Date(report.generatedAt).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn")}.`,
    "success"
  );
}

function resetReportsFilters() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById("reportsDateFrom").value = first.toISOString().slice(0, 10);
  document.getElementById("reportsDateTo").value = now.toISOString().slice(0, 10);
  document.getElementById("reportsRepresentativeFilter").value = "";
  document.getElementById("reportsSalesTarget").value = "100000";
  saveReportsTarget();
  renderReportsOverview();
}

function openReportsExportCenter() {
  if (!currentReportsSnapshot) renderReportsOverview();

  document.getElementById("executiveSummaryText").value =
    window.ReportsExportCenter.executiveSummary(currentReportsSnapshot);

  document.getElementById("reportsExportDialog").showModal();
}

function closeReportsExportCenter() {
  document.getElementById("reportsExportDialog").close();
}

function exportReportsExcel() {
  if (!currentReportsSnapshot) renderReportsOverview();
  try {
    window.ReportsExportCenter.createExcel(currentReportsSnapshot);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر إنشاء ملف Excel.");
  }
}

function exportReportsPdf() {
  if (!currentReportsSnapshot) renderReportsOverview();

  const popup = window.open("", "_blank");
  if (!popup) {
    alert("اسمح للنوافذ المنبثقة لإنشاء تقرير PDF.");
    return;
  }

  popup.document.open();
  popup.document.write(window.ReportsExportCenter.pdfHtml(currentReportsSnapshot));
  popup.document.close();
}

async function exportReportsPng() {
  if (!currentReportsSnapshot) renderReportsOverview();

  const button = document.getElementById("exportReportsPngBtn");
  button.disabled = true;
  button.textContent = "جاري إنشاء الصورة...";

  try {
    await window.ReportsExportCenter.createPng(
      document.getElementById("reportsOverviewView"),
      currentReportsSnapshot
    );
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر إنشاء صورة PNG.");
  } finally {
    button.disabled = false;
    button.textContent = "تصدير PNG";
  }
}

function exportReportsCsv() {
  if (!currentReportsSnapshot) renderReportsOverview();
  const csv = window.ReportsEngine.toCsv(currentReportsSnapshot);
  downloadTextFile(
    `petatoe-reports-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );
}

function diagnosticsStatusLabel(status) {
  const labels = {
    passed: "Passed",
    warning: "Warning",
    critical: "Critical"
  };
  return labels[status] || status;
}

function diagnosticsStatusArabic(status) {
  const labels = {
    passed: "ناجح",
    warning: "تحذير",
    critical: "حرج"
  };
  return labels[status] || status;
}

function renderDiagnosticsReport(report) {
  latestDiagnosticsReport = report;

  document.getElementById("diagnosticsScore").textContent =
    `${report.evaluation.score}%`;
  document.getElementById("diagnosticsDuration").textContent =
    `المدة: ${formatDuration(report.duration_ms)}`;
  document.getElementById("diagnosticsPassed").textContent =
    report.evaluation.passed;
  document.getElementById("diagnosticsWarnings").textContent =
    report.evaluation.warnings;
  document.getElementById("diagnosticsCritical").textContent =
    report.evaluation.critical;
  document.getElementById("diagnosticsFinishedAt").textContent =
    new Date(report.finished_at).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn");
  document.getElementById("diagnosticsEnvironment").textContent =
    `البيئة: ${report.environment}`;

  const groups = [...new Set(report.evaluation.tests.map(test => test.category))];
  document.getElementById("diagnosticsResults").innerHTML = groups.map(group => `
    <section class="diagnostics-group">
      <h4>${escapeHtml(group)}</h4>
      <div class="diagnostics-test-list">
        ${report.evaluation.tests.filter(test => test.category === group).map(test => `
          <article class="diagnostics-test ${test.status}">
            <div class="diagnostics-test-status">
              <span>${escapeHtml(diagnosticsStatusLabel(test.status))}</span>
            </div>
            <div class="diagnostics-test-content">
              <strong>${escapeHtml(test.title)}</strong>
              <p>${escapeHtml(test.detail || "")}</p>
              ${test.status !== "passed" && test.recommendation
                ? `<small><b>التوصية:</b> ${escapeHtml(test.recommendation)}</small>`
                : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  document.getElementById("downloadDiagnosticsJsonBtn").disabled = false;
  document.getElementById("downloadDiagnosticsHtmlBtn").disabled = false;
}

function diagnosticsHtml(report) {
  const rows = report.evaluation.tests.map(test => `
    <tr>
      <td>${escapeHtml(test.category)}</td>
      <td>${escapeHtml(test.title)}</td>
      <td>${escapeHtml(diagnosticsStatusArabic(test.status))}</td>
      <td>${escapeHtml(test.detail || "")}</td>
      <td>${escapeHtml(test.recommendation || "")}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>PETATOE Diagnostics Report</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#172033}
h1,h2{margin:0 0 12px}
.summary{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}
.summary div{border:1px solid #ddd;border-radius:10px;padding:12px;min-width:120px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:9px;text-align:right;vertical-align:top}
th{background:#f4f6f8}
footer{margin-top:24px;color:#667085;font-size:12px}
</style>
</head>
<body>
<h1>تقرير التشخيص الشامل — PETATOE</h1>
<p>وقت الفحص: ${escapeHtml(new Date(report.finished_at).toLocaleString("ar-SA-u-ca-gregory-nu-latn"))}</p>
<div class="summary">
<div><b>النتيجة</b><br>${report.evaluation.score}%</div>
<div><b>Passed</b><br>${report.evaluation.passed}</div>
<div><b>Warning</b><br>${report.evaluation.warnings}</div>
<div><b>Critical</b><br>${report.evaluation.critical}</div>
<div><b>المدة</b><br>${Math.round(report.duration_ms)} ms</div>
</div>
<table>
<thead><tr><th>القسم</th><th>الفحص</th><th>الحالة</th><th>التفاصيل</th><th>التوصية</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<footer>Environment: ${escapeHtml(report.environment)} — Report version ${escapeHtml(report.report_version)}</footer>
</body>
</html>`;
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function runEnterpriseDiagnostics() {
  if (diagnosticsRunning) return;
  diagnosticsRunning = true;

  const button = document.getElementById("runDiagnosticsBtn");
  button.disabled = true;
  button.textContent = "جاري الفحص...";
  showDataStatus(
    "diagnosticsStatus",
    "جاري تنفيذ اختبارات قاعدة البيانات والأمان والوظائف والواجهة...",
    "info"
  );

  try {
    const report = await window.DiagnosticsEngine.run();
    renderDiagnosticsReport(report);

    const type = report.evaluation.critical
      ? "error"
      : report.evaluation.warnings
        ? "info"
        : "success";

    showDataStatus(
      "diagnosticsStatus",
      `اكتمل الفحص: ${report.evaluation.passed} ناجح، ${report.evaluation.warnings} تحذير، ${report.evaluation.critical} حرج.`,
      type
    );
  } catch (error) {
    showDataStatus(
      "diagnosticsStatus",
      error instanceof Error ? error.message : "تعذر تنفيذ الفحص الشامل.",
      "error"
    );
  } finally {
    diagnosticsRunning = false;
    button.disabled = false;
    button.textContent = "إعادة الفحص";
  }
}

function componentLabel(key) {
  const labels = {
    database: "قاعدة البيانات",
    security: "الأمان",
    backups: "النسخ الاحتياطي",
    performance: "الأداء",
    network: "الشبكة",
    users: "المستخدمون",
    errors: "الأخطاء"
  };
  return labels[key] || key;
}

function severityLabel(severity) {
  const labels = {
    healthy: "سليم",
    warning: "تحذير",
    critical: "حرج"
  };
  return labels[severity] || severity;
}

function renderHealthTrend(history) {
  const container = document.getElementById("healthTrendChart");
  if (!container) return;

  if (!history?.length) {
    container.innerHTML = '<div class="empty-state">لا توجد قياسات سابقة بعد.</div>';
    return;
  }

  const width = 600;
  const height = 150;
  const padding = 18;
  const points = history.map((item, index) => {
    const x = history.length === 1
      ? width / 2
      : padding + index * ((width - padding * 2) / (history.length - 1));
    const y = height - padding - (item.score / 100) * (height - padding * 2);
    return { x, y, ...item };
  });

  const polyline = points.map(point => `${point.x},${point.y}`).join(" ");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Health score trend">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="trend-axis"/>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="trend-axis"/>
      <polyline points="${polyline}" class="trend-line"/>
      ${points.map(point => `
        <circle cx="${point.x}" cy="${point.y}" r="4" class="trend-point">
          <title>${point.score}% — ${new Date(point.timestamp).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn")}</title>
        </circle>
      `).join("")}
    </svg>
  `;
}

function renderSmartHealthInsights(evaluation) {
  if (!evaluation) return;

  const badge = document.getElementById("smartHealthLevelBadge");
  if (badge) {
    badge.textContent = `${evaluation.level.arabic} — ${evaluation.score}%`;
    badge.className = `smart-health-level ${evaluation.level.key}`;
  }

  const breakdown = document.getElementById("healthScoreBreakdown");
  if (breakdown) {
    breakdown.innerHTML = Object.entries(evaluation.components).map(([key, value]) => `
      <div class="score-breakdown-item">
        <div>
          <strong>${escapeHtml(componentLabel(key))}</strong>
          <small>الوزن: ${evaluation.weights[key]}%</small>
        </div>
        <div class="score-progress">
          <span style="width:${Math.round(value)}%"></span>
        </div>
        <b>${Math.round(value)}%</b>
      </div>
    `).join("");
  }

  const alerts = document.getElementById("smartAlertsList");
  if (alerts) {
    alerts.innerHTML = evaluation.alerts.map(alert => `
      <article class="smart-alert ${alert.severity}">
        <div>
          <strong>${escapeHtml(alert.title)}</strong>
          <small>${escapeHtml(alert.detail || "")}</small>
        </div>
        <span>${escapeHtml(severityLabel(alert.severity))}</span>
      </article>
    `).join("");
  }

  const recommendations = document.getElementById("healthRecommendationsList");
  if (recommendations) {
    recommendations.innerHTML = evaluation.recommendations.map((item, index) => `
      <article class="health-recommendation">
        <span>${index + 1}</span>
        <p>${escapeHtml(item)}</p>
      </article>
    `).join("");
  }

  renderHealthTrend(evaluation.history);
}

function startSystemHealthAutoRefresh() {
  stopSystemHealthAutoRefresh();
  systemHealthTimer = window.setInterval(() => {
    const view = document.getElementById("systemHealthView");
    if (view && !view.classList.contains("hidden")) {
      loadSystemHealth(true);
      renderPerformanceMonitor();
    }
  }, 30000);
}

function stopSystemHealthAutoRefresh() {
  if (systemHealthTimer) {
    clearInterval(systemHealthTimer);
    systemHealthTimer = null;
  }
}

function customerT(key, fallback = "", vars = {}) {
  const value = window.PetatoeLocalization?.t?.(key, vars);
  return value && !/^\[.+\]$/.test(value) ? value : fallback;
}

function customerNeighborhoodLabel(id, name) {
  return window.PetatoeLocalization?.entityText?.("neighborhood", { id, name }) || String(name || "");
}

function canManageCustomers(action = "edit") {
  return canScreenAction("customers", action);
}

function canDeleteCustomers() {
  return canScreenAction("customers", "delete");
}

async function loadCustomersFromSupabase(force = false) {
  if (customersLoading || (customersLoaded && !force)) return;
  if (!window.CustomersService) return;

  customersLoading = true;
  showDataStatus("customersStatus", navigator.onLine === false ? "جاري تحميل آخر بيانات العملاء المحفوظة..." : "جاري تحميل العملاء...", "info");

  try {
    customers = await window.CustomersService.listCustomers({ force });
    customersLoaded = true;
    customersPage = 1;
    showDataStatus("customersStatus", formatOfflineCacheStatus(window.CustomersService.getLastReadStatus?.()), "info");
    refreshReferenceOptions();
    renderCustomers();
    renderReferenceCustomers();
    renderDashboard();
    renderRepresentatives();
  } catch (error) {
    console.error("Customer loading failed:", error);
    showDataStatus(
      "customersStatus",
      error instanceof Error ? error.message : "تعذر تحميل العملاء.",
      "error"
    );
  } finally {
    customersLoading = false;
  }
}

function filteredCustomers() {
  const query=(document.getElementById("customerSearch")?.value||"").trim().toLowerCase();
  return customers.filter(customer => !query || [customer.customerNumber,customer.name,customer.address,customer.phone,customer.googleMapsUrl].join(" ").toLowerCase().includes(query));
}

function renderCustomers() {
  const allRows=filteredCustomers(); const body=document.getElementById("customersTableBody"); const mobileCards=document.getElementById("customersMobileCards");
  const pageCount=Math.max(1,Math.ceil(allRows.length/CUSTOMERS_PAGE_SIZE)); if(customersPage>pageCount)customersPage=pageCount; const start=(customersPage-1)*CUSTOMERS_PAGE_SIZE; const rows=allRows.slice(start,start+CUSTOMERS_PAGE_SIZE);
  document.getElementById("addCustomerBtn")?.classList.toggle("hidden",!canManageCustomers("add"));
  const actions=c=>`<div class="row-actions"><button class="edit-btn customer-action-primary" data-details="${c.id}">${customerT("customers.action.view","عرض")}</button>${canManageFollowups("add")?`<button class="edit-btn customer-action-followup" data-add-followup="${c.id}">${customerT("customers.action.followup","متابعة")}</button>`:""}${canManageCustomers()?`<button class="edit-btn customer-action-edit" data-edit="${c.id}">${customerT("customers.action.edit","تعديل")}</button>`:""}${canDeleteCustomers()?`<button class="delete-btn customer-action-delete" data-delete="${c.id}">${customerT("customers.action.delete","حذف")}</button>`:""}</div>`;
  if(!rows.length){const m=customersLoaded?customerT("customers.empty","لا توجد نتائج مطابقة."):customerT("customers.loading","جاري تحميل بيانات العملاء..."); body.innerHTML=`<tr><td colspan="6" class="empty-state">${m}</td></tr>`; if(mobileCards)mobileCards.innerHTML=`<div class="customer-mobile-empty">${m}</div>`;}
  else { body.innerHTML=rows.map(c=>`<tr><td><strong>${escapeHtml(c.customerNumber||"—")}</strong></td><td><strong>${escapeHtml(c.name||"—")}</strong></td><td>${escapeHtml(c.neighborhoodId?customerNeighborhoodLabel(c.neighborhoodId,c.address):(c.address||"—"))}</td><td>${escapeHtml(c.phone||"—")}</td><td>${c.googleMapsUrl?`<a class="text-btn" href="${escapeHtml(c.googleMapsUrl)}" target="_blank" rel="noopener noreferrer">${customerT("customers.action.openMap","فتح الموقع")}</a>`:"—"}</td><td>${actions(c)}</td></tr>`).join("");
    if(mobileCards)mobileCards.innerHTML=rows.map(c=>`<article class="customer-mobile-card"><header class="customer-mobile-card-head"><span class="customer-mobile-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg></span><div><span class="customer-mobile-kicker">${customerT("customers.col.name","name")}</span><strong class="customer-mobile-name">${escapeHtml(c.name||"—")}</strong><small>${escapeHtml(c.customerNumber||"—")}</small></div></header><div class="customer-mobile-details"><div><span>${customerT("customers.col.address","address")}</span><strong>${escapeHtml(c.neighborhoodId?customerNeighborhoodLabel(c.neighborhoodId,c.address):(c.address||"—"))}</strong></div><div><span>${customerT("customers.col.mobile","mobile")}</span><strong>${escapeHtml(c.phone||"—")}</strong></div><div><span>${customerT("customers.col.maps","موقع Google Maps")}</span><strong>${c.googleMapsUrl?`<a href="${escapeHtml(c.googleMapsUrl)}" target="_blank" rel="noopener noreferrer">${customerT("customers.action.openMap","فتح الموقع")}</a>`:"—"}</strong></div></div><footer class="customer-mobile-card-actions row-actions">${actions(c)}</footer></article>`).join(""); }
  const info=document.getElementById("customersPaginationInfo"),pn=document.getElementById("customersPageNumber"),prev=document.getElementById("customersPrevPage"),next=document.getElementById("customersNextPage"); if(info)info.textContent=customerT("customers.count",`${allRows.length} عميل`,{count:allRows.length}); if(pn)pn.textContent=`${customersPage} / ${pageCount}`; if(prev)prev.disabled=customersPage<=1; if(next)next.disabled=customersPage>=pageCount;
}

function currentRole() {
  return window.CustomerAuth?.getState?.().profile?.role || "viewer";
}

function canManageReferenceData(action = "edit", screenKey = "settings") {
  return canScreenAction(screenKey, action);
}

function filteredRepresentativeRecords() {
  const search = (document.getElementById("representativesSearch")?.value || "")
    .trim()
    .toLowerCase();
  const status = document.getElementById("representativesStatusFilter")?.value || "";

  return representativeRecords.filter(rep => {
    const matchesSearch = !search || [
      rep.full_name,
      rep.representative_code,
      rep.phone,
      rep.email
    ].some(value => String(value || "").toLowerCase().includes(search));

    const matchesStatus = !status
      || (status === "active" && rep.is_active)
      || (status === "inactive" && !rep.is_active);

    return matchesSearch && matchesStatus;
  });
}

function representativeCustomerCount() { return 0; }

function renderRepresentatives() {
  const body = document.getElementById("representativesTableBody");
  if (!body) return;

  const rows = filteredRepresentativeRecords();
  const canManage = canManageReferenceData();

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          لا توجد نتائج مطابقة للمندوبين.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = rows.map(rep => {
    const customerCount = representativeCustomerCount(rep);

    return `
      <tr class="${rep.is_active ? "" : "inactive-record"}">
        <td><strong>${escapeHtml(rep.representative_code || "—")}</strong></td>
        <td><strong>${escapeHtml(rep.full_name || "—")}</strong></td>
        <td>${escapeHtml(rep.phone || "—")}</td>
        <td>${escapeHtml(rep.email || "—")}</td>
        <td>
          <span class="representative-customer-count">
            ${customerCount}
          </span>
        </td>
        <td>
          <span class="record-status ${rep.is_active ? "active" : "inactive"}">
            ${rep.is_active ? "نشط" : "موقوف"}
          </span>
        </td>
        <td>
          ${canManage ? `
            <div class="table-actions representative-actions">
              <button
                class="edit-btn"
                type="button"
                data-edit-representative="${rep.id}">
                تعديل
              </button>
              <button
                class="${rep.is_active ? "warning-btn" : "activate-btn"}"
                type="button"
                data-toggle-representative="${rep.id}">
                ${rep.is_active ? "إيقاف" : "تفعيل"}
              </button>
              <button
                class="delete-btn"
                type="button"
                data-delete-representative="${rep.id}"
                ${customerCount ? 'title="لا يمكن الحذف قبل نقل العملاء المرتبطين"' : ""}>
                حذف
              </button>
            </div>
          ` : "—"}
        </td>
      </tr>`;
  }).join("");
}

async function toggleRepresentativeStatus(id) {
  if (!canManageReferenceData()) return;

  const record = representativeRecords.find(item => item.id === id);
  if (!record) return;

  const nextStatus = !record.is_active;
  const actionLabel = nextStatus ? "إعادة تفعيل" : "إيقاف";

  if (!confirm(`هل تريد ${actionLabel} المندوب «${record.full_name}»؟`)) return;

  showDataStatus("representativesStatus", `جاري ${actionLabel} المندوب...`, "info");

  try {
    const { error } = await window.customerSupabase
      .from("sales_representatives")
      .update({
        is_active: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;

    await loadReferenceDataFromSupabase(true);
    showDataStatus(
      "representativesStatus",
      nextStatus ? "تم تفعيل المندوب بنجاح." : "تم إيقاف المندوب بنجاح.",
      "success"
    );
  } catch (error) {
    showDataStatus(
      "representativesStatus",
      error instanceof Error ? error.message : "تعذر تغيير حالة المندوب.",
      "error"
    );
  }
}

async function deleteRepresentativeRecord(id) {
  if (!requireScreenAction("representatives", "delete", "لا توجد صلاحية حذف مندوبي المبيعات.")) return;
  if (!canManageReferenceData()) return;

  const record = representativeRecords.find(item => item.id === id);
  if (!record) return;

  const customerCount = representativeCustomerCount(record);
  if (customerCount > 0) {
    showDataStatus(
      "representativesStatus",
      `لا يمكن حذف «${record.full_name}» لأنه مرتبط بـ ${customerCount} عميل. انقل العملاء إلى مندوب آخر أو استخدم الإيقاف.`,
      "error"
    );
    return;
  }

  if (!confirm(
    `سيتم حذف المندوب «${record.full_name}» نهائيًا. هل تريد المتابعة؟`
  )) return;

  showDataStatus("representativesStatus", "جاري حذف المندوب...", "info");

  try {
    const { error } = await window.customerSupabase
      .from("sales_representatives")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await loadReferenceDataFromSupabase(true);
    showDataStatus("representativesStatus", "تم حذف المندوب بنجاح.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showDataStatus(
      "representativesStatus",
      message.includes("foreign key")
        ? "لا يمكن حذف المندوب لوجود بيانات مرتبطة به. استخدم الإيقاف بدلًا من الحذف."
        : message || "تعذر حذف المندوب.",
      "error"
    );
  }
}

function renderReferenceData() {
  const canManage = canManageReferenceData();

  const renderItems = (records, type) => records.length
    ? records.map(item => `
        <div class="reference-item ${item.is_active ? "" : "inactive-record"}">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span class="record-status ${item.is_active ? "active" : "inactive"}">
              ${item.is_active ? "نشط" : "غير نشط"}
            </span>
          </div>
          ${canManage ? `
            <div class="reference-item-actions">
              <button
                class="edit-btn"
                type="button"
                data-edit-reference="${item.id}"
                data-reference-type="${type}">
                تعديل
              </button>
              <button
                class="delete-btn"
                type="button"
                data-delete-reference="${item.id}"
                data-reference-type="${type}">
                حذف
              </button>
            </div>
          ` : ""}
        </div>`).join("")
    : `<div class="empty-state">لا توجد بيانات مسجلة.</div>`;

  const interestsContainer = document.getElementById("settingsInterests");
  const reasonsContainer = document.getElementById("settingsReasons");

  if (interestsContainer) {
    interestsContainer.innerHTML = renderItems(interestRecords, "interest");
  }
  if (reasonsContainer) {
    reasonsContainer.innerHTML = renderItems(reasonRecords, "reason");
  }

  document.querySelectorAll(".reference-manage-action").forEach(button => {
    button.classList.toggle("hidden", !canManage);
  });

  renderReferenceCustomers();
}

function filteredReferenceCustomers() {
  const query=(document.getElementById("referenceCustomersSearch")?.value||"").trim().toLowerCase();
  return customers.filter(c=>!query||[c.customerNumber,c.name,c.address,c.phone].join(" ").toLowerCase().includes(query));
}

function syncReferenceCustomerFilters() {}

function renderReferenceCustomers() {
  const body=document.getElementById("referenceCustomersTableBody"); if(!body)return; const allRows=filteredReferenceCustomers(); const pageCount=Math.max(1,Math.ceil(allRows.length/REFERENCE_CUSTOMERS_PAGE_SIZE)); if(referenceCustomersPage>pageCount)referenceCustomersPage=pageCount; const start=(referenceCustomersPage-1)*REFERENCE_CUSTOMERS_PAGE_SIZE,rows=allRows.slice(start,start+REFERENCE_CUSTOMERS_PAGE_SIZE);
  document.getElementById("referenceAddCustomerBtn")?.classList.toggle("hidden",!canScreenAction("customers","add")); document.querySelectorAll(".customer-export-action").forEach(b=>b.classList.toggle("hidden",!canScreenAction("customers","export"))); document.querySelectorAll(".customer-import-action").forEach(b=>b.classList.toggle("hidden",!canScreenAction("customers","add")));
  if(!rows.length)body.innerHTML=`<tr><td colspan="6" class="empty-state">${customersLoaded?"لا توجد نتائج مطابقة.":"جاري تحميل بيانات العملاء..."}</td></tr>`; else body.innerHTML=rows.map(c=>`<tr><td><strong>${escapeHtml(c.customerNumber||"—")}</strong></td><td><strong>${escapeHtml(c.name||"—")}</strong></td><td>${escapeHtml(c.neighborhoodId?customerNeighborhoodLabel(c.neighborhoodId,c.address):(c.address||"—"))}</td><td>${escapeHtml(c.phone||"—")}</td><td><div class="row-actions"><button class="edit-btn" type="button" data-reference-customer-details="${c.id}">فتح</button>${canScreenAction("customers","edit")?`<button class="edit-btn" type="button" data-reference-customer-edit="${c.id}">تعديل</button>`:""}${canScreenAction("customers","delete")?`<button class="delete-btn" type="button" data-reference-customer-delete="${c.id}">حذف</button>`:""}</div></td></tr>`).join("");
  const info=document.getElementById("referenceCustomersPaginationInfo"),pn=document.getElementById("referenceCustomersPageNumber"),prev=document.getElementById("referenceCustomersPrevPage"),next=document.getElementById("referenceCustomersNextPage"); if(info)info.textContent=customerT("customers.count",`${allRows.length} عميل`,{count:allRows.length}); if(pn)pn.textContent=`${referenceCustomersPage} / ${pageCount}`; if(prev)prev.disabled=referenceCustomersPage<=1; if(next)next.disabled=referenceCustomersPage>=pageCount;
}

function syncReferenceDataPanel() {
  const selected = document.getElementById("referenceDataSectionFilter")?.value || "interest";
  document.querySelectorAll("[data-reference-panel]").forEach(panel => {
    panel.classList.toggle(
      "hidden",
      panel.dataset.referencePanel !== selected
    );
  });
}

async function deleteReferenceItem(type, id) {
  if (!requireScreenAction("settings", "delete", "لا توجد صلاحية حذف البيانات المرجعية.")) return;
  if (!canManageReferenceData()) return;

  const records = type === "interest" ? interestRecords : reasonRecords;
  const record = records.find(item => item.id === id);
  if (!record) return;

  const label = type === "interest" ? "مجال الاهتمام" : "سبب عدم البيع";
  if (!confirm(`سيتم حذف ${label} «${record.name}» نهائيًا. هل تريد المتابعة؟`)) {
    return;
  }

  const table = type === "interest"
    ? "interest_categories"
    : "no_sale_reasons";

  showDataStatus("referenceDataStatus", `جاري حذف ${label}...`, "info");

  try {
    const { error } = await window.customerSupabase
      .from(table)
      .delete()
      .eq("id", id);

    if (error) throw error;

    referenceDataLoaded = false;
    await loadReferenceDataFromSupabase(true);
    syncReferenceDataPanel();

    showDataStatus(
      "referenceDataStatus",
      `تم حذف ${label} بنجاح.`,
      "success"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isLinked = /foreign key|violates|referenced|23503/i.test(message);

    showDataStatus(
      "referenceDataStatus",
      isLinked
        ? `لا يمكن حذف ${label} لأنه مستخدم في بيانات حالية. عدّل حالته إلى «غير نشط» بدل الحذف.`
        : message || `تعذر حذف ${label}.`,
      "error"
    );
  }
}

function openRepresentativeDialog(record = null) {
  const action = record ? "edit" : "add";
  if (!requireScreenAction("representatives", action, "لا توجد صلاحية إدارة مندوبي المبيعات.")) return;
  editingRepresentativeId = record?.id || null;
  document.getElementById("representativeDialogTitle").textContent =
    record ? "تعديل مندوب المبيعات" : "إضافة مندوب مبيعات";
  document.getElementById("representativeId").value = record?.id || "";
  document.getElementById("representativeCode").value = record?.representative_code || "";
  document.getElementById("representativeName").value = record?.full_name || "";
  document.getElementById("representativePhone").value = record?.phone || "";
  document.getElementById("representativeEmail").value = record?.email || "";
  document.getElementById("representativeActive").value = String(record?.is_active ?? true);
  document.getElementById("representativeDialog").showModal();
}

function closeRepresentativeDialog() {
  document.getElementById("representativeDialog").close();
  document.getElementById("representativeForm").reset();
  editingRepresentativeId = null;
}

async function saveRepresentativeForm(event) {
  const action = editingRepresentativeId ? "edit" : "add";
  if (!requireScreenAction("representatives", action, "لا توجد صلاحية حفظ مندوبي المبيعات.")) return;
  event.preventDefault();
  try {
    await window.ReferenceDataService.saveRepresentative({
      id: editingRepresentativeId,
      representative_code: document.getElementById("representativeCode").value,
      full_name: document.getElementById("representativeName").value,
      phone: document.getElementById("representativePhone").value,
      email: document.getElementById("representativeEmail").value,
      is_active: document.getElementById("representativeActive").value === "true"
    });
    closeRepresentativeDialog();
    referenceDataLoaded = false;
    await loadReferenceDataFromSupabase(true);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر حفظ المندوب.");
  }
}

function openReferenceDialog(type, record = null) {
  const action = record ? "edit" : "add";
  if (!requireScreenAction("settings", action, "لا توجد صلاحية إدارة البيانات المرجعية.")) return;
  editingReferenceItemId = record?.id || null;
  document.getElementById("referenceDialogTitle").textContent =
    `${record ? "تعديل" : "إضافة"} ${type === "interest" ? "مجال اهتمام" : "سبب عدم بيع"}`;
  document.getElementById("referenceItemId").value = record?.id || "";
  document.getElementById("referenceItemType").value = type;
  document.getElementById("referenceItemName").value = record?.name || "";
  document.getElementById("referenceItemActive").value = String(record?.is_active ?? true);
  document.getElementById("referenceItemDialog").showModal();
}

function closeReferenceDialog() {
  document.getElementById("referenceItemDialog").close();
  document.getElementById("referenceItemForm").reset();
  editingReferenceItemId = null;
}

async function saveReferenceForm(event) {
  const action = editingReferenceItemId ? "edit" : "add";
  if (!requireScreenAction("settings", action, "لا توجد صلاحية حفظ البيانات المرجعية.")) return;
  event.preventDefault();
  const type = document.getElementById("referenceItemType").value;
  const payload = {
    id: editingReferenceItemId,
    name: document.getElementById("referenceItemName").value,
    is_active: document.getElementById("referenceItemActive").value === "true"
  };

  try {
    if (type === "interest") await window.ReferenceDataService.saveInterest(payload);
    else await window.ReferenceDataService.saveReason(payload);
    closeReferenceDialog();
    referenceDataLoaded = false;
    await loadReferenceDataFromSupabase(true);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر حفظ البيانات المرجعية.");
  }
}

function syncCustomerContactPersonField() {
  const type = document.getElementById("customerType")?.value;
  const field = document.getElementById("customerContactPersonField");
  const input = document.getElementById("customerContactPerson");
  const isCompany = type === "شركة";
  if (!field || !input) return;
  field.classList.toggle("hidden", !isCompany);
  input.required = isCompany;
  if (!isCompany) {
    input.value = "";
    input.setCustomValidity("");
  }
}

async function openCustomerDialog(customer=null) {
  const action=customer?"edit":"add"; if(!requireScreenAction("customers",action,`لا توجد صلاحية ${customer?"تعديل":"إضافة"} العملاء.`))return;
  const dialog=document.getElementById("customerDialog"),form=document.getElementById("customerForm"),submitButton=form?.querySelector('button[type="submit"]'); editingId=customer?.id||null; document.getElementById("dialogTitle").textContent=customer?customerT("customers.dialog.edit","تعديل بيانات العميل"):customerT("customers.dialog.add","إضافة عميل جديد"); dialog?.showModal(); dialog?.classList.add("is-loading"); if(submitButton){submitButton.disabled=true;submitButton.textContent=customerT("customers.dialog.loading","جاري تحميل البيانات...");}
  try {
    const record=customer?.id&&window.CustomersService?.getCustomerById?await window.CustomersService.getCustomerById(customer.id):customer;
    editingId=record?.id||null;
    document.getElementById("customerId").value=record?.id||"";
    document.getElementById("customerCode").value=record?.customerNumber||record?.code||"";
    document.getElementById("customerName").value=record?.name||"";
    document.getElementById("customerPhone").value=record?.phone||"";
    document.getElementById("customerGoogleMapsUrl").value=record?.googleMapsUrl||"";
    await loadCustomerDistrictCatalog(false);
    bindCustomerNeighborhoodSearch();
    setCustomerNeighborhood(record?.neighborhoodId||"",record?.address||"");
  }
  catch(error){console.error("Customer hydration failed",error);alert(error instanceof Error?error.message:"تعذر تحميل بيانات العميل.");dialog?.close();editingId=null;}
  finally{dialog?.classList.remove("is-loading");if(submitButton){submitButton.disabled=false;submitButton.textContent="حفظ العميل";}}
}

function closeCustomerDialog() {
  document.getElementById("customerDialog").close();
  document.getElementById("customerForm").reset();
  setCustomerInterestDropdownOpen(false);
  syncCustomerInterestCheckboxes();
  editingId = null;
}

async function handleCustomerSubmit(event) {
  const action=editingId?"edit":"add"; if(!requireScreenAction("customers",action,"لا توجد صلاحية حفظ العملاء."))return; event.preventDefault();
  if(!canManageCustomers()){alert("لا توجد صلاحية لتعديل بيانات العملاء.");return;}
  const code=document.getElementById("customerCode")?.value.trim()||"",name=document.getElementById("customerName")?.value.trim()||"",address=document.getElementById("customerAddress")?.value.trim()||"",neighborhoodId=document.getElementById("customerNeighborhoodId")?.value||"",googleMapsUrl=document.getElementById("customerGoogleMapsUrl")?.value.trim()||"",phone=normalizePhone(document.getElementById("customerPhone")?.value||"");
  if(!neighborhoodId){const addressInput=document.getElementById("customerAddress");addressInput?.setCustomValidity("اختر الحي من القائمة.");addressInput?.reportValidity();return;}
  if(!code){alert("أدخل كود العميل.");document.getElementById("customerCode")?.focus();return;} if(!name){alert("أدخل اسم العميل.");document.getElementById("customerName")?.focus();return;} if(!isValidSaudiMobile(phone)){alert("أدخل رقم جوال سعودي صحيحًا بصيغة 05XXXXXXXX.");document.getElementById("customerPhone")?.focus();return;}
  try{const dup=await findCustomerByPhone(phone,editingId);if(dup){alert(duplicateCustomerWarningMessage(dup,phone));return;}const btn=event.submitter;if(btn){btn.disabled=true;btn.textContent="جاري الحفظ...";}await window.CustomersService.saveCustomer({id:editingId,updatedAt:editingId?(customers.find(x=>String(x.id)===String(editingId))?.updatedAt||""):"",customerNumber:code,name,address,neighborhoodId,googleMapsUrl,phone});closeCustomerDialog();customersLoaded=false;await loadCustomersFromSupabase(true);}catch(error){alert(error instanceof Error?error.message:"تعذر حفظ العميل.");}finally{const btn=event.submitter;if(btn){btn.disabled=false;btn.textContent="حفظ العميل";}}
}

async function deleteCustomer(id) {
  if (!requireScreenAction("customers", "delete", "لا توجد صلاحية حذف العملاء.")) return;
  if (!canDeleteCustomers()) {
    alert("حذف العملاء متاح للإدارة فقط.");
    return;
  }

  const customer = customers.find(item => item.id === id);
  if (!customer) return;
  if (!confirm(`هل تريد حذف العميل: ${customer.name}؟ سيتم حذف السجلات المرتبطة به وفق قواعد قاعدة البيانات.`)) return;

  try {
    await window.CustomersService.deleteCustomer(customer.id, customer.name);
    customersLoaded = false;
    await loadCustomersFromSupabase(true);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر حذف العميل.");
  }
}


function customerById(id) {
  return customers.find(customer => customer.id === id);
}

function canManageFollowups(action = "edit") {
  return canScreenAction("followups", action);
}

async function loadFollowupsFromSupabase(force = false) {
  if (followupsLoading || (followupsLoaded && !force)) return;
  if (!window.FollowupsService) return;

  followupsLoading = true;
  showDataStatus("followupsStatus", navigator.onLine === false ? customerT("followups.loading.cached","جاري تحميل آخر بيانات المتابعات المحفوظة...") : customerT("followups.loading","جاري تحميل المتابعات..."), "info");

  try {
    followups = await window.FollowupsService.listFollowups({ force });
    followupsLoaded = true;
    followupsPage = 1;
    showDataStatus("followupsStatus", formatOfflineCacheStatus(window.FollowupsService.getLastReadStatus?.()), "info");
    renderFollowups();
    renderDashboard();
  } catch (error) {
    console.error("Follow-up loading failed:", error);
    showDataStatus(
      "followupsStatus",
      error instanceof Error ? window.PetatoeLocalization?.translateMessage?.(error.message) || error.message : customerT("followups.error.load","تعذر تحميل المتابعات."),
      "error"
    );
  } finally {
    followupsLoading = false;
  }
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

  const followupKpiIcons = [
    `<svg viewBox="0 0 24 24"><path d="M8 7V3m8 4V3M4 11h16"/><rect x="3" y="5" width="18" height="16" rx="3"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="m9 12 2 2 4-4"/><path d="M5 3h14a2 2 0 0 1 2 2v14H3V5a2 2 0 0 1 2-2Z"/></svg>`,
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    `<svg viewBox="0 0 24 24"><path d="M6 19V8m6 11V5m6 14v-7"/><path d="M4 19h16"/></svg>`
  ];
  document.getElementById("followupStats").innerHTML = [
    [customerT("followups.stats.total","إجمالي المتابعات"), counts.total],
    [customerT("followups.stats.today","متابعات اليوم"), counts.today],
    [customerT("followups.stats.overdue","المتابعات المتأخرة"), counts.overdue],
    [customerT("followups.stats.upcoming","المتابعات القادمة"), counts.upcoming]
  ].map(([label, value], index) =>
    `<article class="followup-stat"><span class="petatoe-followup-kpi-icon" aria-hidden="true">${followupKpiIcons[index]}</span><span>${label}</span><strong>${value}</strong></article>`
  ).join("");

  const allRows = filteredFollowups();
  const body = document.getElementById("followupsTableBody");
  const pageCount = Math.max(1, Math.ceil(allRows.length / FOLLOWUPS_PAGE_SIZE));

  if (followupsPage > pageCount) followupsPage = pageCount;
  const start = (followupsPage - 1) * FOLLOWUPS_PAGE_SIZE;
  const rows = allRows.slice(start, start + FOLLOWUPS_PAGE_SIZE);

  document.getElementById("addFollowupBtn")?.classList.toggle("hidden", !canManageFollowups("add"));

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-state">${
      followupsLoaded ? customerT("followups.empty","لا توجد متابعات مطابقة.") : customerT("followups.loading","جاري تحميل المتابعات...")
    }</td></tr>`;
  } else {
    body.innerHTML = rows.map(item => {
      const customer = customerById(item.customerId);
      const status = followupStatus(item);
      return `
        <tr>
          <td><strong>${escapeHtml(customer?.name || item.customerName || customerT("customers.unknown","عميل غير معروف"))}</strong></td>
          <td>${escapeHtml(customer?.phone || item.customerPhone || "—")}</td>
          <td>${formatDate(item.contactDate)}</td>
          <td><span class="badge">${escapeHtml(followupMethodLabel(item.method))}</span></td>
          <td>${escapeHtml(item.representative || "—")}</td>
          <td>${escapeHtml(followupResultLabel(item.result))}</td>
          <td>${escapeHtml(item.quotationNumber || "—")}</td>
          <td>${formatDate(item.nextFollowupDate)}</td>
          <td><span class="status-badge status-${status}">${statusLabel(status)}</span></td>
          <td>
            <div class="row-actions">
              ${canManageFollowups("edit") ? `<button class="edit-btn" data-edit-followup="${item.id}">${customerT("customers.action.edit","تعديل")}</button>` : ""}
              ${canManageFollowups("delete") ? `<button class="delete-btn" data-delete-followup="${item.id}">${customerT("customers.action.delete","حذف")}</button>` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  const info = document.getElementById("followupsPaginationInfo");
  const pageNumber = document.getElementById("followupsPageNumber");
  const prev = document.getElementById("followupsPrevPage");
  const next = document.getElementById("followupsNextPage");

  if (info) info.textContent = customerT("followups.count",`${allRows.length} متابعة`,{count:allRows.length});
  if (pageNumber) pageNumber.textContent = `${followupsPage} / ${pageCount}`;
  if (prev) prev.disabled = followupsPage <= 1;
  if (next) next.disabled = followupsPage >= pageCount;
}

async function openFollowupDialog(customerId = null, followup = null) {
  const action = followup ? "edit" : "add";
  if (!requireScreenAction("followups", action, `لا توجد صلاحية ${followup ? "تعديل" : "إضافة"} المتابعات.`)) return;
  if (!(await ensureOperationalReferenceData())) return;
  editingFollowupId = followup?.id || null;
  document.getElementById("followupDialogTitle").textContent =
    followup ? customerT("followups.dialog.edit","تعديل المتابعة") : customerT("followups.dialog.add","إضافة متابعة جديدة");
  document.getElementById("followupId").value = followup?.id || "";
  document.getElementById("followupCustomer").value = followup?.customerId || customerId || customers[0]?.id || "";
  document.getElementById("followupContactDate").value = followup?.contactDate || todayIso();
  document.getElementById("followupMethod").value = followup?.method || "اتصال";
  document.getElementById("followupRepresentative").value = operationalDefaultRepresentativeId(
    followup?.representativeId || customerById(customerId)?.representativeId
  );
  document.getElementById("followupResult").value = followup?.result || "تم التواصل";
  document.getElementById("followupQuotationNumber").value = followup?.quotationNumber || "";
  document.getElementById("followupNoSaleReason").value = followup?.noSaleReasonId || "";
  document.getElementById("nextFollowupDate").value = followup?.nextFollowupDate || "";
  document.getElementById("followupCompleted").value = String(followup?.completed || false);
  document.getElementById("followupNotes").value = followup?.notes || "";
  document.getElementById("followupDialog").showModal();
}

function closeFollowupDialog() {
  pendingDailySuggestionCompletion = null;
  document.getElementById("followupDialog").close();
  document.getElementById("followupForm").reset();
  editingFollowupId = null;
}

async function handleFollowupSubmit(event) {
  const action = editingFollowupId ? "edit" : "add";
  if (!requireScreenAction("followups", action, "لا توجد صلاحية حفظ المتابعات.")) return;
  event.preventDefault();

  if (!canManageFollowups(action)) {
    alert("لا توجد صلاحية لإدارة المتابعات.");
    return;
  }

  const customerId = document.getElementById("followupCustomer").value;
  const representativeId = document.getElementById("followupRepresentative").value;

  if (!customerId) {
    alert(customerT("followups.error.chooseCustomer","اختر العميل."));
    return;
  }

  if (!representativeId) {
    alert(customerT("followups.error.chooseRep","اختر المندوب المسؤول."));
    return;
  }

  const submitButton = event.submitter;
  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = customerT("followups.dialog.saving","جاري الحفظ...");
    }

    const followupPayload = {
      id: editingFollowupId,
      updatedAt: editingFollowupId ? (followups.find(item => String(item.id) === String(editingFollowupId))?.updatedAt || "") : "",
      customerId,
      contactDate: document.getElementById("followupContactDate").value,
      method: document.getElementById("followupMethod").value,
      representativeId,
      result: document.getElementById("followupResult").value,
      quotationNumber: document.getElementById("followupQuotationNumber").value,
      noSaleReasonId: document.getElementById("followupNoSaleReason").value || null,
      nextFollowupDate: document.getElementById("nextFollowupDate").value,
      completed: document.getElementById("followupCompleted").value === "true",
      notes: document.getElementById("followupNotes").value
    };

    const savedFollowupId = await window.FollowupsService.saveFollowup(followupPayload);
    let suggestionCompletionError = null;
    const pendingSuggestion = pendingDailySuggestionCompletion;
    const matchingSuggestion = dailySuggestedSuggestionRows.find(item =>
      String(item.customer_id) === String(customerId)
      && (!pendingSuggestion?.suggestionId || String(item.suggestion_id) === String(pendingSuggestion.suggestionId))
    ) || dailySuggestedSuggestionRows.find(item => String(item.customer_id) === String(customerId));

    if (savedFollowupId) {
      try {
        const completedCount = await window.DailySuggestionsService?.completeForCustomer?.({
          customerId,
          suggestionId: pendingSuggestion?.suggestionId || matchingSuggestion?.suggestion_id || null,
          followupId: savedFollowupId
        });
        if (completedCount || matchingSuggestion) {
          dailySuggestedSuggestionRows = dailySuggestedSuggestionRows.filter(item => String(item.customer_id) !== String(customerId));
          const progress = dailySuggestedSuggestionProgress || { active: 0, completed: 0, total: 0 };
          dailySuggestedSuggestionProgress = { ...progress, active: Math.max(0, Number(progress.active || 0) - 1), completed: Number(progress.completed || 0) + 1 };
          renderDailySuggestedCustomers();
        }
      } catch (error) {
        suggestionCompletionError = error;
        console.error("Daily suggestion completion failed", error);
      }
    }

    pendingDailySuggestionCompletion = null;
    closeFollowupDialog();
    followupsLoaded = false;
    customersLoaded = false;
    await Promise.all([
      loadFollowupsFromSupabase(true),
      loadCustomersFromSupabase(true)
    ]);
    if (!document.getElementById("dailyOperationsView")?.classList.contains("hidden")) {
      // Refresh the permission-owned snapshot as well as suggestions so the
      // completed customer disappears from Suggestions and the saved follow-up
      // appears immediately in "المتابعات المنفذة اليوم".
      await loadDailyOperations(true);
    }
    if (suggestionCompletionError) {
      alert(`تم حفظ المتابعة، ولكن تعذر تحديث قائمة العملاء المقترحين: ${suggestionCompletionError.message || "خطأ غير معروف"}`);
    }
  } catch (error) {
    alert(error instanceof Error ? window.PetatoeLocalization?.translateMessage?.(error.message) || error.message : customerT("followups.error.save","تعذر حفظ المتابعة."));
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = customerT("followups.dialog.save","حفظ المتابعة");
    }
  }
}

async function deleteFollowup(id) {
  if (!requireScreenAction("followups", "delete", customerT("followups.error.deletePermission","لا توجد صلاحية حذف المتابعات."))) return;
  if (!canManageFollowups("delete")) {
    alert(customerT("followups.error.deletePermission","لا توجد صلاحية لحذف المتابعات."));
    return;
  }

  const item = followups.find(followup => followup.id === id);
  if (!item) return;
  if (!confirm(customerT("followups.confirm.delete","هل تريد حذف هذه المتابعة؟"))) return;

  try {
    await window.FollowupsService.deleteFollowup(item);
    followupsLoaded = false;
    customersLoaded = false;
    await Promise.all([
      loadFollowupsFromSupabase(true),
      loadCustomersFromSupabase(true)
    ]);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر حذف المتابعة.");
  }
}

function customer360TimelineIcon(type) {
  const icons = {
    customer: "C",
    followup: "F",
    quotation: "Q"
  };
  return icons[type] || "•";
}

function customer360TimelineStatusLabel(status) {
  const labels = {
    completed: "مكتملة",
    overdue: "متأخرة",
    today: "اليوم",
    upcoming: "قادمة",
    no_date: "بدون موعد",
    accepted: "مقبول",
    rejected: "مرفوض",
    open: "مفتوح",
    info: "معلومة"
  };
  return labels[status] || status || "—";
}

function renderCustomer360UnifiedTimeline(view) {
  const timelineContainer = document.getElementById("customer360UnifiedTimeline");
  if (!timelineContainer) return;

  const filtered = customer360ActivityFilter === "all"
    ? view.timeline
    : view.timeline.filter(item => item.type === customer360ActivityFilter);

  timelineContainer.innerHTML = filtered.length
    ? filtered.map(item => `
      <article class="customer360-activity-item type-${item.type} status-${item.status}">
        <div class="customer360-activity-icon">${escapeHtml(customer360TimelineIcon(item.type))}</div>
        <div class="customer360-activity-content">
          <div class="customer360-activity-head">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.typeLabel)} · ${formatDate(item.date)}</small>
            </div>
            <span>${escapeHtml(customer360TimelineStatusLabel(item.status))}</span>
          </div>
          <p>${escapeHtml(item.detail || "—")}</p>
          <small>${escapeHtml(item.meta || "—")}</small>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد أحداث من هذا النوع.</div>';
}

function customer360RiskClass(score) {
  const value = Number(score || 0);
  if (value >= 70) return "critical";
  if (value >= 45) return "high";
  if (value >= 20) return "medium";
  return "low";
}

function customer360PriorityLabelClass(key) {
  return ["critical", "high", "medium", "low"].includes(key)
    ? key
    : "low";
}

function customer360StatusClass(key) {
  const supported = [
    "active",
    "overdue",
    "needs_followup",
    "inactive",
    "today"
  ];
  return supported.includes(key) ? key : "inactive";
}

function customer360Metric(label, value, detail = "") {
  return `
    <article class="customer360-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value ?? "—"))}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </article>
  `;
}

function showCustomerDetails(customerId) {
  const customer = customerById(customerId);
  if (!customer || !window.Customer360Engine) return;

  const view = window.Customer360Engine.build(
    customer,
    followups,
    quotations
  );

  currentCustomer360View = view;

  document.getElementById("customerDetailsDialog").dataset.customerId = customerId;
  document.getElementById("customerDetailsTitle").textContent =
    `${customer.name} — Customer 360°`;
  document.getElementById("customerDetailsSubtitle").textContent =
    `${customer.customerNumber || "بدون كود"} · ${customer.phone || "بدون جوال"}`;

  const statusBadge = document.getElementById("customer360StatusBadge");
  statusBadge.textContent = view.status.label;
  statusBadge.className =
    `customer360-status ${customer360StatusClass(view.status.key)}`;

  const editButton = document.getElementById("customer360EditBtn");
  const followupButton = document.getElementById("customer360AddFollowupBtn");
  editButton.classList.toggle("hidden", !canManageCustomers());
  followupButton.classList.toggle("hidden", !canManageFollowups("add"));

  const profile = [
    ["code", customer.customerNumber || "—"],
    ["name", customer.name || "—"],
    ["address", customer.address || "—"],
    ["mobile", customer.phone || "—"]
  ];

  const nextFollowup = view.followups.find(item =>
    ["today", "upcoming"].includes(
      item.completed
        ? "completed"
        : (() => {
            const next = item.nextFollowupDate
              ? new Date(`${String(item.nextFollowupDate).slice(0, 10)}T00:00:00`)
              : null;
            if (!next) return "no_date";
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (next < today) return "overdue";
            if (next.getTime() === today.getTime()) return "today";
            return "upcoming";
          })()
    )
  );

  document.getElementById("customerDetailsContent").innerHTML = `
    <section class="customer360-overview">
      <article class="customer360-status-card ${customer360StatusClass(view.status.key)}">
        <div>
          <span>حالة العميل</span>
          <strong>${escapeHtml(view.status.label)}</strong>
          <p>${escapeHtml(view.status.detail)}</p>
        </div>
        <div class="customer360-last-contact">
          <span>آخر تواصل</span>
          <strong>${view.lastContactDate ? formatDate(view.lastContactDate) : "—"}</strong>
          <small>${view.inactivityDays === null ? "لا توجد مدة محسوبة" : `منذ ${view.inactivityDays} يوم`}</small>
        </div>
      </article>

      <div class="customer360-kpis">
        ${customer360Metric("إجمالي المتابعات", view.totals.followups, `المتأخرة: ${view.totals.overdueFollowups}`)}
        ${customer360Metric("المتابعات القادمة", view.totals.upcomingFollowups, nextFollowup?.nextFollowupDate ? `القادم: ${formatDate(nextFollowup.nextFollowupDate)}` : "لا يوجد موعد قادم")}
        ${customer360Metric("عقود العملاء", view.totals.quotations, `المفتوحة: ${view.totals.openQuotations}`)}
        ${customer360Metric("قيمة العروض", formatCurrency(view.totals.totalQuotationValue), `المقبول: ${formatCurrency(view.totals.acceptedValue)}`)}
        ${customer360Metric("نسبة التحويل", `${view.totals.conversionRate.toFixed(1)}%`, `${view.totals.acceptedQuotations} عروض مقبولة`)}
      </div>

      <section class="customer360-risk-dashboard">
        <article class="customer360-health-gauge ${customer360RiskClass(view.risk.score)}">
          <div class="customer360-gauge-ring" style="--score:${view.risk.healthScore}">
            <div>
              <strong>${view.risk.healthScore}%</strong>
              <span>صحة العميل</span>
            </div>
          </div>
          <div>
            <span>درجة الخطر</span>
            <strong>${view.risk.score}%</strong>
            <small>${escapeHtml(view.risk.priority.label)}</small>
          </div>
        </article>

        <article class="customer360-risk-card">
          <div class="customer360-risk-card-head">
            <div>
              <span>أولوية المتابعة</span>
              <strong>${escapeHtml(view.risk.priority.label)}</strong>
            </div>
            <b class="${customer360PriorityLabelClass(view.risk.priority.key)}">${view.risk.score}% خطر</b>
          </div>
          <div class="customer360-risk-progress">
            <span class="${customer360RiskClass(view.risk.score)}" style="width:${view.risk.score}%"></span>
          </div>
          <ul class="customer360-risk-reasons">
            ${view.risk.reasons.slice(0, 4).map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}
          </ul>
        </article>

        <article class="customer360-next-action">
          <span>الإجراء التالي المقترح</span>
          <strong>${escapeHtml(view.risk.nextAction.title)}</strong>
          <p>${escapeHtml(view.risk.nextAction.detail)}</p>
          <div class="customer360-next-action-metrics">
            <small>التفاعل: ${view.risk.engagementScore}%</small>
            <small>استجابة المتابعة: ${view.risk.responseRate.toFixed(1)}%</small>
          </div>
        </article>
      </section>

      <div class="customer360-value-kpis">
        ${customer360Metric("قيمة العميل المقبولة", formatCurrency(view.totals.acceptedValue), view.risk.valueTier.label)}
        ${customer360Metric("القيمة المحتملة", formatCurrency(view.risk.potentialValue), `المفتوح: ${formatCurrency(view.risk.openValue)}`)}
        ${customer360Metric("قيمة العقود المرفوضة", formatCurrency(view.risk.rejectedValue), "فرص تحتاج مراجعة")}
        ${customer360Metric("مؤشر التفاعل", `${view.risk.engagementScore}%`, `استجابة: ${view.risk.responseRate.toFixed(1)}%`)}
      </div>
    </section>

    <div class="customer360-layout">
      <section class="customer360-main">
        <article class="customer360-section">
          <div class="customer360-section-header">
            <div>
              <h3>البيانات الأساسية</h3>
              <p>ملخص بيانات العميل المسجلة في النظام.</p>
            </div>
          </div>
          <div class="customer-profile-grid customer360-profile-grid">
            ${profile.map(([label, value]) =>
              `<div class="profile-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "—"))}</strong></div>`
            ).join("")}
          </div>
        </article>

        <article class="customer360-section">
          <div class="customer360-section-header">
            <div>
              <h3>عقود العملاء</h3>
              <p>جميع عروض السعر المرتبطة بالعميل.</p>
            </div>
            <span>${view.totals.quotations} عرض</span>
          </div>
          ${view.quotations.length ? `
            <div class="customer360-quotation-list">
              ${view.quotations.map(q => `
                <article>
                  <div>
                    <strong>${escapeHtml(q.code || q.quotationNumber || "عرض بدون رقم")}</strong>
                    <small>${formatDate(q.quotationDate || q.createdAt)} · ${escapeHtml(q.status || "غير محدد")}</small>
                  </div>
                  <div>
                    <strong>${formatCurrency(q.amount)}</strong>
                    ${q.rejectionReason || q.noSaleReason
                      ? `<small>${escapeHtml(q.rejectionReason || q.noSaleReason)}</small>`
                      : ""}
                  </div>
                </article>
              `).join("")}
            </div>
          ` : '<div class="empty-state">لا توجد عروض أسعار لهذا العميل.</div>'}
        </article>
      </section>

      <aside class="customer360-side">
        <article class="customer360-section">
          <div class="customer360-section-header">
            <div>
              <h3>ملخص المتابعة</h3>
              <p>حالة مواعيد المتابعة الحالية.</p>
            </div>
          </div>
          <div class="customer360-followup-summary">
            <div><span>مكتملة</span><strong>${view.totals.completedFollowups}</strong></div>
            <div><span>متأخرة</span><strong>${view.totals.overdueFollowups}</strong></div>
            <div><span>قادمة</span><strong>${view.totals.upcomingFollowups}</strong></div>
          </div>
        </article>

        <article class="customer360-section">
          <div class="customer360-section-header">
            <div>
              <h3>آخر متابعة</h3>
              <p>أحدث تواصل مسجل مع العميل.</p>
            </div>
          </div>
          ${view.latestFollowup ? `
            <div class="customer360-latest-card">
              <strong>${escapeHtml(view.latestFollowup.result || "متابعة")}</strong>
              <span>${formatDate(view.latestFollowup.contactDate || view.latestFollowup.createdAt)}</span>
              <p>${escapeHtml(view.latestFollowup.method || "—")} · ${escapeHtml(view.latestFollowup.representative || "—")}</p>
              ${view.latestFollowup.notes ? `<p>${escapeHtml(view.latestFollowup.notes)}</p>` : ""}
            </div>
          ` : '<div class="empty-state">لم تتم إضافة متابعات.</div>'}
        </article>
      </aside>
    </div>

    <article class="customer360-section customer360-activity-section">
      <div class="customer360-section-header">
        <div>
          <h3>سجل النشاط الموحد</h3>
          <p>جميع أحداث العميل مرتبة من الأحدث إلى الأقدم.</p>
        </div>
        <span>${view.timeline.length} حدث</span>
      </div>

      <div class="customer360-activity-summary">
        <article>
          <span>آخر نشاط</span>
          <strong>${view.latestActivity ? formatDate(view.latestActivity.date) : "—"}</strong>
          <small>${view.latestActivity ? escapeHtml(view.latestActivity.typeLabel) : "لا يوجد نشاط"}</small>
        </article>
        <article>
          <span>المتابعات</span>
          <strong>${view.followups.length}</strong>
          <small>إجمالي المتابعات</small>
        </article>
        <article>
          <span>عقود العملاء</span>
          <strong>${view.quotations.length}</strong>
          <small>إجمالي العروض</small>
        </article>
      </div>

      <div class="customer360-activity-filters">
        <button type="button" class="customer360-activity-filter active" data-customer360-filter="all">الكل</button>
        <button type="button" class="customer360-activity-filter" data-customer360-filter="followup">المتابعات</button>
        <button type="button" class="customer360-activity-filter" data-customer360-filter="quotation">عقود العملاء</button>
        <button type="button" class="customer360-activity-filter" data-customer360-filter="customer">بيانات العميل</button>
      </div>

      <div id="customer360UnifiedTimeline" class="customer360-unified-timeline"></div>
    </article>

    <article class="customer360-section customer360-timeline-section">
      <div class="customer360-section-header">
        <div>
          <h3>سجل المتابعات</h3>
          <p>جميع عمليات التواصل مرتبة من الأحدث إلى الأقدم.</p>
        </div>
        <span>${view.totals.followups} متابعة</span>
      </div>
      ${view.followups.length ? `<div class="timeline customer360-timeline">${view.followups.map(item => `
        <div class="timeline-item">
          <span class="timeline-dot"></span>
          <div class="timeline-card">
            <div class="timeline-card-header">
              <strong>${escapeHtml(item.result || "متابعة")}</strong>
              <span>${formatDate(item.contactDate || item.createdAt)}</span>
            </div>
            <p>${escapeHtml(item.method || "—")} · ${escapeHtml(item.representative || "—")}</p>
            ${item.quotationNumber ? `<p>العقد: ${escapeHtml(item.quotationNumber)}</p>` : ""}
            ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
            ${item.nextFollowupDate ? `<p>المتابعة القادمة: ${formatDate(item.nextFollowupDate)}</p>` : ""}
          </div>
        </div>`).join("")}</div>` : '<div class="empty-state">لم تتم إضافة متابعات لهذا العميل.</div>'}
    </article>
  `;

  document.querySelectorAll("[data-customer360-filter]").forEach(button => {
    button.addEventListener("click", () => {
      customer360ActivityFilter = button.dataset.customer360Filter;
      document.querySelectorAll("[data-customer360-filter]").forEach(item => {
        item.classList.toggle("active", item === button);
      });
      renderCustomer360UnifiedTimeline(view);
    });
  });

  customer360ActivityFilter = "all";
  renderCustomer360UnifiedTimeline(view);
  document.getElementById("customerDetailsDialog").showModal();
}


function dailyPerformanceSelectedDate() {
  return document.getElementById("dailyPerformanceDate")?.value
    || window.DailyPerformanceService?.localDate?.()
    || dailyLocalDate();
}

function dailyPerformanceFilteredRows() {
  const filter = document.getElementById(
    "dailyPerformanceRepresentativeFilter"
  )?.value || "";

  const rows = dailyPerformanceSnapshot?.rows || [];
  return filter
    ? rows.filter(item => item.key === filter)
    : rows;
}

function populateDailyPerformanceEmployees() {
  const select = document.getElementById(
    "dailyPerformanceRepresentativeFilter"
  );
  if (!select || !dailyPerformanceSnapshot) return;

  const selected = select.value;
  const options = dailyPerformanceSnapshot.rows.map(item => ({
    value: item.key,
    label: item.code
      ? `${item.name} — ${item.code}`
      : item.name
  }));

  select.innerHTML = [
    '<option value="">كل الموظفين</option>',
    ...options.map(item =>
      `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`
    )
  ].join("");

  if (options.some(item => item.value === selected)) {
    select.value = selected;
  }
}

function populateDailyTasksEmployees() {
  const select = document.getElementById("dailyTasksEmployeeFilter");
  if (!select || !dailyPerformanceSnapshot) return;

  const selected = select.value;
  const options = dailyPerformanceSnapshot.rows.map(item => ({
    value: item.key,
    label: item.code ? `${item.name} — ${item.code}` : item.name
  }));

  select.innerHTML = [
    '<option value="">اختر الموظف</option>',
    ...options.map(item =>
      `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`
    )
  ].join("");

  if (options.some(item => item.value === selected)) select.value = selected;
}

function resetDailyTasksReportView() {
  dailyTasksReportRequested = false;
  const container = document.getElementById("dailyPerformanceDetailContent");
  if (container && dailyPerformanceDetailType === "tasks") {
    container.innerHTML = '<div class="empty-state">اختر الموظف ثم اضغط عرض بيانات التقرير.</div>';
  }
}

function dailyPerformanceStatusIcon(completed) {
  return completed
    ? '<span class="daily-performance-status completed"><b>✓</b> تم التحديث</span>'
    : '<span class="daily-performance-status missed"><b>×</b> لم يتم التحديث</span>';
}

function renderDailyPerformanceDetail() {
  if (!dailyPerformanceSnapshot) return;

  const rows = dailyPerformanceFilteredRows();
  const container = document.getElementById("dailyPerformanceDetailContent");
  const title = document.getElementById("dailyPerformanceDetailTitle");
  const subtitle = document.getElementById("dailyPerformanceDetailSubtitle");

  const configs = {
    tasks: {
      title: "المهام اليومية",
      subtitle: "حالة تنفيذ كل مهمة لكل موظف."
    },
    targets: {
      title: "تحقيق الأهداف",
      subtitle: "مقارنة النشاط الفعلي بالأهداف اليومية."
    },
    followups: {
      title: "المتابعات اليومية",
      subtitle: "تفاصيل العملاء الذين تمت متابعتهم خلال اليوم."
    },
    customers: {
      title: "العملاء الجدد",
      subtitle: "العملاء الذين تمت إضافتهم خلال اليوم."
    },
    quotations: {
      title: "عقود العملاء",
      subtitle: "عقود العملاء التي تم إنشاؤها خلال اليوم."
    },
    overdue: {
      title: "المتابعات المتأخرة",
      subtitle: "المتابعات غير المغلقة التي تجاوزت موعدها."
    }
  };

  const config = configs[dailyPerformanceDetailType] || configs.tasks;
  title.textContent = config.title;
  subtitle.textContent = config.subtitle;

  const taskControls = document.getElementById("dailyTasksReportControls");
  if (taskControls) taskControls.classList.toggle("hidden", dailyPerformanceDetailType !== "tasks");

  if (dailyPerformanceDetailType === "tasks") {
    const selectedEmployee = document.getElementById("dailyTasksEmployeeFilter")?.value || "";
    if (!dailyTasksReportRequested || !selectedEmployee) {
      container.innerHTML = '<div class="empty-state">اختر الموظف ثم اضغط عرض بيانات التقرير.</div>';
      return;
    }
    const taskRows = (dailyPerformanceSnapshot?.rows || []).filter(item => item.key === selectedEmployee);
    container.innerHTML = `
      <div class="daily-performance-task-cards">
        ${taskRows.map(item => `
          <article>
            <div class="daily-performance-task-card-head">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${item.completedTasks} من ${item.taskStates.length} مهام</small>
              </div>
              <b>${item.checklistRate}%</b>
            </div>
            <div class="daily-performance-task-list">
              ${item.taskStates.map(task => `
                <div>
                  ${dailyPerformanceStatusIcon(task.completed)}
                  <span>${escapeHtml(task.taskName)}</span>
                  <small>${task.completedAt ? dailyDateTime(task.completedAt) : "—"}</small>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("") || '<div class="empty-state">لا توجد بيانات.</div>'}
      </div>`;
    return;
  }

  if (dailyPerformanceDetailType === "targets") {
    container.innerHTML = `
      <div class="daily-performance-target-cards">
        ${rows.map(item => `
          <article>
            <div class="daily-performance-target-card-head">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${item.completionRate}% إنجاز كلي</span>
            </div>
            ${[
              ["العملاء الجدد", item.customers.length, item.targets.customers, item.targetRates.customers],
              ["المتابعات", item.followups.length, item.targets.followups, item.targetRates.followups],
              ["عقود العملاء", item.quotations.length, item.targets.quotations, item.targetRates.quotations]
            ].map(([label, actual, target, rate]) => `
              <div class="daily-performance-target-row">
                <div><span>${label}</span><strong>${actual} / ${target}</strong></div>
                <div class="daily-performance-target-track"><span style="width:${rate}%"></span></div>
                <b class="${rate >= 100 ? "met" : "pending"}">${rate}%</b>
              </div>
            `).join("")}
          </article>
        `).join("") || '<div class="empty-state">لا توجد بيانات.</div>'}
      </div>`;
    return;
  }

  const sourceMap = {
    followups: {
      rows: rows.flatMap(employee =>
        employee.followups.map(item => ({ employee, item }))
      ),
      headers: ["الموظف", "العميل", "الطريقة", "النتيجة", "الموعد القادم"],
      cells: ({ employee, item }) => [
        employee.name,
        item.customerName || "—",
        item.method || "—",
        item.result || "—",
        item.nextFollowupDate ? formatDate(item.nextFollowupDate) : "—"
      ]
    },
    customers: {
      rows: rows.flatMap(employee =>
        employee.customers.map(item => ({ employee, item }))
      ),
      headers: ["الموظف", "العميل", "التصنيف", "اسم المسؤول", "وقت الإضافة"],
      cells: ({ employee, item }) => [
        employee.name,
        item.name || "—",
        item.type || "—",
        item.contactPersonName || "—",
        dailyDateTime(item.createdAt || item.contactDate)
      ]
    },
    quotations: {
      rows: rows.flatMap(employee =>
        employee.quotations.map(item => ({ employee, item }))
      ),
      headers: ["الموظف", "العميل", "رقم العقد", "الحالة", "القيمة"],
      cells: ({ employee, item }) => [
        employee.name,
        item.customerName || "—",
        item.code || item.quotationNumber || "—",
        item.status || "—",
        formatCurrency(item.amount || 0)
      ]
    },
    overdue: {
      rows: rows.flatMap(employee =>
        employee.overdueFollowups.map(item => ({ employee, item }))
      ),
      headers: ["الموظف", "العميل", "موعد المتابعة", "النتيجة السابقة", "الحالة"],
      cells: ({ employee, item }) => [
        employee.name,
        item.customerName || "—",
        formatDate(item.nextFollowupDate),
        item.result || "—",
        "متأخرة"
      ]
    }
  };

  const source = sourceMap[dailyPerformanceDetailType];
  const tableRows = source?.rows || [];

  container.innerHTML = `
    <div class="table-wrap">
      <table class="daily-performance-detail-table">
        <thead>
          <tr>${source.headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${tableRows.length
            ? tableRows.map(row => `
              <tr>${source.cells(row).map(value => `<td>${escapeHtml(String(value ?? "—"))}</td>`).join("")}</tr>
            `).join("")
            : `<tr><td colspan="${source.headers.length}" class="empty-state">لا توجد بيانات في هذا التقرير.</td></tr>`
          }
        </tbody>
      </table>
    </div>`;
}

function renderDailyPerformanceReport() {
  if (!dailyPerformanceSnapshot) return;

  const rows = dailyPerformanceFilteredRows();
  const snapshot = dailyPerformanceSnapshot;
  const employeeCount = rows.length;
  const targetEmployeeCount = rows.filter(item => item.requiresTargets !== false).length;

  const totalTaskSlots = rows.reduce(
    (sum, item) => sum + item.taskStates.length,
    0
  );
  const completedTaskSlots = rows.reduce(
    (sum, item) => sum + item.completedTasks,
    0
  );

  const customersTargetMet = rows.filter(
    item => item.targetsMet.customers
  ).length;
  const followupsTargetMet = rows.filter(
    item => item.targetsMet.followups
  ).length;
  const quotationsTargetMet = rows.filter(
    item => item.targetsMet.quotations
  ).length;
  const overdue = rows.reduce(
    (sum, item) => sum + item.overdueFollowups.length,
    0
  );

  document.getElementById("dailyPerformanceEmployees").textContent =
    employeeCount;
  document.getElementById("dailyPerformanceChecklistRate").textContent =
    `${totalTaskSlots ? Math.round(completedTaskSlots / totalTaskSlots * 100) : 0}%`;
  document.getElementById("dailyPerformanceChecklistText").textContent =
    `${completedTaskSlots} من ${totalTaskSlots}`;
  document.getElementById("dailyPerformanceCustomersTargetMet").textContent =
    customersTargetMet;
  document.getElementById("dailyPerformanceCustomersTargetRate").textContent =
    `${targetEmployeeCount ? Math.round(customersTargetMet / targetEmployeeCount * 100) : 0}% من الموظفين الخاضعين للأهداف`;
  document.getElementById("dailyPerformanceFollowupsTargetMet").textContent =
    followupsTargetMet;
  document.getElementById("dailyPerformanceFollowupsTargetRate").textContent =
    `${targetEmployeeCount ? Math.round(followupsTargetMet / targetEmployeeCount * 100) : 0}% من الموظفين الخاضعين للأهداف`;
  document.getElementById("dailyPerformanceQuotationsTargetMet").textContent =
    quotationsTargetMet;
  document.getElementById("dailyPerformanceQuotationsTargetRate").textContent =
    `${targetEmployeeCount ? Math.round(quotationsTargetMet / targetEmployeeCount * 100) : 0}% من الموظفين الخاضعين للأهداف`;
  document.getElementById("dailyPerformanceOverdue").textContent = overdue;

  document.getElementById("dailyPerformanceManagerNoteTitle").textContent =
    snapshot.managerNote?.title || "لا توجد ملاحظة.";
  document.getElementById("dailyPerformanceManagerNoteText").textContent =
    snapshot.managerNote?.noteText || "لم يتم تسجيل توجيه لهذا اليوم.";
  document.getElementById("dailyPerformanceManagerNoteDate").textContent =
    snapshot.managerNote?.updatedAt
      ? dailyDateTime(snapshot.managerNote.updatedAt)
      : "—";

  const leaderboard = document.getElementById(
    "dailyPerformanceLeaderboard"
  );
  leaderboard.innerHTML = rows.length
    ? rows.slice(0, 10).map(item => `
      <article class="daily-performance-rank rank-${item.rank}">
        <span class="rank">${item.rank}</span>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${item.completedTasks}/${item.taskStates.length} مهام · ${item.followups.length} متابعة · ${item.customers.length} عميل · ${item.quotations.length} عرض</small>
          <div class="daily-performance-progress">
            <span style="width:${item.completionRate}%"></span>
          </div>
        </div>
        <div>
          <strong>${item.points}</strong>
          <small>نقطة</small>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد بيانات موظفين.</div>';

  const matrixHead = document.getElementById("dailyTaskMatrixHead");
  const matrixBody = document.getElementById("dailyTaskMatrixBody");

  matrixHead.innerHTML = `
    <tr>
      <th>الموظف</th>
      ${snapshot.definitions.map(definition =>
        `<th>${escapeHtml(definition.task_name)}</th>`
      ).join("")}
      <th>الإنجاز</th>
    </tr>`;

  matrixBody.innerHTML = rows.length
    ? rows.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        ${item.taskStates.map(task => `
          <td>${dailyPerformanceStatusIcon(task.completed)}</td>
        `).join("")}
        <td><strong>${item.checklistRate}%</strong></td>
      </tr>
    `).join("")
    : `<tr><td colspan="${snapshot.definitions.length + 2}" class="empty-state">لا توجد بيانات.</td></tr>`;

  const body = document.getElementById("dailyPerformanceBody");
  body.innerHTML = rows.length
    ? rows.map(item => `
      <tr>
        <td><strong>${item.rank}</strong></td>
        <td>
          <strong>${escapeHtml(item.name)}</strong><br>
          <small>${escapeHtml(item.code || item.role || "—")}</small>
        </td>
        <td>
          <span class="daily-performance-checklist-summary">
            ${item.completedTasks}/${item.taskStates.length}
          </span>
        </td>
        <td>${item.customers.length} / ${item.targets.customers}</td>
        <td>${item.followups.length} / ${item.targets.followups}</td>
        <td>${item.quotations.length} / ${item.targets.quotations}</td>
        <td>
          <div class="daily-performance-target-badges">
            <span class="${item.targetsMet.customers ? "met" : "pending"}">عملاء</span>
            <span class="${item.targetsMet.followups ? "met" : "pending"}">متابعات</span>
            <span class="${item.targetsMet.quotations ? "met" : "pending"}">عروض</span>
          </div>
        </td>
        <td class="${item.overdueFollowups.length ? "daily-performance-overdue-value" : ""}">
          ${item.overdueFollowups.length}
        </td>
        <td>
          <div class="daily-performance-table-progress">
            <span style="width:${item.completionRate}%"></span>
          </div>
          <small>${item.completionRate}%</small>
        </td>
        <td><strong>${item.points}</strong></td>
      </tr>
    `).join("")
    : '<tr><td colspan="10" class="empty-state">لا توجد بيانات مطابقة.</td></tr>';

  renderDailyPerformanceDetail();
  renderDailyAlertsReport();
}

async function loadDailyPerformanceReport(force = false) {
  if (dailyPerformanceLoading || !window.DailyPerformanceService) return;
  dailyPerformanceLoading = true;

  showDataStatus(
    "dailyPerformanceStatus",
    "جاري تحميل تقرير الأداء اليومي...",
    "info"
  );

  try {
    if (force) {
      await Promise.all([
        loadCustomersFromSupabase(true),
        loadFollowupsFromSupabase(true),
        loadQuotationsFromSupabase(true)
      ]);
    }

    dailyPerformanceSnapshot =
      await window.DailyPerformanceService.loadReport(
        dailyPerformanceSelectedDate(),
        { customers, followups, quotations },
        { force }
      );

    dailyPerformanceSnapshot.alerts = window.DailyAlertsService
      ? await window.DailyAlertsService.list(dailyPerformanceSelectedDate())
      : [];

    populateDailyPerformanceEmployees();
    renderDailyPerformanceReport();
    await loadDailyActivityReport();
    showDataStatus(
      "dailyPerformanceStatus",
      `تم تحديث التقرير في ${new Date().toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn")}.`,
      "success"
    );
  } catch (error) {
    showDataStatus(
      "dailyPerformanceStatus",
      error instanceof Error
        ? error.message
        : "تعذر تحميل تقرير الأداء اليومي.",
      "error"
    );
  } finally {
    dailyPerformanceLoading = false;
  }
}

function resetDailyPerformanceFilters() {
  const date = document.getElementById("dailyPerformanceDate");
  const employee = document.getElementById(
    "dailyPerformanceRepresentativeFilter"
  );

  if (date) {
    date.value = window.DailyPerformanceService?.localDate?.()
      || dailyLocalDate();
  }
  if (employee) employee.value = "";

  const activityEmployee = document.getElementById("dailyActivityEmployeeFilter");
  const activityType = document.getElementById("dailyActivityTypeFilter");
  const tasksEmployee = document.getElementById("dailyTasksEmployeeFilter");
  if (activityEmployee) activityEmployee.value = "";
  if (activityType) activityType.value = "";
  if (tasksEmployee) tasksEmployee.value = "";
  dailyActivityReportRequested = false;
  dailyTasksReportRequested = false;
  loadDailyPerformanceReport(true);
}

function exportDailyPerformanceCsv() {
  if (!dailyPerformanceSnapshot) return;

  const filter = document.getElementById(
    "dailyPerformanceRepresentativeFilter"
  )?.value || "";

  const report = filter
    ? {
        ...dailyPerformanceSnapshot,
        rows: dailyPerformanceFilteredRows()
      }
    : dailyPerformanceSnapshot;

  downloadTextFile(
    `petatoe-daily-performance-${report.workDate}.csv`,
    window.DailyPerformanceService.toCsv(report),
    "text/csv;charset=utf-8"
  );
}

function dailyPerformancePdfEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function dailyPerformancePdfClone() {
  const source = document.getElementById("dailyPerformanceReportView");
  if (!source) throw new Error("تعذر الوصول إلى محتوى تقرير الأداء اليومي.");

  const clone = source.cloneNode(true);
  clone.classList.remove("hidden");
  clone.removeAttribute("id");

  clone.querySelectorAll(
    ".daily-performance-header, .daily-performance-filters, #dailyPerformanceStatus, button, .daily-report-show-btn"
  ).forEach(element => element.remove());

  clone.querySelectorAll("select, input").forEach(control => {
    const replacement = document.createElement("span");
    replacement.className = "pdf-control-value";
    replacement.textContent = control.tagName === "SELECT"
      ? control.options?.[control.selectedIndex]?.textContent || "—"
      : control.value || "—";
    control.replaceWith(replacement);
  });

  clone.querySelectorAll(".hidden").forEach(element => element.remove());
  clone.querySelectorAll(".empty-state").forEach(element => {
    if (!element.textContent?.trim()) element.remove();
  });

  return clone.innerHTML;
}

function exportDailyPerformancePdf() {
  if (!dailyPerformanceSnapshot) {
    showDataStatus(
      "dailyPerformanceStatus",
      "حمّل تقرير الأداء اليومي أولًا قبل تصدير PDF.",
      "error"
    );
    return;
  }

  const popup = window.open("", "_blank");
  if (!popup) {
    alert("اسمح بالنوافذ المنبثقة لتصدير تقرير PDF.");
    return;
  }

  const selectedDate = document.getElementById("dailyPerformanceDate")?.value
    || dailyPerformanceSnapshot.workDate
    || dailyLocalDate();
  const employeeSelect = document.getElementById("dailyPerformanceRepresentativeFilter");
  const employeeLabel = employeeSelect?.options?.[employeeSelect.selectedIndex]?.textContent
    || "كل الموظفين";
  const generatedAt = new Date().toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const logoUrl = new URL("assets/images/kyum-header-logo.png", document.baseURI).href;
  const reportHtml = dailyPerformancePdfClone();

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تقرير الأداء اليومي - ${dailyPerformancePdfEscape(selectedDate)}</title>
<style>
@page{size:A4 landscape;margin:11mm 10mm 13mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:Tahoma,Arial,sans-serif;direction:rtl}
body{font-size:11px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pdf-report-header{display:grid;grid-template-columns:170px 1fr 230px;align-items:center;gap:18px;padding:14px 18px;border:1px solid #0c3857;border-radius:18px;background:linear-gradient(135deg,#06192c,#0a3651);color:#fff;margin-bottom:14px;box-shadow:0 6px 18px rgba(2,19,35,.16)}
.pdf-report-header img{width:150px;max-height:72px;object-fit:contain;border-radius:10px}
.pdf-report-title{text-align:center}.pdf-report-title h1{font-size:26px;margin:0 0 4px}.pdf-report-title p{margin:0;color:#c9d8e5;font-size:12px}
.pdf-report-meta{font-size:10px;line-height:1.9;border-right:1px solid rgba(255,255,255,.25);padding-right:14px}.pdf-report-meta strong{color:#f4bd3c}
.pdf-report-body{width:100%}
.pdf-report-body>.view-section{display:block!important}
.daily-performance-manager-note,.daily-performance-kpis article,.panel{background:#fff!important;border:1px solid #d8e1ea!important;border-radius:12px!important;box-shadow:none!important;color:#111827!important}
.daily-performance-manager-note{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 14px;margin:0 0 12px;border-right:4px solid #16a3d8!important}
.daily-performance-manager-note span,.daily-performance-manager-note small,.panel p{color:#667085!important}
.daily-performance-manager-note strong{display:block;font-size:14px;margin:3px 0}.daily-performance-manager-note p{margin:0}
.daily-performance-kpis{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:8px!important;margin:0 0 12px!important}
.daily-performance-kpis article{padding:10px!important;min-height:74px!important;break-inside:avoid}.daily-performance-kpis span{display:block;color:#667085!important;font-size:9px}.daily-performance-kpis strong{display:block;font-size:19px;margin:5px 0}.daily-performance-kpis small{color:#667085!important;font-size:8px}.daily-performance-kpis .attention{border-right:4px solid #e11d48!important}
.panel{padding:12px!important;margin:0 0 12px!important;break-inside:auto}.panel-header{display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 9px;padding:0 0 7px;border-bottom:1px solid #e5e7eb}.panel-header h3{font-size:14px;margin:0}.panel-header p{margin:2px 0 0;font-size:9px}
.daily-performance-leaderboard{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}.daily-performance-leaderboard>*{break-inside:avoid;background:#f8fafc!important;border:1px solid #dde5ed!important;border-radius:9px!important;padding:8px!important}
.table-wrap{overflow:visible!important;width:100%!important}
table{width:100%!important;border-collapse:collapse!important;table-layout:auto!important;min-width:0!important;background:#fff!important}thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #dbe3ea!important;padding:5px 6px!important;text-align:right!important;vertical-align:middle!important;color:#111827!important;font-size:8.2px!important;white-space:normal!important}th{background:#eaf1f6!important;font-weight:700!important;color:#0b2940!important}
.daily-activity-timeline{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}.daily-activity-timeline>*{break-inside:avoid;border:1px solid #dbe3ea!important;border-radius:8px!important;background:#f8fafc!important;padding:8px!important}
.daily-activity-filters,.daily-performance-detail-controls,.daily-tasks-report-controls{display:none!important}
.pdf-control-value{display:inline-block;padding:3px 7px;border:1px solid #dbe3ea;border-radius:6px;background:#f8fafc}
.badge,.status-badge{border:1px solid #cbd5e1!important;background:#f8fafc!important;color:#111827!important}
.pdf-report-footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:7px;border-top:1px solid #cbd5e1;color:#64748b;font-size:8px}
@media print{.panel{page-break-inside:auto}.daily-performance-manager-note,.daily-performance-kpis article,.daily-performance-leaderboard>*{page-break-inside:avoid}}
</style>
</head>
<body>
<header class="pdf-report-header">
  <img src="${dailyPerformancePdfEscape(logoUrl)}" alt="KYUM">
  <div class="pdf-report-title"><h1>تقرير الأداء اليومي</h1><p>متابعة تنفيذ المهام والنشاط اليومي للموظفين</p></div>
  <div class="pdf-report-meta">
    <div><strong>تاريخ التقرير:</strong> ${dailyPerformancePdfEscape(selectedDate)}</div>
    <div><strong>الموظف / المندوب:</strong> ${dailyPerformancePdfEscape(employeeLabel)}</div>
    <div><strong>وقت التصدير:</strong> ${dailyPerformancePdfEscape(generatedAt)}</div>
  </div>
</header>
<main class="pdf-report-body">${reportHtml}</main>
<footer class="pdf-report-footer"><span>PETATOE — Enterprise Daily Performance Report</span><span>نسخة مخصصة للطباعة والحفظ بصيغة PDF</span></footer>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));<\/script>
</body>
</html>`);
  popup.document.close();
}


async function createDailyPerformancePdfFile() {
  if (!dailyPerformanceSnapshot) {
    throw new Error("حمّل تقرير الأداء اليومي أولًا قبل تجهيز PDF.");
  }
  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    throw new Error("تعذر تحميل أدوات إنشاء ملف PDF.");
  }

  const source = document.getElementById("dailyPerformanceReportView");
  if (!source) throw new Error("تعذر الوصول إلى محتوى تقرير الأداء اليومي.");

  const selectedDate = document.getElementById("dailyPerformanceDate")?.value
    || dailyPerformanceSnapshot.workDate
    || dailyLocalDate();
  const employeeSelect = document.getElementById("dailyPerformanceRepresentativeFilter");
  const employeeLabel = employeeSelect?.options?.[employeeSelect.selectedIndex]?.textContent
    || "كل الموظفين";

  const host = document.createElement("section");
  host.setAttribute("dir", "rtl");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1400px;background:#fff;color:#111827;padding:28px;font-family:Tahoma,Arial,sans-serif;z-index:-1";
  host.innerHTML = `
    <header style="display:grid;grid-template-columns:180px 1fr 290px;align-items:center;gap:20px;padding:18px 22px;border-radius:20px;background:linear-gradient(135deg,#06192c,#0a3651);color:#fff;margin-bottom:18px">
      <img src="assets/images/kyum-header-logo.png" alt="KYUM" style="width:165px;max-height:78px;object-fit:contain;border-radius:12px">
      <div style="text-align:center"><h1 style="margin:0 0 6px;font-size:30px">تقرير الأداء اليومي</h1><p style="margin:0;color:#d5e3ee;font-size:15px">متابعة تنفيذ المهام والنشاط اليومي للموظفين</p></div>
      <div style="font-size:13px;line-height:2;border-right:1px solid rgba(255,255,255,.25);padding-right:18px">
        <div><strong style="color:#f4bd3c">تاريخ التقرير:</strong> ${dailyPerformancePdfEscape(selectedDate)}</div>
        <div><strong style="color:#f4bd3c">الموظف / المندوب:</strong> ${dailyPerformancePdfEscape(employeeLabel)}</div>
      </div>
    </header>
  `;

  const clone = source.cloneNode(true);
  clone.classList.remove("hidden");
  clone.removeAttribute("id");
  clone.querySelectorAll(".daily-performance-header, .daily-performance-filters, #dailyPerformanceStatus, button, .daily-report-show-btn").forEach(el => el.remove());
  clone.querySelectorAll("select, input").forEach(control => {
    const replacement = document.createElement("span");
    replacement.textContent = control.tagName === "SELECT"
      ? control.options?.[control.selectedIndex]?.textContent || "—"
      : control.value || "—";
    replacement.style.cssText = "display:inline-block;padding:5px 9px;border:1px solid #dbe3ea;border-radius:7px;background:#f8fafc";
    control.replaceWith(replacement);
  });
  clone.querySelectorAll(".hidden").forEach(el => el.remove());
  clone.style.cssText = "display:block!important;width:100%!important;background:#fff!important;color:#111827!important";
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const canvas = await window.html2canvas(host, {
      scale: 1.35,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 1400,
      scrollX: 0,
      scrollY: 0
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const imageWidth = pageWidth - margin * 2;
    const imageHeight = canvas.height * imageWidth / canvas.width;
    const usableHeight = pageHeight - margin * 2;
    let offset = 0;
    const imageData = canvas.toDataURL("image/jpeg", 0.93);
    while (offset < imageHeight) {
      if (offset > 0) pdf.addPage();
      pdf.addImage(imageData, "JPEG", margin, margin - offset, imageWidth, imageHeight, undefined, "FAST");
      offset += usableHeight;
    }
    const fileName = `kyum-daily-performance-${selectedDate}.pdf`;
    const blob = pdf.output("blob");
    return new File([blob], fileName, { type: "application/pdf" });
  } finally {
    host.remove();
  }
}

function downloadDailyPerformancePdfFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function sendDailyPerformanceWhatsappPdf(event) {
  const button = event?.currentTarget || document.getElementById("sendDailyPerformanceWhatsappPdfBtn");
  const originalText = button?.textContent || "إرسال التقرير واتساب PDF";
  if (button?.disabled) return;
  if (button) { button.disabled = true; button.textContent = "جاري تجهيز PDF..."; }

  try {
    const file = await createDailyPerformancePdfFile();
    const selectedDate = document.getElementById("dailyPerformanceDate")?.value
      || dailyPerformanceSnapshot?.workDate
      || dailyLocalDate();
    const message = `تقرير الأداء اليومي\nالتاريخ: ${selectedDate}\nمرفق تقرير الأداء بصيغة PDF.`;
    const shareData = { title: `تقرير الأداء اليومي - ${selectedDate}`, text: message, files: [file] };

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      if (button) button.textContent = "تم تجهيز التقرير";
      await navigator.share(shareData);
    } else {
      downloadDailyPerformancePdfFile(file);
      if (button) button.textContent = "تم تجهيز التقرير";
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message + "\nتم تنزيل ملف PDF على الجهاز لإرفاقه بالمحادثة.")}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      showDataStatus("dailyPerformanceStatus", "تم تنزيل ملف PDF وفتح واتساب. أرفق الملف الذي تم تنزيله بالمحادثة.", "success");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("Daily performance WhatsApp PDF error", error);
      showDataStatus("dailyPerformanceStatus", error?.message || "تعذر تجهيز تقرير PDF للمشاركة.", "error");
      if (button) button.textContent = "تعذر التجهيز";
    }
  } finally {
    setTimeout(() => {
      if (button) { button.disabled = false; button.textContent = originalText; }
    }, 1200);
  }
}



function filteredReportControlLabel(id, fallback = "الكل") {
  const control = document.getElementById(id);
  if (!control) return fallback;
  if (control.tagName === "SELECT") return control.options?.[control.selectedIndex]?.textContent?.trim() || fallback;
  return control.value?.trim() || fallback;
}

function reportFileSafe(value) {
  return String(value || "report").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "report";
}

async function createFilteredListPdfFile(config) {
  if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("تعذر تحميل أدوات إنشاء ملف PDF.");
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const generatedAt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date());
  const host = document.createElement("section");
  host.setAttribute("dir", "rtl");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1400px;background:#fff;color:#111827;padding:28px;font-family:Tahoma,Arial,sans-serif;z-index:-1";
  const meta = (config.filters || []).map(([label,value]) => `<div><strong style="color:#f4bd3c">${dailyPerformancePdfEscape(label)}:</strong> ${dailyPerformancePdfEscape(value || "الكل")}</div>`).join("");
  const head = config.columns.map(col => `<th>${dailyPerformancePdfEscape(col.label)}</th>`).join("");
  const body = rows.length ? rows.map(row => `<tr>${config.columns.map(col => `<td>${dailyPerformancePdfEscape(typeof col.value === "function" ? col.value(row) : row?.[col.value] ?? "—")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${config.columns.length}" style="padding:30px;text-align:center">لا توجد بيانات مطابقة للفلاتر المحددة.</td></tr>`;
  host.innerHTML = `
    <header style="display:grid;grid-template-columns:180px 1fr 360px;align-items:center;gap:20px;padding:18px 22px;border-radius:20px;background:linear-gradient(135deg,#06192c,#0a3651);color:#fff;margin-bottom:18px">
      <img src="assets/images/kyum-header-logo.png" alt="KYUM" style="width:165px;max-height:78px;object-fit:contain;border-radius:12px">
      <div style="text-align:center"><h1 style="margin:0 0 6px;font-size:30px">${dailyPerformancePdfEscape(config.title)}</h1><p style="margin:0;color:#d5e3ee;font-size:15px">${dailyPerformancePdfEscape(config.subtitle)}</p></div>
      <div style="font-size:12px;line-height:1.9;border-right:1px solid rgba(255,255,255,.25);padding-right:18px">${meta}<div><strong style="color:#f4bd3c">عدد النتائج:</strong> ${rows.length}</div><div><strong style="color:#f4bd3c">وقت التصدير:</strong> ${dailyPerformancePdfEscape(generatedAt)}</div></div>
    </header>
    <table style="width:100%;border-collapse:collapse;table-layout:auto;background:#fff">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
    </table>`;
  host.querySelectorAll("th").forEach(el => el.style.cssText="border:1px solid #cbd5e1;padding:9px 7px;background:#1f5cae;color:#fff;font-size:12px;text-align:right");
  host.querySelectorAll("td").forEach(el => el.style.cssText="border:1px solid #dbe3ea;padding:8px 7px;color:#111827;font-size:11px;text-align:right;vertical-align:top;white-space:normal");
  document.body.appendChild(host);
  try {
    const canvas = await window.html2canvas(host,{scale:1.25,useCORS:true,backgroundColor:"#ffffff",logging:false,windowWidth:1400,scrollX:0,scrollY:0});
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:"landscape",unit:"mm",format:"a4",compress:true});
    const pw=pdf.internal.pageSize.getWidth(), ph=pdf.internal.pageSize.getHeight(), margin=6;
    const iw=pw-margin*2, ih=canvas.height*iw/canvas.width, usable=ph-margin*2;
    const data=canvas.toDataURL("image/jpeg",0.93); let offset=0;
    while(offset<ih){ if(offset>0) pdf.addPage(); pdf.addImage(data,"JPEG",margin,margin-offset,iw,ih,undefined,"FAST"); offset+=usable; }
    return new File([pdf.output("blob")],`${config.fileName}.pdf`,{type:"application/pdf"});
  } finally { host.remove(); }
}

function followupReportConfig() {
  const rows = filteredFollowups();
  return {
    title:"تقرير المتابعات",
    subtitle:"التقرير يعكس الفلاتر المحددة في شاشة المتابعات",
    fileName:`kyum-followups-${new Date().toISOString().slice(0,10)}`,
    rows,
    filters:[
      ["البحث", filteredReportControlLabel("followupSearch","بدون بحث")],
      ["الحالة", filteredReportControlLabel("followupStatusFilter")],
      ["المندوب", filteredReportControlLabel("followupRepFilter")]
    ],
    columns:[
      {label:"العميل",value:r=>customerById(r.customerId)?.name || r.customerName || "—"},
      {label:"رقم العميل",value:r=>customerById(r.customerId)?.phone || r.customerPhone || "—"},
      {label:"تاريخ التواصل",value:r=>formatDate(r.contactDate)},
      {label:"طريقة التواصل",value:"method"},
      {label:"المندوب",value:r=>r.representative || "—"},
      {label:"نتيجة التواصل",value:r=>r.result || "—"},
      {label:"العقد",value:r=>r.quotationNumber || "—"},
      {label:"المتابعة القادمة",value:r=>formatDate(r.nextFollowupDate)},
      {label:"الحالة",value:r=>statusLabel(followupStatus(r))}
    ]
  };
}

function quotationReportConfig() {
  const rows = filteredQuotations();
  return {
    title:"تقرير عقود العملاء",
    subtitle:"التقرير يعكس الفلاتر المحددة في شاشة عقود العملاء",
    fileName:`kyum-quotations-${new Date().toISOString().slice(0,10)}`,
    rows,
    filters:[
      ["البحث", filteredReportControlLabel("quotationSearch","بدون بحث")],
      ["الحالة", filteredReportControlLabel("quotationStatusFilter")],
      ["حالة التحويل", filteredReportControlLabel("quotationWorkflowFilter")],
      ["المندوب", filteredReportControlLabel("quotationRepFilter")]
    ],
    columns:[
      {label:"رقم العقد",value:r=>r.code || "—"},
      {label:"رقم طلب العميل",value:r=>r.customerOrderNumber || "—"},
      {label:"العميل",value:r=>customerById(r.customerId)?.name || r.customerName || "—"},
      {label:"رقم العميل",value:r=>customerById(r.customerId)?.phone || r.customerPhone || "—"},
      {label:"المندوب",value:r=>r.representative || "—"},
      {label:"تاريخ العقد",value:r=>formatDate(r.quotationDate)},
      {label:"القيمة",value:r=>formatCurrency(r.amount)},
      {label:"الحالة",value:r=>canonicalQuotationStatus(r.status)},
      {label:"تاريخ الانتهاء",value:r=>formatDate(r.expiryDate)},
      {label:"سبب الرفض",value:r=>r.rejectionReason || "—"}
    ]
  };
}

async function runFilteredListPdf(button, configFactory, share) {
  const original = button?.textContent || (share ? "إرسال التقرير واتساب PDF" : "تصدير PDF");
  if (button?.disabled) return;
  try {
    if(button){button.disabled=true;button.textContent="جاري تجهيز PDF...";}
    const config=configFactory();
    const file=await createFilteredListPdfFile(config);
    if(share){
      const message=`${config.title}\nعدد النتائج: ${config.rows.length}\nمرفق التقرير بصيغة PDF وفق الفلاتر المحددة.`;
      const shareData={title:config.title,text:message,files:[file]};
      if(navigator.share && (!navigator.canShare || navigator.canShare(shareData))){ if(button) button.textContent="تم تجهيز التقرير"; await navigator.share(shareData); }
      else { downloadDailyPerformancePdfFile(file); window.open(`https://wa.me/?text=${encodeURIComponent(message+"\nتم تنزيل ملف PDF على الجهاز لإرفاقه بالمحادثة.")}`,"_blank","noopener,noreferrer"); }
    } else {
      downloadDailyPerformancePdfFile(file);
    }
    if(button) button.textContent="تم التجهيز";
  } catch(error){
    if(error?.name!=="AbortError") alert(error?.message || "تعذر تجهيز التقرير.");
  } finally { setTimeout(()=>{if(button){button.disabled=false;button.textContent=original;}},1200); }
}

async function createDailyActivityPdfFile() {
  if (!dailyActivitySnapshot) throw new Error("حمّل تقرير الأداء اليومي أولًا.");
  const employeeSelect = document.getElementById("dailyActivityEmployeeFilter");
  const employeeValue = employeeSelect?.value || "";
  if (!dailyActivityReportRequested || !employeeValue) throw new Error("اختر الموظف واعرض بيانات خط السير أولًا.");
  if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("تعذر تحميل أدوات إنشاء ملف PDF.");

  const events = filteredDailyActivityTimeline();
  const typeSelect = document.getElementById("dailyActivityTypeFilter");
  const selectedDate = document.getElementById("dailyPerformanceDate")?.value || dailyPerformanceSnapshot?.workDate || dailyLocalDate();
  const employeeLabel = employeeSelect?.options?.[employeeSelect.selectedIndex]?.textContent || "الموظف";
  const typeLabel = typeSelect?.options?.[typeSelect.selectedIndex]?.textContent || "كل الأنشطة";

  const host = document.createElement("section");
  host.setAttribute("dir", "rtl");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1200px;background:#fff;color:#111827;padding:28px;font-family:Tahoma,Arial,sans-serif;z-index:-1";
  host.innerHTML = `
    <header style="display:grid;grid-template-columns:160px 1fr 300px;align-items:center;gap:20px;padding:18px 22px;border-radius:18px;background:linear-gradient(135deg,#06192c,#0a3651);color:#fff;margin-bottom:18px">
      <img src="assets/images/kyum-header-logo.png" alt="KYUM" style="width:150px;max-height:72px;object-fit:contain;border-radius:10px">
      <div style="text-align:center"><h1 style="margin:0 0 6px;font-size:28px">خط سير يوم الموظف</h1><p style="margin:0;color:#d5e3ee">سجل تفصيلي للحركات والمهام داخل البرنامج بالدقيقة</p></div>
      <div style="font-size:13px;line-height:2;border-right:1px solid rgba(255,255,255,.25);padding-right:18px">
        <div><strong style="color:#f4bd3c">التاريخ:</strong> ${dailyPerformancePdfEscape(selectedDate)}</div>
        <div><strong style="color:#f4bd3c">الموظف:</strong> ${dailyPerformancePdfEscape(employeeLabel)}</div>
        <div><strong style="color:#f4bd3c">نوع النشاط:</strong> ${dailyPerformancePdfEscape(typeLabel)}</div>
        <div><strong style="color:#f4bd3c">عدد الحركات:</strong> ${events.length}</div>
      </div>
    </header>
    <main style="display:grid;gap:10px">
      ${events.length ? events.map(event => `
        <article style="display:grid;grid-template-columns:125px 1fr;gap:14px;border:1px solid #dbe3ea;border-radius:12px;padding:13px;background:#f8fafc;break-inside:avoid">
          <div style="border-left:2px solid #2563eb;padding-left:10px"><strong style="display:block;font-size:15px">${dailyPerformancePdfEscape(dailyActivityTime(event.createdAt))}</strong><span style="font-size:12px;color:#64748b">${dailyPerformancePdfEscape(dailyActivityTypeLabel(event.type))}</span></div>
          <div><strong style="display:block;font-size:15px;margin-bottom:5px">${dailyPerformancePdfEscape(event.title || "نشاط")}</strong><p style="margin:0 0 5px;line-height:1.8">${dailyPerformancePdfEscape(event.detail || "—")}</p><small style="color:#64748b">نفذ بواسطة: ${dailyPerformancePdfEscape(event.employeeName || employeeLabel)}</small></div>
        </article>`).join("") : '<div style="padding:30px;text-align:center">لا توجد حركات مطابقة للفلاتر.</div>'}
    </main>`;
  document.body.appendChild(host);
  try {
    const canvas = await window.html2canvas(host,{scale:1.4,useCORS:true,backgroundColor:"#ffffff",logging:false,windowWidth:1200,scrollX:0,scrollY:0});
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
    const pw=pdf.internal.pageSize.getWidth(), ph=pdf.internal.pageSize.getHeight(), margin=6;
    const iw=pw-margin*2, ih=canvas.height*iw/canvas.width, usable=ph-margin*2;
    const data=canvas.toDataURL("image/jpeg",0.94); let offset=0;
    while(offset<ih){ if(offset>0) pdf.addPage(); pdf.addImage(data,"JPEG",margin,margin-offset,iw,ih,undefined,"FAST"); offset+=usable; }
    const safeEmployee=String(employeeLabel).replace(/[^\p{L}\p{N}_-]+/gu,"-");
    return new File([pdf.output("blob")],`kyum-employee-timeline-${safeEmployee}-${selectedDate}.pdf`,{type:"application/pdf"});
  } finally { host.remove(); }
}

async function exportDailyActivityPdf(event) {
  const button=event?.currentTarget; const original=button?.textContent || "تصدير خط السير PDF";
  if(button?.disabled) return;
  try { if(button){button.disabled=true;button.textContent="جاري تجهيز PDF...";} const file=await createDailyActivityPdfFile(); downloadDailyPerformancePdfFile(file); if(button) button.textContent="تم التصدير"; }
  catch(error){ showDataStatus("dailyPerformanceStatus",error?.message||"تعذر تصدير خط السير.","error"); if(button) button.textContent="تعذر التصدير"; }
  finally { setTimeout(()=>{if(button){button.disabled=false;button.textContent=original;}},1200); }
}

async function sendDailyActivityWhatsappPdf(event) {
  const button=event?.currentTarget; const original=button?.textContent || "إرسال خط السير واتساب PDF";
  if(button?.disabled) return;
  try {
    if(button){button.disabled=true;button.textContent="جاري تجهيز PDF...";}
    const file=await createDailyActivityPdfFile();
    const date=document.getElementById("dailyPerformanceDate")?.value || dailyLocalDate();
    const employee=document.getElementById("dailyActivityEmployeeFilter");
    const name=employee?.options?.[employee.selectedIndex]?.textContent || "الموظف";
    const message=`خط سير يوم الموظف\nالموظف: ${name}\nالتاريخ: ${date}\nمرفق التقرير بصيغة PDF وفق الفلاتر المحددة.`;
    const shareData={title:`خط سير ${name} - ${date}`,text:message,files:[file]};
    if(navigator.share && (!navigator.canShare || navigator.canShare(shareData))){ if(button) button.textContent="تم تجهيز التقرير"; await navigator.share(shareData); }
    else { downloadDailyPerformancePdfFile(file); if(button) button.textContent="تم تجهيز التقرير"; window.open(`https://wa.me/?text=${encodeURIComponent(message+"\nتم تنزيل ملف PDF على الجهاز لإرفاقه بالمحادثة.")}`,"_blank","noopener,noreferrer"); }
  } catch(error){ if(error?.name!=="AbortError") showDataStatus("dailyPerformanceStatus",error?.message||"تعذر مشاركة خط السير.","error"); }
  finally { setTimeout(()=>{if(button){button.disabled=false;button.textContent=original;}},1200); }
}

async function logWhatsappBusinessActivity(anchor) {
  try {
    if (!anchor?.href || !/wa\.me|api\.whatsapp\.com/i.test(anchor.href)) return;
    const row=anchor.closest("tr,[data-customer-id],.customer-card,.daily-suggested-customer-card,.daily-suggested-row") || anchor.parentElement;
    const customerId=row?.dataset?.customerId || row?.querySelector?.("[data-customer-id]")?.dataset?.customerId || null;
    const candidate=row?.querySelector?.("strong,.customer-name,[data-customer-name]");
    const customerName=candidate?.dataset?.customerName || candidate?.textContent?.trim() || "عميل";
    const phone=(anchor.href.match(/wa\.me\/(\d+)/i)||[])[1] || "";
    await window.customerSupabase?.rpc?.("log_business_activity_event",{
      p_event_type:"whatsapp_open",p_section_key:"customers",p_action_key:"open_whatsapp",
      p_entity_type:"customers",p_entity_id:customerId?String(customerId):null,p_entity_display_name:customerName,
      p_customer_id:customerId||null,p_customer_name:customerName,p_request_number:null,p_quotation_number:null,p_invoice_number:null,
      p_details:{phone,source_label:document.querySelector(".view.active h1,.view.active h2")?.textContent?.trim()||"البرنامج",description:"تم فتح رابط واتساب بنجاح."}
    });
    window.KYUMOfflineReadCache?.invalidate?.(`daily-activity:${dailyLocalDate()}`);
  } catch(error){ console.warn("WhatsApp activity log skipped",error); }
}

document.addEventListener("click", event => {
  const link=event.target.closest('a[href*="wa.me"],a[href*="api.whatsapp.com"]');
  if(link) window.setTimeout(()=>logWhatsappBusinessActivity(link),0);
}, true);

function dailyLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function kyumDisplayDateLocale() {
  return window.matchMedia?.("(max-width: 767px)")?.matches
    ? "ar-EG-u-ca-gregory-nu-latn"
    : "ar-SA-u-ca-gregory-nu-latn";
}

function dailyDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(kyumDisplayDateLocale(), {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric"
  });
}

function dailyScopedRows(rows) {
  return rows || [];
}

function dailyEmptyRow(columns, text) {
  return `<tr><td colspan="${columns}" class="empty-state">${escapeHtml(text)}</td></tr>`;
}

function dailyDaysOverdue(value) {
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const today = new Date(`${dailyLocalDate()}T00:00:00`);
  return Number.isNaN(target.getTime()) ? 0 : Math.max(0, Math.floor((today - target) / 86400000));
}

function dailyActivityStatus(session) {
  if (!session) return { key: "not_started", label: "لم يبدأ اليوم" };
  if (session.ended_at) return { key: "ended", label: "أنهى يومه" };

  const last = new Date(session.last_activity_at || session.first_activity_at);
  const idleMinutes = (Date.now() - last.getTime()) / 60000;

  if (idleMinutes <= 15) return { key: "active", label: "نشط الآن" };
  return { key: "inactive", label: "غير نشط" };
}

function dailyActivityDuration(session) {
  if (!session?.first_activity_at) return "—";
  const start = new Date(session.first_activity_at);
  const end = new Date(
    session.ended_at || session.last_activity_at || session.first_activity_at
  );
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} س ${rest} د` : `${rest} دقيقة`;
}

function dailyActivityTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dailyActivityTypeLabel(type) {
  return {
    session: "الدخول والنشاط",
    customers: "العملاء",
    followups: "المتابعات",
    quotations: "عقود العملاء",
    installations: "المواعيد",
    invoices: "فواتير المبيعات",
    daily_tasks: "المهام اليومية",
    daily_alerts: "التنبيهات",
    users: "المستخدمون والصلاحيات",
    reference_data: "البيانات المرجعية",
    other: "نشاط آخر"
  }[type] || type || "نشاط";
}

function timelineAllowedUserIds() {
  return new Set((employeeReportSettings || [])
    .filter(item => item.isActive !== false && item.includeInTimelineReport !== false)
    .map(item => item.userId));
}

function populateDailyActivityEmployees() {
  const select = document.getElementById("dailyActivityEmployeeFilter");
  if (!select || !dailyActivitySnapshot) return;

  const selected = select.value;
  const employees = new Map();

  const allowedUserIds = timelineAllowedUserIds();
  dailyActivitySnapshot.sessions.filter(session => !allowedUserIds.size || allowedUserIds.has(session.user_id)).forEach(session => {
    employees.set(
      `user:${session.user_id}`,
      session.user_profile?.full_name
        || session.representative?.full_name
        || "غير محدد"
    );
  });

  dailyActivitySnapshot.timeline.filter(event => !allowedUserIds.size || allowedUserIds.has(event.userId)).forEach(event => {
    if (event.userId) {
      employees.set(`user:${event.userId}`, event.employeeName || "غير محدد");
    }
  });

  select.innerHTML = [
    '<option value="">اختر الموظف</option>',
    ...[...employees.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ar"))
      .map(([value, label]) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
      )
  ].join("");

  if (employees.has(selected)) select.value = selected;
}

function filteredDailyActivityTimeline() {
  if (!dailyActivitySnapshot) return [];

  const employee = document.getElementById("dailyActivityEmployeeFilter")?.value || "";
  const type = document.getElementById("dailyActivityTypeFilter")?.value || "";

  const allowedUserIds = timelineAllowedUserIds();
  return dailyActivitySnapshot.timeline.filter(event => {
    const scopeMatches = !allowedUserIds.size || allowedUserIds.has(event.userId);
    const employeeMatches = !employee || employee === `user:${event.userId}`;
    const typeMatches = !type || event.type === type;
    return scopeMatches && employeeMatches && typeMatches;
  });
}

function renderDailyActivityTimeline() {
  const container = document.getElementById("dailyActivityTimeline");
  if (!container || !dailyActivitySnapshot) return;

  const employee = document.getElementById("dailyActivityEmployeeFilter")?.value || "";
  if (!dailyActivityReportRequested || !employee) {
    container.innerHTML = '<div class="empty-state">اختر الموظف ثم اضغط عرض بيانات التقرير.</div>';
    return;
  }

  const events = filteredDailyActivityTimeline();
  container.innerHTML = events.length
    ? events.map(event => `
      <article class="daily-activity-event type-${event.type}">
        <div class="daily-activity-event-time">
          <strong>${dailyActivityTime(event.createdAt)}</strong>
          <small>${escapeHtml(dailyActivityTypeLabel(event.type))}</small>
        </div>
        <div class="daily-activity-event-dot"></div>
        <div class="daily-activity-event-content">
          <div>
            <strong>${escapeHtml(event.title || "نشاط")}</strong>
            <span>${escapeHtml(event.employeeName || "غير محدد")}</span>
          </div>
          <p>${escapeHtml(String(event.detail || "—"))}</p>
        </div>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد أنشطة مطابقة للفلاتر.</div>';
}

function renderDailyAttendance() {
  const body = document.getElementById("dailyAttendanceBody");
  if (!body || !dailyActivitySnapshot) return;

  const timeline = dailyActivitySnapshot.timeline;
  const sessions = dailyActivitySnapshot.sessions;

  const allowedUserIds = timelineAllowedUserIds();
  const visibleSessions = sessions.filter(session => !allowedUserIds.size || allowedUserIds.has(session.user_id));
  body.innerHTML = visibleSessions.length
    ? visibleSessions.map(session => {
        const userEvents = timeline.filter(event =>
          event.userId === session.user_id
        );
        const latest = userEvents[0];
        const status = dailyActivityStatus(session);

        return `
          <tr>
            <td>
              <strong>${escapeHtml(
                session.user_profile?.full_name
                || session.representative?.full_name
                || "غير محدد"
              )}</strong><br>
              <small>${escapeHtml(
                session.representative?.representative_code
                || session.user_profile?.role
                || "—"
              )}</small>
            </td>
            <td>${dailyActivityTime(session.first_activity_at)}</td>
            <td>${dailyActivityTime(session.last_activity_at)}</td>
            <td>${dailyActivityDuration(session)}</td>
            <td>${userEvents.length}</td>
            <td>${escapeHtml(latest?.title || "—")}</td>
            <td>
              <span class="daily-attendance-status ${status.key}">
                ${escapeHtml(status.label)}
              </span>
            </td>
          </tr>`;
      }).join("")
    : '<tr><td colspan="7" class="empty-state">لا توجد جلسات نشاط مسجلة لهذا اليوم.</td></tr>';
}

async function loadDailyActivityReport() {
  if (dailyActivityLoading || !window.DailyActivityService) return;
  dailyActivityLoading = true;

  try {
    dailyActivitySnapshot = await window.DailyActivityService.load(
      dailyPerformanceSelectedDate(),
      { force: true }
    );
    populateDailyActivityEmployees();
    renderDailyAttendance();
    renderDailyActivityTimeline();
  } catch (error) {
    console.error("Daily activity report failed:", error);
    const body = document.getElementById("dailyAttendanceBody");
    if (body) {
      body.innerHTML = `<tr><td colspan="7" class="empty-state">${
        escapeHtml(error instanceof Error ? error.message : "تعذر تحميل النشاط اليومي.")
      }</td></tr>`;
    }
  } finally {
    dailyActivityLoading = false;
  }
}

async function renderCurrentDailySession() {
  if (!window.DailyActivityService) return;

  try {
    const session = await window.DailyActivityService.getCurrentSession();
    const status = dailyActivityStatus(session);

    document.getElementById("dailyCurrentSessionStatus").textContent =
      status.label;
    document.getElementById("dailyCurrentSessionStatus").className =
      `session-status-${status.key}`;
    document.getElementById("dailyCurrentSessionMeta").textContent =
      session
        ? `أول نشاط ${dailyActivityTime(session.first_activity_at)} · آخر نشاط ${dailyActivityTime(session.last_activity_at)}`
        : "لم يتم تسجيل جلسة اليوم بعد.";

    document.getElementById("endDailyWorkBtn").disabled =
      !session || Boolean(session.ended_at);
  } catch (error) {
    document.getElementById("dailyCurrentSessionStatus").textContent =
      "تعذر تحميل الجلسة";
  }
}

function dailyAlertSeverityLabel(value) {
  return {
    normal: "عادي",
    important: "مهم",
    critical: "حرج"
  }[value] || value || "—";
}

function dailyAlertStatusLabel(value) {
  return {
    open: "مفتوح",
    in_progress: "قيد المعالجة",
    escalated: "مصعّد",
    closed: "مغلق"
  }[value] || value || "—";
}

function canManageDailyAlerts() {
  return Boolean(
    window.CustomerPermissions?.canScreen?.("dailyAlertsManagement", "edit")
  );
}

function filteredDailyAlerts() {
  const status = document.getElementById("dailyAlertsStatusFilter")?.value || "";
  const representativeId = document.getElementById("dailyAlertsRepresentativeFilter")?.value || "";

  return dailyAlerts.filter(item => {
    const matchesStatus = !status || item.status === status;
    const matchesRepresentative = !representativeId || item.representative_id === representativeId;
    return matchesStatus && matchesRepresentative;
  });
}

function renderDailyAlerts() {
  const list = document.getElementById("dailyAlertsList");
  if (!list) return;

  document.getElementById("dailyAlertsOpenCount").textContent =
    dailyAlerts.filter(item => item.status === "open").length;
  document.getElementById("dailyAlertsInProgressCount").textContent =
    dailyAlerts.filter(item => item.status === "in_progress").length;
  document.getElementById("dailyAlertsEscalatedCount").textContent =
    dailyAlerts.filter(item => item.status === "escalated").length;
  document.getElementById("dailyAlertsCriticalCount").textContent =
    dailyAlerts.filter(item => item.severity === "critical" && item.status !== "closed").length;

  const rows = filteredDailyAlerts();
  const canManage = canManageDailyAlerts();

  list.innerHTML = rows.length
    ? rows.map(alert => {
        const employee = alert.user_profile?.full_name
          || alert.representative?.full_name
          || "غير محدد";

        return `
          <article class="daily-alert-card severity-${alert.severity} status-${alert.status}">
            <div class="daily-alert-card-head">
              <div>
                <span class="daily-alert-severity">${escapeHtml(dailyAlertSeverityLabel(alert.severity))}</span>
                <strong>${escapeHtml(alert.title || "تنبيه")}</strong>
                <small>${escapeHtml(employee)} · ${dailyDateTime(alert.created_at)}</small>
              </div>
              <span class="daily-alert-status">${escapeHtml(dailyAlertStatusLabel(alert.status))}</span>
            </div>
            <p>${escapeHtml(alert.details || "—")}</p>
            ${alert.supervisor_note ? `<div class="daily-alert-note"><b>ملاحظة المشرف:</b> ${escapeHtml(alert.supervisor_note)}</div>` : ""}
            ${canManage ? `
              <div class="daily-alert-card-actions">
                ${alert.status === "open" ? `<button type="button" class="secondary-btn compact-btn" data-alert-action="start" data-alert-id="${alert.id}">بدء المعالجة</button>` : ""}
                ${alert.status !== "escalated" && alert.status !== "closed" ? `<button type="button" class="warning-btn compact-btn" data-alert-action="escalate" data-alert-id="${alert.id}">تصعيد للمشرف</button>` : ""}
                ${alert.status !== "closed" ? `<button type="button" class="primary-btn compact-btn" data-alert-action="close" data-alert-id="${alert.id}">تمت المعالجة</button>` : `<button type="button" class="secondary-btn compact-btn" data-alert-action="reopen" data-alert-id="${alert.id}">إعادة فتح</button>`}
              </div>
            ` : ""}
          </article>`;
      }).join("")
    : '<div class="empty-state">لا توجد تنبيهات مطابقة.</div>';
}

async function loadDailyAlerts(forceSync = false) {
  if (dailyAlertsLoading || !window.DailyAlertsService) return;
  dailyAlertsLoading = true;

  showDataStatus("dailyAlertsStatus", "جاري تحميل التنبيهات...", "info");
  try {
    if (forceSync) {
      await window.DailyAlertsService.sync(undefined, { force: true });
    }
    dailyAlerts = await window.DailyAlertsService.list();
    renderDailyAlerts();
    showDataStatus("dailyAlertsStatus", "");
  } catch (error) {
    showDataStatus(
      "dailyAlertsStatus",
      error instanceof Error ? error.message : "تعذر تحميل التنبيهات.",
      "error"
    );
  } finally {
    dailyAlertsLoading = false;
  }
}

function openDailyAlertAction(alertId, actionType) {
  dailyAlertPendingAction = { alertId, actionType };
  const titles = {
    start: "بدء معالجة التنبيه",
    escalate: "تصعيد التنبيه للمشرف",
    close: "إغلاق التنبيه بعد المعالجة",
    reopen: "إعادة فتح التنبيه"
  };
  document.getElementById("dailyAlertActionTitle").textContent =
    titles[actionType] || "إجراء على التنبيه";
  document.getElementById("dailyAlertActionId").value = alertId;
  document.getElementById("dailyAlertActionType").value = actionType;
  document.getElementById("dailyAlertActionNote").value = "";
  document.getElementById("dailyAlertActionDialog").showModal();
}

function closeDailyAlertActionDialog() {
  dailyAlertPendingAction = null;
  document.getElementById("dailyAlertActionDialog").close();
}

function renderDailyAlertsReport() {
  const body = document.getElementById("dailyAlertsReportBody");
  if (!body || !dailyPerformanceSnapshot) return;

  const rows = dailyPerformanceFilteredRows();
  const alerts = dailyPerformanceSnapshot.alerts || [];

  body.innerHTML = rows.length
    ? rows.map(employee => {
        const employeeAlerts = alerts.filter(alert =>
          (employee.userId && alert.user_id === employee.userId)
          || (
            employee.representativeId
            && alert.representative_id === employee.representativeId
          )
        );

        const byStatus = status =>
          employeeAlerts.filter(alert => alert.status === status).length;

        const resolved = employeeAlerts.filter(alert =>
          alert.status === "closed" && alert.resolved_at && alert.created_at
        );
        const averageMinutes = resolved.length
          ? Math.round(
              resolved.reduce((sum, alert) =>
                sum + (
                  new Date(alert.resolved_at).getTime()
                  - new Date(alert.created_at).getTime()
                ) / 60000, 0
              ) / resolved.length
            )
          : 0;

        return `
          <tr>
            <td><strong>${escapeHtml(employee.name)}</strong></td>
            <td>${byStatus("open")}</td>
            <td>${byStatus("in_progress")}</td>
            <td>${byStatus("escalated")}</td>
            <td>${byStatus("closed")}</td>
            <td>${employeeAlerts.filter(alert => alert.severity === "critical").length}</td>
            <td>${averageMinutes ? `${averageMinutes} دقيقة` : "—"}</td>
          </tr>`;
      }).join("")
    : '<tr><td colspan="7" class="empty-state">لا توجد بيانات.</td></tr>';
}

function dailyTaskCanEdit(definition) {
  if (!definition?.permissionKey) return false;
  return Boolean(
    window.CustomerPermissions?.canScreen?.(definition.permissionKey, "edit")
  );
}

function dailyTaskCompletion(taskKey, today, profile) {
  return dailyTaskRecords.find(item =>
    item.taskKey === taskKey
    && item.workDate === today
    && item.userId === profile?.id
  );
}

function dailyTargetPercent(actual, target) {
  const safeTarget = Math.max(0, Number(target || 0));
  if (!safeTarget) return actual > 0 ? 100 : 0;
  return Math.min(100, Math.round(Number(actual || 0) / safeTarget * 100));
}

function renderDailyChecklist(today, profile) {
  const container = document.getElementById("dailyChecklist");
  if (!container) return;
  const personalSetting = currentEmployeeReportSetting();
  if (personalSetting?.requiresDailyTasks === false) {
    document.getElementById("dailyTasksCompletionRate").textContent = "—";
    document.getElementById("dailyTasksCompletionText").textContent = "غير مطلوب";
    document.getElementById("dailyChecklistPermission").textContent = "غير خاضع للمهام";
    document.getElementById("dailyChecklistPermission").className = "daily-permission-badge readonly";
    container.innerHTML = '<div class="empty-state">لا توجد مهام يومية مطلوبة من حسابك وفق إعدادات الإدارة.</div>';
    return;
  }

  const completedCount = dailyTaskDefinitions.filter(definition =>
    Boolean(dailyTaskCompletion(definition.taskKey, today, profile)?.completed)
  ).length;

  document.getElementById("dailyTasksCompletionRate").textContent =
    `${dailyTaskDefinitions.length
      ? Math.round(completedCount / dailyTaskDefinitions.length * 100)
      : 0}%`;
  document.getElementById("dailyTasksCompletionText").textContent =
    `${completedCount} من ${dailyTaskDefinitions.length}`;

  const editableCount = dailyTaskDefinitions.filter(dailyTaskCanEdit).length;
  document.getElementById("dailyChecklistPermission").textContent =
    editableCount
      ? `مصرح بـ ${editableCount} مهمة`
      : "عرض فقط";
  document.getElementById("dailyChecklistPermission").className =
    `daily-permission-badge ${editableCount ? "allowed" : "readonly"}`;

  container.innerHTML = dailyTaskDefinitions.length
    ? dailyTaskDefinitions.map(definition => {
        const completion = dailyTaskCompletion(
          definition.taskKey,
          today,
          profile
        );
        const completed = Boolean(completion?.completed);
        const canEdit = dailyTaskCanEdit(definition);

        return `
          <label class="daily-task-item ${completed ? "completed" : ""} ${canEdit ? "" : "readonly"}"
                 data-daily-task="${escapeHtml(definition.taskKey)}">
            <input
              type="checkbox"
              data-daily-task-checkbox="${escapeHtml(definition.taskKey)}"
              ${completed ? "checked" : ""}
              ${canEdit ? "" : "disabled"}>
            <span class="daily-task-check" aria-hidden="true"></span>
            <div>
              <strong>${escapeHtml(completed ? `تم ${definition.taskName}` : definition.taskName)}</strong>
              <small>${
                completed
                  ? `تم بواسطة ${escapeHtml(completion.userName || profile?.full_name || "المستخدم الحالي")} في ${dailyDateTime(completion.completedAt)}`
                  : escapeHtml(canEdit ? (definition.description || "حدد المهمة بعد التنفيذ.") : "لا تملك صلاحية تغيير هذه المهمة.")
              }</small>
            </div>
            <b>${completed ? "تم التنفيذ" : "لم يتم التنفيذ"}</b>
          </label>`;
      }).join("")
    : '<div class="empty-state">لا توجد مهام يومية مفعلة.</div>';
}

function currentEmployeeReportSetting() {
  const userId = window.CustomerAuth?.getState?.().user?.id;
  return employeeReportSettings.find(item => item.userId === userId) || null;
}

function renderDailyTargets(actuals) {
  const personal = currentEmployeeReportSetting();
  const targets = personal?.requiresTargets === false ? {
    customersTarget: 0, followupsTarget: 0, quotationsTarget: 0
  } : personal ? {
    customersTarget: personal.customersTarget,
    followupsTarget: personal.followupsTarget,
    quotationsTarget: personal.quotationsTarget
  } : dailyOperationTargets || {
    customersTarget: 0,
    followupsTarget: 0,
    quotationsTarget: 0
  };

  const rows = [
    ["Customers", actuals.customers, targets.customersTarget],
    ["Followups", actuals.followups, targets.followupsTarget],
    ["Quotations", actuals.quotations, targets.quotationsTarget]
  ];

  rows.forEach(([key, actual, target]) => {
    document.getElementById(`daily${key}TargetValue`).textContent =
      `${actual} / ${target}`;
    document.getElementById(`daily${key}TargetBar`).style.width =
      `${dailyTargetPercent(actual, target)}%`;
  });

  document.getElementById("dailyCustomersTargetText").textContent =
    `الهدف: ${targets.customersTarget}`;
  document.getElementById("dailyFollowupsTargetText").textContent =
    `الهدف: ${targets.followupsTarget}`;
  document.getElementById("dailyQuotationsTargetText").textContent =
    `الهدف: ${targets.quotationsTarget}`;
}

function dailyWhatsAppTemplateMessage() {
  return String(dailyWhatsAppTemplate?.message_text || "").trim();
}

function updateDailyWhatsAppTemplateStatus(message, type = "") {
  const node = document.getElementById("dailyWhatsAppTemplateStatus");
  if (!node) return;
  node.textContent = message || "";
  node.className = `daily-whatsapp-template-state${type ? ` is-${type}` : ""}`;
}

function renderDailyWhatsAppTemplate() {
  const message = document.getElementById("dailyWhatsAppTemplateMessage");
  const count = document.getElementById("dailyWhatsAppTemplateCount");
  const preview = document.getElementById("dailyWhatsAppTemplatePreview");
  const image = document.getElementById("dailyWhatsAppTemplatePreviewImage");
  const name = document.getElementById("dailyWhatsAppTemplateImageName");
  const remove = document.getElementById("dailyWhatsAppTemplateRemoveImageBtn");
  if (message && document.activeElement !== message) message.value = dailyWhatsAppTemplate.message_text || "";
  if (count) count.textContent = String((message?.value || dailyWhatsAppTemplate.message_text || "").length);

  const localFile = dailyWhatsAppTemplatePendingFile;
  const hasStored = Boolean(dailyWhatsAppTemplate.image_path) && !dailyWhatsAppTemplateRemoveImage;
  if (localFile && image) {
    image.src = URL.createObjectURL(localFile);
    if (name) name.textContent = localFile.name;
    preview?.classList.remove("hidden");
  } else if (hasStored && image) {
    if (dailyWhatsAppTemplatePreviewUrl) image.src = dailyWhatsAppTemplatePreviewUrl;
    else image.removeAttribute("src");
    image.alt = "صورة رسالة واتساب المحفوظة";
    if (name) name.textContent = dailyWhatsAppTemplate.image_name || "صورة محفوظة";
    preview?.classList.remove("hidden");
  } else {
    preview?.classList.add("hidden");
  }
  remove?.classList.toggle("hidden", !(localFile || hasStored));
}

async function loadDailyWhatsAppTemplate() {
  if (dailyWhatsAppTemplateLoading || !window.WhatsAppTemplateService) return;
  dailyWhatsAppTemplateLoading = true;
  updateDailyWhatsAppTemplateStatus("جارٍ التحميل...");
  try {
    dailyWhatsAppTemplate = await window.WhatsAppTemplateService.load();
    if (dailyWhatsAppTemplatePreviewUrl) URL.revokeObjectURL(dailyWhatsAppTemplatePreviewUrl);
    dailyWhatsAppTemplatePreviewUrl = "";
    if (dailyWhatsAppTemplate.image_path) {
      const storedFile = await window.WhatsAppTemplateService.downloadImage(dailyWhatsAppTemplate);
      if (storedFile) dailyWhatsAppTemplatePreviewUrl = URL.createObjectURL(storedFile);
    }
    dailyWhatsAppTemplatePendingFile = null;
    dailyWhatsAppTemplateRemoveImage = false;
    updateDailyWhatsAppTemplateStatus("الإعداد محفوظ لحسابك", "success");
  } catch (error) {
    console.error("WhatsApp template load failed", error);
    updateDailyWhatsAppTemplateStatus("تعذر تحميل الإعداد", "error");
  } finally {
    dailyWhatsAppTemplateLoading = false;
    renderDailyWhatsAppTemplate();
  }
}

async function saveDailyWhatsAppTemplate() {
  const button = document.getElementById("dailyWhatsAppTemplateSaveBtn");
  const message = document.getElementById("dailyWhatsAppTemplateMessage")?.value || "";
  if (!window.WhatsAppTemplateService) return;
  if (button) button.disabled = true;
  updateDailyWhatsAppTemplateStatus("جارٍ الحفظ...");
  try {
    dailyWhatsAppTemplate = await window.WhatsAppTemplateService.save({
      messageText: message,
      imageFile: dailyWhatsAppTemplatePendingFile,
      removeImage: dailyWhatsAppTemplateRemoveImage
    });
    dailyWhatsAppTemplatePendingFile = null;
    dailyWhatsAppTemplateRemoveImage = false;
    if (dailyWhatsAppTemplatePreviewUrl) URL.revokeObjectURL(dailyWhatsAppTemplatePreviewUrl);
    dailyWhatsAppTemplatePreviewUrl = "";
    if (dailyWhatsAppTemplate.image_path) {
      const storedFile = await window.WhatsAppTemplateService.downloadImage(dailyWhatsAppTemplate);
      if (storedFile) dailyWhatsAppTemplatePreviewUrl = URL.createObjectURL(storedFile);
    }
    updateDailyWhatsAppTemplateStatus("تم حفظ الرسالة والصورة لحسابك", "success");
    renderDailySuggestedCustomers();
  } catch (error) {
    console.error("WhatsApp template save failed", error);
    const code = error?.message || "";
    updateDailyWhatsAppTemplateStatus(
      code === "IMAGE_TOO_LARGE" ? "حجم الصورة أكبر من 5 ميجابايت"
        : code === "INVALID_IMAGE_TYPE" ? "صيغة الصورة غير مدعومة"
          : code === "MESSAGE_TOO_LONG" ? "الرسالة أطول من الحد المسموح"
            : "تعذر حفظ الإعداد",
      "error"
    );
  } finally {
    if (button) button.disabled = false;
    renderDailyWhatsAppTemplate();
  }
}

function dailySuggestedCustomers() { return dailySuggestedSuggestionRows; }

function dailyWhatsAppNumber(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  return normalized.startsWith("0")
    ? `966${normalized.slice(1)}`
    : normalized.replace(/^\+/, "");
}

function dailySuggestedProgressPercent(completed, target = 20) {
  return Math.max(0, Math.min(100, Math.round((Number(completed || 0) / target) * 100)));
}

function renderDailySuggestedProgress() {
  const progress=dailySuggestedSuggestionProgress || {}; const completed=Number(progress.completed||0); const overall=document.getElementById("dailySuggestedOverallProgress"); if(overall)overall.textContent=`${completed} / 20`;
}

async function loadDailySuggestedCustomers(force = false) {
  if (dailySuggestedSuggestionsLoading && !force) return;
  const service = window.DailySuggestionsService;
  if (!service?.load) {
    dailySuggestedSuggestionsError = "تعذر تحميل خدمة العملاء المقترحين.";
    renderDailySuggestedCustomers();
    return;
  }

  dailySuggestedSuggestionsLoading = true;
  dailySuggestedSuggestionsError = "";
  renderDailySuggestedCustomers();
  try {
    const result = await service.load();
    dailySuggestedSuggestionRows = result.rows || [];
    dailySuggestedSuggestionProgress = result.progress || dailySuggestedSuggestionProgress;
  } catch (error) {
    dailySuggestedSuggestionsError = error?.message || "تعذر تحميل قائمة العملاء المقترحين.";
    console.error("Daily suggestions load failed", error);
  } finally {
    dailySuggestedSuggestionsLoading = false;
    renderDailySuggestedCustomers();
  }
}

function renderDailySuggestedCustomers() {
  const body=document.getElementById("dailySuggestedCustomersBody"),summary=document.getElementById("dailySuggestedCustomersSummary"); if(!body)return; const rows=dailySuggestedCustomers(),progress=dailySuggestedSuggestionProgress||{}; renderDailySuggestedProgress();
  if(dailySuggestedSuggestionsLoading){if(summary)summary.textContent="جارٍ تحميل قائمة اليوم...";body.innerHTML=dailyEmptyRow(7,"جارٍ تحميل العملاء المقترحين...");return;}
  if(dailySuggestedSuggestionsError){if(summary)summary.textContent="تعذر تحميل قائمة اليوم";body.innerHTML=`<tr><td colspan="7"><div class="daily-suggested-state is-error"><strong>تعذر تحميل القائمة</strong><small>${escapeHtml(dailySuggestedSuggestionsError)}</small><button type="button" class="secondary-btn compact-btn" data-daily-suggested-retry>إعادة المحاولة</button></div></td></tr>`;return;}
  if(summary)summary.textContent=`${Number(progress.completed||0)} تم التواصل معهم، و${rows.length} متاحون الآن`;
  body.innerHTML=rows.length?rows.map((item,index)=>{const whatsappNumber=dailyWhatsAppNumber(item.phone),canAddFollowup=canManageFollowups("add");return `<tr><td>${index+1}</td><td><strong>${escapeHtml(item.customer_name||"—")}</strong><br><small>${escapeHtml(item.customer_number||"")}</small></td><td>${escapeHtml(item.phone||"—")}</td><td>${item.last_contact_date?formatDate(item.last_contact_date):"لم يتم التواصل"}</td><td>${item.latest_quotation_number?`<strong>${escapeHtml(item.latest_quotation_number)}</strong><br><small>${item.latest_quotation_date?formatDate(item.latest_quotation_date):""}</small>`:"—"}</td><td>${escapeHtml(item.representative_name||"—")}</td><td><div class="daily-suggested-actions">${canAddFollowup?`<button type="button" class="secondary-btn compact-btn" data-daily-suggested-followup="${escapeHtml(String(item.customer_id))}">إضافة متابعة</button><button type="button" class="primary-btn compact-btn" data-daily-suggested-contacted="${escapeHtml(String(item.customer_id))}" data-daily-suggestion-id="${escapeHtml(String(item.suggestion_id))}">تم التواصل</button>`:""}${whatsappNumber?`<a class="daily-whatsapp-btn" href="${escapeHtml(window.WhatsAppTemplateService?.directUrl?.(whatsappNumber,dailyWhatsAppTemplateMessage())||`https://wa.me/${whatsappNumber}`)}" target="_blank" rel="noopener noreferrer">واتساب</a>`:""}</div></td></tr>`;}).join(""):`<tr><td colspan="7"><div class="daily-suggested-state"><strong>لا يوجد عملاء مقترح التواصل معهم حاليًا</strong><small>أضف عملاء أو متابعات وسيتم تجهيز القائمة تلقائيًا.</small></div></td></tr>`;
}

function canViewDailySuggestionsTeam() {
  return canScreenAction("dailyOperations", "export") || canScreenAction("dailyOperationsSettings", "view");
}

async function loadDailySuggestedTeam(force = false) {
  const panel = document.getElementById("dailySuggestedTeamPanel");
  if (!panel) return;

  const allowed = canViewDailySuggestionsTeam();
  panel.classList.toggle("hidden", !allowed);
  if (!allowed || (dailySuggestedTeamLoading && !force)) return;

  const service = window.DailySuggestionsService;
  if (!service?.loadTeamSummary) {
    dailySuggestedTeamError = "تعذر تحميل خدمة متابعة الفريق.";
    renderDailySuggestedTeam();
    return;
  }

  dailySuggestedTeamLoading = true;
  dailySuggestedTeamError = "";
  renderDailySuggestedTeam();
  try {
    dailySuggestedTeamRows = await service.loadTeamSummary();
  } catch (error) {
    dailySuggestedTeamError = error?.message || "تعذر تحميل متابعة إنجاز الفريق.";
    console.error("Daily suggestions team summary failed", error);
  } finally {
    dailySuggestedTeamLoading = false;
    renderDailySuggestedTeam();
  }
}

function renderDailySuggestedTeam() {
  const panel=document.getElementById("dailySuggestedTeamPanel"),body=document.getElementById("dailySuggestedTeamBody"),summary=document.getElementById("dailySuggestedTeamSummary"); if(!panel||!body)return; const allowed=canViewDailySuggestionsTeam(); panel.classList.toggle("hidden",!allowed); if(!allowed)return;
  if(dailySuggestedTeamLoading){if(summary)summary.textContent="جارٍ تحميل أداء الفريق...";body.innerHTML=dailyEmptyRow(8,"جارٍ تحميل أداء الفريق...");return;}
  if(dailySuggestedTeamError){if(summary)summary.textContent="تعذر تحميل أداء الفريق";body.innerHTML=`<tr><td colspan="8"><div class="daily-suggested-state is-error"><strong>تعذر تحميل متابعة الفريق</strong><small>${escapeHtml(dailySuggestedTeamError)}</small></div></td></tr>`;return;}
  const completed=dailySuggestedTeamRows.reduce((s,r)=>s+Number(r.total_completed||0),0),target=dailySuggestedTeamRows.length*20;if(summary)summary.textContent=`${dailySuggestedTeamRows.length} مستخدمين — ${completed} من ${target||0} تواصل مكتمل`;
  body.innerHTML=dailySuggestedTeamRows.length?dailySuggestedTeamRows.map(row=>{const percent=Math.max(0,Math.min(100,Number(row.completion_percent||0)));return `<tr><td><strong>${escapeHtml(row.user_name||row.user_email||"—")}</strong><br><small>${escapeHtml(row.representative_name||row.user_email||"")}</small></td><td>${escapeHtml(row.user_role||"—")}</td><td>${Number(row.total_active||0)}</td><td>${Number(row.total_completed||0)}</td><td>${Number(row.total_completed||0)} / 20</td><td><div class="daily-team-progress"><span style="width:${percent}%"></span></div><small>${percent}%</small></td><td>${Number(row.total_active||0)}</td><td>${row.last_completed_at?formatDate(row.last_completed_at):"—"}</td></tr>`;}).join(""):dailyEmptyRow(8,"لا توجد حسابات مبيعات نشطة لعرضها.");
}

function renderDailyOperations() {
  const today = dailyLocalDate();
  const profile = window.CustomerAuth?.getState?.().profile;

  document.getElementById("dailyOperationsDate").textContent =
    new Date(`${today}T00:00:00`).toLocaleDateString(kyumDisplayDateLocale(), {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });

  renderDailySuggestedCustomers();
  loadDailySuggestedCustomers();

  const dailyCrm = dailyOperationsCrmSnapshot || { customers: [], followups: [], quotations: [] };
  const dailyCustomers = dailyCrm.customers || [];
  const dailyFollowups = dailyCrm.followups || [];
  const dailyQuotations = dailyCrm.quotations || [];

  const todayCustomers = dailyCustomers.filter(item =>
    dailyLocalDate(item.createdAt) === today
  );
  const todayFollowups = dailyScopedRows(dailyFollowups).filter(item =>
    dailyLocalDate(item.contactDate || item.createdAt) === today
  );
  const todayQuotations = dailyScopedRows(dailyQuotations).filter(item =>
    dailyLocalDate(item.quotationDate || item.createdAt) === today
  );
  const overdueFollowups = dailyScopedRows(dailyFollowups).filter(item =>
    !item.completed
    && item.nextFollowupDate
    && dailyLocalDate(item.nextFollowupDate) < today
  );

  document.getElementById("dailyNewCustomersCount").textContent =
    todayCustomers.length;
  document.getElementById("dailyCompletedFollowupsCount").textContent =
    todayFollowups.length;
  document.getElementById("dailyQuotationsCount").textContent =
    todayQuotations.length;
  document.getElementById("dailyOverdueFollowupsCount").textContent =
    overdueFollowups.length;

  const followupsBody = document.getElementById("dailyFollowupsBody");
  followupsBody.innerHTML = todayFollowups.length
    ? todayFollowups.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.customerName || "—")}</strong><br><small>${escapeHtml(row.customerPhone || "")}</small></td>
        <td>${escapeHtml(row.representative || "—")}</td>
        <td>${escapeHtml(row.method || "—")}</td>
        <td>${escapeHtml(row.result || "—")}</td>
        <td>${row.nextFollowupDate ? formatDate(row.nextFollowupDate) : "—"}</td>
      </tr>`).join("")
    : dailyEmptyRow(5, "لم يتم تسجيل متابعات اليوم حتى الآن.");

  const customersBody = document.getElementById("dailyCustomersBody");
  customersBody.innerHTML = todayCustomers.length
    ? todayCustomers.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.customerNumber || "—")}</strong></td>
        <td>${escapeHtml(row.name || "—")}</td>
        <td>${escapeHtml(row.address || "—")}</td>
        <td>${escapeHtml(row.phone || "—")}</td>
        <td>${dailyDateTime(row.createdAt)}</td>
      </tr>`).join("")
    : dailyEmptyRow(5, "لا يوجد عملاء جدد مضافون اليوم.");

  const quotationsBody = document.getElementById("dailyQuotationsBody");
  quotationsBody.innerHTML = todayQuotations.length
    ? todayQuotations.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.customerName || "—")}</strong></td>
        <td>${escapeHtml(row.representative || "—")}</td>
        <td>${escapeHtml(row.code || row.quotationNumber || "—")}</td>
        <td>${escapeHtml(row.status || "—")}</td>
        <td>${formatCurrency(row.amount || 0)}</td>
      </tr>`).join("")
    : dailyEmptyRow(5, "لا توجد عروض أسعار منشأة اليوم.");

  const overdueBody = document.getElementById("dailyOverdueBody");
  overdueBody.innerHTML = overdueFollowups.length
    ? overdueFollowups.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.customerName || "—")}</strong><br><small>${escapeHtml(row.customerPhone || "")}</small></td>
        <td>${escapeHtml(row.representative || "—")}</td>
        <td>${formatDate(row.nextFollowupDate)}</td>
        <td><span class="daily-overdue-badge">${dailyDaysOverdue(row.nextFollowupDate)} يوم</span></td>
        <td>${escapeHtml(row.result || "—")}</td>
      </tr>`).join("")
    : dailyEmptyRow(5, "لا توجد متابعات متأخرة. ممتاز!");
}

async function loadDailyOperations(force = false) {
  if (dailyOperationsLoading || !window.DailyOperationsService) return;
  dailyOperationsLoading = true;
  showDataStatus(
    "dailyOperationsStatus",
    "جاري تحميل مركز التشغيل اليومي...",
    "info"
  );

  try {
    dailyOperationsCrmSnapshot = await window.DailyOperationsService.listPermissionOwnedCrmData(
      dailyLocalDate(),
      { screenKey: "dailyOperations", force }
    );

    renderDailyOperations();
    await loadDailyWhatsAppTemplate();
    await renderCurrentDailySession();
    showDataStatus("dailyOperationsStatus", "");
  } catch (error) {
    console.error("[Daily Operations] Failed to load:", error);
    const rawMessage = error instanceof Error ? error.message : "";
    const isPermissionDenied = /Permission denied:\s*dailyOperations\./i.test(rawMessage);
    showDataStatus(
      "dailyOperationsStatus",
      isPermissionDenied
        ? "لا توجد صلاحية لعرض إدارة المهام اليومية."
        : "تعذر تحميل بيانات مركز التشغيل اليومي.",
      "error"
    );
  } finally {
    dailyOperationsLoading = false;
  }
}

async function updateDailyTask(taskKey, completed) {
  const definition = dailyTaskDefinitions.find(item =>
    item.taskKey === taskKey
  );
  const checkbox = document.querySelector(
    `[data-daily-task-checkbox="${CSS.escape(taskKey)}"]`
  );

  if (!dailyTaskCanEdit(definition)) {
    if (checkbox) checkbox.checked = !completed;
    showDataStatus(
      "dailyOperationsStatus",
      "لا تملك صلاحية تغيير هذه المهمة.",
      "error"
    );
    return;
  }

  if (checkbox) checkbox.disabled = true;
  showDataStatus(
    "dailyOperationsStatus",
    "جاري حفظ حالة المهمة...",
    "info"
  );

  try {
    const updatedTask = await window.DailyOperationsService.setTaskState(
      taskKey,
      completed
    );
    const currentTaskIndex = dailyTaskRecords.findIndex(row =>
      (updatedTask.id && String(row.id) === String(updatedTask.id)) ||
      (row.taskKey === updatedTask.taskKey && row.userId === updatedTask.userId)
    );
    if (currentTaskIndex >= 0) dailyTaskRecords[currentTaskIndex] = updatedTask;
    else dailyTaskRecords.push(updatedTask);
    renderDailyOperations();
    await Promise.allSettled([
      window.KYUMOfflineReadCache?.invalidate?.(`daily-performance:${updatedTask.workDate || dailyLocalDate()}`),
      window.KYUMOfflineReadCache?.invalidate?.(`daily-activity:${updatedTask.workDate || dailyLocalDate()}`)
    ]);
    const dailyReportView = document.getElementById("dailyPerformanceReport");
    if (dailyReportView && !dailyReportView.classList.contains("hidden")) {
      await loadDailyPerformanceReport(true);
    }
    showDataStatus(
      "dailyOperationsStatus",
      completed
        ? "تم تسجيل تنفيذ المهمة بنجاح."
        : "تمت إعادة فتح المهمة.",
      "success"
    );
  } catch (error) {
    if (checkbox) checkbox.checked = !completed;
    showDataStatus(
      "dailyOperationsStatus",
      error instanceof Error
        ? error.message
        : "تعذر حفظ المهمة.",
      "error"
    );
  } finally {
    if (checkbox) checkbox.disabled = !dailyTaskCanEdit(definition);
  }
}

function canManageQuotations(action = "edit") {
  return canScreenAction("quotations", action);
}

async function loadQuotationsFromSupabase(force = false) {
  if (quotationsLoading || (quotationsLoaded && !force)) return;
  if (!window.QuotationsService) return;

  quotationsLoading = true;
  showDataStatus("quotationsStatus", navigator.onLine === false ? "جاري تحميل آخر بيانات عقود العملاء المحفوظة..." : "جاري تحميل عقود العملاء...", "info");

  try {
    quotations = await window.QuotationsService.listQuotations({ force });
    quotationsLoaded = true;
    quotationsPage = 1;
    showDataStatus("quotationsStatus", formatOfflineCacheStatus(window.QuotationsService.getLastReadStatus?.()), "info");
    renderQuotations();
    renderCustomers();
    renderDashboard();
  } catch (error) {
    console.error("Quotation loading failed:", error);
    showDataStatus(
      "quotationsStatus",
      error instanceof Error ? error.message : "تعذر تحميل عقود العملاء.",
      "error"
    );
  } finally {
    quotationsLoading = false;
  }
}

function filteredQuotations() {
  const query = document.getElementById("quotationSearch").value.trim().toLowerCase();
  const status = document.getElementById("quotationStatusFilter").value;
  const rep = document.getElementById("quotationRepFilter").value;
  const workflow = document.getElementById("quotationWorkflowFilter")?.value || "";

  return [...quotations]
    .filter(item => {
      const customer = customerById(item.customerId);
      if (!customer) return false;
      const searchable = [
        item.code,
        item.customerOrderNumber,
        customer.name,
        customer.phone,
        item.representative,
        item.status
      ].join(" ").toLowerCase();

      return (!query || searchable.includes(query))
        && (!status || canonicalQuotationStatus(item.status) === status)
        && (!workflow || (workflow === "converted" ? Boolean(item.installationRequestId) : !item.installationRequestId && !item.salesInvoiceId))
        && (!rep || item.representative === rep);
    })
    .sort((a, b) => String(b.quotationDate).localeCompare(String(a.quotationDate)));
}

function renderQuotations() {
  const workflow = document.getElementById("quotationWorkflowFilter")?.value || "";
  const workflowRows = quotations.filter(item => !workflow || (workflow === "converted" ? Boolean(item.installationRequestId) : !item.installationRequestId && !item.salesInvoiceId));
  const totalValue = workflowRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const accepted = workflowRows.filter(item => item.status === "مقبول");
  const acceptedValue = accepted.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const rejected = workflowRows.filter(item => item.status === "مرفوض").length;
  const conversionRate = workflowRows.length
    ? (accepted.length / workflowRows.length) * 100
    : 0;

  document.getElementById("quotationStats").innerHTML = [
    [customerT("contracts.stats.total","إجمالي العقود"), workflowRows.length],
    [customerT("contracts.stats.totalValue","إجمالي القيمة"), formatCurrency(totalValue)],
    [customerT("contracts.stats.accepted","العقود المقبولة"), accepted.length],
    [customerT("contracts.stats.acceptedValue","قيمة العقود المقبولة"), formatCurrency(acceptedValue)],
    [customerT("contracts.stats.rejected","العقود المرفوضة"), rejected],
    [customerT("contracts.stats.conversion","نسبة التحويل"), `${conversionRate.toFixed(1)}%`]
  ].map(([label, value]) =>
    `<article class="followup-stat"><span>${label}</span><strong>${value}</strong></article>`
  ).join("");

  const allRows = filteredQuotations();
  const body = document.getElementById("quotationsTableBody");
  const pageCount = Math.max(1, Math.ceil(allRows.length / QUOTATIONS_PAGE_SIZE));

  if (quotationsPage > pageCount) quotationsPage = pageCount;
  const start = (quotationsPage - 1) * QUOTATIONS_PAGE_SIZE;
  const rows = allRows.slice(start, start + QUOTATIONS_PAGE_SIZE);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="empty-state">${
      quotationsLoaded ? customerT("contracts.empty","لا توجد عقود مطابقة.") : customerT("contracts.loading","جاري تحميل عقود العملاء...")
    }</td></tr>`;
  } else {
    body.innerHTML = rows.map(item => {
      const customer = customerById(item.customerId);
      const customerName = customer?.name || item.customerName || customerT("customers.unknown","عميل غير معروف");
      const customerPhone = customer?.phone || item.customerPhone || "—";
      const canonicalStatus = canonicalQuotationStatus(item.status);
      const statusClass = quotationStatusClass(canonicalStatus);

      return `
        <tr>
          <td><strong>${escapeHtml(item.code)}</strong></td>
          <td>${escapeHtml(customerName)}</td>
          <td>${escapeHtml(customerPhone)}</td>
          <td>${escapeHtml(item.representative || "—")}</td>
          <td>${formatDate(item.quotationDate)}</td>
          <td class="quotation-value">${formatCurrency(item.amount)}</td>
          <td><span class="quotation-status quotation-status-${statusClass}">${escapeHtml(quotationStatusLabel(canonicalStatus))}</span></td>
          <td>${formatDate(item.expiryDate)}</td>
          <td>${escapeHtml(item.rejectionReason || "—")}</td>
          <td>
            <div class="row-actions">
              ${canonicalStatus === "مقبول" && !item.installationRequestId && !item.salesInvoiceId && canScreenAction("installationRequestNew", "add") ? `<button class="primary-btn compact-btn" data-create-installation-from-quotation="${item.id}">${customerT("contracts.action.createAppointment","إنشاء موعد")}</button>` : ""}
              ${canonicalStatus === "مقبول" && !item.installationRequestId && !item.salesInvoiceId && canScreenAction("salesInvoices", "add") ? `<button class="secondary-btn compact-btn" data-create-invoice-from-quotation="${item.id}">${customerT("contracts.action.toInvoice","تحويل إلى فاتورة")}</button>` : ""}
              ${item.salesInvoiceId && canScreenAction("salesInvoices", "view") ? `<button class="secondary-btn compact-btn" data-open-sales-invoice="${item.salesInvoiceId}">${customerT("contracts.action.openInvoice","فتح الفاتورة")}</button>` : ""}
              ${item.installationRequestId && canScreenAction("installationRequests", "view") ? `<button class="secondary-btn compact-btn" data-open-installation-request="${item.installationRequestId}">${customerT("contracts.action.openAppointment","فتح الموعد")}</button>` : ""}
              ${canManageQuotations("edit") ? `<button class="edit-btn" data-edit-quotation="${item.id}">تعديل</button>` : ""}
              ${canManageQuotations("delete") ? `<button class="delete-btn" data-delete-quotation="${item.id}">حذف</button>` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  const info = document.getElementById("quotationsPaginationInfo");
  const pageNumber = document.getElementById("quotationsPageNumber");
  const prev = document.getElementById("quotationsPrevPage");
  const next = document.getElementById("quotationsNextPage");

  if (info) info.textContent = customerT("contracts.count",`${allRows.length} عقد`,{count:allRows.length});
  if (pageNumber) pageNumber.textContent = `${quotationsPage} / ${pageCount}`;
  if (prev) prev.disabled = quotationsPage <= 1;
  if (next) next.disabled = quotationsPage >= pageCount;
}

async function openQuotationDialog(quotation = null, customerId = null) {
  const action = quotation ? "edit" : "add";
  if (!requireScreenAction("quotations", action, `لا توجد صلاحية ${quotation ? "تعديل" : "إضافة"} عقود العملاء.`)) return;
  if (!(await ensureOperationalReferenceData())) return;
  editingQuotationId = quotation?.id || null;
  document.getElementById("quotationDialogTitle").textContent =
    quotation ? customerT("contracts.dialog.edit","تعديل العقد") : customerT("contracts.dialog.add","إضافة عقد");

  document.getElementById("quotationId").value = quotation?.id || "";
  document.getElementById("quotationCode").value = quotation?.code || nextQuotationCode();
  document.getElementById("quotationCustomerOrderNumber").value = quotation?.customerOrderNumber || "";
  document.getElementById("quotationCustomer").value =
    quotation?.customerId || customerId || customers[0]?.id || "";
  syncQuotationCustomerSearchFromSelect();
  document.getElementById("quotationRepresentative").value = operationalDefaultRepresentativeId(
    quotation?.representativeId || customerById(customerId)?.representativeId
  );
  document.getElementById("quotationDate").value = quotation?.quotationDate || todayIso();
  document.getElementById("quotationAmount").value = quotation?.amount ?? "";
  document.getElementById("quotationStatus").value = canonicalQuotationStatus(quotation?.status);
  document.getElementById("quotationExpiryDate").value = quotation?.expiryDate || "";
  document.getElementById("quotationRejectionReason").value =
    quotation?.rejectionReasonId || "";
  document.getElementById("quotationDescription").value = quotation?.description || "";
  document.getElementById("quotationNotes").value = quotation?.notes || "";

  document.getElementById("quotationDialog").showModal();
}

function closeQuotationDialog() {
  document.getElementById("quotationDialog").close();
  document.getElementById("quotationForm").reset();
  setQuotationCustomerSelection("", { close: true });
  editingQuotationId = null;
}

async function handleQuotationSubmit(event) {
  const action = editingQuotationId ? "edit" : "add";
  if (!requireScreenAction("quotations", action, "لا توجد صلاحية حفظ عقود العملاء.")) return;
  event.preventDefault();

  if (!canManageQuotations(action)) {
    alert("لا توجد صلاحية لإدارة عقود العملاء.");
    return;
  }

  const code = document.getElementById("quotationCode").value.trim();
  const customerId = document.getElementById("quotationCustomer").value;
  const representativeId = document.getElementById("quotationRepresentative").value;
  const status = canonicalQuotationStatus(document.getElementById("quotationStatus").value);
  const rejectionReasonId = document.getElementById("quotationRejectionReason").value || null;
  const amount = Number(document.getElementById("quotationAmount").value || 0);

  if (!code) {
    alert("أدخل رقم العقد.");
    document.getElementById("quotationCode").focus();
    return;
  }

  if (!customerId) {
    alert(customerT("followups.error.chooseCustomer","اختر العميل."));
    return;
  }

  if (!representativeId) {
    alert(customerT("followups.error.chooseRep","اختر المندوب المسؤول."));
    return;
  }

  if (amount < 0) {
    alert("قيمة العقد لا يمكن أن تكون سالبة.");
    return;
  }

  if (status === "مرفوض" && !rejectionReasonId) {
    alert("اختر سبب رفض العقد.");
    document.getElementById("quotationRejectionReason").focus();
    return;
  }

  const submitButton = event.submitter;

  try {
    const duplicate = navigator.onLine === false
      ? quotations.find(item => String(item.id) !== String(editingQuotationId || "") && String(item.code || "").trim().toLowerCase() === code.toLowerCase())
      : await window.QuotationsService.findByNumber(code, editingQuotationId);

    if (duplicate) {
      alert(`رقم العقد ${code} مسجل بالفعل ولا يمكن تكراره.`);
      document.getElementById("quotationCode").focus();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جاري الحفظ...";
    }

    await window.QuotationsService.saveQuotation({
      id: editingQuotationId,
      updatedAt: editingQuotationId ? (quotations.find(item => String(item.id) === String(editingQuotationId))?.updatedAt || "") : "",
      code,
      customerOrderNumber: document.getElementById("quotationCustomerOrderNumber").value.trim(),
      customerId,
      representativeId,
      quotationDate: document.getElementById("quotationDate").value,
      amount,
      status,
      expiryDate: document.getElementById("quotationExpiryDate").value,
      rejectionReasonId,
      description: document.getElementById("quotationDescription").value,
      notes: document.getElementById("quotationNotes").value
    });

    closeQuotationDialog();
    quotationsLoaded = false;
    customersLoaded = false;

    await Promise.all([
      loadQuotationsFromSupabase(true),
      loadCustomersFromSupabase(true)
    ]);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر حفظ العقد.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "حفظ العقد";
    }
  }
}

async function deleteQuotation(id) {
  if (!requireScreenAction("quotations", "delete", "لا توجد صلاحية حذف عقود العملاء.")) return;
  if (!canManageQuotations("delete")) {
    alert("لا توجد صلاحية لحذف عقود العملاء.");
    return;
  }

  const item = quotations.find(quotation => quotation.id === id);
  if (!item) return;

  if (!confirm(`هل تريد حذف العقد ${item.code}؟`)) return;

  try {
    await window.QuotationsService.deleteQuotation(item);
    quotationsLoaded = false;
    customersLoaded = false;

    await Promise.all([
      loadQuotationsFromSupabase(true),
      loadCustomersFromSupabase(true)
    ]);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر حذف العقد.");
  }
}


function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(kyumDisplayDateLocale()).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function collapseAllSidebarGroups() {
  document.querySelectorAll(".nav-group").forEach(group => {
    group.classList.add("is-collapsed");
    group.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "false");
  });
}

function initializeSidebarGroups() {
  collapseAllSidebarGroups();

  const groups = Array.from(document.querySelectorAll(".nav-group"));
  const defaultGroup = groups.find(group => group.dataset.defaultOpen === "true");
  if (defaultGroup) {
    defaultGroup.classList.remove("is-collapsed");
    defaultGroup.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "true");
  }

  groups.forEach(group => {
    const toggle = group.querySelector(".nav-group-toggle");
    toggle?.addEventListener("click", event => {
      event.stopPropagation();
      const willOpen = group.classList.contains("is-collapsed");

      groups.forEach(otherGroup => {
        if (otherGroup === group) return;
        otherGroup.classList.add("is-collapsed");
        otherGroup.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "false");
      });

      group.classList.toggle("is-collapsed", !willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
  });
}

function setSidebarOpen(isOpen) {
  const sidebar = document.getElementById("mainSidebar");
  const launcher = document.getElementById("sidebarMenuToggle");
  const backdrop = document.getElementById("sidebarBackdrop");
  const sidebarHost = document.getElementById("sidebarLauncherHost");
  const header = document.getElementById("appHeader");
  const title = header?.querySelector(".topbar-title");
  if (!sidebar || !launcher || !backdrop || !sidebarHost || !header) return;

  // Keep the menu launcher inside the fixed header on mobile and desktop.
  // The opened drawer uses a dedicated static KYUM brand area instead.
  if (launcher.parentElement !== header) {
    if (title) header.insertBefore(launcher, title);
    else header.prepend(launcher);
  }

  sidebar.classList.toggle("is-open", isOpen);
  sidebar.setAttribute("aria-hidden", String(!isOpen));
  launcher.setAttribute("aria-expanded", String(isOpen));
  backdrop.classList.toggle("hidden", !isOpen);
  backdrop.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("sidebar-menu-open", isOpen);

  collapseAllSidebarGroups();

  if (isOpen) {
    requestAnimationFrame(() => launcher.focus());
  }
}

function petatoeSharedT(key, fallback = '') {
  const value = window.PetatoeLocalization?.t?.(key);
  return value && value !== key ? value : fallback;
}

function initializeDynamicSidebar() {
  const launcher = document.getElementById("sidebarMenuToggle");
  const backdrop = document.getElementById("sidebarBackdrop");
  const sidebar = document.getElementById("mainSidebar");
  if (!launcher || !sidebar || launcher.dataset.initialized === "true") return;

  launcher.dataset.initialized = "true";

  launcher.addEventListener("click", event => {
    event.stopPropagation();
    setSidebarOpen(launcher.getAttribute("aria-expanded") !== "true");
  });

  backdrop?.addEventListener("click", () => setSidebarOpen(false));
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(false);
  });

  const headerUserName = document.getElementById("currentUserName");
  const headerUserRole = document.getElementById("currentUserRoleLabel");
  const sidebarUserName = document.getElementById("sidebarCurrentUserName");
  if (headerUserName && sidebarUserName) {
    const syncHeaderIdentity = () => {
      sidebarUserName.textContent = headerUserName.textContent || petatoeSharedT("sidebar.userFallback", "مستخدم");
      if (headerUserRole) headerUserRole.textContent = roleLabel(currentRole()) || petatoeSharedT("shared.header.systemUser", "مستخدم النظام");
    };
    syncHeaderIdentity();
    new MutationObserver(syncHeaderIdentity).observe(headerUserName, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && launcher.getAttribute("aria-expanded") === "true") {
      setSidebarOpen(false);
      launcher.focus();
    }
  });
}

initializeSidebarGroups();
initializeDynamicSidebar();

function updateGlassHeaderState() {
  const header = document.getElementById("appHeader");
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 18);
}

function initializeGlassHeader() {
  updateGlassHeaderState();
  window.addEventListener("scroll", updateGlassHeaderState, { passive: true });
}

initializeGlassHeader();

function initializeKyumScrollControl() {
  const button = document.getElementById("kyumScrollControl");
  if (!button || button.dataset.initialized === "true") return;

  button.dataset.initialized = "true";
  let clickTimer = null;
  let clickCount = 0;

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  const scrollToBottom = () => {
    const bottom = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );

    window.scrollTo({
      top: bottom,
      behavior: "smooth"
    });
  };

  button.addEventListener("click", () => {
    clickCount += 1;

    if (clickCount === 1) {
      clickTimer = window.setTimeout(() => {
        scrollToTop();
        clickCount = 0;
        clickTimer = null;
      }, 260);
      return;
    }

    if (clickCount === 2) {
      if (clickTimer) window.clearTimeout(clickTimer);
      scrollToBottom();
      clickCount = 0;
      clickTimer = null;
    }
  });

  button.addEventListener("keydown", event => {
    if (event.key === "Home") {
      event.preventDefault();
      scrollToTop();
    }

    if (event.key === "End") {
      event.preventDefault();
      scrollToBottom();
    }
  });

  button.classList.add("is-visible");
}

initializeKyumScrollControl();

function getKyumTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyKyumTheme(theme, persist = true) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  const button = document.getElementById("themeToggleButton");
  const themeColor = document.getElementById("browserThemeColor");

  root.dataset.theme = safeTheme;
  root.style.colorScheme = safeTheme;
  document.body?.classList.toggle("dark-mode", safeTheme === "dark");
  document.body?.setAttribute("data-theme", safeTheme);

  if (themeColor) {
    themeColor.setAttribute("content", safeTheme === "dark" ? "#0b1220" : "#f4f7fb");
  }

  if (button) {
    const darkActive = safeTheme === "dark";
    button.setAttribute("aria-pressed", String(darkActive));
    button.setAttribute(
      "aria-label",
      darkActive
        ? petatoeSharedT("shared.header.themeEnableLight", "تفعيل الوضع الفاتح")
        : petatoeSharedT("shared.header.themeEnableDark", "تفعيل الوضع الداكن")
    );
    button.title = darkActive
      ? petatoeSharedT("shared.header.themeSwitchLight", "التبديل إلى الوضع الفاتح")
      : petatoeSharedT("shared.header.themeSwitchDark", "التبديل إلى الوضع الداكن");
  }

  if (persist) {
    localStorage.setItem("kyum-color-theme", safeTheme);
  }
}

function formatAboutDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(kyumDisplayDateLocale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function setAboutActionStatus(message, isError = false) {
  const status = document.getElementById("aboutActionStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.toggle("hidden", !message);
  status.classList.toggle("error", Boolean(isError));
}

function renderAboutAppCenter() {
  const api = window.KYUM_UPDATE;
  if (!api) return;
  const state = api.getStatus?.() || {};
  const manifest = state.manifest || {};
  const release = state.latestRelease || null;
  const currentVersion = api.currentVersion || window.KYUM_RELEASE_VERSION || "—";
  const currentBuild = manifest.build || window.KYUM_RELEASE_BUILD || "—";

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  setText("aboutCurrentVersion", `v${currentVersion}`);
  setText("aboutCurrentBuild", currentBuild);
  setText("aboutReleaseDate", manifest.releaseDate || "—");
  setText("aboutLastUpdateCheck", state.lastCheckedAt ? formatAboutDate(state.lastCheckedAt) : "لم يتم الفحص بعد");

  const badge = document.getElementById("aboutUpdateStatusBadge");
  const headline = document.getElementById("aboutUpdateHeadline");
  const message = document.getElementById("aboutUpdateMessage");
  const latestBlock = document.getElementById("aboutLatestVersionBlock");
  const latestVersion = document.getElementById("aboutLatestVersion");
  const notes = document.getElementById("aboutReleaseNotes");
  const updateButton = document.getElementById("aboutUpdateNowBtn");
  if (!badge || !headline || !message || !latestBlock || !latestVersion || !notes || !updateButton) return;

  badge.className = "about-status-badge";
  if (state.checking) {
    badge.textContent = "جارٍ الفحص";
    badge.classList.add("is-pending");
    headline.textContent = "يتم التحقق من الإصدار";
    message.textContent = "جارٍ الاتصال بخادم التحديثات...";
  } else if (state.lastError) {
    badge.textContent = "تعذر الفحص";
    badge.classList.add("is-error");
    headline.textContent = "تعذر التحقق من التحديثات";
    message.textContent = "تحقق من اتصال الإنترنت ثم أعد المحاولة.";
  } else if (release) {
    badge.textContent = release.forceUpdate ? "تحديث إلزامي" : "تحديث متاح";
    badge.classList.add("is-warning");
    headline.textContent = `يوجد إصدار أحدث v${release.version}`;
    message.textContent = "اضغط تحديث الآن لتنشيط آخر تطويرات البرنامج.";
  } else {
    badge.textContent = "محدّث";
    badge.classList.add("is-success");
    headline.textContent = "لديك أحدث إصدار";
    message.textContent = "نسخة البرنامج الحالية هي أحدث نسخة منشورة.";
  }

  latestBlock.classList.toggle("hidden", !release);
  updateButton.classList.toggle("hidden", !release);
  if (release) {
    latestVersion.textContent = `v${release.version}`;
    notes.replaceChildren(...(Array.isArray(release.notes) ? release.notes : []).map(note => {
      const item = document.createElement("li");
      item.textContent = note;
      return item;
    }));
  } else {
    notes.replaceChildren();
  }
}

function initializeAboutAppCenter() {
  const view = document.getElementById("aboutAppView");
  if (!view || view.dataset.initialized === "true") return;
  view.dataset.initialized = "true";

  document.getElementById("aboutCheckUpdatesBtn")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    setAboutActionStatus("جارٍ التحقق من وجود تحديثات...");
    try {
      const result = await window.KYUM_UPDATE?.checkDetailed?.();
      setAboutActionStatus(result?.latestRelease ? `يوجد إصدار أحدث v${result.latestRelease.version}.` : "لديك أحدث إصدار من البرنامج.");
    } catch (error) {
      console.error("Manual update check failed", error);
      setAboutActionStatus("تعذر التحقق من التحديثات. تحقق من الاتصال ثم أعد المحاولة.", true);
    } finally {
      event.currentTarget.disabled = false;
      renderAboutAppCenter();
    }
  });

  document.getElementById("aboutUpdateNowBtn")?.addEventListener("click", () => {
    const release = window.KYUM_UPDATE?.getStatus?.().latestRelease;
    if (release) window.KYUM_UPDATE?.updateNow?.(release);
  });

  document.getElementById("aboutClearCacheBtn")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    setAboutActionStatus("جارٍ مسح الكاش وإعادة تحميل التطبيق...");
    try {
      await window.KYUM_UPDATE?.clearCaches?.();
      window.setTimeout(() => window.KYUM_UPDATE?.reload?.(), 250);
    } catch (error) {
      console.error("Cache clear failed", error);
      setAboutActionStatus("تعذر مسح الكاش.", true);
      event.currentTarget.disabled = false;
    }
  });

  document.getElementById("aboutCopyVersionBtn")?.addEventListener("click", async () => {
    const state = window.KYUM_UPDATE?.getStatus?.() || {};
    const manifest = state.manifest || {};
    const text = [
      "PETATOE — Enterprise Edition",
      `Version: ${window.KYUM_UPDATE?.currentVersion || "—"}`,
      `Build: ${manifest.build || "—"}`,
      `Environment: Production`,
      `URL: ${location.href}`
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setAboutActionStatus("تم نسخ معلومات الإصدار.");
    } catch {
      setAboutActionStatus("تعذر نسخ معلومات الإصدار.", true);
    }
  });

  window.addEventListener("kyum-update-state", renderAboutAppCenter);
}

function initializeKyumThemeToggle() {
  const button = document.getElementById("themeToggleButton");
  if (!button || button.dataset.initialized === "true") return;

  button.dataset.initialized = "true";
  applyKyumTheme(getKyumTheme(), false);

  button.addEventListener("click", () => {
    applyKyumTheme(getKyumTheme() === "dark" ? "light" : "dark");
  });
}

initializeKyumThemeToggle();

window.addEventListener("petatoe-language-changed", () => {
  applyKyumTheme(getKyumTheme(), false);
  const roleNode = document.getElementById("currentUserRoleLabel");
  if (roleNode && !roleLabel(currentRole())) roleNode.textContent = petatoeSharedT("shared.header.systemUser", "مستخدم النظام");
});

// Phase M7.2.1 — stable public navigation bridge for mobile controls.
window.KYUMNavigateTo = (viewKey, options = {}) => {
  const normalizedView = String(viewKey || "").trim();
  const button = document.querySelector(`.nav-item[data-view="${CSS.escape(normalizedView)}"]`);
  if (button && options.fromSidebar === true) return openSidebarView(button);
  return switchView(normalizedView, {
    ...options,
    trustedNavigation: normalizedView === "dailyOperations"
  });
};

function setHeaderUserMenuOpen(isOpen) {
  const menu = document.getElementById("headerUserMenu");
  const button = document.getElementById("headerUserMenuButton");
  const dropdown = document.getElementById("headerUserMenuDropdown");
  if (!menu || !button || !dropdown) return;

  menu.classList.toggle("is-open", isOpen);
  dropdown.classList.toggle("hidden", !isOpen);
  button.setAttribute("aria-expanded", String(isOpen));
}

function initializeHeaderUserMenu() {
  const menu = document.getElementById("headerUserMenu");
  const button = document.getElementById("headerUserMenuButton");
  if (!menu || !button || menu.dataset.initialized === "true") return;

  menu.dataset.initialized = "true";

  button.addEventListener("click", event => {
    event.stopPropagation();
    setHeaderUserMenuOpen(button.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("click", event => {
    if (!menu.contains(event.target)) {
      setHeaderUserMenuOpen(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
      setHeaderUserMenuOpen(false);
      button.focus();
    }
  });
}

initializeHeaderUserMenu();

window.addEventListener("customer-auth-ready", () => {
  const requested = routeFromLocation();
  const fallback = window.CustomerPermissions?.firstAllowedScreen?.("dashboard");
  const target = requested && views[requested] ? requested : fallback;
  if (target) switchView(target, { silent: true, replaceHistory: !requested });
});

window.addEventListener("popstate", () => {
  const requested = routeFromLocation();
  if (!requested || !views[requested]) return;
  switchView(requested, { silent: true, fromHistory: true, replaceHistory: true });
});

window.addEventListener("hashchange", () => {
  const requested = routeFromLocation();
  if (!requested || requested === activeViewKey || !views[requested]) return;
  switchView(requested, { silent: true, fromHistory: true, replaceHistory: true });
});

function openSidebarView(button) {
  if (!button || button.disabled || button.classList.contains("hidden")) return false;

  const viewKey = String(button.dataset.view || "").trim();
  if (!viewKey || !views[viewKey]) return false;

  // Phase M7.3.1: perform the view transition synchronously before closing the
  // mobile sidebar. Closing the drawer first previously changed focus/layout
  // state and could cancel the deferred dailyOperations transition.
  const opened = switchView(viewKey, {
    trustedNavigation: viewKey === "dailyOperations"
  });

  if (!opened) return false;

  setSidebarOpen(false);
  document.getElementById("mobileBottomMenu")?.classList.remove("is-active");

  // Keep the active navigation state deterministic after the drawer animation.
  requestAnimationFrame(() => {
    document.querySelectorAll(".nav-item[data-view]").forEach(item => {
      item.classList.toggle("active", item.dataset.view === viewKey);
    });
  });

  return true;
}

// Phase M7.3.2 — dedicated Daily Operations navigation binding.
// The first root item is handled directly because the mobile drawer can consume
// its synthesized click after a touch. Pointer-up performs the transition before
// any drawer state mutation; the following click is suppressed as a duplicate.
function initializeDailyOperationsNavigation() {
  const button = document.getElementById("dailyOperationsNavButton")
    || document.querySelector('.nav-item[data-view="dailyOperations"]');
  if (!button || button.dataset.dailyNavigationBound === "true") return;

  button.dataset.dailyNavigationBound = "true";
  let lastPointerNavigationAt = 0;

  const navigate = event => {
    if (event.type === "click" && performance.now() - lastPointerNavigationAt < 700) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const opened = switchView("dailyOperations", { trustedNavigation: true });
    if (!opened) return;

    setSidebarOpen(false);
    document.getElementById("mobileBottomMenu")?.classList.remove("is-active");
  };

  button.addEventListener("pointerup", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    lastPointerNavigationAt = performance.now();
    navigate(event);
  }, { capture: true });

  button.addEventListener("click", navigate, { capture: true });
}

initializeDailyOperationsNavigation();

// One bubbling handler owns all remaining sidebar destinations.
document.addEventListener("click", event => {
  const button = event.target.closest?.(".nav-item[data-view]");
  if (!button || button.dataset.view === "dailyOperations") return;

  event.preventDefault();
  event.stopPropagation();
  openSidebarView(button);
});

document.querySelector("[data-open-customers]").addEventListener("click", () => switchView("customers"));

["dashboardRepFilter", "dashboardDateFrom", "dashboardDateTo"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    if (document.body.classList.contains("mobile-dashboard-sheet-open")) return;
    renderDashboard();
  });
});

document.addEventListener("kyum-apply-dashboard-filters", () => renderDashboard());

document.getElementById("resetDashboardFilters").addEventListener("click", () => {
  document.getElementById("dashboardRepFilter").value = "";
  
  
  document.getElementById("dashboardDateFrom").value = "";
  document.getElementById("dashboardDateTo").value = "";
  if (!document.body.classList.contains("mobile-dashboard-sheet-open")) renderDashboard();
});

document.querySelector("[data-open-followups]").addEventListener("click", () => switchView("followups"));

document.getElementById("addCustomerBtn").addEventListener("click", () => openCustomerDialog());
document.getElementById("customerType")?.addEventListener("change", syncCustomerContactPersonField);
document.getElementById("addFollowupBtn").addEventListener("click", () => openFollowupDialog());
document.getElementById("addQuotationBtn").addEventListener("click", () => openQuotationDialog());
document.getElementById("closeQuotationDialogBtn").addEventListener("click", closeQuotationDialog);
document.getElementById("cancelQuotationDialogBtn").addEventListener("click", closeQuotationDialog);
document.getElementById("quotationForm").addEventListener("submit", handleQuotationSubmit);
document.getElementById("closeFollowupDialogBtn").addEventListener("click", closeFollowupDialog);
document.getElementById("cancelFollowupDialogBtn").addEventListener("click", closeFollowupDialog);
document.getElementById("followupForm").addEventListener("submit", handleFollowupSubmit);
document.getElementById("closeCustomerDetailsBtn").addEventListener("click", () => document.getElementById("customerDetailsDialog").close());
document.getElementById("customer360EditBtn")?.addEventListener("click", () => {
  const dialog = document.getElementById("customerDetailsDialog");
  const customer = customerById(dialog.dataset.customerId);
  if (!customer) return;
  dialog.close();
  openCustomerDialog(customer);
});
document.getElementById("customer360AddFollowupBtn")?.addEventListener("click", () => {
  const dialog = document.getElementById("customerDetailsDialog");
  const customerId = dialog.dataset.customerId;
  if (!customerId) return;
  dialog.close();
  openFollowupDialog(customerId);
});

document.getElementById("customer360ExportBtn")?.addEventListener("click", () => {
  if (!currentCustomer360View) return;
  document.getElementById("customer360ExportSubtitle").textContent =
    `${currentCustomer360View.customer.name} · ${currentCustomer360View.customer.phone || "بدون جوال"}`;
  document.getElementById("customer360ExportDialog").showModal();
});

function closeCustomer360ExportDialog() {
  document.getElementById("customer360ExportDialog").close();
}

document.getElementById("closeCustomer360ExportDialogBtn")?.addEventListener(
  "click",
  closeCustomer360ExportDialog
);
document.getElementById("closeCustomer360ExportDialogFooterBtn")?.addEventListener(
  "click",
  closeCustomer360ExportDialog
);

document.getElementById("customer360ExportExcelBtn")?.addEventListener("click", () => {
  if (!currentCustomer360View) return;
  try {
    window.Customer360Export.createExcel(currentCustomer360View);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر تصدير ملف Excel.");
  }
});

document.getElementById("customer360ExportPdfBtn")?.addEventListener("click", () => {
  if (!currentCustomer360View) return;
  try {
    window.Customer360Export.openPrint(currentCustomer360View);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر إنشاء تقرير PDF.");
  }
});

document.getElementById("customer360PrintBtn")?.addEventListener("click", () => {
  if (!currentCustomer360View) return;
  try {
    window.Customer360Export.openPrint(currentCustomer360View);
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر فتح الطباعة.");
  }
});

document.getElementById("customer360ExportPngBtn")?.addEventListener("click", async () => {
  if (!currentCustomer360View) return;

  const button = document.getElementById("customer360ExportPngBtn");
  button.disabled = true;
  button.textContent = "جاري إنشاء الصورة...";

  try {
    await window.Customer360Export.createPng(
      document.querySelector("#customerDetailsDialog .customer360-shell"),
      currentCustomer360View
    );
  } catch (error) {
    alert(error instanceof Error ? error.message : "تعذر تصدير صورة PNG.");
  } finally {
    button.disabled = false;
    button.textContent = "تصدير PNG";
  }
});


document.getElementById("closeDialogBtn").addEventListener("click", closeCustomerDialog);
document.getElementById("cancelDialogBtn").addEventListener("click", closeCustomerDialog);
document.getElementById("customerForm").addEventListener("submit", handleCustomerSubmit);

["customerSearch"].forEach(id => {
  const control = document.getElementById(id);
  if (!control) return;
  control.addEventListener("input", () => {
    customersPage = 1;
    renderCustomers();
  });
  control.addEventListener("change", () => {
    customersPage = 1;
    renderCustomers();
  });
});

["followupSearch", "followupStatusFilter", "followupRepFilter"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    followupsPage = 1;
    renderFollowups();
  });
  document.getElementById(id).addEventListener("change", () => {
    followupsPage = 1;
    renderFollowups();
  });
});

["quotationSearch", "quotationStatusFilter", "quotationWorkflowFilter", "quotationRepFilter"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    if (document.body.classList.contains("mobile-quotations-sheet-open")) return;
    quotationsPage = 1;
    renderQuotations();
  });

  document.getElementById(id).addEventListener("change", () => {
    if (document.body.classList.contains("mobile-quotations-sheet-open")) return;
    quotationsPage = 1;
    renderQuotations();
  });
});

document.addEventListener("kyum-apply-quotation-filters", () => {
  quotationsPage = 1;
  renderQuotations();
});

document.getElementById("customersTableBody")?.addEventListener("click", event => {
  const action = event.target.closest?.("[data-edit],[data-delete],[data-details],[data-add-followup]");
  if (!action) return;

  const editId = action.dataset.edit;
  const deleteId = action.dataset.delete;
  const detailsId = action.dataset.details;
  const addFollowupCustomerId = action.dataset.addFollowup;

  if (editId) {
    const customer = customers.find(item => item.id === editId);
    if (customer) openCustomerDialog(customer);
    return;
  }

  if (deleteId) {
    deleteCustomer(deleteId);
    return;
  }

  if (detailsId) {
    showCustomerDetails(detailsId);
    return;
  }

  if (addFollowupCustomerId) {
    openFollowupDialog(addFollowupCustomerId);
  }
});

document.getElementById("exportFollowupsPdfBtn")?.addEventListener("click", event => runFilteredListPdf(event.currentTarget, followupReportConfig, false));
document.getElementById("sendFollowupsWhatsappPdfBtn")?.addEventListener("click", event => runFilteredListPdf(event.currentTarget, followupReportConfig, true));
document.getElementById("exportQuotationsPdfBtn")?.addEventListener("click", event => runFilteredListPdf(event.currentTarget, quotationReportConfig, false));
document.getElementById("sendQuotationsWhatsappPdfBtn")?.addEventListener("click", event => runFilteredListPdf(event.currentTarget, quotationReportConfig, true));

document.getElementById("followupsTableBody").addEventListener("click", event => {
  const editId = event.target.dataset.editFollowup;
  const deleteId = event.target.dataset.deleteFollowup;

  if (editId) {
    const item = followups.find(followup => followup.id === editId);
    if (item) openFollowupDialog(null, item);
  }

  if (deleteId) deleteFollowup(deleteId);
});

window.addEventListener("kyum-sales-invoice-created", async () => {
  try {
    await window.QuotationsService?.invalidateCache?.();
    quotationsLoaded = false;
    await loadQuotationsFromSupabase(true);
  } catch (error) {
    console.error("Quotation invoice workflow refresh failed:", error);
  }
});

document.getElementById("quotationsTableBody").addEventListener("click", event => {
  const editId = event.target.dataset.editQuotation;
  const deleteId = event.target.dataset.deleteQuotation;
  const createInstallationId = event.target.dataset.createInstallationFromQuotation;
  const openInstallationRequestId = event.target.dataset.openInstallationRequest;
  const createInvoiceQuotationId = event.target.dataset.createInvoiceFromQuotation;
  const openSalesInvoiceId = event.target.dataset.openSalesInvoice;

  if (editId) {
    const item = quotations.find(quotation => quotation.id === editId);
    if (item) openQuotationDialog(item);
  }

  if (deleteId) deleteQuotation(deleteId);

  if (createInstallationId) {
    const item = quotations.find(quotation => quotation.id === createInstallationId);
    if (!item || canonicalQuotationStatus(item.status) !== "مقبول" || item.installationRequestId) return;
    const detail = { quotationId: item.id, customerId: item.customerId, customerOrderNumber: item.customerOrderNumber || "" };
    if (window.KYUMInstallationsModule?.openFromQuotation) {
      window.KYUMInstallationsModule.openFromQuotation(detail);
    } else {
      try { sessionStorage.setItem("kyum:installation:quotation-prefill", JSON.stringify({ ...detail, createdAt: Date.now() })); } catch (_) {}
      const opened = window.KYUMNavigation?.open?.("installationRequestNew", { trustedNavigation: true });
      if (opened !== false) setTimeout(() => window.dispatchEvent(new CustomEvent("kyum-installation-create-from-quotation", { detail })), 0);
    }
  }

  if (createInvoiceQuotationId) {
    const item = quotations.find(quotation => quotation.id === createInvoiceQuotationId);
    if (!item || canonicalQuotationStatus(item.status) !== "مقبول" || item.installationRequestId || item.salesInvoiceId) return;
    const customer = customerById(item.customerId);
    window.dispatchEvent(new CustomEvent("kyum-open-unified-invoice-conversion", { detail: {
      sourceType: "quotation",
      quotationId: item.id,
      requestNumber: item.customerOrderNumber || item.code,
      customerName: customer?.name || item.customerName || "—",
      customerPhone: customer?.phone || item.customerPhone || "—",
      representativeName: item.representative || "—",
      invoiceAmount: Number(item.amount || 0),
      installationExpenses: 0,
      quotationCode: item.code || ""
    }}));
  }

  if (openSalesInvoiceId) {
    window.KYUMNavigation?.open?.("salesInvoices", { trustedNavigation: true });
  }

  if (openInstallationRequestId) {
    const opened = window.KYUMNavigation?.open?.("installationRequests", { trustedNavigation: true });
    if (opened !== false) setTimeout(() => window.dispatchEvent(new CustomEvent("kyum-installation-edit-request", { detail: { id: openInstallationRequestId } })), 0);
  }
});


document.getElementById("addRepresentativeBtn")?.addEventListener("click", () => openRepresentativeDialog());
document.getElementById("closeRepresentativeDialogBtn")?.addEventListener("click", closeRepresentativeDialog);
document.getElementById("cancelRepresentativeDialogBtn")?.addEventListener("click", closeRepresentativeDialog);
document.getElementById("representativeForm")?.addEventListener("submit", saveRepresentativeForm);

document.getElementById("closeReferenceDialogBtn")?.addEventListener("click", closeReferenceDialog);
document.getElementById("cancelReferenceDialogBtn")?.addEventListener("click", closeReferenceDialog);
document.getElementById("referenceItemForm")?.addEventListener("submit", saveReferenceForm);

document.querySelectorAll("[data-add-reference]").forEach(button => {
  button.addEventListener("click", () => openReferenceDialog(button.dataset.addReference));
});

document.getElementById("representativesTableBody")?.addEventListener("click", event => {
  const editId = event.target.dataset.editRepresentative;
  const toggleId = event.target.dataset.toggleRepresentative;
  const deleteId = event.target.dataset.deleteRepresentative;

  if (editId) {
    const record = representativeRecords.find(item => item.id === editId);
    if (record) openRepresentativeDialog(record);
    return;
  }

  if (toggleId) {
    toggleRepresentativeStatus(toggleId);
    return;
  }

  if (deleteId) {
    deleteRepresentativeRecord(deleteId);
  }
});

document.getElementById("representativesSearch")?.addEventListener(
  "input",
  renderRepresentatives
);
document.getElementById("representativesStatusFilter")?.addEventListener(
  "change",
  renderRepresentatives
);

document.getElementById("settingsView")?.addEventListener("click", event => {
  const editId = event.target.dataset.editReference;
  const deleteId = event.target.dataset.deleteReference;
  const type = event.target.dataset.referenceType;

  if (!type) return;

  if (editId) {
    const records = type === "interest" ? interestRecords : reasonRecords;
    const record = records.find(item => item.id === editId);
    if (record) openReferenceDialog(type, record);
    return;
  }

  if (deleteId) {
    deleteReferenceItem(type, deleteId);
  }
});

document.getElementById("referenceDataSectionFilter")?.addEventListener(
  "change",
  () => {
    referenceCustomersPage = 1;
    syncReferenceDataPanel();
    renderReferenceCustomers();
  }
);

["referenceCustomersSearch"]
  .forEach(id => {
    const element = document.getElementById(id);
    const eventName = element?.tagName === "INPUT" ? "input" : "change";
    element?.addEventListener(eventName, () => {
      referenceCustomersPage = 1;
      renderReferenceCustomers();
    });
  });

document.getElementById("referenceAddCustomerBtn")?.addEventListener("click", () => {
  if (!requireScreenAction("customers", "add", "لا توجد صلاحية إضافة العملاء.")) return;
  openCustomerDialog();
});


function closeRepresentativeImportDialog() {
  document.getElementById("representativeImportDialog")?.close();
}

function resetRepresentativeImportDialog() {
  representativeImportPreview = null;
  representativeImportFailedRows = [];
  const fileInput = document.getElementById("representativeImportFileInput");
  if (fileInput) fileInput.value = "";
  const fileName = document.getElementById("representativeImportFileName");
  if (fileName) fileName.textContent = "لم يتم اختيار ملف";
  document.getElementById("representativeImportSummary")?.classList.add("hidden");
  document.getElementById("representativeImportProgress")?.classList.add("hidden");
  const progressBar = document.getElementById("representativeImportProgressBar");
  if (progressBar) progressBar.style.width = "0%";
  const body = document.getElementById("representativeImportPreviewBody");
  if (body) body.innerHTML = '<tr><td colspan="7" class="empty-cell">اختر ملف Excel لعرض المعاينة.</td></tr>';
  const executeBtn = document.getElementById("representativeImportExecuteBtn");
  if (executeBtn) executeBtn.disabled = true;
  document.getElementById("representativeImportFailedExportBtn")?.classList.add("hidden");
  showDataStatus("representativeImportStatus", "");
}

function renderRepresentativeImportPreview(preview) {
  representativeImportPreview = preview;
  const summary = preview.summary;
  const values = {
    representativeImportTotalCount: summary.total,
    representativeImportValidCount: summary.valid,
    representativeImportErrorCount: summary.errors,
    representativeImportNewCount: summary.newRepresentatives,
    representativeImportDuplicateCount: summary.duplicates,
    representativeImportExistingCount: summary.existing
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  });
  document.getElementById("representativeImportSummary")?.classList.remove("hidden");

  const body = document.getElementById("representativeImportPreviewBody");
  if (body) {
    const previewLimit = 200;
    const rows = preview.rows.slice(0, previewLimit);
    body.innerHTML = rows.map(row => {
      const statusClass = row.errors.length ? "danger" : "success";
      const statusLabel = row.errors.length ? "خطأ" : "جديد";
      return `<tr>
        <td>${row.sourceRow}</td>
        <td dir="ltr">${escapeHtml(row.representativeCode || "-")}</td>
        <td>${escapeHtml(row.fullName || "-")}</td>
        <td dir="ltr">${escapeHtml(row.phone || "-")}</td>
        <td dir="ltr">${escapeHtml(row.email || "-")}</td>
        <td><span class="status-badge ${statusClass}">${row.isActive ? "نشط" : "موقوف"} — ${statusLabel}</span></td>
        <td>${row.errors.length ? escapeHtml(row.errors.join(" — ")) : "جاهز"}</td>
      </tr>`;
    }).join("") + (preview.rows.length > previewLimit
      ? `<tr><td colspan="7" class="empty-cell">يتم عرض أول ${previewLimit} صف فقط من أصل ${preview.rows.length} صف للحفاظ على سرعة الواجهة. سيتم استيراد جميع الصفوف الصحيحة.</td></tr>`
      : "");
  }
  const executeBtn = document.getElementById("representativeImportExecuteBtn");
  if (executeBtn) executeBtn.disabled = summary.valid === 0;
}

async function previewRepresentativeImportFile(file) {
  if (!file) return;
  const fileName = document.getElementById("representativeImportFileName");
  if (fileName) fileName.textContent = file.name;
  showDataStatus("representativeImportStatus", "جاري قراءة الملف والتحقق من البيانات...", "info");
  try {
    const rows = await window.RepresentativeExcelCenter.parseImportFile(file);
    renderRepresentativeImportPreview(window.RepresentativeExcelCenter.buildImportPreview(rows, representativeRecords));
    const errors = representativeImportPreview.summary.errors;
    showDataStatus(
      "representativeImportStatus",
      errors ? `تم التحقق: سيتم استيراد ${representativeImportPreview.summary.valid} صف صحيح وتجاهل ${errors} صف به أخطاء.` : "تم التحقق من الملف وهو جاهز للاستيراد.",
      errors ? "info" : "success"
    );
  } catch (error) {
    representativeImportPreview = null;
    showDataStatus("representativeImportStatus", error instanceof Error ? error.message : "تعذر قراءة ملف Excel.", "error");
  }
}

function openRepresentativeImportDialog() {
  if (!requireScreenAction("representatives", "add", "لا توجد صلاحية استيراد مندوبي المبيعات.")) return;
  resetRepresentativeImportDialog();
  document.getElementById("representativeImportDialog")?.showModal();
}

document.getElementById("representativesTemplateBtn")?.addEventListener("click", () => {
  if (!requireScreenAction("representatives", "add", "لا توجد صلاحية تنزيل نموذج المندوبين.")) return;
  try { window.RepresentativeExcelCenter.downloadTemplate(); }
  catch (error) { alert(error instanceof Error ? error.message : "تعذر تنزيل النموذج."); }
});
document.getElementById("representativesImportBtn")?.addEventListener("click", openRepresentativeImportDialog);
document.getElementById("representativeImportChooseFileBtn")?.addEventListener("click", () => document.getElementById("representativeImportFileInput")?.click());
document.getElementById("representativeImportFileInput")?.addEventListener("change", event => previewRepresentativeImportFile(event.target.files?.[0] || null));
document.getElementById("representativeImportCloseBtn")?.addEventListener("click", closeRepresentativeImportDialog);
document.getElementById("representativeImportCancelBtn")?.addEventListener("click", closeRepresentativeImportDialog);
document.getElementById("representativeImportFailedExportBtn")?.addEventListener("click", () => {
  try { window.RepresentativeExcelCenter.exportFailedRows(representativeImportFailedRows); }
  catch (error) { showDataStatus("representativeImportStatus", error instanceof Error ? error.message : "تعذر تصدير الصفوف الفاشلة.", "error"); }
});

document.getElementById("representativeImportExecuteBtn")?.addEventListener("click", async () => {
  if (!representativeImportPreview) return;
  if (!requireScreenAction("representatives", "add", "لا توجد صلاحية استيراد مندوبي المبيعات.")) return;
  const validRows = representativeImportPreview.rows.filter(row => !row.errors.length);
  const executeBtn = document.getElementById("representativeImportExecuteBtn");
  if (executeBtn) executeBtn.disabled = true;
  representativeImportFailedRows = representativeImportPreview.rows
    .filter(row => row.errors.length)
    .map(row => ({ sourceRow: row.sourceRow, representativeCode: row.representativeCode, fullName: row.fullName, phone: row.phone, email: row.email, message: row.errors.join(" — ") }));
  document.getElementById("representativeImportProgress")?.classList.remove("hidden");
  try {
    const result = await window.RepresentativeExcelCenter.importRows(validRows, window.ReferenceDataService.saveRepresentative, (current, total) => {
      const percent = total ? Math.round((current / total) * 100) : 0;
      const bar = document.getElementById("representativeImportProgressBar");
      if (bar) bar.style.width = `${percent}%`;
      const text = document.getElementById("representativeImportProgressText");
      if (text) text.textContent = `${percent}%`;
      const rowText = document.getElementById("representativeImportProgressRows");
      if (rowText) rowText.textContent = `${current} / ${total}`;
      if (current === total || current % 25 === 0) showDataStatus("representativeImportStatus", `جاري استيراد ${current} من ${total}...`, "info");
    }, { chunkSize: 200 });
    representativeImportFailedRows.push(...result.errors);
    document.getElementById("representativeImportFailedExportBtn")?.classList.toggle("hidden", !representativeImportFailedRows.length);
    referenceDataLoaded = false;
    await loadReferenceDataFromSupabase(true);
    showDataStatus("representativeImportStatus", `اكتمل الاستيراد: ${result.inserted} مندوب جديد، ${result.failed} فشل.`, result.failed ? "error" : "success");
    if (!result.failed) setTimeout(closeRepresentativeImportDialog, 900);
  } catch (error) {
    showDataStatus("representativeImportStatus", error instanceof Error ? error.message : "تعذر تنفيذ الاستيراد.", "error");
  } finally {
    if (executeBtn) executeBtn.disabled = false;
  }
});

function closeCustomerImportDialog() {
  document.getElementById("customerImportDialog")?.close();
}

function resetCustomerImportDialog() {
  customerImportPreview = null;
  customerImportFile = null;
  customerImportFailedRows = [];
  customerImportOverrideAuditId = null;
  document.getElementById("customerImportResult")?.classList.add("hidden");
  const decisionNotice = document.getElementById("customerImportDecisionNotice");
  if (decisionNotice) {
    decisionNotice.classList.add("hidden");
    decisionNotice.textContent = "";
  }
  const fileInput = document.getElementById("customerImportFileInput");
  if (fileInput) fileInput.value = "";
  const fileName = document.getElementById("customerImportFileName");
  if (fileName) fileName.textContent = "لم يتم اختيار ملف";
  document.getElementById("customerImportSummary")?.classList.add("hidden");
  const body = document.getElementById("customerImportPreviewBody");
  if (body) {
    body.innerHTML = '<tr><td colspan="7" class="empty-cell">اختر ملف Excel لعرض المعاينة.</td></tr>';
  }
  const executeBtn = document.getElementById("customerImportExecuteBtn");
  if (executeBtn) executeBtn.disabled = true;
  showDataStatus("customerImportStatus", "");
  document.getElementById("customerImportProgress")?.classList.add("hidden");
  const progressBar = document.getElementById("customerImportProgressBar");
  if (progressBar) progressBar.style.width = "0%";
  const progressText = document.getElementById("customerImportProgressText");
  if (progressText) progressText.textContent = "0%";
  const progressRows = document.getElementById("customerImportProgressRows");
  if (progressRows) progressRows.textContent = "0 / 0";
  const progressSuccess = document.getElementById("customerImportProgressSuccess");
  if (progressSuccess) progressSuccess.textContent = "0";
  const progressFailed = document.getElementById("customerImportProgressFailed");
  if (progressFailed) progressFailed.textContent = "0";
  const progressRemaining = document.getElementById("customerImportProgressRemaining");
  if (progressRemaining) progressRemaining.textContent = "0";
  const controls = document.querySelector("#customerImportDialog .customer-import-controls");
  if (controls) controls.scrollTop = 0;
  const failedExportBtn = document.getElementById("customerImportFailedExportBtn");
  if (failedExportBtn) failedExportBtn.classList.add("hidden");
}

function renderCustomerImportPreview(preview) {
  customerImportPreview = preview;
  const summary = preview.summary;
  const values = {
    customerImportTotalCount: summary.total,
    customerImportValidCount: summary.valid,
    customerImportErrorCount: summary.errors,
    customerImportNewCount: summary.newCustomers,
    customerImportExistingCount: summary.existingCustomers,
    customerImportDuplicateCount: summary.duplicates
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  });
  document.getElementById("customerImportSummary")?.classList.remove("hidden");

  customerImportFailedRows = preview.rows
    .filter(row => row.errors.length)
    .map(row => ({
      sourceRow: row.sourceRow,
      customerNumber: row.customerNumber,
      name: row.name,
      address: row.address,
      phone: row.phone,
      message: row.errors.join(" — ")
    }));
  const failedExportBtn = document.getElementById("customerImportFailedExportBtn");
  if (failedExportBtn) {
    failedExportBtn.classList.toggle("hidden", !customerImportFailedRows.length);
    failedExportBtn.textContent = customerImportFailedRows.length
      ? `تنزيل ملف الصفوف التي بها أخطاء (${customerImportFailedRows.length})`
      : "تنزيل ملف الصفوف التي بها أخطاء";
  }

  const body = document.getElementById("customerImportPreviewBody");
  if (body) {
    const previewLimit = 200;
    const visibleRows = preview.rows.slice(0, previewLimit);
    body.innerHTML = visibleRows.map(row => {
      const statusLabel = row.status === "error"
        ? "خطأ"
        : row.status === "existing"
          ? "موجود"
          : "جديد";
      const statusClass = row.status === "error"
        ? "danger"
        : row.status === "existing"
          ? "warning"
          : "success";
      return `
        <tr>
          <td>${row.sourceRow}</td>
          <td>${escapeHtml(row.customerNumber || "-")}</td>
          <td>${escapeHtml(row.name || "-")}</td>
          <td>${escapeHtml(row.address || "-")}</td>
          <td dir="ltr">${escapeHtml(row.phone || "-")}</td>
          <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
          <td>${escapeHtml(row.statusNote || (row.errors.length ? row.errors.join(" — ") : "جاهز"))}</td>
        </tr>
      `;
    }).join("") + (preview.rows.length > previewLimit
      ? `<tr><td colspan="7" class="empty-cell">يتم عرض أول ${previewLimit} صف فقط من أصل ${preview.rows.length} صف للحفاظ على سرعة الواجهة. سيتم استيراد جميع الصفوف الصحيحة.</td></tr>`
      : "");
  }

  const normalImportCount = preview.rows.filter(row => !row.errors.length && !row.previouslyUploaded && !customerImportIsDuplicate(row)).length;
  const eligibleCount = customerImportOverrideRows(preview.rows).length;
  const duplicateOrExistingCount = preview.rows.filter(customerImportIsDuplicate).length;
  const hardErrorCount = preview.rows.filter(row => customerImportOverrideClassification(row).hardErrors.length > 0).length;

  const executeBtn = document.getElementById("customerImportExecuteBtn");
  if (executeBtn) {
    executeBtn.disabled = normalImportCount === 0;
    executeBtn.textContent = normalImportCount > 0
      ? `اعتماد الاستيراد (${normalImportCount})`
      : "لا توجد صفوف جديدة للاستيراد";
    executeBtn.title = normalImportCount > 0 ? "" : "جميع الصفوف مرفوعة مسبقًا أو تحتوي على أخطاء أو مكررة.";
  }

  const overrideBtn = document.getElementById("customerImportOverrideBtn");
  if (overrideBtn) {
    const isSuperAdmin = currentRole() === "super_admin";
    overrideBtn.classList.toggle("hidden", !isSuperAdmin);
    overrideBtn.disabled = !isSuperAdmin || eligibleCount === 0;
    overrideBtn.textContent = eligibleCount > 0
      ? `اعتماد استثنائي بالباسورد (${eligibleCount})`
      : "لا توجد أخطاء قابلة للاستثناء";
    overrideBtn.title = eligibleCount > 0
      ? "يتطلب كلمة مرور مدير النظام"
      : "الأخطاء الحالية مكررة أو مرفوعة مسبقًا أو غير قابلة للتجاوز.";
  }

  const decisionNotice = document.getElementById("customerImportDecisionNotice");
  if (decisionNotice) {
    decisionNotice.classList.remove("hidden");
    if (normalImportCount > 0) {
      decisionNotice.textContent = `سيتم اعتماد ${normalImportCount} صف جديد فقط. سيتم استبعاد ${duplicateOrExistingCount} صف مكرر أو مرفوع مسبقًا و${hardErrorCount} صف بأخطاء غير قابلة للتجاوز.`;
    } else if (eligibleCount > 0 && currentRole() === "super_admin") {
      decisionNotice.textContent = `لا توجد صفوف صحيحة جديدة. يمكن لمدير النظام اعتماد ${eligibleCount} صف بأخطاء قابلة للتجاوز بعد التحقق بكلمة المرور.`;
    } else {
      decisionNotice.textContent = "لا توجد صفوف جديدة قابلة للاستيراد. جميع الصفوف إما مرفوعة مسبقًا أو مكررة أو تحتوي على أخطاء غير قابلة للتجاوز.";
    }
  }
}

async function previewCustomerImportFile(file) {
  if (!file) return;
  customerImportFile = file;
  const fileName = document.getElementById("customerImportFileName");
  if (fileName) fileName.textContent = file.name;
  showDataStatus("customerImportStatus", "جاري قراءة الملف والتحقق من البيانات...", "info");

  try {
    const rows = await window.CustomerExcelCenter.parseImportFile(file);
    const preview = window.CustomerExcelCenter.buildImportPreview(rows, { customers });
    renderCustomerImportPreview(preview);
    showDataStatus(
      "customerImportStatus",
      preview.summary.errors
        ? `تم التحقق: سيتم استيراد ${preview.summary.valid} صف صحيح وتجاهل ${preview.summary.errors} صف به أخطاء.`
        : "تم التحقق من الملف وهو جاهز للاستيراد.",
      preview.summary.errors ? "info" : "success"
    );
  } catch (error) {
    customerImportPreview = null;
    showDataStatus(
      "customerImportStatus",
      error instanceof Error ? error.message : "تعذر قراءة ملف Excel.",
      "error"
    );
  }
}

function openCustomerImportDialog() {
  if (!requireScreenAction("customers", "add", "لا توجد صلاحية استيراد العملاء.")) return;
  resetCustomerImportDialog();
  document.getElementById("customerImportDialog")?.showModal();
}

document.getElementById("customersImportBtn")?.addEventListener("click", openCustomerImportDialog);
document.getElementById("referenceCustomersImportBtn")?.addEventListener("click", openCustomerImportDialog);

document.getElementById("customerImportChooseFileBtn")?.addEventListener("click", () => {
  document.getElementById("customerImportFileInput")?.click();
});

document.getElementById("customerImportFileInput")?.addEventListener("change", event => {
  previewCustomerImportFile(event.target.files?.[0] || null);
});

document.getElementById("customerImportCloseBtn")?.addEventListener("click", closeCustomerImportDialog);
document.getElementById("customerImportCancelBtn")?.addEventListener("click", closeCustomerImportDialog);

function customerImportIsDuplicate(row) {
  const messages = Array.isArray(row?.errors) ? row.errors : [];
  return messages.some(message => /مكرر|مرفوع مسبقًا|مسجل بالفعل/.test(String(message || "")));
}

function customerImportOverrideClassification(row) {
  const errors = Array.isArray(row?.errors) ? row.errors : [];
  if (!errors.length || customerImportIsDuplicate(row)) {
    return { eligible: false, duplicate: customerImportIsDuplicate(row), hardErrors: [], softErrors: [] };
  }

  const hardPatterns = [
    /اسم العميل مطلوب/,
    /التصنيف يجب/,
    /المندوب غير مسجل/,
    /مجال اهتمام غير مسجل/
  ];
  const hardErrors = errors.filter(message => hardPatterns.some(pattern => pattern.test(String(message || ""))));
  const softErrors = errors.filter(message => !hardErrors.includes(message));
  return {
    eligible: softErrors.length > 0 && hardErrors.length === 0,
    duplicate: false,
    hardErrors,
    softErrors
  };
}

function customerImportOverrideRows(rows = []) {
  return rows.filter(row => customerImportOverrideClassification(row).eligible);
}

function customerImportSanitizeOverrideRow(row) {
  const classification = customerImportOverrideClassification(row);
  const invalidPhone = classification.softErrors.some(message => /رقم الجوال غير صالح/.test(String(message || "")));
  return {
    ...row,
    phone: invalidPhone ? null : row.phone,
    contactPersonName: row.contactPersonName || "",
    errors: [],
    adminOverride: true,
    adminOverrideWarnings: [...classification.softErrors]
  };
}

function closeCustomerImportOverrideDialog() {
  const dialog = document.getElementById("customerImportOverrideDialog");
  if (dialog?.open) dialog.close();
  const password = document.getElementById("customerImportOverridePassword");
  if (password) password.value = "";
  showDataStatus("customerImportOverrideStatus", "");
}

function openCustomerImportOverrideDialog() {
  if (currentRole() !== "super_admin" || !customerImportPreview) return;
  const eligible = customerImportOverrideRows(customerImportPreview.rows);
  if (!eligible.length) return;
  const duplicateCount = customerImportPreview.rows.filter(customerImportIsDuplicate).length;
  const hardCount = customerImportPreview.rows.filter(row => {
    const c = customerImportOverrideClassification(row);
    return c.hardErrors.length > 0;
  }).length;
  const validCount = customerImportPreview.rows.filter(row => !row.errors.length).length;
  const summary = document.getElementById("customerImportOverrideSummary");
  if (summary) {
    summary.innerHTML = `
      <strong>ملخص الاستيراد الاستثنائي</strong>
      <span>صفوف صحيحة: ${validCount}</span>
      <span>صفوف سيتم تجاوز تحذيراتها: ${eligible.length}</span>
      <span>صفوف مكررة أو مرفوعة مسبقًا لن تُرفع: ${duplicateCount}</span>
      <span>صفوف بأخطاء غير قابلة للتجاوز لن تُرفع: ${hardCount}</span>
    `;
  }
  document.getElementById("customerImportOverrideDialog")?.showModal();
  setTimeout(() => document.getElementById("customerImportOverridePassword")?.focus(), 50);
}

async function finalizeCustomerImportOverrideAudit(auditId, result, overrideRowsCount, status = "completed") {
  if (!auditId) return;
  const { data, error } = await window.customerSupabase.rpc("finalize_admin_import_override", {
    p_audit_id: auditId,
    p_status: status,
    p_inserted_rows: Number(result?.inserted || 0),
    p_updated_rows: Number(result?.updated || 0),
    p_skipped_rows: Number(result?.skipped || 0),
    p_failed_rows: Number(result?.failed || 0),
    p_override_rows: Number(overrideRowsCount || 0)
  });
  if (error || data !== true) {
    throw new Error(error?.message || "تعذر إغلاق سجل الاعتماد الاستثنائي.");
  }
}

function renderCustomerImportResult(result, { override = false, overrideRowsCount = 0, auditFinalized = false } = {}) {
  const panel = document.getElementById("customerImportResult");
  if (!panel) return;
  const savedCustomers = Number(result?.inserted || 0) + Number(result?.updated || 0);
  const failed = Number(result?.failed || 0);
  const skipped = Number(result?.skipped || 0);
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <strong>${failed ? "اكتمل الاستيراد مع ملاحظات" : "تم حفظ البيانات في Supabase بنجاح"}</strong>
    <span>العملاء المحفوظون أو المحدثون: ${savedCustomers}</span>
    ${override ? `<span>الصفوف المعتمدة استثنائيًا: ${overrideRowsCount}</span>` : ""}
    <span>المكرر أو المتجاهل: ${skipped}</span>
    <span>فشل الحفظ: ${failed}</span>
    ${override ? `<span>سجل الاعتماد: ${auditFinalized ? "تم إغلاقه وتأكيده" : "تعذر تأكيد إغلاقه"}</span>` : ""}
  `;
}

async function executeCustomerImport({ override = false, auditId = null } = {}) {
  if (!customerImportPreview) return;
  const mode = document.getElementById("customerImportMode")?.value || "new_only";
  document.getElementById("customerImportResult")?.classList.add("hidden");

  if (!requireScreenAction("customers", "add", "لا توجد صلاحية استيراد العملاء.")) return;
  if (mode === "upsert" &&
      !requireScreenAction("customers", "edit", "لا توجد صلاحية تحديث العملاء الموجودين.")) {
    return;
  }

  const normalRows = customerImportPreview.rows.filter(row => !row.errors.length && !row.previouslyUploaded);
  const overrideRows = override
    ? customerImportOverrideRows(customerImportPreview.rows).map(customerImportSanitizeOverrideRow)
    : [];
  const importRows = [...normalRows, ...overrideRows].filter(row => !customerImportIsDuplicate(row));
  if (!importRows.length) {
    showDataStatus(
      "customerImportStatus",
      override
        ? "لا توجد صفوف بأخطاء قابلة للاستثناء. الصفوف الحالية مكررة أو مرفوعة مسبقًا أو غير قابلة للتجاوز."
        : "لا توجد صفوف جديدة قابلة للاستيراد. جميع الصفوف الحالية مرفوعة مسبقًا أو مكررة أو تحتوي على أخطاء.",
      "info"
    );
    const notice = document.getElementById("customerImportDecisionNotice");
    if (notice) {
      notice.classList.remove("hidden");
      notice.textContent = "لم يتم إرسال أي بيانات إلى Supabase لعدم وجود صفوف جديدة قابلة للحفظ.";
    }
    return;
  }
  const executeBtn = document.getElementById("customerImportExecuteBtn");
  const overrideBtn = document.getElementById("customerImportOverrideBtn");
  if (executeBtn) executeBtn.disabled = true;
  if (overrideBtn) overrideBtn.disabled = true;

  try {
    customerImportFailedRows = customerImportPreview.rows
      .filter(row => row.errors.length && !overrideRows.some(item => item.sourceRow === row.sourceRow))
      .map(row => ({
        sourceRow: row.sourceRow,
        customerNumber: row.customerNumber,
        name: row.name,
        address: row.address,
        phone: row.phone,
        message: row.errors.join(" — ")
      }));
    const progressPanel = document.getElementById("customerImportProgress");
    progressPanel?.classList.remove("hidden");
    const controlsPanel = document.querySelector("#customerImportDialog .customer-import-controls");
    if (controlsPanel) controlsPanel.scrollTo({ top: 0, behavior: "smooth" });
    const initialRemaining = document.getElementById("customerImportProgressRemaining");
    if (initialRemaining) initialRemaining.textContent = String(importRows.length);
    const initialSuccess = document.getElementById("customerImportProgressSuccess");
    if (initialSuccess) initialSuccess.textContent = "0";
    const initialFailed = document.getElementById("customerImportProgressFailed");
    if (initialFailed) initialFailed.textContent = "0";
    const initialProgressBar = document.getElementById("customerImportProgressBar");
    if (initialProgressBar) initialProgressBar.style.width = "0%";
    const initialProgressText = document.getElementById("customerImportProgressText");
    if (initialProgressText) initialProgressText.textContent = "0%";
    showDataStatus(
      "customerImportStatus",
      `بدء الرفع على دفعات بحد أقصى 200 عميل لكل دفعة — 0 من ${importRows.length} (0%)`,
      "info"
    );
    progressPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const result = await window.CustomersService.importCustomers(
      importRows,
      mode,
      (current, total, _row, progressResults = {}, batch = {}) => {
        const percent = total ? Math.round((current / total) * 100) : 0;
        const progressBar = document.getElementById("customerImportProgressBar");
        if (progressBar) progressBar.style.width = `${percent}%`;
        const progressText = document.getElementById("customerImportProgressText");
        if (progressText) progressText.textContent = `${percent}%`;
        const progressRows = document.getElementById("customerImportProgressRows");
        if (progressRows) progressRows.textContent = `${current} / ${total}`;

        const successCount = Number(progressResults.inserted || 0)
          + Number(progressResults.updated || 0);
        const failedCount = Number(progressResults.failed || 0);

        const progressSuccess = document.getElementById("customerImportProgressSuccess");
        if (progressSuccess) progressSuccess.textContent = String(successCount);
        const progressFailed = document.getElementById("customerImportProgressFailed");
        if (progressFailed) progressFailed.textContent = String(failedCount);
        const progressRemaining = document.getElementById("customerImportProgressRemaining");
        if (progressRemaining) progressRemaining.textContent = String(Math.max(0, total - current));

        const batchLabel = batch.totalBatches
          ? ` — الدفعة ${batch.batchIndex} من ${batch.totalBatches} (${batch.batchSize} عميل)`
          : "";
        showDataStatus(
          "customerImportStatus",
          `جاري الرفع: ${current} من ${total} — ${percent}%${batchLabel}`,
          "info"
        );
      },
      { batchSize: 200, adminOverride: override }
    );

    customerImportFailedRows = [...customerImportFailedRows, ...(result.errors || [])];
    const failedExportBtn = document.getElementById("customerImportFailedExportBtn");
    if (failedExportBtn) {
      failedExportBtn.classList.toggle("hidden", !customerImportFailedRows.length);
      failedExportBtn.textContent = customerImportFailedRows.length
        ? `تنزيل ملف الصفوف التي بها أخطاء (${customerImportFailedRows.length})`
        : "تنزيل ملف الصفوف التي بها أخطاء";
    }
    await loadCustomersFromSupabase(true);
    renderReferenceCustomers();

    let auditFinalized = false;
    if (override && auditId) {
      try {
        await finalizeCustomerImportOverrideAudit(
          auditId,
          result,
          overrideRows.length,
          result.failed ? "completed_with_errors" : "completed"
        );
        auditFinalized = true;
      } catch (auditError) {
        console.error("Import override audit finalization failed:", auditError);
      }
    }

    const completedProgressBar = document.getElementById("customerImportProgressBar");
    if (completedProgressBar) completedProgressBar.style.width = "100%";
    const completedProgressText = document.getElementById("customerImportProgressText");
    if (completedProgressText) completedProgressText.textContent = "100%";
    const completedProgressRows = document.getElementById("customerImportProgressRows");
    if (completedProgressRows) completedProgressRows.textContent = `${importRows.length} / ${importRows.length}`;
    const completedRemaining = document.getElementById("customerImportProgressRemaining");
    if (completedRemaining) completedRemaining.textContent = "0";

    renderCustomerImportResult(result, {
      override,
      overrideRowsCount: overrideRows.length,
      auditFinalized
    });
    document.getElementById("customerImportResult")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showDataStatus(
      "customerImportStatus",
      `اكتمل الاستيراد وتم تنفيذ الحفظ في Supabase: ${Number(result.inserted || 0)} جديد، ${Number(result.updated || 0)} تحديث، ${Number(result.skipped || 0)} مكرر أو متجاهل، ${Number(result.failed || 0)} فشل${override ? `، ${overrideRows.length} صف باعتماد استثنائي` : ""}.`,
      result.failed ? "error" : "success"
    );
  } catch (error) {
    if (override && auditId) {
      try {
        await finalizeCustomerImportOverrideAudit(auditId, { failed: importRows.length }, overrideRows.length, "failed");
      } catch (auditError) {
        console.error("Failed import audit finalization skipped:", auditError);
      }
    }
    showDataStatus(
      "customerImportStatus",
      error instanceof Error ? error.message : "تعذر تنفيذ الاستيراد.",
      "error"
    );
  } finally {
    if (executeBtn) executeBtn.disabled = false;
    if (overrideBtn) overrideBtn.disabled = false;
  }
}

document.getElementById("customerImportExecuteBtn")?.addEventListener("click", event => {
  event.preventDefault();
  void executeCustomerImport();
});
document.getElementById("customerImportOverrideBtn")?.addEventListener("click", openCustomerImportOverrideDialog);
document.getElementById("customerImportOverrideCloseBtn")?.addEventListener("click", closeCustomerImportOverrideDialog);
document.getElementById("customerImportOverrideCancelBtn")?.addEventListener("click", closeCustomerImportOverrideDialog);

document.getElementById("customerImportOverrideForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (currentRole() !== "super_admin") {
    showDataStatus("customerImportOverrideStatus", "هذا الإجراء متاح لمدير النظام فقط.", "error");
    return;
  }
  const password = document.getElementById("customerImportOverridePassword")?.value || "";
  if (!password) {
    showDataStatus("customerImportOverrideStatus", "أدخل كلمة مرور مدير النظام.", "error");
    return;
  }
  const confirmBtn = document.getElementById("customerImportOverrideConfirmBtn");
  if (confirmBtn) confirmBtn.disabled = true;
  showDataStatus("customerImportOverrideStatus", "جاري التحقق من الهوية والصلاحية...", "info");
  try {
    const eligible = customerImportOverrideRows(customerImportPreview?.rows || []);
    const duplicates = (customerImportPreview?.rows || []).filter(customerImportIsDuplicate).length;

    const { data: userData, error: userError } = await window.customerSupabase.auth.getUser();
    if (userError || !userData?.user?.email) {
      throw new Error(userError?.message || "تعذر تحديد بريد مدير النظام الحالي.");
    }

    const currentUserId = userData.user.id;
    const currentEmail = userData.user.email;

    const { data: reauthData, error: reauthError } = await window.customerSupabase.auth.signInWithPassword({
      email: currentEmail,
      password
    });

    if (reauthError || !reauthData?.user) {
      throw new Error("كلمة المرور غير صحيحة.");
    }

    if (reauthData.user.id !== currentUserId) {
      throw new Error("تم رفض الاعتماد لأن جلسة المستخدم تغيرت أثناء التحقق.");
    }

    const { data: auditId, error: auditError } = await window.customerSupabase.rpc(
      "begin_admin_import_override",
      {
        p_file_name: customerImportFile?.name || "",
        p_total_rows: Number(customerImportPreview?.summary?.total || 0),
        p_override_rows: Number(eligible.length || 0),
        p_duplicate_rows: Number(duplicates || 0)
      }
    );

    if (auditError || !auditId) {
      throw new Error(auditError?.message || "تعذر إنشاء سجل الاعتماد الاستثنائي.");
    }

    customerImportOverrideAuditId = auditId;
    closeCustomerImportOverrideDialog();
    await executeCustomerImport({ override: true, auditId: customerImportOverrideAuditId });
  } catch (error) {
    showDataStatus("customerImportOverrideStatus", error instanceof Error ? error.message : "تعذر التحقق.", "error");
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
});

document.getElementById("customerImportFailedExportBtn")?.addEventListener("click", () => {
  try {
    window.CustomerExcelCenter.exportFailedRows(customerImportFailedRows);
  } catch (error) {
    showDataStatus("customerImportStatus", error instanceof Error ? error.message : "تعذر تصدير الصفوف الفاشلة.", "error");
  }
});

document.getElementById("referenceCustomersExportBtn")?.addEventListener("click", () => {
  if (!requireScreenAction("customers", "export", "لا توجد صلاحية تصدير بيانات العملاء.")) return;

  try {
    const filteredRows = filteredReferenceCustomers();
    const exportedCount = window.CustomerExcelCenter.exportCustomers(
      filteredRows,
      { filtered: filteredRows.length !== customers.length }
    );

    showDataStatus(
      "referenceCustomersStatus",
      `تم تصدير ${exportedCount} عميل إلى Excel.`,
      "success"
    );
  } catch (error) {
    showDataStatus(
      "referenceCustomersStatus",
      error instanceof Error ? error.message : "تعذر تصدير بيانات العملاء.",
      "error"
    );
  }
});

function downloadCustomerImportTemplate() {
  if (!requireScreenAction("customers", "export", "لا توجد صلاحية تنزيل نموذج العملاء.")) return;
  try {
    window.CustomerExcelCenter.downloadTemplate();
    showDataStatus("customersStatus", "تم تنزيل نموذج استيراد العملاء.", "success");
  } catch (error) {
    showDataStatus("customersStatus", error instanceof Error ? error.message : "تعذر تنزيل النموذج.", "error");
  }
}

document.getElementById("customersTemplateBtn")?.addEventListener("click", downloadCustomerImportTemplate);

document.getElementById("referenceCustomersTemplateBtn")?.addEventListener("click", () => {
  if (!requireScreenAction("customers", "export", "لا توجد صلاحية تنزيل نموذج العملاء.")) return;

  try {
    window.CustomerExcelCenter.downloadTemplate();
    showDataStatus(
      "referenceCustomersStatus",
      "تم تنزيل نموذج استيراد العملاء.",
      "success"
    );
  } catch (error) {
    showDataStatus(
      "referenceCustomersStatus",
      error instanceof Error ? error.message : "تعذر تنزيل النموذج.",
      "error"
    );
  }
});

document.getElementById("referenceCustomersPrevPage")?.addEventListener("click", () => {
  if (referenceCustomersPage > 1) {
    referenceCustomersPage -= 1;
    renderReferenceCustomers();
  }
});

document.getElementById("referenceCustomersNextPage")?.addEventListener("click", () => {
  const pageCount = Math.max(
    1,
    Math.ceil(filteredReferenceCustomers().length / REFERENCE_CUSTOMERS_PAGE_SIZE)
  );
  if (referenceCustomersPage < pageCount) {
    referenceCustomersPage += 1;
    renderReferenceCustomers();
  }
});

document.getElementById("referenceCustomersTableBody")?.addEventListener("click", event => {
  const detailsId = event.target.closest("[data-reference-customer-details]")?.dataset.referenceCustomerDetails;
  const editId = event.target.closest("[data-reference-customer-edit]")?.dataset.referenceCustomerEdit;
  const deleteId = event.target.closest("[data-reference-customer-delete]")?.dataset.referenceCustomerDelete;
  const customer = customers.find(item => item.id === (detailsId || editId || deleteId));
  if (!customer) return;

  if (detailsId) {
    showCustomerDetails(customer);
    return;
  }

  if (editId) {
    if (!requireScreenAction("customers", "edit", "لا توجد صلاحية تعديل العملاء.")) return;
    openCustomerDialog(customer);
    return;
  }

  if (deleteId) {
    if (!requireScreenAction("customers", "delete", "لا توجد صلاحية حذف العملاء.")) return;
    deleteCustomer(customer.id);
  }
});

window.addEventListener("customer-auth-ready", async () => {
  window.DailyActivityService?.startHeartbeat?.();

  // Dashboard certification: startup must be cache-first. A forced network
  // reconciliation here bypassed IndexedDB on a cold offline launch and left
  // the dashboard arrays empty. Each domain service now returns cached data
  // immediately and performs Delta Sync in the background when online.
  await Promise.allSettled([
    loadReferenceDataFromSupabase(false),
    loadCustomersFromSupabase(false),
    loadFollowupsFromSupabase(false),
    loadQuotationsFromSupabase(false)
  ]);

  populateSecurityOptions();
  renderDashboard();
  await loadDailyOperations(false);

  const profile = window.CustomerAuth?.getState?.().profile;
  if (window.CustomerPermissions?.canScreen?.("dailyOperations", "view")
      && !window.CustomerPermissions?.canScreen?.("dashboard", "view")) {
    switchView("dailyOperations");
  }
});


document.getElementById("customersPrevPage")?.addEventListener("click", () => {
  if (customersPage > 1) {
    customersPage -= 1;
    renderCustomers();
  }
});

document.getElementById("customersNextPage")?.addEventListener("click", () => {
  const pageCount = Math.max(1, Math.ceil(filteredCustomers().length / CUSTOMERS_PAGE_SIZE));
  if (customersPage < pageCount) {
    customersPage += 1;
    renderCustomers();
  }
});


document.getElementById("followupsPrevPage")?.addEventListener("click", () => {
  if (followupsPage > 1) {
    followupsPage -= 1;
    renderFollowups();
  }
});

document.getElementById("followupsNextPage")?.addEventListener("click", () => {
  const pageCount = Math.max(1, Math.ceil(filteredFollowups().length / FOLLOWUPS_PAGE_SIZE));
  if (followupsPage < pageCount) {
    followupsPage += 1;
    renderFollowups();
  }
});


document.getElementById("quotationsPrevPage")?.addEventListener("click", () => {
  if (quotationsPage > 1) {
    quotationsPage -= 1;
    renderQuotations();
  }
});

document.getElementById("quotationsNextPage")?.addEventListener("click", () => {
  const pageCount = Math.max(
    1,
    Math.ceil(filteredQuotations().length / QUOTATIONS_PAGE_SIZE)
  );

  if (quotationsPage < pageCount) {
    quotationsPage += 1;
    renderQuotations();
  }
});


document.getElementById("refreshDailyPerformanceBtn")?.addEventListener(
  "click",
  () => loadDailyPerformanceReport(true)
);
document.getElementById("exportDailyPerformancePdfBtn")?.addEventListener(
  "click",
  exportDailyPerformancePdf
);
document.getElementById("sendDailyPerformanceWhatsappPdfBtn")?.addEventListener(
  "click",
  sendDailyPerformanceWhatsappPdf
);
document.getElementById("resetDailyPerformanceFiltersBtn")?.addEventListener(
  "click",
  resetDailyPerformanceFilters
);
document.getElementById("dailyPerformanceDate")?.addEventListener(
  "change",
  () => loadDailyPerformanceReport(true)
);
document.getElementById("dailyPerformanceRepresentativeFilter")?.addEventListener(
  "change",
  renderDailyPerformanceReport
);
document.getElementById("dailyPerformanceDetailSelector")?.addEventListener(
  "change",
  event => {
    dailyPerformanceDetailType = event.target.value;
    if (dailyPerformanceDetailType === "tasks") resetDailyTasksReportView();
    else renderDailyPerformanceDetail();
  }
);

document.getElementById("dailyActivityEmployeeFilter")?.addEventListener(
  "change",
  () => {
    dailyActivityReportRequested = false;
    renderDailyActivityTimeline();
  }
);
document.getElementById("dailyActivityTypeFilter")?.addEventListener(
  "change",
  () => {
    dailyActivityReportRequested = false;
    renderDailyActivityTimeline();
  }
);
document.getElementById("showDailyActivityReportBtn")?.addEventListener(
  "click",
  () => {
    const employee = document.getElementById("dailyActivityEmployeeFilter")?.value || "";
    if (!employee) {
      showDataStatus("dailyPerformanceStatus", "اختر الموظف أولًا لعرض خط سير يومه.", "error");
      return;
    }
    dailyActivityReportRequested = true;
    showDataStatus("dailyPerformanceStatus", "");
    renderDailyActivityTimeline();
  }
);
document.getElementById("exportDailyActivityPdfBtn")?.addEventListener("click", exportDailyActivityPdf);
document.getElementById("sendDailyActivityWhatsappPdfBtn")?.addEventListener("click", sendDailyActivityWhatsappPdf);
document.getElementById("dailyTasksEmployeeFilter")?.addEventListener(
  "change",
  resetDailyTasksReportView
);
document.getElementById("showDailyTasksReportBtn")?.addEventListener(
  "click",
  () => {
    const employee = document.getElementById("dailyTasksEmployeeFilter")?.value || "";
    if (!employee) {
      showDataStatus("dailyPerformanceStatus", "اختر الموظف أولًا لعرض تقرير المهام اليومية.", "error");
      return;
    }
    dailyTasksReportRequested = true;
    showDataStatus("dailyPerformanceStatus", "");
    renderDailyPerformanceDetail();
  }
);

document.getElementById("endDailyWorkBtn")?.addEventListener("click", async () => {
  if (!confirm("هل تريد إنهاء يوم العمل الحالي؟")) return;

  const button = document.getElementById("endDailyWorkBtn");
  button.disabled = true;

  try {
    await window.DailyActivityService.endDay();
    await renderCurrentDailySession();
    showDataStatus(
      "dailyOperationsStatus",
      "تم تسجيل إنهاء يوم العمل.",
      "success"
    );
  } catch (error) {
    showDataStatus(
      "dailyOperationsStatus",
      error instanceof Error ? error.message : "تعذر إنهاء يوم العمل.",
      "error"
    );
    button.disabled = false;
  }
});

document.getElementById("refreshDailyAlertsBtn")?.addEventListener(
  "click",
  () => loadDailyAlerts(true)
);
["dailyAlertsStatusFilter", "dailyAlertsRepresentativeFilter"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", renderDailyAlerts);
});
document.getElementById("dailyAlertsList")?.addEventListener("click", event => {
  const alertId = event.target.dataset.alertId;
  const actionType = event.target.dataset.alertAction;
  if (alertId && actionType) openDailyAlertAction(alertId, actionType);
});

["closeDailyAlertActionDialogBtn","cancelDailyAlertActionBtn"].forEach(id => {
  document.getElementById(id)?.addEventListener(
    "click",
    closeDailyAlertActionDialog
  );
});

document.getElementById("dailyAlertActionForm")?.addEventListener(
  "submit",
  async event => {
    event.preventDefault();
    if (!dailyAlertPendingAction) return;

    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      await window.DailyAlertsService.act(
        dailyAlertPendingAction.alertId,
        dailyAlertPendingAction.actionType,
        document.getElementById("dailyAlertActionNote").value.trim()
      );
      closeDailyAlertActionDialog();
      await loadDailyAlerts(false);
      showDataStatus(
        "dailyAlertsStatus",
        "تم تنفيذ الإجراء على التنبيه بنجاح.",
        "success"
      );
    } catch (error) {
      showDataStatus(
        "dailyAlertsStatus",
        error instanceof Error ? error.message : "تعذر تنفيذ الإجراء.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
    }
  }
);

document.getElementById("dailyChecklist")?.addEventListener("change", event => {
  const taskKey = event.target.dataset.dailyTaskCheckbox;
  if (!taskKey) return;
  updateDailyTask(taskKey, event.target.checked);
});
function closeDailyTargetsDialog() {
  document.getElementById("dailyTargetsDialog").close();
}

function closeDailyManagerNoteDialog() {
  document.getElementById("dailyManagerNoteDialog").close();
}

document.getElementById("editDailyTargetsBtn")?.addEventListener("click", () => {
  document.getElementById("dailyTargetCustomersInput").value =
    dailyOperationTargets?.customersTarget ?? 0;
  document.getElementById("dailyTargetFollowupsInput").value =
    dailyOperationTargets?.followupsTarget ?? 0;
  document.getElementById("dailyTargetQuotationsInput").value =
    dailyOperationTargets?.quotationsTarget ?? 0;
  document.getElementById("dailyTargetsDialog").showModal();
});

document.getElementById("editDailyManagerNoteBtn")?.addEventListener("click", () => {
  document.getElementById("dailyManagerNoteTitleInput").value =
    dailyManagerNote?.title || "";
  document.getElementById("dailyManagerNoteTextInput").value = dailyManagerNote?.noteText || "";
  document.getElementById("dailyManagerNoteAudienceScope").value = dailyManagerNote?.audienceScope || "all";
  renderManagerNoteRecipients();
  syncManagerNoteRecipientsVisibility();
  document.getElementById("dailyManagerNoteDialog").showModal();
});


function escapeAttribute(value) { return escapeHtml(String(value || "")); }

function renderManagerNoteRecipients() {
  const container = document.getElementById("dailyManagerNoteRecipients");
  if (!container) return;
  const selected = new Set(dailyManagerNote?.recipientUserIds || []);
  container.innerHTML = employeeReportSettings.length
    ? employeeReportSettings.map(item => `<label class="daily-note-recipient"><input type="checkbox" value="${escapeAttribute(item.userId)}" ${selected.has(item.userId) ? "checked" : ""}><span>${escapeHtml(item.fullName)}</span></label>`).join("")
    : '<div class="empty-state">لا توجد بيانات موظفين متاحة.</div>';
}

function syncManagerNoteRecipientsVisibility() {
  const scope = document.getElementById("dailyManagerNoteAudienceScope")?.value || "all";
  document.getElementById("dailyManagerNoteRecipientsWrap")?.classList.toggle("hidden", scope !== "selected");
}


function renderEmployeeTargetsRows() {
  const body = document.getElementById("employeeTargetsBody");
  if (!body) return;
  body.innerHTML = employeeTargetsDialogRows.length ? employeeTargetsDialogRows.map((item, index) => `
    <tr data-employee-target-row="${index}">
      <td><strong>${escapeHtml(item.fullName)}</strong><br><small>${escapeHtml(item.role || "")}</small></td>
      <td><input type="checkbox" data-field="includeInDashboardPerformance" ${item.includeInDashboardPerformance ? "checked" : ""}></td>
      <td><input type="checkbox" data-field="includeInDailyReports" ${item.includeInDailyReports ? "checked" : ""}></td>
      <td><input type="checkbox" data-field="includeInTimelineReport" ${item.includeInTimelineReport ? "checked" : ""}></td>
      <td><input type="checkbox" data-field="requiresDailyTasks" ${item.requiresDailyTasks ? "checked" : ""}></td>
      <td><input type="checkbox" data-field="requiresTargets" ${item.requiresTargets ? "checked" : ""}></td>
      <td><input type="number" min="0" max="9999" data-field="customersTarget" value="${Number(item.customersTarget || 0)}" ${item.requiresTargets ? "" : "disabled"}></td>
      <td><input type="number" min="0" max="9999" data-field="followupsTarget" value="${Number(item.followupsTarget || 0)}" ${item.requiresTargets ? "" : "disabled"}></td>
      <td><input type="number" min="0" max="9999" data-field="quotationsTarget" value="${Number(item.quotationsTarget || 0)}" ${item.requiresTargets ? "" : "disabled"}></td>
    </tr>`).join("") : '<tr><td colspan="9">لا توجد حسابات نشطة.</td></tr>';
}

async function loadEmployeeTargetsDialog() {
  const date = document.getElementById("employeeTargetsEffectiveFrom")?.value || window.EmployeeReportSettingsService?.isoDate?.();
  showDataStatus("employeeTargetsStatus", "جاري تحميل الإعدادات...", "info");
  try {
    employeeTargetsDialogRows = await window.EmployeeReportSettingsService.listForDate(date, { force: true });
    renderEmployeeTargetsRows();
    showDataStatus("employeeTargetsStatus", "");
  } catch (error) {
    showDataStatus("employeeTargetsStatus", error.message || "تعذر تحميل الإعدادات.", "error");
  }
}

function openEmployeeTargetsDialog() {
  const input = document.getElementById("employeeTargetsEffectiveFrom");
  if (input && !input.value) input.value = window.EmployeeReportSettingsService?.isoDate?.() || new Date().toISOString().slice(0,10);
  document.getElementById("employeeTargetsDialog")?.showModal();
  loadEmployeeTargetsDialog();
}
function closeEmployeeTargetsDialog() { document.getElementById("employeeTargetsDialog")?.close(); }

document.getElementById("manageEmployeeTargetsBtn")?.addEventListener("click", openEmployeeTargetsDialog);
document.getElementById("dashboardRepresentativeVisibilityBtn")?.addEventListener("click", openEmployeeTargetsDialog);
document.getElementById("reloadEmployeeTargetsBtn")?.addEventListener("click", loadEmployeeTargetsDialog);
["closeEmployeeTargetsDialogBtn","cancelEmployeeTargetsBtn"].forEach(id => document.getElementById(id)?.addEventListener("click", closeEmployeeTargetsDialog));
document.getElementById("employeeTargetsBody")?.addEventListener("change", event => {
  const row = event.target.closest("tr[data-employee-target-row]");
  if (!row) return;
  const index = Number(row.dataset.employeeTargetRow);
  const item = employeeTargetsDialogRows[index];
  const field = event.target.dataset.field;
  if (!item || !field) return;
  item[field] = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value || 0);
  if (field === "requiresTargets") renderEmployeeTargetsRows();
});
document.getElementById("employeeTargetsForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const effectiveFrom = document.getElementById("employeeTargetsEffectiveFrom").value;
  showDataStatus("employeeTargetsStatus", "جاري حفظ الإعدادات...", "info");
  try {
    await window.EmployeeReportSettingsService.saveMany(employeeTargetsDialogRows.map(item => ({ ...item, effectiveFrom })));
    employeeReportSettings = await window.EmployeeReportSettingsService.listForDate();
    refreshDashboardRepresentativeOptions();
    closeEmployeeTargetsDialog();
    renderDailyOperations();
    if (activeViewKey === "dashboard") renderDashboard();
    dailyPerformanceSnapshot = null;
    showDataStatus("dailyOperationsStatus", "تم حفظ أهداف ومشاركة الموظفين في التقارير.", "success");
  } catch (error) {
    showDataStatus("employeeTargetsStatus", error.message || "تعذر حفظ الإعدادات.", "error");
  }
});

["closeDailyTargetsDialogBtn","cancelDailyTargetsBtn"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", closeDailyTargetsDialog);
});
["closeDailyManagerNoteDialogBtn","cancelDailyManagerNoteBtn"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", closeDailyManagerNoteDialog);
});

document.getElementById("dailyTargetsForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    dailyOperationTargets = await window.DailyOperationsService.saveTargets({
      customersTarget: document.getElementById("dailyTargetCustomersInput").value,
      followupsTarget: document.getElementById("dailyTargetFollowupsInput").value,
      quotationsTarget: document.getElementById("dailyTargetQuotationsInput").value
    });
    closeDailyTargetsDialog();
    renderDailyOperations();
    showDataStatus("dailyOperationsStatus", "تم حفظ الأهداف اليومية.", "success");
  } catch (error) {
    showDataStatus("dailyOperationsStatus", error instanceof Error ? error.message : "تعذر حفظ الأهداف.", "error");
  }
});


document.getElementById("dailyOperationsView")?.addEventListener("click", event => {
  const view = event.target.closest("[data-daily-open-view]")?.dataset.dailyOpenView;
  if (view) switchView(view);
});

document.getElementById("addUserBtn")?.addEventListener("click", () => openUserDialog());
document.getElementById("closeUserDialogBtn")?.addEventListener("click", closeUserDialog);
document.getElementById("cancelUserDialogBtn")?.addEventListener("click", closeUserDialog);
document.getElementById("userForm")?.addEventListener("submit", saveUserForm);
document.getElementById("userRole")?.addEventListener("change", syncInstallationTechnicianBindingFields);
document.getElementById("userDataAccessMode")?.addEventListener("change", syncUserDataAccessFields);
document.getElementById("userAllowedRepresentativesSearch")?.addEventListener("input", filterAllowedRepresentativesList);
document.getElementById("userAllowedRepresentativesList")?.addEventListener("change", event => {
  if (event.target.matches('input[type="checkbox"]')) updateAllowedRepresentativesCount();
});
document.getElementById("selectAllAllowedRepresentativesBtn")?.addEventListener("click", () => setAllowedRepresentativesSelection("all"));
document.getElementById("clearAllowedRepresentativesBtn")?.addEventListener("click", () => setAllowedRepresentativesSelection("none"));
document.getElementById("selectOwnRepresentativeBtn")?.addEventListener("click", () => setAllowedRepresentativesSelection("own"));
document.getElementById("userRepresentative")?.addEventListener("change", () => {
  if ((document.getElementById("userDataAccessMode")?.value || "") === "selected") updateAllowedRepresentativesCount();
});
document.getElementById("userInstallationAccessMode")?.addEventListener("change", syncUserInstallationAccessFields);
document.getElementById("userInstallationRepresentativesSearch")?.addEventListener("input", filterInstallationRepresentativesList);
document.getElementById("userInstallationRepresentativesList")?.addEventListener("change", event => {
  if (event.target.matches('input[type="checkbox"]')) updateInstallationRepresentativesCount();
});
document.getElementById("selectAllInstallationRepresentativesBtn")?.addEventListener("click", () => setInstallationRepresentativesSelection("all"));
document.getElementById("clearInstallationRepresentativesBtn")?.addEventListener("click", () => setInstallationRepresentativesSelection("none"));
document.getElementById("selectOwnInstallationRepresentativeBtn")?.addEventListener("click", () => setInstallationRepresentativesSelection("own"));
document.getElementById("userRepresentative")?.addEventListener("change", () => {
  if ((document.getElementById("userInstallationAccessMode")?.value || "") === "selected") updateInstallationRepresentativesCount();
});

document.getElementById("usersTableBody")?.addEventListener("click", event => {
  const editId = event.target.dataset.editUser;
  const resetId = event.target.dataset.resetPassword;
  if (editId) {
    const user = userRecords.find(item => item.id === editId);
    if (user) openUserDialog(user);
  }
  if (resetId) resetUserPassword(resetId);
});

["usersSearch","usersRoleFilter","usersStatusFilter"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", renderUsers);
  document.getElementById(id)?.addEventListener("change", renderUsers);
});

document.getElementById("permissionsRoleSelect")?.addEventListener("change", event => {
  loadRolePermissions(event.target.value).catch(error => showDataStatus("permissionsStatus", error.message, "error"));
});
document.getElementById("savePermissionsBtn")?.addEventListener("click", savePermissions);
document.getElementById("refreshActivityBtn")?.addEventListener("click", () => loadActivity(true));
["activitySearch","activityActionFilter"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", renderActivity);
  document.getElementById(id)?.addEventListener("change", renderActivity);
});


document.getElementById("createBackupBtn")?.addEventListener("click", exportBackup);
document.getElementById("downloadBackupBtn")?.addEventListener("click", exportBackup);
document.getElementById("backupFileInput")?.addEventListener("change", event => {
  inspectBackupFile(event.target.files?.[0] || null);
});
document.getElementById("restoreBackupBtn")?.addEventListener("click", restoreSelectedBackup);
document.getElementById("refreshBackupHistoryBtn")?.addEventListener("click", () => loadBackupHistory(true));
document.getElementById("saveSystemSettingsBtn")?.addEventListener("click", saveSystemSettings);
document.getElementById("systemSettingsForm")?.addEventListener("submit", saveSystemSettings);

document.getElementById("refreshSystemHealthBtn")?.addEventListener("click", () => loadSystemHealth(true));
document.getElementById("refreshReportsBtn")?.addEventListener("click", async () => {
  await Promise.all([
    loadCustomersFromSupabase(true),
    loadFollowupsFromSupabase(true),
    loadQuotationsFromSupabase(true)
  ]);
  populateReportsRepresentativeFilter();
  renderReportsOverview();
});
document.getElementById("openExportCenterBtn")?.addEventListener("click", openReportsExportCenter);
document.getElementById("closeReportsExportDialogBtn")?.addEventListener("click", closeReportsExportCenter);
document.getElementById("closeReportsExportDialogFooterBtn")?.addEventListener("click", closeReportsExportCenter);
document.getElementById("exportReportsExcelBtn")?.addEventListener("click", exportReportsExcel);
document.getElementById("exportReportsPdfBtn")?.addEventListener("click", exportReportsPdf);
document.getElementById("exportReportsPngBtn")?.addEventListener("click", exportReportsPng);
document.getElementById("exportReportsCsvBtn")?.addEventListener("click", exportReportsCsv);
document.getElementById("resetReportsFiltersBtn")?.addEventListener("click", resetReportsFilters);
["reportsDateFrom","reportsDateTo","reportsRepresentativeFilter"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", renderReportsOverview);
});
document.getElementById("reportsSalesTarget")?.addEventListener("change", () => {
  saveReportsTarget();
  renderReportsOverview();
});
document.querySelectorAll("[data-customer-analytics]").forEach(button => {
  button.addEventListener("click", () => {
    activeCustomerAnalyticsTab = button.dataset.customerAnalytics;
    document.querySelectorAll("[data-customer-analytics]").forEach(item => {
      item.classList.toggle("active", item === button);
    });
    if (currentReportsSnapshot) renderCustomerAnalytics(currentReportsSnapshot);
  });
});


document.getElementById("runDiagnosticsBtn")?.addEventListener("click", runEnterpriseDiagnostics);
document.getElementById("downloadDiagnosticsJsonBtn")?.addEventListener("click", () => {
  if (!latestDiagnosticsReport) return;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  downloadTextFile(
    `kyum-diagnostics-${stamp}.json`,
    JSON.stringify(latestDiagnosticsReport, null, 2),
    "application/json;charset=utf-8"
  );
});
document.getElementById("downloadDiagnosticsHtmlBtn")?.addEventListener("click", () => {
  if (!latestDiagnosticsReport) return;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  downloadTextFile(
    `kyum-diagnostics-${stamp}.html`,
    diagnosticsHtml(latestDiagnosticsReport),
    "text/html;charset=utf-8"
  );
});

document.getElementById("resetPerformanceMetricsBtn")?.addEventListener("click", () => {
  window.PerformanceMonitor?.reset?.();
  window.HealthAlertsEngine?.resetHistory?.();
  renderPerformanceMonitor();
  if (systemHealthSnapshot) renderSystemHealth();
});


(function setupQuotationCustomerSearchableSelect() {
  const wrapper = document.getElementById("quotationCustomerCombobox");
  const input = document.getElementById("quotationCustomerSearch");
  const toggle = document.getElementById("quotationCustomerToggle");
  const options = document.getElementById("quotationCustomerOptions");
  const select = document.getElementById("quotationCustomer");
  const dialog = document.getElementById("quotationDialog");
  if (!wrapper || !input || !toggle || !options || !select) return;

  input.addEventListener("focus", openQuotationCustomerOptions);
  input.addEventListener("click", openQuotationCustomerOptions);
  toggle.addEventListener("click", () => {
    if (wrapper.dataset.open === "true") {
      closeQuotationCustomerOptions();
      return;
    }
    input.focus();
    openQuotationCustomerOptions();
  });

  input.addEventListener("input", () => {
    const selectedId = input.dataset.selectedCustomerId || "";
    const selected = customers.find(item => String(item.id) === String(selectedId)) || null;
    if (!selected || input.value !== quotationCustomerDisplay(selected)) {
      select.value = "";
      input.dataset.selectedCustomerId = "";
      input.setCustomValidity("اختر العميل من نتائج البحث.");
    }
    openQuotationCustomerOptions();
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeQuotationCustomerOptions();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openQuotationCustomerOptions();
      options.querySelector(".searchable-select-option")?.focus();
    }
  });

  options.addEventListener("click", event => {
    const button = event.target.closest("[data-quotation-customer-id]");
    if (!button) return;
    setQuotationCustomerSelection(button.dataset.quotationCustomerId);
    input.focus();
  });

  options.addEventListener("keydown", event => {
    const current = event.target.closest(".searchable-select-option");
    if (!current) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const buttons = [...options.querySelectorAll(".searchable-select-option")];
      const index = buttons.indexOf(current);
      const nextIndex = event.key === "ArrowDown"
        ? Math.min(buttons.length - 1, index + 1)
        : Math.max(0, index - 1);
      buttons[nextIndex]?.focus();
    } else if (event.key === "Escape") {
      closeQuotationCustomerOptions();
      input.focus();
    }
  });

  select.addEventListener("change", syncQuotationCustomerSearchFromSelect);

  document.addEventListener("pointerdown", event => {
    if (!wrapper.contains(event.target)) closeQuotationCustomerOptions();
  });

  dialog?.addEventListener("close", closeQuotationCustomerOptions);
})();


(function setupOperationalCustomerRepresentativeSync() {
  const followupCustomer = document.getElementById("followupCustomer");
  const followupRepresentative = document.getElementById("followupRepresentative");
  followupCustomer?.addEventListener("change", () => {
    const customer = customerById(followupCustomer.value);
    const representativeId = operationalDefaultRepresentativeId(customer?.representativeId);
    if (followupRepresentative && representativeId) followupRepresentative.value = representativeId;
  });
})();

setOptions();
(() => {
  const date = document.getElementById("dailyPerformanceDate");
  if (date) {
    date.value = window.DailyPerformanceService?.localDate?.()
      || dailyLocalDate();
  }
})();
(() => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = document.getElementById("reportsDateFrom");
  const to = document.getElementById("reportsDateTo");
  if (from) from.value = first.toISOString().slice(0, 10);
  if (to) to.value = now.toISOString().slice(0, 10);
  const target = document.getElementById("reportsSalesTarget");
  if (target) {
    target.value = localStorage.getItem("kyum_reports_sales_target") || "100000";
  }
})();


// Phase M10.6 — Daily suggested customer contact report.
document.getElementById("dailyOperationsView")?.addEventListener("click", async event => {
  if (event.target.closest("#dailyWhatsAppTemplateImageBtn")) {
    document.getElementById("dailyWhatsAppTemplateImage")?.click();
    return;
  }
  if (event.target.closest("#dailyWhatsAppTemplateRemoveImageBtn")) {
    dailyWhatsAppTemplatePendingFile = null;
    dailyWhatsAppTemplateRemoveImage = true;
    renderDailyWhatsAppTemplate();
    updateDailyWhatsAppTemplateStatus("سيتم حذف الصورة عند الحفظ");
    return;
  }
  if (event.target.closest("#dailyWhatsAppTemplateSaveBtn")) {
    await saveDailyWhatsAppTemplate();
    return;
  }
  const shareButton = event.target.closest("[data-daily-whatsapp-share]");
  if (shareButton) {
    shareButton.disabled = true;
    try {
      await window.WhatsAppTemplateService?.shareImageAndMessage?.(
        dailyWhatsAppTemplate,
        shareButton.dataset.dailyWhatsappShare
      );
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("WhatsApp share failed", error);
        updateDailyWhatsAppTemplateStatus("تعذرت مشاركة الصورة؛ استخدم زر واتساب للنص", "error");
      }
    } finally {
      shareButton.disabled = false;
    }
    return;
  }

  const teamRetryButton = event.target.closest("[data-daily-team-retry]");
  if (teamRetryButton) {
    loadDailySuggestedTeam(true);
    return;
  }

  const retryButton = event.target.closest("[data-daily-suggested-retry]");
  if (retryButton) {
    loadDailySuggestedCustomers(true);
    return;
  }

  if (event.target.closest("[data-daily-suggested-add-customer]")) {
    document.getElementById("addCustomerBtn")?.click();
    return;
  }

  if (event.target.closest("[data-daily-suggested-import]")) {
    document.getElementById("importCustomersBtn")?.click();
    return;
  }

  const followupCustomerId = event.target.closest("[data-daily-suggested-followup]")?.dataset.dailySuggestedFollowup;
  if (followupCustomerId) {
    pendingDailySuggestionCompletion = null;
    openFollowupDialog(followupCustomerId);
    return;
  }

  const contactedButton = event.target.closest("[data-daily-suggested-contacted]");
  const contactedCustomerId = contactedButton?.dataset.dailySuggestedContacted;
  if (contactedCustomerId) {
    pendingDailySuggestionCompletion = {
      customerId: contactedCustomerId,
      suggestionId: contactedButton.dataset.dailySuggestionId || null
    };
    openFollowupDialog(contactedCustomerId);
    const completed = document.getElementById("followupCompleted");
    const result = document.getElementById("followupResult");
    if (completed) completed.value = "true";
    if (result) result.value = "تم التواصل";
  }
});

document.getElementById("dailyWhatsAppTemplateMessage")?.addEventListener("input", event => {
  const count = document.getElementById("dailyWhatsAppTemplateCount");
  if (count) count.textContent = String(event.target.value.length);
});

document.getElementById("dailyWhatsAppTemplateImage")?.addEventListener("change", event => {
  const file = event.target.files?.[0] || null;
  if (!file) return;
  if (!(["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    updateDailyWhatsAppTemplateStatus("صيغة الصورة غير مدعومة", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    updateDailyWhatsAppTemplateStatus("حجم الصورة أكبر من 5 ميجابايت", "error");
    event.target.value = "";
    return;
  }
  dailyWhatsAppTemplatePendingFile = file;
  dailyWhatsAppTemplateRemoveImage = false;
  updateDailyWhatsAppTemplateStatus("صورة جديدة جاهزة للحفظ");
  renderDailyWhatsAppTemplate();
});

// Phase M9.2 — Daily Operations phone ownership lookup.
(function setupDailyPhoneLookup() {
  const form = document.getElementById("dailyPhoneLookupForm");
  const input = document.getElementById("dailyPhoneLookupInput");
  const result = document.getElementById("dailyPhoneLookupResult");
  const button = document.getElementById("dailyPhoneLookupButton");
  if (!form || !input || !result || !button) return;

  let lookupRequestSequence = 0;

  function resetLookupResult() {
    result.className = "daily-phone-lookup-result hidden";
    result.textContent = "";
  }

  function showLookupResult(type, html) {
    result.className = `daily-phone-lookup-result is-${type}`;
    result.innerHTML = html;
  }

  input.addEventListener("input", () => {
    // Invalidate any in-flight lookup and immediately clear the previous result
    // whenever the user edits or removes the searched phone number.
    lookupRequestSequence += 1;
    resetLookupResult();
  });

  async function openExistingCustomer(customerId) {
    if (!customerId) return;
    if (!customersLoaded) await loadCustomersFromSupabase(true);
    const customer = customers.find(item => String(item.id) === String(customerId));
    if (!customer) return;
    switchView("customers");
    window.setTimeout(() => showCustomerDetails(customer.id), 0);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const normalizedPhone = normalizePhone(input.value);
    const requestSequence = ++lookupRequestSequence;
    resetLookupResult();

    if (!isValidSaudiMobile(normalizedPhone)) {
      showLookupResult("error", "أدخل رقم جوال سعودي صحيحًا بصيغة <strong>05XXXXXXXX</strong>.");
      input.focus();
      return;
    }

    button.disabled = true;
    button.textContent = "جاري البحث...";
    try {
      const customer = await findCustomerByPhone(normalizedPhone);
      if (
        requestSequence !== lookupRequestSequence
        || normalizePhone(input.value) !== normalizedPhone
      ) return;
      if (!customer) {
        showLookupResult("success", `الرقم <strong>${escapeHtml(normalizedPhone)}</strong> غير مرتبط بأي عميل مسجل.`);
        return;
      }

      const details = customerPhoneOwnershipDetails(customer);
      const repLine = details.representativeName
        ? `العميل يتبع المندوب <strong>«${escapeHtml(details.representativeName)}»</strong>.`
        : "لم يتم تعيين مندوب لهذا العميل حتى الآن.";
      const companyLine = details.canAccess && details.type === "شركة" && details.contactPersonName
        ? `<br>المسؤول: <strong>«${escapeHtml(details.contactPersonName)}»</strong>.`
        : "";
      const scopeLine = details.canAccess
        ? ""
        : `<br><strong>هذا العميل خارج نطاق البيانات المسموح لك بالوصول إليه، لذلك لا يمكنك استعراض بياناته.</strong>`;
      showLookupResult(
        "warning",
        `تنبيه: الرقم <strong>${escapeHtml(normalizedPhone)}</strong> مرتبط بالعميل <strong>«${escapeHtml(details.name)}»</strong>.<br>${repLine}${companyLine}${scopeLine}`
        + (details.canAccess && details.id ? `<div class="daily-phone-result-actions"><button type="button" class="secondary-btn compact-btn" data-open-existing-customer="${escapeHtml(String(details.id))}">فتح العميل الحالي</button></div>` : "")
      );
    } catch (error) {
      if (
        requestSequence === lookupRequestSequence
        && normalizePhone(input.value) === normalizedPhone
      ) {
        showLookupResult("error", escapeHtml(error instanceof Error ? error.message : "تعذر التحقق من رقم الجوال."));
      }
    } finally {
      button.disabled = false;
      button.textContent = "بحث";
    }
  });

  result.addEventListener("click", event => {
    const customerId = event.target.closest("[data-open-existing-customer]")?.dataset.openExistingCustomer;
    if (customerId) openExistingCustomer(customerId);
  });
})();

window.addEventListener("petatoe-language-changed", () => {
  window.PetatoeLocalization?.applyStatic?.(document);
  if (activeViewKey === "dashboard") renderDashboard();
  if (customersLoaded) renderCustomers();
  if (followupsLoaded) renderFollowups();
  if (quotationsLoaded) renderQuotations();
});
