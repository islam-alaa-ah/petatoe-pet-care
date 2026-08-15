(function(){'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SECTION_KEY='kyum-installation-settings-section';
const VALID_SECTIONS=new Set(['services','teams','neighborhoods','employees','cars','breeds']);
let cache={services:[],teams:[],neighborhoods:[],regions:[],cities:[],employees:[],cars:[],breeds:[]};

function db(){if(!window.customerSupabase)throw new Error('اتصال Supabase غير جاهز.');return window.customerSupabase}
function message(text,type=''){const el=$('installationSettingsStatus');if(!el)return;el.textContent=text||'';el.classList.toggle('hidden',!text);el.dataset.type=type}
function money(v){return new Intl.NumberFormat('ar-SA-u-nu-latn',{style:'currency',currency:'SAR',minimumFractionDigits:2}).format(Number(v||0))}
function round2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function vatInclusive(net){return round2(Number(net||0)*1.15)}
function netFromVatInclusive(gross){return round2(Number(gross||0)/1.15)}
function status(active,label){return `<span class="installation-status-pill${active?'':' is-inactive'}">${esc(label)}</span>`}
function actionButtons(type,row,active){return `<div class="installation-settings-actions-cell"><button class="secondary-btn" type="button" data-setting-edit="${type}" data-id="${row.id}">تعديل</button><button class="secondary-btn" type="button" data-setting-toggle="${type}" data-id="${row.id}" data-active="${active?'1':'0'}">${active?'إيقاف':'تفعيل'}</button><button class="danger-btn" type="button" data-setting-delete="${type}" data-id="${row.id}">حذف</button></div>`}
function teamParts(row){return {groomer:row.groomer_name||row.leader_name||'',driver:row.driver_name||'',car:row.car_name||''}}
function option(value,label,selected=false,disabled=false){return `<option value="${esc(value)}" ${selected?'selected':''} ${disabled?'disabled':''}>${esc(label)}</option>`}
function employeeLabel(row){return `${row.full_name}${row.phone?` — ${row.phone}`:''}${row.is_active===false?' — غير نشط':''}`}
function carLabel(row){return `${row.name}${row.plate_number?` — ${row.plate_number}`:''}${row.is_active===false?' — غير نشطة':''}`}

function render(){
  const servicesBody=$('installationServicesSettingsBody');
  if(servicesBody){
    const servicesHead=servicesBody.closest('table')?.querySelector('thead tr');
    if(servicesHead)servicesHead.innerHTML='<th>الكود</th><th>الخدمة</th><th>السعر شامل الضريبة</th><th>التكلفة</th><th>الحالة</th><th>الإجراءات</th>';
    servicesBody.innerHTML=cache.services.map(r=>`<tr><td>${esc(r.service_code||'—')}</td><td>${esc(r.name)}</td><td>${money(vatInclusive(r.default_price))}</td><td>${money(r.default_cost)}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشطة':'متوقفة')}</td><td>${actionButtons('service',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty-cell">لا توجد خدمات.</td></tr>';
  }
  const teamBody=$('installationTeamsSettingsBody');
  if(teamBody){
    const head=teamBody.closest('table')?.querySelector('thead tr');
    if(head)head.innerHTML='<th>الجرومر</th><th>السائق</th><th>السيارة</th><th>الحالة</th><th>الإجراءات</th>';
    teamBody.innerHTML=cache.teams.map(r=>{const active=r.status!=='غير نشطة',p=teamParts(r);return `<tr><td>${esc(p.groomer||'—')}</td><td>${esc(p.driver||'—')}</td><td>${esc(p.car||'—')}</td><td>${status(active,r.status||'متاحة')}</td><td>${actionButtons('team',r,active)}</td></tr>`}).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد فرق مواعيد.</td></tr>';
  }
  $('installationNeighborhoodsSettingsBody').innerHTML=cache.neighborhoods.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.city||'—')}</td><td>${esc(r.region||'—')}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشط':'متوقف')}</td><td>${actionButtons('neighborhood',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا توجد أحياء.</td></tr>';
  const employeeBody=$('appointmentEmployeesSettingsBody');
  if(employeeBody)employeeBody.innerHTML=cache.employees.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(r.employee_type)}</td><td>${esc(r.phone||'—')}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشط':'متوقف')}</td><td>${actionButtons('employee',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty-cell">لا يوجد موظفون.</td></tr>';
  const carBody=$('appointmentCarsSettingsBody');
  if(carBody)carBody.innerHTML=cache.cars.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.plate_number||'—')}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشطة':'متوقفة')}</td><td>${actionButtons('car',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty-cell">لا توجد سيارات.</td></tr>';
  const breedBody=$('appointmentBreedsSettingsBody');
  if(breedBody)breedBody.innerHTML=cache.breeds.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.pet_type)}</td><td>${status(r.is_active!==false,r.is_active!==false?'نشطة':'متوقفة')}</td><td>${actionButtons('breed',r,r.is_active!==false)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty-cell">لا توجد سلالات.</td></tr>';
}
function currentSection(){const saved=sessionStorage.getItem(SECTION_KEY);return VALID_SECTIONS.has(saved)?saved:'services'}
function showSection(section,{persist=true}={}){const next=VALID_SECTIONS.has(section)?section:'services';document.querySelectorAll('[data-installation-settings-panel]').forEach(panel=>{const visible=panel.dataset.installationSettingsPanel===next;panel.classList.toggle('hidden',!visible);panel.setAttribute('aria-hidden',visible?'false':'true')});const filter=$('installationSettingsSectionFilter');if(filter&&filter.value!==next)filter.value=next;if(persist)sessionStorage.setItem(SECTION_KEY,next)}
async function load(){
  message('جاري تحميل إعدادات المواعيد...');
  try{
    const [base,employeesRes,carsRes,breedsRes]=await Promise.all([
      window.InstallationsServiceSafe.settingsCatalog(),
      db().from('appointment_employees').select('*').order('employee_type').order('full_name'),
      db().from('appointment_cars').select('*').order('name'),
      db().from('appointment_pet_breeds').select('*').order('pet_type').order('name')
    ]);
    if(employeesRes.error||carsRes.error||breedsRes.error){const err=employeesRes.error||carsRes.error||breedsRes.error;if(/appointment_employees|appointment_cars/i.test(err.message||''))throw new Error('شغّل Migration الموظفين والسيارات أولًا ثم أعد تحميل الصفحة.');throw err}
    cache={...base,employees:employeesRes.data||[],cars:carsRes.data||[],breeds:breedsRes.data||[]};render();message('');
  }catch(e){message(e.message||'تعذر تحميل الإعدادات.','error')}
}

let referenceGeoController=null;
function syncReferenceGeoCatalog(){window.KYUMGeography?.setCatalog({regions:cache.regions||[],cities:cache.cities||[],neighborhoods:cache.neighborhoods||[]})}
function ensureReferenceGeoController(){syncReferenceGeoCatalog();if(referenceGeoController)return referenceGeoController.bind();if(!window.KYUMGeography)throw new Error('مكوّن العنوان الجغرافي غير محمّل.');referenceGeoController=window.KYUMGeography.createController({ids:{region:{wrapper:'installationReferenceRegionCombobox',hidden:'installationReferenceRegionId',search:'installationReferenceRegionSearch',options:'installationReferenceRegionOptions'},city:{wrapper:'installationReferenceCityCombobox',hidden:'installationReferenceCityId',search:'installationReferenceCitySearch',options:'installationReferenceCityOptions'},district:{wrapper:'installationReferenceDistrictCombobox',hidden:'installationReferenceDistrictId',search:'installationReferenceDistrictSearch',options:'installationReferenceDistrictOptions'}},optionLimit:300,boundAttribute:'installationReferenceGeoUnifiedBound'}).bind();return referenceGeoController}
function closeAllReferenceGeo(){['region','city','district'].forEach(type=>referenceGeoController?.close(type))}
function bindReferenceGeography(row={}){const controller=ensureReferenceGeoController();controller.setValue({regionId:row.region_id||'',cityId:row.city_id||''});controller.setEnabled('city',Boolean(row.region_id),'ابحث واختر المدينة')}

function fields(type,row={}){
  if(type==='service')return `<label>الكود<input name="serviceCode" required maxlength="60" value="${esc(row.service_code||'')}" placeholder="مثال: GRM-001"></label><label>اسم الخدمة<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label><label>السعر شامل الضريبة<input name="priceInclusive" type="number" min="0" step="0.01" required value="${vatInclusive(row.default_price||0)}"></label><label>التكلفة<input name="cost" type="number" min="0" step="0.01" required value="${Number(row.default_cost||0)}"></label><label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشطة</option><option value="0" ${row.is_active===false?'selected':''}>متوقفة</option></select></label><small class="field-hint">السعر المدخل شامل ضريبة القيمة المضافة 15%، ويُحفظ السعر الأساسي داخليًا لمنع احتساب الضريبة مرتين داخل الموعد.</small>`;
  if(type==='employee')return `<label>اسم الموظف<input name="fullName" required maxlength="120" value="${esc(row.full_name||'')}" placeholder="اسم الموظف"></label><label>الوظيفة<select name="employeeType" required><option value="جرومر" ${row.employee_type==='جرومر'?'selected':''}>جرومر</option><option value="سائق" ${row.employee_type==='سائق'?'selected':''}>سائق</option></select></label><label>رقم التواصل<input name="phone" maxlength="30" value="${esc(row.phone||'')}" placeholder="اختياري"></label><label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشط</option><option value="0" ${row.is_active===false?'selected':''}>متوقف</option></select></label>`;
  if(type==='breed')return `<label>اسم السلالة<input name="name" required maxlength="120" value="${esc(row.name||'')}" placeholder="اسم السلالة"></label><label>نوع الحيوان<select name="petType" required><option value="كلب" ${row.pet_type==='كلب'?'selected':''}>كلب</option><option value="قط" ${row.pet_type==='قط'?'selected':''}>قط</option><option value="أخرى" ${row.pet_type==='أخرى'?'selected':''}>أخرى</option></select></label><label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشطة</option><option value="0" ${row.is_active===false?'selected':''}>متوقفة</option></select></label>`;
  if(type==='car')return `<label>اسم / كود السيارة<input name="name" required maxlength="120" value="${esc(row.name||'')}" placeholder="مثال: سيارة 1"></label><label>رقم اللوحة<input name="plateNumber" maxlength="60" value="${esc(row.plate_number||'')}" placeholder="اختياري"></label><label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشطة</option><option value="0" ${row.is_active===false?'selected':''}>متوقفة</option></select></label>`;
  if(type==='team'){
    const groomerId=row.groomer_employee_id||cache.employees.find(x=>x.employee_type==='جرومر'&&x.full_name===teamParts(row).groomer)?.id||'';
    const driverId=row.driver_employee_id||cache.employees.find(x=>x.employee_type==='سائق'&&x.full_name===teamParts(row).driver)?.id||'';
    const carId=row.appointment_car_id||cache.cars.find(x=>x.name===teamParts(row).car)?.id||'';
    const groomers=cache.employees.filter(x=>x.employee_type==='جرومر');
    const drivers=cache.employees.filter(x=>x.employee_type==='سائق');
    return `<label>الجرومر<select name="groomerEmployeeId" required>${option('','اختر الجرومر',!groomerId,true)}${groomers.map(x=>option(x.id,employeeLabel(x),x.id===groomerId,x.is_active===false&&x.id!==groomerId)).join('')}</select></label><label>السائق<select name="driverEmployeeId" required>${option('','اختر السائق',!driverId,true)}${drivers.map(x=>option(x.id,employeeLabel(x),x.id===driverId,x.is_active===false&&x.id!==driverId)).join('')}</select></label><label>السيارة<select name="carId" required>${option('','اختر السيارة',!carId,true)}${cache.cars.map(x=>option(x.id,carLabel(x),x.id===carId,x.is_active===false&&x.id!==carId)).join('')}</select></label><label>الحالة<select name="status">${['متاحة','مشغولة','إجازة','غير نشطة'].map(x=>`<option ${row.status===x?'selected':''}>${x}</option>`).join('')}</select></label><small class="field-hint">القوائم تأتي من بيانات الموظفين والسيارات المسجلة في إعدادات المواعيد.</small>`;
  }
  return `<label>اسم الحي<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label>
  <label class="installation-reference-geo-field">المنطقة<div id="installationReferenceRegionCombobox" class="geo-searchable-select installation-reference-geo-select" data-reference-geo-type="region"><input id="installationReferenceRegionId" name="regionId" type="hidden"><input id="installationReferenceRegionSearch" class="geo-searchable-input" type="search" placeholder="ابحث واختر المنطقة" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceRegionOptions"><button class="geo-searchable-toggle" type="button" aria-label="فتح قائمة المناطق">⌄</button><div id="installationReferenceRegionOptions" class="geo-searchable-options hidden" role="listbox"></div></div></label>
  <label class="installation-reference-geo-field">المدينة<div id="installationReferenceCityCombobox" class="geo-searchable-select installation-reference-geo-select is-disabled" data-reference-geo-type="city"><input id="installationReferenceCityId" name="cityId" type="hidden"><input id="installationReferenceCitySearch" class="geo-searchable-input" type="search" placeholder="اختر المنطقة أولًا" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceCityOptions" disabled><button class="geo-searchable-toggle" type="button" aria-label="فتح قائمة المدن" disabled>⌄</button><div id="installationReferenceCityOptions" class="geo-searchable-options hidden" role="listbox"></div></div><small class="field-hint">اختيار المدينة مرتبط بالمنطقة النشطة فقط.</small></label>
  <label>الحالة<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>نشط</option><option value="0" ${row.is_active===false?'selected':''}>متوقف</option></select></label>`;
}
function listForType(type){return type==='service'?cache.services:type==='team'?cache.teams:type==='employee'?cache.employees:type==='car'?cache.cars:type==='breed'?cache.breeds:cache.neighborhoods}
function typeTitle(type){return type==='service'?'خدمة':type==='team'?'فريق موعد':type==='employee'?'موظف':type==='car'?'سيارة':type==='breed'?'سلالة':'حي'}
function open(type,id=''){const list=listForType(type),row=list.find(x=>x.id===id)||{};$('installationReferenceType').value=type;$('installationReferenceId').value=id;$('installationReferenceDialogTitle').textContent=(id?'تعديل ':'إضافة ')+typeTitle(type);$('installationReferenceFields').innerHTML=fields(type,row);if(type==='neighborhood')bindReferenceGeography(row);$('installationReferenceFormStatus').classList.add('hidden');$('installationReferenceDialog').showModal()}

async function saveTeam(payload){
  const groomer=cache.employees.find(x=>x.id===payload.groomerEmployeeId),driver=cache.employees.find(x=>x.id===payload.driverEmployeeId),car=cache.cars.find(x=>x.id===payload.carId);
  if(!groomer||groomer.employee_type!=='جرومر')throw new Error('اختر جرومر صحيح من بيانات الموظفين.');
  if(!driver||driver.employee_type!=='سائق')throw new Error('اختر سائق صحيح من بيانات الموظفين.');
  if(!car)throw new Error('اختر سيارة صحيحة من بيانات السيارات.');
  const record={groomer_employee_id:groomer.id,driver_employee_id:driver.id,appointment_car_id:car.id,groomer_name:groomer.full_name,driver_name:driver.full_name,car_name:car.name,leader_name:groomer.full_name,name:[groomer.full_name,driver.full_name,car.name].join(' - '),phone:null,city:null,status:payload.status||'متاحة'};
  const q=payload.id?db().from('installation_teams').update(record).eq('id',payload.id):db().from('installation_teams').insert(record);
  const {error}=await q;if(error){if(/groomer_employee_id|driver_employee_id|appointment_car_id|appointment_employees|appointment_cars/i.test(error.message||''))throw new Error('شغّل Migration الموظفين والسيارات أولًا ثم أعد المحاولة.');if(error.code==='23505')throw new Error('الجرومر أو السائق أو السيارة مرتبط بالفعل بفريق موعد نشط آخر.');throw new Error('تعذر حفظ فريق الموعد: '+error.message)}
}
async function saveEmployee(payload){
  const record={full_name:String(payload.fullName||'').trim(),employee_type:payload.employeeType,phone:String(payload.phone||'').trim()||null,is_active:payload.isActive};
  if(!record.full_name)throw new Error('اسم الموظف مطلوب.');
  if(!['جرومر','سائق'].includes(record.employee_type))throw new Error('اختر وظيفة الموظف.');
  const q=payload.id?db().from('appointment_employees').update(record).eq('id',payload.id):db().from('appointment_employees').insert(record);
  const {error}=await q;if(error){if(error.code==='23505')throw new Error('هذا الموظف مسجل بالفعل بنفس الوظيفة.');throw new Error('تعذر حفظ الموظف: '+error.message)}
}
async function saveCar(payload){
  const record={name:String(payload.name||'').trim(),plate_number:String(payload.plateNumber||'').trim()||null,is_active:payload.isActive};
  if(!record.name)throw new Error('اسم أو كود السيارة مطلوب.');
  const q=payload.id?db().from('appointment_cars').update(record).eq('id',payload.id):db().from('appointment_cars').insert(record);
  const {error}=await q;if(error){if(error.code==='23505')throw new Error('اسم السيارة أو رقم اللوحة مستخدم بالفعل.');throw new Error('تعذر حفظ السيارة: '+error.message)}
}

async function submit(e){
  e.preventDefault();const fd=new FormData(e.currentTarget),type=$('installationReferenceType').value,payload=Object.fromEntries(fd.entries());payload.id=$('installationReferenceId').value;payload.isActive=payload.isActive!=='0';
  if(type==='neighborhood'){const controller=ensureReferenceGeoController();const validation=controller.validate({requireRegion:true,requireCity:true,requireDistrict:false});if(!validation.valid){const input=controller.elements(validation.field)?.search;input?.setCustomValidity(validation.message);input?.reportValidity();input?.focus();return}payload.regionId=validation.value.regionId;payload.cityId=validation.value.cityId;payload.region=validation.value.region||'';payload.city=validation.value.city||''}
  if(type==='service'){payload.serviceCode=String(payload.serviceCode||'').trim();payload.price=netFromVatInclusive(payload.priceInclusive);if(!payload.serviceCode){const el=$('installationReferenceFormStatus');el.textContent='كود الخدمة مطلوب.';el.classList.remove('hidden');el.dataset.type='error';return}}
  try{if(type==='team')await saveTeam(payload);else if(type==='employee')await saveEmployee(payload);else if(type==='car')await saveCar(payload);else await window.InstallationsServiceSafe.saveSettingItem(type,payload);closeAllReferenceGeo();$('installationReferenceDialog').close();await load();message('تم حفظ البيانات بنجاح.','success')}catch(err){const el=$('installationReferenceFormStatus');el.textContent=err.message;el.classList.remove('hidden');el.dataset.type='error'}
}

async function toggleMaster(type,id,active){
  const table=type==='employee'?'appointment_employees':'appointment_cars';
  const {error}=await db().from(table).update({is_active:active}).eq('id',id);
  if(error){if(/foreign key|installation_teams/i.test(error.message||''))throw new Error('لا يمكن إيقاف العنصر وهو مرتبط بفريق موعد نشط.');throw error}
}
async function removeMaster(type,id){
  const table=type==='employee'?'appointment_employees':'appointment_cars';
  const {error}=await db().from(table).delete().eq('id',id);
  if(error){if(error.code==='23503')throw new Error('لا يمكن حذف العنصر لأنه مرتبط بفريق موعد. أوقفه بدلًا من الحذف.');throw error}
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
      const serviceCode=String(pick(r,['الكود','كود الخدمة','code','service code','service_code'])||'').trim();
      const name=String(pick(r,['اسم الخدمة','الخدمة','service','service name','name'])||'').trim();
      const inclusivePrice=Number(pick(r,['السعر شامل الضريبة','السعر شامل الضريبه','سعر شامل الضريبة','price incl vat','price including vat','inclusive price','السعر','سعر الخدمة'])||0);
      const cost=Number(pick(r,['التكلفة','تكلفة الخدمة','cost','default cost'])||0);
      const active=parseActive(pick(r,['الحالة','status','active','is active']));
      const key=serviceCode.toLocaleLowerCase('en');
      if(!serviceCode){errors.push(`صف ${i+2}: كود الخدمة مطلوب`);return}
      if(!name){errors.push(`صف ${i+2}: اسم الخدمة مطلوب`);return}
      if(!Number.isFinite(inclusivePrice)||inclusivePrice<0||!Number.isFinite(cost)||cost<0){errors.push(`صف ${i+2}: السعر شامل الضريبة والتكلفة يجب أن يكونا أرقامًا موجبة أو صفرًا`);return}
      if(seen.has(key)){errors.push(`صف ${i+2}: كود الخدمة مكرر داخل الملف (${serviceCode})`);return}
      seen.add(key);prepared.push({serviceCode,name,price:netFromVatInclusive(inclusivePrice),cost,isActive:active});
    });
    if(errors.length)throw new Error(`تعذر اعتماد الملف. ${errors.slice(0,5).join(' — ')}${errors.length>5?` — و${errors.length-5} أخطاء أخرى`:''}`);
    let done=0;
    for(const row of prepared){
      const existing=cache.services.find(x=>String(x.service_code||'').trim().toLocaleLowerCase('en')===row.serviceCode.toLocaleLowerCase('en'));
      await window.InstallationsServiceSafe.saveSettingItem('service',{...row,id:existing?.id||''});
      done++;message(`جاري رفع الخدمات: ${done} / ${prepared.length}`);
    }
    await load();message(`تم رفع ${prepared.length} خدمة من Excel بنجاح. أكواد الخدمات الموجودة تم تحديثها بدل تكرارها.`,'success');
    const input=$('installationServicesExcelInput');if(input)input.value='';
  }catch(e){message(e.message||'تعذر استيراد الخدمات من Excel.','error')}
}

function tuneHeadings(){
  const panel=$('installationSettingsTeamsPanel'),p=panel?.querySelector('.installation-settings-section-header p');if(p)p.textContent='اربط جرومر + سائق + سيارة من البيانات المسجلة في أقسام الموظفين والسيارات.';
  const services=$('installationSettingsServicesPanel'),sp=services?.querySelector('.installation-settings-section-header p');if(sp)sp.textContent='إدارة الخدمات يدويًا أو رفعها دفعة واحدة من Excel.';
}

function bind(){
  showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();
  $('installationSettingsSectionFilter')?.addEventListener('change',e=>showSection(e.target.value));
  $('addInstallationServiceBtn')?.addEventListener('click',()=>open('service'));
  $('addInstallationTeamBtn')?.addEventListener('click',()=>open('team'));
  $('addInstallationNeighborhoodBtn')?.addEventListener('click',()=>open('neighborhood'));
  $('addAppointmentEmployeeBtn')?.addEventListener('click',()=>open('employee'));
  $('addAppointmentCarBtn')?.addEventListener('click',()=>open('car'));
  $('addAppointmentBreedBtn')?.addEventListener('click',()=>open('breed'));
  $('installationReferenceForm')?.addEventListener('submit',submit);
  $('closeInstallationReferenceDialog')?.addEventListener('click',()=>{closeAllReferenceGeo();$('installationReferenceDialog').close()});
  $('cancelInstallationReferenceDialog')?.addEventListener('click',()=>{closeAllReferenceGeo();$('installationReferenceDialog').close()});
  $('installationReferenceDialog')?.addEventListener('close',()=>closeAllReferenceGeo());
  document.addEventListener('click',async e=>{
    if(!e.target.closest('.installation-reference-geo-select'))closeAllReferenceGeo();
    const edit=e.target.closest('[data-setting-edit]');if(edit)return open(edit.dataset.settingEdit,edit.dataset.id);
    const toggle=e.target.closest('[data-setting-toggle]');if(toggle){try{const type=toggle.dataset.settingToggle;if(type==='employee'||type==='car')await toggleMaster(type,toggle.dataset.id,toggle.dataset.active!=='1');else await window.InstallationsServiceSafe.toggleSettingItem(type,toggle.dataset.id,toggle.dataset.active!=='1');await load()}catch(err){message(err.message,'error')}return}
    const del=e.target.closest('[data-setting-delete]');if(del&&confirm('هل تريد حذف هذا السجل؟')){try{const type=del.dataset.settingDelete;if(type==='employee'||type==='car')await removeMaster(type,del.dataset.id);else await window.InstallationsServiceSafe.removeSettingItem(type,del.dataset.id);await load()}catch(err){message(err.message,'error')}}
  });
  window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='installationSettings'){showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();load()}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="installationSettings"]'))setTimeout(()=>{showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();load()},0)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
