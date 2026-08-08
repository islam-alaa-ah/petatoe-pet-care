(function(){'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SECTION_KEY='kyum-installation-settings-section';
const VALID_SECTIONS=new Set(['services','teams','neighborhoods']);
let cache={services:[],teams:[],neighborhoods:[],regions:[],cities:[]};
function message(text,type=''){const el=$('installationSettingsStatus');if(!el)return;el.textContent=text||'';el.classList.toggle('hidden',!text);el.dataset.type=type}
function money(v){return new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',minimumFractionDigits:2}).format(Number(v||0))}
function status(active,label){return `<span class="installation-status-pill${active?'':' is-inactive'}">${esc(label)}</span>`}
function actionButtons(type,row,active){return `<div class="installation-settings-actions-cell"><button class="secondary-btn" type="button" data-setting-edit="${type}" data-id="${row.id}">تعديل</button><button class="secondary-btn" type="button" data-setting-toggle="${type}" data-id="${row.id}" data-active="${active?'1':'0'}">${active?'إيقاف':'تفعيل'}</button><button class="danger-btn" type="button" data-setting-delete="${type}" data-id="${row.id}">حذف</button></div>`}
function render(){
  $('installationServicesSettingsBody').innerHTML=cache.services.map(r=>`<tr><td>${esc(r.name)}</td><td>${money(r.default_price)}</td><td>${money(r.default_cost)}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشطة':'متوقفة')}</td><td>${actionButtons('service',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد خدمات.</td></tr>';
  $('installationTeamsSettingsBody').innerHTML=cache.teams.map(r=>{const active=r.status!=='غير نشطة';return `<tr><td>${esc(r.name)}</td><td>${esc(r.leader_name||'—')}</td><td>${esc(r.phone||'—')}</td><td>${esc(r.city||'—')}</td><td>${status(active,r.status||'متاحة')}</td><td>${actionButtons('team',r,active)}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty-cell">لا توجد فرق تركيب.</td></tr>';
  $('installationNeighborhoodsSettingsBody').innerHTML=cache.neighborhoods.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.city||'—')}</td><td>${esc(r.region||'—')}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشط':'متوقف')}</td><td>${actionButtons('neighborhood',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد أحياء.</td></tr>';
}
function currentSection(){const saved=sessionStorage.getItem(SECTION_KEY);return VALID_SECTIONS.has(saved)?saved:'services'}
function showSection(section,{persist=true}={}){
  const next=VALID_SECTIONS.has(section)?section:'services';
  document.querySelectorAll('[data-installation-settings-panel]').forEach(panel=>{
    const visible=panel.dataset.installationSettingsPanel===next;
    panel.classList.toggle('hidden',!visible);
    panel.setAttribute('aria-hidden',visible?'false':'true');
  });
  const filter=$('installationSettingsSectionFilter');if(filter&&filter.value!==next)filter.value=next;
  if(persist)sessionStorage.setItem(SECTION_KEY,next);
}
async function load(){message('جاري تحميل إعدادات التركيبات...');try{cache=await window.InstallationsServiceSafe.settingsCatalog();render();message('')}catch(e){message(e.message||'تعذر تحميل الإعدادات.','error')}}
let referenceGeoController=null;
function syncReferenceGeoCatalog(){window.KYUMGeography?.setCatalog({regions:cache.regions||[],cities:cache.cities||[],neighborhoods:cache.neighborhoods||[]})}
function ensureReferenceGeoController(){
  syncReferenceGeoCatalog();
  if(referenceGeoController)return referenceGeoController.bind();
  if(!window.KYUMGeography)throw new Error('مكوّن العنوان الجغرافي غير محمّل.');
  referenceGeoController=window.KYUMGeography.createController({
    ids:{
      region:{wrapper:'installationReferenceRegionCombobox',hidden:'installationReferenceRegionId',search:'installationReferenceRegionSearch',options:'installationReferenceRegionOptions'},
      city:{wrapper:'installationReferenceCityCombobox',hidden:'installationReferenceCityId',search:'installationReferenceCitySearch',options:'installationReferenceCityOptions'},
      district:{wrapper:'installationReferenceDistrictCombobox',hidden:'installationReferenceDistrictId',search:'installationReferenceDistrictSearch',options:'installationReferenceDistrictOptions'}
    },
    optionLimit:300,
    boundAttribute:'installationReferenceGeoUnifiedBound'
  }).bind();
  return referenceGeoController;
}
function closeAllReferenceGeo(){['region','city','district'].forEach(type=>referenceGeoController?.close(type))}
function bindReferenceGeography(row={}){
  const controller=ensureReferenceGeoController();
  controller.setValue({regionId:row.region_id||'',cityId:row.city_id||''});
  controller.setEnabled('city',Boolean(row.region_id),'ابحث واختر المدينة');
}

function fields(type,row={}){
  if(type==='service')return `<label>اسم الخدمة<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label><label>السعر<input name="price" type="number" min="0" step="0.01" required value="${Number(row.default_price||0)}"></label><label>التكلفة<input name="cost" type="number" min="0" step="0.01" required value="${Number(row.default_cost||0)}"></label><label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشطة</option><option value="0" ${row.is_active===false?'selected':''}>متوقفة</option></select></label>`;
  if(type==='team')return `<label>اسم الفرقة<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label><label>مسؤول الفرقة<input name="leaderName" maxlength="120" value="${esc(row.leader_name||'')}"></label><label>رقم التواصل<input name="phone" maxlength="30" value="${esc(row.phone||'')}"></label><label>المدينة<input name="city" maxlength="120" value="${esc(row.city||'')}"></label><label>الحالة<select name="status">${['متاحة','مشغولة','إجازة','غير نشطة'].map(x=>`<option ${row.status===x?'selected':''}>${x}</option>`).join('')}</select></label>`;
  return `<label>اسم الحي<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label>
    <label class="installation-reference-geo-field">المنطقة
      <div id="installationReferenceRegionCombobox" class="geo-searchable-select installation-reference-geo-select" data-reference-geo-type="region">
        <input id="installationReferenceRegionId" name="regionId" type="hidden">
        <input id="installationReferenceRegionSearch" class="geo-searchable-input" type="search" placeholder="ابحث واختر المنطقة" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceRegionOptions">
        <button class="geo-searchable-toggle" type="button" aria-label="فتح قائمة المناطق">⌄</button>
        <div id="installationReferenceRegionOptions" class="geo-searchable-options hidden" role="listbox"></div>
      </div>
    </label>
    <label class="installation-reference-geo-field">المدينة
      <div id="installationReferenceCityCombobox" class="geo-searchable-select installation-reference-geo-select is-disabled" data-reference-geo-type="city">
        <input id="installationReferenceCityId" name="cityId" type="hidden">
        <input id="installationReferenceCitySearch" class="geo-searchable-input" type="search" placeholder="اختر المنطقة أولًا" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceCityOptions" disabled>
        <button class="geo-searchable-toggle" type="button" aria-label="فتح قائمة المدن" disabled>⌄</button>
        <div id="installationReferenceCityOptions" class="geo-searchable-options hidden" role="listbox"></div>
      </div>
      <small class="field-hint">اختيار المدينة مرتبط بالمنطقة النشطة فقط.</small>
    </label>
    <label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشط</option><option value="0" ${row.is_active===false?'selected':''}>متوقف</option></select></label>`;
}
function open(type,id=''){
  const list=type==='service'?cache.services:type==='team'?cache.teams:cache.neighborhoods,row=list.find(x=>x.id===id)||{};
  $('installationReferenceType').value=type;$('installationReferenceId').value=id;
  $('installationReferenceDialogTitle').textContent=(id?'تعديل ':'إضافة ')+(type==='service'?'خدمة':type==='team'?'فرقة تركيب':'حي');
  $('installationReferenceFields').innerHTML=fields(type,row);
  if(type==='neighborhood')bindReferenceGeography(row);
  $('installationReferenceFormStatus').classList.add('hidden');
  $('installationReferenceDialog').showModal();
}
async function submit(e){
  e.preventDefault();
  const fd=new FormData(e.currentTarget),type=$('installationReferenceType').value,payload=Object.fromEntries(fd.entries());
  payload.id=$('installationReferenceId').value;payload.isActive=payload.isActive!=='0';
  if(type==='neighborhood'){
    const controller=ensureReferenceGeoController();
    const validation=controller.validate({requireRegion:true,requireCity:true,requireDistrict:false});
    if(!validation.valid){const input=controller.elements(validation.field)?.search;input?.setCustomValidity(validation.message);input?.reportValidity();input?.focus();return}
    payload.regionId=validation.value.regionId;payload.cityId=validation.value.cityId;
    payload.region=validation.value.region||'';payload.city=validation.value.city||'';
  }
  try{await window.InstallationsServiceSafe.saveSettingItem(type,payload);closeAllReferenceGeo();$('installationReferenceDialog').close();await load();message('تم حفظ البيانات بنجاح.','success')}catch(err){const el=$('installationReferenceFormStatus');el.textContent=err.message;el.classList.remove('hidden');el.dataset.type='error'}
}
function bind(){
  showSection(currentSection(),{persist:false});
  $('installationSettingsSectionFilter')?.addEventListener('change',e=>showSection(e.target.value));
  $('addInstallationServiceBtn')?.addEventListener('click',()=>open('service'));
  $('addInstallationTeamBtn')?.addEventListener('click',()=>open('team'));
  $('addInstallationNeighborhoodBtn')?.addEventListener('click',()=>open('neighborhood'));
  $('installationReferenceForm')?.addEventListener('submit',submit);
  $('closeInstallationReferenceDialog')?.addEventListener('click',()=>{closeAllReferenceGeo();$('installationReferenceDialog').close()});
  $('cancelInstallationReferenceDialog')?.addEventListener('click',()=>{closeAllReferenceGeo();$('installationReferenceDialog').close()});
  $('installationReferenceDialog')?.addEventListener('close',()=>closeAllReferenceGeo());
  document.addEventListener('click',async e=>{if(!e.target.closest('.installation-reference-geo-select'))closeAllReferenceGeo();const edit=e.target.closest('[data-setting-edit]');if(edit)return open(edit.dataset.settingEdit,edit.dataset.id);const toggle=e.target.closest('[data-setting-toggle]');if(toggle){try{await window.InstallationsServiceSafe.toggleSettingItem(toggle.dataset.settingToggle,toggle.dataset.id,toggle.dataset.active!=='1');await load()}catch(err){message(err.message,'error')}return}const del=e.target.closest('[data-setting-delete]');if(del&&confirm('هل تريد حذف هذا السجل؟')){try{await window.InstallationsServiceSafe.removeSettingItem(del.dataset.settingDelete,del.dataset.id);await load()}catch(err){message(err.message,'error')}}});
  window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='installationSettings'){showSection(currentSection(),{persist:false});load()}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="installationSettings"]'))setTimeout(()=>{showSection(currentSection(),{persist:false});load()},0)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
