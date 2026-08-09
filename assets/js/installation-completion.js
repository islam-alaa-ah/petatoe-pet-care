(()=>{
  "use strict";
  let rows=[];
  let current=null;
  let mode="installation";
  let quantityCurrent=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>new Intl.NumberFormat("ar-SA-u-nu-latn",{style:"currency",currency:"SAR",minimumFractionDigits:2}).format(Number(v||0));
  function status(el,msg,type=""){if(!el)return;el.textContent=msg||"";el.classList.toggle("hidden",!msg);el.classList.toggle("error",type==="error")}
  function date(v){return v?new Date(v).toLocaleString("ar-SA",{calendar:"gregory",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}
  function today(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
  function reps(){const map=new Map();rows.forEach(r=>{if(r.representativeId)map.set(r.representativeId,r.representativeName||"مندوب غير محدد")});return [...map].sort((a,b)=>a[1].localeCompare(b[1],"ar"))}
  function fillReps(){const el=$("installationCompletionRepresentativeFilter");if(!el)return;const val=el.value;el.innerHTML='<option value="">كل المندوبين المسموحين</option>'+reps().map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join("");el.value=[...el.options].some(o=>o.value===val)?val:""}
  function filtered(){const q=($("installationCompletionSearch")?.value||"").trim().toLowerCase(),rep=$("installationCompletionRepresentativeFilter")?.value||"",from=$("installationCompletionDateFrom")?.value||"",to=$("installationCompletionDateTo")?.value||"";return rows.filter(r=>(!q||[r.requestNumber,r.customerName,r.customerPhone,r.technicianName].join(" ").toLowerCase().includes(q))&&(!rep||r.representativeId===rep)&&(!from||String(r.completedAt).slice(0,10)>=from)&&(!to||String(r.completedAt).slice(0,10)<=to))}
  function can(action,screen){return Boolean(window.CustomerPermissions?.canAction?.(screen,action))}
  function isSuperAdmin(){return window.CustomerPermissions?.currentRole?.()==="super_admin"}
  function render(){
    const list=filtered(),body=$("installationCompletionTableBody");
    $("installationCompletionKpiCompleted").textContent=rows.length;
    $("installationCompletionKpiReports").textContent=rows.filter(r=>r.report).length;
    $("installationCompletionKpiPending").textContent=rows.filter(r=>!r.report).length;
    $("installationCompletionKpiPhotos").textContent=rows.reduce((n,r)=>n+r.files.filter(f=>["before","after","delivery_authorization"].includes(f.file_kind)).length,0);
    body.innerHTML=list.length?list.map(r=>{
      let actions='';
      if(r.confirmedHistory){
        const summary=`<span class="field-hint">زيارة منفذة محفوظة — ${r.quantities?.map(q=>`${esc(q.serviceName)}: ${Number(q.executedQuantity||0)}`).join("، ")||"تم الاعتماد"}</span>`;
        const invoice=can("add","salesInvoices")?`<button class="primary-btn" type="button" data-installation-completion="${esc(r.rowKey||r.id)}">تحويل إلى فاتورة</button>`:`<span class="field-hint">لا توجد صلاحية إضافة فاتورة</span>`;
        const cancel=isSuperAdmin()?`<button class="secondary-btn installation-cancel-confirmed-quantity" type="button" data-cancel-confirmed-quantity="${esc(r.rowKey||r.id)}">إلغاء الكمية المنفذة</button>`:'';
        actions=`${summary}${invoice}${cancel}`;
      }else if(can("edit","installationCompletion")){
        actions=r.quantityConfirmed?(can("add","salesInvoices")?`<button class="primary-btn" type="button" data-installation-completion="${esc(r.rowKey||r.id)}">تحويل إلى فاتورة</button>`:`<span class="field-hint">لا توجد صلاحية إضافة فاتورة</span>`):`<button class="primary-btn" type="button" data-confirm-installation-quantity="${esc(r.rowKey||r.id)}">تأكيد الكمية المنفذة</button>`;
      }else actions='<span class="field-hint">لا توجد صلاحية تأكيد</span>';
      return `<tr><td data-label="رقم الطلب"><strong>${esc(r.executionNumber||r.requestNumber)}</strong></td><td data-label="العميل">${esc(r.customerName||"—")}</td><td data-label="رقم العميل" dir="ltr">${esc(r.customerPhone||"—")}</td><td data-label="المندوب">${esc(r.representativeName||"—")}</td><td data-label="الفني">${esc(r.technicianName||"—")}</td><td data-label="الفرقة">${esc(r.teamName||"—")}</td><td data-label="تاريخ الإكمال">${esc(date(r.completedAt))}</td><td data-label="الحالة"><span class="installation-doc-status is-pending">${r.confirmedHistory?"تم تأكيد الكمية":(r.quantityConfirmed?"جاهز للتحويل":"بانتظار تأكيد التنفيذ")}</span></td><td data-label="الإجراءات"><div class="installation-completion-actions">${actions}</div></td></tr>`;
    }).join(""):'<tr class="installation-completion-empty-row"><td colspan="9"><div class="empty-state">لا توجد مواعيد مكتملة بانتظار التحويل إلى فاتورة.</div></td></tr>';
  }
  async function load(){status($("installationCompletionStatus"),"جاري تحميل المواعيد المكتملة...");try{rows=await window.InstallationsServiceSafe.completionList();fillReps();render();status($("installationCompletionStatus"),"")}catch(e){status($("installationCompletionStatus"),e.message,"error")}}
  function setMode(next){
    mode=next;
    const fullInstallation=mode==="installation";
    const visitInvoice=mode==="installationVisit";
    const installation=fullInstallation||visitInvoice;
    $("installationCompletionDialogTitle").textContent=visitInvoice?"تحويل الكمية المنفذة إلى فاتورة":"تحويل إلى فاتورة";
    $("installationCompletionWorkSection").classList.toggle("hidden",!fullInstallation);
    $("installationEvidenceSection").classList.toggle("hidden",!fullInstallation);
    $("installationCompletionExistingFiles").classList.toggle("hidden",!fullInstallation);
    $("printInstallationCompletion").classList.add("hidden");
    $("installationCompletionWorkSummary").required=fullInstallation;
    $("installationCompletionRecipientName").required=fullInstallation;
    $("installationCompletionDeliveryAuthorization").required=false;
    $("saveInstallationCompletion").textContent=visitInvoice?"تحويل الكمية المنفذة إلى فاتورة":(installation?"حفظ وتحويل إلى فاتورة":"إنشاء الفاتورة");
  }
  async function showFiles(r){const box=$("installationCompletionExistingFiles");const labels={before:"قبل الموعد",after:"بعد الموعد",delivery_authorization:"إذن تسليم العميل",signature:"توقيع عميل قديم"};box.innerHTML=r.files?.length?r.files.map(f=>`<div class="installation-existing-file"><strong>${esc(labels[f.file_kind]||"مرفق")}</strong><small>${esc(f.original_name||"مرفق")}</small><button class="secondary-btn" type="button" data-open-installation-file="${esc(f.storage_path)}">فتح</button></div>`).join(""):"<p>لا توجد مرفقات محفوظة.</p>"}

  function quantityLineHtml(x){
    const scheduled=Number(x.scheduledCurrentQuantity||x.remainingQuantity||0);
    return `<article class="installation-quantity-line" data-service-line="${esc(x.requestServiceId)}">
      <div class="installation-quantity-line-head"><strong>${esc(x.serviceName)}</strong><span>${money(x.unitPrice)} للوحدة</span></div>
      <div class="installation-quantity-metrics">
        <span>المطلوب <b>${x.requestedQuantity}</b></span>
        <span>المجدول للزيارة <b>${scheduled}</b></span>
        <span>منفذ سابقًا <b>${x.executedQuantity}</b></span>
        <span>المتبقي قبل التأكيد <b>${x.remainingQuantity}</b></span>
      </div>
      <label>الكمية المنفذة في الزيارة الحالية
        <input class="installation-confirmed-qty" type="number" min="0" max="${x.remainingQuantity}" step="1" value="${Math.min(scheduled,x.remainingQuantity)}" data-request-service-id="${esc(x.requestServiceId)}" data-scheduled="${scheduled}" data-remaining="${x.remainingQuantity}">
      </label>
      <small class="installation-quantity-result"></small>
    </article>`;
  }
  function quantityDecision(){
    let remaining=0,mismatch=false,shortfall=0;
    document.querySelectorAll(".installation-confirmed-qty").forEach(input=>{
      const max=Number(input.dataset.remaining||0),scheduled=Number(input.dataset.scheduled||0),value=Math.max(0,Number(input.value||0));
      const after=Math.max(max-value,0);
      remaining+=after;
      if(value!==scheduled)mismatch=true;
      shortfall+=Math.max(scheduled-value,0);
      input.closest(".installation-quantity-line")?.querySelector(".installation-quantity-result")?.replaceChildren(document.createTextNode(`المتبقي بعد الاعتماد: ${after}`));
    });
    return {remaining,mismatch,shortfall};
  }
  function fillRemainingActions(decision){
    const select=$("installationQuantityRemainingAction");if(!select)return;
    const next=quantityCurrent?.nextScheduledVisit||null;
    if(decision.remaining<=0){select.innerHTML='<option value="completed">تم تنفيذ كامل الكمية</option>';select.value="completed";return;}
    if(!decision.mismatch&&next){select.innerHTML='<option value="preserve_existing">الموعد المجدول التالي مستمر كما هو</option>';select.value="preserve_existing";return;}
    let html='';
    if(next)html+=`<option value="append_to_next_visit">إضافة فرق الكمية إلى الموعد المجدول ${esc(next.scheduledDate)} ${esc(next.scheduledTime)}</option>`;
    html+='<option value="return_to_schedule">إعادة فرق الكمية إلى شاشة الجدولة</option>';
    select.innerHTML=html;select.value=next?"append_to_next_visit":"return_to_schedule";
  }
  function syncQuantityResults(){
    const decision=quantityDecision();
    $("installationQuantityRemainingTotal").textContent=String(decision.remaining);
    fillRemainingActions(decision);
    const next=quantityCurrent?.nextScheduledVisit||null;
    const requiresChoice=decision.remaining>0&&(decision.mismatch||!next);
    $("installationQuantityRemainingActionWrap").classList.toggle("hidden",!requiresChoice);
    const note=$("installationQuantityScheduleLaterNote");
    if(note){note.classList.toggle("hidden",requiresChoice||decision.remaining<=0);note.textContent=decision.remaining>0&&next?`سيظل الموعد التالي ${next.scheduledDate} ${next.scheduledTime} كما هو لأن الكمية المنفذة مطابقة للكمية المجدولة لهذه الزيارة.`:"";}
    syncQuantityAction();
  }
  function syncQuantityAction(){
    const action=$("installationQuantityRemainingAction")?.value||"completed";
    $("installationQuantityRescheduleFields")?.classList.add("hidden");
    const note=$("installationQuantityScheduleLaterNote");
    if(note&&action==="return_to_schedule"){note.classList.remove("hidden");note.textContent="سيتم إعادة فرق الكمية فقط إلى شاشة الجدولة، مع الحفاظ على أي موعد مجدول مسبقًا لنفس الطلب.";}
    else if(note&&action==="append_to_next_visit"){const next=quantityCurrent?.nextScheduledVisit;note.classList.remove("hidden");note.textContent=next?`سيتم إضافة فرق الكمية إلى الموعد المجدول ${next.scheduledDate} ${next.scheduledTime} لنفس الطلب.`:"";}
  }
  function requireQuantityDialog(){
    const ids=[
      "installationQuantityConfirmationDialog","installationQuantityConfirmationForm","installationQuantityRequestLabel",
      "installationQuantityLines","installationQuantityRemainingTotal","installationQuantityRemainingActionWrap",
      "installationQuantityRemainingAction","installationQuantityRescheduleDate","installationQuantityRescheduleTime",
      "installationQuantityConfirmationNotes","installationQuantityConfirmationStatus","saveInstallationQuantityConfirmation"
    ];
    const missing=ids.filter(id=>!$(id));
    if(missing.length)throw new Error(`تعذر فتح نافذة تأكيد الكمية: عناصر الواجهة غير مكتملة (${missing.join(", ")}).`);
  }
  async function openQuantityConfirmation(r){
    if(!can("edit","installationCompletion"))return;
    requireQuantityDialog();
    quantityCurrent=r;
    $("installationQuantityRequestLabel").textContent=`${r.executionNumber||r.requestNumber} — ${r.customerName}`;
    $("installationQuantityLines").innerHTML=(r.quantities||[]).map(quantityLineHtml).join("")||'<p class="empty-state">لا توجد خدمات قابلة للتأكيد.</p>';
    $("installationQuantityRemainingAction").value="return_to_schedule";
    $("installationQuantityRescheduleDate").value=today();
    $("installationQuantityRescheduleTime").value="10:00";
    if($("installationQuantityRescheduleTeam"))$("installationQuantityRescheduleTeam").value=r.teamId||"";
    if($("installationQuantityRescheduleTechnician"))$("installationQuantityRescheduleTechnician").value=r.technicianName||"";
    $("installationQuantityConfirmationNotes").value="";
    status($("installationQuantityConfirmationStatus"),"");
    syncQuantityResults();
    $("installationQuantityConfirmationDialog").showModal();
  }

  function openInstallation(r){if(!can("add","salesInvoices")){alert("لا توجد صلاحية تحويل الموعد إلى فاتورة.");return}if(!r.confirmedHistory&&!can("edit","installationCompletion")){alert("لا توجد صلاحية تحويل الموعد إلى فاتورة.");return}setMode(r.confirmedHistory&&r.visitId?"installationVisit":"installation");current=r;$("installationCompletionRequestId").value=r.id;$("installationCompletionRequestLabel").textContent=`${r.requestNumber} — ${r.customerName}`;$("installationCompletionCustomer").textContent=r.customerName||"—";$("installationCompletionTechnician").textContent=r.technicianName||"—";$("installationCompletionDate").textContent=date(r.completedAt);$("installationCompletionAddress").textContent=r.installationAddress||"—";$("installationCompletionWorkSummary").value=r.report?.work_summary||"";$("installationCompletionRecipientName").value=r.report?.recipient_name||"";$("installationCompletionCustomerOrderNumber").value=r.customerOrderNumber||r.requestNumber||"";$("installationCompletionInvoiceNumber").value=r.report?.invoice_number||"";$("installationCompletionInvoiceDate").value=r.report?.invoice_date||today();$("installationCompletionInvoiceAmount").value=Number(r.invoiceAmount||0).toFixed(2);$("installationCompletionInstallationExpenses").value=Number(r.installationExpenses||0).toFixed(2);$("installationCompletionBeforePhotos").value="";$("installationCompletionAfterPhotos").value="";$("installationCompletionDeliveryAuthorization").value="";showFiles(r);status($("installationCompletionFormStatus"),"");$("installationCompletionDialog").showModal()}
  function openQuotation(q){if(!can("add","salesInvoices")){alert("لا توجد صلاحية إضافة فواتير المبيعات.");return}setMode("quotation");current=q;$("installationCompletionRequestId").value=q.quotationId;$("installationCompletionRequestLabel").textContent=`${q.quotationCode||q.requestNumber} — ${q.customerName}`;$("installationCompletionCustomer").textContent=q.customerName||"—";$("installationCompletionTechnician").textContent="لا ينطبق";$("installationCompletionDate").textContent="عقد مباشر";$("installationCompletionAddress").textContent=q.customerPhone||"—";$("installationCompletionWorkSummary").value="";$("installationCompletionRecipientName").value="";$("installationCompletionCustomerOrderNumber").value=q.requestNumber||q.quotationCode||"";$("installationCompletionInvoiceNumber").value="";$("installationCompletionInvoiceDate").value=today();$("installationCompletionInvoiceAmount").value=Number(q.invoiceAmount||0).toFixed(2);$("installationCompletionInstallationExpenses").value="0.00";status($("installationCompletionFormStatus"),"");$("installationCompletionDialog").showModal()}
  document.addEventListener("DOMContentLoaded",()=>{
    window.addEventListener("kyum-view-changed",e=>{if(e.detail?.view==="installationCompletion")load()});
    window.addEventListener("kyum-open-unified-invoice-conversion",e=>{if(e.detail?.sourceType==="quotation")openQuotation(e.detail)});
    $("refreshInstallationCompletionBtn")?.addEventListener("click",load);
    ["installationCompletionSearch","installationCompletionRepresentativeFilter","installationCompletionDateFrom","installationCompletionDateTo"].forEach(id=>$(id)?.addEventListener(id.includes("Search")?"input":"change",render));
    $("resetInstallationCompletionFilters")?.addEventListener("click",()=>{$("installationCompletionSearch").value="";$("installationCompletionRepresentativeFilter").value="";$("installationCompletionDateFrom").value="";$("installationCompletionDateTo").value="";render()});
    $("installationCompletionTableBody")?.addEventListener("click",e=>{
      const confirmBtn=e.target.closest("[data-confirm-installation-quantity]");
      if(confirmBtn){
        const r=rows.find(x=>(x.rowKey||x.id)===confirmBtn.dataset.confirmInstallationQuantity);
        if(r){
          openQuantityConfirmation(r).catch(err=>{
            status($("installationCompletionStatus"),err?.message||"تعذر فتح تأكيد الكمية المنفذة.","error");
          });
        }
        return;
      }
      const cancelBtn=e.target.closest("[data-cancel-confirmed-quantity]");
      if(cancelBtn){
        const r=rows.find(x=>(x.rowKey||x.id)===cancelBtn.dataset.cancelConfirmedQuantity);
        if(!r)return;
        if(!isSuperAdmin()){status($("installationCompletionStatus"),"إلغاء الكمية المنفذة متاح لمدير النظام فقط.","error");return;}
        if(!window.confirm(`سيتم إلغاء اعتماد الكمية المنفذة للزيارة ${r.executionNumber||r.requestNumber} وإعادتها لانتظار التأكيد. هل تريد المتابعة؟`))return;
        const reason=window.prompt("سبب إلغاء تأكيد الكمية المنفذة (اختياري):","")||"";
        cancelBtn.disabled=true;
        window.InstallationsServiceSafe.cancelConfirmedQuantity({id:r.id,visitId:r.visitId,reason}).then(()=>load()).catch(err=>status($("installationCompletionStatus"),err.message,"error")).finally(()=>{cancelBtn.disabled=false});
        return;
      }
      const b=e.target.closest("[data-installation-completion]");
      if(b){const r=rows.find(x=>(x.rowKey||x.id)===b.dataset.installationCompletion);if(r)openInstallation(r)}
    });
    $("installationCompletionExistingFiles")?.addEventListener("click",async e=>{const b=e.target.closest("[data-open-installation-file]");if(!b)return;b.disabled=true;try{const url=await window.InstallationsServiceSafe.signedFileUrl(b.dataset.openInstallationFile);window.open(url,"_blank","noopener,noreferrer")}catch(err){status($("installationCompletionFormStatus"),err.message,"error")}finally{b.disabled=false}});
    $("installationQuantityLines")?.addEventListener("input",e=>{if(e.target.matches(".installation-confirmed-qty"))syncQuantityResults()});
    $("installationQuantityRemainingAction")?.addEventListener("change",syncQuantityAction);
    $("closeInstallationQuantityConfirmation")?.addEventListener("click",()=>$("installationQuantityConfirmationDialog").close());
    $("cancelInstallationQuantityConfirmation")?.addEventListener("click",()=>$("installationQuantityConfirmationDialog").close());
    $("installationQuantityConfirmationForm")?.addEventListener("submit",async e=>{
      e.preventDefault();
      if(!quantityCurrent)return;
      const btn=$("saveInstallationQuantityConfirmation");
      btn.disabled=true;
      try{
        const lines=[...document.querySelectorAll(".installation-confirmed-qty")].map(input=>({
          requestServiceId:input.dataset.requestServiceId,
          scheduledQuantity:Number(input.dataset.scheduled||0),
          executedQuantity:Number(input.value||0)
        }));
        if(!lines.length)throw new Error("لا توجد خدمات لاعتمادها.");
        lines.forEach(x=>{const source=quantityCurrent.quantities.find(q=>q.requestServiceId===x.requestServiceId);if(x.executedQuantity<0||x.executedQuantity>Number(source?.remainingQuantity||0))throw new Error("الكمية المنفذة يجب ألا تتجاوز المتبقي من الطلب.");});
        const remaining=lines.reduce((n,x)=>{const source=quantityCurrent.quantities.find(q=>q.requestServiceId===x.requestServiceId);return n+Math.max(Number(source?.remainingQuantity||0)-x.executedQuantity,0)},0);
        const decision=quantityDecision();
        let action=remaining===0?"completed":($("installationQuantityRemainingAction")?.value||"return_to_schedule");
        if(remaining>0&&!decision.mismatch&&quantityCurrent.nextScheduledVisit)action="preserve_existing";
        let schedule=null;
        status($("installationQuantityConfirmationStatus"),"جاري اعتماد التنفيذ الفعلي...");
        await window.InstallationsServiceSafe.confirmActualQuantities({
          id:quantityCurrent.id,visitId:quantityCurrent.visitId||null,lines,remainingAction:action,schedule,
          notes:$("installationQuantityConfirmationNotes").value.trim()
        });
        $("installationQuantityConfirmationDialog").close();
        await load();
        window.dispatchEvent(new CustomEvent("kyum-installation-quantities-confirmed",{detail:{requestId:quantityCurrent.id,action}}));
      }catch(err){status($("installationQuantityConfirmationStatus"),err.message,"error")}
      finally{btn.disabled=false}
    });

    $("closeInstallationCompletionDialog")?.addEventListener("click",()=>$("installationCompletionDialog").close());
    $("cancelInstallationCompletion")?.addEventListener("click",()=>$("installationCompletionDialog").close());
    $("installationCompletionInvoiceNumber")?.addEventListener("input",e=>{e.target.value=e.target.value.replace(/\D/g,"").slice(0,9)});
    $("installationCompletionForm")?.addEventListener("submit",async e=>{e.preventDefault();const btn=$("saveInstallationCompletion");btn.disabled=true;try{const invoiceNumber=$("installationCompletionInvoiceNumber").value.trim(),invoiceDate=$("installationCompletionInvoiceDate").value;if(!/^\d{9}$/.test(invoiceNumber))throw new Error("رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");status($("installationCompletionFormStatus"),"جاري حفظ الفاتورة...");if(mode==="quotation"){await window.SalesInvoicesService.createFromQuotation({quotationId:current.quotationId,invoiceNumber,invoiceDate});await window.QuotationsService?.invalidateCache?.();window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"quotation"}}))}else if(mode==="installationVisit"){await window.SalesInvoicesService.createFromInstallationVisit({installationRequestId:current.id,visitId:current.visitId,invoiceNumber,invoiceDate});window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"installation",requestId:current.id,visitId:current.visitId}}))}else{const deliveryFile=$("installationCompletionDeliveryAuthorization").files[0]||null,before=[...$("installationCompletionBeforePhotos").files],after=[...$("installationCompletionAfterPhotos").files],hasStoredDelivery=current.files.some(f=>f.file_kind==="delivery_authorization");if(before.length+after.length>12)throw new Error("الحد الأقصى 12 صورة لكل عملية.");if(!deliveryFile&&!hasStoredDelivery)throw new Error("صورة إذن تسليم العميل مطلوبة لإتمام التحويل.");await window.InstallationsServiceSafe.saveCompletion({id:current.id,workSummary:$("installationCompletionWorkSummary").value.trim(),recipientName:$("installationCompletionRecipientName").value.trim(),invoiceNumber,invoiceDate,beforePhotos:before,afterPhotos:after,deliveryAuthorizationFile:deliveryFile})}$("installationCompletionDialog").close();window.KYUMNavigation?.open?.("salesInvoices",{trustedNavigation:true});if(mode==="installation"||mode==="installationVisit")await load()}catch(err){status($("installationCompletionFormStatus"),err.message,"error")}finally{btn.disabled=false}});
  });
})();
