(()=>{
  "use strict";
  let rows=[];
  let editingInvoice=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const t=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback};
  const lang=()=>window.PetatoeLocalization?.getLanguage?.()==="en"?"en":"ar";
  const money=v=>new Intl.NumberFormat(lang()==="en"?"en-SA":"ar-SA-u-nu-latn",{style:"currency",currency:"SAR",minimumFractionDigits:2}).format(Number(v||0));
  const wholeMoney=v=>new Intl.NumberFormat(lang()==="en"?"en-SA":"ar-SA-u-nu-latn",{style:"currency",currency:"SAR",minimumFractionDigits:0,maximumFractionDigits:0}).format(Math.round(Number(v||0)));
  const date=v=>v?new Intl.DateTimeFormat(lang()==="en"?"en-GB":"ar-SA-u-ca-gregory-nu-latn",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v+"T00:00:00")):"—";
  const sourceLabel=value=>value==="installation"?t("invoices.source.appointment","موعد"):t("invoices.source.contract","عقد");
  const paymentLabel=value=>{const v=String(value||"").trim();if(["بطاقة","بطاقة / شبكة","شبكة"].includes(v))return t("appointmentNew.collection.card","بطاقة / شبكة");if(["دفع إلكتروني","الدفع عن طريق الموقع"].includes(v))return t("appointmentNew.collection.website","الدفع عن طريق الموقع");if(["تحويل","تحويل بنكي"].includes(v))return t("appointmentNew.collection.bank","تحويل بنكي");if(v==="نقدي")return t("appointmentNew.collection.cash","نقدي");return v||"—"};
  function status(msg,type=""){const el=$("salesInvoicesStatus");if(!el)return;el.textContent=msg||"";el.classList.toggle("hidden",!msg);el.classList.toggle("error",type==="error")}
  function filtered(){const q=($("salesInvoicesSearch")?.value||"").trim().toLowerCase(),source=$("salesInvoicesSourceFilter")?.value||"",st=$("salesInvoicesStatusFilter")?.value||"",from=$("salesInvoicesDateFrom")?.value||"",to=$("salesInvoicesDateTo")?.value||"";return rows.filter(r=>(!q||[r.requestNumber,r.customerName,r.invoiceNumber,r.paymentMethod,r.representativeName].join(" ").toLowerCase().includes(q))&&(!source||r.sourceType===source)&&(!st||r.status===st)&&(!from||r.invoiceDate>=from)&&(!to||r.invoiceDate<=to))}
  function render(){
    const list=filtered();
    $("salesInvoicesCount").textContent=String(list.length);
    $("salesInvoicesAmount").textContent=wholeMoney(list.reduce((s,r)=>s+r.invoiceAmountInclTax,0));
    $("salesInvoicesInstallationCost").textContent=money(list.reduce((s,r)=>s+r.installationExpenses,0));
    const canEdit=Boolean(window.CustomerPermissions?.canAction?.("salesInvoices","edit"));
    const body=$("salesInvoicesTableBody");
    body.innerHTML=list.length?list.map(r=>{
      const attachments=r.attachments?.length?`<button class="secondary-btn compact-btn" type="button" data-sales-invoice-attachments="${esc(r.id)}">${esc(t("invoices.attachments.view","عرض المرفقات"))} (${r.attachments.length})</button>`:`<span class="field-hint">${esc(t("invoices.attachments.none","لا توجد مرفقات"))}</span>`;
      const edit=canEdit?`<button class="secondary-btn compact-btn" type="button" data-sales-invoice-edit="${esc(r.id)}">${esc(t("invoices.edit.action","تعديل"))}</button>`:`<span class="field-hint">—</span>`;
      return `<tr><td data-label="${esc(t("invoices.col.request","رقم الطلب"))}"><strong>${esc(r.requestNumber)}</strong></td><td data-label="${esc(t("invoices.col.customer","اسم العميل"))}">${esc(r.customerName)}</td><td data-label="${esc(t("invoices.col.invoice","رقم الفاتورة"))}">${esc(r.invoiceNumber)}</td><td data-label="${esc(t("invoices.col.amountInclTax","القيمة شاملة الضريبة"))}">${esc(wholeMoney(r.invoiceAmountInclTax))}</td><td data-label="${esc(t("appointmentNew.collection.payment","طريقة الدفع"))}">${esc(paymentLabel(r.paymentMethod))}</td><td data-label="${esc(t("invoices.col.date","تاريخ الفاتورة"))}">${esc(date(r.invoiceDate))}</td><td data-label="${esc(t("invoices.col.source","المصدر"))}">${esc(sourceLabel(r.sourceType))}</td><td data-label="${esc(t("invoices.attachments.title","المرفقات"))}">${attachments}</td><td data-label="${esc(t("invoices.edit.title","تعديل"))}">${edit}</td></tr>`;
    }).join(""):`<tr><td colspan="9" class="empty-state">${esc(t("invoices.empty","لا توجد فواتير مطابقة."))}</td></tr>`;
  }
  function syncEditNoInvoice(){const checked=Boolean($("salesInvoiceEditNoInvoice")?.checked),input=$("salesInvoiceEditNumber");if(!input)return;input.disabled=checked;input.required=!checked;if(checked)input.value=""}
  function openEdit(r){editingInvoice=r;$("salesInvoiceEditRequestLabel").textContent=`${r.requestNumber} — ${r.customerName}`;$("salesInvoiceEditNumber").value=r.isWithoutInvoice?"":r.storedInvoiceNumber;$("salesInvoiceEditDate").value=r.invoiceDate||"";$("salesInvoiceEditNoInvoice").checked=Boolean(r.isWithoutInvoice);const payment=$("salesInvoiceEditPaymentMethod");if(payment){payment.value=r.paymentMethod||"";payment.disabled=r.sourceType!=="installation";payment.required=r.sourceType==="installation"}syncEditNoInvoice();$("salesInvoiceEditStatus").textContent="";$("salesInvoiceEditStatus").classList.add("hidden");$("salesInvoiceEditDialog")?.showModal()}
  function openAttachments(r){const box=$("appointmentAttachmentsList");$("appointmentAttachmentsTitle").textContent=t("invoices.attachments.title","المرفقات");$("appointmentAttachmentsSubtitle").textContent=`${r.requestNumber} — ${r.customerName}`;box.innerHTML=r.attachments?.length?r.attachments.map((f,i)=>`<div class="sales-invoice-attachment-item"><div><strong>${esc(f.fileKind==="collection"?t("invoices.attachments.collection","مرفق التحصيل"):t("invoices.attachments.execution","مرفق التنفيذ"))}</strong><small>${esc(f.originalName||`مرفق ${i+1}`)}</small></div><button class="secondary-btn compact-btn" type="button" data-open-execution-file="${esc(f.storagePath)}">${esc(t("invoices.attachments.open","فتح"))}</button></div>`).join(""):`<p class="empty-state">${esc(t("invoices.attachments.none","لا توجد مرفقات"))}</p>`;$("appointmentAttachmentsDialog")?.showModal()}
  async function load(){status(t("invoices.loading","جاري تحميل الفواتير..."));try{rows=await window.SalesInvoicesService.list();render();status("")}catch(e){status(e.message,"error")}}
  document.addEventListener("DOMContentLoaded",()=>{
    window.addEventListener("kyum-view-changed",e=>{if(e.detail?.view==="salesInvoices")load()});
    window.addEventListener("petatoe-language-changed",()=>{window.PetatoeLocalization?.applyStatic?.(document);render()});
    $("refreshSalesInvoicesBtn")?.addEventListener("click",load);
    ["salesInvoicesSearch","salesInvoicesSourceFilter","salesInvoicesStatusFilter","salesInvoicesDateFrom","salesInvoicesDateTo"].forEach(id=>$(id)?.addEventListener(id.includes("Search")?"input":"change",render));
    $("resetSalesInvoicesFilters")?.addEventListener("click",()=>{$("salesInvoicesSearch").value="";$("salesInvoicesSourceFilter").value="";$("salesInvoicesStatusFilter").value="";$("salesInvoicesDateFrom").value="";$("salesInvoicesDateTo").value="";render()});
    $("salesInvoicesTableBody")?.addEventListener("click",e=>{const edit=e.target.closest("[data-sales-invoice-edit]");if(edit){const r=rows.find(x=>x.id===edit.dataset.salesInvoiceEdit);if(r)openEdit(r);return}const att=e.target.closest("[data-sales-invoice-attachments]");if(att){const r=rows.find(x=>x.id===att.dataset.salesInvoiceAttachments);if(r)openAttachments(r)}});
    $("salesInvoiceEditNoInvoice")?.addEventListener("change",syncEditNoInvoice);
    $("closeSalesInvoiceEditDialog")?.addEventListener("click",()=>$("salesInvoiceEditDialog")?.close());
    $("cancelSalesInvoiceEdit")?.addEventListener("click",()=>$("salesInvoiceEditDialog")?.close());
    $("salesInvoiceEditForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!editingInvoice)return;const btn=$("saveSalesInvoiceEdit");btn.disabled=true;try{const withoutInvoice=Boolean($("salesInvoiceEditNoInvoice").checked),invoiceNumber=$("salesInvoiceEditNumber").value.trim(),invoiceDate=$("salesInvoiceEditDate").value,paymentMethod=$("salesInvoiceEditPaymentMethod")?.value||"";if(!withoutInvoice&&!invoiceNumber)throw new Error(t("invoices.edit.numberValidation","رقم الفاتورة مطلوب أو اختر بدون فاتورة."));if(editingInvoice.sourceType==="installation"&&!paymentMethod)throw new Error("اختر طريقة الدفع.");await window.SalesInvoicesService.updateInvoice({id:editingInvoice.id,invoiceNumber,invoiceDate,withoutInvoice,paymentMethod,sourceType:editingInvoice.sourceType});$("salesInvoiceEditDialog").close();await load()}catch(err){const el=$("salesInvoiceEditStatus");el.textContent=err.message;el.classList.remove("hidden");el.classList.add("error")}finally{btn.disabled=false}});
    $("closeAppointmentAttachmentsDialog")?.addEventListener("click",()=>$("appointmentAttachmentsDialog")?.close());
    $("appointmentAttachmentsList")?.addEventListener("click",async e=>{const b=e.target.closest("[data-open-execution-file]");if(!b)return;b.disabled=true;try{const url=await window.InstallationsServiceSafe.signedFileUrl(b.dataset.openExecutionFile);window.open(url,"_blank","noopener,noreferrer")}catch(err){status(err.message,"error")}finally{b.disabled=false}});
  });
})();
