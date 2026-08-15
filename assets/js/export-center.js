// KYUM Phase 15.2.4 — Reports Export Center
(function () {
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
    if (!report) return "لا توجد بيانات تقرير متاحة.";

    const topRepresentative = report.representativePerformance?.[0];
    const topCustomer = report.topCustomersByValue?.[0];
    const topLossReason = report.topLossReasons?.[0];

    return [
      "PETATOE — Executive Report Summary",
      "",
      `الفترة: ${report.filters.from || "كل الفترات"} إلى ${report.filters.to || "كل الفترات"}`,
      `المندوب: ${report.filters.representative || "كل المندوبين"}`,
      "",
      `إجمالي العملاء: ${report.totals.customers}`,
      `إجمالي المتابعات: ${report.totals.followups}`,
      `المتابعات المتأخرة: ${report.totals.overdueFollowups}`,
      `إجمالي العروض: ${report.totals.quotations}`,
      `قيمة العروض: ${report.totals.quotationValue.toFixed(2)} SAR`,
      `قيمة العروض المقبولة: ${report.totals.acceptedValue.toFixed(2)} SAR`,
      `نسبة التحويل: ${report.totals.conversionRate.toFixed(1)}%`,
      `تحقيق الهدف: ${report.totals.targetAchievement.toFixed(1)}%`,
      "",
      `أفضل مندوب: ${topRepresentative?.name || "—"} (${topRepresentative ? topRepresentative.conversion.toFixed(1) : "0.0"}% تحويل)`,
      `أعلى عميل قيمة: ${topCustomer?.name || "—"} (${topCustomer ? topCustomer.totalValue.toFixed(2) : "0.00"} SAR)`,
      `أكثر سبب خسارة: ${topLossReason?.name || "—"} (${topLossReason?.count || 0})`,
      "",
      `تاريخ الإنشاء: ${new Date(report.generatedAt).toLocaleString("ar-SA-u-nu-latn")}`
    ].join("\n");
  }

  function createExcel(report) {
    if (!window.XLSX) throw new Error("مكتبة Excel غير محملة.");

    const workbook = XLSX.utils.book_new();

    const summaryRows = [
      ["PETATOE", "Executive Sales Report"],
      ["Generated At", report.generatedAt],
      ["From", report.filters.from],
      ["To", report.filters.to],
      ["Representative", report.filters.representative || "All"],
      [],
      ["KPI", "Value", "Change %"],
      ["Customers", report.totals.customers, report.deltas.customers],
      ["Today Follow-ups", report.totals.todayFollowups, report.deltas.todayFollowups],
      ["Follow-ups", report.totals.followups, report.deltas.followups],
      ["Quotations", report.totals.quotations, report.deltas.quotations],
      ["Quotation Value", report.totals.quotationValue, report.deltas.quotationValue],
      ["Accepted Value", report.totals.acceptedValue, ""],
      ["Conversion Rate", report.totals.conversionRate, report.deltas.conversionRate],
      ["Target Achievement", report.totals.targetAchievement, report.deltas.targetAchievement]
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Executive Summary");

    const funnelRows = [
      ["Stage", "Arabic", "Count", "Stage Conversion %", "Total Conversion %"],
      ...report.funnel.map(item => [
        item.label,
        item.arabic,
        item.value,
        item.stageConversion,
        item.totalConversion
      ])
    ];
    const funnelSheet = XLSX.utils.aoa_to_sheet(funnelRows);
    funnelSheet["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, funnelSheet, "Sales Funnel");

    const repRows = [
      ["Rank", "Representative", "Customers", "Follow-ups", "Quotations", "Accepted", "Quotation Value", "Accepted Value", "Conversion %", "Activity Score"],
      ...report.representativePerformance.map(item => [
        item.rank,
        item.name,
        item.customers,
        item.followups,
        item.quotations,
        item.accepted,
        item.value,
        item.acceptedValue,
        item.conversion,
        item.activityScore
      ])
    ];
    const repSheet = XLSX.utils.aoa_to_sheet(repRows);
    repSheet["!cols"] = [
      { wch: 8 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(workbook, repSheet, "Representatives");

    const topRows = [
      ["Top Customers", "Quotation Value", "Quotations", "Accepted"],
      ...report.topCustomersByValue.map(item => [
        item.name,
        item.totalValue,
        item.quotations,
        item.accepted
      ]),
      [],
      ["Top Interests", "Count"],
      ...report.topInterests.map(item => [item.name, item.count]),
      [],
      ["Top Loss Reasons", "Count"],
      ...report.topLossReasons.map(item => [item.name, item.count])
    ];
    const topSheet = XLSX.utils.aoa_to_sheet(topRows);
    topSheet["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, topSheet, "Top 10");

    XLSX.writeFile(workbook, `${reportFileBase(report)}.xlsx`);
  }

  function pdfHtml(report) {
    const summary = executiveSummary(report)
      .split("\n")
      .map(line => `<p>${line ? line.replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])) : "&nbsp;"}</p>`)
      .join("");

    const reps = report.representativePerformance.slice(0, 10).map(item => `
      <tr>
        <td>${item.rank}</td>
        <td>${item.name}</td>
        <td>${item.customers}</td>
        <td>${item.followups}</td>
        <td>${item.quotations}</td>
        <td>${item.accepted}</td>
        <td>${item.acceptedValue.toFixed(2)} SAR</td>
        <td>${item.conversion.toFixed(1)}%</td>
      </tr>
    `).join("");

    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>KYUM Executive Report</title>
<style>
body{font-family:Arial,sans-serif;margin:28px;color:#172033}
header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:14px;margin-bottom:18px}
h1,h2,h3,p{margin:0}
.meta{color:#667085;font-size:12px;line-height:1.8}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
.kpi{border:1px solid #dbe3ea;border-radius:10px;padding:12px}
.kpi span{font-size:11px;color:#667085}.kpi strong{display:block;font-size:20px;margin-top:6px}
.summary{background:#f8fafc;border:1px solid #dbe3ea;border-radius:10px;padding:14px;margin:18px 0;line-height:1.7}
.summary p{margin:2px 0}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #dbe3ea;padding:8px;text-align:right;font-size:11px}
th{background:#f1f5f9}
footer{margin-top:20px;color:#667085;font-size:10px}
@media print{body{margin:12mm}.no-print{display:none}}
</style>
</head>
<body>
<header>
<div><h1>PETATOE</h1><h3>Executive Sales Report</h3></div>
<div class="meta">
<div>${report.filters.from || "All"} — ${report.filters.to || "All"}</div>
<div>${report.filters.representative || "كل المندوبين"}</div>
<div>${new Date(report.generatedAt).toLocaleString("ar-SA-u-nu-latn")}</div>
</div>
</header>
<section class="kpis">
<div class="kpi"><span>العملاء</span><strong>${report.totals.customers}</strong></div>
<div class="kpi"><span>المتابعات</span><strong>${report.totals.followups}</strong></div>
<div class="kpi"><span>العروض</span><strong>${report.totals.quotations}</strong></div>
<div class="kpi"><span>التحويل</span><strong>${report.totals.conversionRate.toFixed(1)}%</strong></div>
<div class="kpi"><span>قيمة العروض</span><strong>${report.totals.quotationValue.toFixed(2)} SAR</strong></div>
<div class="kpi"><span>قيمة المقبول</span><strong>${report.totals.acceptedValue.toFixed(2)} SAR</strong></div>
<div class="kpi"><span>تحقيق الهدف</span><strong>${report.totals.targetAchievement.toFixed(1)}%</strong></div>
<div class="kpi"><span>عملاء بلا متابعة</span><strong>${report.totals.customersWithoutFollowup}</strong></div>
</section>
<section class="summary">${summary}</section>
<h2>أداء المندوبين</h2>
<table>
<thead><tr><th>#</th><th>المندوب</th><th>العملاء</th><th>المتابعات</th><th>العروض</th><th>المقبولة</th><th>قيمة المقبول</th><th>التحويل</th></tr></thead>
<tbody>${reps}</tbody>
</table>
<footer>Generated by PETATOE — Enterprise Reports Center</footer>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
  }

  async function createPng(reportElement, report) {
    if (!window.html2canvas) throw new Error("مكتبة PNG غير محملة.");
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