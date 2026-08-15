(function(){
  const $=id=>document.getElementById(id); let month=new Date();month.setDate(1);let requests=[],technicianNames=[],teams=[],dayLocks=new Map(),bookedTimes=new Map(),multiDayServices=[],multiDayVisits=[],assignmentSaveInFlight=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const desktopScheduleIconMode=()=>window.matchMedia?.('(min-width:1024px) and (hover:hover) and (pointer:fine)')?.matches===true&&Number(window.screen?.width||0)>1024;
  function scheduleLockIcon(isLocked,fallback=''){
    if(!desktopScheduleIconMode())return fallback;
    const paths=isLocked
      ? '<rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>'
      : '<rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 7.5-2"></path>';
    return `<span class="petatoe-desktop-icon installation-lock-svg schedule-lock-icon ${isLocked?'is-locked':'is-unlocked'}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths}</svg></span>`;
  }

  function setSaveState(button,state,originalText){if(!button)return;if(state==='saving'){button.dataset.originalText=originalText||button.textContent;button.disabled=true;button.textContent='جاري الحفظ...';button.classList.add('is-saving')}else if(state==='saved'){button.textContent='تم الحفظ';button.classList.remove('is-saving');button.classList.add('is-saved')}else if(state==='error'){button.textContent='تعذر الحفظ';button.classList.remove('is-saving');button.classList.add('is-save-error')}else{button.disabled=false;button.textContent=button.dataset.originalText||originalText||button.textContent;button.classList.remove('is-saving','is-saved','is-save-error')}}
  function status(el,msg,type='info'){if(!el)return;el.textContent=msg;el.dataset.type=type;el.classList.remove('hidden')}
  function clear(el){el?.classList.add('hidden')}
  function key(d){return localKey(d)}
  function monthTitle(){return new Intl.DateTimeFormat('ar-SA-u-nu-latn',{calendar:'gregory',month:'long',year:'numeric'}).format(month)}
  function fullDate(value){const d=new Date(`${value}T12:00:00`);return new Intl.DateTimeFormat('ar-SA-u-nu-latn',{calendar:'gregory',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}
  function formatTime(value){if(!value)return 'غير محدد';const [h,m='00']=String(value).slice(0,5).split(':').map(Number);if(h===12)return `12:${String(m).padStart(2,'0')} ظهرًا`;if(h<12)return `${h}:${String(m).padStart(2,'0')} صباحًا`;return `${h-12}:${String(m).padStart(2,'0')} مساءً`}
  function money(value){return `SAR ${Number(value||0).toFixed(2)}`}
  function vat(value){return Math.round(Number(value||0)*1.15*100)/100}
  function grossTotal(r){return Number(r?.grossServicesAmount??(Number(r?.totalServicesAmount||0)+Number(r?.taxAmount||0)))}
  function mapBtn(r,cls='execution-primary-action installation-map-primary-action'){const url=String(r?.customerMapUrl||'').trim();return url?`<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">فتح موقع العميل <span class="execution-arrow">◀</span></a>`:''}
  async function openRequestViewDirect(requestId){
    if(!requestId)throw new Error('معرّف الموعد مطلوب.');
    const row=await window.InstallationsServiceSafe.requestEditDetail(requestId);
    const label=$('installationRequestViewLabel'),content=$('installationRequestViewContent'),dialog=$('installationRequestViewDialog');
    if(!label||!content||!dialog)throw new Error('نافذة عرض بيانات الموعد غير متاحة في الصفحة.');
    label.textContent=`${row.requestNumber||'—'} — ${row.customerName||'—'}`;
    const services=(row.services||[]).map(service=>`<div class="installation-view-service-row"><strong>${esc(service.serviceName||service.name||'خدمة')}</strong><span>${Number(service.quantity||0)} × ${money(vat(service.unitPrice))}</span><span>${money(vat(service.lineTotal??Number(service.quantity||0)*Number(service.unitPrice||0)))}</span></div>`).join('')||'<p>لا توجد خدمات.</p>';
    const animals=(row.animals||[]).map(animal=>`<div class="installation-view-service-row"><strong>${esc(animal.petName||'حيوان')}</strong><span>${esc([animal.petType,animal.breed,animal.petSize].filter(Boolean).join(' — ')||'—')}</span><span>العدد: ${Number(animal.quantity||1)}</span></div>`).join('')||'<p>لا توجد بيانات حيوان مسجلة.</p>';
    const collection=row.collection||{};
    content.innerHTML=`<div class="installation-request-view-grid">
      <div><span>رقم الموعد</span><strong>${esc(row.requestNumber||'—')}</strong></div>
      <div><span>اسم العميل</span><strong>${row.customerMasked===true?'بيانات العميل محجوبة':esc(row.customerName||'—')}</strong></div>
      <div><span>رقم العميل</span><strong>${row.customerMasked===true?'محجوب':esc(row.customerPhone||'—')}</strong></div>
      <div><span>رقم العقد</span><strong>${esc(row.quotationNumber||'بدون عقد')}</strong></div>
      <div><span>المندوب</span><strong>${esc(row.representativeName||'—')}</strong></div>
      <div><span>الحي</span><strong>${esc(row.installationAddress||row.district||'—')}</strong></div>
      <div><span>الحالة</span><strong>${esc(row.status||'—')}</strong></div>
      <div><span>تاريخ الموعد</span><strong>${esc(row.scheduledDate||'غير محدد')} ${row.scheduledTime?`— ${esc(row.scheduledTime)}`:''}</strong></div>
      <div><span>الإجمالي شامل الضريبة قبل الخصم</span><strong>${money(grossTotal(row))}</strong></div>
      <div><span>الخصم</span><strong>${money(row.discountAmount)}</strong></div>
      <div><span>ضريبة 15%</span><strong>${money(row.taxAmount)}</strong></div>
      <div><span>الإجمالي النهائي</span><strong>${money(row.finalAmount||grossTotal(row))}</strong></div>
      <div><span>المبلغ المحصل</span><strong>${money(collection.amountCollected||0)}</strong></div>
      <div><span>حالة التحصيل</span><strong>${esc(collection.collectionStatus||'غير محصل')}</strong></div>
      <div><span>طريقة الدفع</span><strong>${esc(collection.paymentMethod||'—')}</strong></div>
      <div><span>ملاحظات</span><strong>${esc(row.notes||'—')}</strong></div>
    </div><section class="installation-view-services"><h4>الخدمات</h4>${services}</section><section class="installation-view-services"><h4>بيانات الحيوان</h4>${animals}</section>`;
    if(!dialog.open)dialog.showModal();
    return true;
  }
  function teamGroomerName(teamId){return teams.find(t=>String(t.id)===String(teamId))?.groomerName||''}
  function teamDriverName(teamId){return teams.find(t=>String(t.id)===String(teamId))?.driverName||''}
  function teamCarName(teamId){return teams.find(t=>String(t.id)===String(teamId))?.carName||''}
  function vehicleIdentity(teamId){const label=String(teamCarName(teamId)||'').trim();const normalized=label.toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();if(/(^|\s)van\s*a(\s|$)/i.test(normalized))return {label:label||'Van A',className:'vehicle-van-a'};if(/(^|\s)van\s*b(\s|$)/i.test(normalized))return {label:label||'Van B',className:'vehicle-van-b'};return {label,className:'vehicle-other'}}
  function requestGroomerName(r){return teamGroomerName(r?.teamId)||String(r?.technicianName||'').trim()}
  function knownNames(){return [...new Set([...teams.map(t=>t.groomerName),...technicianNames,...requests.map(requestGroomerName)].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'))}
  function filtered(){const t=$('installationScheduleTechnicianFilter')?.value||'',s=$('installationScheduleStatusFilter')?.value||'';return requests.filter(r=>(!t||requestGroomerName(r)===t)&&(!s||r.status===s))}
  function renderFilters(){const sel=$('installationScheduleTechnicianFilter'),v=sel?.value||'';if(sel){sel.innerHTML='<option value="">كل الجرومر</option>'+knownNames().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');sel.value=v}fillAssignmentTechnicians()}
  function fillAssignmentTeams(){const sel=$('installationAssignmentTeam');if(!sel)return;const current=sel.value;sel.innerHTML='<option value="">اختر فرقة المواعيد</option>'+teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');sel.value=current}
  function fillAssignmentTechnicians(){const list=$('installationTechnicianNameSuggestions');if(list)list.innerHTML=knownNames().map(n=>`<option value="${esc(n)}"></option>`).join('')}
  function groupByTeam(items){const map=new Map();items.forEach(r=>{const id=r.teamId||'unassigned',name=r.teamName||'بدون فرقة';if(!map.has(id))map.set(id,{id,name,items:[]});map.get(id).items.push(r)});return [...map.values()].sort((a,b)=>{if(a.id==='unassigned')return 1;if(b.id==='unassigned')return -1;return b.items.length-a.items.length||a.name.localeCompare(b.name,'ar')})}
  function teamSummary(items){return groupByTeam(items).map((g,i)=>{const vehicle=vehicleIdentity(g.id);return `<div class="installation-calendar-team-summary ${g.id==='unassigned'?'is-unassigned':''} ${vehicle.className}"><span class="installation-team-dot" style="--team-index:${i}"></span><span>${esc(g.name)}</span><strong>${g.items.length} ${g.items.length===1?'موعد':'مواعيد'}</strong></div>`}).join('')}
  function lockInfo(date){return dayLocks.get(date)||{isLocked:false}}
  function canToggleDayLock(){return canEditSchedule()}
  function dateRange(){const start=new Date();start.setHours(12,0,0,0);start.setDate(start.getDate()-45);const end=new Date();end.setHours(12,0,0,0);end.setFullYear(end.getFullYear()+1);return {from:localKey(start),to:localKey(end)}}
  async function loadDayLocks(){const range=dateRange(),rows=await window.InstallationsServiceSafe.scheduleDayLocks(range.from,range.to);dayLocks=new Map(rows.map(x=>[x.date,x]))}
  function localKey(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
  function populateAssignmentDates(selected){
    const input=$('installationAssignmentDate');
    if(!input)return;
    const today=new Date();today.setHours(0,0,0,0);
    const start=new Date(today);start.setDate(start.getDate()-30);
    if(selected){
      const sd=new Date(`${selected}T12:00:00`);
      if(sd<start)start.setTime(sd.getTime());
    }
    const end=new Date(today);end.setFullYear(end.getFullYear()+1);
    input.min=localKey(start);
    input.max=localKey(end);
    input.value=selected||'';
  }
  async function refreshBookedTimes(){const date=$('installationAssignmentDate')?.value||'',name=$('installationAssignmentTechnicianName')?.value.trim()||'',teamId=$('installationAssignmentTeam')?.value||'',requestId=$('installationAssignmentRequestId')?.value||null,select=$('installationAssignmentTime');if(!select)return;const current=select.value;bookedTimes=new Map();if(date&&(name||teamId)){const rows=await window.InstallationsServiceSafe.technicianBookedTimes(date,name,requestId,teamId);bookedTimes=new Map(rows.map(x=>[x.time,x]))}Array.from(select.options).forEach(opt=>{if(!opt.value)return;const base=opt.dataset.baseLabel||opt.textContent.replace(/\s+—\s+محجوز.*$/,'');opt.dataset.baseLabel=base;const hit=bookedTimes.get(opt.value);opt.disabled=!!hit;opt.textContent=hit?`${base} — محجوز${hit.requestNumber?` — ${hit.requestNumber}`:''}`:base});if(current&&!select.querySelector(`option[value="${CSS.escape(current)}"]:not(:disabled)`))select.value='';else select.value=current}
  function renderCalendar(){const data=filtered(),start=new Date(month),first=new Date(start);first.setDate(1-start.getDay());$('installationScheduleMonthLabel').textContent=monthTitle();$('installationScheduleKpiMonth').textContent=requests.filter(r=>r.scheduledDate?.slice(0,7)===key(start).slice(0,7)).length;$('installationScheduleKpiUnassigned').textContent=requests.filter(r=>!r.teamId||!r.technicianName||!r.scheduledDate||!r.scheduledTime).length;$('installationScheduleKpiAvailable').textContent=knownNames().length;const counts={};requests.forEach(r=>{if(r.scheduledDate)counts[r.scheduledDate]=(counts[r.scheduledDate]||0)+1});$('installationScheduleKpiPeak').textContent=Math.max(0,...Object.values(counts));let html='';for(let i=0;i<42;i++){const d=new Date(first);d.setDate(first.getDate()+i);const dk=key(d),items=data.filter(r=>r.scheduledDate===dk),info=lockInfo(dk),lockButton=canToggleDayLock()?`<button type="button" class="installation-day-lock-toggle" data-toggle-day-lock="${dk}" aria-label="${info.isLocked?'فتح':'إغلاق'} يوم ${esc(fullDate(dk))}" title="${info.isLocked?'فتح اليوم':'إغلاق اليوم'}">${scheduleLockIcon(info.isLocked,info.isLocked?'🔒':'🔓')}</button>`:(info.isLocked?`<span class="installation-day-lock-indicator" title="اليوم مغلق">${scheduleLockIcon(true,'🔒')}</span>`:'');html+=`<div role="button" tabindex="0" class="installation-calendar-day ${d.getMonth()!==start.getMonth()?'is-outside':''} ${dk===key(new Date())?'is-today':''} ${items.length?'has-appointments':''} ${info.isLocked?'is-locked':''}" data-calendar-day="${dk}" aria-label="${esc(fullDate(dk))}، ${items.length} مواعيد${info.isLocked?'، اليوم مغلق':''}"><div class="installation-calendar-day-header"><strong>${d.getDate()}</strong><span class="installation-day-header-actions">${items.length?`<small>${items.length} ${items.length===1?'موعد':'مواعيد'}</small>`:''}${lockButton}</span></div><div class="installation-calendar-day-summary">${items.length?teamSummary(items):'<span class="installation-calendar-empty">لا توجد مواعيد</span>'}</div>${items.length?'<span class="installation-calendar-details-link">عرض التفاصيل</span>':''}${info.isLocked?`<span class="installation-day-lock-glass" aria-hidden="true"><span>${scheduleLockIcon(true,'🔒')}</span></span>`:''}</div>`} $('installationCalendarGrid').innerHTML=html;renderUnscheduled()}
  function servicesHtml(r){if(!r.services?.length)return '<li><span>لا توجد تفاصيل خدمات</span><strong>—</strong></li>';return r.services.map(s=>`<li><span>${esc(s.name)}</span><strong>${Number(s.quantity||0)} × ${money(vat(s.unitPrice))} = ${money(vat(s.lineTotal??Number(s.quantity||0)*Number(s.unitPrice||0)))}</strong></li>`).join('')}
  function servicesSummary(r){if(!r.services?.length)return '—';return r.services.map(s=>`<div class="installation-service-detail"><strong>${esc(s.name)}</strong><small>${Number(s.quantity||0)} × ${money(vat(s.unitPrice))} = ${money(vat(s.lineTotal??Number(s.quantity||0)*Number(s.unitPrice||0)))}</small></div>`).join('')}
  function locationSummary(r){return esc(r.installationAddress||'غير محدد')}
  function appointmentCard(r){
    const canOperate=r.canOperate===true;
    const canReschedule=canOperate&&canEditSchedule();
    const canCancelSchedule=canOperate&&canEditSchedule();
    const readOnlyNote=canOperate?'':'<p class="installation-readonly-note">هذا الموعد للعرض فقط ولا تملك صلاحية تعديل الجدولة.</p>';
    const editButton=canEditSchedule()?`<button class="primary-btn installation-edit-request-btn" type="button" data-day-edit-request="${esc(r.id)}" title="تعديل بيانات الطلب مع الإبقاء على الجدولة الحالية">تعديل الطلب</button>`:'';
    const cancelButton=canCancelSchedule?`<button class="danger-btn installation-cancel-schedule-btn" type="button" data-day-cancel-schedule="${esc(r.id)}" title="إلغاء جميع مواعيد الطلب وإعادته للطلبات المطلوب جدولتها">إلغاء الجدولة</button>`:'';
    const vehicle=vehicleIdentity(r.teamId);
    const direction=String(r?.customerMapUrl||'').trim()?`<a class="secondary-btn installation-day-direction-btn" href="${esc(String(r.customerMapUrl).trim())}" target="_blank" rel="noopener noreferrer">اتجاه</a>`:'';
    const vehicleHtml=vehicle.label?`<span class="installation-vehicle-identity ${vehicle.className}"><i class="installation-vehicle-dot" aria-hidden="true"></i><strong>${esc(vehicle.label)}</strong></span>`:'';
    return `<article class="installation-day-appointment ${canOperate?'':'is-readonly'} ${vehicle.className}"><div class="installation-day-appointment-head"><time>${esc(formatTime(r.scheduledTime))}</time><strong>${esc(r.executionNumber||r.requestNumber)}</strong><span class="status-badge installation-day-mobile-status">${esc(r.status)}</span></div>${r.requestNotes?`<div class="installation-day-request-notes"><strong>ملاحظات:</strong><span>${esc(r.requestNotes)}</span></div>`:''}<div class="installation-day-customer">${r.customerMasked===true?'<strong>بيانات العميل محجوبة</strong><small>لا تملك صلاحية عرض اسم العميل أو رقمه</small>':`<strong>${esc(r.customerName||'عميل غير محدد')}</strong><small>رقم العميل: <bdi>${esc(r.customerPhone||'غير مسجل')}</bdi></small>`}<span>${esc(r.installationAddress||'العنوان غير محدد')}</span>${mapBtn(r)}</div><div class="installation-day-meta"><span>السائق: <strong>${esc(teamDriverName(r.teamId)||'غير مسند')}</strong></span><span>الجرومر: <strong>${esc(requestGroomerName(r)||'غير مسند')}</strong></span>${vehicleHtml}<span class="status-badge">${esc(r.status)}</span></div><div class="installation-day-services"><h5>الخدمات</h5><ul>${servicesHtml(r)}</ul><div class="installation-day-totals"><span>${Number(r.totalServicesCount||0)} خدمة</span><strong>${money(grossTotal(r))}</strong></div></div>${readOnlyNote}<div class="installation-day-primary-actions"><button class="secondary-btn installation-day-view-btn" type="button" data-view-request="${esc(r.id)}">تفاصيل</button>${direction}</div><div class="installation-day-actions">${editButton}<button class="secondary-btn" type="button" data-day-reschedule="${esc(r.id)}" ${canReschedule?'':'disabled aria-disabled="true"'} title="${canReschedule?'إعادة جدولة الموعد':canOperate?'ليست لديك صلاحية تعديل الجدولة':'موعد خارج نطاقك التشغيلي'}">إعادة الجدولة</button>${cancelButton}</div></article>`
  }
  function openDayDetails(date){const items=filtered().filter(r=>r.scheduledDate===date).sort((a,b)=>String(a.scheduledTime).localeCompare(String(b.scheduledTime)));if(!items.length)return;const groups=groupByTeam(items),grid=$('installationDayTeamsGrid'),day=new Date(`${date}T12:00:00`),scheduled=items.filter(r=>['مجدول','مسند'].includes(r.status)).length,inProgress=items.filter(r=>['في الطريق','وصل إلى العميل','قيد التنفيذ'].includes(r.status)).length,completed=items.filter(r=>r.status==='مكتمل').length;$('installationDayDetailsTitle').textContent=fullDate(date);$('installationDayDetailsCount').textContent=`إجمالي المواعيد: ${items.length}`;grid.style.setProperty('--team-count',Math.min(groups.length,4));grid.dataset.teamCount=String(groups.length);const overview=`<section class="installation-day-mobile-overview"><div class="installation-day-date-hero"><div><span>${esc(new Intl.DateTimeFormat('ar-SA-u-nu-latn',{calendar:'gregory',weekday:'long'}).format(day))}</span><strong>${esc(date.replaceAll('-','/'))}</strong></div><b>${day.getDate()}</b></div><div class="installation-day-mobile-kpis"><article><strong>${items.length}</strong><span>إجمالي المواعيد</span></article><article><strong>${scheduled}</strong><span>مجدولة</span></article><article><strong>${inProgress}</strong><span>قيد التنفيذ</span></article><article><strong>${completed}</strong><span>مكتملة</span></article></div></section>`;grid.innerHTML=overview+groups.map((g,i)=>{const vehicle=vehicleIdentity(g.id);return `<section class="installation-day-team-column ${g.id==='unassigned'?'is-unassigned':''} ${vehicle.className}"><header><span class="installation-team-dot" style="--team-index:${i}"></span><h4>${esc(g.name)}</h4><strong>${g.items.length} ${g.items.length===1?'موعد':'مواعيد'}</strong></header><div class="installation-day-team-list">${g.items.map(appointmentCard).join('')}</div></section>`}).join('');$('installationDayDetailsDialog').showModal()}
  function renderUnscheduled(){
    const data=requests.filter(r=>!r.scheduledDate||!r.scheduledTime||!r.technicianName||['جديد','بانتظار المراجعة'].includes(r.status));
    $('installationUnscheduledBody').innerHTML=data.length?data.map(r=>{
      const allowed=r.canOperate===true&&canEditSchedule();
      const title=r.canOperate===true?'ليست لديك صلاحية جدولة وإسناد الطلب':'طلب خارج نطاقك التشغيلي ويظهر للمعرفة فقط';
      return `<tr class="${r.canOperate===true?'':'is-readonly'}"><td><strong>${esc(r.requestNumber)}</strong></td><td>${esc(r.customerName)}</td><td class="installation-unscheduled-services">${servicesSummary(r)}</td><td><strong>${money(grossTotal(r))}</strong></td><td><div class="installation-location-stack"><span>${locationSummary(r)}</span>${mapBtn(r)}</div></td><td>${esc(r.status)}</td><td><div class="installation-unscheduled-actions"><button class="secondary-btn" type="button" data-view-request="${r.id}">عرض</button><button class="secondary-btn" type="button" data-edit-request-services="${r.id}" ${allowed?'':'disabled aria-disabled="true"'}>تعديل الخدمات</button><button class="primary-btn" type="button" data-schedule-request="${r.id}" ${allowed?'':'disabled aria-disabled="true"'} title="${allowed?'جدولة وإسناد الطلب':title}">${r.canOperate===true?'جدولة وإسناد':'عرض فقط'}</button></div></td></tr>`
    }).join(''):'<tr><td colspan="7" class="empty-cell">لا توجد طلبات معلقة.</td></tr>'
  }
  async function load(){status($('installationScheduleStatus'),'جاري تحميل جدول المواعيد...');try{[requests,technicianNames,teams]=await Promise.all([window.InstallationsServiceSafe.scheduleList(),window.InstallationsServiceSafe.technicianNameSuggestions(),window.InstallationsServiceSafe.scheduleTeams()]);await loadDayLocks();renderFilters();fillAssignmentTeams();renderCalendar();clear($('installationScheduleStatus'))}catch(e){status($('installationScheduleStatus'),e.message,'error')}}
  function canEditSchedule(){return window.PermissionEngine?.can?.('installationSchedule','edit')===true}
  function syncAssignmentPermission(){
    const button=$('saveInstallationAssignment');
    if(!button)return true;
    const allowed=canEditSchedule();
    button.hidden=false;
    button.classList.remove('hidden');
    button.disabled=!allowed;
    button.setAttribute('aria-disabled',String(!allowed));
    button.title=allowed?'':'ليس لديك صلاحية جدولة وإسناد المواعيد.';
    if(!allowed)status($('installationAssignmentFormStatus'),'ليس لديك صلاحية جدولة وإسناد المواعيد.','error');
    return allowed;
  }
  function renderAssignmentContext(r){
    const neighborhood=$('installationAssignmentNeighborhood'),order=$('installationAssignmentCustomerOrder'),quotation=$('installationAssignmentQuotation'),mapLink=$('installationAssignmentMapLink'),mapEmpty=$('installationAssignmentMapEmpty');
    if(neighborhood)neighborhood.textContent=r.neighborhoodName||r.installationAddress||'—';
    if(order)order.textContent=r.customerOrderNumber||'—';
    if(quotation)quotation.textContent=r.quotationNumber||'بدون عقد';
    const mapUrl=String(r.customerMapUrl||'').trim();
    if(mapLink){mapLink.href=mapUrl||'#';mapLink.classList.toggle('hidden',!mapUrl)}
    if(mapEmpty){mapEmpty.textContent=mapUrl?'':'غير مسجل';mapEmpty.classList.toggle('hidden',!!mapUrl)}
  }
  function renderAssignmentServices(r){const el=$('installationAssignmentServicesSummary');if(!el)return;const services=r.services||[],quantity=services.reduce((a,x)=>a+Number(x.quantity||0),0),amount=grossTotal(r)||Number(services.reduce((a,x)=>a+Number(x.lineTotal??Number(x.quantity||0)*Number(x.unitPrice||0)),0));el.innerHTML=(services.length?services.map(s=>`<div class="installation-assignment-service-row"><strong>${esc(s.name)}</strong><span>${Number(s.quantity||0)} × ${money(vat(s.unitPrice))}</span><span>${money(vat(s.lineTotal??Number(s.quantity||0)*Number(s.unitPrice||0)))}</span></div>`).join(''):'<p>لا توجد خدمات.</p>')+`<div class="installation-assignment-total"><span>إجمالي الطلب</span><strong>${money(amount)}</strong></div>`;if($('installationAssignmentSummaryServices'))$('installationAssignmentSummaryServices').textContent=String(services.length);if($('installationAssignmentSummaryQuantity'))$('installationAssignmentSummaryQuantity').textContent=String(quantity);if($('installationAssignmentSummaryAmount'))$('installationAssignmentSummaryAmount').textContent=money(amount)}
  function timeOptions(selected){return ['12:00','14:00','16:00','18:00','20:00','22:00'].map(t=>`<option value="${t}" ${t===selected?'selected':''}>${esc(formatTime(t))}</option>`).join('')}
  function visitDateBounds(selected){const today=new Date();today.setHours(12,0,0,0);const start=new Date(today);start.setFullYear(start.getFullYear()-1);if(selected){const picked=new Date(`${selected}T12:00:00`);if(!Number.isNaN(picked.getTime())&&picked<start)start.setTime(picked.getTime())}const end=new Date(today);end.setFullYear(end.getFullYear()+1);return {min:localKey(start),max:localKey(end)}}
  function teamOptions(selected){return '<option value="">اختر الفرقة</option>'+teams.map(t=>`<option value="${esc(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)}</option>`).join('')}
  function nextOpenDate(from,offset=1){const d=new Date(`${from||localKey(new Date())}T12:00:00`);for(let i=0;i<370;i++){d.setDate(d.getDate()+(i===0?offset:1));const value=localKey(d);if(!lockInfo(value).isLocked)return value}return ''}
  function seedMultiDay(r,plan){
    multiDayServices=(plan?.services?.length?plan.services:(r.services||[])).map(x=>({...x,id:x.id||x.serviceTypeId||''}));
    const historical=(plan?.confirmedVisits||[]).map(v=>({date:v.scheduled_date||'',time:v.scheduled_time||'12:00',teamId:v.installation_team_id||'',technicianName:v.technician_name||'',quantities:Object.fromEntries((v.lines||[]).map(x=>[x.requestServiceId,Number(x.quantity||0)])),locked:true,visitNo:Number(v.visit_no||0)}));
    const saved=plan?.visits||[];
    let editable=saved.map(v=>({date:v.scheduled_date||'',time:v.scheduled_time||'12:00',teamId:v.installation_team_id||'',technicianName:v.technician_name||'',quantities:Object.fromEntries((v.lines||[]).map(x=>[x.requestServiceId,Number(x.quantity||0)])),locked:false,visitNo:Number(v.visit_no||0)}));
    if(!editable.length){const base=historical[historical.length-1];const d=nextOpenDate(base?.date||r.scheduledDate||localKey(new Date()),1);editable=[{date:d,time:r.scheduledTime||base?.time||'12:00',teamId:r.teamId||base?.teamId||'',technicianName:r.technicianName||base?.technicianName||'',quantities:Object.fromEntries(multiDayServices.map(x=>[x.id,Number(x.quantity||0)])),locked:false}]}
    if(!historical.length&&editable.length<2){const first=editable[0],d2=nextOpenDate(first.date||localKey(new Date()),1);const second={date:d2,time:first.time||'12:00',teamId:first.teamId||'',technicianName:first.technicianName||'',quantities:{},locked:false};multiDayServices.forEach(x=>{const total=Number(x.quantity||0),q1=Math.ceil(total/2);first.quantities[x.id]=q1;second.quantities[x.id]=total-q1});editable.push(second)}
    multiDayVisits=[...historical,...editable];
  }
  function allocationStatus(){return multiDayServices.map(s=>{const total=Number(s.quantity||0),allocated=multiDayVisits.filter(v=>!v.locked).reduce((a,v)=>a+Number(v.quantities[s.id]||0),0),remaining=total-allocated;return `<span class="${remaining===0?'is-ok':'is-error'}">${esc(s.name)}: ${allocated}/${total}${remaining===0?' ✓':remaining>0?` — متبقي ${remaining}`:` — زائد ${Math.abs(remaining)}`}</span>`}).join('')}
  function renderMultiDay(){const wrap=$('installationMultiDayVisits');if(!wrap)return;wrap.innerHTML=multiDayVisits.map((v,i)=>{const locked=v.locked===true;return `<article class="installation-multi-day-visit ${locked?'is-confirmed-history':''}" data-visit-index="${i}"><div class="installation-multi-day-visit-head"><h5>${locked?`زيارة منفذة ومؤكدة${v.visitNo?` — ${v.visitNo}`:''}`:`موعد جديد`}</h5>${locked?'<span class="status-badge">غير قابل للتعديل</span>':`<button type="button" class="secondary-btn compact-btn" data-remove-visit="${i}" ${multiDayVisits.filter(x=>!x.locked).length<=1?'disabled':''}>حذف الموعد</button>`}</div><div class="installation-multi-day-visit-fields"><label>التاريخ${locked?`<input value="${esc(v.date)}" readonly>`:(()=>{const bounds=visitDateBounds(v.date);return `<input data-visit-date="${i}" type="date" value="${esc(v.date)}" min="${bounds.min}" max="${bounds.max}" required>`})()}</label><label>الوقت${locked?`<input value="${esc(formatTime(v.time))}" readonly>`:`<select data-visit-time="${i}" required><option value="">اختر الوقت</option>${timeOptions(v.time)}</select>`}</label><label>الفرقة${locked?`<input value="${esc(teams.find(t=>t.id===v.teamId)?.name||'—')}" readonly>`:`<select data-visit-team="${i}" required>${teamOptions(v.teamId)}</select>`}</label><label>الجرومر<input ${locked?'readonly':''} ${locked?'':`data-visit-technician="${i}" type="search" list="installationTechnicianNameSuggestions"`} value="${esc(v.technicianName)}" placeholder="اسم الجرومر" ${locked?'':'required'}></label></div><div class="installation-multi-day-quantities">${multiDayServices.map(s=>`<label class="installation-multi-day-quantity-row"><strong>${esc(s.name)}<small>${locked?'الكمية المؤكدة':'المتبقي للجدولة'}: ${Number(locked?v.quantities[s.id]||0:s.quantity||0)}</small></strong><span>${locked?'تم موعد':'كمية الموعد'}</span><input ${locked?'readonly':''} ${locked?'':`data-visit-quantity="${i}" data-service-id="${esc(s.id)}"`} type="number" min="0" max="${Number(locked?v.quantities[s.id]||0:s.quantity||0)}" step="1" value="${Number(v.quantities[s.id]||0)}"></label>`).join('')}</div></article>`}).join('')+`<div class="installation-allocation-summary">${allocationStatus()}</div>`}
  function syncMultiDayMode(enabled){
    const panel=$('installationMultiDayPanel');
    panel?.classList.toggle('hidden',!enabled);
    ['installationAssignmentDate','installationAssignmentTime','installationAssignmentTeam','installationAssignmentTechnicianName'].forEach(id=>{const el=$(id);if(el){el.disabled=enabled;el.required=!enabled}});
    if(enabled)renderMultiDay();
    panel?.querySelectorAll('input,select,textarea,button').forEach(el=>{
      if(el.id==='addInstallationVisitRow')return;
      el.disabled=!enabled;
    });
    const addButton=$('addInstallationVisitRow');
    if(addButton)addButton.disabled=!enabled;
  }
  function collectMultiDay(){return multiDayVisits.filter(v=>!v.locked).map(v=>({scheduledDate:v.date,scheduledTime:v.time,teamId:v.teamId,technicianName:v.technicianName,services:multiDayServices.map(s=>({requestServiceId:s.id,quantity:Number(v.quantities[s.id]||0)})).filter(x=>x.quantity>0)}))}
  function validateMultiDay(){const editable=multiDayVisits.filter(v=>!v.locked),allowedSlots=new Set(['12:00','14:00','16:00','18:00','20:00','22:00']);if(editable.length<1)throw new Error('أضف موعدًا جديدًا واحدًا على الأقل.');for(const [i,v] of editable.entries()){if(!v.date||!v.time||!v.teamId||!String(v.technicianName||'').trim())throw new Error(`أكمل بيانات اليوم ${i+1}.`);if(!allowedSlots.has(String(v.time).slice(0,5)))throw new Error(`وقت اليوم ${i+1} يجب أن يكون أحد المواعيد الثابتة.`);if(lockInfo(v.date).isLocked)throw new Error(`اليوم ${i+1} مغلق أمام الجدولة.`);if(!Object.values(v.quantities).some(x=>Number(x)>0))throw new Error(`حدد كمية واحدة على الأقل في الموعد ${i+1}.`);const duplicate=editable.findIndex((other,j)=>j!==i&&other.date===v.date&&String(other.time).slice(0,5)===String(v.time).slice(0,5)&&String(other.teamId)===String(v.teamId));if(duplicate>=0)throw new Error(`لا يمكن حجز نفس الفرقة مرتين في نفس اليوم ونفس الوقت (الموعدان ${i+1} و${duplicate+1}).`)}for(const s of multiDayServices){const allocated=multiDayVisits.filter(v=>!v.locked).reduce((a,v)=>a+Number(v.quantities[s.id]||0),0);if(allocated!==Number(s.quantity||0))throw new Error(`توزيع خدمة ${s.name} غير مكتمل: الموزع ${allocated} من ${Number(s.quantity||0)}.`)}}

  async function openAssignment(r,date){
    $('installationAssignmentForm').reset();clear($('installationAssignmentFormStatus'));$('installationAssignmentRequestId').value=r.id;$('installationAssignmentRequestLabel').textContent=`${r.requestNumber} — ${r.customerName}`;renderAssignmentContext(r);const selectedDate=date||r.scheduledDate||key(new Date());populateAssignmentDates(selectedDate);$('installationAssignmentTime').value=(r.scheduledTime||'').slice(0,5);$('installationAssignmentTeam').value=r.teamId||'';$('installationAssignmentTechnicianName').value=teamGroomerName(r.teamId)||r.technicianName||'';$('installationAssignmentNotes').value=r.assignmentNotes||'';renderAssignmentServices(r);$('editServicesFromAssignment').dataset.requestId=r.id;syncAssignmentPermission();let plan={services:r.services||[],visits:[]};try{plan=await window.InstallationsServiceSafe.schedulePlan(r.id)}catch(_){/* keep single-day compatibility */}seedMultiDay(r,plan);const multi=(plan.confirmedVisits||[]).length>0||(plan.visits||[]).length>1;$('installationMultiDayToggle').checked=multi;syncMultiDayMode(multi);$('installationAssignmentDialog').showModal();refreshBookedTimes().catch(err=>status($('installationAssignmentFormStatus'),err.message,'error'))}

  document.addEventListener('DOMContentLoaded',()=>{
    window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='installationSchedule')load()});
    $('refreshInstallationScheduleBtn')?.addEventListener('click',load);$('installationSchedulePrevBtn')?.addEventListener('click',async()=>{month.setMonth(month.getMonth()-1);await loadDayLocks();renderCalendar()});$('installationScheduleNextBtn')?.addEventListener('click',async()=>{month.setMonth(month.getMonth()+1);await loadDayLocks();renderCalendar()});$('installationScheduleTodayBtn')?.addEventListener('click',async()=>{month=new Date();month.setDate(1);await loadDayLocks();renderCalendar()});['installationScheduleTechnicianFilter','installationScheduleStatusFilter'].forEach(id=>$(id)?.addEventListener('change',renderCalendar));
    document.addEventListener('click',async e=>{const lock=e.target.closest('[data-toggle-day-lock]');if(lock){e.preventDefault();e.stopPropagation();if(!canToggleDayLock())return;const date=lock.dataset.toggleDayLock,info=lockInfo(date);try{await window.InstallationsServiceSafe.setScheduleDayLock(date,!info.isLocked);await loadDayLocks();renderCalendar()}catch(err){status($('installationScheduleStatus'),err.message,'error')}return}const day=e.target.closest('[data-calendar-day]');if(day){openDayDetails(day.dataset.calendarDay);return}const view=e.target.closest('[data-view-request]'),edit=e.target.closest('[data-edit-request-services]'),b=e.target.closest('[data-schedule-request]');if(view){
      e.preventDefault();
      e.stopPropagation();
      try{
        clear($('installationScheduleStatus'));
        await openRequestViewDirect(view.dataset.viewRequest);
      }catch(err){status($('installationScheduleStatus'),err?.message||'تعذر عرض بيانات الموعد.','error')}
      return
    }if(edit&&!edit.disabled){window.dispatchEvent(new CustomEvent('kyum-installation-services-edit',{detail:{id:edit.dataset.editRequestServices,row:requests.find(x=>x.id===edit.dataset.editRequestServices)}}));return}if(b){const r=requests.find(x=>x.id===b.dataset.scheduleRequest);if(r)await openAssignment(r,e.target.closest('[data-date]')?.dataset.date)}});
    $('installationAssignmentDate')?.addEventListener('change',()=>{
      const selectedDate=$('installationAssignmentDate')?.value||'';
      const formStatus=$('installationAssignmentFormStatus');
      if(selectedDate&&lockInfo(selectedDate).isLocked){
        status(formStatus,'هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.','error');
        $('installationAssignmentDate').value='';
        return;
      }
      clear(formStatus);
      refreshBookedTimes().catch(err=>status(formStatus,err.message,'error'));
    });$('installationAssignmentTeam')?.addEventListener('change',e=>{const name=teamGroomerName(e.currentTarget.value);if(name&&$('installationAssignmentTechnicianName'))$('installationAssignmentTechnicianName').value=name;refreshBookedTimes().catch(err=>status($('installationAssignmentFormStatus'),err.message,'error'))});$('installationAssignmentTechnicianName')?.addEventListener('change',()=>refreshBookedTimes().catch(err=>status($('installationAssignmentFormStatus'),err.message,'error')));$('installationAssignmentTechnicianName')?.addEventListener('blur',()=>refreshBookedTimes().catch(err=>status($('installationAssignmentFormStatus'),err.message,'error')));$('editServicesFromAssignment')?.addEventListener('click',e=>{const id=e.currentTarget.dataset.requestId;if(id)window.dispatchEvent(new CustomEvent('kyum-installation-services-edit',{detail:{id,row:requests.find(x=>x.id===id)}}))});
    $('installationMultiDayToggle')?.addEventListener('change',e=>syncMultiDayMode(e.currentTarget.checked));
    $('addInstallationVisitRow')?.addEventListener('click',()=>{const last=[...multiDayVisits].reverse().find(v=>!v.locked)||multiDayVisits[multiDayVisits.length-1]||{};multiDayVisits.push({date:nextOpenDate(last.date||localKey(new Date()),1),time:last.time||'12:00',teamId:last.teamId||'',technicianName:last.technicianName||'',quantities:Object.fromEntries(multiDayServices.map(s=>[s.id,0]))});renderMultiDay()});
    $('installationMultiDayVisits')?.addEventListener('input',e=>{const i=Number(e.target.dataset.visitDate??e.target.dataset.visitTime??e.target.dataset.visitTeam??e.target.dataset.visitTechnician??e.target.dataset.visitQuantity);if(!Number.isInteger(i)||!multiDayVisits[i])return;if(e.target.dataset.visitDate!==undefined)multiDayVisits[i].date=e.target.value;if(e.target.dataset.visitTime!==undefined)multiDayVisits[i].time=e.target.value;if(e.target.dataset.visitTeam!==undefined){multiDayVisits[i].teamId=e.target.value;const groomer=teamGroomerName(e.target.value);if(groomer){multiDayVisits[i].technicianName=groomer;const tech=$('installationMultiDayVisits')?.querySelector(`[data-visit-technician="${i}"]`);if(tech)tech.value=groomer}}if(e.target.dataset.visitTechnician!==undefined)multiDayVisits[i].technicianName=e.target.value;if(e.target.dataset.visitQuantity!==undefined)multiDayVisits[i].quantities[e.target.dataset.serviceId]=Number(e.target.value||0);const summary=$('installationMultiDayVisits')?.querySelector('.installation-allocation-summary');if(summary)summary.innerHTML=allocationStatus()});
    $('installationMultiDayVisits')?.addEventListener('change',e=>e.target.dispatchEvent(new Event('input',{bubbles:true})));
    $('installationMultiDayVisits')?.addEventListener('click',e=>{const b=e.target.closest('[data-remove-visit]');if(!b||multiDayVisits.filter(v=>!v.locked).length<=1)return;if(multiDayVisits[Number(b.dataset.removeVisit)]?.locked)return;multiDayVisits.splice(Number(b.dataset.removeVisit),1);renderMultiDay()});
    window.addEventListener('kyum-installation-services-updated',async()=>{await load();const id=$('installationAssignmentRequestId')?.value,r=requests.find(x=>x.id===id);if(r&&$('installationAssignmentDialog')?.open){renderAssignmentContext(r);renderAssignmentServices(r)}});
    $('installationDayTeamsGrid')?.addEventListener('click',async e=>{const edit=e.target.closest('[data-day-edit-request]'),re=e.target.closest('[data-day-reschedule]'),cancel=e.target.closest('[data-day-cancel-schedule]');if(edit&&!edit.disabled){const r=requests.find(x=>x.id===edit.dataset.dayEditRequest);if(!r?.canOperate||!canEditSchedule())return;$('installationDayDetailsDialog').close();try{await window.KYUMInstallationsModule?.openRequestEdit?.(r.id,{returnView:'installationSchedule'})}catch(err){status($('installationScheduleStatus'),err.message,'error')}return}if(re&&!re.disabled){const r=requests.find(x=>x.id===re.dataset.dayReschedule);if(!r?.canOperate)return;$('installationDayDetailsDialog').close();openAssignment(r).catch(err=>status($('installationScheduleStatus'),err.message,'error'));return}if(cancel&&!cancel.disabled){const r=requests.find(x=>x.id===cancel.dataset.dayCancelSchedule);if(!r?.canOperate||!canEditSchedule())return;const message=`هل تريد إلغاء جدولة الطلب ${r.requestNumber}؟\n\nسيتم إلغاء جميع مواعيد هذا الطلب وإعادته إلى قائمة الطلبات التي تحتاج جدولة أو إسناد.`;if(!window.confirm(message))return;const original=cancel.textContent;setSaveState(cancel,'saving',original);try{await window.InstallationsServiceSafe.cancelSchedule(r.id);setSaveState(cancel,'saved');await new Promise(resolve=>setTimeout(resolve,450));$('installationDayDetailsDialog').close();await load();status($('installationScheduleStatus'),'تم إلغاء الجدولة وإعادة الطلب إلى قائمة الطلبات المطلوب جدولتها.','success')}catch(err){setSaveState(cancel,'error');status($('installationScheduleStatus'),err.message,'error');await new Promise(resolve=>setTimeout(resolve,900));setSaveState(cancel,'idle',original)}}});
    $('closeInstallationDayDetailsDialog')?.addEventListener('click',()=>$('installationDayDetailsDialog').close());$('closeInstallationDayDetailsFooter')?.addEventListener('click',()=>$('installationDayDetailsDialog').close());
    $('closeInstallationAssignmentDialog')?.addEventListener('click',()=> $('installationAssignmentDialog').close());$('cancelInstallationAssignment')?.addEventListener('click',()=> $('installationAssignmentDialog').close());
    async function handleAssignmentSave(event){
      event?.preventDefault?.();
      if(assignmentSaveInFlight)return;
      const form=$('installationAssignmentForm'),btn=$('saveInstallationAssignment'),formStatus=$('installationAssignmentFormStatus');
      clear(formStatus);
      if(!canEditSchedule()){
        status(formStatus,'ليس لديك صلاحية جدولة وإسناد المواعيد.','error');
        syncAssignmentPermission();
        return;
      }
      assignmentSaveInFlight=true;
      setSaveState(btn,'saving','حفظ الجدولة');
      try{
        const requestId=$('installationAssignmentRequestId')?.value||'';
        if(!requestId)throw new Error('تعذر تحديد الموعد. أغلق النافذة وافتح الطلب مرة أخرى.');
        if($('installationMultiDayToggle')?.checked){
          validateMultiDay();
          await window.InstallationsServiceSafe.assignMultiDay({id:requestId,visits:collectMultiDay(),assignmentNotes:$('installationAssignmentNotes').value.trim()});
        }else{
          const selectedDate=$('installationAssignmentDate')?.value||'';
          const selectedTime=$('installationAssignmentTime')?.value||'';
          const technicianName=$('installationAssignmentTechnicianName')?.value.trim()||'';
          const teamId=$('installationAssignmentTeam')?.value||'';
          if(!selectedDate)throw new Error('اختر تاريخ الموعد.');
          if(lockInfo(selectedDate).isLocked)throw new Error('هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.');
          if(!selectedTime)throw new Error('اختر وقت الموعد.');
          if(bookedTimes.has(selectedTime))throw new Error('هذا الموعد محجوز للفني المحدد. اختر موعدًا آخر.');
          if(!teamId)throw new Error('اختر فرقة المواعيد.');
          if(!technicianName)throw new Error('حدد اسم الجرومر.');
          await window.InstallationsServiceSafe.assign({id:requestId,scheduledDate:selectedDate,scheduledTime:selectedTime,teamId,technicianName,assignmentNotes:$('installationAssignmentNotes').value.trim()});
        }
        setSaveState(btn,'saved');
        status(formStatus,'تم حفظ الجدولة بنجاح.','success');
        await new Promise(resolve=>setTimeout(resolve,450));
        $('installationAssignmentDialog').close();
        await load();
      }catch(err){
        setSaveState(btn,'error');
        status(formStatus,err?.message||'تعذر حفظ الجدولة.','error');
        formStatus?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
        await new Promise(resolve=>setTimeout(resolve,900));
      }finally{
        assignmentSaveInFlight=false;
        setSaveState(btn,'idle','حفظ الجدولة');
      }
    }
    $('saveInstallationAssignment')?.addEventListener('click',handleAssignmentSave);
    $('installationAssignmentForm')?.addEventListener('submit',handleAssignmentSave);
  });
})();
