// A14.3B — customer purchase overview, read-only; no permission or finance changes.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const PAGE = 500;
  const MAX_PAGES = 100;
  const fmt = amount => Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const integer = amount => Number(amount || 0).toLocaleString("en-US");
  let busy = false;
  let version = 0;

  async function getSales() {
    const client = window.customerSupabase;
    if (!client?.rpc) throw new Error("اتصال المبيعات غير متاح.");
    const all = [];
    const seen = new Set();
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE;
      const { data, error } = await client.rpc("sales_reports_rows_r44r38r20r35").range(from, from + PAGE - 1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("استجابة غير صالحة من مصدر المبيعات.");
      for (const row of data) {
        const id = `${row.is_historical ? 'h' : 'c'}:${row.row_id}`;
        if (!row.row_id || seen.has(id)) throw new Error("تكرار أو نقص معرفات المبيعات أثناء التحميل.");
        seen.add(id);
        all.push(row);
      }
      if (data.length < PAGE) return all;
    }
    throw new Error("لم تكتمل صفحات المبيعات؛ تم منع عرض إجماليات ناقصة.");
  }

  function calculate(customers, sales) {
    const ids = new Set();
    for (const customer of customers) {
      if (!customer?.id || ids.has(customer.id)) throw new Error("معرف عميل ناقص أو مكرر.");
      ids.add(customer.id);
    }
    const byCustomer = new Map();
    const customerNames = new Map(customers.map(x => [x.id, String(x.name || x.customer_name || x.customerName || "").trim()]));
    let excludedTotal = 0;
    let customerTotalCents = 0;
    let unknownCustomerRows = 0;
    let withoutCustomerRows = 0;
    for (const row of sales) {
      const cents = Math.round(Number(row.amount_incl_tax || 0) * 100);
      if (!Number.isFinite(cents)) throw new Error("مبلغ مبيعات غير صالح.");
      const customer = row.customer_id;
      if (!customer || row.record_type === "cash_aggregate") {
        excludedTotal += cents;
        withoutCustomerRows++;
        continue;
      }
      if (!ids.has(customer)) {
        unknownCustomerRows++;
        continue;
      }
      customerTotalCents += cents;
      if (!byCustomer.has(customer)) byCustomer.set(customer, { invoices: new Set(), cents: 0, last: "", first: "" });
      const item = byCustomer.get(customer);
      item.cents += cents;
      const date = String(row.invoice_date || "").slice(0, 10);
      if (date > item.last) item.last = date;
      if (date && (!item.first || date < item.first)) item.first = date;
      const number = String(row.invoice_number || "").trim();
      if (row.is_historical) {
        if (row.record_type === "invoice_line" && number && !["نقدي", "كاش", "cash", "بدون فاتورة"].includes(number.toLowerCase())) {
          item.invoices.add(`h:${customer}:${date}:${number}`);
        }
      } else if (row.record_type === "invoice" && row.row_id) {
        item.invoices.add(`c:${row.row_id}`);
      }
    }
    // Never present a seemingly complete customer sales dashboard when identity coverage is incomplete.
    if (unknownCustomerRows) throw new Error(`${integer(unknownCustomerRows)} سجل مبيعات بعميل خارج نطاق بيانات العملاء؛ تم منع أرقام جزئية.`);
    const purchasing = [...byCustomer.values()].filter(x => x.invoices.size > 0);
    const repeat = purchasing.filter(x => x.invoices.size >= 2).length;
    const once = purchasing.filter(x => x.invoices.size === 1).length;
    const ranks = [...byCustomer.entries()]
      .filter(([,x]) => x.invoices.size > 0)
      .map(([id,x]) => ({ id, name: customerNames.get(id) || `عميل (${id.slice(0,8)})`,
        invoices: x.invoices.size, cents: x.cents, first: x.first, last: x.last }))
      .sort((a,b) => b.cents - a.cents || a.id.localeCompare(b.id));
    const frequencies = [
      { name: "مرة واحدة", count: purchasing.filter(x => x.invoices.size === 1).length },
      { name: "مرتان", count: purchasing.filter(x => x.invoices.size === 2).length },
      { name: "3 إلى 5", count: purchasing.filter(x => x.invoices.size >= 3 && x.invoices.size <= 5).length },
      { name: "6 إلى 10", count: purchasing.filter(x => x.invoices.size >= 6 && x.invoices.size <= 10).length },
      { name: "أكثر من 10", count: purchasing.filter(x => x.invoices.size > 10).length }
    ];
    if (frequencies.reduce((sum,x)=>sum+x.count,0) !== purchasing.length) throw new Error("عدم تطابق شرائح تكرار الشراء.");
    if (ranks.reduce((sum,x)=>sum+x.cents,0) !== customerTotalCents) throw new Error("عدم تطابق إجمالي ترتيب العملاء.");
    return { ranks, frequencies, customers: ids.size, buyers: purchasing.length, repeat, once,
      sales: customerTotalCents / 100, average: purchasing.length ? customerTotalCents / 100 / purchasing.length : 0,
      excluded: excludedTotal / 100, excludedRows: withoutCustomerRows,
      salesRows: sales.length, purchaseInvoices: purchasing.reduce((n,x) => n + x.invoices.size, 0) };
  }

  function metric(label, value, detail = "") {
    const article = document.createElement("article");
    const title = document.createElement("span"); title.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value;
    article.append(title, strong);
    if (detail) { const small = document.createElement("small"); small.textContent = detail; article.append(small); }
    return article;
  }

  function renderAnalysis(result) {
    const summary = $("a14FrequencyMetrics"), bands = $("a14PurchaseFrequency"), table = $("a14TopCustomers");
    summary.replaceChildren(
      metric("متوسط عدد الفواتير للعميل المشترِي", result.buyers ? (result.purchaseInvoices/result.buyers).toFixed(2) : "0.00"),
      metric("معدل المشترين المتكررين", result.buyers ? `${(result.repeat/result.buyers*100).toFixed(1)}%` : "0.0%"),
      metric("العملاء أصحاب 3 فواتير أو أكثر", integer(result.ranks.filter(x=>x.invoices>=3).length))
    );
    bands.replaceChildren();
    for (const band of result.frequencies) {
      const item=document.createElement("div"), label=document.createElement("span"), count=document.createElement("strong"), track=document.createElement("div"), fill=document.createElement("span");
      item.className="a14-frequency-item"; label.textContent=band.name; count.textContent=integer(band.count);
      track.className="a14-frequency-track";fill.style.width=`${result.buyers ? 100*band.count/result.buyers : 0}%`;
      track.append(fill); item.append(label,count,track);bands.append(item);
    }
    table.replaceChildren();
    for (const row of result.ranks.slice(0,10)) {
      const tr=document.createElement("tr");
      for (const value of [row.name,integer(row.invoices),`${fmt(row.cents/100)} SAR`,row.last || "—"]) {
        const td=document.createElement("td");td.textContent=value;tr.append(td);
      }
      table.append(tr);
    }
    if (!result.ranks.length) {
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="لا توجد مشتريات مرتبطة بعملاء في البيانات المتاحة.";tr.append(td);table.append(tr);
    }
    $("a14PurchaseStatus").textContent=`${integer(result.buyers)} عميل مشترٍ، ${integer(result.purchaseInvoices)} فاتورة مميزة. البيانات حسب صلاحيات الجلسة، ومن أول شراء موثق في المصادر المتاحة.`;
  }

  async function load() {
    if (busy) return;
    if (window.PermissionEngine?.canView?.("customerReports") !== true || window.PermissionEngine?.canView?.("salesReports") !== true) {
      const status = $("a14OverviewStatus");
      if (status) status.textContent = "لا توجد صلاحية معتمدة لعرض تقارير العملاء والمبيعات.";
      return;
    }
    busy = true; const run = ++version;
    const button = $("a14OverviewLoad"), status = $("a14OverviewStatus"), grid = $("a14OverviewMetrics"), note = $("a14OverviewNote");
    button.disabled = true;
    status.textContent = "جاري تحميل كل صفحات العملاء والمبيعات والتحقق من الربط...";
    grid.replaceChildren(); note.textContent = "";
    $("a14FrequencyMetrics").replaceChildren(); $("a14PurchaseFrequency").replaceChildren(); $("a14TopCustomers").replaceChildren();
    $("a14PurchaseStatus").textContent = "جاري التحقق من بيانات المشتريات...";
    try {
      if (navigator.onLine === false) throw new Error("التحقق من البيانات يحتاج اتصالًا بالإنترنت.");
      if (!window.CustomersService?.listCustomers) throw new Error("خدمة العملاء غير متاحة.");
      const [customers, sales] = await Promise.all([
        window.CustomersService.listCustomers({ force: true }), getSales()
      ]);
      if (!Array.isArray(customers)) throw new Error("استجابة غير صالحة من مصدر العملاء.");
      if (!sales.length) throw new Error("لم ترجع المبيعات أي بيانات. تحقق من صلاحية تقارير المبيعات؛ لن نعرض مؤشرات مضللة.");
      const result = calculate(customers, sales);
      if (run !== version) return;
      grid.append(
        metric("العملاء المتاحون", integer(result.customers), "حسب صلاحيات الجلسة"),
        metric("عملاء لديهم فواتير", integer(result.buyers)),
        metric("اشتروا أكثر من مرة", integer(result.repeat), "فاتورتان مميزتان أو أكثر"),
        metric("اشتروا مرة واحدة", integer(result.once)),
        metric("مبيعات العملاء المرتبطين", `${fmt(result.sales)} SAR`, "شامل الضريبة"),
        metric("متوسط المبيعات لكل عميل مشترٍ", `${fmt(result.average)} SAR`),
        metric("الفواتير المميزة المرتبطة", integer(result.purchaseInvoices)),
        metric("مبيعات غير منسوبة لعميل", `${fmt(result.excluded)} SAR`, `${integer(result.excludedRows)} سجلًا`)
      );
      renderAnalysis(result);
      note.textContent = `قراءة مكتملة: ${integer(result.salesRows)} صف مبيعات. التجميعات النقدية غير المرتبطة لا تُنشئ عملاء أو فواتير. تاريخ تسجيل العميل ليس تاريخ أول شراء.`;
      status.textContent = "اكتمل التحميل والمطابقة دون صفوف مكررة أو عملاء خارج النطاق.";
      window.A14CustomerOverviewLastResult = Object.freeze({ ...result });
    } catch (error) {
      console.error("A14 customer overview load failed", error);
      status.textContent = `تعذر اعتماد نظرة العملاء: ${error.message || error}`;
      grid.replaceChildren(); note.textContent = "لم تُعرض أرقام جزئية.";
      $("a14FrequencyMetrics").replaceChildren(); $("a14PurchaseFrequency").replaceChildren(); $("a14TopCustomers").replaceChildren();
      $("a14PurchaseStatus").textContent = "تم إيقاف التحليل لمنع عرض بيانات ناقصة.";
    } finally { busy = false; button.disabled = false; }
  }
  const initialize = () => $("a14OverviewLoad")?.addEventListener("click", load);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
