(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const localDateKey=(value=new Date())=>{const d=value instanceof Date?value:new Date(value);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const today=()=>localDateKey(new Date());
let rows=[], current=null, activeTab='today', selectedFiles=[], executionIdentity=null, selectedCurrentId='';
function setStatus(el,msg,type=''){if(!el)return;el.textContent=msg||'';el.className=`data-status${msg?'':' hidden'}${type?` ${type}`:''}`}
function fmtTime(v){if(!v)return'غير محدد';try{return new Date(`2000-01-01T${v}`).toLocaleTimeString('ar-SA-u-ca-gregory',{hour:'numeric',minute:'2-digit'})}catch{return v}}
function money(v){return `SAR ${Number(v||0).toFixed(2)}`}
function executionScheduleLabel(r){const slots=Array.isArray(r.slotTimes)?r.slotTimes.filter(Boolean):[];if(slots.length>1){const sorted=[...new Set(slots)].sort();return `${sorted.length} مواعيد — من ${fmtTime(sorted[0])} إلى ${fmtTime(sorted[sorted.length-1])}`;}return fmtTime(r.scheduledTime)}
function normalizeStatus(v){return String(v||'مسند').trim()}
function hasExecutionProgress(r){return Boolean(r.onRouteAt||r.mapOpenedAt||r.arrivedAt||r.startedAt||r.completedAt)||['في الطريق','وصل إلى العميل','قيد التنفيذ','مكتمل'].includes(normalizeStatus(r.status))}
function isActive(r){return Boolean(r.isCurrentUserSelection)&&!['مكتمل','ملغي'].includes(normalizeStatus(r.status))}
function stepIndex(r){if(r.completedAt)return 5;if(r.startedAt)return 4;if(r.arrivedAt)return 3;if(r.mapOpenedAt)return 2;if(r.onRouteAt)return 1;return 0}
function switchTab(tab){activeTab=tab;const todayTab=$('installationExecutionTodayTab'),currentTab=$('installationExecutionCurrentTab');todayTab?.classList.toggle('active',tab==='today');currentTab?.classList.toggle('active',tab==='current');todayTab?.setAttribute('aria-selected',String(tab==='today'));currentTab?.setAttribute('aria-selected',String(tab==='current'));$('installationExecutionTodayPanel')?.classList.toggle('hidden',tab!=='today');$('installationExecutionCurrentPanel')?.classList.toggle('hidden',tab!=='current');if(tab==='current')renderCurrent()}
function executionRowsForSelectedDate(){
  const date=$('installationExecutionDateFilter')?.value||today();
  return rows.filter(r=>r.scheduledDate===date&&!['مكتمل','ملغي'].includes(normalizeStatus(r.status)));
}
function syncTechnicianFilter(){
  const tech=$('installationExecutionTechnicianFilter');
  if(!tech)return;
  const teamValue=$('installationExecutionTeamFilter')?.value||'';
  const lockIdentity=executionIdentity?.lockIdentity===true;
  const availableRows=executionRowsForSelectedDate().filter(r=>!teamValue||r.teamId===teamValue);
  const vals=[...new Set(availableRows.map(r=>r.groomerName||r.technicianName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
  const previous=tech.value||'';
  if(lockIdentity){
    const ownName=executionIdentity.technicianName||'';
    const hasOwnRequests=Boolean(ownName)&&vals.includes(ownName);
    tech.innerHTML=hasOwnRequests
      ?`<option value="${esc(ownName)}">${esc(ownName)}</option>`
      :'<option value="">لا توجد طلبات للجرومر في التاريخ المحدد</option>';
    tech.value=hasOwnRequests?ownName:'';
    tech.disabled=true;
    tech.setAttribute('aria-readonly','true');
    tech.title=hasOwnRequests?'الجرومر مرتبط بالحساب ومثبت على نطاق فرقته':'لا توجد طلبات مسندة للجرومر في التاريخ المحدد';
    return;
  }
  tech.disabled=false;
  tech.removeAttribute('aria-readonly');
  tech.removeAttribute('title');
  tech.innerHTML='<option value="">كل الجرومر</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  tech.value=vals.includes(previous)?previous:'';
}
function fillFilters(){
  const team=$('installationExecutionTeamFilter');
  const lockIdentity=executionIdentity?.lockIdentity===true;
  if(team){
    const previous=team.value||'';
    const map=new Map(rows.filter(r=>r.teamId).map(r=>[r.teamId,r.teamName||'فرقة غير مسماة']));
    if(lockIdentity){
      team.innerHTML=`<option value="${esc(executionIdentity.teamId)}">${esc(executionIdentity.teamName||'الفرقة المرتبطة')}</option>`;
      team.value=executionIdentity.teamId;
      team.disabled=true;
      team.setAttribute('aria-readonly','true');
      team.title='الفرقة مرتبطة بحساب الجرومر / السائق ومثبتة على نطاقه';
    }else{
      team.disabled=false;
      team.removeAttribute('aria-readonly');
      team.removeAttribute('title');
      team.innerHTML='<option value="">كل الفرق المسموح بها</option>'+[...map].sort((a,b)=>a[1].localeCompare(b[1],'ar')).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
      team.value=map.has(previous)?previous:'';
    }
  }
  syncTechnicianFilter();
}
function filteredToday(){const date=$('installationExecutionDateFilter')?.value||today(),tech=$('installationExecutionTechnicianFilter')?.value||'',team=$('installationExecutionTeamFilter')?.value||'';return rows.filter(r=>r.scheduledDate===date&&!isActive(r)&&!hasExecutionProgress(r)&&!['مكتمل','ملغي'].includes(normalizeStatus(r.status))&&(!tech||(r.groomerName||r.technicianName)===tech)&&(!team||r.teamId===team))}
function servicesHtml(r){return (r.services||[]).length?`<ul class="installation-card-services">${r.services.map(s=>`<li><span>${esc(s.name)}</span><strong>${Number(s.quantity||0)} ×</strong></li>`).join('')}</ul>`:'<p class="installation-card-muted">لا توجد خدمات مسجلة.</p>'}
function cardHtml(r){const notes=String(r.displayNotes||'').trim();return `<article class="installation-today-card"><div class="installation-today-card-main"><div class="installation-today-card-head"><span class="installation-time">${esc(executionScheduleLabel(r))}</span><span class="installation-request-number">${esc(r.executionNumber||r.requestNumber)}</span></div><div class="installation-customer-name">${esc(r.customerName||'عميل غير محدد')}</div><div class="installation-customer-phone">رقم العميل: <strong>${esc(r.customerPhone||'غير مسجل')}</strong></div><div class="installation-card-muted">${esc(r.installationAddress||'لا يوجد عنوان')}</div><div class="installation-card-muted">الجرومر: ${esc(r.groomerName||r.technicianName||'غير محدد')}</div><div class="installation-card-muted">السائق: ${esc(r.driverName||'غير محدد')}</div><div class="installation-card-muted">الفرقة: ${esc(r.teamName||'بدون فرقة')}</div>${servicesHtml(r)}${notes?`<div class="installation-assignment-notes"><strong>ملاحظات:</strong><span>${esc(notes)}</span></div>`:''}</div><div class="installation-today-card-side"><div class="installation-metrics"><span>عدد الخدمات: <strong>${Number(r.totalServicesCount||0)}</strong></span><span>الإجمالي: <strong>${money(r.totalServicesAmount)}</strong></span></div><div class="installation-card-actions"><button class="execution-primary-action" type="button" data-execution-start="${esc(r.scheduleEntryId||r.id)}">بدء التنفيذ <span class="execution-arrow">◀</span></button></div></div></article>`}
function renderToday(){const list=filteredToday(),box=$('installationExecutionTodayCards');if($('installationExecutionTodayCount'))$('installationExecutionTodayCount').textContent=String(list.length);if(!box)return;box.innerHTML=list.length?list.map(cardHtml).join(''):'<div class="execution-empty-state"><h4>لا توجد طلبات لهذا اليوم</h4><p>لا توجد طلبات متاحة ضمن الفرق والصلاحيات الحالية.</p></div>'}
function fmtDateTime(v){if(!v)return'';try{return new Date(v).toLocaleTimeString('ar-SA-u-ca-gregory',{hour:'numeric',minute:'2-digit'})}catch{return''}}
function durationLabel(a,b){if(!a||!b)return'';const mins=Math.max(0,Math.round((new Date(b)-new Date(a))/60000));if(mins<60)return`${mins} دقيقة`;const h=Math.floor(mins/60),m=mins%60;return m?`${h} ساعة و${m} دقيقة`:`${h} ساعة`}
function mapButton(r){const href=r.customerMapUrl||(r.installationAddress?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.installationAddress)}`:'');return href?`<a class="execution-map-btn" data-execution-map="${esc(r.scheduleEntryId||r.id)}" href="${esc(href)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a>`:'<span class="installation-card-muted">لا يوجد رابط موقع مسجل</span>'}
function stepperHtml(r){const steps=[
 {label:'بدء التحرك',icon:'🚗',time:r.onRouteAt},
 {label:'فتح موقع العميل',icon:'⌖',time:r.mapOpenedAt},
 {label:'وصل الموقع',icon:'📍',time:r.arrivedAt},
 {label:'بدء الموعد',icon:'🔧',time:r.startedAt},
 {label:'تم الانتهاء',icon:'✓',time:r.completedAt}
];const idx=stepIndex(r);const items=[];steps.forEach((x,i)=>{items.push(`<div class="execution-step ${i<idx?'done':''} ${i===idx?'active':''}"><div class="execution-step-circle">${x.icon}</div><div class="execution-step-label">${x.label}</div><time class="execution-step-time ${x.time?'':'is-empty'}">${x.time?esc(fmtDateTime(x.time)):'لم تبدأ'}</time></div>`);if(i<steps.length-1){const duration=durationLabel(x.time,steps[i+1].time);items.push(`<div class="execution-step-connector ${duration?'has-duration':''}">${duration?`<span>${esc(duration)}</span>`:''}</div>`)}});return `<div class="panel execution-stepper"><h3>مسار تنفيذ الطلب</h3><div class="execution-steps">${items.join('')}</div></div>`}
function nextStage(r){if(!r.onRouteAt)return{label:'بدء التحرك',action:'status',next:'في الطريق',hint:'اضغط لبدء التحرك وتسجيل الوقت الحالي.',icon:'🚗'};if(!r.mapOpenedAt)return{label:'فتح موقع العميل',action:'map',hint:'افتح موقع العميل في خرائط جوجل لتسجيل وقت فتح الموقع.',icon:'⌖'};if(!r.arrivedAt)return{label:'وصلت إلى الموقع',action:'status',next:'وصل إلى العميل',hint:'سجّل الوصول عند الوصول الفعلي.',icon:'📍'};if(!r.startedAt)return{label:'بدء الموعد',action:'status',next:'قيد التنفيذ',hint:'ابدأ الموعد بعد التأكد من جاهزية الموقع.',icon:'🔧'};if(!r.completedAt)return{label:'تم الانتهاء من الموعد',action:'status',next:'مكتمل',hint:'أضف الصور والملاحظات ثم اعتمد الانتهاء.',icon:'✓'};return null}
function currentHtml(r){const canEdit=executionIdentity?.canEdit===true;const stage=nextStage(r);const stageIndex=stepIndex(r);const stageButton=canEdit?(stage?.action==='map'?mapButton(r):stage?`<button class="execution-primary-action" type="button" data-execution-next="${esc(stage.next)}">${esc(stage.label)} <span class="execution-arrow">◀</span></button>`:''):'';const observerNote=!canEdit?'<div class="execution-observer-note">عرض ومتابعة فقط — لا توجد صلاحية لتغيير مراحل التنفيذ.</div>':'';const documentation=canEdit?`<div class="panel execution-documentation"><h3>التوثيق (اختياري)</h3><div class="execution-doc-grid"><label class="execution-upload-box"><input id="installationExecutionPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple><strong>رفع صور التنفيذ</strong><small>اسحب الصور هنا أو اضغط للاختيار</small><div id="installationExecutionPhotoList" class="execution-photo-list"></div></label><label class="execution-notes-box">ملاحظات التنفيذ<textarea id="installationExecutionNotes" maxlength="2000" placeholder="اكتب ملاحظاتك هنا (اختياري)">${esc(r.executionNotes||'')}</textarea></label></div><div class="execution-completion-note">بعد إنهاء الخطوات والتوثيق ينتقل الطلب تلقائيًا إلى شاشة تأكيد انتهاء المواعيد.</div></div>`:'';return `<div class="execution-current-shell">${observerNote}<div class="panel execution-current-summary"><div><h2>${esc(r.executionNumber||r.requestNumber)}</h2><div class="execution-summary-grid"><div class="execution-summary-item"><span>العميل</span><strong>${esc(r.customerName||'—')}</strong></div><div class="execution-summary-item"><span>الهاتف</span><strong>${esc(r.customerPhone||'—')}</strong></div><div class="execution-summary-item"><span>الوقت المحدد</span><strong>${esc(executionScheduleLabel(r))}</strong></div><div class="execution-summary-item"><span>الخدمات</span><strong>${Number(r.totalServicesCount||0)} خدمات</strong></div></div></div><div><div class="execution-summary-item"><span>العنوان</span><strong>${esc(r.installationAddress||'—')}</strong></div><p>الفرقة: <strong>${esc(r.teamName||'بدون فرقة')}</strong></p><p>الجرومر: <strong>${esc(r.groomerName||r.technicianName||'غير محدد')}</strong></p><p>السائق: <strong>${esc(r.driverName||'غير محدد')}</strong></p><div class="execution-location-actions">${mapButton(r)}${executionIdentity?.canReturnToSchedule===true?`<button class="execution-return-schedule-btn" type="button" data-return-to-schedule="${esc(r.id)}">إلغاء وإعادة إلى شاشة الجدولة</button>`:''}</div></div></div>${stepperHtml(r)}${stage?`<div class="panel execution-current-stage" style="--active-stage:${Math.min(4,Math.max(0,stageIndex))}"><span class="execution-stage-pointer" aria-hidden="true"></span><div class="execution-stage-icon">${stage.icon}</div><div class="execution-stage-copy"><small>المرحلة الحالية</small><h3>${esc(stage.label)}</h3><p>${esc(stage.hint)}</p></div><div class="execution-stage-action">${stageButton}</div></div>`:''}${documentation}</div>`}
function currentRequestCandidates(){const map=new Map();rows.filter(r=>r.isCurrentUserSelection===true).forEach(r=>{const key=r.scheduleEntryId||r.id;if(!map.has(key))map.set(key,r)});return [...map.values()].sort((a,b)=>new Date(b.selectedForExecutionAt||0)-new Date(a.selectedForExecutionAt||0))}
function currentSelectorHtml(candidates){if(candidates.length<2)return'';return `<div class="execution-current-selector panel"><div><h3>الطلبات قيد التنفيذ</h3><p>اختر طلبًا لمتابعة موقف التنفيذ.</p></div><div class="execution-current-selector-list">${candidates.map(r=>`<button type="button" class="execution-current-selector-btn ${(r.scheduleEntryId||r.id)===(current?.scheduleEntryId||current?.id)?'active':''}" data-current-request="${esc(r.scheduleEntryId||r.id)}"><strong>${esc(r.executionNumber||r.requestNumber)}</strong><span>${esc(r.customerName||'عميل غير محدد')}</span><small>${esc(r.groomerName||r.technicianName||'جرومر غير محدد')} — ${esc(normalizeStatus(r.status))}</small></button>`).join('')}</div></div>`}
function renderCurrent(){const box=$('installationExecutionCurrentContent');if(!box)return;const candidates=currentRequestCandidates();if(!candidates.length){current=null;selectedCurrentId='';$('installationExecutionCurrentBadge')?.classList.add('hidden');box.innerHTML='<div class="panel execution-empty-state"><div class="execution-empty-icon">⌁</div><h4>لا توجد طلبات قيد التنفيذ ضمن نطاقك</h4><p>تظهر هنا الطلبات الجارية التي تسمح بها صلاحياتك ونطاق بياناتك.</p></div>';return}const preferred=candidates.find(r=>(r.scheduleEntryId||r.id)===selectedCurrentId&&r.isCurrentUserSelection===true)||candidates.find(r=>r.isCurrentUserSelection===true);current=preferred;selectedCurrentId=current.scheduleEntryId||current.id;$('installationExecutionCurrentBadge')?.classList.remove('hidden');box.innerHTML=currentSelectorHtml(candidates)+currentHtml(current);bindPhotoInput()}
function bindPhotoInput(){const input=$('installationExecutionPhotos');if(!input)return;input.addEventListener('change',()=>{selectedFiles=[...input.files];const list=$('installationExecutionPhotoList');if(list)list.innerHTML=selectedFiles.map(f=>`<span class="execution-photo-chip">${esc(f.name)}</span>`).join('')})}
async function load({resetDate=false}={}){setStatus($('installationExecutionStatus'),'جاري تحميل طلبات التنفيذ...');try{[rows,executionIdentity]=await Promise.all([window.InstallationsServiceSafe.executionWorkspace(),window.InstallationsServiceSafe.executionIdentity?.()||Promise.resolve(null)]);const dateFilter=$('installationExecutionDateFilter');if(dateFilter&&(resetDate||!dateFilter.value))dateFilter.value=today();fillFilters();renderToday();renderCurrent();setStatus($('installationExecutionStatus'),'')}catch(e){setStatus($('installationExecutionStatus'),e.message,'error')}}
async function startRequest(entryId){const r=rows.find(x=>(x.scheduleEntryId||x.id)===entryId);if(!r)return;try{await window.InstallationsServiceSafe.selectExecutionRequest(r.id,r.visitId||null);await load();switchTab('current')}catch(e){setStatus($('installationExecutionStatus'),e.message,'error')}}
async function advance(nextStatus){if(!current)return;const btn=document.querySelector('[data-execution-next]');if(btn)btn.disabled=true;try{const notes=$('installationExecutionNotes')?.value.trim()||'';await window.InstallationsServiceSafe.advanceExecution({id:current.id,visitId:current.visitId||null,nextStatus,notes,photos:nextStatus==='مكتمل'?selectedFiles:[]});selectedFiles=[];await load();if(nextStatus==='مكتمل'){window.KYUMNavigation?.open?.('installationCompletion',{trustedNavigation:true});document.querySelector('[data-view="installationCompletion"]')?.click()}else switchTab('current')}catch(e){setStatus($('installationExecutionCurrentStatus'),e.message,'error')}finally{if(btn)btn.disabled=false}}
async function returnExecutionToSchedule(requestId){
  if(!requestId||executionIdentity?.canReturnToSchedule!==true)return;
  const reason=String(window.prompt('اكتب سبب إلغاء الجدولة وإعادة الموعد إلى شاشة الجدولة:','')||'').trim();
  if(!reason)return;
  const ok=window.confirm('سيتم حفظ سبب إعادة الجدولة ومرحلة التنفيذ الحالية في تقارير المواعيد، ثم إعادة الطلب إلى شاشة الجدولة. هل تريد المتابعة؟');
  if(!ok)return;
  const btn=document.querySelector('[data-return-to-schedule]');
  if(btn)btn.disabled=true;
  try{
    await window.InstallationsServiceSafe.returnExecutionToSchedule(requestId,reason);
    selectedFiles=[];selectedCurrentId='';current=null;
    await load();
    switchTab('today');
    window.KYUMNavigation?.open?.('installationSchedule',{trustedNavigation:true});
  }catch(e){
    setStatus($('installationExecutionCurrentStatus'),e.message,'error');
  }finally{
    if(btn)btn.disabled=false;
  }
}
document.addEventListener('DOMContentLoaded',()=>{window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='installationExecution')load({resetDate:true})});document.querySelectorAll('[data-execution-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.executionTab)));$('refreshInstallationExecutionBtn')?.addEventListener('click',load);$('installationExecutionTechnicianFilter')?.addEventListener('change',renderToday);$('installationExecutionTeamFilter')?.addEventListener('change',()=>{syncTechnicianFilter();renderToday()});$('installationExecutionDateFilter')?.addEventListener('change',()=>{syncTechnicianFilter();renderToday()});$('installationExecutionTodayCards')?.addEventListener('click',e=>{const start=e.target.closest('[data-execution-start]');if(start)startRequest(start.dataset.executionStart)});$('installationExecutionCurrentContent')?.addEventListener('click',e=>{const choose=e.target.closest('[data-current-request]');if(choose){selectedCurrentId=choose.dataset.currentRequest;renderCurrent();return}const map=e.target.closest('[data-execution-map]');if(map){const row=rows.find(x=>(x.scheduleEntryId||x.id)===map.dataset.executionMap);window.InstallationsServiceSafe.recordMapOpened(row?.id||current?.id,row?.visitId||current?.visitId||null).then(load).catch(err=>setStatus($('installationExecutionCurrentStatus'),err.message,'error'))}const ret=e.target.closest('[data-return-to-schedule]');if(ret){returnExecutionToSchedule(ret.dataset.returnToSchedule);return}const b=e.target.closest('[data-execution-next]');if(b)advance(b.dataset.executionNext)})});
})();
