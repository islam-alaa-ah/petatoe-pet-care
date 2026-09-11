(function(){'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback};
function isoToday(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function currentLang(){return window.PetatoeLocalization?.effectiveLanguage?.()==='en'?'en':'ar'}
function dateLabel(value){if(!value)return '—';const d=new Date(`${value}T00:00:00`);if(Number.isNaN(d.getTime()))return String(value);const locale=currentLang()==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn';return new Intl.DateTimeFormat(locale,{year:'numeric',month:'2-digit',day:'2-digit',calendar:'gregory',numberingSystem:'latn'}).format(d)}
const TEAM_ASSIGNMENT_CUTOVER='2026-09-01';
const SECTION_KEY='kyum-installation-settings-section';
const VALID_SECTIONS=new Set(['services','teams','neighborhoods','employees','cars','breeds']);
let cache={services:[],teams:[],neighborhoods:[],regions:[],cities:[],employees:[],cars:[],breeds:[],teamAssignments:[]};

function db(){if(!window.customerSupabase)throw new Error(tr('appointmentSettings.error.dbNotReady','Supabase connection is not ready.'));return window.customerSupabase}
function uiMessage(value,fallback=''){return window.PetatoeLocalization?.translateMessage?.(value)||value||fallback}
function message(text,type=''){const el=$('installationSettingsStatus');if(!el)return;el.textContent=text||'';el.classList.toggle('hidden',!text);el.dataset.type=type}
function money(v){const locale=currentLang()==='en'?'en-US':'ar-SA-u-ca-gregory-nu-latn';return new Intl.NumberFormat(locale,{style:'currency',currency:'SAR',minimumFractionDigits:2,numberingSystem:'latn'}).format(Number(v||0))}
function round2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function vatInclusive(net){return round2(Number(net||0)*1.15)}
function netFromVatInclusive(gross){return round2(Number(gross||0)/1.15)}
function status(active,label){return `<span class="installation-status-pill${active?'':' is-inactive'}">${esc(label)}</span>`}
function actionButtons(type,row,active){return `<div class="installation-settings-actions-cell"><button class="secondary-btn" type="button" data-setting-edit="${type}" data-id="${row.id}">${esc(tr('appointmentSettings.common.edit','Edit'))}</button><button class="secondary-btn" type="button" data-setting-toggle="${type}" data-id="${row.id}" data-active="${active?'1':'0'}">${esc(active?tr('appointmentSettings.common.stop','Deactivate'):tr('appointmentSettings.common.activate','Activate'))}</button><button class="danger-btn" type="button" data-setting-delete="${type}" data-id="${row.id}">${esc(tr('appointmentSettings.common.delete','Delete'))}</button></div>`}
function teamParts(row){return {groomer:row.groomer_name||row.leader_name||'',driver:row.driver_name||'',car:row.car_name||''}}
function option(value,label,selected=false,disabled=false){return `<option value="${esc(value)}" ${selected?'selected':''} ${disabled?'disabled':''}>${esc(label)}</option>`}
function employeeLabel(row){return `${row.full_name}${row.phone?` — ${row.phone}`:''}${row.is_active===false?` — ${tr('appointmentSettings.common.inactive','Inactive')}`:''}`}
function carLabel(row){return `${row.name}${row.plate_number?` — ${row.plate_number}`:''}${row.is_active===false?` — ${tr('appointmentSettings.common.inactive','Inactive')}`:''}`}
function activeLabel(active){return active?tr('appointmentSettings.common.active','Active'):tr('appointmentSettings.common.inactive','Inactive')}
function employeeTypeLabel(value){return value==='جرومر'?tr('appointmentSettings.employee.groomer','Groomer'):value==='سائق'?tr('appointmentSettings.employee.driver','Driver'):String(value||'')}
function petTypeLabel(value){return value==='كلب'?tr('appointmentSettings.pet.dog','Dog'):value==='قط'?tr('appointmentSettings.pet.cat','Cat'):value==='أخرى'?tr('appointmentSettings.pet.other','Other'):String(value||'')}
function teamStatusLabel(value){const map={'متاحة':['appointmentSettings.common.available','Available'],'مشغولة':['appointmentSettings.common.busy','Busy'],'إجازة':['appointmentSettings.common.leave','On leave'],'غير نشطة':['appointmentSettings.common.inactive','Inactive']};const item=map[value];return item?tr(item[0],item[1]):String(value||'')}
function serviceDisplayLabel(row={}){const value=window.PetatoeLocalization?.entityText?.('service',{id:row.id||'',name:row.name||'',serviceCode:row.service_code||row.serviceCode||''});return value&&!/^\[entity\./.test(String(value))?value:String(row.name||'')}
function geographyDisplayLabel(type,id,name){const value=window.KYUMGeography?.localizedGeographyLabel?.(type,id,name);if(value)return value;return currentLang()==='en'&&/[\u0600-\u06FF]/.test(String(name||''))?'':String(name||'')}

function render(){
  const servicesBody=$('installationServicesSettingsBody');
  if(servicesBody){
    const servicesHead=servicesBody.closest('table')?.querySelector('thead tr');
    if(servicesHead)servicesHead.innerHTML=`<th>${esc(tr('appointmentSettings.col.code','Code'))}</th><th>${esc(tr('appointmentSettings.col.service','Service'))}</th><th>${esc(tr('appointmentSettings.col.priceVat','Price incl. VAT'))}</th><th>${esc(tr('appointmentSettings.col.cost','Cost'))}</th><th>${esc(tr('appointmentSettings.col.status','Status'))}</th><th>${esc(tr('appointmentSettings.col.actions','Actions'))}</th>`;
    servicesBody.innerHTML=cache.services.map(r=>`<tr><td>${esc(r.service_code||'—')}</td><td>${esc(serviceDisplayLabel(r))}</td><td>${money(vatInclusive(r.default_price))}</td><td>${money(r.default_cost)}</td><td>${status(r.is_active!==false,activeLabel(r.is_active!==false))}</td><td>${actionButtons('service',r,r.is_active!==false)}</td></tr>`).join('')||`<tr><td colspan="6" class="empty-cell">${esc(tr('appointmentSettings.empty.services','No services.'))}</td></tr>`;
  }
  const teamBody=$('installationTeamsSettingsBody');
  if(teamBody){
    const head=teamBody.closest('table')?.querySelector('thead tr');
    if(head)head.innerHTML=`<th>${esc(tr('appointmentSettings.field.groomer','Groomer'))}</th><th>${esc(tr('appointmentSettings.field.driver','Driver'))}</th><th>${esc(tr('appointmentSettings.field.vehicle','Vehicle'))}</th><th>${esc(tr('appointmentSettings.team.effectiveFromCurrent','Current Assignment Start'))}</th><th>${esc(tr('appointmentSettings.col.status','Status'))}</th><th>${esc(tr('appointmentSettings.col.actions','Actions'))}</th>`;
    teamBody.innerHTML=cache.teams.map(r=>{const active=r.status!=='غير نشطة',p=teamParts(r);return `<tr><td>${esc(p.groomer||'—')}</td><td>${esc(p.driver||'—')}</td><td>${esc(p.car||'—')}</td><td>${esc(dateLabel(r.assignment_effective_from))}</td><td>${status(active,teamStatusLabel(r.status||'متاحة'))}</td><td>${actionButtons('team',r,active)}</td></tr>`}).join('')||`<tr><td colspan="6" class="empty-cell">${esc(tr('appointmentSettings.empty.teams','No appointment teams.'))}</td></tr>`;
  }
  $('installationNeighborhoodsSettingsBody').innerHTML=cache.neighborhoods.map(r=>`<tr><td>${esc(geographyDisplayLabel('district',r.id,r.name)||'—')}</td><td>${esc(geographyDisplayLabel('city',r.city_id,r.city)||'—')}</td><td>${esc(geographyDisplayLabel('region',r.region_id,r.region)||'—')}</td><td>${status(r.is_active!==false,activeLabel(r.is_active!==false))}</td><td>${actionButtons('neighborhood',r,r.is_active!==false)}</td></tr>`).join('')||`<tr><td colspan="5" class="empty-cell">${esc(tr('appointmentSettings.empty.neighborhoods','No neighborhoods.'))}</td></tr>`;
  const employeeBody=$('appointmentEmployeesSettingsBody');
  if(employeeBody)employeeBody.innerHTML=cache.employees.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(employeeTypeLabel(r.employee_type))}</td><td>${esc(r.phone||'—')}</td><td>${status(r.is_active!==false,activeLabel(r.is_active!==false))}</td><td>${actionButtons('employee',r,r.is_active!==false)}</td></tr>`).join('')||`<tr><td colspan="5" class="empty-cell">${esc(tr('appointmentSettings.empty.employees','No employees.'))}</td></tr>`;
  const carBody=$('appointmentCarsSettingsBody');
  if(carBody)carBody.innerHTML=cache.cars.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.plate_number||'—')}</td><td>${status(r.is_active!==false,activeLabel(r.is_active!==false))}</td><td>${actionButtons('car',r,r.is_active!==false)}</td></tr>`).join('')||`<tr><td colspan="4" class="empty-cell">${esc(tr('appointmentSettings.empty.cars','No vehicles.'))}</td></tr>`;
  const breedBody=$('appointmentBreedsSettingsBody');
  if(breedBody)breedBody.innerHTML=cache.breeds.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(petTypeLabel(r.pet_type))}</td><td>${status(r.is_active!==false,activeLabel(r.is_active!==false))}</td><td>${actionButtons('breed',r,r.is_active!==false)}</td></tr>`).join('')||`<tr><td colspan="4" class="empty-cell">${esc(tr('appointmentSettings.empty.breeds','No breeds.'))}</td></tr>`;
}
function currentSection(){const saved=sessionStorage.getItem(SECTION_KEY);return VALID_SECTIONS.has(saved)?saved:'services'}
function showSection(section,{persist=true}={}){const next=VALID_SECTIONS.has(section)?section:'services';document.querySelectorAll('[data-installation-settings-panel]').forEach(panel=>{const visible=panel.dataset.installationSettingsPanel===next;panel.classList.toggle('hidden',!visible);panel.setAttribute('aria-hidden',visible?'false':'true')});const filter=$('installationSettingsSectionFilter');if(filter&&filter.value!==next)filter.value=next;if(persist)sessionStorage.setItem(SECTION_KEY,next)}
async function load(){
  message(tr('appointmentSettings.status.loading','Loading appointment settings...'));
  try{
    const [base,employeesRes,carsRes,breedsRes,assignmentsRes]=await Promise.all([
      window.InstallationsServiceSafe.settingsCatalog(),
      db().from('appointment_employees').select('*').order('employee_type').order('full_name'),
      db().from('appointment_cars').select('*').order('name'),
      db().from('appointment_pet_breeds').select('*').order('pet_type').order('name'),
      db().from('installation_team_assignment_history').select('installation_team_id,effective_from').is('effective_to',null),
      window.KYUMGeography?.loadCatalog?.(false)?.catch?.(()=>null)
    ]);
    if(employeesRes.error||carsRes.error||breedsRes.error||assignmentsRes.error){const err=employeesRes.error||carsRes.error||breedsRes.error||assignmentsRes.error;if(/installation_team_assignment_history/i.test(err.message||''))throw new Error(tr('appointmentSettings.team.historyLoadRequired','Run the team assignment history migration first, then reload.'));if(/appointment_employees|appointment_cars/i.test(err.message||''))throw new Error(tr('appointmentSettings.error.employeeCarMigration','Run the employees and vehicles migration first, then reload.'));throw err}
    const assignmentByTeam=new Map((assignmentsRes.data||[]).map(x=>[String(x.installation_team_id||''),x.effective_from||'']));
    const teams=(base.teams||[]).map(team=>({...team,assignment_effective_from:assignmentByTeam.get(String(team.id||''))||''}));
    cache={...base,teams,employees:employeesRes.data||[],cars:carsRes.data||[],breeds:breedsRes.data||[],teamAssignments:assignmentsRes.data||[]};syncReferenceGeoCatalog();window.PetatoeLocalization?.registerEntityCatalog?.({services:(cache.services||[]).map(r=>({id:r.id,name:r.name||'',serviceCode:r.service_code||''})),neighborhoods:(cache.neighborhoods||[]).map(r=>({id:r.id,name:r.name||'',en:r.name_en||'',name_en:r.name_en||''}))});render();message('');
  }catch(e){message(uiMessage(e.message,tr('appointmentSettings.error.load','Unable to load settings.')),'error')}
}

let referenceGeoController=null;
function syncReferenceGeoCatalog(){
  const geo=window.KYUMGeography;if(!geo?.setCatalog)return;
  const current=geo.getCatalog?.()||{regions:[],cities:[],districts:[]};
  const merge=(rows,existing)=>{const byId=new Map((existing||[]).map(x=>[String(x.id||''),x]));return (rows||[]).map(row=>{const previous=byId.get(String(row.id||''))||{};return {...previous,...row,name_en:row.name_en||row.nameEn||previous.name_en||previous.nameEn||''}})};
  geo.setCatalog({regions:merge(cache.regions,current.regions),cities:merge(cache.cities,current.cities),neighborhoods:merge(cache.neighborhoods,current.districts)});
}
function ensureReferenceGeoController(){syncReferenceGeoCatalog();if(referenceGeoController)return referenceGeoController.bind();if(!window.KYUMGeography)throw new Error(tr('appointmentSettings.error.geographyUnavailable','Geographic address component is not loaded.'));referenceGeoController=window.KYUMGeography.createController({ids:{region:{wrapper:'installationReferenceRegionCombobox',hidden:'installationReferenceRegionId',search:'installationReferenceRegionSearch',options:'installationReferenceRegionOptions'},city:{wrapper:'installationReferenceCityCombobox',hidden:'installationReferenceCityId',search:'installationReferenceCitySearch',options:'installationReferenceCityOptions'},district:{wrapper:'installationReferenceDistrictCombobox',hidden:'installationReferenceDistrictId',search:'installationReferenceDistrictSearch',options:'installationReferenceDistrictOptions'}},optionLimit:300,boundAttribute:'installationReferenceGeoUnifiedBound'}).bind();return referenceGeoController}
function closeAllReferenceGeo(){['region','city','district'].forEach(type=>referenceGeoController?.close(type))}
function bindReferenceGeography(row={}){const controller=ensureReferenceGeoController();controller.setValue({regionId:row.region_id||'',cityId:row.city_id||''});controller.setEnabled('city',Boolean(row.region_id),tr('appointmentSettings.placeholder.city','Search and select city'))}

function fields(type,row={}){
  const on=tr('appointmentSettings.common.active','Active'),off=tr('appointmentSettings.common.inactive','Inactive');
  if(type==='service')return `<label>${esc(tr('appointmentSettings.field.serviceCode','Code'))}<input name="serviceCode" required maxlength="60" value="${esc(row.service_code||'')}" placeholder="${esc(tr('appointmentSettings.placeholder.serviceCode','Example: GRM-001'))}"></label><label>${esc(tr('appointmentSettings.field.serviceName','Service name'))}<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label><label>${esc(tr('appointmentSettings.field.priceVat','Price incl. VAT'))}<input name="priceInclusive" type="number" min="0" step="0.01" required value="${vatInclusive(row.default_price||0)}"></label><label>${esc(tr('appointmentSettings.field.cost','Cost'))}<input name="cost" type="number" min="0" step="0.01" required value="${Number(row.default_cost||0)}"></label><label>${esc(tr('appointmentSettings.field.status','Status'))}<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>${esc(on)}</option><option value="0" ${row.is_active===false?'selected':''}>${esc(off)}</option></select></label><small class="field-hint">${esc(tr('appointmentSettings.services.vatHint','The entered price includes 15% VAT; the net price is stored internally to prevent VAT from being calculated twice in the appointment.'))}</small>`;
  if(type==='employee')return `<label>${esc(tr('appointmentSettings.field.employeeName','Employee name'))}<input name="fullName" required maxlength="120" value="${esc(row.full_name||'')}" placeholder="${esc(tr('appointmentSettings.placeholder.employeeName','Employee name'))}"></label><label>${esc(tr('appointmentSettings.field.employeeType','Role'))}<select name="employeeType" required><option value="جرومر" ${row.employee_type==='جرومر'?'selected':''}>${esc(tr('appointmentSettings.employee.groomer','Groomer'))}</option><option value="سائق" ${row.employee_type==='سائق'?'selected':''}>${esc(tr('appointmentSettings.employee.driver','Driver'))}</option></select></label><label>${esc(tr('appointmentSettings.field.phone','Mobile number'))}<input name="phone" maxlength="30" value="${esc(row.phone||'')}" placeholder="${esc(tr('appointmentSettings.placeholder.optional','Optional'))}"></label><label>${esc(tr('appointmentSettings.field.status','Status'))}<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>${esc(on)}</option><option value="0" ${row.is_active===false?'selected':''}>${esc(off)}</option></select></label>`;
  if(type==='breed')return `<label>${esc(tr('appointmentSettings.field.breedName','Breed name'))}<input name="name" required maxlength="120" value="${esc(row.name||'')}" placeholder="${esc(tr('appointmentSettings.placeholder.breedName','Breed name'))}"></label><label>${esc(tr('appointmentSettings.field.petType','Pet type'))}<select name="petType" required><option value="كلب" ${row.pet_type==='كلب'?'selected':''}>${esc(tr('appointmentSettings.pet.dog','Dog'))}</option><option value="قط" ${row.pet_type==='قط'?'selected':''}>${esc(tr('appointmentSettings.pet.cat','Cat'))}</option><option value="أخرى" ${row.pet_type==='أخرى'?'selected':''}>${esc(tr('appointmentSettings.pet.other','Other'))}</option></select></label><label>${esc(tr('appointmentSettings.field.status','Status'))}<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>${esc(on)}</option><option value="0" ${row.is_active===false?'selected':''}>${esc(off)}</option></select></label>`;
  if(type==='car')return `<label>${esc(tr('appointmentSettings.field.carName','Vehicle name / code'))}<input name="name" required maxlength="120" value="${esc(row.name||'')}" placeholder="${esc(tr('appointmentSettings.placeholder.carName','Example: Vehicle 1'))}"></label><label>${esc(tr('appointmentSettings.field.plateNumber','Plate number'))}<input name="plateNumber" maxlength="60" value="${esc(row.plate_number||'')}" placeholder="${esc(tr('appointmentSettings.placeholder.optional','Optional'))}"></label><label>${esc(tr('appointmentSettings.field.status','Status'))}<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>${esc(on)}</option><option value="0" ${row.is_active===false?'selected':''}>${esc(off)}</option></select></label>`;
  if(type==='team'){
    const groomerId=row.groomer_employee_id||cache.employees.find(x=>x.employee_type==='جرومر'&&x.full_name===teamParts(row).groomer)?.id||'';
    const driverId=row.driver_employee_id||cache.employees.find(x=>x.employee_type==='سائق'&&x.full_name===teamParts(row).driver)?.id||'';
    const carId=row.appointment_car_id||cache.cars.find(x=>x.name===teamParts(row).car)?.id||'';
    const groomers=cache.employees.filter(x=>x.employee_type==='جرومر');
    const drivers=cache.employees.filter(x=>x.employee_type==='سائق');
    const today=isoToday();
    const statuses=[['متاحة','appointmentSettings.common.available','Available'],['مشغولة','appointmentSettings.common.busy','Busy'],['إجازة','appointmentSettings.common.leave','On leave'],['غير نشطة','appointmentSettings.common.inactive','Inactive']];
    return `<label>${esc(tr('appointmentSettings.field.groomer','Groomer'))}<select name="groomerEmployeeId" required>${option('',tr('appointmentSettings.team.chooseGroomer','Choose groomer'),!groomerId,true)}${groomers.map(x=>option(x.id,employeeLabel(x),x.id===groomerId,x.is_active===false&&x.id!==groomerId)).join('')}</select></label><label>${esc(tr('appointmentSettings.field.driver','Driver'))}<select name="driverEmployeeId" required>${option('',tr('appointmentSettings.team.chooseDriver','Choose driver'),!driverId,true)}${drivers.map(x=>option(x.id,employeeLabel(x),x.id===driverId,x.is_active===false&&x.id!==driverId)).join('')}</select></label><label>${esc(tr('appointmentSettings.field.vehicle','Vehicle'))}<select name="carId" required>${option('',tr('appointmentSettings.team.chooseVehicle','Choose vehicle'),!carId,true)}${cache.cars.map(x=>option(x.id,carLabel(x),x.id===carId,x.is_active===false&&x.id!==carId)).join('')}</select></label><label>${esc(tr('appointmentSettings.team.effectiveFrom','Assignment Effective Date'))}<input name="effectiveFrom" type="date" min="${TEAM_ASSIGNMENT_CUTOVER}" max="${today}" value="" required></label><label>${esc(tr('appointmentSettings.field.status','Status'))}<select name="status">${statuses.map(([raw,key,fallback])=>`<option value="${raw}" ${row.status===raw?'selected':''}>${esc(tr(key,fallback))}</option>`).join('')}</select></label><small class="field-hint">${esc(tr('appointmentSettings.team.cutoverHint','Data before 2026-09-01 is frozen as-is; the current effective-dated assignment timeline starts on 2026-09-01.'))}</small>`;
  }
  return `<label>${esc(tr('appointmentSettings.field.neighborhoodName','Neighborhood name'))}<input name="name" required maxlength="120" value="${esc(row.name||'')}"></label>
  <label class="installation-reference-geo-field">${esc(tr('appointmentSettings.field.region','Region'))}<div id="installationReferenceRegionCombobox" class="geo-searchable-select installation-reference-geo-select" data-reference-geo-type="region"><input id="installationReferenceRegionId" name="regionId" type="hidden"><input id="installationReferenceRegionSearch" class="geo-searchable-input" type="search" placeholder="${esc(tr('appointmentSettings.placeholder.region','Search and select region'))}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceRegionOptions"><button class="geo-searchable-toggle" type="button" aria-label="${esc(tr('appointmentSettings.aria.openRegions','Open region list'))}">⌄</button><div id="installationReferenceRegionOptions" class="geo-searchable-options hidden" role="listbox"></div></div></label>
  <label class="installation-reference-geo-field">${esc(tr('appointmentSettings.field.city','City'))}<div id="installationReferenceCityCombobox" class="geo-searchable-select installation-reference-geo-select is-disabled" data-reference-geo-type="city"><input id="installationReferenceCityId" name="cityId" type="hidden"><input id="installationReferenceCitySearch" class="geo-searchable-input" type="search" placeholder="${esc(tr('appointmentSettings.placeholder.cityFirst','Select a region first'))}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="installationReferenceCityOptions" disabled><button class="geo-searchable-toggle" type="button" aria-label="${esc(tr('appointmentSettings.aria.openCities','Open city list'))}" disabled>⌄</button><div id="installationReferenceCityOptions" class="geo-searchable-options hidden" role="listbox"></div></div><small class="field-hint">${esc(tr('appointmentSettings.geo.cityHint','City selection is limited to the active region.'))}</small></label>
  <label>${esc(tr('appointmentSettings.field.status','Status'))}<select name="isActive"><option value="1" ${row.is_active!==false?'selected':''}>${esc(on)}</option><option value="0" ${row.is_active===false?'selected':''}>${esc(off)}</option></select></label>`;
}
function listForType(type){return type==='service'?cache.services:type==='team'?cache.teams:type==='employee'?cache.employees:type==='car'?cache.cars:type==='breed'?cache.breeds:cache.neighborhoods}
function typeTitle(type){return type==='service'?tr('appointmentSettings.type.service','Service'):type==='team'?tr('appointmentSettings.type.team','Appointment team'):type==='employee'?tr('appointmentSettings.type.employee','Employee'):type==='car'?tr('appointmentSettings.type.car','Vehicle'):type==='breed'?tr('appointmentSettings.type.breed','Breed'):tr('appointmentSettings.type.neighborhood','Neighborhood')}
function open(type,id=''){const list=listForType(type),row=list.find(x=>x.id===id)||{};$('installationReferenceType').value=type;$('installationReferenceId').value=id;$('installationReferenceDialogTitle').textContent=tr(id?'appointmentSettings.dialog.edit':'appointmentSettings.dialog.add',id?'Edit {type}':'Add {type}',{type:typeTitle(type)});$('installationReferenceFields').innerHTML=fields(type,row);if(type==='neighborhood')bindReferenceGeography(row);$('installationReferenceFormStatus').classList.add('hidden');$('installationReferenceDialog').showModal()}

async function saveTeam(payload){
  const groomer=cache.employees.find(x=>x.id===payload.groomerEmployeeId),driver=cache.employees.find(x=>x.id===payload.driverEmployeeId),car=cache.cars.find(x=>x.id===payload.carId);
  if(!groomer||groomer.employee_type!=='جرومر')throw new Error(tr('appointmentSettings.validation.groomer','Choose a valid groomer from employee data.'));
  if(!driver||driver.employee_type!=='سائق')throw new Error(tr('appointmentSettings.validation.driver','Choose a valid driver from employee data.'));
  if(!car)throw new Error(tr('appointmentSettings.validation.car','Choose a valid vehicle from vehicle data.'));
  const effectiveFrom=String(payload.effectiveFrom||'').trim();if(!effectiveFrom)throw new Error(tr('appointmentSettings.team.effectiveRequired','Assignment effective date is required.'));if(effectiveFrom<TEAM_ASSIGNMENT_CUTOVER)throw new Error(tr('appointmentSettings.team.cutoverMinimum','Assignment effective date cannot be before 2026-09-01.'));
  const {error}=await db().rpc('save_installation_team_assignment_v1',{p_team_id:payload.id||null,p_groomer_employee_id:groomer.id,p_driver_employee_id:driver.id,p_appointment_car_id:car.id,p_effective_from:effectiveFrom,p_status:payload.status||'متاحة'});
  if(error){if(/save_installation_team_assignment_v1|installation_team_assignment_history|schema cache/i.test(error.message||''))throw new Error(tr('appointmentSettings.team.migrationRequired','Run the team assignment history update first.'));if(error.code==='23505')throw new Error(tr('appointmentSettings.team.assignmentConflict',error.message||'The selected resource is assigned to another team in this period.'));throw new Error(tr('appointmentSettings.team.saveHistoricalError','Unable to save historical team assignment: {error}',{error:error.message}))}
}
async function saveEmployee(payload){
  const record={full_name:String(payload.fullName||'').trim(),employee_type:payload.employeeType,phone:String(payload.phone||'').trim()||null,is_active:payload.isActive};
  if(!record.full_name)throw new Error(tr('appointmentSettings.validation.employeeName','Employee name is required.'));
  if(!['جرومر','سائق'].includes(record.employee_type))throw new Error(tr('appointmentSettings.validation.employeeType','Choose the employee role.'));
  const q=payload.id?db().from('appointment_employees').update(record).eq('id',payload.id):db().from('appointment_employees').insert(record);
  const {error}=await q;if(error){if(error.code==='23505')throw new Error(tr('appointmentSettings.error.employeeDuplicate','This employee is already registered with the same role.'));throw new Error(tr('appointmentSettings.error.employeeSave','Unable to save employee: {error}',{error:error.message}))}
}
async function saveCar(payload){
  const record={name:String(payload.name||'').trim(),plate_number:String(payload.plateNumber||'').trim()||null,is_active:payload.isActive};
  if(!record.name)throw new Error(tr('appointmentSettings.validation.carName','Vehicle name or code is required.'));
  const q=payload.id?db().from('appointment_cars').update(record).eq('id',payload.id):db().from('appointment_cars').insert(record);
  const {error}=await q;if(error){if(error.code==='23505')throw new Error(tr('appointmentSettings.error.carDuplicate','Vehicle name or plate number is already in use.'));throw new Error(tr('appointmentSettings.error.carSave','Unable to save vehicle: {error}',{error:error.message}))}
}

async function submit(e){
  e.preventDefault();const fd=new FormData(e.currentTarget),type=$('installationReferenceType').value,payload=Object.fromEntries(fd.entries());payload.id=$('installationReferenceId').value;payload.isActive=payload.isActive!=='0';
  if(type==='neighborhood'){const controller=ensureReferenceGeoController();const validation=controller.validate({requireRegion:true,requireCity:true,requireDistrict:false});if(!validation.valid){const input=controller.elements(validation.field)?.search;input?.setCustomValidity(validation.message);input?.reportValidity();input?.focus();return}payload.regionId=validation.value.regionId;payload.cityId=validation.value.cityId;payload.region=validation.value.region||'';payload.city=validation.value.city||''}
  if(type==='service'){payload.serviceCode=String(payload.serviceCode||'').trim();payload.price=netFromVatInclusive(payload.priceInclusive);if(!payload.serviceCode){const el=$('installationReferenceFormStatus');el.textContent=tr('appointmentSettings.validation.serviceCode','Service code is required.');el.classList.remove('hidden');el.dataset.type='error';return}}
  try{if(type==='team')await saveTeam(payload);else if(type==='employee')await saveEmployee(payload);else if(type==='car')await saveCar(payload);else await window.InstallationsServiceSafe.saveSettingItem(type,payload);closeAllReferenceGeo();$('installationReferenceDialog').close();await load();message(tr('appointmentSettings.status.saved','Data saved successfully.'),'success')}catch(err){const el=$('installationReferenceFormStatus');el.textContent=uiMessage(err.message,tr('appointmentSettings.error.save','Unable to save data.'));el.classList.remove('hidden');el.dataset.type='error'}
}

async function toggleMaster(type,id,active){
  const table=type==='employee'?'appointment_employees':'appointment_cars';
  const {error}=await db().from(table).update({is_active:active}).eq('id',id);
  if(error){if(/foreign key|installation_teams/i.test(error.message||''))throw new Error(tr('appointmentSettings.error.activeTeamDependency','This item cannot be deactivated while linked to an active appointment team.'));throw error}
}
async function removeMaster(type,id){
  const table=type==='employee'?'appointment_employees':'appointment_cars';
  const {error}=await db().from(table).delete().eq('id',id);
  if(error){if(error.code==='23503')throw new Error(tr('appointmentSettings.error.deleteTeamDependency','This item cannot be deleted because it is linked to an appointment team. Deactivate it instead.'));throw error}
}

function normalizeHeader(v){return String(v??'').trim().toLowerCase().replace(/[_\-\s]+/g,' ')}
function pick(row,aliases){const keys=Object.keys(row||{});for(const alias of aliases){const wanted=normalizeHeader(alias),key=keys.find(k=>normalizeHeader(k)===wanted);if(key!==undefined)return row[key]}return ''}
function parseActive(v){const s=String(v??'').trim().toLowerCase();return !['0','false','no','inactive','متوقفة','متوقف','غير نشطة','غير نشط'].includes(s)}

function prepareServiceImport(){
  const add=$('addInstallationServiceBtn');if(!add)return;
  const existing=$('installationServicesExcelBtn');if(existing){existing.textContent=tr('appointmentSettings.excel.upload','Upload Services Excel');return;}
  const btn=document.createElement('button');btn.id='installationServicesExcelBtn';btn.className='secondary-btn';btn.type='button';btn.textContent=tr('appointmentSettings.excel.upload','Upload Services Excel');
  const input=document.createElement('input');input.id='installationServicesExcelInput';input.type='file';input.accept='.xlsx,.xls';input.hidden=true;
  add.insertAdjacentElement('beforebegin',btn);add.insertAdjacentElement('beforebegin',input);
  btn.addEventListener('click',()=>input.click());input.addEventListener('change',()=>importServicesExcel(input.files?.[0]));
}

async function importServicesExcel(file){
  if(!file)return;
  if(!window.XLSX){message(tr('appointmentSettings.excel.notReady','Excel library is not ready. Reload the page and try again.'),'error');return}
  message(tr('appointmentSettings.excel.reading','Reading services file...'));
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});
    if(!rows.length)throw new Error(tr('appointmentSettings.excel.empty','The Excel file contains no data rows.'));
    const seen=new Set(),prepared=[],errors=[];
    rows.forEach((r,i)=>{
      const serviceCode=String(pick(r,['الكود','كود الخدمة','code','service code','service_code'])||'').trim();
      const name=String(pick(r,['اسم الخدمة','الخدمة','service','service name','name'])||'').trim();
      const inclusivePrice=Number(pick(r,['السعر شامل الضريبة','السعر شامل الضريبه','سعر شامل الضريبة','price incl vat','price including vat','inclusive price','السعر','سعر الخدمة'])||0);
      const cost=Number(pick(r,['التكلفة','تكلفة الخدمة','cost','default cost'])||0);
      const active=parseActive(pick(r,['الحالة','status','active','is active']));
      const key=serviceCode.toLocaleLowerCase('en');
      if(!serviceCode){errors.push(tr('appointmentSettings.excel.rowServiceCode','Row {row}: service code is required.',{row:i+2}));return}
      if(!name){errors.push(tr('appointmentSettings.excel.rowServiceName','Row {row}: service name is required.',{row:i+2}));return}
      if(!Number.isFinite(inclusivePrice)||inclusivePrice<0||!Number.isFinite(cost)||cost<0){errors.push(tr('appointmentSettings.excel.rowNumbers','Row {row}: VAT-inclusive price and cost must be non-negative numbers.',{row:i+2}));return}
      if(seen.has(key)){errors.push(tr('appointmentSettings.excel.rowDuplicate','Row {row}: service code is duplicated in the file ({code}).',{row:i+2,code:serviceCode}));return}
      seen.add(key);prepared.push({serviceCode,name,price:netFromVatInclusive(inclusivePrice),cost,isActive:active});
    });
    if(errors.length)throw new Error(tr('appointmentSettings.excel.invalidFile','Unable to validate the file. {errors}{more}',{errors:errors.slice(0,5).join(' — '),more:errors.length>5?tr('appointmentSettings.excel.moreErrors',' — and {count} more errors',{count:errors.length-5}):''}));
    let done=0;
    for(const row of prepared){
      const existing=cache.services.find(x=>String(x.service_code||'').trim().toLocaleLowerCase('en')===row.serviceCode.toLocaleLowerCase('en'));
      await window.InstallationsServiceSafe.saveSettingItem('service',{...row,id:existing?.id||''});
      done++;message(tr('appointmentSettings.excel.uploading','Uploading services: {done} / {total}',{done,total:prepared.length}));
    }
    await load();message(tr('appointmentSettings.excel.success','Successfully uploaded {count} services from Excel. Existing service codes were updated instead of duplicated.',{count:prepared.length}),'success');
    const input=$('installationServicesExcelInput');if(input)input.value='';
  }catch(e){message(uiMessage(e.message,tr('appointmentSettings.excel.importError','Unable to import services from Excel.')),'error')}
}

function tuneHeadings(){
  const panel=$('installationSettingsTeamsPanel'),p=panel?.querySelector('.installation-settings-section-header p');if(p)p.textContent=tr('appointmentSettings.teams.linkHint','Link a groomer, driver, and vehicle from the registered employee and vehicle data.');
  const services=$('installationSettingsServicesPanel'),sp=services?.querySelector('.installation-settings-section-header p');if(sp)sp.textContent=tr('appointmentSettings.services.excelHint','Manage services manually or upload them in bulk from Excel.');
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
    const del=e.target.closest('[data-setting-delete]');if(del&&confirm(tr('appointmentSettings.confirm.delete','Delete this record?'))){try{const type=del.dataset.settingDelete;if(type==='employee'||type==='car')await removeMaster(type,del.dataset.id);else await window.InstallationsServiceSafe.removeSettingItem(type,del.dataset.id);await load()}catch(err){message(err.message,'error')}}
  });
  window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view==='installationSettings'){showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();load()}});
  window.addEventListener('petatoe-language-changed',()=>{if(window.KYUMNavigation?.current?.()==='installationSettings'){prepareServiceImport();tuneHeadings();render();}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="installationSettings"]'))setTimeout(()=>{showSection(currentSection(),{persist:false});prepareServiceImport();tuneHeadings();load()},0)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
