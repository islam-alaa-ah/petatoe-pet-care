(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const tr=key=>{const value=window.PetatoeLocalization?.t?.(key);return value&&value!==`[${key}]`?value:key;};
  const SCREEN_LABEL_KEYS=Object.freeze({
    dashboard:'sidebar.dashboard',customers:'sidebar.customers',followups:'sidebar.followups',quotations:'sidebar.quotations',salesInvoices:'sidebar.salesInvoices',users:'sidebar.users',
    installationsOverview:'sidebar.appointmentsOverview',installationRequestNew:'sidebar.appointmentNew',installationRequests:'sidebar.appointments',installationSchedule:'sidebar.appointmentSchedule',installationExecution:'sidebar.appointmentExecution',installationCompletion:'sidebar.appointmentCompletion',
    vehicleTreasury:'sidebar.vehicleTreasury',payrollManagement:'sidebar.payrollManagement',salaryStatement:'sidebar.salaryStatement',commissionManagement:'sidebar.commissionManagement',commissionStatement:'sidebar.commissionStatement',payrollReference:'sidebar.payrollReference',
    seaVibeTrips:'sidebar.seaVibeTrips',seaVibeCustomers:'sidebar.seaVibeCustomers',seaVibeExpenseNew:'sidebar.seaVibeExpenseNew',seaVibeGeneralExpenses:'sidebar.seaVibeGeneralExpenses',seaVibeAssets:'sidebar.seaVibeAssets',seaVibeReference:'sidebar.seaVibeReference',seaVibeTreasury:'sidebar.seaVibeTreasury',seaVibeZawel:'sidebar.seaVibeZawel',seaVibeFuel:'sidebar.seaVibeFuel',seaVibeReports:'sidebar.seaVibeReports',
    seaVibePayrollManagement:'sidebar.seaVibePayrollManagement',seaVibeSalaryStatement:'sidebar.seaVibeSalaryStatement',seaVibeCommissionManagement:'sidebar.seaVibeCommissionManagement',seaVibeCommissionStatement:'sidebar.seaVibeCommissionStatement',seaVibePayrollReference:'sidebar.seaVibePayrollReference',translationCenter:'sidebar.translationCenter'
  });
  let rows=[];
  function setStatus(text,type=''){const el=$('translationCenterStatus');if(!el)return;el.textContent=text||'';el.className=`data-status${text?'':' hidden'}${type?` ${type}`:''}`;}
  function moduleLabel(moduleName){return tr(`translationCenter.module.${moduleName}`,moduleName||'core');}
  function screenLabel(screenKey){const key=SCREEN_LABEL_KEYS[screenKey];return key?tr(key,screenKey):screenKey;}
  function syncFilterOptions(){
    const moduleSelect=$('translationCenterModuleFilter'),screenSelect=$('translationCenterScreenFilter');
    if(!moduleSelect||!screenSelect)return;
    const currentModule=moduleSelect.value,currentScreen=screenSelect.value;
    const modules=[...new Set(rows.map(r=>r.moduleName||'core'))].sort((a,b)=>moduleLabel(a).localeCompare(moduleLabel(b)));
    moduleSelect.innerHTML=`<option value="">${esc(tr('translationCenter.filter.allModules'))}</option>`+modules.map(value=>`<option value="${esc(value)}">${esc(moduleLabel(value))}</option>`).join('');
    if(modules.includes(currentModule))moduleSelect.value=currentModule;
    const scoped=moduleSelect.value?rows.filter(r=>(r.moduleName||'core')===moduleSelect.value):rows;
    const screens=[...new Set(scoped.map(r=>r.screenKey||'shared'))].sort((a,b)=>screenLabel(a).localeCompare(screenLabel(b)));
    screenSelect.innerHTML=`<option value="">${esc(tr('translationCenter.filter.allScreens'))}</option>`+screens.map(value=>`<option value="${esc(value)}">${esc(screenLabel(value))} · ${esc(value)}</option>`).join('');
    if(screens.includes(currentScreen))screenSelect.value=currentScreen;
  }
  function filtered(){const q=String($('translationCenterSearch')?.value||'').trim().toLowerCase(),type=$('translationCenterTypeFilter')?.value||'',moduleName=$('translationCenterModuleFilter')?.value||'',screenKey=$('translationCenterScreenFilter')?.value||'';return rows.filter(r=>(!type||r.type===type)&&(!moduleName||(r.moduleName||'core')===moduleName)&&(!screenKey||(r.screenKey||'shared')===screenKey)&&(!q||[r.key,r.ar,r.en,r.type,r.moduleName,r.screenKey].some(v=>String(v||'').toLowerCase().includes(q))));}
  function renderStats(){const total=rows.length,complete=rows.filter(r=>r.complete).length,custom=rows.filter(r=>r.customized).length,missing=total-complete;const values={translationCenterTotal:total,translationCenterComplete:complete,translationCenterCustom:custom,translationCenterMissing:missing};Object.entries(values).forEach(([id,value])=>{const el=$(id);if(el)el.textContent=String(value);});}
  function render(){const body=$('translationCenterRows');if(!body)return;syncFilterOptions();const list=filtered();body.innerHTML=list.length?list.map(r=>`<tr data-translation-key="${esc(r.key)}"><td><strong>${esc(r.key)}</strong><small>${esc(moduleLabel(r.moduleName))} · ${esc(screenLabel(r.screenKey))} · ${esc(r.type)}</small></td><td><textarea data-translation-ar rows="2" spellcheck="false">${esc(r.ar)}</textarea></td><td><textarea data-translation-en rows="2" spellcheck="false" dir="ltr">${esc(r.en)}</textarea></td><td><span class="translation-status ${r.complete?'is-complete':'is-missing'}">${esc(r.complete?tr('translationCenter.status.complete'):tr('translationCenter.status.missing'))}</span>${r.customized?`<small class="translation-custom-badge">${esc(tr('translationCenter.status.custom'))}</small>`:''}</td></tr>`).join(''):`<tr><td colspan="4" class="empty-cell">${esc(tr('translationCenter.empty'))}</td></tr>`;renderStats();}
  async function load(force=false){
    if(!window.PetatoeLocalization)return;
    rows=window.PetatoeLocalization.getRows?.()||[];
    render();syncLanguage();
    setStatus(tr('translationCenter.load.local'));
    const failures=[];
    const remoteTask=Promise.resolve(window.PetatoeLocalization.loadRemote?.(force===true)).then(updated=>{rows=Array.isArray(updated)?updated:(window.PetatoeLocalization.getRows?.()||rows);render();syncLanguage();}).catch(error=>{failures.push(error?.message||'remote');});
    const entityTask=window.LocalizationCenterService?.listEntityCatalog?window.LocalizationCenterService.listEntityCatalog().then(catalog=>{window.PetatoeLocalization.registerEntityCatalog?.(catalog||{});rows=window.PetatoeLocalization.getRows?.()||rows;render();syncLanguage();}).catch(error=>{failures.push(error?.message||'entities');}):Promise.resolve();
    await Promise.allSettled([remoteTask,entityTask]);
    rows=window.PetatoeLocalization.getRows?.()||rows;render();syncLanguage();
    if(failures.length)setStatus(tr('translationCenter.load.partial'),'error');else setStatus('');
  }
  async function save(){setStatus(tr('translationCenter.save.saving'));try{rows=await window.PetatoeLocalization.saveRows(rows);render();setStatus(tr('translationCenter.save.success'),'success');setTimeout(()=>setStatus(''),2200);}catch(e){setStatus(e.message||tr('translationCenter.save.failed'),'error');}}
  function syncLanguage(){const language=window.PetatoeLocalization?.getLanguage?.()||'ar';document.querySelectorAll('[data-translation-language]').forEach(btn=>{const active=btn.dataset.translationLanguage===language;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});}
  function setLanguage(language){window.PetatoeLocalization?.setLanguage?.(language);syncLanguage();syncHeaderToggle();render();setStatus(tr(language==='en'?'translationCenter.language.changedEn':'translationCenter.language.changedAr'),'success');setTimeout(()=>setStatus(''),1800);}
  function syncHeaderToggle(){const btn=$('translationCenterHeaderBtn'),language=window.PetatoeLocalization?.getLanguage?.()||'ar';if(!btn)return;const label=tr(language==='en'?'translationCenter.toggle.toArabic':'translationCenter.toggle.toEnglish');btn.dataset.language=language;btn.setAttribute('aria-label',label);btn.setAttribute('title',label);}
  function toggleLanguage(){const language=window.PetatoeLocalization?.getLanguage?.()==='en'?'ar':'en';setLanguage(language);}
  function open(){if(!window.PermissionEngine?.canView?.('translationCenter')&&!window.CustomerPermissions?.canScreen?.('translationCenter','view'))return;window.KYUMNavigation?.open?.('translationCenter',{trustedNavigation:true});}
  document.addEventListener('DOMContentLoaded',()=>{
    $('translationCenterHeaderBtn')?.addEventListener('click',toggleLanguage);
    $('translationCenterSearch')?.addEventListener('input',render);
    $('translationCenterModuleFilter')?.addEventListener('change',()=>{if($('translationCenterScreenFilter'))$('translationCenterScreenFilter').value='';render();});
    $('translationCenterScreenFilter')?.addEventListener('change',render);
    $('translationCenterTypeFilter')?.addEventListener('change',render);
    $('translationCenterRows')?.addEventListener('input',event=>{const trEl=event.target.closest?.('tr[data-translation-key]');if(!trEl)return;const row=rows.find(item=>item.key===trEl.dataset.translationKey);if(!row)return;if(event.target.matches('[data-translation-ar]'))row.ar=event.target.value;if(event.target.matches('[data-translation-en]'))row.en=event.target.value;row.complete=Boolean(String(row.ar||'').trim()&&String(row.en||'').trim()&&!/[\u0600-\u06FF]/.test(String(row.en||'')));row.customized=row.ar!==row.defaultAr||row.en!==row.defaultEn;renderStats();});
    $('saveTranslationCenterBtn')?.addEventListener('click',save);
    $('reloadTranslationCenterBtn')?.addEventListener('click',()=>load(true));
    document.querySelectorAll('[data-translation-language]').forEach(btn=>btn.addEventListener('click',()=>setLanguage(btn.dataset.translationLanguage)));
    window.addEventListener('kyum-view-changed',event=>{if(event.detail?.view==='translationCenter')load(false);});
    window.addEventListener('petatoe-language-changed',()=>{syncLanguage();syncHeaderToggle();render();});
    syncLanguage();syncHeaderToggle();
  });
  window.TranslationCenterUI=Object.freeze({load,open,toggleLanguage});
})();
