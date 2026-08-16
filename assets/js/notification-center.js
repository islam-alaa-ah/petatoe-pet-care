(function(){
'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config=null,notifications=[],unsub=null,selectedRoleKey='';
function roleLabel(r){return window.CustomerPermissions?.roleLabels?.[r]||r}
function availableRoles(){
  const canonical=Array.isArray(window.CustomerPermissions?.roleOptions)?window.CustomerPermissions.roleOptions:[];
  const fromUsers=(config?.users||[]).map(u=>u.role).filter(Boolean);
  return [...new Set([...canonical,...fromUsers])].filter(Boolean);
}
function selectedSet(ev,type){return new Set((config?.rules||[]).filter(r=>r.event_key===ev.event_key&&r.recipient_type===type).map(r=>type==='role'?r.role_key:r.user_id))}
function ownerEnabled(ev){return (config?.rules||[]).some(r=>r.event_key===ev.event_key&&r.recipient_type==='request_owner')}
const MATRIX_FIELDS=['enabled','inApp','push','owner','roleRecipient'];
function matrixRows(){return [...document.querySelectorAll('[data-notification-event]')]}
function syncColumnHeader(field){
  const head=document.querySelector(`[data-matrix-select-all="${field}"]`);if(!head)return;
  const boxes=matrixRows().map(row=>row.querySelector(`[data-field="${field}"]`)).filter(Boolean);
  if(!boxes.length){head.checked=false;head.indeterminate=false;return}
  const checked=boxes.filter(box=>box.checked).length;head.checked=checked===boxes.length;head.indeterminate=checked>0&&checked<boxes.length;
}
function syncAllColumnHeaders(){MATRIX_FIELDS.forEach(syncColumnHeader)}
function setColumnChecked(field,checked){
  matrixRows().forEach(row=>{const box=row.querySelector(`[data-field="${field}"]`);if(box&&!box.disabled)box.checked=checked});
  syncCurrentRoleDraft();syncColumnHeader(field);
}
function syncCurrentRoleDraft(){
  if(!config||!selectedRoleKey)return;
  const rows=[...document.querySelectorAll('[data-notification-event]')];
  if(!rows.length)return;
  rows.forEach(row=>{
    const eventKey=row.dataset.notificationEvent, ev=config.events.find(x=>x.event_key===eventKey);
    if(ev){
      ev.is_enabled=!!row.querySelector('[data-field="enabled"]')?.checked;
      ev.in_app_enabled=!!row.querySelector('[data-field="inApp"]')?.checked;
      ev.push_enabled=!!row.querySelector('[data-field="push"]')?.checked;
    }
    config.rules=(config.rules||[]).filter(r=>!(r.event_key===eventKey&&((r.recipient_type==='role'&&r.role_key===selectedRoleKey)||r.recipient_type==='request_owner')));
    if(row.querySelector('[data-field="roleRecipient"]')?.checked)config.rules.push({event_key:eventKey,recipient_type:'role',role_key:selectedRoleKey,is_active:true});
    if(row.querySelector('[data-field="owner"]')?.checked)config.rules.push({event_key:eventKey,recipient_type:'request_owner',is_active:true});
  });
}
function renderRoleSelect(){
  const select=$('notificationRoleSelect');if(!select)return;
  const roles=availableRoles();
  if(!selectedRoleKey||!roles.includes(selectedRoleKey))selectedRoleKey=roles[0]||'';
  select.innerHTML=roles.map(r=>`<option value="${esc(r)}" ${r===selectedRoleKey?'selected':''}>${esc(roleLabel(r))}</option>`).join('');
  select.disabled=!roles.length;
}
function renderConfig(){
  const root=$('notificationMatrixRows');if(!root||!config)return;
  $('notificationMasterEnabled').checked=config.system?.is_enabled!==false;
  renderRoleSelect();
  root.innerHTML=config.events.map(ev=>{
    const roles=selectedSet(ev,'role');
    return `<tr data-notification-event="${esc(ev.event_key)}"><td><strong>${esc(ev.event_name)}</strong><small>${esc(ev.module_name||'التركيبات')}</small></td><td><input class="matrix-toggle" data-field="enabled" type="checkbox" ${ev.is_enabled?'checked':''}></td><td><input class="matrix-toggle" data-field="inApp" type="checkbox" ${ev.in_app_enabled?'checked':''}></td><td><input class="matrix-toggle" data-field="push" type="checkbox" ${ev.push_enabled?'checked':''} title="إرسال Push خارج البرنامج للأجهزة المشتركة"></td><td><input class="matrix-toggle" data-field="owner" type="checkbox" ${ownerEnabled(ev)?'checked':''}></td><td class="notification-role-recipient-cell"><input class="matrix-toggle" data-field="roleRecipient" type="checkbox" ${selectedRoleKey&&roles.has(selectedRoleKey)?'checked':''}><span>${esc(selectedRoleKey?roleLabel(selectedRoleKey):'لا يوجد دور')}</span></td></tr>`;
  }).join('');
  syncAllColumnHeaders();
}
function collect(){
  syncCurrentRoleDraft();
  return {masterEnabled:$('notificationMasterEnabled')?.checked!==false,events:(config?.events||[]).map(ev=>({eventKey:ev.event_key,eventName:ev.event_name,moduleName:ev.module_name,targetView:ev.target_view,displayOrder:ev.display_order,enabled:!!ev.is_enabled,inApp:!!ev.in_app_enabled,push:!!ev.push_enabled,owner:ownerEnabled(ev),roles:[...selectedSet(ev,'role')],users:[]}))};
}
async function renderPushStatus(){const box=$('notificationPushStatus'),enable=$('notificationEnablePushBtn'),disable=$('notificationDisablePushBtn');if(!box)return;try{const s=await window.NotificationCenterService.getPushStatus();let label='غير مدعوم على هذا الجهاز';if(s.supported&&!s.configured)label='الخادم غير مهيأ بمفاتيح Web Push';else if(s.supported&&s.permission==='denied')label='الإشعارات محظورة من إعدادات المتصفح';else if(s.subscribed)label='Push مفعّل على هذا الجهاز';else if(s.supported)label='Push غير مفعّل على هذا الجهاز';box.textContent=label;box.dataset.state=s.subscribed?'active':(s.supported?'ready':'unsupported');if(enable)enable.disabled=!s.supported||!s.configured||s.permission==='denied'||s.subscribed;if(disable)disable.disabled=!s.subscribed}catch(e){box.textContent=e.message;box.dataset.state='error'}}
async function loadConfig(force=false){if(config&&!force){renderConfig();renderPushStatus();return}const status=$('notificationCenterStatus');try{status.textContent='جاري تحميل مركز الإشعارات...';status.classList.remove('hidden');config=await window.NotificationCenterService.loadConfig();renderConfig();await renderPushStatus();status.classList.add('hidden')}catch(e){status.textContent=e.message;status.dataset.type='error'}}
async function save(){const status=$('notificationCenterStatus');try{status.textContent='جاري الحفظ...';status.classList.remove('hidden');config=await window.NotificationCenterService.saveConfig(collect());renderConfig();status.textContent=`تم حفظ مصفوفة الإشعارات للدور ${roleLabel(selectedRoleKey)} بنجاح.`;status.dataset.type='success';setTimeout(()=>status.classList.add('hidden'),2500)}catch(e){status.textContent=e.message;status.dataset.type='error'}}
function relative(ts){const d=Math.max(0,Date.now()-new Date(ts).getTime()),m=Math.floor(d/60000),lang=window.PetatoeLocalization?.getLanguage?.()==='en'?'en':'ar';if(m<1)return sharedT('shared.notifications.now','الآن');if(m<60)return sharedFormat('shared.notifications.minutesAgo',m,`منذ {count} دقيقة`);const h=Math.floor(m/60);if(h<24)return sharedFormat('shared.notifications.hoursAgo',h,`منذ {count} ساعة`);return new Date(ts).toLocaleDateString(lang==='en'?'en-GB':'ar-SA-u-nu-latn')}
function renderBell(){const list=$('notificationDropdownList'),badge=$('notificationUnreadBadge');const unread=notifications.filter(n=>!n.is_read).length;if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',!unread)}if(list)list.innerHTML=notifications.length?notifications.slice(0,20).map(n=>`<button class="notification-item ${n.is_read?'':'unread'}" type="button" data-notification-id="${n.id}" data-target-view="${esc(n.target_view||'')}"><strong>${esc(n.title)}</strong><span>${esc(n.body)}</span><small>${relative(n.created_at)}</small></button>`).join(''):`<div class="notification-empty">${sharedT('shared.notifications.empty','لا توجد إشعارات.')}</div>`}
async function refresh(){try{notifications=await window.NotificationCenterService.listMine(50);renderBell()}catch(e){console.warn(e)}}
function navigateTarget(target){if(target)document.querySelector(`.nav-item[data-view="${CSS.escape(target)}"]`)?.click()}
async function openNotification(btn){await window.NotificationCenterService.markRead(btn.dataset.notificationId);navigateTarget(btn.dataset.targetView);$('notificationDropdown')?.classList.add('hidden');refresh()}
function applyPushDeepLink(){const params=new URLSearchParams(location.search),target=params.get('notificationView');if(target){setTimeout(()=>navigateTarget(target),300);params.delete('notificationView');params.delete('notificationId');params.delete('requestId');params.delete('visitId');const q=params.toString();history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash)}}
function startRealtime(){if(!window.CustomerAuth?.getState?.().profile)return;unsub?.();unsub=window.NotificationCenterService.subscribe(n=>{notifications.unshift(n);renderBell()});refresh();window.NotificationCenterService.dispatchPending?.()}
async function enablePush(){const status=$('notificationCenterStatus');try{status.textContent='جاري تفعيل Push لهذا الجهاز...';status.classList.remove('hidden');await window.NotificationCenterService.enablePush();status.textContent='تم تفعيل إشعارات Push لهذا الجهاز.';status.dataset.type='success';await renderPushStatus()}catch(e){status.textContent=e.message;status.dataset.type='error'}}
async function disablePush(){const status=$('notificationCenterStatus');try{await window.NotificationCenterService.disablePush();status.textContent='تم إيقاف Push على هذا الجهاز.';status.dataset.type='success';status.classList.remove('hidden');await renderPushStatus()}catch(e){status.textContent=e.message;status.dataset.type='error'}}
function init(){
 const bell=$('notificationBellBtn'),dropdown=$('notificationDropdown');let lastBellToggle=0;
 const mobileBellMq=window.matchMedia?.('(max-width: 767px), (pointer: coarse) and (max-device-width: 1024px), (hover: none) and (max-device-width: 1024px)');
 const syncDropdownPortal=()=>{
   if(!dropdown)return;
   if(dropdown.parentElement!==document.body)document.body.appendChild(dropdown);
   dropdown.classList.add('notification-dropdown-portal');
   dropdown.classList.toggle('notification-dropdown-mobile-portal',!!mobileBellMq?.matches);
 };
 const positionDropdown=()=>{
   if(!dropdown||dropdown.classList.contains('hidden')||mobileBellMq?.matches||!bell)return;
   const rect=bell.getBoundingClientRect();
   const gap=10,viewportGap=12,maxWidth=Math.min(380,Math.max(280,window.innerWidth-(viewportGap*2)));
   const width=Math.min(maxWidth,380);
   const left=Math.max(viewportGap,Math.min(window.innerWidth-width-viewportGap,rect.left+(rect.width/2)-(width/2)));
   dropdown.style.setProperty('--notification-popover-left',`${Math.round(left)}px`);
   dropdown.style.setProperty('--notification-popover-top',`${Math.round(rect.bottom+gap)}px`);
   dropdown.style.setProperty('--notification-popover-width',`${Math.round(width)}px`);
 };
 const toggleBell=()=>{if(!dropdown)return;syncDropdownPortal();dropdown.classList.toggle('hidden');bell?.setAttribute('aria-expanded',String(!dropdown.classList.contains('hidden')));positionDropdown();refresh()};
 const isBellTarget=target=>!!target?.closest?.('#notificationBellBtn');
 const handleMobileBell=e=>{
   if(!isBellTarget(e.target))return;
   const now=Date.now();
   if(now-lastBellToggle<450){e.preventDefault();e.stopImmediatePropagation?.();e.stopPropagation();return}
   lastBellToggle=now;
   e.preventDefault();e.stopImmediatePropagation?.();e.stopPropagation();toggleBell();
 };
 bell?.setAttribute('aria-haspopup','dialog');bell?.setAttribute('aria-expanded','false');
 syncDropdownPortal();
 mobileBellMq?.addEventListener?.('change',()=>{dropdown?.classList.add('hidden');bell?.setAttribute('aria-expanded','false');syncDropdownPortal()});
 window.addEventListener('orientationchange',()=>setTimeout(()=>{syncDropdownPortal();positionDropdown()},80));
 window.addEventListener('resize',positionDropdown,{passive:true});
 window.addEventListener('scroll',positionDropdown,{passive:true,capture:true});
 // Capture-phase delegation is intentional: iOS Safari/PWA may have positioned
 // header layers or synthetic click handling that prevents the button's own
 // bubbling listener from receiving the tap. Intercept the actual touch/pointer
 // before those layers can cancel it, while the timestamp guard prevents doubles.
 document.addEventListener('touchend',handleMobileBell,{capture:true,passive:false});
 document.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')handleMobileBell(e)},{capture:true,passive:false});
 bell?.addEventListener('click',e=>{
   e.stopPropagation();
   if(Date.now()-lastBellToggle<700)return;
   lastBellToggle=Date.now();toggleBell();
 });
 dropdown?.addEventListener('click',e=>e.stopPropagation());
 document.addEventListener('click',e=>{if(isBellTarget(e.target))return;if(dropdown&&!dropdown.classList.contains('hidden')){dropdown.classList.add('hidden');bell?.setAttribute('aria-expanded','false')}});
 $('notificationMarkAllRead')?.addEventListener('click',async()=>{await window.NotificationCenterService.markAllRead();refresh()});
 $('notificationDropdownList')?.addEventListener('click',e=>{const b=e.target.closest('[data-notification-id]');if(b)openNotification(b)});
 $('notificationRoleSelect')?.addEventListener('change',e=>{syncCurrentRoleDraft();selectedRoleKey=e.target.value;renderConfig()});
 document.querySelector('.notification-matrix')?.addEventListener('change',e=>{
   const selectAll=e.target.closest('[data-matrix-select-all]');
   if(selectAll){setColumnChecked(selectAll.dataset.matrixSelectAll,selectAll.checked);return}
   const field=e.target.closest('[data-field]')?.dataset.field;if(field&&MATRIX_FIELDS.includes(field)){syncCurrentRoleDraft();syncColumnHeader(field)}
 });
 $('saveNotificationCenterBtn')?.addEventListener('click',save);$('notificationEnablePushBtn')?.addEventListener('click',enablePush);$('notificationDisablePushBtn')?.addEventListener('click',disablePush);
 window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='notificationCenter')loadConfig(true)});
 window.addEventListener('customer-auth-ready',startRealtime);window.addEventListener('kyum-auth-state-changed',startRealtime);
 navigator.serviceWorker?.addEventListener?.('message',e=>{if(e.data?.type==='OPEN_NOTIFICATION_TARGET')navigateTarget(e.data.targetView)});
 window.addEventListener('petatoe-language-changed',()=>renderBell());
setInterval(()=>{if(window.CustomerAuth?.getState?.().profile)refresh()},60000);setTimeout(()=>{startRealtime();applyPushDeepLink()},0);
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
window.NotificationCenterUI=Object.freeze({loadConfig,refresh,renderPushStatus});
})();
