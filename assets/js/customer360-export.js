// KYUM Phase 15.3.4 — Customer 360 Export Center
(function () {
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
    return new Intl.NumberFormat("ar-SA", {
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
      : parsed.toLocaleDateString("ar-SA");
  }

  function summaryRows(view) {
    const customer = view.customer;
    return [
      ["PETATOE", "Customer 360°"],
      ["Generated At", new Date().toISOString()],
      [],
      ["code", customer.customerNumber || ""],
      ["name", customer.name || ""],
      ["address", customer.address || ""],
      ["mobile", customer.phone || ""],
      ["Status", view.status.label],
      ["Health Score", `${view.risk.healthScore}%`],
      ["Risk Score", `${view.risk.score}%`],
      ["Priority", view.risk.priority.label],
      ["Last Contact", date(view.lastContactDate)],
      ["Inactivity Days", view.inactivityDays ?? ""],
      [],
      ["Follow-ups", view.totals.followups],
      ["Overdue Follow-ups", view.totals.overdueFollowups],
      ["Upcoming Follow-ups", view.totals.upcomingFollowups],
      ["Contracts", view.totals.quotations],
      ["Accepted Contracts", view.totals.acceptedQuotations],
      ["Total Contract Value", view.totals.totalQuotationValue],
      ["Accepted Value", view.totals.acceptedValue],
      ["Potential Value", view.risk.potentialValue],
      ["Conversion Rate", `${view.totals.conversionRate.toFixed(1)}%`],
      ["Engagement Score", `${view.risk.engagementScore}%`],
      ["Response Rate", `${view.risk.responseRate.toFixed(1)}%`]
    ];
  }

  function createExcel(view) {
    if (!window.XLSX) throw new Error("مكتبة Excel غير محملة.");

    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows(view));
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Customer Summary");

    const followupRows = [
      ["Date", "Method", "Result", "Representative", "Next Follow-up", "Completed", "Notes"],
      ...view.followups.map(item => [
        item.contactDate || item.createdAt || "",
        item.method || "",
        item.result || "",
        item.representative || "",
        item.nextFollowupDate || "",
        item.completed ? "Yes" : "No",
        item.notes || ""
      ])
    ];
    const followupSheet = XLSX.utils.aoa_to_sheet(followupRows);
    followupSheet["!cols"] = [
      { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 22 },
      { wch: 16 }, { wch: 12 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(workbook, followupSheet, "Follow-ups");

    const quotationRows = [
      ["Quotation", "Date", "Status", "Amount", "Representative", "Rejection / No Sale Reason"],
      ...view.quotations.map(item => [
        item.code || item.quotationNumber || "",
        item.quotationDate || item.createdAt || "",
        item.status || "",
        Number(item.amount || 0),
        item.representative || "",
        item.rejectionReason || item.noSaleReason || ""
      ])
    ];
    const quotationSheet = XLSX.utils.aoa_to_sheet(quotationRows);
    quotationSheet["!cols"] = [
      { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 16 },
      { wch: 22 }, { wch: 42 }
    ];
    XLSX.utils.book_append_sheet(workbook, quotationSheet, "Quotations");

    const activityRows = [
      ["Type", "Title", "Date", "Status", "Details", "Meta"],
      ...view.timeline.map(item => [
        item.typeLabel,
        item.title,
        item.date,
        item.status,
        item.detail,
        item.meta
      ])
    ];
    const activitySheet = XLSX.utils.aoa_to_sheet(activityRows);
    activitySheet["!cols"] = [
      { wch: 18 }, { wch: 30 }, { wch: 16 },
      { wch: 16 }, { wch: 60 }, { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(workbook, activitySheet, "Activity Timeline");

    XLSX.writeFile(workbook, `${fileBase(view)}.xlsx`);
  }

  function printHtml(view) {
    const customer = view.customer;

    const riskReasons = view.risk.reasons
      .map(reason => `<li>${safe(reason)}</li>`)
      .join("");

    const followups = view.followups.map(item => `
      <tr>
        <td>${safe(date(item.contactDate || item.createdAt))}</td>
        <td>${safe(item.method || "—")}</td>
        <td>${safe(item.result || "—")}</td>
        <td>${safe(item.representative || "—")}</td>
        <td>${safe(date(item.nextFollowupDate))}</td>
        <td>${safe(item.notes || "—")}</td>
      </tr>
    `).join("");

    const quotations = view.quotations.map(item => `
      <tr>
        <td>${safe(item.code || item.quotationNumber || "—")}</td>
        <td>${safe(date(item.quotationDate || item.createdAt))}</td>
        <td>${safe(item.status || "—")}</td>
        <td>${safe(currency(item.amount))}</td>
        <td>${safe(item.rejectionReason || item.noSaleReason || "—")}</td>
      </tr>
    `).join("");

    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${safe(customer.name)} — Customer 360</title>
<style>
body{font-family:Arial,sans-serif;color:#172033;margin:28px;line-height:1.6}
header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0f766e;padding-bottom:14px}
h1,h2,h3,p{margin:0}.muted{color:#667085}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
.kpi,.section{border:1px solid #dbe3ea;border-radius:10px;padding:12px}
.kpi span{font-size:11px;color:#667085}.kpi strong{display:block;font-size:18px;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:14px 0}
.section{margin-top:14px}.section h2{margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid #dbe3ea;padding:7px;text-align:right;vertical-align:top;font-size:11px}
th{background:#f1f5f9}ul{margin:8px 0}
footer{margin-top:20px;font-size:10px;color:#667085}
@media print{body{margin:10mm}.section{break-inside:avoid}}
</style>
</head>
<body>
<header>
<div>
<h1>PETATOE</h1>
<h3>Customer 360° Report</h3>
</div>
<div>
<strong>${safe(customer.name)}</strong>
<p class="muted">${safe(customer.customerNumber || "—")} · ${safe(customer.phone || "—")}</p>
<p class="muted">${safe(new Date().toLocaleString("ar-SA"))}</p>
</div>
</header>

<section class="kpis">
<div class="kpi"><span>صحة العميل</span><strong>${view.risk.healthScore}%</strong></div>
<div class="kpi"><span>درجة الخطر</span><strong>${view.risk.score}%</strong></div>
<div class="kpi"><span>قيمة العروض</span><strong>${safe(currency(view.totals.totalQuotationValue))}</strong></div>
<div class="kpi"><span>نسبة التحويل</span><strong>${view.totals.conversionRate.toFixed(1)}%</strong></div>
</section>

<div class="grid">
<section class="section">
<h2>البيانات الأساسية</h2>
<p><b>code:</b> ${safe(customer.customerNumber || "—")}</p>
<p><b>name:</b> ${safe(customer.name || "—")}</p>
<p><b>address:</b> ${safe(customer.address || "—")}</p>
<p><b>mobile:</b> ${safe(customer.phone || "—")}</p>
</section>

<section class="section">
<h2>المخاطر والإجراء التالي</h2>
<p><b>الحالة:</b> ${safe(view.status.label)}</p>
<p><b>الأولوية:</b> ${safe(view.risk.priority.label)}</p>
<p><b>الإجراء:</b> ${safe(view.risk.nextAction.title)}</p>
<p>${safe(view.risk.nextAction.detail)}</p>
<ul>${riskReasons}</ul>
</section>
</div>

<section class="section">
<h2>المتابعات</h2>
<table>
<thead><tr><th>التاريخ</th><th>الطريقة</th><th>النتيجة</th><th>المندوب</th><th>القادم</th><th>الملاحظات</th></tr></thead>
<tbody>${followups || '<tr><td colspan="6">لا توجد متابعات.</td></tr>'}</tbody>
</table>
</section>

<section class="section">
<h2>عروض الأسعار</h2>
<table>
<thead><tr><th>الرقم</th><th>التاريخ</th><th>الحالة</th><th>القيمة</th><th>سبب الرفض/عدم البيع</th></tr></thead>
<tbody>${quotations || '<tr><td colspan="5">لا توجد عروض أسعار.</td></tr>'}</tbody>
</table>
</section>

<footer>Generated by PETATOE — Customer 360 Export Center</footer>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
  }

  function openPrint(view) {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("اسمح بالنوافذ المنبثقة لإنشاء التقرير.");
    popup.document.open();
    popup.document.write(printHtml(view));
    popup.document.close();
  }

  async function createPng(element, view) {
    if (!window.html2canvas) throw new Error("مكتبة PNG غير محملة.");

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