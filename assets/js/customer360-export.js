// KYUM Phase 15.3.4 — Customer 360 Export Center
(function () {
  const t=(key,fallback='')=>{const value=window.PetatoeLocalization?.t?.(key);return value&&value!==key?value:fallback};
  const lang=()=>window.PetatoeLocalization?.getLanguage?.()==='en'?'en':'ar';
  const locale=()=>lang()==='en'?'en-US-u-ca-gregory-nu-latn':'ar-SA-u-ca-gregory-nu-latn';
  const dir=()=>lang()==='en'?'ltr':'rtl';
  function safe(value) {
    return String(value ?? "")
      .replace(/[&<>"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      })[character]);
  }

  function safeFilePart(value) {
    return String(value || "customer")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "customer";
  }

  function fileBase(view) {
    const customer = view?.customer || {};
    const date = new Date().toISOString().slice(0, 10);
    return `PETATOE_Customer_360_${safeFilePart(customer.name || customer.phone)}_${date}`;
  }

  function currency(value) {
    return new Intl.NumberFormat(locale(), {
      style: "currency",
      currency: "SAR",
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function date(value) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? String(value)
      : parsed.toLocaleDateString(locale());
  }

  function summaryRows(view) {
    const customer=view.customer;
    return [
      ['PETATOE',t('customer360.export.reportTitle','Customer 360° Report')],
      [t('customer360.export.generatedAt','Generated At'),new Date().toLocaleString(locale())],[],
      [t('customer360.export.code','Code'),customer.customerNumber||''],[t('customer360.export.name','Name'),customer.name||''],[t('customer360.export.address','Address'),customer.address||''],[t('customer360.export.mobile','Mobile'),customer.phone||''],
      [t('customer360.export.status','Status'),view.status.label],[t('customer360.export.healthScore','Health Score'),`${view.risk.healthScore}%`],[t('customer360.export.riskScore','Risk Score'),`${view.risk.score}%`],[t('customer360.export.priority','Priority'),view.risk.priority.label],[t('customer360.export.lastContact','Last Contact'),date(view.lastContactDate)],[t('customer360.export.inactivityDays','Inactivity Days'),view.inactivityDays??''],[],
      [t('customer360.export.followups','Follow-ups'),view.totals.followups],[t('customer360.export.overdueFollowups','Overdue Follow-ups'),view.totals.overdueFollowups],[t('customer360.export.upcomingFollowups','Upcoming Follow-ups'),view.totals.upcomingFollowups],[t('customer360.export.contracts','Contracts'),view.totals.quotations],[t('customer360.export.acceptedContracts','Accepted Contracts'),view.totals.acceptedQuotations],[t('customer360.export.totalContractValue','Total Contract Value'),view.totals.totalQuotationValue],[t('customer360.export.acceptedValue','Accepted Value'),view.totals.acceptedValue],[t('customer360.export.potentialValue','Potential Value'),view.risk.potentialValue],[t('customer360.export.conversionRate','Conversion Rate'),`${view.totals.conversionRate.toFixed(1)}%`],[t('customer360.export.engagementScore','Engagement Score'),`${view.risk.engagementScore}%`],[t('customer360.export.responseRate','Response Rate'),`${view.risk.responseRate.toFixed(1)}%`]
    ];
  }

  function createExcel(view) {
    if(!window.XLSX)throw new Error(t('customer360.export.excelMissing','Excel library is not loaded.'));
    const workbook=XLSX.utils.book_new();
    const summarySheet=XLSX.utils.aoa_to_sheet(summaryRows(view));summarySheet['!cols']=[{wch:28},{wch:60}];XLSX.utils.book_append_sheet(workbook,summarySheet,t('customer360.export.sheetSummary','Customer Summary').slice(0,31));
    const followupRows=[[t('customer360.export.date','Date'),t('customer360.export.method','Method'),t('customer360.export.result','Result'),t('customer360.export.representative','Representative'),t('customer360.export.nextFollowup','Next Follow-up'),t('customer360.export.completed','Completed'),t('customer360.export.notes','Notes')],...view.followups.map(item=>[item.contactDate||item.createdAt||'',item.method||'',item.result||'',item.representative||'',item.nextFollowupDate||'',item.completed?t('customer360.export.yes','Yes'):t('customer360.export.no','No'),item.notes||''])];
    const followupSheet=XLSX.utils.aoa_to_sheet(followupRows);followupSheet['!cols']=[{wch:14},{wch:18},{wch:24},{wch:22},{wch:16},{wch:12},{wch:50}];XLSX.utils.book_append_sheet(workbook,followupSheet,t('customer360.export.sheetFollowups','Follow-ups').slice(0,31));
    const quotationRows=[[t('customer360.export.quotation','Quotation'),t('customer360.export.date','Date'),t('customer360.export.status','Status'),t('customer360.export.amount','Amount'),t('customer360.export.representative','Representative'),t('customer360.export.rejectionReason','Rejection / No Sale Reason')],...view.quotations.map(item=>[item.code||item.quotationNumber||'',item.quotationDate||item.createdAt||'',item.status||'',Number(item.amount||0),item.representative||'',item.rejectionReason||item.noSaleReason||''])];
    const quotationSheet=XLSX.utils.aoa_to_sheet(quotationRows);quotationSheet['!cols']=[{wch:20},{wch:14},{wch:18},{wch:16},{wch:22},{wch:42}];XLSX.utils.book_append_sheet(workbook,quotationSheet,t('customer360.export.sheetQuotations','Quotations').slice(0,31));
    const activityRows=[[t('customer360.export.type','Type'),t('customer360.export.title','Title'),t('customer360.export.date','Date'),t('customer360.export.status','Status'),t('customer360.export.details','Details'),t('customer360.export.meta','Meta')],...view.timeline.map(item=>[item.typeLabel,item.title,item.date,item.status,item.detail,item.meta])];
    const activitySheet=XLSX.utils.aoa_to_sheet(activityRows);activitySheet['!cols']=[{wch:18},{wch:30},{wch:16},{wch:16},{wch:60},{wch:28}];XLSX.utils.book_append_sheet(workbook,activitySheet,t('customer360.export.sheetTimeline','Activity Timeline').slice(0,31));
    XLSX.writeFile(workbook,`${fileBase(view)}.xlsx`);
  }

  function printHtml(view) {
    const customer=view.customer;
    const riskReasons=view.risk.reasons.map(reason=>`<li>${safe(reason)}</li>`).join('');
    const followups=view.followups.map(item=>`<tr><td>${safe(date(item.contactDate||item.createdAt))}</td><td>${safe(item.method||'—')}</td><td>${safe(item.result||'—')}</td><td>${safe(item.representative||'—')}</td><td>${safe(date(item.nextFollowupDate))}</td><td>${safe(item.notes||'—')}</td></tr>`).join('');
    const quotations=view.quotations.map(item=>`<tr><td>${safe(item.code||item.quotationNumber||'—')}</td><td>${safe(date(item.quotationDate||item.createdAt))}</td><td>${safe(item.status||'—')}</td><td>${safe(currency(item.amount))}</td><td>${safe(item.rejectionReason||item.noSaleReason||'—')}</td></tr>`).join('');
    const align=dir()==='rtl'?'right':'left';
    return `<!doctype html><html lang="${lang()}" dir="${dir()}"><head><meta charset="utf-8"><title>${safe(customer.name)} — ${t('customer360.export.reportTitle','Customer 360° Report')}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:28px;line-height:1.6}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0f766e;padding-bottom:14px}h1,h2,h3,p{margin:0}.muted{color:#667085}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.kpi,.section{border:1px solid #dbe3ea;border-radius:10px;padding:12px}.kpi span{font-size:11px;color:#667085}.kpi strong{display:block;font-size:18px;margin-top:4px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:14px 0}.section{margin-top:14px}.section h2{margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #dbe3ea;padding:7px;text-align:${align};vertical-align:top;font-size:11px}th{background:#f1f5f9}ul{margin:8px 0}footer{margin-top:20px;font-size:10px;color:#667085}@media print{body{margin:10mm}.section{break-inside:avoid}}</style></head><body><header><div><h1>PETATOE</h1><h3>${t('customer360.export.reportTitle','Customer 360° Report')}</h3></div><div><strong>${safe(customer.name)}</strong><p class="muted">${safe(customer.customerNumber||'—')} · ${safe(customer.phone||'—')}</p><p class="muted">${safe(new Date().toLocaleString(locale()))}</p></div></header><section class="kpis"><div class="kpi"><span>${t('customer360.export.healthScore','Health Score')}</span><strong>${view.risk.healthScore}%</strong></div><div class="kpi"><span>${t('customer360.export.riskScore','Risk Score')}</span><strong>${view.risk.score}%</strong></div><div class="kpi"><span>${t('customer360.export.totalContractValue','Total Contract Value')}</span><strong>${safe(currency(view.totals.totalQuotationValue))}</strong></div><div class="kpi"><span>${t('customer360.export.conversionRate','Conversion Rate')}</span><strong>${view.totals.conversionRate.toFixed(1)}%</strong></div></section><div class="grid"><section class="section"><h2>${t('customer360.export.basicData','Basic Information')}</h2><p><b>${t('customer360.export.code','Code')}:</b> ${safe(customer.customerNumber||'—')}</p><p><b>${t('customer360.export.name','Name')}:</b> ${safe(customer.name||'—')}</p><p><b>${t('customer360.export.address','Address')}:</b> ${safe(customer.address||'—')}</p><p><b>${t('customer360.export.mobile','Mobile')}:</b> ${safe(customer.phone||'—')}</p></section><section class="section"><h2>${t('customer360.export.riskNextAction','Risk & Next Action')}</h2><p><b>${t('customer360.export.status','Status')}:</b> ${safe(view.status.label)}</p><p><b>${t('customer360.export.priority','Priority')}:</b> ${safe(view.risk.priority.label)}</p><p><b>${t('customer360.export.action','Action')}:</b> ${safe(view.risk.nextAction.title)}</p><p>${safe(view.risk.nextAction.detail)}</p><ul>${riskReasons}</ul></section></div><section class="section"><h2>${t('customer360.export.followups','Follow-ups')}</h2><table><thead><tr><th>${t('customer360.export.date','Date')}</th><th>${t('customer360.export.method','Method')}</th><th>${t('customer360.export.result','Result')}</th><th>${t('customer360.export.representative','Representative')}</th><th>${t('customer360.export.nextFollowup','Next Follow-up')}</th><th>${t('customer360.export.notes','Notes')}</th></tr></thead><tbody>${followups||`<tr><td colspan="6">${t('customer360.export.noFollowups','No follow-ups.')}</td></tr>`}</tbody></table></section><section class="section"><h2>${t('customer360.export.quotations','Quotations')}</h2><table><thead><tr><th>${t('customer360.export.number','Number')}</th><th>${t('customer360.export.date','Date')}</th><th>${t('customer360.export.status','Status')}</th><th>${t('customer360.export.amount','Amount')}</th><th>${t('customer360.export.rejectionReason','Rejection / No Sale Reason')}</th></tr></thead><tbody>${quotations||`<tr><td colspan="5">${t('customer360.export.noQuotations','No quotations.')}</td></tr>`}</tbody></table></section><footer>${t('customer360.export.footer','Generated by PETATOE — Customer 360 Export Center')}</footer><script>window.onload=()=>window.print();</script></body></html>`;
  }

  function openPrint(view) {
    const popup = window.open("", "_blank");
    if(!popup)throw new Error(t('customer360.export.popupRequired','Allow pop-ups to create the report.'));
    popup.document.open();
    popup.document.write(printHtml(view));
    popup.document.close();
  }

  async function createPng(element, view) {
    if(!window.html2canvas)throw new Error(t('customer360.export.pngMissing','PNG library is not loaded.'));

    document.body.classList.add("customer360-exporting");
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });

      const link = document.createElement("a");
      link.download = `${fileBase(view)}.png`;
      link.href = canvas.toDataURL("image/png", 1);
      link.click();
    } finally {
      document.body.classList.remove("customer360-exporting");
    }
  }

  window.Customer360Export = Object.freeze({
    createExcel,
    openPrint,
    createPng,
    fileBase
  });
})();