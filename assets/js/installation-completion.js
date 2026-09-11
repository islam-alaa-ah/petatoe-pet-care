(()=>{
  "use strict";
  let rows=[];
  let current=null;
  let mode="installation";
  let quantityCurrent=null;
  let quantityDetail=null;
  let quantityOptions={serviceTypes:[]};
  let quantityWorkspaceDirty=false;
  let quantityCollectionWasFullyCollected=false;
  let quantityCollectionTouched=false;
  let quantityCollectionRecoveryState=null;
  const $=id=>document.getElementById(id);
  const t=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback};
  const serviceLabel=(item={})=>{const name=String(item?.serviceName||item?.name||'').trim();if(!name)return t('appointments.common.service','Service');const id=item?.serviceTypeId||item?.service_type_id||'';if(id){const value=window.PetatoeLocalization?.entityText?.('service',{id,name,serviceCode:item?.serviceCode||item?.service_code||''});if(value&&!/^\[entity\./.test(String(value)))return value}if(lang()==='en'){const value=window.PetatoeLocalization?.serviceDefaultEnglish?.(name,item?.serviceCode||item?.service_code||'');if(value&&value!=='Translation pending'&&!/[\u0600-\u06FF]/.test(value))return value}return name};
  const lang=()=>window.PetatoeLocalization?.effectiveLanguage?.()==="en"?"en":"ar";
  const uiMessage=(value,fallback="")=>{const raw=String(value||"");const translated=window.PetatoeLocalization?.translateMessage?.(raw)||raw;return lang()==="en"&&/[\u0600-\u06FF]/.test(translated)&&fallback?fallback:(translated||fallback)};
  const addressLabel=value=>window.KYUMGeography?.localizedGeographyLabel?.("district","",value)||(lang()==="en"?t("appointments.common.addressNotSpecified","Address not specified"):String(value||""));
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>new Intl.NumberFormat(lang()==="en"?"en-US-u-nu-latn":"ar-SA-u-nu-latn",{style:"currency",currency:"SAR",minimumFractionDigits:2}).format(Number(v||0));
  function status(el,msg,type=""){if(!el)return;el.textContent=msg||"";el.classList.toggle("hidden",!msg);el.classList.toggle("error",type==="error")}
  function date(v){return v?new Date(v).toLocaleString(lang()==="en"?"en-US-u-nu-latn":"ar-SA-u-nu-latn",{calendar:"gregory",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}
  function today(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
  const moneyCents=v=>Math.round((Number(v)||0)*100);
  const normalizePaymentMethod=value=>{const raw=String(value||'').trim();if(['بطاقة','شبكة','بطاقة / شبكة','بطاقة/شبكة'].includes(raw))return 'بطاقة / شبكة';if(['تحويل','تحويل بنكي'].includes(raw))return 'تحويل بنكي';if(['دفع إلكتروني','دفع الكتروني','الدفع عن طريق الموقع','دفع عن طريق الموقع'].includes(raw))return 'الدفع عن طريق الموقع';return raw};
  function reps(){const map=new Map();rows.forEach(r=>{if(r.representativeId)map.set(r.representativeId,r.representativeName||t('appointments.common.representativeNotSpecified','Representative not specified'))});return [...map].sort((a,b)=>a[1].localeCompare(b[1],"ar"))}
  function fillReps(){const el=$("installationCompletionRepresentativeFilter");if(!el)return;const val=el.value;el.innerHTML=`<option value="">${esc(t('appointments.completion.allAllowedReps','كل المندوبين المسموحين'))}</option>`+reps().map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join("");el.value=[...el.options].some(o=>o.value===val)?val:""}
  function requestDateKey(row){return String(row?.requestCreatedAt||"").slice(0,10)}
  function compareCompletionRows(a,b){
    const dateOrder=requestDateKey(b).localeCompare(requestDateKey(a));
    if(dateOrder)return dateOrder;
    return String(b?.requestNumber||"").localeCompare(String(a?.requestNumber||""),"en",{numeric:true,sensitivity:"base"});
  }
  function filtered(){const q=($("installationCompletionSearch")?.value||"").trim().toLowerCase(),rep=$("installationCompletionRepresentativeFilter")?.value||"",from=$("installationCompletionDateFrom")?.value||"",to=$("installationCompletionDateTo")?.value||"";return rows.filter(r=>(!q||[r.requestNumber,r.customerName,r.customerPhone,r.technicianName].join(" ").toLowerCase().includes(q))&&(!rep||r.representativeId===rep)&&(!from||String(r.completedAt).slice(0,10)>=from)&&(!to||String(r.completedAt).slice(0,10)<=to)).sort(compareCompletionRows)}
  function can(action,screen){if(navigator.onLine===false&&action!=="view")return false;return Boolean(window.CustomerPermissions?.canAction?.(screen,action))}
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
        const cancel=isSuperAdmin()?`<button class="secondary-btn installation-cancel-confirmed-quantity" type="button" data-cancel-confirmed-quantity="${esc(r.rowKey||r.id)}">${esc(t('appointments.completion.cancelConfirmedQty','Cancel executed quantity'))}</button>`:'';
        actions=`${invoice}${cancel}`;
      }else if(can("edit","installationCompletion")){
        actions=r.quantityConfirmed?(can("add","salesInvoices")?`<button class="primary-btn" type="button" data-installation-completion="${esc(r.rowKey||r.id)}">${esc(t("appointments.completion.toInvoice","تحويل إلى فاتورة"))}</button>`:`<span class="field-hint">${esc(t("appointments.completion.noInvoicePermission","لا توجد صلاحية إضافة فاتورة"))}</span>`):`<button class="primary-btn" type="button" data-confirm-installation-quantity="${esc(r.rowKey||r.id)}">${esc(t("appointments.completion.confirmQty","تأكيد الكمية المنفذة"))}</button>`;
      }else actions=`<span class="field-hint">${esc(t('appointments.completion.noConfirmPermission','لا توجد صلاحية تأكيد'))}</span>`;
      return `<tr><td data-label="${esc(t('appointments.col.number','رقم الطلب'))}"><strong>${esc(r.executionNumber||r.requestNumber)}</strong></td><td data-label="${esc(t('appointments.col.customer','العميل'))}">${esc(r.customerName||"—")}</td><td data-label="${esc(t('appointments.col.customerNumber','رقم العميل'))}" dir="ltr">${esc(r.customerPhone||"—")}</td><td data-label="${esc(t('appointments.col.team','الفرقة'))}">${esc(r.teamName||"—")}</td><td data-label="${esc(t('appointments.completion.requestDate','تاريخ الطلب'))}">${esc(date(r.requestCreatedAt))}</td><td data-label="${esc(t('invoices.attachments.title','المرفقات'))}">${completionAttachments(r).length?`<button class="secondary-btn compact-btn" type="button" data-completion-attachments="${esc(r.rowKey||r.id)}">${esc(t('invoices.attachments.view','عرض المرفقات'))} (${completionAttachments(r).length})</button>`:`<span class="field-hint">${esc(t('invoices.attachments.none','لا توجد مرفقات'))}</span>`}</td><td data-label="${esc(t('appointments.completion.transferStatus','حالة التحويل'))}"><span class="installation-doc-status is-pending">${esc(r.confirmedHistory?t('appointments.completion.status.quantityConfirmed','Quantity confirmed'):(r.quantityConfirmed?t('appointments.completion.status.readyToConvert','Ready to convert'):t('appointments.completion.status.awaitingConfirmation','Awaiting execution confirmation')))}</span></td><td data-label="${esc(t('appointments.col.actions','الإجراءات'))}"><div class="installation-completion-actions">${actions}</div></td></tr>`;
    }).join(""):`<tr class="installation-completion-empty-row"><td colspan="8"><div class="empty-state">${esc(t('appointments.completion.empty','لا توجد مواعيد مكتملة بانتظار التحويل إلى فاتورة.'))}</div></td></tr>`;
  }
  async function load(){status($("installationCompletionStatus"),t('appointments.completion.loading','جاري تحميل المواعيد المكتملة...'));try{rows=await window.InstallationsServiceSafe.completionList();fillReps();render();status($("installationCompletionStatus"),window.InstallationsService?.getReadStatusMessage?.("completion")||"")}catch(e){status($("installationCompletionStatus"),uiMessage(e.message,t('appointments.completion.error.load','Unable to load completed appointments.')),"error")}}
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
    const fullInstallation=mode==="installation",visitInvoice=mode==="installationVisit",installation=fullInstallation||visitInvoice;
    $('installationCompletionDialogTitle').textContent=visitInvoice?t('appointments.completion.quantityToInvoice','Convert executed quantity to invoice'):t('appointments.completion.invoiceDialogTitle','Convert to Invoice');
    $('installationCompletionWorkSection').classList.toggle('hidden',!fullInstallation);$('installationEvidenceSection').classList.toggle('hidden',!fullInstallation);$('installationCompletionExistingFiles').classList.toggle('hidden',!fullInstallation);$('printInstallationCompletion').classList.add('hidden');$('installationCompletionWorkSummary').required=fullInstallation;$('installationCompletionRecipientName').required=fullInstallation;$('installationCompletionDeliveryAuthorization').required=false;$('installationCompletionNoInvoiceWrap')?.classList.toggle('hidden',!visitInvoice);
    if(!visitInvoice){const noInv=$('installationCompletionNoInvoice');if(noInv)noInv.checked=false;syncCompletionNoInvoiceOption()}
    $('saveInstallationCompletion').textContent=visitInvoice?t('appointments.completion.quantityToInvoice','Convert executed quantity to invoice'):(installation?t('appointments.completion.saveInvoice','Save & Convert to Invoice'):t('appointments.completion.createInvoice','Create Invoice'));
  }
  async function showFiles(r){const box=$('installationCompletionExistingFiles');const labels={before:t('appointments.completion.file.before','Before appointment'),after:t('appointments.completion.file.after','After appointment'),delivery_authorization:t('appointments.completion.file.delivery','Customer delivery authorization'),signature:t('appointments.completion.file.legacySignature','Legacy customer signature')};box.innerHTML=r.files?.length?r.files.map(f=>`<div class="installation-existing-file"><strong>${esc(labels[f.file_kind]||t('appointments.completion.file.attachment','Attachment'))}</strong><small>${esc(f.original_name||t('appointments.completion.file.attachment','Attachment'))}</small><button class="secondary-btn" type="button" data-open-installation-file="${esc(f.storage_path)}">${esc(t('invoices.attachments.open','Open'))}</button></div>`).join(''):`<p>${esc(t('invoices.attachments.none','No attachments'))}</p>`}
  function completionAttachments(r){const visitIds=new Set((r.groupVisitIds?.length?r.groupVisitIds:[r.visitId]).filter(Boolean).map(String));return (r.executionFiles||[]).filter(f=>!f.visitId||!visitIds.size||visitIds.has(String(f.visitId)))}
  function openCompletionAttachments(r){const files=completionAttachments(r),box=$("appointmentAttachmentsList");$("appointmentAttachmentsTitle").textContent=t('invoices.attachments.title','المرفقات');$("appointmentAttachmentsSubtitle").textContent=`${r.executionNumber||r.requestNumber} — ${r.customerName||''}`;box.innerHTML=files.length?files.map((f,i)=>`<div class="sales-invoice-attachment-item"><div><strong>${esc(String(f.fileKind||'')==='collection'?t('invoices.attachments.collection','مرفق التحصيل'):t('invoices.attachments.execution','مرفق التنفيذ'))}</strong><small>${esc(f.originalName||t('appointments.completion.attachmentFallback','Attachment {index}',{index:i+1}))}</small></div><button class="secondary-btn compact-btn" type="button" data-open-execution-file="${esc(f.storagePath)}">${esc(t('invoices.attachments.open','فتح'))}</button></div>`).join(''):`<p class="empty-state">${esc(t('invoices.attachments.none','لا توجد مرفقات'))}</p>`;$("appointmentAttachmentsDialog")?.showModal()}
  function syncCompletionNoInvoiceOption(){const checkbox=$("installationCompletionNoInvoice"),input=$("installationCompletionInvoiceNumber");if(!checkbox||!input)return;const checked=Boolean(checkbox.checked);input.disabled=checked;input.required=!checked;if(checked)input.value=''}

  function quantityLineHtml(x){
    const scheduled=Number(x.scheduledCurrentQuantity||x.remainingQuantity||0);
    return `<article class="installation-quantity-line" data-service-line="${esc(x.requestServiceId)}"><div class="installation-quantity-line-head"><strong>${esc(serviceLabel(x))}</strong><span>${money(x.unitPrice)} ${esc(t('appointments.completion.perUnit','per unit'))}</span></div><div class="installation-quantity-metrics"><span>${esc(t('appointments.completion.requested','Requested'))} <b>${x.requestedQuantity}</b></span><span>${esc(t('appointments.completion.scheduledForVisit','Scheduled for visit'))} <b>${scheduled}</b></span><span>${esc(t('appointments.completion.executedPreviously','Previously executed'))} <b>${x.executedQuantity}</b></span><span>${esc(t('appointments.completion.remainingBeforeConfirm','Remaining before confirmation'))} <b>${x.remainingQuantity}</b></span></div><label>${esc(t('appointments.completion.executedThisVisit','Executed quantity in current visit'))}<input class="installation-confirmed-qty" type="text" inputmode="numeric" lang="en" dir="ltr" value="${Math.min(scheduled,x.remainingQuantity)}" data-request-service-id="${esc(x.requestServiceId)}" data-scheduled="${scheduled}" data-remaining="${x.remainingQuantity}"></label><small class="installation-quantity-result"></small></article>`;
  }
  function quantityDecision(){
    let remaining=0,mismatch=false,shortfall=0;
    document.querySelectorAll(".installation-confirmed-qty").forEach(input=>{
      const max=Number(input.dataset.remaining||0),scheduled=Number(input.dataset.scheduled||0),value=Math.max(0,Number(input.value||0));
      const after=Math.max(max-value,0);
      remaining+=after;
      if(value!==scheduled)mismatch=true;
      shortfall+=Math.max(scheduled-value,0);
      input.closest(".installation-quantity-line")?.querySelector(".installation-quantity-result")?.replaceChildren(document.createTextNode(t('appointments.completion.remainingAfterLine','Remaining after confirmation: {count}',{count:after})));
    });
    return {remaining,mismatch,shortfall};
  }
  function fillRemainingActions(decision){
    const select=$("installationQuantityRemainingAction");if(!select)return;
    const next=quantityCurrent?.nextScheduledVisit||null;
    if(decision.remaining<=0){select.innerHTML=`<option value="completed">${esc(t('appointments.completion.action.completed','Full quantity executed'))}</option>`;select.value="completed";return;}
    if(!decision.mismatch&&next){select.innerHTML=`<option value="preserve_existing">${esc(t('appointments.completion.action.preserveExisting','Keep next scheduled appointment unchanged'))}</option>`;select.value="preserve_existing";return;}
    let html='';
    if(next)html+=`<option value="append_to_next_visit">${esc(t('appointments.completion.action.appendNext','Add remaining quantity to scheduled appointment {date} {time}',{date:next.scheduledDate,time:next.scheduledTime}))}</option>`;
    html+=`<option value="return_to_schedule">${esc(t('appointments.completion.returnToSchedule','Return remaining quantity to scheduling'))}</option>`;
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
    if(note){note.classList.toggle("hidden",requiresChoice||decision.remaining<=0);note.textContent=decision.remaining>0&&next?t('appointments.completion.note.preserveNext','The next appointment {date} {time} remains unchanged because executed quantity matches the scheduled quantity for this visit.',{date:next.scheduledDate,time:next.scheduledTime}):'';}
    syncQuantityAction();
  }
  function syncQuantityAction(){
    const action=$("installationQuantityRemainingAction")?.value||"completed";
    $("installationQuantityRescheduleFields")?.classList.add("hidden");
    const note=$("installationQuantityScheduleLaterNote");
    if(note&&action==="return_to_schedule"){note.classList.remove("hidden");note.textContent=t('appointments.completion.note.returnSchedule','Only the remaining quantity will return to scheduling while preserving any previously scheduled appointment for the same request.');}
    else if(note&&action==="append_to_next_visit"){const next=quantityCurrent?.nextScheduledVisit;note.classList.remove("hidden");note.textContent=next?t('appointments.completion.note.appendNext','Remaining quantity will be added to the scheduled appointment {date} {time} for the same request.',{date:next.scheduledDate,time:next.scheduledTime}):'';}
  }
  const latinDigits=v=>String(v??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  function normalizeNumericInput(input,{integer=false}={}){if(!input)return '';let value=latinDigits(input.value);if(integer)value=value.replace(/[^0-9]/g,'');else{value=value.replace(/[^0-9.]/g,'');const dot=value.indexOf('.');if(dot>=0)value=value.slice(0,dot+1)+value.slice(dot+1).replace(/\./g,'')}if(input.value!==value)input.value=value;return value}
  function serviceTypeOptions(selected=''){return `<option value="">${esc(t('appointmentNew.services.select','Select service'))}</option>`+quantityOptions.serviceTypes.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selected)?'selected':''}>${esc(serviceLabel(x))}</option>`).join('')}
  function serviceEditorRowHtml(service={}){const requestServiceId=service.requestServiceId||service.id||'';return `<tr class="installation-confirmation-service-row" data-request-service-id="${esc(requestServiceId)}">
    <td><select class="installation-confirmation-service-type" required>${serviceTypeOptions(service.serviceTypeId||'')}</select></td>
    <td><input class="installation-confirmation-service-qty" type="text" inputmode="numeric" lang="en" dir="ltr" value="${Math.max(1,Number(service.quantity||1))}"></td>
    <td><input class="installation-confirmation-service-price" type="text" inputmode="decimal" lang="en" dir="ltr" value="${Number(service.unitPrice||0).toFixed(2)}"></td>
    <td><output class="installation-confirmation-service-total">${money(Number(service.quantity||1)*Number(service.unitPrice||0))}</output></td>
    <td><button class="danger-btn installation-confirmation-service-remove" type="button">${esc(t('appointments.common.delete','Delete'))}</button></td>
  </tr>`}
  function collectWorkspaceServices(){return [...document.querySelectorAll('.installation-confirmation-service-row')].map(row=>({requestServiceId:row.dataset.requestServiceId||'',serviceTypeId:row.querySelector('.installation-confirmation-service-type')?.value||'',quantity:Number(row.querySelector('.installation-confirmation-service-qty')?.value||0),unitPrice:Number(row.querySelector('.installation-confirmation-service-price')?.value||0)}))}
  function workspaceFinancials(){const services=collectWorkspaceServices();const subtotal=Math.round(services.reduce((n,x)=>n+Math.max(0,x.quantity)*Math.max(0,x.unitPrice),0)*100)/100;const tax=Math.round(subtotal*.15*100)/100;const gross=Math.round((subtotal+tax)*100)/100;const discount=Math.min(Math.max(0,Number($('installationQuantityDiscountAmount')?.value||0)),gross);const final=Math.round(Math.max(gross-discount,0)*100)/100;return {subtotal,discount,tax,gross,final}}
  function syncWorkspaceFinancials(){document.querySelectorAll('.installation-confirmation-service-row').forEach(row=>{const qty=Math.max(0,Number(row.querySelector('.installation-confirmation-service-qty')?.value||0)),price=Math.max(0,Number(row.querySelector('.installation-confirmation-service-price')?.value||0));const out=row.querySelector('.installation-confirmation-service-total');if(out)out.textContent=money(qty*price)});const f=workspaceFinancials();$('installationQuantitySubtotal').textContent=money(f.subtotal);$('installationQuantityTaxAmount').textContent=money(f.tax);$('installationQuantityFinalAmount').textContent=money(f.final);const amountInput=$('installationQuantityAmountCollected');if(quantityCollectionWasFullyCollected&&!quantityCollectionTouched&&moneyCents(Number(amountInput?.value||0))>moneyCents(f.final)){amountInput.value=String(Math.round(f.final))}const amount=Math.max(0,Number(amountInput?.value||0));$('installationQuantityCollectionStatus').value=moneyCents(amount)<=0?'غير محصل':(moneyCents(amount)>=moneyCents(f.final)?'محصل بالكامل':'محصل جزئيًا');quantityWorkspaceDirty=true;return f}
  function syncNoInvoiceOption(){
    const checkbox=$("installationQuantityNoInvoice"),invoice=$("installationQuantityInvoiceNumber"),payment=$("installationQuantityPaymentMethod");
    if(!checkbox||!invoice||!payment)return;
    if(checkbox.checked){invoice.value="";invoice.disabled=true}else invoice.disabled=false;
    // طريقة الدفع تخص التحصيل نفسه وليست مرتبطة بوجود رقم فاتورة، لذلك تظل قابلة للمراجعة دائمًا.
    payment.disabled=false;
  }
  function renderQuantityAttachmentField(){
    const input=$("installationQuantityAttachments"),summary=$("installationQuantityAttachmentsSummary"),button=$("viewInstallationQuantityAttachments");
    if(input)input.value="";
    const count=quantityCurrent?completionAttachments(quantityCurrent).length:0;
    if(summary)summary.textContent=count?t('appointments.completion.currentAttachments','Current attachments: {count}',{count}):t('appointments.completion.noAttachments','No current attachments');
    if(button){button.classList.toggle('hidden',count<=0);button.textContent=t('appointments.completion.viewAttachmentsCount','View current attachments ({count})',{count});}
  }
  function renderWorkspace(detail){
    quantityDetail=detail;
    const body=$('installationQuantityServiceEditorBody');
    body.innerHTML=(detail.services||[]).map(serviceEditorRowHtml).join('')||serviceEditorRowHtml();
    $('installationQuantityDiscountAmount').value=Number(detail.discountAmount||0).toFixed(2);
    const f=workspaceFinancials();
    const storedAmount=Math.max(0,Number(detail.collection?.amountCollected||0));
    const isFullyCollected=String(detail.collection?.collectionStatus||'')==='محصل بالكامل'||moneyCents(storedAmount)>=moneyCents(f.final);
    quantityCollectionWasFullyCollected=isFullyCollected;
    quantityCollectionTouched=false;
    $('installationQuantityAmountCollected').value=String(Math.round(storedAmount));
    const payment=normalizePaymentMethod(detail.collection?.paymentMethod||'');
    const paymentSelect=$('installationQuantityPaymentMethod');
    if(paymentSelect){
      if(payment&&![...paymentSelect.options].some(option=>option.value===payment))paymentSelect.insertAdjacentHTML('beforeend',`<option value="${esc(payment)}">${esc(payment)}</option>`);
      paymentSelect.value=payment;
    }
    $('installationQuantityInvoiceNumber').value=detail.collection?.invoiceNumber||'';
    $('installationQuantityInvoiceDate').value=detail.collection?.invoiceDate||detail.scheduledDate||quantityCurrent?.scheduledDate||today();
    $('installationQuantityCollectionNotes').value=detail.collection?.notes||'';
    const noInvoice=$('installationQuantityNoInvoice');if(noInvoice)noInvoice.checked=Boolean(detail.collection?.withoutInvoice);
    syncNoInvoiceOption();
    syncWorkspaceFinancials();
    renderQuantityAttachmentField();
    quantityWorkspaceDirty=false;
  }
  function renderCollectionRecoveryState(state){
    quantityCollectionRecoveryState=state||null;
    const panel=$('installationQuantityCollectionRecovery'),message=$('installationQuantityCollectionRecoveryMessage'),button=$('confirmInstallationQuantityCollectionRecovery');
    if(!panel)return;
    const eligible=Boolean(state?.eligible)&&!state?.confirmed;
    panel.classList.toggle('hidden',!eligible);
    if(message&&eligible)message.textContent=uiMessage(state?.reason,t('appointments.completion.recoveryReason','This visit ended before the collection-stage marker was recorded. Review amount and payment method, then confirm the recorded stage.'));
    if(button)button.disabled=!eligible;
  }
  async function refreshCollectionRecoveryState(){
    if(!quantityCurrent?.id||!quantityCurrent?.visitId){renderCollectionRecoveryState(null);return null;}
    const state=await window.InstallationsServiceSafe.completionCollectionRecoveryState(quantityCurrent.id,quantityCurrent.visitId);
    renderCollectionRecoveryState(state);
    return state;
  }
  async function reloadWorkspaceQuantities(){const quantities=await window.InstallationsServiceSafe.completionQuantitySummary(quantityCurrent.id,quantityCurrent.visitId||null,quantityCurrent.groupVisitIds||[]);quantityCurrent.quantities=quantities;$('installationQuantityLines').innerHTML=quantities.map(quantityLineHtml).join('')||`<p class="empty-state">${esc(t('appointments.completion.validation.noServicesToConfirm','No services are available for confirmation.'))}</p>`;syncQuantityResults()}
  async function saveWorkspace(){const services=collectWorkspaceServices();if(!services.length)throw new Error(t('appointments.completion.validation.addService','Add at least one service.'));if(services.some(x=>!x.serviceTypeId||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unitPrice)||x.unitPrice<0))throw new Error(t('appointments.completion.validation.services','Review service type, quantity, and price for all services.'));const existingIds=new Set();for(const x of services){if(!x.requestServiceId)continue;if(existingIds.has(x.requestServiceId))throw new Error(t('appointments.completion.error.serviceLineIdentity','Unable to uniquely identify the service row. Reopen the dialog and try again.'));existingIds.add(x.requestServiceId)}const f=workspaceFinancials();const amountDisplay=Math.max(0,Math.round(Number($('installationQuantityAmountCollected').value||0)));$('installationQuantityAmountCollected').value=String(amountDisplay);const roundedFinal=Math.max(0,Math.round(f.final));if(amountDisplay>roundedFinal)throw new Error(t('appointments.completion.validation.collectionExceedsFinal','تعذر الحفظ: المبلغ المحصل أكبر من الإجمالي النهائي بعد تعديل الخدمات أو الأسعار أو الخصم. راجع قيمة التحصيل قبل الحفظ.'));const amountForStorage=amountDisplay===roundedFinal?f.final:amountDisplay;const noInvoice=Boolean($('installationQuantityNoInvoice')?.checked);const payment=normalizePaymentMethod($('installationQuantityPaymentMethod').value);if(amountDisplay>0&&!payment)throw new Error(t('appointments.completion.validation.paymentRequired','Select a payment method before confirming the collection stage.'));const invoiceNumber=noInvoice?'':$('installationQuantityInvoiceNumber').value.trim();await window.InstallationsServiceSafe.saveCompletionWorkspace({id:quantityCurrent.id,visitId:quantityCurrent.visitId||null,services,discountAmount:f.discount,collection:{amountCollected:amountForStorage,paymentMethod:payment,invoiceNumber,notes:$('installationQuantityCollectionNotes').value.trim()}});quantityDetail=await window.InstallationsServiceSafe.requestEditDetail(quantityCurrent.id);renderWorkspace(quantityDetail);await reloadWorkspaceQuantities();quantityWorkspaceDirty=false}

  function requireQuantityDialog(){
    const ids=[
      "installationQuantityConfirmationDialog","installationQuantityConfirmationForm","installationQuantityRequestLabel",
      "installationQuantityLines","installationQuantityRemainingTotal","installationQuantityRemainingActionWrap",
      "installationQuantityRemainingAction","installationQuantityRescheduleDate","installationQuantityRescheduleTime",
      "installationQuantityConfirmationNotes","installationQuantityConfirmationStatus","saveInstallationQuantityConfirmation",
      "installationQuantityServiceEditorBody","installationQuantityDiscountAmount","installationQuantityAmountCollected",
      "installationQuantityPaymentMethod","installationQuantityCollectionStatus","installationQuantityInvoiceNumber",
      "installationQuantityInvoiceDate","installationQuantityNoInvoice","installationQuantityAttachments","installationQuantityAttachmentsSummary","viewInstallationQuantityAttachments","saveInstallationQuantityWorkspace",
      "installationQuantityCollectionRecovery","confirmInstallationQuantityCollectionRecovery"
    ];
    const missing=ids.filter(id=>!$(id));
    if(missing.length)throw new Error(t('appointments.completion.error.missingUi','Unable to open quantity confirmation: interface elements are incomplete ({items}).',{items:missing.join(', ')}));
  }
  async function openQuantityConfirmation(r){
    if(!can("edit","installationCompletion"))return;
    requireQuantityDialog();
    quantityCurrent=r;
    quantityWorkspaceDirty=false;
    status($('installationQuantityConfirmationStatus'),t('appointments.completion.loadingWorkspace','Loading service and collection data...'));
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

  async function openInstallation(r){if(!can("add","salesInvoices")){alert(t('appointments.completion.error.invoicePermission','You do not have permission to convert the appointment to an invoice.'));return}if(!r.confirmedHistory&&!can("edit","installationCompletion")){alert(t('appointments.completion.error.invoicePermission','You do not have permission to convert the appointment to an invoice.'));return}setMode(r.confirmedHistory&&r.visitId?"installationVisit":"installation");current=r;$("installationCompletionRequestId").value=r.id;$("installationCompletionRequestLabel").textContent=`${r.requestNumber} — ${r.customerName}`;$("installationCompletionCustomer").textContent=r.customerName||"—";$("installationCompletionTechnician").textContent=r.technicianName||"—";$("installationCompletionDate").textContent=date(r.completedAt);$("installationCompletionAddress").textContent=addressLabel(r.installationAddress)||"—";$("installationCompletionWorkSummary").value=r.report?.work_summary||"";$("installationCompletionRecipientName").value=r.report?.recipient_name||"";$("installationCompletionCustomerOrderNumber").value=r.customerOrderNumber||r.requestNumber||"";$("installationCompletionInvoiceNumber").value=r.report?.invoice_number||r.collectionInvoiceNumber||"";const noInv=$("installationCompletionNoInvoice");if(noInv)noInv.checked=false;syncCompletionNoInvoiceOption();$("installationCompletionInvoiceDate").value=r.report?.invoice_date||r.scheduledDate||today();let invoiceValue=Math.round(Number(r.invoiceAmount||0)*1.15);if(r.confirmedHistory&&r.visitId){const financials=await window.InstallationsServiceSafe.completionInvoiceFinancials(r.id,r.visitId);invoiceValue=Math.round(Number(financials.finalAmountIncludingTax||0));}$("installationCompletionInvoiceAmount").value=String(Math.max(0,invoiceValue));$("installationCompletionInstallationExpenses").value=Number(r.installationExpenses||0).toFixed(2);$("installationCompletionBeforePhotos").value="";$("installationCompletionAfterPhotos").value="";$("installationCompletionDeliveryAuthorization").value="";showFiles(r);status($("installationCompletionFormStatus"),"");$("installationCompletionDialog").showModal()}
  function openQuotation(q){if(!can("add","salesInvoices")){alert(t('appointments.completion.error.salesInvoicePermission','You do not have permission to add sales invoices.'));return}setMode("quotation");current=q;$("installationCompletionRequestId").value=q.quotationId;$("installationCompletionRequestLabel").textContent=`${q.quotationCode||q.requestNumber} — ${q.customerName}`;$("installationCompletionCustomer").textContent=q.customerName||"—";$('installationCompletionTechnician').textContent=t('appointments.common.notApplicable','Not applicable');$('installationCompletionDate').textContent=t('appointments.completion.directContract','Direct contract');$("installationCompletionAddress").textContent=q.customerPhone||"—";$("installationCompletionWorkSummary").value="";$("installationCompletionRecipientName").value="";$("installationCompletionCustomerOrderNumber").value=q.requestNumber||q.quotationCode||"";$("installationCompletionInvoiceNumber").value="";$("installationCompletionInvoiceDate").value=today();$("installationCompletionInvoiceAmount").value=Number(q.invoiceAmount||0).toFixed(2);$("installationCompletionInstallationExpenses").value="0.00";status($("installationCompletionFormStatus"),"");$("installationCompletionDialog").showModal()}
  document.addEventListener("DOMContentLoaded",()=>{
    window.addEventListener("kyum-view-changed",e=>{if(e.detail?.view==="installationCompletion")load()});window.addEventListener("petatoe-language-changed",()=>{if(!document.getElementById("installationCompletionView")?.classList.contains("hidden")){fillReps();render()}if($("installationCompletionDialog")?.open)setMode(mode);if($("installationQuantityConfirmationDialog")?.open&&quantityCurrent){renderWorkspace(quantityDetail||{});if(quantityCurrent.quantities)$("installationQuantityLines").innerHTML=quantityCurrent.quantities.map(quantityLineHtml).join("");syncQuantityResults()}});
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
            status($("installationCompletionStatus"),uiMessage(err?.message,t('appointments.completion.error.openQuantity','Unable to open executed quantity confirmation.')),"error");
          });
        }
        return;
      }
      const cancelBtn=e.target.closest("[data-cancel-confirmed-quantity]");
      if(cancelBtn){
        const r=rows.find(x=>(x.rowKey||x.id)===cancelBtn.dataset.cancelConfirmedQuantity);
        if(!r)return;
        if(!isSuperAdmin()){status($("installationCompletionStatus"),t('appointments.completion.error.cancelSuperAdmin','Cancelling executed quantity is available to Super Admin only.'),"error");return;}
        if(!window.confirm(t('appointments.completion.cancelConfirm','Executed quantity confirmation for visit {number} will be cancelled and returned to pending confirmation. Continue?',{number:r.executionNumber||r.requestNumber})))return;
        const reason=window.prompt(t('appointments.completion.cancelReason','Reason for cancelling executed quantity confirmation (optional):'),'')||"";
        cancelBtn.disabled=true;
        window.InstallationsServiceSafe.cancelConfirmedQuantity({id:r.id,visitId:r.visitId,visitIds:r.confirmedVisitIds?.length?r.confirmedVisitIds:(r.groupVisitIds||[r.visitId]),reason}).then(()=>load()).catch(err=>status($("installationCompletionStatus"),err.message,"error")).finally(()=>{cancelBtn.disabled=false});
        return;
      }
      const att=e.target.closest("[data-completion-attachments]");
      if(att){const r=rows.find(x=>(x.rowKey||x.id)===att.dataset.completionAttachments);if(r)openCompletionAttachments(r);return}
      const b=e.target.closest("[data-installation-completion]");
      if(b){const r=rows.find(x=>(x.rowKey||x.id)===b.dataset.installationCompletion);if(r)openInstallation(r).catch(err=>status($("installationCompletionStatus"),uiMessage(err?.message,t('appointments.completion.error.prepareInvoice','Unable to prepare invoice data.')),"error"))}
    });
    $("installationCompletionExistingFiles")?.addEventListener("click",async e=>{const b=e.target.closest("[data-open-installation-file]");if(!b)return;b.disabled=true;try{const url=await window.InstallationsServiceSafe.signedFileUrl(b.dataset.openInstallationFile);window.open(url,"_blank","noopener,noreferrer")}catch(err){status($('installationCompletionFormStatus'),uiMessage(err.message,t('appointments.completion.error.saveInvoice','Unable to save invoice.')),'error')}finally{b.disabled=false}});
    $("installationQuantityLines")?.addEventListener("input",e=>{if(e.target.matches(".installation-confirmed-qty")){normalizeNumericInput(e.target,{integer:true});syncQuantityResults()}});
    $("addInstallationQuantityService")?.addEventListener("click",()=>{$("installationQuantityServiceEditorBody").insertAdjacentHTML("beforeend",serviceEditorRowHtml());quantityWorkspaceDirty=true;syncWorkspaceFinancials()});
    $("installationQuantityServiceEditorBody")?.addEventListener("click",e=>{const b=e.target.closest(".installation-confirmation-service-remove");if(!b)return;const rows=document.querySelectorAll(".installation-confirmation-service-row");if(rows.length<=1){status($("installationQuantityConfirmationStatus"),t('appointments.completion.validation.oneService','At least one service must remain.'),"error");return}b.closest("tr")?.remove();syncWorkspaceFinancials()});
    $("installationQuantityServiceEditorBody")?.addEventListener("input",e=>{if(e.target.matches(".installation-confirmation-service-qty"))normalizeNumericInput(e.target,{integer:true});if(e.target.matches(".installation-confirmation-service-price"))normalizeNumericInput(e.target);syncWorkspaceFinancials()});
    $("installationQuantityServiceEditorBody")?.addEventListener("change",e=>{if(e.target.matches(".installation-confirmation-service-type")){const opt=quantityOptions.serviceTypes.find(x=>String(x.id)===String(e.target.value));const row=e.target.closest("tr");if(opt&&row&&Number(row.querySelector(".installation-confirmation-service-price").value||0)===0)row.querySelector(".installation-confirmation-service-price").value=Number(opt.default_price||0).toFixed(2);syncWorkspaceFinancials()}});
    $("installationQuantityDiscountAmount")?.addEventListener("input",e=>{normalizeNumericInput(e.target);syncWorkspaceFinancials()});
    $("installationQuantityAmountCollected")?.addEventListener("input",e=>{quantityCollectionTouched=true;normalizeNumericInput(e.target);syncWorkspaceFinancials()});
    $("installationQuantityAmountCollected")?.addEventListener("change",e=>{quantityCollectionTouched=true;const f=workspaceFinancials();const value=Math.max(0,Math.round(Number(e.target.value||0)));e.target.value=String(Math.min(value,Math.max(0,Math.round(f.final))));syncWorkspaceFinancials()});
    ["installationQuantityPaymentMethod","installationQuantityInvoiceNumber","installationQuantityCollectionNotes"].forEach(id=>$(id)?.addEventListener(id==="installationQuantityPaymentMethod"?"change":"input",()=>{quantityWorkspaceDirty=true}));
    $("installationQuantityInvoiceDate")?.addEventListener("change",()=>status($("installationQuantityConfirmationStatus"),""));
    $("viewInstallationQuantityAttachments")?.addEventListener("click",()=>{if(quantityCurrent)openCompletionAttachments(quantityCurrent)});
    $("installationQuantityAttachments")?.addEventListener("change",e=>{if((e.target.files?.length||0)>6){status($("installationQuantityConfirmationStatus"),t('appointments.completion.validation.maxAttachments','Maximum 6 attachments per confirmation.'),"error");e.target.value="";return}status($("installationQuantityConfirmationStatus"),"")});
    $("installationQuantityNoInvoice")?.addEventListener("change",()=>{syncNoInvoiceOption();quantityWorkspaceDirty=true});
    $("saveInstallationQuantityWorkspace")?.addEventListener("click",async()=>{const btn=$("saveInstallationQuantityWorkspace");btn.disabled=true;try{status($("installationQuantityConfirmationStatus"),t('appointments.completion.savingWorkspace','Saving service and collection updates...'));await saveWorkspace();status($("installationQuantityConfirmationStatus"),t('appointments.completion.workspaceSaved','Services and collection were saved and visit quantities updated.'))}catch(err){status($('installationQuantityConfirmationStatus'),uiMessage(err.message,t('appointments.completion.error.quantityAction','Unable to complete quantity action.')),'error')}finally{btn.disabled=false}});
    $("confirmInstallationQuantityCollectionRecovery")?.addEventListener("click",async()=>{
      const btn=$("confirmInstallationQuantityCollectionRecovery");
      if(!quantityCurrent?.id||!quantityCurrent?.visitId)return;
      btn.disabled=true;
      try{
        status($("installationQuantityConfirmationStatus"),t('appointments.completion.recoveryChecking','Checking collection data for the pending case...'));
        if(quantityWorkspaceDirty)await saveWorkspace();
        const state=await refreshCollectionRecoveryState();
        if(!state?.eligible||state?.confirmed){
          status($("installationQuantityConfirmationStatus"),state?.confirmed?t('appointments.completion.recoveryAlreadyConfirmed','Collection stage is already confirmed.'):(uiMessage(state?.reason,t('appointments.completion.recoveryNotNeeded','This case does not require collection-stage recovery.'))) );
          return;
        }
        const amount=Math.max(0,Number($("installationQuantityAmountCollected")?.value||0));
        const payment=String($("installationQuantityPaymentMethod")?.value||'').trim();
        const f=workspaceFinancials();
        if(moneyCents(amount)>moneyCents(f.final))throw new Error(t('appointments.completion.validation.collectionExceedsFinalShort','Collected amount cannot exceed final total.'));
        if(moneyCents(f.final)>0&&moneyCents(amount)<=0)throw new Error(t('appointments.completion.validation.collectionRequired','Record the actual collected amount before confirming the collection stage.'));
        if(amount>0&&!payment)throw new Error(t('appointments.completion.validation.paymentRequired','Select a payment method before confirming the collection stage.'));
        if(!window.confirm(t('appointments.completion.recoveryConfirm','The missing collection stage will be recorded only for this completed visit using the current collection data. Continue?')))return;
        await window.InstallationsServiceSafe.recoverCompletionCollectionStage({id:quantityCurrent.id,visitId:quantityCurrent.visitId,amountCollected:amount,paymentMethod:payment,notes:$("installationQuantityCollectionNotes")?.value.trim()||''});
        quantityDetail=await window.InstallationsServiceSafe.requestEditDetail(quantityCurrent.id);
        renderWorkspace(quantityDetail);
        await refreshCollectionRecoveryState();
        status($("installationQuantityConfirmationStatus"),t('appointments.completion.recoverySuccess','Collection stage confirmed for the pending case. You can now confirm quantity and create the invoice.'));
      }catch(err){status($('installationQuantityConfirmationStatus'),uiMessage(err.message,t('appointments.completion.error.quantityAction','Unable to complete quantity action.')),'error')}
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
        if(quantityWorkspaceDirty){status($("installationQuantityConfirmationStatus"),t('appointments.completion.savingBeforeConfirm','Saving service and collection updates before confirmation...'));await saveWorkspace();}
        const lines=[...document.querySelectorAll(".installation-confirmed-qty")].map(input=>({
          requestServiceId:input.dataset.requestServiceId,
          scheduledQuantity:Number(input.dataset.scheduled||0),
          executedQuantity:Number(input.value||0)
        }));
        if(!lines.length)throw new Error(t('appointments.completion.validation.noServicesToConfirm','No services are available for confirmation.'));
        lines.forEach(x=>{const source=quantityCurrent.quantities.find(q=>q.requestServiceId===x.requestServiceId);if(x.executedQuantity<0||x.executedQuantity>Number(source?.remainingQuantity||0))throw new Error(t('appointments.completion.validation.executedExceedsRemaining','Executed quantity cannot exceed the remaining appointment quantity.'));});
        const remaining=lines.reduce((n,x)=>{const source=quantityCurrent.quantities.find(q=>q.requestServiceId===x.requestServiceId);return n+Math.max(Number(source?.remainingQuantity||0)-x.executedQuantity,0)},0);
        const decision=quantityDecision();
        let action=remaining===0?"completed":($("installationQuantityRemainingAction")?.value||"return_to_schedule");
        if(remaining>0&&!decision.mismatch&&quantityCurrent.nextScheduledVisit)action="preserve_existing";
        let schedule=null;
        const directWithoutInvoice=Boolean($("installationQuantityNoInvoice")?.checked);
        const directInvoiceNumber=directWithoutInvoice?'':$("installationQuantityInvoiceNumber")?.value.trim()||'';
        const directInvoiceDate=$("installationQuantityInvoiceDate")?.value||'';
        const attachments=[...($("installationQuantityAttachments")?.files||[])];
        const shouldCreateInvoice=Boolean(directWithoutInvoice||directInvoiceNumber);
        if(shouldCreateInvoice&&!directInvoiceDate)throw new Error(t('appointments.completion.validation.invoiceDateForConversion','Invoice date is required when converting to an invoice.'));
        if(shouldCreateInvoice&&!quantityCurrent.visitId)throw new Error(t('appointments.completion.validation.directInvoiceVisitOnly','Direct invoice conversion is available for execution visits only.'));
        if(shouldCreateInvoice){
          const recoveryState=await refreshCollectionRecoveryState();
          if(recoveryState?.eligible&&!recoveryState?.confirmed)throw new Error(t('appointments.completion.validation.recoveryFirst','This visit is pending without a collection-stage marker. Use Confirm Recorded Collection Stage first, then confirm quantity again.'));
          status($("installationQuantityConfirmationStatus"),t('appointments.completion.confirmingAndInvoice','Confirming quantity and creating invoice...'));
          await window.InstallationsServiceSafe.confirmActualQuantitiesAndInvoice({
            id:quantityCurrent.id,visitId:quantityCurrent.visitId,groupVisitIds:quantityCurrent.groupVisitIds||[],lines,remainingAction:action,schedule,
            notes:$("installationQuantityConfirmationNotes").value.trim(),attachments,
            invoiceNumber:directInvoiceNumber,invoiceDate:directInvoiceDate,withoutInvoice:directWithoutInvoice
          });
          window.dispatchEvent(new CustomEvent("kyum-installation-quantities-confirmed",{detail:{requestId:quantityCurrent.id,action,directInvoice:true}}));
          window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"installation",requestId:quantityCurrent.id,visitId:quantityCurrent.visitId}}));
          $("installationQuantityConfirmationDialog").close();
          window.KYUMNavigation?.open?.("salesInvoices",{trustedNavigation:true});
          return;
        }
        status($("installationQuantityConfirmationStatus"),t('appointments.completion.confirmingExecution','Confirming actual execution...'));
        await window.InstallationsServiceSafe.confirmActualQuantities({
          id:quantityCurrent.id,visitId:quantityCurrent.visitId||null,groupVisitIds:quantityCurrent.groupVisitIds||[],lines,remainingAction:action,schedule,
          notes:$("installationQuantityConfirmationNotes").value.trim(),attachments
        });
        window.dispatchEvent(new CustomEvent("kyum-installation-quantities-confirmed",{detail:{requestId:quantityCurrent.id,action}}));
        $("installationQuantityConfirmationDialog").close();
        await load();
      }catch(err){status($('installationQuantityConfirmationStatus'),uiMessage(err.message,t('appointments.completion.error.quantityAction','Unable to complete quantity action.')),'error')}
      finally{btn.disabled=false}
    });

    $("closeInstallationCompletionDialog")?.addEventListener("click",()=>$("installationCompletionDialog").close());
    $("cancelInstallationCompletion")?.addEventListener("click",()=>$("installationCompletionDialog").close());
    $("installationCompletionNoInvoice")?.addEventListener("change",syncCompletionNoInvoiceOption);
    $("installationCompletionForm")?.addEventListener("submit",async e=>{e.preventDefault();const btn=$("saveInstallationCompletion");btn.disabled=true;try{const withoutInvoice=mode==="installationVisit"&&Boolean($("installationCompletionNoInvoice")?.checked),invoiceNumber=withoutInvoice?'':$("installationCompletionInvoiceNumber").value.trim(),invoiceDate=$("installationCompletionInvoiceDate").value;if(!withoutInvoice&&!invoiceNumber)throw new Error(t('appointments.completion.validation.invoiceNumberOrNoInvoice','Invoice number is required or select No Invoice.'));if(!invoiceDate)throw new Error(t('appointments.completion.validation.invoiceDate','Invoice date is required.'));status($("installationCompletionFormStatus"),t('appointments.completion.savingInvoice','Saving invoice...'));if(mode==="quotation"){await window.SalesInvoicesService.createFromQuotation({quotationId:current.quotationId,invoiceNumber,invoiceDate});await window.QuotationsService?.invalidateCache?.();window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"quotation"}}))}else if(mode==="installationVisit"){await window.SalesInvoicesService.createFromInstallationVisit({installationRequestId:current.id,visitId:current.visitId,groupVisitIds:current.groupVisitIds||[],invoiceNumber,invoiceDate,withoutInvoice});window.dispatchEvent(new CustomEvent("kyum-sales-invoice-created",{detail:{sourceType:"installation",requestId:current.id,visitId:current.visitId}}))}else{const deliveryFile=$("installationCompletionDeliveryAuthorization").files[0]||null,before=[...$("installationCompletionBeforePhotos").files],after=[...$("installationCompletionAfterPhotos").files],hasStoredDelivery=current.files.some(f=>f.file_kind==="delivery_authorization");if(before.length+after.length>12)throw new Error(t('appointments.completion.validation.maxPhotos','Maximum 12 photos per operation.'));if(!deliveryFile&&!hasStoredDelivery)throw new Error(t('appointments.completion.validation.deliveryRequired','Customer delivery authorization image is required to complete conversion.'));await window.InstallationsServiceSafe.saveCompletion({id:current.id,workSummary:$("installationCompletionWorkSummary").value.trim(),recipientName:$("installationCompletionRecipientName").value.trim(),invoiceNumber,invoiceDate,beforePhotos:before,afterPhotos:after,deliveryAuthorizationFile:deliveryFile})}$("installationCompletionDialog").close();window.KYUMNavigation?.open?.("salesInvoices",{trustedNavigation:true});if(mode==="installation"||mode==="installationVisit")await load()}catch(err){status($('installationCompletionFormStatus'),uiMessage(err.message,t('appointments.completion.error.saveInvoice','Unable to save invoice.')),'error')}finally{btn.disabled=false}});
  });
})();
