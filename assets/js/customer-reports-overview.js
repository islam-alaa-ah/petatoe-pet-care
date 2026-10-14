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
    const customerContacts = new Map(customers.map(x => [x.id, {phone: String(x.phone || x.mobile || "").trim(), region: String(x.address || x.neighborhoodName || x.neighborhood_name || "").trim() || "غير محدد"}]));
    let excludedTotal = 0;
    let customerTotalCents = 0;
    let unknownCustomerRows = 0;
    let withoutCustomerRows = 0;
    const monthly = new Map();
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
      if (!byCustomer.has(customer)) byCustomer.set(customer, { invoices: new Set(), invoiceDates: new Map(), cents: 0, last: "", first: "" });
      const item = byCustomer.get(customer);
      item.cents += cents;
      const date = String(row.invoice_date || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        const month = date.slice(0,7);
        if (!monthly.has(month)) monthly.set(month, { month, cents: 0, customers: new Set(), invoices: new Set() });
        const bucket = monthly.get(month);
        bucket.cents += cents;
        bucket.customers.add(customer);
      }
      if (date > item.last) item.last = date;
      if (date && (!item.first || date < item.first)) item.first = date;
      const number = String(row.invoice_number || "").trim();
      if (row.is_historical) {
        if (row.record_type === "invoice_line" && number && !["نقدي", "كاش", "cash", "بدون فاتورة"].includes(number.toLowerCase())) {
          const key = `h:${customer}:${date}:${number}`; item.invoices.add(key); item.invoiceDates.set(key, date); if (monthly.has(date.slice(0,7))) monthly.get(date.slice(0,7)).invoices.add(key);
        }
      } else if (row.record_type === "invoice" && row.row_id) {
        const key = `c:${row.row_id}`; item.invoices.add(key); item.invoiceDates.set(key, date); if (monthly.has(date.slice(0,7))) monthly.get(date.slice(0,7)).invoices.add(key);
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
        invoices: x.invoices.size, cents: x.cents, phone: customerContacts.get(id)?.phone || "", first: x.first, last: x.last, invoiceDates: [...x.invoiceDates.values()] }))
      .sort((a,b) => b.cents - a.cents || a.id.localeCompare(b.id));
    const frequencies = [
      { name: "مرة واحدة", count: purchasing.filter(x => x.invoices.size === 1).length },
      { name: "مرتان", count: purchasing.filter(x => x.invoices.size === 2).length },
      { name: "3 إلى 5", count: purchasing.filter(x => x.invoices.size >= 3 && x.invoices.size <= 5).length },
      { name: "6 إلى 10", count: purchasing.filter(x => x.invoices.size >= 6 && x.invoices.size <= 10).length },
      { name: "أكثر من 10", count: purchasing.filter(x => x.invoices.size > 10).length }
    ];
    if (frequencies.reduce((sum,x)=>sum+x.count,0) !== purchasing.length) throw new Error("عدم تطابق شرائح تكرار المبيعات.");
    if (ranks.reduce((sum,x)=>sum+x.cents,0) !== customerTotalCents) throw new Error("عدم تطابق إجمالي ترتيب العملاء.");
    return { ranks, frequencies, customerContacts, customers: ids.size, buyers: purchasing.length, repeat, once,
      sales: customerTotalCents / 100, average: purchasing.length ? customerTotalCents / 100 / purchasing.length : 0,
      excluded: excludedTotal / 100, excludedRows: withoutCustomerRows,
      salesRows: sales.length, purchaseInvoices: purchasing.reduce((n,x) => n + x.invoices.size, 0), monthly };
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
      metric("نسبة العملاء متكرري التعامل", result.buyers ? `${(result.repeat/result.buyers*100).toFixed(1)}%` : "0.0%"),
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
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="لا توجد مبيعات مرتبطة بعملاء في البيانات المتاحة.";tr.append(td);table.append(tr);
    }
    $("a14PurchaseStatus").textContent=`${integer(result.buyers)} عميل له مبيعات، ${integer(result.purchaseInvoices)} فاتورة مميزة. البيانات حسب صلاحيات الجلسة، ومن أول بيع موثق في المصادر المتاحة.`;
  }


  // A14.3D — purchase activity as-of latest known sale date, not current device date.
  function renderActivity(result) {
    const activityIds = ["a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers"];
    for (const id of activityIds) $(id).replaceChildren();
    const dated = result.ranks.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.last));
    if (!dated.length) {
      $("a14ActivityStatus").textContent = "لا توجد تواريخ بيع موثقة صالحة لتحليل النشاط.";
      $("a14ActivityReference").textContent = "";
      $("a14RetentionDescription").textContent = "";
      return;
    }
    const reference = dated.reduce((max,r) => r.last > max ? r.last : max, "");
    const day = value => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
    const referenceDay = day(reference);
    const counts = [0,0,0,0];
    const ranked = dated.map(r => ({ ...r, gap: referenceDay - day(r.last) }));
    if (ranked.some(r => !Number.isFinite(r.gap) || r.gap < 0)) throw new Error("تاريخ بيع غير صالح في نشاط العملاء.");
    for (const r of ranked) counts[r.gap <= 30 ? 0 : r.gap <= 60 ? 1 : r.gap <= 90 ? 2 : 3]++;
    if (counts.reduce((a,b)=>a+b,0) !== dated.length) throw new Error("عدم تطابق شرائح نشاط المبيعات.");
    const undated = result.buyers - dated.length;
    $("a14ActivityMetrics").append(
      metric("آخر تاريخ بيع موثق", reference),
      metric("نشط في المبيعات خلال 30 يومًا", integer(counts[0])),
      metric("منقطع أكثر من 90 يومًا", integer(counts[3])),
      metric("عملاء بلا فواتير مسجلة", integer(result.customers-result.buyers))
    );
    $("a14ActivityReference").textContent = `تاريخ القياس: ${reference}. التوزيع يشمل ${integer(dated.length)} عميلًا لديهم فاتورة بتاريخ صالح؛ ${integer(undated)} بدون تاريخ صالح.`;
    const names = ["0–30 يومًا", "31–60 يومًا", "61–90 يومًا", "أكثر من 90 يومًا"];
    names.forEach((name,i) => {
      const row=document.createElement("div"), label=document.createElement("span"), count=document.createElement("strong"), track=document.createElement("div"), fill=document.createElement("span");
      row.className="a14-frequency-item";label.textContent=name;count.textContent=integer(counts[i]);track.className="a14-frequency-track";
      fill.style.width=`${dated.length?100*counts[i]/dated.length:0}%`;track.append(fill);row.append(label,count,track);$("a14ActivityBands").append(row);
    });
    // Two adjacent calendar months ending at the latest observed purchase month.
    const month = reference.slice(0,7);
    const [year,m] = month.split("-").map(Number);
    const prevDate = new Date(Date.UTC(year,m-2,1));
    const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth()+1).padStart(2,"0")}`;
    const previous = new Set(), current = new Set();
    for (const r of result.ranks) for (const date of r.invoiceDates) {
      if (date.slice(0,7) === prev) previous.add(r.id);
      if (date.slice(0,7) === month) current.add(r.id);
    }
    const returning = [...previous].filter(id=>current.has(id)).length;
    const rate = previous.size ? returning/previous.size*100 : null;
    $("a14RetentionDescription").textContent = `الشهر السابق ${prev} ← الشهر المرجعي ${month}. الاحتفاظ = عملاء الشهر السابق الذين سُجلت لهم مبيعات في الشهر المرجعي ÷ عملاء الشهر السابق. ليس معدل الاحتفاظ منذ أول بيع.`;
    $("a14RetentionMetrics").append(
      metric(`مشترون في ${prev}`,integer(previous.size)),
      metric(`مشترون في ${month}`,integer(current.size)),
      metric("استمر التعامل معهم في الشهرين",integer(returning)),
      metric("معدل الاحتفاظ الشهري",rate===null?"غير متاح":`${rate.toFixed(1)}%`)
    );
    ranked.filter(r=>r.gap>90).sort((a,b)=>b.gap-a.gap || a.id.localeCompare(b.id)).slice(0,10).forEach(r=>{
      const tr=document.createElement("tr");
      for (const v of [r.name,integer(r.invoices),r.last,integer(r.gap),`${fmt(r.cents/100)} SAR`]) { const td=document.createElement("td");td.textContent=v;tr.append(td); }
      const actions=document.createElement("td");actions.className="a14-contact-actions";
      const whatsapp=document.createElement("button");whatsapp.type="button";whatsapp.className="a14-contact-action a14-whatsapp";whatsapp.textContent="واتساب";
      const digits=String(r.phone || "").replace(/\D/g,"");
      let number=digits.startsWith("00966")?digits.slice(5):digits.startsWith("966")?digits.slice(3):digits;
      if (number.startsWith("0")) number=number.slice(1);
      if (/^5\d{8}$/.test(number)) number=`966${number}`; else number="";
      whatsapp.disabled=!number;
      whatsapp.title=number?"فتح محادثة واتساب دون تسجيل متابعة تلقائيًا":"لا يوجد رقم جوال سعودي صالح";
      whatsapp.addEventListener("click",()=>{if(number)window.open(`https://wa.me/${number}`,"_blank","noopener,noreferrer");});
      const contacted=document.createElement("button");contacted.type="button";contacted.className="a14-contact-action";contacted.textContent="تم التواصل";
      contacted.dataset.dailySuggestedContacted=r.id;
      contacted.title="فتح نموذج المتابعة الرسمي؛ لا يُسجل التواصل إلا بعد الحفظ";
      actions.append(whatsapp,contacted);tr.append(actions);
      $("a14DormantCustomers").append(tr);
    });
    if (!$("a14DormantCustomers").children.length) {
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="لا يوجد عملاء منقطعون أكثر من 90 يومًا حسب تاريخ القياس.";tr.append(td);$("a14DormantCustomers").append(tr);
    }
    $("a14ActivityStatus").textContent=`اكتمل تحليل النشاط وفق تاريخ مرجعي ${reference}، بدون تعديل أو إنشاء بيانات.`;
  }

  function renderGeography(result) {
    const metrics=$("a14GeoMetrics"), table=$("a14GeoRows");metrics.replaceChildren();table.replaceChildren();
    const regions=new Map();
    for (const [id,contact] of result.customerContacts) {
      const region=contact.region;
      if (!regions.has(region))regions.set(region,{name:region,customers:0,buyers:0,cents:0});
      regions.get(region).customers++;
    }
    for (const r of result.ranks) {
      const region=result.customerContacts.get(r.id)?.region || "غير محدد";
      const entry=regions.get(region);
      if (!entry)throw new Error("نطاق جغرافي غير متسق مع قائمة العملاء.");
      entry.buyers++;entry.cents+=r.cents;
    }
    const rows=[...regions.values()].sort((a,b)=>b.cents-a.cents || a.name.localeCompare(b.name,"ar"));
    if(rows.reduce((n,r)=>n+r.customers,0)!==result.customers || rows.reduce((n,r)=>n+r.cents,0)!==Math.round(result.sales*100))throw new Error("عدم تطابق إجماليات التقرير الجغرافي.");
    const unspecified=regions.get("غير محدد")?.customers||0;
    metrics.append(metric("مناطق مسجلة",integer(rows.filter(r=>r.name!=="غير محدد").length)),metric("عملاء دون منطقة محددة",integer(unspecified)),metric("المبيعات المرتبطة بالمناطق",`${fmt(result.sales)} SAR`));
    for (const r of rows) {const tr=document.createElement("tr");for(const v of [r.name,integer(r.customers),integer(r.buyers),`${fmt(r.cents/100)} SAR`]){const td=document.createElement("td");td.textContent=v;tr.append(td);}table.append(tr);}
    $("a14GeoStatus").textContent="التحليل بحسب عنوان العميل المسجل؛ المناطق غير المحددة معروضة منفصلة. لا يتم توزيع المبيعات غير المنسوبة لعميل.";
  }


  // A14.3F — recorded first purchase (within accessible dataset), not registration/acquisition.
  function renderTrends(result) {
    const monthlyTable = $("a14TrendMonthlyRows"), annualTable = $("a14TrendAnnualRows"), metrics = $("a14TrendMetrics");
    monthlyTable.replaceChildren(); annualTable.replaceChildren(); metrics.replaceChildren();
    const firstMonthByCustomer = new Map();
    for (const customer of result.ranks) {
      const firstInvoiceDate = customer.invoiceDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0];
      if (firstInvoiceDate) firstMonthByCustomer.set(customer.id, firstInvoiceDate.slice(0,7));
    }
    const rows = [...result.monthly.values()].sort((a,b) => a.month.localeCompare(b.month));
    const years = new Map();
    let previousBuyers = null;
    let previousMonth = null;
    let sumCents = 0, firstRecordedTotal = 0;
    for (const bucket of rows) {
      const initial = [...bucket.customers].filter(id => firstMonthByCustomer.get(id) === bucket.month).length;
      firstRecordedTotal += initial;
      sumCents += bucket.cents;
      const previousCalendarMonth = new Date(Date.UTC(Number(bucket.month.slice(0,4)), Number(bucket.month.slice(5,7)) - 2, 1));
      const previousCalendarKey = `${previousCalendarMonth.getUTCFullYear()}-${String(previousCalendarMonth.getUTCMonth()+1).padStart(2,"0")}`;
      const returning = previousMonth !== previousCalendarKey ? null : [...bucket.customers].filter(id => previousBuyers.has(id)).length;
      const year = bucket.month.slice(0,4);
      if (!years.has(year)) years.set(year, {year, cents:0, customers:new Set(), invoices:new Set(), first:0});
      const y=years.get(year); y.cents+=bucket.cents; y.first+=initial;
      for(const id of bucket.customers) y.customers.add(id);
      for(const key of bucket.invoices) y.invoices.add(key);
      const tr=document.createElement("tr");
      for(const value of [bucket.month,integer(bucket.customers.size),integer(bucket.invoices.size),integer(initial),returning===null?"—":integer(returning),`${fmt(bucket.cents/100)} SAR`]) {
        const td=document.createElement("td");td.textContent=value;tr.append(td);
      }
      monthlyTable.append(tr);
      previousBuyers = bucket.customers;
      previousMonth = bucket.month;
    }
    for (const y of years.values()) {
      const tr=document.createElement("tr");
      for(const value of [y.year,integer(y.customers.size),integer(y.invoices.size),integer(y.first),`${fmt(y.cents/100)} SAR`]) {
        const td=document.createElement("td");td.textContent=value;tr.append(td);
      }
      annualTable.append(tr);
    }
    if (sumCents !== Math.round(result.sales*100)) {
      throw new Error("المبيعات المرتبطة تحتوي على تواريخ غير صالحة أو غير مكتملة؛ توقّف التحليل الزمني.");
    }
    if (firstRecordedTotal !== firstMonthByCustomer.size || firstMonthByCustomer.size !== result.buyers) {
      throw new Error("فشل التحقق من أول بيع موثق للعملاء.");
    }
    metrics.append(
      metric("الشهور التي سُجلت فيها مبيعات",integer(rows.length)),
      metric("سنوات المبيعات المتاحة",integer(years.size)),
      metric("عملاء حسب أول بيع موثق",integer(firstRecordedTotal)),
      metric("إجمالي المبيعات المرتبطة",`${fmt(sumCents/100)} SAR`)
    );
    $("a14TrendStatus").textContent=`تمت المطابقة عبر ${integer(rows.length)} شهرًا. «أول بيع» يعني أول فاتورة مرقمة في البيانات المتاحة فقط، وليس تاريخ اكتساب العميل. العملاء الفريدون سنويًا لا يُجمعون بين السنوات.`;
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
    $("a14PurchaseStatus").textContent = "جاري التحقق من بيانات المبيعات...";
    for (const id of ["a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers"]) $(id).replaceChildren();
    $("a14ActivityReference").textContent = ""; $("a14RetentionDescription").textContent = "";
    $("a14ActivityStatus").textContent = "جاري تحليل تواريخ الفواتير...";
    $("a14GeoMetrics").replaceChildren();$("a14GeoRows").replaceChildren();$("a14GeoStatus").textContent="جاري تحليل التوزيع الجغرافي...";
    $("a14TrendMetrics").replaceChildren();$("a14TrendMonthlyRows").replaceChildren();$("a14TrendAnnualRows").replaceChildren();$("a14TrendStatus").textContent="جاري التحقق من الاتجاهات الزمنية...";
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
        metric("لديهم أكثر من فاتورة", integer(result.repeat), "فاتورتان مميزتان أو أكثر"),
        metric("لديهم فاتورة واحدة", integer(result.once)),
        metric("مبيعات العملاء المرتبطين", `${fmt(result.sales)} SAR`, "شامل الضريبة"),
        metric("متوسط المبيعات لكل عميل له مبيعات", `${fmt(result.average)} SAR`),
        metric("الفواتير المميزة المرتبطة", integer(result.purchaseInvoices)),
        metric("مبيعات غير منسوبة لعميل", `${fmt(result.excluded)} SAR`, `${integer(result.excludedRows)} سجلًا`)
      );
      renderAnalysis(result);
      renderActivity(result);
      renderGeography(result);
      renderTrends(result);
      note.textContent = `قراءة مكتملة: ${integer(result.salesRows)} صف مبيعات. التجميعات النقدية غير المرتبطة لا تُنشئ عملاء أو فواتير. تاريخ تسجيل العميل ليس تاريخ أول بيع.`;
      status.textContent = "اكتمل التحميل والمطابقة دون صفوف مكررة أو عملاء خارج النطاق.";
      window.A14CustomerOverviewLastResult = Object.freeze({ ...result });
    } catch (error) {
      console.error("A14 customer overview load failed", error);
      status.textContent = `تعذر اعتماد نظرة العملاء: ${error.message || error}`;
      grid.replaceChildren(); note.textContent = "لم تُعرض أرقام جزئية.";
      $("a14FrequencyMetrics").replaceChildren(); $("a14PurchaseFrequency").replaceChildren(); $("a14TopCustomers").replaceChildren();
      $("a14PurchaseStatus").textContent = "تم إيقاف التحليل لمنع عرض بيانات ناقصة.";
      for (const id of ["a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers"]) $(id).replaceChildren();
      $("a14ActivityReference").textContent = ""; $("a14RetentionDescription").textContent = "";
      $("a14ActivityStatus").textContent = "تم إيقاف تحليل النشاط لمنع عرض بيانات ناقصة.";
      $("a14GeoMetrics").replaceChildren();$("a14GeoRows").replaceChildren();$("a14GeoStatus").textContent="تم إيقاف التحليل الجغرافي لمنع عرض بيانات ناقصة.";
      $("a14TrendMetrics").replaceChildren();$("a14TrendMonthlyRows").replaceChildren();$("a14TrendAnnualRows").replaceChildren();$("a14TrendStatus").textContent="تم إيقاف المقارنات الزمنية لمنع عرض بيانات ناقصة.";
    } finally { busy = false; button.disabled = false; }
  }
  const initialize = () => $("a14OverviewLoad")?.addEventListener("click", load);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
