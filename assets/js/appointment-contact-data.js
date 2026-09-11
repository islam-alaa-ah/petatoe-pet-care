(function(){
  'use strict';
  const VIEW='installationContactData';
  const $=id=>document.getElementById(id);
  const fields=Object.freeze({
    socialMedia:'appointmentContactSocialMedia',
    websiteAppointments:'appointmentContactWebsiteAppointments',
    newCustomers:'appointmentContactNewCustomers',
    whatsapp:'appointmentContactWhatsapp',
    calls:'appointmentContactCalls',
    inventorySales:'appointmentContactInventorySales',
    appointmentsCreated:'appointmentContactAppointmentsCreated'
  });
  const state={loaded:false,existing:false,snapshot:null,workDate:'',busy:false};
  const t=(key,fallback)=>window.PetatoeLocalization?.t?.(key)||fallback;
  function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function latinDigits(value){return String(value??'').replace(/[\u0660-\u0669\u06f0-\u06f9]/g,d=>{const code=d.charCodeAt(0);return String(code>=0x06f0?code-0x06f0:code-0x0660);});}
  function formatDate(iso){const [y,m,d]=String(iso||'').split('-').map(Number);if(!y||!m||!d)return iso||'—';return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${String(y).padStart(4,'0')}`;}
  function setWorkDateUi(iso){const value=String(iso||todayIso());const display=$('appointmentContactWorkDate');const input=$('appointmentContactWorkDateInput');if(display)display.textContent=formatDate(value);if(input&&input.value!==value)input.value=value;}
  function snapshotValues(){const out={};Object.entries(fields).forEach(([key,id])=>{const raw=latinDigits($(id)?.value||'0').trim();out[key]=/^\d+$/.test(raw)?Number(raw):0;});return out;}
  function hasUnsavedChanges(){const current=snapshotValues();const baseline=state.snapshot||{};return Object.keys(fields).some(key=>Number(current[key]||0)!==Number(baseline[key]||0));}
  function currentUserName(){const s=window.CustomerAuth?.getState?.()||{};return String(s.profile?.full_name||s.profile?.email||s.user?.email||'—');}
  function showStatus(message,type=''){const el=$('appointmentContactStatus');if(!el)return;el.textContent=message||'';el.classList.toggle('hidden',!message);el.dataset.type=type||'';}
  function readCount(id){const raw=latinDigits($(id)?.value).trim();if(!/^\d+$/.test(raw))throw new Error(t('appointments.contact.validation.nonNegative','Enter non-negative whole numbers in all fields.'));const value=Number(raw);if(!Number.isSafeInteger(value)||value<0||value>999999999)throw new Error(t('appointments.contact.validation.nonNegative','Enter non-negative whole numbers in all fields.'));return value;}
  function values(){const out={};Object.entries(fields).forEach(([key,id])=>out[key]=readCount(id));return out;}
  function setValues(row){Object.entries(fields).forEach(([key,id])=>{const el=$(id);if(el)el.value=latinDigits(String(Number(row?.[key]||0)));});renderSummary();}
  function renderSummary(){let total=0;for(const id of [fields.socialMedia,fields.whatsapp,fields.calls]){const v=Number(latinDigits($(id)?.value||0));if(Number.isFinite(v)&&v>0)total+=Math.trunc(v);}const el=$('appointmentContactTotalInteractions');if(el)el.textContent=String(total);}
  function configureAction(){const btn=$('appointmentContactSaveBtn');if(!btn)return;const action=state.existing?'edit':'add';const allowed=window.AppointmentContactDataService?.can?.(action)===true;btn.dataset.permissionScreen=VIEW;btn.dataset.permissionAction=action;btn.disabled=state.busy||!allowed||navigator.onLine===false;btn.setAttribute('aria-disabled',String(btn.disabled));if(!allowed)btn.title=t('appointments.contact.error.permission','You do not have permission for this action.');else btn.removeAttribute('title');}
  async function load(workDate=todayIso()){
    state.workDate=String(workDate||todayIso());state.loaded=false;state.busy=true;showStatus(t('appointments.contact.loading','Loading daily communication data...'),'info');
    if($('appointmentContactUserName'))$('appointmentContactUserName').textContent=currentUserName();
    setWorkDateUi(state.workDate);
    configureAction();
    try{
      const row=await window.AppointmentContactDataService.getForDate(state.workDate);
      state.existing=Boolean(row);state.snapshot=row||null;setValues(row||{});state.loaded=true;
      if(row)showStatus(t('appointments.contact.loadedSelected','Saved data for the selected date has been loaded.'),'info');else showStatus(t('appointments.contact.readySelected','Ready to record data for the selected date.'),'info');
    }catch(error){
      state.existing=false;state.snapshot=null;setValues({});
      showStatus(error?.message||t('appointments.contact.error.load','Unable to load communication data.'),'error');
    }finally{state.busy=false;configureAction();}
  }
  async function save(event){
    event?.preventDefault?.();if(state.busy)return;
    try{
      const payload=values();
      state.busy=true;configureAction();showStatus(t('appointments.contact.savingSelected','Saving data for the selected date...'),'info');
      const row=await window.AppointmentContactDataService.saveForDate(state.workDate||todayIso(),payload,state.existing);
      state.existing=true;state.snapshot=row;setValues(row);showStatus(t('appointments.contact.savedSelected','Data for the selected date was saved successfully.'),'success');
    }catch(error){showStatus(error?.message||t('appointments.contact.error.save',"Unable to save today's data."),'error');}
    finally{state.busy=false;configureAction();}
  }
  function cancel(){setValues(state.snapshot||{});showStatus(state.snapshot?t('appointments.contact.cancelledExisting','Unsaved changes were reverted.'):t('appointments.contact.cancelledNew','Unsaved values were cleared.'),'info');}
  function onLanguage(){setWorkDateUi(state.workDate||todayIso());if($('appointmentContactUserName'))$('appointmentContactUserName').textContent=currentUserName();renderSummary();}
  async function changeWorkDate(event){
    const input=event.currentTarget;const next=String(input?.value||'').trim();if(!next||next===state.workDate){setWorkDateUi(state.workDate||todayIso());return;}
    if(state.busy){setWorkDateUi(state.workDate||todayIso());return;}
    if(hasUnsavedChanges()&&!window.confirm(t('appointments.contact.dateChange.confirm','There are unsaved changes. Change the date and discard them?'))){setWorkDateUi(state.workDate||todayIso());return;}
    await load(next);
  }
  function openWorkDatePicker(event){
    const input=$('appointmentContactWorkDateInput');if(!input||state.busy)return;
    if(event?.type==='keydown'){
      const key=event.key;if(key!=='Enter'&&key!==' ')return;
    }
    event?.preventDefault?.();
    if(window.PetatoeLocalization?.effectiveLanguage?.()==='en'&&window.PetatoeLocalization?.openTemporalPicker?.(input))return;
    try{if(typeof input.showPicker==='function'){input.showPicker();return;}}catch(_error){}
    input.focus({preventScroll:true});
    try{input.click();}catch(_error){}
  }
  function bind(){
    $('appointmentContactDataForm')?.addEventListener('submit',save);
    $('appointmentContactCancelBtn')?.addEventListener('click',cancel);
    $('appointmentContactWorkDateInput')?.addEventListener('change',changeWorkDate);
    const datePicker=$('appointmentContactWorkDateInput')?.closest('.appointment-contact-date-picker');
    if(datePicker){datePicker.tabIndex=0;datePicker.setAttribute('role','button');datePicker.addEventListener('click',openWorkDatePicker);datePicker.addEventListener('keydown',openWorkDatePicker);}
    Object.values(fields).forEach(id=>{const el=$(id);if(!el)return;el.addEventListener('input',event=>{const input=event.currentTarget;const normalized=latinDigits(input.value).replace(/[^0-9]/g,'');if(input.value!==normalized)input.value=normalized;renderSummary();});el.addEventListener('blur',()=>{if(el.value==='')el.value='0';renderSummary();});el.addEventListener('focus',()=>el.select?.());});
    window.addEventListener('kyum-view-changed',e=>{if(e.detail?.view===VIEW)load(todayIso());});
    window.addEventListener('petatoe-language-changed',onLanguage);
    window.addEventListener('online',()=>{if(window.KYUMNavigation?.current?.()===VIEW)load(state.workDate||todayIso());else configureAction();});
    window.addEventListener('offline',()=>{configureAction();if(window.KYUMNavigation?.current?.()===VIEW)showStatus(t('appointments.contact.error.onlineRequired','This screen requires an internet connection to load and save data.'),'warning');});
    if(window.KYUMNavigation?.current?.()===VIEW)load(todayIso());
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
