(()=>{
  "use strict";
  let rows=[];
  let current=null;
  let mode="installation";
  let quantityCurrent=null;
  let quantityDetail=null;
  let quantityOptions={serviceTypes:[]};
  let quantityWorkspaceDirty=false;
  let quantityCollectionRecoveryState=null;
  const $=id=>document.getElementById(id);
  const t=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback};
  const lang=()=>window.PetatoeLocalization?.effectiveLanguage?.()==="en"?"en":"ar";
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>new Intl.NumberFormat(lang()==="en"?"en-US-u-nu-latn":"ar-SA-u-nu-latn",{style:"currency",currency:"SAR",minimumFractionDigits:2}).format(Number(v||0));
  function status(el,msg,type=""){if(!el)return;el.textContent=msg||"";el.classList.toggle("hidden",!msg);el.classList.toggle("error",type==="error")}
  function date(v){return v?new Date(v).toLocaleString(lang()==="en"?"en-US-u-nu-latn":"ar-SA-u-nu-latn",{calendar:"gregory",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}
  function today(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
  const moneyCents=v=>Math.round((Number(v)||0)*100);
  function reps(){const map=new Map();rows.forEach(r=>{if(r.representativeId)map.set(r.representativeId,r.representativeName||"مندوب غير محدد")});return [...map].sort((a,b)=>a[1].localeCompare(b[1],"ar"))}
  function fillReps(){const el=$("installationCompletionRepresentativeFilter");if(!el)return;const val=el.value;el.innerHTML=`<option value="">${esc(t('appointments.completion.allAllowedReps','كل المندوبين المسموحين'))}</option>`+reps().map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join("");el.value=[...el.options].some(o=>o.value===val)?val:""}
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
        const invoice=can("add","salesInvoices")?`<button class="primary-btn" type="button" data-installation-completion="${esc(r.rowKey||r.id)}">${esc(t("appointments.completion.toInvoice","تحويل إلى فاتورة"))}</button>`:`<span class="field-hint">${esc(t("appointments.completion.noInvoicePermission","لا توجد صلاحية إضافة فاتورة"))}</span>`;
        const cancel=isSuperAdmin()?`<button class="secondary-btn installation-cancel-confirmed-quantity" type="button" data-cancel-confirmed-quantity="${esc(r.rowKey||r.id)}">إلغاء الكمية المنفذة</button>`:'';
        actions=`${invoice}${cancel}`;
      }else if(can("edit","installationCompletion")){
        actions=r.quantityConfirmed?(can("add","salesInvoices")?`<button class="primary-btn" type="button" data-installation-completion="${esc(r.rowKey||r.id)}">${esc(t("appointments.completion.toInvoice","تحويل إلى فاتورة"))}</button>`:`<span class="field-hint">${esc(t("appointments.completion.noInvoicePermission","لا توجد صلاحية إضافة فاتورة"))}</span>`):`<button class="primary-btn" type="button" data-confirm-installation-quantity="${esc(r.rowKey||r.id)}">${esc(t("appointments.completion.confirmQty","تأكيد الكمية المنفذة"))}</button>`;
      }else actions=`<span class="field-hint">${esc(t('appointments.completion.noConfirmPermission','لا توجد صلاحية تأكيد'))}</span>`;
      return `<tr><td data-label="${esc(t('appointments.col.number','رقم الطلب'))}"><strong>${esc(r.executionNumber||r.requestNumber)}</strong></td><td data-label="${esc(t('appointments.col.customer','العميل'))}">${esc(r.customerName||"—")}</td><td data-label="${esc(t('appointments.col.customerNumber','رقم العميل'))}" dir="ltr">${esc(r.customerPhone||"—")}</td><td data-label="${esc(t('appointments.col.team','الفرقة'))}">${esc(r.teamName||"—")}</td><td data-label="${esc(t('appointments.completion.requestDate','تاريخ الطلب'))}">${esc(date(r.requestCreatedAt))}</td><td data-label="${esc(t('invoices.attachments.title','المرفقات'))}">${completionAttachments(r).length?`<button class="secondary-btn compact-btn" type="button" data-completion-attachments="${esc(r.rowKey||r.id)}">${esc(t('invoices.attachments.view','عرض المرفقات'))} (${completionAttachments(r).length})</button>`:`<span class="field-hint">${esc(t('invoices.attachments.none','لا توجد مرفقات'))}</span>`}</td><td data-label="${esc(t('appointments.completion.transferStatus','حالة التحويل'))}"><span class="installation-doc-status is-pending">${r.confirmedHistory?"تم تأكيد الكمية":(r.quantityConfirmed?"جاهز للتحويل":"بانتظار تأكيد التنفيذ")}</span></td><td data-label="${esc(t('appointments.col.actions','الإجراءات'))}"><div class="installation-completion-actions">${actions}</div></td></tr>`;
    }).join(""):`<tr class="installation-completion-empty-row"><td colspan="8"><div class="empty-state">${esc(t('appointments.completion.empty','لا توجد مواعيد مكتملة بانتظار التحويل إلى فاتورة.'))}</div></td></tr>`;
  }
  async function load(){status($("installationCompletionStatus"),t('appointments.completion.loading','جاري تحميل المواعيد المكتملة...'));try{rows=await window.InstallationsServiceSafe.completionList();fillReps();render();status($("installationCompletionStatus"),"")}catch(e){status($("installationCompletionStatus"),e.message,"error")}}
  function removeInvoicedRowsFromLocalState(detail={}){
    if(detail?.sourceType!=="installation")return;
    const requestId=String(detail.requestId||""),visitId=String(detail.visitId||"");
    if(!requestId)return;
    rows=rows.filter(r=>{
      if(String(r.id)!==requestId)return true;
      if(!visitId)return false;
      const ids=[r.visitId,...(r.groupVisitIds||[])].filter(Boolean).map(String);
      return !ids.includes(visitId);
    });
    fillReps();
    render();
  }
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
    $("installationCompletionNoInvoiceWrap")?.classList.toggle("hidden",!visitInvoice);
    if(!visitInvoice){const noInv=$("installationCompletionNoInvoice");if(noInv)noInv.checked=false;syncCompletionNoInvoiceOption()}
    $("saveInstallationCompletion").textContent=visitInvoice?"تحويل الكمية المنفذة إلى فاتورة":(installation?"حفظ وتحويل إلى فاتورة":"إنشاء الفاتورة");
  }
  async function showFiles(r){const box=$("installationCompletionExistingFiles");const labels={before:"قبل الموعد",after:"بعد الموعد",delivery_authorization:"إذن تسليم العميل",signature:"توقيع عميل قديم"};box.innerHTML=r.files?.length?r.files.map(f=>`<div class="installation-existing-file"><strong>${esc(labels[f.file_kind]||"مرفق")}</strong><small>${esc(f.original_name||"مرفق")}</small><button class="secondary-btn" type="button" data-open-installation-file="${esc(f.storage_path)}">فتح</button></div>`).join(""):"<p>لا توجد مرفقات محفوظة.</p>"}
  function completionAttachments(r){const visitIds=new Set((r.groupVisitIds?.length?r.groupVisitIds:[r.visitId]).filter(Boolean).map(String));return (r.executionFiles||[]).filter(f=>!f.visitId||!visitIds.size||visitIds.has(String(f.visitId)))}
  function openCompletionAttachments(r){const files=completionAttachments(r),box=$("appointmentAttachmentsList");$("appointmentAttachmentsTitle").textContent=t('invoices.attachments.title','المرفقات');$("appointmentAttachmentsSubtitle").textContent=`${r.executionNumber||r.requestNumber} — ${r.customerName||''}`;box.innerHTML=files.length?files.map((f,i)=>`<div class="sales-invoice-attachment-item"><div><strong>${esc(String(f.fileKind||'')==='collection'?t('invoices.attachments.collection','مرفق التحصيل'):t('invoices.attachments.execution','مرفق التنفيذ'))}</strong><small>${esc(f.originalName||`مرفق ${i+1}`)}</small></div><button class="secondary-btn compact-btn" type="button" data-open-execution-file="${esc(f.storagePath)}">${esc(t('invoices.attachments.open','فتح'))}</button></div>`).join(''):`<p class="empty-state">${esc(t('invoices.attachments.none','لا توجد مرفقات'))}</p>`;$("appointmentAttachmentsDialog")?.showModal()}
  function syncCompletionNoInvoiceOption(){const checkbox=$("installationCompletionNoInvoice"),input=$("installationCompletionInvoiceNumber");if(!checkbox||!input)return;const checked=Boolean(checkbox.checked);input.disabled=checked;input.required=!checked;if(checked)input.value=''}

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
        <input class="installation-confirmed-qty" type="text" inputmode="numeric" lang="en" dir="ltr" value="${Math.min(scheduled,x.remainingQuantity)}" data-request-service-id="${esc(x.requestServiceId)}" data-scheduled="${scheduled}" data-remaining="${x.remainingQuantity}">
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
  const latinDigits=v=>String(v??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  function normalizeNumericInput(input,{integer=false}={}){if(!input)return '';let value=latinDigits(input.value);if(integer)value=value.replace(/[^0-9]/g,'');else{value=value.replace(/[^0-9.]/g,'');const dot=value.indexOf('.');if(dot>=0)value=value.slice(0,dot+1)+value.slice(dot+1).replace(/\./g,'')}if(input.value!==value)input.value=value;return value}
  function serviceTypeOptions(selected=''){return '<option value="">اختر الخدمة</option>'+quantityOptions.serviceTypes.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selected)?'selected':''}>${esc(x.name)}</option>`).join('')}
  function serviceEditorRowHtml(service={}){return `<tr class="installation-confirmation-service-row">
    <td><select class="installation-confirmation-service-type" required>${serviceTypeOptions(service.serviceTypeId||'')}</select></td>
    <td><input class="installation-confirmation-service-qty" type="text" inputmode="numeric" lang="en" dir="ltr" value="${Math.max(1,Number(service.quantity||1))}"></td>
    <td><input class="installation-confirmation-service-price" type="text" inputmode="decimal" lang="en" dir="ltr" value="${Number(service.unitPrice||0).toFixed(2)}"></td>
    <td><output class="installation-confirmation-service-total">${money(Number(service.quantity||1)*Number(service.unitPrice||0))}</output></td>
    <td><button class="danger-btn installation-confirmation-service-remove" type="button">حذف</button></td>
  </tr>`}
  function collectWorkspaceServices(){return [...document.querySelectorAll('.installation-confirmation-service-row')].map(row=>({serviceTypeId:row.querySelector('.installation-confirmation-service-type')?.value||'',quantity:Number(row.querySelector('.installation-confirmation-service-qty')?.value||0),unitPrice:Number(row.querySelector('.installation-confirmation-service-price')?.value||0)}))}
  function workspaceFinancials(){const services=collectWorkspaceServices();const subtotal=Math.round(services.reduce((n,x)=>n+Math.max(0,x.quantity)*Math.max(0,x.unitPrice),0)*100)/100;const discount=Math.min(Math.max(0,Number($('installationQuantityDiscountAmount')?.value||0)),subtotal);const taxable=Math.max(subtotal-discount,0);const tax=Math.round(taxable*.15*100)/100;const final=Math.round((taxable+tax)*100)/100;return {subtotal,discount,tax,final}}
  function syncWorkspaceFinancials(){document.querySelectorAll('.installation-confirmation-service-row').forEach(row=>{const qty=Math.max(0,Number(row.querySelector('.installation-confirmation-service-qty')?.value||0)),price=Math.max(0,Number(row.querySelector('.installation-confirmation-service-price')?.value||0));const out=row.querySelector('.installation-confirmation-service-total');if(out)out.textContent=money(qty*price)});const f=workspaceFinancials();$('installationQuantitySubtotal').textContent=money(f.subtotal);$('installationQuantityTaxAmount').textContent=money(f.tax);$('installationQuantityFinalAmount').textContent=money(f.final);const amount=Math.max(0,Number($('installationQuantityAmountCollected')?.value||0));$('installationQuantityCollectionStatus').value=moneyCents(amount)<=0?'غير محصل':(moneyCents(amount)>=moneyCents(f.final)?'محصل بالكامل':'محصل جزئيًا');quantityWorkspaceDirty=true;return f}
  function syncNoInvoiceOption(){
    const checkbox=$("installationQuantityNoInvoice"),invoice=$("installationQuantityInvoiceNumber"),payment=$("installationQuantityPaymentMethod");
    if(!checkbox||!invoice||!payment)return;
    if(checkbox.checked){
      invoice.value="";
      invoice.disabled=true;
      payment.value="نقدي";
      payment.disabled=true;
    }else{
      invoice.disabled=false;
      payment.disabled=false;
    }
  }
  function renderWorkspace(detail){quantityDetail=detail;const body=$('installationQuantityServiceEditorBody');body.innerHTML=(detail.services||[]).map(serviceEditorRowHtml).join('')||serviceEditorRowHtml();$('installationQuantityDiscountAmount').value=Number(detail.discountAmount||0).toFixed(2);$('installationQuantityAmountCollected').value=Number(detail.collection?.amountCollected||0).toFixed(2);$('installationQuantityPaymentMethod').value=detail.collection?.paymentMethod||'';$('installationQuantityInvoiceNumber').value=detail.collection?.invoiceNumber||'';$('installationQuantityInvoiceDate').value=detail.collection?.invoiceDate||today();$('installationQuantityCollectionNotes').value=detail.collection?.notes||'';const noInvoice=$('installationQuantityNoInvoice');if(noInvoice)noInvoice.checked=Boolean(detail.collection?.withoutInvoice);syncNoInvoiceOption();syncWorkspaceFinancials();quantityWorkspaceDirty=false}
  function renderCollectionRecoveryState(state){
    quantityCollectionRecoveryState=state||null;
    const panel=$('installationQuantityCollectionRecovery'),message=$('installationQuantityCollectionRecoveryMessage'),button=$('confirmInstallationQuantityCollectionRecovery');
    if(!panel)return;
    const eligible=Boolean(state?.eligible)&&!state?.confirmed;
    panel.classList.toggle('hidden',!eligible);
    if(message&&eligible)message.textContent=state?.reason||'هذه الزيارة انتهت قبل تسجيل علامة مرحلة التحصيل. راجع المبلغ وطريقة الدفع ثم أكد المرحلة المسجلة.';
    if(button)button.disabled=!eligible;
  }
  async function refreshCollectionRecoveryState(){
    if(!quantityCurrent?.id||!quantityCurrent?.visitId){renderCollectionRecoveryState(null);return null;}
    const state=await window.InstallationsServiceSafe.completionCollectionRecoveryState(quantityCurrent.id,quantityCurrent.visitId);
    renderCollectionRecoveryState(state);
    return state;
  }
  async function reloadWorkspaceQuantities(){const quantities=await window.InstallationsServiceSafe.completionQuantitySummary(quantityCurrent.id,quantityCurrent.visitId||null,quantityCurrent.groupVisitIds||[]);quantityCurrent.quantities=quantities;$('installationQuantityLines').innerHTML=quantities.map(quantityLineHtml).join('')||'<p class="empty-state">لا توجد خدمات قابلة للتأكيد.</p>';syncQuantityResults()}
  async function saveWorkspace(){const services=collectWorkspaceServices();if(!services.length)throw new Error('أضف خدمة واحدة على الأقل.');if(services.some(x=>!x.serviceTypeId||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unitPrice)||x.unitPrice<0))throw new Error('راجع نوع الخدمة والعدد والسعر في جميع الخدمات.');const duplicates=new Set();for(const x of services){if(duplicates.has(x.serviceTypeId))throw new Error('لا يمكن تكرار نفس الخدمة أكثر من مرة.');duplicates.add(x.serviceTypeId)}const f=workspaceFinancials();const amount=Math.max(0,Number($('installationQuantityAmountCollected').value||0));if(moneyCents(amount)>moneyCents(f.final))throw new Error('المبلغ المحصل لا يمكن أن يتجاوز الإجمالي النهائي.');const noInvoice=Boolean($('installationQuantityNoInvoice')?.checked);const payment=noInvoice?'نقدي':$('installationQuantityPaymentMethod').value;if(amount>0&&!payment)throw new Error('اختر طريقة الدفع عند وجود مبلغ محصل.');const invoiceNumber=noInvoice?'':$('installationQuantityInvoiceNumber').value.trim();await window.InstallationsServiceSafe.saveCompletionWorkspace({id:quantityCurrent.id,visitId:quantityCurrent.visitId||null,services,discountAmount:f.discount,collection:{amountCollected:amount,paymentMethod:payment,invoiceNumber,notes:$('installationQuantityCollectionNotes').value.trim()}});quantityDetail=await window.InstallationsServiceSafe.requestEditDetail(quantityCurrent.id);renderWorkspace(quantityDetail);await reloadWorkspaceQuantities();quantityWorkspaceDirty=false}

  function requireQuantityDialog(){
    const ids=[
      "installationQuantityConfirmationDialog","installationQuantityConfirmationForm","installationQuantityRequestLabel",
      "installationQuantityLines","installationQuantityRemainingTotal","installationQuantityRemainingActionWrap",
      "installationQuantityRemainingAction","installationQuantityRescheduleDate","installationQuantityRescheduleTime",
      "installationQuantityConfirmationNotes","installationQuantityConfirmationStatus","saveInstallationQuantityConfirmation",
      "installationQuantityServiceEditorBody","installationQuantityDiscountAmount","installationQuantityAmountCollected",
      "installationQuantityPaymentMethod","installationQuantityCollectionStatus","installationQuantityInvoiceNumber",
      "installationQuantityInvoiceDate","installationQuantityNoInvoice","saveInstallationQuantityWorkspace",
      "installationQuantityCollectionRecovery","confirmInstallationQuantityCollectionRecovery"
    ];
    const missing=ids.filter(id=>!$(id));
    if(missing.length)throw new Error(`تعذر فتح نافذة تأكيد الكمية: عناصر الواجهة غير مكتملة (${missing.join(", ")}).`);
  }
  async function openQuantityConfirmation(r){
    if(!can("edit","installationCompletion"))return;
    requireQuantityDialog();
    quantityCurrent=r;
    quantityWorkspaceDirty=false;
    status($("installationQuantityConfirmationStatus"),"جاري تحميل بيانات الخدمات والتحصيل...");
    const detail=await window.InstallationsServiceSafe.requestEditDetail(r.id);
    quantityOptions=await window.InstallationsServiceSafe.requestEditOptions(detail.customerId||detail.customer?.id||null);
    $("installationQuantityRequestLabel").textContent=`${r.executionNumber||r.requestNumber} — ${r.customerName}`;
    renderWorkspace(detail);
    await reloadWorkspaceQuantities();
    await refreshCollectionRecoveryState();
    $("installationQuantityRemainingAction").value="return_to_schedule";
    $("installationQuantityRescheduleDate").value=today();
    $("installationQuantityRescheduleTime").value="10:00";
    if($("installationQuantityRescheduleTeam"))$("installationQuantityRescheduleTeam").value=r.teamId||"";
    if($("installationQuantityRescheduleTechnician"))$("installationQuantityRescheduleTechnician").value=r.technicianName||"";
    $("installationQuantityConfirmationNotes").value="";
    status($("installationQuantityConfirmationStatus"),"");
    $("installationQuantityConfirmationDialog").showModal();
  }

  function openInstallation(r){if(!can("add","salesInvoices")){alert("لا توجد صلاحية تحويل الموعد إلى فاتورة.");return}if(!r.confirmedHistory&&!can("edit","installationCompletion")){alert("لا توجد صلاحية تحويل الموعد إلى فاتورة.");return}setMode(r.confirmedHistory&&r.visitId?"installationVisit":"installation");current=r;$("installationCompletionRequestId").value=r.id;$("installationCompletionRequestLabel").textContent=`${r.requestNumber} — ${r.customerName}`;$("installationCompletionCustomer").textContent=r.customerName||"—";$("installationCompletionTechnician").textContent=r.technicianName||"—";$("installationCompletionDate").textContent=date(r.completedAt);$("installationCompletionAddress").textContent=r.installationAddress||"—";$("installationCompletionWorkSummary").value=r.report?.work_summary||"";$("installationCompletionRecipientName").value=r.report?.recipient_name||"";$("installationCompletionCustomerOrderNumber").value=r.customerOrderNumber||r.requestNumber||"";$("installationCompletionInvoiceNumber").value=r.report?.invoice_number||r.collectionInvoiceNumber||"";const noInv=$("installationCompletionNoInvoice");if(noInv)noInv.checked=false;syncCompletionNoInvoiceOption();$("installationCompletionInvoiceDate").value=r.report?.invoice_date||today();$("installationCompletionInvoiceAmount").value=Number(r.invoiceAmount||0).toFixed(2);$("installationCompletionInstallationExpenses").value=Number(r.installationExpenses||0).toFixed(2);$("installationCompletionBeforePhotos").value="";$("installationCompletionAfterPhotos").value="";$("installationCompletionDeliveryAuthorization").value="";showFiles(r);status($("installationCompletionFormStatus"),"");$("installationCompletionDialog").showModal()}
  function openQuotation(q){if(!can("add","salesInvoices")){alert("لا توجد صلاحية إضافة فواتير المبيعات.");return}setMode("quotation");current=q;$("installationCompletionRequestId").value=q.quotationId;$("installationCompletionRequestLabel").textContent=`${q.quotationCode||q.requestNumber} — ${q.customerName}`;$("installationCompletionCustomer").textContent=q.customerName||"—";$("installationCompletionTechnician").textContent="لا ينطبق";$("installationCompletionDate").textContent="عقد مباشر";$("installationCompletionAddress").textContent=q.customerPhone||"—";$("installationCompletionWorkSummary").value="";$("installationCompletionRecipientName").value="";$("installationCompletionCustomerOrderNumber").value=q.requestNumber||q.quotationCode||"";$("installationCompletionInvoiceNumber").value="";$("installationCompletionInvoiceDate").value=today();$("installationCompletionInvoiceAmount").value=Number(q.invoiceAmount||0).toFixed(2);$("installationCompletionInstallationExpenses").value="0.00";status($("installationCompletionFormStatus"),"");$("installationCompletionDialog").showModal()}
  document.addEventListener("DOMContentLoaded",()=>{
    window.addEventListener("kyum-view-changed",e=>{if(e.detail?.view==="installationCompletion")load()});window.addEventListener("petatoe-language-changed",()=>{if(!document.getElementById("installationCompletionView")?.classList.contains("hidden")){fillReps();render()}});
    window.addEventListener("kyum-sales-invoice-created",e=>removeInvoicedRowsFromLocalState(e.detail||{}));
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
        window.InstallationsServiceSafe.cancelConfirmedQuantity({id:r.id,visitId:r.visitId,visitIds:r.confirmedVisitIds?.length?r.confirmedVisitIds:(r.groupVisitIds||[r.visitId]),reason}).then(()=>load()).catch(err=>status($("installationCompletionStatus"),err.message,"error")).finally(()=>{cancelBtn.disabled=false});
        return;
      }
      const att=e.target.closest("[data-completion-attachments]");
      if(att){const r=rows.find(x=>(x.rowKey||x.id)===att.dataset.completionAttachments);if(r)openCompletionAttachments(r);return}
      const b=e.target.closest("[data-installation-completion]");
      if(b){const r=rows.find(x=>(x.rowKey||x.id)===b.dataset.installationCompletion);if(r)openInstallation(r)}
    });
    $("installationCompletionExistingFiles")?.addEventListener("click",async e=>{const b=e.target.closest("[data-open-installation-file]");if(!b)return;b.disabled=true;try{const url=await window.InstallationsServiceSafe.signedFileUrl(b.dataset.openInstallationFile);window.open(url,"_blank","noopener,noreferrer")}catch(err){status($("installationCompletionFormStatus"),err.message,"error")}finally{b.disabled=false}});
    $("installationQuantityLines")?.addEventListener("input",e=>{if(e.target.matches(".installation-confirmed-qty")){normalizeNumericInput(e.target,{integer:true});syncQuantityResults()}});
    $("addInstallationQuantityService")?.addEventListener("click",()=>{$("installationQuantityServiceEditorBody").insertAdjacentHTML("beforeend",serviceEditorRowHtml());quantityWorkspaceDirty=true;syncWorkspaceFinancials()});
    $("installationQuantityServiceEditorBody")?.addEventListener("click",e=>{const b=e.target.closest(".installation-confirmation-service-remove");if(!b)return;const rows=document.querySelectorAll(".installation-confirmation-service-row");if(rows.length<=1){status($("installationQuantityConfirmationStatus"),"يجب الاحتفاظ بخدمة واحدة على الأقل.","error");return}b.closest("tr")?.remove();syncWorkspaceFinancials()});
    $("installationQuantityServiceEditorBody")?.addEventListener("input",e=>{if(e.target.matches(".installation-confirmation-service-qty"))normalizeNumericInput(e.target,{integer:true});if(e.target.matches(".installation-confirmation-service-price"))normalizeNumericInput(e.target);syncWorkspaceFinancials()});
    $("installationQuantityServiceEditorBody")?.addEventListener("change",e=>{if(e.target.matches(".installation-confirmation-service-type")){const opt=quantityOptions.serviceTypes.find(x=>String(x.id)===String(e.target.value));const row=e.target.closest("tr");if(opt&&row&&Number(row.querySelector(".installation-confirmation-service-price").value||0)===0)row.querySelector(".installation-confirmation-service-price").value=Number(opt.default_price||0).toFixed(2);syncWorkspaceFinancials()}});
    $("installationQuantityDiscountAmount")?.addEventListener("input",e=>{normalizeNumericInput(e.target);syncWorkspaceFinancials()});
    $("installationQuantityAmountCollected")?.addEventListener("input",e=>{normalizeNumericInput(e.target);syncWorkspaceFinancials()});
    ["installationQuantityPaymentMethod","installationQuantityInvoiceNumber","installationQuantityCollectionNotes"].forEach(id=>$(id)?.addEventListener(id==="installationQuantityPaymentMethod"?"change":"input",()=>{quantityWorkspaceDirty=true}));
    $("installationQuantityInvoiceDate")?.addEventListener("change",()=>status($("installationQuantityConfirmationStatus"),""));
    $("installationQuantityNoInvoice")?.addEventListener("change",()=>{syncNoInvoiceOption();quantityWorkspaceDirty=true});
    $("saveInstallationQuantityWorkspace")?.addEventListener("click",async()=>{const btn=$("saveInstallationQuantityWorkspace");btn.disabled=true;try{status($("installationQuantityConfirmationStatus"),"جاري حفظ تحديثات الخدمات والتحصيل...");await saveWorkspace();status($("installationQuantityConfirmationStatus"),"تم حفظ الخدمات والتحصيل وتحديث كميات الزيارة.")}catch(err){status($("installationQuantityConfirmationStatus"),err.message,"error")}finally{btn.disabled=false}});
    $("confirmInstallationQuantityCollectionRecovery")?.addEventListener("click",async()=>{
      const btn=$("confirmInstallationQuantityCollectionRecovery");
      if(!quantityCurrent?.id||!quantityCurrent?.visitId)return;
      btn.disabled=true;
      try{
        status($("installationQuantityConfirmationStatus"),"جاري التحقق من بيانات التحصيل للحالة العالقة...");
        if(quantityWorkspaceDirty)await saveWorkspace();
        const state=await refreshCollectionRecoveryState();
        if(!state?.eligible||state?.confirmed){
          status($("installationQuantityConfirmationStatus"),state?.confirmed?"مرحلة التحصيل مؤكدة بالفعل.":(state?.reason||"هذه الحالة لا تحتاج استرداد مرحلة التحصيل."));
          return;
        }
        const amount=Math.max(0,Number($("installationQuantityAmountCollected")?.value||0));
        const payment=String($("installationQuantityPaymentMethod")?.value||'').trim();
        const f=workspaceFinancials();
        if(moneyCents(amount)>moneyCents(f.final))throw new Error('المبلغ المحصل لا يمكن أن يتجاوز الإجمالي النهائي.');
        if(moneyCents(f.final)>0&&moneyCents(amount)<=0)throw new Error('سجل المبلغ المحصل الفعلي قبل تأكيد مرحلة التحصيل.');
        if(amount>0&&!payment)throw new Error('اختر طريقة الدفع قبل تأكيد مرحلة التحصيل.');
        if(!window.confirm('سيتم تسجيل مرحلة التحصيل المفقودة لهذه الزيارة المكتملة فقط باستخدام بيانات التحصيل الحالية. هل تريد المتابعة؟'))return;
        await window.InstallationsServiceSafe.recoverCompletionCollectionStage({id:quantityCurrent.id,visitId:quantityCurrent.visitId,amountCollected:amount,paymentMethod:payment,notes:$("installationQuantityCollectionNotes")?.value.trim()||''});
        quantityDetail=await window.InstallationsServiceSafe.requestEditDetail(quantityCurrent.id);
        renderWorkspace(quantityDetail);
        await refreshCollectionRecoveryState();
        status($("installationQuantityConfirmationStatus"),"تم تأكيد مرحلة التحصيل للحالة العالقة. يمكنك الآن اعتماد الكمية وإنشاء الفاتورة.");
      }catch(err){status($("installationQuantityConfirmationStatus"),err.message,"error")}
      finally{btn.disabled=Boolean(quantityCollectionRecoveryState?.confirmed)||!quantityCollectionRecoveryState?.eligible}
    });
    $("installationQuantityRemainingAction")?.addEventListener("change",syncQuantityAction);
    $("closeInstallationQuantityConfirmation")?.addEventListener("click",()=>$("installationQuantityConfirmationDialog").close());
    $("cancelInstallationQuantityConfirmation")?.addEventListener("click",()=>$("installationQuantityConfirmationDialog").close());
    $("installationQuantityConfirmationForm")?.addEventListener("submit",async e=>{
      e.preventDefault();
      if(!quantityCurrent)return;
      const btn=$("saveInstallationQuantityConfirmation");
      btn.disabled=true;
      try{
        if(quantityWorkspaceDirty){status($("installationQuantityConfirmationStatus"),"جاري حفظ تحديثات الخدمات والتحصيل قبل الاعتماد...");await saveWorkspace();}
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
        const directWithoutInvoice=Boolean($("installationQuantityNoInvoice")?.checked);
        const directInvoiceNumber=directWithoutInvoice?'':$("installationQuantityInvoiceNumber")?.value.trim()||'';
        const directInvoiceDate=$("installationQuantityInvoiceDate")?.value||'';
        const shouldCreateInvoice=Boolean(directWithoutInvoice||directInvoiceNumber);
        if(shouldCreateInvoice&&!directInvoiceDate)throw new Error('تاريخ الفاتورة مطلوب عند التحويل إلى فاتورة.');
        if(shouldCreateInvoice&&!quantityCurrent.visitId)throw new Error('التحويل المباشر إلى فاتورة متاح لزيارات التنفيذ فقط.');
        if(shouldCreateInvoice){
          const recoveryState=await refreshCollectionRecoveryState();
          if(recoveryState?.eligible&&!recoveryState?.confirmed)throw new Error('هذه الزيارة حالة عالقة بدون علامة مرحلة التحصيل. استخدم «تأكيد مرحلة التحصيل المسجلة» أولًا ثم أعد اعتماد الكمية.');
          status($("installationQuantityConfirmationStatus"),"جاري اعتماد الكمية وإنشاء الفاتورة...");
          await window.InstallationsServiceSafe.confirmActualQuantitiesAndInvoice({
            id:quantityCurrent.id,visitId:quantityCurrent.visitId,groupVisitIds:quantityCurrent.groupVisitIds||[],lines,remainingAction:action,schedule,
            notes:$("installationQuantityConfirmationNotes").value.trim(),
            invoiceNumber:directInvoiceNumber,invoiceDate:directInvoiceDate,withoutInvoice:directWithoutInvoice
          });
          window.dispatchEvent(new CustomEvent("kyum-installation-quantities-confirmed",{detail:{requestId:quantityCurrent.id,action,directInvoice:true}}));
          window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"installation",requestId:quantityCurrent.id,visitId:quantityCurrent.visitId}}));
          $("installationQuantityConfirmationDialog").close();
          window.KYUMNavigation?.open?.("salesInvoices",{trustedNavigation:true});
          return;
        }
        status($("installationQuantityConfirmationStatus"),"جاري اعتماد التنفيذ الفعلي...");
        await window.InstallationsServiceSafe.confirmActualQuantities({
          id:quantityCurrent.id,visitId:quantityCurrent.visitId||null,groupVisitIds:quantityCurrent.groupVisitIds||[],lines,remainingAction:action,schedule,
          notes:$("installationQuantityConfirmationNotes").value.trim()
        });
        window.dispatchEvent(new CustomEvent("kyum-installation-quantities-confirmed",{detail:{requestId:quantityCurrent.id,action}}));
        $("installationQuantityConfirmationDialog").close();
        await load();
      }catch(err){status($("installationQuantityConfirmationStatus"),err.message,"error")}
      finally{btn.disabled=false}
    });

    $("closeInstallationCompletionDialog")?.addEventListener("click",()=>$("installationCompletionDialog").close());
    $("cancelInstallationCompletion")?.addEventListener("click",()=>$("installationCompletionDialog").close());
    $("installationCompletionNoInvoice")?.addEventListener("change",syncCompletionNoInvoiceOption);
    $("installationCompletionForm")?.addEventListener("submit",async e=>{e.preventDefault();const btn=$("saveInstallationCompletion");btn.disabled=true;try{const withoutInvoice=mode==="installationVisit"&&Boolean($("installationCompletionNoInvoice")?.checked),invoiceNumber=withoutInvoice?'':$("installationCompletionInvoiceNumber").value.trim(),invoiceDate=$("installationCompletionInvoiceDate").value;if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");status($("installationCompletionFormStatus"),"جاري حفظ الفاتورة...");if(mode==="quotation"){await window.SalesInvoicesService.createFromQuotation({quotationId:current.quotationId,invoiceNumber,invoiceDate});await window.QuotationsService?.invalidateCache?.();window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"quotation"}}))}else if(mode==="installationVisit"){await window.SalesInvoicesService.createFromInstallationVisit({installationRequestId:current.id,visitId:current.visitId,invoiceNumber,invoiceDate,withoutInvoice});window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"installation",requestId:current.id,visitId:current.visitId}}))}else{const deliveryFile=$("installationCompletionDeliveryAuthorization").files[0]||null,before=[...$("installationCompletionBeforePhotos").files],after=[...$("installationCompletionAfterPhotos").files],hasStoredDelivery=current.files.some(f=>f.file_kind==="delivery_authorization");if(before.length+after.length>12)throw new Error("الحد الأقصى 12 صورة لكل عملية.");if(!deliveryFile&&!hasStoredDelivery)throw new Error("صورة إذن تسليم العميل مطلوبة لإتمام التحويل.");await window.InstallationsServiceSafe.saveCompletion({id:current.id,workSummary:$("installationCompletionWorkSummary").value.trim(),recipientName:$("installationCompletionRecipientName").value.trim(),invoiceNumber,invoiceDate,beforePhotos:before,afterPhotos:after,deliveryAuthorizationFile:deliveryFile})}$("installationCompletionDialog").close();window.KYUMNavigation?.open?.("salesInvoices",{trustedNavigation:true});if(mode==="installation"||mode==="installationVisit")await load()}catch(err){status($("installationCompletionFormStatus"),err.message,"error")}finally{btn.disabled=false}});
  });
})();
