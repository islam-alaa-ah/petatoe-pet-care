// A14.3B — customer purchase overview, read-only; no permission or finance changes.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const t = key => window.PetatoeLocalization?.t?.(key) || key;
  // Canonical grouping sentinel: never localize keys used for aggregation.
  const UNSPECIFIED_REGION = "__A14_UNSPECIFIED_REGION__";
  const isUnspecifiedRegion = value => !String(value || "").trim() || value === UNSPECIFIED_REGION || value === "غير محدد" || value === "Unspecified";
  const regionKey = value => isUnspecifiedRegion(value) ? UNSPECIFIED_REGION : String(value).trim();
  const regionDisplay = key => key === UNSPECIFIED_REGION ? t("customerReports.overviewDynamic.k006") : key;
  const PAGE = 500;
  const MAX_PAGES = 100;
  const fmt = amount => Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const integer = amount => Number(amount || 0).toLocaleString("en-US");
  let busy = false;
  let version = 0;
  let verifiedSnapshot = null;
  let filteredResult = null;
  let detailVisible = 10;
  const selected = id => $(id)?.value || "";
  const isValidDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

  function setOptions(select, items, allLabel) {
    select.replaceChildren(new Option(allLabel, ""));
    for (const [value, label] of items) select.add(new Option(label, value));
  }
  // Presentation-only neighborhood translation. Never use the translated name as a grouping/filter key.
  function geographyCatalog(customers, sales) {
    const byId = new Map();
    for (const row of sales) {
      const id = String(row.neighborhood_id || "").trim();
      if (!id) continue;
      const ar = String(row.neighborhood_name_ar || "").trim();
      const en = String(row.neighborhood_name_en || "").trim();
      const prior = byId.get(id) || {id, name:"", en:""};
      byId.set(id, {id, name:prior.name || ar, en:prior.en || en});
    }
    for (const customer of customers) {
      const id = String(customer.neighborhoodId || customer.neighborhood_id || "").trim();
      if (!id) continue;
      const prior = byId.get(id) || {id, name:"", en:""};
      byId.set(id, {
        id,
        name:prior.name || String(customer.neighborhood_name_ar || customer.neighborhoodName || "").trim(),
        en:prior.en || String(customer.neighborhood_name_en || customer.neighborhoodNameEn || "").trim()
      });
    }
    const catalog = [...byId.values()].filter(item=>item.name);
    window.PetatoeLocalization?.registerEntityCatalog?.({neighborhoods:catalog});
    return byId;
  }
  function localizedNeighborhood(item) {
    const isEnglish = (window.PetatoeLocalization?.effectiveLanguage?.() || window.PetatoeLocalization?.getLanguage?.()) === "en";
    if (!item) return t("customerReports.overviewDynamic.k006");
    const localized = window.PetatoeLocalization?.entityText?.("neighborhood", item);
    if (isEnglish && (!localized || /[\u0600-\u06ff]/.test(localized))) return item.en || "Translation pending";
    return localized || (isEnglish ? item.en || "Translation pending" : item.name);
  }
  function refreshFilterOptions(customers, sales) {
    const years = [...new Set(sales.map(x => String(x.invoice_date || "").slice(0,4)).filter(x => /^\d{4}$/.test(x)))].sort();
    const months = [...new Set(sales.map(x => String(x.invoice_date || "").slice(5,7)).filter(x => /^(0[1-9]|1[0-2])$/.test(x)))].sort();
    const names = customers.map(x => [x.id, String(x.name || x.customer_name || x.customerName || x.id).trim()]).sort((a,b) => a[1].localeCompare(b[1], "ar"));
    const areaNames = geographyCatalog(customers, sales);
    const areas = [...new Set(customers.map(c=>String(c.neighborhoodId || "").trim()).filter(Boolean))]
      .map(id=>[id, areaNames.has(id) ? localizedNeighborhood(areaNames.get(id)) : t("customerReports.overviewDynamic.unnamedArea",{code:id.slice(0,8)})])
      .sort((a,b)=>a[1].localeCompare(b[1], "ar"));
    const old = [selected("a14FilterYear"),selected("a14FilterMonth"),selected("a14FilterCustomer"),selected("a14FilterNeighborhood")];
    setOptions($("a14FilterYear"),years.map(x=>[x,x]),t("customerReports.overviewDynamic.k001"));
    setOptions($("a14FilterMonth"),months.map(x=>[x,x]),t("customerReports.overviewDynamic.k002"));
    setOptions($("a14FilterCustomer"),names,t("customerReports.overviewDynamic.k003"));
    setOptions($("a14FilterNeighborhood"),areas,t("customerReports.overviewDynamic.k004"));
    ["a14FilterYear","a14FilterMonth","a14FilterCustomer","a14FilterNeighborhood"].forEach((id,i)=> {if ([...$(id).options].some(o=>o.value===old[i])) $(id).value=old[i];});
  }
  function currentScope() {
    if (!verifiedSnapshot) throw new Error(t("customerReports.overviewDynamic.refreshFirst"));
    const year=selected("a14FilterYear"),month=selected("a14FilterMonth"),customerId=selected("a14FilterCustomer"),neighborhoodId=selected("a14FilterNeighborhood");
    const customers = verifiedSnapshot.customers.filter(c =>
      (!customerId || c.id === customerId) && (!neighborhoodId || c.neighborhoodId === neighborhoodId));
    const allowedIds = new Set(customers.map(c=>c.id));
    const sales = verifiedSnapshot.sales.filter(row => {
      const d=String(row.invoice_date || "").slice(0,10);
      return (!year || d.slice(0,4)===year) && (!month || d.slice(5,7)===month)
        && (!customerId || row.customer_id===customerId)
        && (!neighborhoodId || (row.customer_id && allowedIds.has(row.customer_id)));
    });
    return {customers,sales,year,month,customerId,neighborhoodId};
  }
  function clearRendered() {
    for(const id of ["a14OverviewMetrics","a14FrequencyMetrics","a14PurchaseFrequency","a14TopCustomers", "a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers","a14GeoMetrics","a14GeoRows","a14TrendMetrics","a14TrendMonthlyRows","a14TrendAnnualRows","a14DetailRows"]) $(id)?.replaceChildren();
    for(const id of ["a14PurchaseStatus","a14ActivityStatus","a14GeoStatus","a14TrendStatus","a14ActivityReference","a14RetentionDescription","a14DetailStatus"]) if($(id)) $(id).textContent="";
    filteredResult=null;
    detailVisible=10;
    $("a14DetailMore").disabled=true;
    $("a14ExportCsv").disabled = true;
    $("a14PrintReport").disabled = true;
  }
  function renderScope() {
    const scope = currentScope();
    clearRendered();
    try {
      const result = calculate(scope.customers, scope.sales);
      const grid=$("a14OverviewMetrics"),note=$("a14OverviewNote"),status=$("a14OverviewStatus");
      grid.append(
        metric(t("customerReports.overviewDynamic.k007"), integer(result.customers), t("customerReports.overviewDynamic.k008")),
        metric(t("customerReports.overviewDynamic.k009"), integer(result.buyers)),
        metric(t("customerReports.overviewDynamic.k010"), integer(result.repeat), t("customerReports.overviewDynamic.k011")),
        metric(t("customerReports.overviewDynamic.k012"), integer(result.once)),
        metric(t("customerReports.overviewDynamic.k013"), `${fmt(result.sales)} SAR`, t("customerReports.overviewDynamic.k014")),
        metric(t("customerReports.overviewDynamic.k015"), `${fmt(result.average)} SAR`),
        metric(t("customerReports.overviewDynamic.k016"), integer(result.purchaseInvoices)),
        metric(t("customerReports.overviewDynamic.k017"), `${fmt(result.excluded)} SAR`, t("customerReports.overviewDynamic.extraExcludedRows",{count:integer(result.excludedRows)})),
        metric(t("customerReports.overviewDynamic.k018"), `${fmt(result.allSales)} SAR`, t("customerReports.overviewDynamic.k019"))
      );
      renderAnalysis(result);
      renderActivity(result);
      renderGeography(result);
      // Empty date-range has no comparable months; renderTrends can handle zero safely.
      renderTrends(result);
      detailVisible=10;
      renderCustomerDetails(result);
      const label = `${scope.year || t("customerReports.overviewDynamic.k001")} / ${scope.month || t("customerReports.overviewDynamic.k002")} / ${scope.customerId ? t("customerReports.overviewDynamic.chosenCustomer") : t("customerReports.overviewDynamic.k003")} / ${scope.neighborhoodId ? t("customerReports.overviewDynamic.chosenNeighborhood") : t("customerReports.overviewDynamic.k004")}`;
      note.textContent = t("customerReports.overviewDynamic.scopeNote", {
        scope: label,
        qualifier: t(scope.customerId || scope.neighborhoodId
          ? "customerReports.overviewDynamic.filteredScope" : "customerReports.overviewDynamic.fullScope"),
        count: integer(result.salesRows)
      });
      status.textContent = t("customerReports.overviewDynamic.k020");
      filteredResult = result;
      $("a14ExportCsv").disabled = false;
      $("a14PrintReport").disabled = false;
      window.A14CustomerOverviewLastResult = Object.freeze({ ...result });
    } catch(err) {
      clearRendered();
      $("a14OverviewStatus").textContent=t("customerReports.overviewDynamic.scopeError",{error:err.message || err});
      $("a14OverviewNote").textContent=t("customerReports.overviewDynamic.k021");
      console.error("A14 scoped report error",err);
    }
  }
  function csvCell(value) {
    const text=String(value ?? "");
    const neutral=/^[\s]*[=+@\-]/.test(text) ? "'"+text : text;
    return '"'+neutral.replace(/"/g,'""')+'"';
  }
  function exportCsv() {
    if (!filteredResult || !verifiedSnapshot || !window.PermissionEngine?.canView?.("customerReports") || !window.PermissionEngine?.canView?.("salesReports")) return;
    const sections=[
      [t("customerReports.overviewDynamic.k022"), "a14TopCustomers"],
      [t("customerReports.overviewDynamic.k023"), "a14DormantCustomers"],
      [t("customerReports.overviewDynamic.k024"), "a14GeoRows"],
      [t("customerReports.overviewDynamic.k025"), "a14TrendMonthlyRows"],
      [t("customerReports.overviewDynamic.k026"), "a14TrendAnnualRows"],
    ];
    const lines=[];
    for(const [name,id] of sections) {
      const tbody=$(id); const table=tbody?.closest("table"); if (!table) continue;
      lines.push([name].map(csvCell).join(","));
      lines.push([...table.querySelectorAll("thead th")].map(th=>csvCell(th.textContent)).join(","));
      for (const tr of tbody.querySelectorAll("tr")) {
        const cells=[...tr.children].map(td=> td.classList.contains("a14-contact-actions") ? "" : td.textContent);
        lines.push(cells.map(csvCell).join(","));
      }
      lines.push("");
    }
    // Export the entire permission-scoped, filtered result — never the 10-row UI slice.
    // A rank is one customer; invoice counts and amounts are already reconciled by calculate().
    lines.push(csvCell(t("customerReports.overviewDynamic.k027")));
    lines.push([t("customerReports.overviewDynamic.k028"), t("customerReports.overviewDynamic.k029"), t("customerReports.overviewDynamic.k030"), t("customerReports.overviewDynamic.k031"), t("customerReports.overviewDynamic.k032")].map(csvCell).join(","));
    for (const row of filteredResult.ranks) {
      lines.push([row.name, integer(row.invoices), row.first || "—", row.last || "—", `${fmt(row.cents / 100)} SAR`].map(csvCell).join(","));
    }
    lines.push("");
    const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;
    anchor.download="A14_customer_reports_filtered.csv";document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function printReport() {
    if (!filteredResult || !window.PermissionEngine?.canView?.("customerReports") || !window.PermissionEngine?.canView?.("salesReports")) return;
    window.print();
  }


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
    const customerContacts = new Map(customers.map(x => [x.id, {phone: String(x.phone || x.mobile || "").trim(), region: regionKey(x.address || x.neighborhoodName || x.neighborhood_name), neighborhoodId: String(x.neighborhoodId || x.neighborhood_id || "").trim()}]));
    let excludedTotal = 0;
    let customerTotalCents = 0;
    let unknownCustomerRows = 0;
    let withoutCustomerRows = 0;
    let allTotalCents = 0;
    const monthly = new Map();
    const hasValidDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
    for (const row of sales) {
      const rawAmount = Number(row.amount_incl_tax);
      if (!Number.isFinite(rawAmount)) throw new Error("مبلغ مبيعات غير صالح.");
      const cents = Math.round(rawAmount * 100);
      if (!Number.isSafeInteger(cents)) throw new Error("قيمة مبيعات خارج حدود الحساب الآمن.");
      const date = String(row.invoice_date || "").slice(0, 10);
      if (!hasValidDate(date)) throw new Error("تاريخ مبيعات غير صالح؛ تم منع عرض إجمالي شهري ناقص.");
      const month = date.slice(0,7);
      if (!monthly.has(month)) monthly.set(month, {month, cents:0, excludedCents:0, totalCents:0, customers:new Set(), invoices:new Set()});
      const bucket = monthly.get(month);
      bucket.totalCents += cents;
      allTotalCents += cents;
      const customer = row.customer_id;
      if (!customer || row.record_type === "cash_aggregate") {
        excludedTotal += cents;
        bucket.excludedCents += cents;
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
      bucket.cents += cents;
      bucket.customers.add(customer);
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
    if (allTotalCents !== customerTotalCents + excludedTotal) throw new Error("فشل مطابقة إجمالي المبيعات مع المبيعات المرتبطة وغير المنسوبة.");
    for (const bucket of monthly.values()) {
      if (bucket.totalCents !== bucket.cents + bucket.excludedCents) throw new Error(`فرق تسوية في شهر ${bucket.month}.`);
    }
    const purchasing = [...byCustomer.values()].filter(x => x.invoices.size > 0);
    const repeat = purchasing.filter(x => x.invoices.size >= 2).length;
    const once = purchasing.filter(x => x.invoices.size === 1).length;
    const ranks = [...byCustomer.entries()]
      .filter(([,x]) => x.invoices.size > 0)
      .map(([id,x]) => ({ id, name: customerNames.get(id) || t("customerReports.overviewDynamic.unnamedCustomer",{code:id.slice(0,8)}),
        invoices: x.invoices.size, cents: x.cents, phone: customerContacts.get(id)?.phone || "", first: x.first, last: x.last, invoiceDates: [...x.invoiceDates.values()] }))
      .sort((a,b) => b.cents - a.cents || a.id.localeCompare(b.id));
    const frequencies = [
      { name: t("customerReports.overviewDynamic.k033"), count: purchasing.filter(x => x.invoices.size === 1).length },
      { name: t("customerReports.overviewDynamic.k034"), count: purchasing.filter(x => x.invoices.size === 2).length },
      { name: t("customerReports.overviewDynamic.k035"), count: purchasing.filter(x => x.invoices.size >= 3 && x.invoices.size <= 5).length },
      { name: t("customerReports.overviewDynamic.k036"), count: purchasing.filter(x => x.invoices.size >= 6 && x.invoices.size <= 10).length },
      { name: t("customerReports.overviewDynamic.k037"), count: purchasing.filter(x => x.invoices.size > 10).length }
    ];
    if (frequencies.reduce((sum,x)=>sum+x.count,0) !== purchasing.length) throw new Error("عدم تطابق شرائح تكرار المبيعات.");
    if (ranks.reduce((sum,x)=>sum+x.cents,0) !== customerTotalCents) throw new Error("عدم تطابق إجمالي ترتيب العملاء.");
    return { ranks, frequencies, customerContacts, customers: ids.size, buyers: purchasing.length, repeat, once,
      sales: customerTotalCents / 100, allSales: allTotalCents / 100, average: purchasing.length ? customerTotalCents / 100 / purchasing.length : 0,
      excluded: excludedTotal / 100, excludedRows: withoutCustomerRows,
      salesRows: sales.length, purchaseInvoices: purchasing.reduce((n,x) => n + x.invoices.size, 0), monthly };
  }

  function renderCustomerDetails(result) {
    const tbody=$("a14DetailRows"),more=$("a14DetailMore"),status=$("a14DetailStatus");
    tbody.replaceChildren();
    for(const row of result.ranks.slice(0,detailVisible)) {
      const tr=document.createElement("tr");
      for(const cell of [row.name,integer(row.invoices),row.first||"—",row.last||"—",`${fmt(row.cents/100)} SAR`]) {
        const td=document.createElement("td");td.textContent=cell;tr.append(td);
      }
      tbody.append(tr);
    }
    if(!result.ranks.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.textContent=t("customerReports.overviewDynamic.k038");tr.append(td);tbody.append(tr);}
    more.disabled=detailVisible>=result.ranks.length;
    status.textContent=t("customerReports.overviewDynamic.detailCount",{shown:integer(Math.min(detailVisible,result.ranks.length)),total:integer(result.ranks.length)});
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
      metric(t("customerReports.overviewDynamic.k040"), result.buyers ? (result.purchaseInvoices/result.buyers).toFixed(2) : "0.00"),
      metric(t("customerReports.overviewDynamic.k041"), result.buyers ? `${(result.repeat/result.buyers*100).toFixed(1)}%` : "0.0%"),
      metric(t("customerReports.overviewDynamic.k042"), integer(result.ranks.filter(x=>x.invoices>=3).length))
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
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent=t("customerReports.overviewDynamic.k039");tr.append(td);table.append(tr);
    }
    $("a14PurchaseStatus").textContent=window.PetatoeLocalization.t("customerReports.overviewDynamic.purchaseStatus",{buyers:integer(result.buyers),invoices:integer(result.purchaseInvoices)});
  }


  // A14.3D — purchase activity as-of latest known sale date, not current device date.
  function renderActivity(result) {
    const activityIds = ["a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers"];
    for (const id of activityIds) $(id).replaceChildren();
    const dated = result.ranks.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.last));
    if (!dated.length) {
      $("a14ActivityStatus").textContent = t("customerReports.overviewDynamic.k043");
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
      metric(t("customerReports.overviewDynamic.k044"), reference),
      metric(t("customerReports.overviewDynamic.k045"), integer(counts[0])),
      metric(t("customerReports.overviewDynamic.k046"), integer(counts[3])),
      metric(t("customerReports.overviewDynamic.k047"), integer(result.customers-result.buyers))
    );
    $("a14ActivityReference").textContent = window.PetatoeLocalization.t("customerReports.overviewDynamic.activityReference",{reference,dated:integer(dated.length),undated:integer(undated)});
    const names = [t("customerReports.overviewDynamic.k048"), t("customerReports.overviewDynamic.k049"), t("customerReports.overviewDynamic.k050"), t("customerReports.overviewDynamic.k051")];
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
    $("a14RetentionDescription").textContent = window.PetatoeLocalization.t("customerReports.overviewDynamic.retentionNote",{prev,month});
    $("a14RetentionMetrics").append(
      metric(t("customerReports.overviewDynamic.customersInMonth",{month:prev}),integer(previous.size)),
      metric(t("customerReports.overviewDynamic.customersInMonth",{month}),integer(current.size)),
      metric(t("customerReports.overviewDynamic.k052"),integer(returning)),
      metric(t("customerReports.overviewDynamic.k053"),rate===null?t("customerReports.overviewDynamic.k054"):`${rate.toFixed(1)}%`)
    );
    ranked.filter(r=>r.gap>90).sort((a,b)=>b.gap-a.gap || a.id.localeCompare(b.id)).slice(0,10).forEach(r=>{
      const tr=document.createElement("tr");
      for (const v of [r.name,integer(r.invoices),r.last,integer(r.gap),`${fmt(r.cents/100)} SAR`]) { const td=document.createElement("td");td.textContent=v;tr.append(td); }
      const actions=document.createElement("td");actions.className="a14-contact-actions";
      const whatsapp=document.createElement("button");whatsapp.type="button";whatsapp.className="a14-contact-action a14-whatsapp";whatsapp.textContent=t("customerReports.overviewDynamic.k055");
      const digits=String(r.phone || "").replace(/\D/g,"");
      let number=digits.startsWith("00966")?digits.slice(5):digits.startsWith("966")?digits.slice(3):digits;
      if (number.startsWith("0")) number=number.slice(1);
      if (/^5\d{8}$/.test(number)) number=`966${number}`; else number="";
      whatsapp.disabled=!number;
      whatsapp.title=number?t("customerReports.overviewDynamic.k057"):t("customerReports.overviewDynamic.k058");
      whatsapp.addEventListener("click",()=>{if(number)window.open(`https://wa.me/${number}`,"_blank","noopener,noreferrer");});
      const contacted=document.createElement("button");contacted.type="button";contacted.className="a14-contact-action";contacted.textContent=t("customerReports.overviewDynamic.k056");
      contacted.dataset.dailySuggestedContacted=r.id;
      contacted.title=t("customerReports.overviewDynamic.k059");
      actions.append(whatsapp,contacted);tr.append(actions);
      $("a14DormantCustomers").append(tr);
    });
    if (!$("a14DormantCustomers").children.length) {
      const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent=t("customerReports.overviewDynamic.k060");tr.append(td);$("a14DormantCustomers").append(tr);
    }
    $("a14ActivityStatus").textContent=window.PetatoeLocalization.t("customerReports.overviewDynamic.activityComplete",{reference});
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
      const region=result.customerContacts.get(r.id)?.region || UNSPECIFIED_REGION;
      const entry=regions.get(region);
      if (!entry)throw new Error(t("customerReports.overviewDynamic.geoMismatch"));
      entry.buyers++;entry.cents+=r.cents;
    }
    const rows=[...regions.values()].sort((a,b)=>b.cents-a.cents || a.name.localeCompare(b.name,"ar"));
    if(rows.reduce((n,r)=>n+r.customers,0)!==result.customers || rows.reduce((n,r)=>n+r.cents,0)!==Math.round(result.sales*100))throw new Error(t("customerReports.overviewDynamic.geoTotalsMismatch"));
    const unspecified=regions.get(UNSPECIFIED_REGION)?.customers||0;
    metrics.append(metric(t("customerReports.overviewDynamic.k061"),integer(rows.filter(r=>r.name!==UNSPECIFIED_REGION).length)),metric(t("customerReports.overviewDynamic.k062"),integer(unspecified)),metric(t("customerReports.overviewDynamic.k063"),`${fmt(result.sales)} SAR`));
    const sourceCatalog = geographyCatalog(verifiedSnapshot?.customers || [], verifiedSnapshot?.sales || []);
    const byArabicName = new Map([...sourceCatalog.values()].filter(x=>x.name).map(x=>[x.name, x]));
    // Use neighborhood ID when a region represents a unique catalog entry.
    // Do not infer a neighborhood from arbitrary free-text address fields.
    const idsByRegion = new Map();
    for (const contact of result.customerContacts.values()) {
      const id = contact.neighborhoodId;
      if (!id || !sourceCatalog.has(id) || contact.region === UNSPECIFIED_REGION) continue;
      const item = sourceCatalog.get(id);
      if (contact.region !== item.name && contact.region !== item.en) continue;
      if (!idsByRegion.has(contact.region)) idsByRegion.set(contact.region, new Set());
      idsByRegion.get(contact.region).add(id);
    }
    for (const r of rows) {
      const tr=document.createElement("tr");
      const ids = idsByRegion.get(r.name);
      const exactMatch = ids?.size === 1 ? sourceCatalog.get([...ids][0]) : byArabicName.get(r.name);
      const translatedName = r.name === UNSPECIFIED_REGION ? regionDisplay(r.name)
        : exactMatch ? localizedNeighborhood(exactMatch) : r.name;
      for(const v of [translatedName,integer(r.customers),integer(r.buyers),`${fmt(r.cents/100)} SAR`]){const td=document.createElement("td");td.textContent=v;tr.append(td);}table.append(tr);
    }
    $("a14GeoStatus").textContent=t("customerReports.overviewDynamic.k064");
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
    let sumCents = 0, sumExcludedCents = 0, sumAllCents = 0, firstRecordedTotal = 0;
    for (const bucket of rows) {
      const initial = [...bucket.customers].filter(id => firstMonthByCustomer.get(id) === bucket.month).length;
      firstRecordedTotal += initial;
      sumCents += bucket.cents;
      sumExcludedCents += bucket.excludedCents;
      sumAllCents += bucket.totalCents;
      const previousCalendarMonth = new Date(Date.UTC(Number(bucket.month.slice(0,4)), Number(bucket.month.slice(5,7)) - 2, 1));
      const previousCalendarKey = `${previousCalendarMonth.getUTCFullYear()}-${String(previousCalendarMonth.getUTCMonth()+1).padStart(2,"0")}`;
      const returning = previousMonth !== previousCalendarKey ? null : [...bucket.customers].filter(id => previousBuyers.has(id)).length;
      const year = bucket.month.slice(0,4);
      if (!years.has(year)) years.set(year, {year, cents:0, excludedCents:0, totalCents:0, customers:new Set(), invoices:new Set(), first:0});
      const y=years.get(year); y.cents+=bucket.cents; y.excludedCents+=bucket.excludedCents; y.totalCents+=bucket.totalCents; y.first+=initial;
      for(const id of bucket.customers) y.customers.add(id);
      for(const key of bucket.invoices) y.invoices.add(key);
      const tr=document.createElement("tr");
      for(const value of [bucket.month,integer(bucket.customers.size),integer(bucket.invoices.size),integer(initial),returning===null?"—":integer(returning),`${fmt(bucket.cents/100)} SAR`,`${fmt(bucket.excludedCents/100)} SAR`,`${fmt(bucket.totalCents/100)} SAR`]) {
        const td=document.createElement("td");td.textContent=value;tr.append(td);
      }
      monthlyTable.append(tr);
      previousBuyers = bucket.customers;
      previousMonth = bucket.month;
    }
    for (const y of years.values()) {
      const tr=document.createElement("tr");
      for(const value of [y.year,integer(y.customers.size),integer(y.invoices.size),integer(y.first),`${fmt(y.cents/100)} SAR`,`${fmt(y.excludedCents/100)} SAR`,`${fmt(y.totalCents/100)} SAR`]) {
        const td=document.createElement("td");td.textContent=value;tr.append(td);
      }
      annualTable.append(tr);
    }
    if (sumAllCents !== sumCents + sumExcludedCents ||
        sumExcludedCents !== Math.round(result.excluded*100) ||
        sumAllCents !== Math.round(result.allSales*100)) {
      throw new Error("فشل مطابقة الإجمالي الشهري والسنوي مع جميع مبيعات المصدر.");
    }
    if ([...years.values()].some(y => y.totalCents !== y.cents + y.excludedCents)) throw new Error("فشل مطابقة سنة مالية.");
    if (sumCents !== Math.round(result.sales*100)) {
      throw new Error("المبيعات المرتبطة تحتوي على تواريخ غير صالحة أو غير مكتملة؛ توقّف التحليل الزمني.");
    }
    if (firstRecordedTotal !== firstMonthByCustomer.size || firstMonthByCustomer.size !== result.buyers) {
      throw new Error("فشل التحقق من أول بيع موثق للعملاء.");
    }
    metrics.append(
      metric(t("customerReports.overviewDynamic.k065"),integer(rows.length)),
      metric(t("customerReports.overviewDynamic.availableYears"),integer(years.size)),
      metric(t("customerReports.overviewDynamic.firstSaleCustomers"),integer(firstRecordedTotal)),
      metric(t("customerReports.overviewDynamic.k018"),`${fmt(sumAllCents/100)} SAR`,t("customerReports.overviewDynamic.allSalesDetail"))
    );
    $("a14TrendStatus").textContent=t("customerReports.overviewDynamic.temporalStatus",{months:integer(rows.length)});
  }

  async function load() {
    if (busy) return;
    if (window.PermissionEngine?.canView?.("customerReports") !== true || window.PermissionEngine?.canView?.("salesReports") !== true) {
      const status = $("a14OverviewStatus");
      if (status) status.textContent = t("customerReports.overviewDynamic.k066");
      return;
    }
    busy = true; const run = ++version;
    const button = $("a14OverviewLoad"), status = $("a14OverviewStatus"), grid = $("a14OverviewMetrics"), note = $("a14OverviewNote");
    button.disabled = true;
    status.textContent = t("customerReports.overviewDynamic.k067");
    verifiedSnapshot = null; clearRendered(); note.textContent = "";
    $("a14FrequencyMetrics").replaceChildren(); $("a14PurchaseFrequency").replaceChildren(); $("a14TopCustomers").replaceChildren();
    $("a14PurchaseStatus").textContent = t("customerReports.overviewDynamic.k068");
    for (const id of ["a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers"]) $(id).replaceChildren();
    $("a14ActivityReference").textContent = ""; $("a14RetentionDescription").textContent = "";
    $("a14ActivityStatus").textContent = t("customerReports.overviewDynamic.k069");
    $("a14GeoMetrics").replaceChildren();$("a14GeoRows").replaceChildren();$("a14GeoStatus").textContent=t("customerReports.overviewDynamic.k070");
    $("a14TrendMetrics").replaceChildren();$("a14TrendMonthlyRows").replaceChildren();$("a14TrendAnnualRows").replaceChildren();$("a14TrendStatus").textContent=t("customerReports.overviewDynamic.k071");
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
      verifiedSnapshot={customers,sales};
      refreshFilterOptions(customers,sales);
      renderScope();
    } catch (error) {
      console.error("A14 customer overview load failed", error);
      status.textContent = t("customerReports.overviewDynamic.loadError",{error:error.message || error});
      grid.replaceChildren(); note.textContent = t("customerReports.overviewDynamic.k021");
      $("a14FrequencyMetrics").replaceChildren(); $("a14PurchaseFrequency").replaceChildren(); $("a14TopCustomers").replaceChildren();
      $("a14PurchaseStatus").textContent = t("customerReports.overviewDynamic.k072");
      for (const id of ["a14ActivityMetrics","a14ActivityBands","a14RetentionMetrics","a14DormantCustomers"]) $(id).replaceChildren();
      $("a14ActivityReference").textContent = ""; $("a14RetentionDescription").textContent = "";
      $("a14ActivityStatus").textContent = t("customerReports.overviewDynamic.k073");
      $("a14GeoMetrics").replaceChildren();$("a14GeoRows").replaceChildren();$("a14GeoStatus").textContent=t("customerReports.overviewDynamic.k074");
      $("a14TrendMetrics").replaceChildren();$("a14TrendMonthlyRows").replaceChildren();$("a14TrendAnnualRows").replaceChildren();$("a14TrendStatus").textContent=t("customerReports.overviewDynamic.k075");
    } finally { busy = false; button.disabled = false; }
  }
  function refreshCurrentLanguage() {
    if (busy || !verifiedSnapshot) return;
    const requestedVisible = detailVisible;
    refreshFilterOptions(verifiedSnapshot.customers, verifiedSnapshot.sales);
    renderScope();
    if (filteredResult && requestedVisible > 10) {
      detailVisible = Math.min(requestedVisible, filteredResult.ranks.length);
      renderCustomerDetails(filteredResult);
    }
  }
  window.addEventListener("petatoe-language-changed", refreshCurrentLanguage);
  const initialize = () => {
    $("a14OverviewLoad")?.addEventListener("click", load);
    $("a14ApplyFilters")?.addEventListener("click", () => {if(!busy) renderScope();});
    $("a14ResetFilters")?.addEventListener("click", () => {
      for(const id of ["a14FilterYear","a14FilterMonth","a14FilterCustomer","a14FilterNeighborhood"]) $(id).value="";
      if(verifiedSnapshot && !busy) renderScope();
    });
    $("a14ExportCsv")?.addEventListener("click", exportCsv);
    $("a14PrintReport")?.addEventListener("click", printReport);
    $("a14DetailMore")?.addEventListener("click",()=>{
      if(!filteredResult||busy) return;
      detailVisible=Math.min(detailVisible+10,filteredResult.ranks.length);
      renderCustomerDetails(filteredResult);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
