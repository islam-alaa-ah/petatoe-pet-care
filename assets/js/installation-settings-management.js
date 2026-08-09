(function(){'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SECTION_KEY='kyum-installation-settings-section';
const VALID_SECTIONS=new Set(['services','teams','neighborhoods']);
let cache={services:[],teams:[],neighborhoods:[],regions:[],cities:[]};

function db(){if(!window.customerSupabase)throw new Error('اتصال Supabase غير جاهز.');return window.customerSupabase}
function message(text,type=''){const el=$('installationSettingsStatus');if(!el)return;el.textContent=text||'';el.classList.toggle('hidden',!text);el.dataset.type=type}
function money(v){return new Intl.NumberFormat('ar-SA',{style:'currency',currency:'SAR',minimumFractionDigits:2}).format(Number(v||0))}
function status(active,label){return `<span class="installation-status-pill${active?'':' is-inactive'}">${esc(label)}</span>`}
function actionButtons(type,row,active){return `<div class="installation-settings-actions-cell"><button class="secondary-btn" type="button" data-setting-edit="${type}" data-id="${row.id}">تعديل</button><button class="secondary-btn" type="button" data-setting-toggle="${type}" data-id="${row.id}" data-active="${active?'1':'0'}">${active?'إيقاف':'تفعيل'}</button><button class="danger-btn" type="button" data-setting-delete="${type}" data-id="${row.id}">حذف</button></div>`}
function teamParts(row){return {groomer:row.groomer_name||row.leader_name||'',driver:row.driver_name||'',car:row.car_name||''}}

function render(){
  $('installationServicesSettingsBody').innerHTML=cache.services.map(r=>`<tr><td>${esc(r.name)}</td><td>${money(r.default_price)}</td><td>${money(r.default_cost)}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشطة':'متوقفة')}</td><td>${actionButtons('service',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد خدمات.</td></tr>';
  const teamBody=$('installationTeamsSettingsBody');
  if(teamBody){
    const head=teamBody.closest('table')?.querySelector('thead tr');
    if(head)head.innerHTML='<th>الجرومر</th><th>السائق</th><th>السيارة</th><th>الحالة</th><th>الإجراءات</th>';
    teamBody.innerHTML=cache.teams.map(r=>{const active=r.status!=='غير نشطة',p=teamParts(r);return `<tr><td>${esc(p.groomer||'—')}</td><td>${esc(p.driver||'—')}</td><td>${esc(p.car||'—')}</td><td>${status(active,r.status||'متاحة')}</td><td>${actionButtons('team',r,active)}</td></tr>`}).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد فرق مواعيد.</td></tr>';
  }
  $('installationNeighborhoodsSettingsBody').innerHTML=cache.neighborhoods.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.city||'—')}</td><td>${esc(r.region||'—')}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشط':'متوقف')}</td><td>${actionButtons('neighborhood',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد أحياء.</td></tr>';
}
function currentSection(){const saved=sessionStorage.getItem(SECTION_KEY);return VALID_SECTIONS.has(saved)?saved:'services'}
function showSection(section,{persist=true}={}){const next=VALID_SECTIONS.has(section)?section:'services';document.querySelectorAll('[data-installation-settings-panel]').forEach(panel=>{const visible=panel.dataset.installationSettingsPanel===next;panel.classList.toggle('hidden',!visible);panel.setAttribute('aria-hidden',visible?'false':'true')});const filter=$('installationSettingsSectionFilter');if(filter&&filter.value!==next)filter.value=next;if(persist)sessionStorage.setItem(SECTION_KEY,next)}
async function load(){message('جاري تحميل إعدادات المواعيد...');try{cache=await window.InstallationsServiceSafe.settingsCatalog();render();message('')}catch(e){message(e.message||'تعذر تحميل الإعدادات.','error')}}

let referenceGeoController=null;
function syncReferenceGeoCatalog(){window.KYUMGeography?.setCatalog({regions:cache.regions||[],cities:cache.cities||[],neighborhoods:cache.neighborhoods||[]})}
function ensureReferenceGeoController(){syncReferenceGeoCatalog();if(referenceGeoController)return referenceGeoController.bind();if(!window.KYUMGeography)throw new Error('مكوّن العنوان الجغرافي غير محمّل.');referenceGeoController=window.KYUMGeography.createController({ids:{region:{wrapper:'installationReferenceRegionCombobox',hidden:'installationReferenceRegionId',search:'installationReferenceRegionSearch',options:'installationReferenceRegionOptions'},city:{wrapper:'installationReferenceCityCombobox',hidden:'installationReferenceCityId',search:'installationReferenceCitySearch',options:'installationReferenceCityOptions'},district:{wrapper:'installationReferenceDistrictCombobox',hidden:'installationReferenceDistrictId',search:'installationReferenceDistrictSearch',options:'installationReferenceDistrictOptions'}},optionLimit:300,boundAttribute:'installationReferenceGeoUnifiedBound'}).bind();return referenceGeoController}
function closeAllReferenceGeo(){['region','city','district'].forEach(type=>referenceGeoController?.close(type))}
function bindReferenceGeography(row={}){const controller=ensureReferenceGeoController();controller.setValue({regionId:row.region_id||'',cityId:row.city_id||''});controller.setEnabled('city',Boolean(row.region_id),'ابحث واختر المدينة')}

function fields(type,row={}){
  if(type==='service')return `<label>اسم الخدمة<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label><label>السعر<input name="price" type="number" min="0" step="0.01" required value="${Number(row.default_price||0)}"></label><label>التكلفة<input name="cost" type="number" min="0" step="0.01" required value="${Number(row.default_cost||0)}"></label><label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشطة</option><option value="0" ${row.is_active===false?'selected':''}>متوقفة</option></select></label>`;
  if(type==='team'){const p=teamParts(row);return `<label>الجرومر<input name="groomerName" required maxlength="120" value="${esc(p.groomer)}" placeholder="اسم الجرومر"></label><label>السائق<input name="driverName" required maxlength="120" value="${esc(p.driver)}" placeholder="اسم السائق"></label><label>السيارة<input name="carName" required maxlength="120" value="${esc(p.car)}" placeholder="اسم أو رقم السيارة"></label><label>الحالة<select name="status">${['متاحة','مشغولة','إجازة','غير نشطة'].map(x=>`<option ${row.status===x?'selected':''}>${x}</option>`).join('')}</select></label><small class="field-hint">اسم الفريق يُنشأ تلقائيًا بالشكل: الجرومر - السائق - السيارة.</small>`}
  return `<label>اسم الحي<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label>
  <label class="installation-reference-geo-field">المنطقة<div id="installationReferenceRegionCombobox" class="geo-searchable-select installation-reference-geo-select" data-reference-geo-type="region"><input id="installationReferenceRegionId" name="regionId" type="hidden"><input id="installationReferenceRegionSearch" class="geo-searchable-input" type="search" placeholder="ابحث واختر المنطقة" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceRegionOptions"><button class="geo-searchable-toggle" type="button" aria-label="فتح قائمة المناطق">⌄</button><div id="installationReferenceRegionOptions" class="geo-searchable-options hidden" role="listbox"></div></div></label>
  <label class="installation-reference-geo-field">المدينة<div id="installationReferenceCityCombobox" class="geo-searchable-select installation-reference-geo-select is-disabled" data-reference-geo-type="city"><input id="installationReferenceCityId" name="cityId" type="hidden"><input id="installationReferenceCitySearch" class="geo-searchable-input" type="search" placeholder="اختر المنطقة أولًا" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceCityOptions" disabled><button class="geo-searchable-toggle" type="button" aria-label="فتح قائمة المدن" disabled>⌄</button><div id="installationReferenceCityOptions" class="geo-searchable-options hidden" role="listbox"></div></div><small class="field-hint">اختيار المدينة مرتبط بالمنطقة النشطة فقط.</small></label>
  <label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشط</option><option value="0" ${row.is_active===false?'selected':''}>متوقف</option></select></label>`;
}
function open(type,id=''){const list=type==='service'?cache.services:type==='team'?cache.teams:cache.neighborhoods,row=list.find(x=>x.id===id)||{};$('installationReferenceType').value=type;$('installationReferenceId').value=id;$('installationReferenceDialogTitle').textContent=(id?'تعديل ':'إضافة ')+(type==='service'?'خدمة':type==='team'?'فريق موعد':'حي');$('installationReferenceFields').innerHTML=fields(type,row);if(type==='neighborhood')bindReferenceGeography(row);$('installationReferenceFormStatus').classList.add('hidden');$('installationReferenceDialog').showModal()}

async function saveTeam(payload){
  const groomer=String(payload.groomerName||'').trim(),driver=String(payload.driverName||'').trim(),car=String(payload.carName||'').trim();
  if(!groomer||!driver||!car)throw new Error('الجرومر والسائق والسيارة بيانات مطلوبة.');
  const record={name:[groomer,driver,car].join(' - '),groomer_name:groomer,driver_name:driver,car_name:car,leader_name:groomer,phone:null,city:null,status:payload.status||'متاحة'};
  const q=payload.id?db().from('installation_teams').update(record).eq('id',payload.id):db().from('installation_teams').insert(record);
  const {error}=await q;if(error){if(/groomer_name|driver_name|car_name/i.test(error.message||''))throw new Error('شغّل Migration فريق المواعيد أولًا ثم أعد المحاولة.');throw new Error('تعذر حفظ فريق الموعد: '+error.message)}
}

async function submit(e){
  e.preventDefault();const fd=new FormData(e.currentTarget),type=$('installationReferenceType').value,payload=Object.fromEntries(fd.entries());payload.id=$('installationReferenceId').value;payload.isActive=payload.isActive!=='0';
  if(type==='neighborhood'){const controller=ensureReferenceGeoController();const validation=controller.validate({requireRegion:true,requireCity:true,requireDistrict:false});if(!validation.valid){const input=controller.elements(validation.field)?.search;input?.setCustomValidity(validation.message);input?.reportValidity();input?.focus();return}payload.regionId=validation.value.regionId;payload.cityId=validation.value.cityId;payload.region=validation.value.region||'';payload.city=validation.value.city||''}
  try{if(type==='team')await saveTeam(payload);else await window.InstallationsServiceSafe.saveSettingItem(type,payload);closeAllReferenceGeo();$('installationReferenceDialog').close();await load();message('تم حفظ البيانات بنجاح.','success')}catch(err){const el=$('installationReferenceFormStatus');el.textContent=err.message;el.classList.remove('hidden');el.dataset.type='error'}
}

function normalizeHeader(v){return String(v??'').trim().toLowerCase().replace(/[_\-\s]+/g,' ')}
function pick(row,aliases){const keys=Object.keys(row||{});for(const alias of aliases){const wanted=normalizeHeader(alias),key=keys.find(k=>normalizeHeader(k)===wanted);if(key!==undefined)return row[key]}return ''}
function parseActive(v){const s=String(v??'').trim().toLowerCase();return !['0','false','no','inactive','متوقفة','متوقف','غير نشطة','غير نشط'].includes(s)}

function prepareServiceImport(){
  const add=$('addInstallationServiceBtn');if(!add||$('installationServicesExcelBtn'))return;
  const btn=document.createElement('button');btn.id='installationServicesExcelBtn';btn.className='secondary-btn';btn.type='button';btn.textContent='رفع الخدمات Excel';
  const input=document.createElement('input');input.id='installationServicesExcelInput';input.type='file';input.accept='.xlsx,.xls';input.hidden=true;
  add.insertAdjacentElement('beforebegin',btn);add.insertAdjacentElement('beforebegin',input);
  btn.addEventListener('click',()=>input.click());input.addEventListener('change',()=>importServicesExcel(input.files?.[0]));
}

async function importServicesExcel(file){
  if(!file)return;
  if(!window.XLSX){message('مكتبة Excel غير جاهزة. أعد تحميل الصفحة وحاول مرة أخرى.','error');return}
  message('جاري قراءة ملف الخدمات...');
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});
    if(!rows.length)throw new Error('ملف Excel لا يحتوي على صفوف بيانات.');
    const seen=new Set(),prepared=[],errors=[];
    rows.forEach((r,i)=>{
      const name=String(pick(r,['اسم الخدمة','الخدمة','service','service name','name'])||'').trim();
      const price=Number(pick(r,['السعر','سعر الخدمة','price','default price'])||0);
      const cost=Number(pick(r,['التكلفة','تكلفة الخدمة','cost','default cost'])||0);
      const active=parseActive(pick(r,['الحالة','status','active','is active']));
      const key=name.toLocaleLowerCase('ar');
      if(!name){errors.push(`صف ${i+2}: اسم الخدمة مطلوب`);return}
      if(!Number.isFinite(price)||price<0||!Number.isFinite(cost)||cost<0){errors.push(`صف ${i+2}: السعر والتكلفة يجب أن يكونا أرقامًا موجبة أو صفرًا`);return}
      if(seen.has(key)){errors.push(`صف ${i+2}: الخدمة مكررة داخل الملف (${name})`);return}
      seen.add(key);prepared.push({name,price,cost,isActive:active});
    });
    if(errors.length)throw new Error(`تعذر اعتماد الملف. ${errors.slice(0,5).join(' — ')}${errors.length>5?` — و${errors.length-5} أخطاء أخرى`:''}`);
    let done=0;
    for(const row of prepared){
      const existing=cache.services.find(x=>String(x.name||'').trim().toLocaleLowerCase('ar')===row.name.toLocaleLowerCase('ar'));
      await window.InstallationsServiceSafe.saveSettingItem('service',{...row,id:existing?.id||''});
      done++;message(`جاري رفع الخدمات: ${done} / ${prepared.length}`);
    }
    await load();message(`تم رفع ${prepared.length} خدمة من Excel بنجاح. الخدمات الموجودة تم تحديثها بدل تكرارها.`,'success');
    const input=$('installationServicesExcelInput');if(input)input.value='';
  }catch(e){message(e.message||'تعذر استيراد الخدمات من Excel.','error')}
}

function tuneHeadings(){
  const panel=$('installationSettingsTeamsPanel'),p=panel?.querySelector('.installation-settings-section-header p');if(p)p.textContent='كل فريق موعد = جرومر + سائق + سيارة، ويتم استخدام هذا الربط في الجدولة.';
  const services=$('installationSettingsServicesPanel'),sp=services?.querySelector('.installation-settings-section-header p');if(sp)sp.textContent='إدارة الخدمات يدويًا أو رفعها دفعة واحدة من Excel.';
}

function bind(){
  showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();
  $('installationSettingsSectionFilter')?.addEventListener('change',e=>showSection(e.target.value));
  $('addInstallationServiceBtn')?.addEventListener('click',()=>open('service'));
  $('addInstallationTeamBtn')?.addEventListener('click',()=>open('team'));
  $('addInstallationNeighborhoodBtn')?.addEventListener('click',()=>open('neighborhood'));
  $('installationReferenceForm')?.addEventListener('submit',submit);
  $('closeInstallationReferenceDialog')?.addEventListener('click',()=>{closeAllReferenceGeo();$('installationReferenceDialog').close()});
  $('cancelInstallationReferenceDialog')?.addEventListener('click',()=>{closeAllReferenceGeo();$('installationReferenceDialog').close()});
  $('installationReferenceDialog')?.addEventListener('close',()=>closeAllReferenceGeo());
  document.addEventListener('click',async e=>{
    if(!e.target.closest('.installation-reference-geo-select'))closeAllReferenceGeo();
    const edit=e.target.closest('[data-setting-edit]');if(edit)return open(edit.dataset.settingEdit,edit.dataset.id);
    const toggle=e.target.closest('[data-setting-toggle]');if(toggle){try{await window.InstallationsServiceSafe.toggleSettingItem(toggle.dataset.settingToggle,toggle.dataset.id,toggle.dataset.active!=='1');await load()}catch(err){message(err.message,'error')}return}
    const del=e.target.closest('[data-setting-delete]');if(del&&confirm('هل تريد حذف هذا السجل؟')){try{await window.InstallationsServiceSafe.removeSettingItem(del.dataset.settingDelete,del.dataset.id);await load()}catch(err){message(err.message,'error')}}
  });
  window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='installationSettings'){showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();load()}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="installationSettings"]'))setTimeout(()=>{showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();load()},0)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
