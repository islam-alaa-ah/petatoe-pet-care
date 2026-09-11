// KYUM Phase 15.2.4 — Reports Export Center
(function () {
  const t=(key,fallback='')=>{const value=window.PetatoeLocalization?.t?.(key);return value&&value!==key?value:fallback};
  const lang=()=>window.PetatoeLocalization?.getLanguage?.()==='en'?'en':'ar';
  const locale=()=>lang()==='en'?'en-US-u-ca-gregory-nu-latn':'ar-SA-u-ca-gregory-nu-latn';
  const dir=()=>lang()==='en'?'ltr':'rtl';
  const money=value=>new Intl.NumberFormat(locale(),{style:'currency',currency:'SAR',maximumFractionDigits:2}).format(Number(value||0));
  const dateTime=value=>new Date(value||Date.now()).toLocaleString(locale());
  function safeFilePart(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "all";
  }

  function reportFileBase(report) {
    const representative = report?.filters?.representative || "all-representatives";
    const from = report?.filters?.from || "all";
    const to = report?.filters?.to || "all";
    return `PETATOE_Report_${safeFilePart(from)}_${safeFilePart(to)}_${safeFilePart(representative)}`;
  }

  function executiveSummary(report) {
    if (!report) return t('reportsOverview.export.noData','No report data is available.');
    const topRepresentative = report.representativePerformance?.[0];
    const topCustomer = report.topCustomersByValue?.[0];
    const topLossReason = report.topLossReasons?.[0];
    const allPeriods=t('reportsOverview.period.all','All Periods');
    const allRepresentatives=t('reportsOverview.filter.allRepresentatives','All Representatives');
    return [
      t('reportsOverview.export.summaryTitle','PETATOE — Executive Report Summary'),
      '',
      `${t('reportsOverview.export.period','Period')}: ${report.filters.from || allPeriods} ${t('reportsOverview.export.to','to')} ${report.filters.to || allPeriods}`,
      `${t('reportsOverview.filter.representative','Representative')}: ${report.filters.representative || allRepresentatives}`,
      '',
      `${t('reportsOverview.kpi.customers','Total Customers')}: ${report.totals.customers}`,
      `${t('reportsOverview.kpi.followups','Total Follow-ups')}: ${report.totals.followups}`,
      `${t('reportsOverview.export.overdueFollowups','Overdue follow-ups')}: ${report.totals.overdueFollowups}`,
      `${t('reportsOverview.kpi.contracts','Total Contracts')}: ${report.totals.quotations}`,
      `${t('reportsOverview.kpi.contractValue','Contract Value')}: ${money(report.totals.quotationValue)}`,
      `${t('reportsOverview.export.acceptedValue','Accepted contract value')}: ${money(report.totals.acceptedValue)}`,
      `${t('reportsOverview.kpi.conversion','Conversion Rate')}: ${report.totals.conversionRate.toFixed(1)}%`,
      `${t('reportsOverview.kpi.targetAchievement','Target Achievement')}: ${report.totals.targetAchievement.toFixed(1)}%`,
      '',
      `${t('reportsOverview.export.topRepresentative','Top representative')}: ${topRepresentative?.name || '—'} (${topRepresentative ? topRepresentative.conversion.toFixed(1) : '0.0'}% ${t('reportsOverview.common.conversion','Conversion')})`,
      `${t('reportsOverview.export.topCustomer','Top customer by value')}: ${topCustomer?.name || '—'} (${topCustomer ? money(topCustomer.totalValue) : money(0)})`,
      `${t('reportsOverview.export.topLossReason','Top loss reason')}: ${topLossReason?.name || '—'} (${topLossReason?.count || 0})`,
      '',
      `${t('reportsOverview.export.generatedAt','Generated at')}: ${dateTime(report.generatedAt)}`
    ].join('\n');
  }

  function createExcel(report) {
    if (!window.XLSX) throw new Error(t('reportsOverview.export.excelMissing','Excel library is not loaded.'));
    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      ['PETATOE',t('reportsOverview.export.executiveSalesReport','Executive Sales Report')],
      [t('reportsOverview.export.generatedAt','Generated at'),dateTime(report.generatedAt)],
      [t('reportsOverview.export.from','From'),report.filters.from||t('reportsOverview.period.all','All Periods')],
      [t('reportsOverview.export.to','to'),report.filters.to||t('reportsOverview.period.all','All Periods')],
      [t('reportsOverview.filter.representative','Representative'),report.filters.representative||t('reportsOverview.filter.allRepresentatives','All Representatives')],[],
      [t('reportsOverview.export.kpi','KPI'),t('reportsOverview.common.value','Value'),t('reportsOverview.export.changePercent','Change %')],
      [t('reportsOverview.common.customers','Customers'),report.totals.customers,report.deltas.customers],
      [t('reportsOverview.kpi.todayFollowups','Today’s Follow-ups'),report.totals.todayFollowups,report.deltas.todayFollowups],
      [t('reportsOverview.common.followups','Follow-ups'),report.totals.followups,report.deltas.followups],
      [t('reportsOverview.common.contracts','Contracts'),report.totals.quotations,report.deltas.quotations],
      [t('reportsOverview.kpi.contractValue','Contract Value'),report.totals.quotationValue,report.deltas.quotationValue],
      [t('reportsOverview.export.acceptedValue','Accepted contract value'),report.totals.acceptedValue,''],
      [t('reportsOverview.kpi.conversion','Conversion Rate'),report.totals.conversionRate,report.deltas.conversionRate],
      [t('reportsOverview.kpi.targetAchievement','Target Achievement'),report.totals.targetAchievement,report.deltas.targetAchievement]
    ];
    const summarySheet=XLSX.utils.aoa_to_sheet(summaryRows);summarySheet['!cols']=[{wch:28},{wch:22},{wch:14}];XLSX.utils.book_append_sheet(workbook,summarySheet,t('reportsOverview.export.sheetSummary','Executive Summary').slice(0,31));
    const funnelRows=[[t('reportsOverview.export.stage','Stage'),t('reportsOverview.export.count','Count'),t('reportsOverview.export.stageConversion','Stage Conversion %'),t('reportsOverview.export.totalConversion','Total Conversion %')],...report.funnel.map(item=>[lang()==='en'?item.label:item.arabic,item.value,item.stageConversion,item.totalConversion])];
    const funnelSheet=XLSX.utils.aoa_to_sheet(funnelRows);funnelSheet['!cols']=[{wch:24},{wch:12},{wch:20},{wch:20}];XLSX.utils.book_append_sheet(workbook,funnelSheet,t('reportsOverview.export.sheetFunnel','Sales Funnel').slice(0,31));
    const repRows=[[t('reportsOverview.export.rank','Rank'),t('reportsOverview.filter.representative','Representative'),t('reportsOverview.common.customers','Customers'),t('reportsOverview.common.followups','Follow-ups'),t('reportsOverview.common.contracts','Contracts'),t('reportsOverview.common.accepted','Accepted'),t('reportsOverview.kpi.contractValue','Contract Value'),t('reportsOverview.export.acceptedValue','Accepted contract value'),t('reportsOverview.kpi.conversion','Conversion Rate'),t('reportsOverview.export.activityScore','Activity Score')],...report.representativePerformance.map(item=>[item.rank,item.name,item.customers,item.followups,item.quotations,item.accepted,item.value,item.acceptedValue,item.conversion,item.activityScore])];
    const repSheet=XLSX.utils.aoa_to_sheet(repRows);repSheet['!cols']=[{wch:8},{wch:24},{wch:12},{wch:12},{wch:12},{wch:12},{wch:18},{wch:18},{wch:14},{wch:14}];XLSX.utils.book_append_sheet(workbook,repSheet,t('reportsOverview.export.sheetRepresentatives','Representatives').slice(0,31));
    const topRows=[[t('reportsOverview.topCustomers.title','Top Customers by Contract Value'),t('reportsOverview.kpi.contractValue','Contract Value'),t('reportsOverview.common.contracts','Contracts'),t('reportsOverview.common.accepted','Accepted')],...report.topCustomersByValue.map(item=>[item.name,item.totalValue,item.quotations,item.accepted]),[],[t('reportsOverview.topInterests.title','Top 10 Interests'),t('reportsOverview.export.count','Count')],...report.topInterests.map(item=>[item.name,item.count]),[],[t('reportsOverview.lossReasons.title','Top Loss Reasons'),t('reportsOverview.export.count','Count')],...report.topLossReasons.map(item=>[item.name,item.count])];
    const topSheet=XLSX.utils.aoa_to_sheet(topRows);topSheet['!cols']=[{wch:30},{wch:18},{wch:14},{wch:14}];XLSX.utils.book_append_sheet(workbook,topSheet,t('reportsOverview.export.sheetTop10','Top 10').slice(0,31));
    XLSX.writeFile(workbook,`${reportFileBase(report)}.xlsx`);
  }

  function pdfHtml(report) {
    const summary=executiveSummary(report).split('\n').map(line=>`<p>${line?line.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])):'&nbsp;'}</p>`).join('');
    const reps=report.representativePerformance.slice(0,10).map(item=>`<tr><td>${item.rank}</td><td>${item.name}</td><td>${item.customers}</td><td>${item.followups}</td><td>${item.quotations}</td><td>${item.accepted}</td><td>${money(item.acceptedValue)}</td><td>${item.conversion.toFixed(1)}%</td></tr>`).join('');
    return `<!doctype html><html lang="${lang()}" dir="${dir()}"><head><meta charset="utf-8"><title>${t('reportsOverview.export.executiveSalesReport','Executive Sales Report')}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#172033}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:14px;margin-bottom:18px}h1,h2,h3,p{margin:0}.meta{color:#667085;font-size:12px;line-height:1.8}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.kpi{border:1px solid #dbe3ea;border-radius:10px;padding:12px}.kpi span{font-size:11px;color:#667085}.kpi strong{display:block;font-size:20px;margin-top:6px}.summary{background:#f8fafc;border:1px solid #dbe3ea;border-radius:10px;padding:14px;margin:18px 0;line-height:1.7}.summary p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #dbe3ea;padding:8px;text-align:${dir()==='rtl'?'right':'left'};font-size:11px}th{background:#f1f5f9}footer{margin-top:20px;color:#667085;font-size:10px}@media print{body{margin:12mm}.no-print{display:none}}</style></head><body><header><div><h1>PETATOE</h1><h3>${t('reportsOverview.export.executiveSalesReport','Executive Sales Report')}</h3></div><div class="meta"><div>${report.filters.from||t('reportsOverview.period.all','All Periods')} — ${report.filters.to||t('reportsOverview.period.all','All Periods')}</div><div>${report.filters.representative||t('reportsOverview.filter.allRepresentatives','All Representatives')}</div><div>${dateTime(report.generatedAt)}</div></div></header><section class="kpis"><div class="kpi"><span>${t('reportsOverview.common.customers','Customers')}</span><strong>${report.totals.customers}</strong></div><div class="kpi"><span>${t('reportsOverview.common.followups','Follow-ups')}</span><strong>${report.totals.followups}</strong></div><div class="kpi"><span>${t('reportsOverview.common.contracts','Contracts')}</span><strong>${report.totals.quotations}</strong></div><div class="kpi"><span>${t('reportsOverview.kpi.conversion','Conversion Rate')}</span><strong>${report.totals.conversionRate.toFixed(1)}%</strong></div><div class="kpi"><span>${t('reportsOverview.kpi.contractValue','Contract Value')}</span><strong>${money(report.totals.quotationValue)}</strong></div><div class="kpi"><span>${t('reportsOverview.export.acceptedValue','Accepted contract value')}</span><strong>${money(report.totals.acceptedValue)}</strong></div><div class="kpi"><span>${t('reportsOverview.kpi.targetAchievement','Target Achievement')}</span><strong>${report.totals.targetAchievement.toFixed(1)}%</strong></div><div class="kpi"><span>${t('reportsOverview.kpi.withoutFollowup','Customers Without Follow-up')}</span><strong>${report.totals.customersWithoutFollowup}</strong></div></section><section class="summary">${summary}</section><h2>${t('reportsOverview.export.repPerformance','Representative Performance')}</h2><table><thead><tr><th>#</th><th>${t('reportsOverview.filter.representative','Representative')}</th><th>${t('reportsOverview.common.customers','Customers')}</th><th>${t('reportsOverview.common.followups','Follow-ups')}</th><th>${t('reportsOverview.common.contracts','Contracts')}</th><th>${t('reportsOverview.common.accepted','Accepted')}</th><th>${t('reportsOverview.export.acceptedValue','Accepted contract value')}</th><th>${t('reportsOverview.kpi.conversion','Conversion Rate')}</th></tr></thead><tbody>${reps}</tbody></table><footer>${t('reportsOverview.export.footer','Generated by PETATOE — Enterprise Reports Center')}</footer><script>window.onload=()=>window.print();</script></body></html>`;
  }

  async function createPng(reportElement, report) {
    if (!window.html2canvas) throw new Error(t('reportsOverview.export.pngMissing','PNG library is not loaded.'));
    document.body.classList.add("reports-exporting");
    try {
      const canvas = await html2canvas(reportElement, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: reportElement.scrollWidth,
        windowHeight: reportElement.scrollHeight
      });

      const link = document.createElement("a");
      link.download = `${reportFileBase(report)}.png`;
      link.href = canvas.toDataURL("image/png", 1);
      link.click();
    } finally {
      document.body.classList.remove("reports-exporting");
    }
  }

  window.ReportsExportCenter = Object.freeze({
    executiveSummary,
    createExcel,
    pdfHtml,
    createPng,
    reportFileBase
  });
})();