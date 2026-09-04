(function(){
  'use strict';

  const FOUNDATION_VIEWS=['seaVibePayrollManagement','seaVibeSalaryStatement','seaVibeCommissionManagement','seaVibeCommissionStatement'];
  const $=id=>document.getElementById(id);
  const t=(key,fallback)=>{const value=window.PetatoeLocalization?.t?.(key);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const money=value=>`${new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))} ر.س`;
  let reference={employees:[],users:[]};

  function setStatus(message='',type=''){
    const el=$('seaVibePayrollReferenceStatus');
    if(!el)return;
    el.textContent=message;
    el.className=`data-status${message?'':' hidden'}${type?` ${type}`:''}`;
  }

  function renderFoundation(view){
    const map={
      seaVibePayrollManagement:['seaVibePayrollManagementContent','إدارة الرواتب SEA VIBE','تم تجهيز البنية المستقلة لموظفي SEA VIBE. دورة تجهيز واعتماد وصرف الرواتب سيتم تفعيلها في المرحلة التالية بعد اعتماد بيانات الموظفين.'],
      seaVibeSalaryStatement:['seaVibeSalaryStatementContent','كشف الراتب SEA VIBE','تم تجهيز شاشة كشف الراتب ضمن النطاق المستقل. عرض واعتماد كشوف الرواتب سيُفعّل مع دورة الرواتب في المرحلة التالية.'],
      seaVibeCommissionManagement:['seaVibeCommissionManagementContent','إدارة العمولات SEA VIBE','تعريفات عمولات الرحلات الحالية مستمرة بأمان في البيانات المرجعية SEA VIBE، وتم فصل المستفيد الموظف إلى موظفي SEA VIBE المستقلين. إدارة مستحقات العمولات الشهرية ستُفعّل في المرحلة التالية.'],
      seaVibeCommissionStatement:['seaVibeCommissionStatementContent','كشف العمولة SEA VIBE','تم تجهيز شاشة كشف العمولة ضمن النطاق المستقل. كشف مستحقات الموظف سيُفعّل بعد اعتماد دورة العمولات الشهرية.']
    };
    const item=map[view];if(!item)return;
    const el=$(item[0]);if(!el)return;
    el.innerHTML=`<div class="panel payroll-empty sea-vibe-payroll-foundation-card"><strong>${esc(item[1])}</strong><p>${esc(item[2])}</p></div>`;
  }

  function renderReference(){
    const rows=reference.employees||[];
    const body=$('seaVibePayrollReferenceContent');if(!body)return;
    const labels={name:t('seaVibePayroll.employee.name','اسم الموظف'),user:t('seaVibePayroll.employee.user','المستخدم المرتبط'),base:t('seaVibePayroll.employee.baseSalary','الراتب الأساسي'),allowances:t('seaVibePayroll.employee.allowances','البدلات'),payment:t('seaVibePayroll.employee.paymentMethod','طريقة الدفع'),status:t('seaVibePayroll.common.status','الحالة'),actions:t('seaVibePayroll.common.actions','الإجراءات')};
    body.innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-table"><thead><tr><th>${esc(labels.name)}</th><th>${esc(labels.user)}</th><th>${esc(labels.base)}</th><th>${esc(labels.allowances)}</th><th>${esc(labels.payment)}</th><th>${esc(labels.status)}</th><th>${esc(labels.actions)}</th></tr></thead><tbody>${rows.length?rows.map(row=>{const user=(reference.users||[]).find(u=>String(u.id)===String(row.userId));return `<tr><td data-label="${esc(labels.name)}"><strong>${esc(row.fullName||'—')}</strong></td><td data-label="${esc(labels.user)}">${esc(user?`${user.fullName||'—'}${user.email?` — ${user.email}`:''}`:'—')}</td><td data-label="${esc(labels.base)}" class="money">${esc(money(row.baseSalary))}</td><td data-label="${esc(labels.allowances)}" class="money">${esc(money(row.allowances))}</td><td data-label="${esc(labels.payment)}">${esc(row.paymentMethod||'—')}</td><td data-label="${esc(labels.status)}">${row.isActive!==false?esc(t('seaVibePayroll.status.active','نشط')):esc(t('seaVibePayroll.status.inactive','موقوف'))}</td><td data-label="${esc(labels.actions)}"><div class="payroll-row-actions"><button class="secondary-btn" type="button" data-sea-vibe-employee-edit="${esc(row.id)}" data-permission-screen="seaVibePayrollReference" data-permission-action="edit">${esc(t('common.edit','تعديل'))}</button></div></td></tr>`;}).join(''):`<tr><td colspan="7" class="payroll-empty">${esc(t('seaVibePayroll.reference.noEmployees','لا يوجد موظفو SEA VIBE حتى الآن.'))}</td></tr>`}</tbody></table></div>`;
    window.PermissionEngine?.applyActionVisibility?.(body);
  }

  function openEmployee(row=null){
    $('seaVibeEmployeeId').value=row?.id||'';
    $('seaVibeEmployeeName').value=row?.fullName||'';
    $('seaVibeEmployeeBase').value=Number(row?.baseSalary||0);
    $('seaVibeEmployeeAllowances').value=Number(row?.allowances||0);
    $('seaVibeEmployeePaymentMethod').value=row?.paymentMethod||'تحويل بنكي';
    $('seaVibeEmployeeActive').checked=row?.isActive!==false;
    $('seaVibeEmployeeNotes').value=row?.notes||'';
    $('seaVibeEmployeeUser').innerHTML=`<option value="">—</option>`+(reference.users||[]).map(u=>`<option value="${esc(u.id)}">${esc(u.fullName||'—')}${u.email?` — ${esc(u.email)}`:''}</option>`).join('');
    $('seaVibeEmployeeUser').value=row?.userId||'';
    $('seaVibeEmployeeDialogTitle').textContent=row?t('seaVibePayroll.employee.edit','تعديل موظف SEA VIBE'):t('seaVibePayroll.employee.add','إضافة موظف SEA VIBE');
    $('seaVibeEmployeeDialog')?.showModal();
    window.PetatoeLocalization?.applyStatic?.($('seaVibeEmployeeDialog'));
  }

  async function loadReference(force=false){
    setStatus(t('seaVibePayroll.common.loading','جاري تحميل بيانات موظفي SEA VIBE...'));
    try{
      reference=await window.SeaVibePayrollService.loadReference({force});
      renderReference();
      const status=window.SeaVibePayrollService.getReadStatus();
      setStatus(status.source==='cache'?t('seaVibePayroll.common.cached','تم عرض آخر بيانات محفوظة وسيتم تحديثها عند توفر الاتصال.'):'','info');
    }catch(error){setStatus(error.message||String(error),'error');}
  }

  async function activate(view){
    if(FOUNDATION_VIEWS.includes(view)){renderFoundation(view);window.PetatoeLocalization?.applyStatic?.(document);return;}
    if(view==='seaVibePayrollReference'){await loadReference(false);window.PetatoeLocalization?.applyStatic?.(document);}
  }

  function syncSubgroupVisibility(){
    const group=document.querySelector('[data-sea-vibe-payroll-subgroup]');if(!group)return;
    const buttons=[...group.querySelectorAll('.nav-item[data-view]')];
    const visible=buttons.some(btn=>!btn.classList.contains('hidden')&&!btn.hidden);
    group.classList.toggle('hidden',!visible);
  }

  function bind(){
    const subgroup=document.querySelector('[data-sea-vibe-payroll-subgroup]');
    const toggle=subgroup?.querySelector('[data-sea-vibe-payroll-toggle]');
    toggle?.addEventListener('click',event=>{event.stopPropagation();const open=subgroup.classList.contains('is-collapsed');subgroup.classList.toggle('is-collapsed',!open);toggle.setAttribute('aria-expanded',String(open));});
    window.addEventListener('kyum-navigation-permissions-applied',syncSubgroupVisibility);
    window.addEventListener('kyum-view-changed',event=>{const view=String(event.detail?.view||'');if([...FOUNDATION_VIEWS,'seaVibePayrollReference'].includes(view)){subgroup?.classList.remove('is-collapsed');toggle?.setAttribute('aria-expanded','true');}});
    syncSubgroupVisibility();

    $('seaVibePayrollReferenceRefresh')?.addEventListener('click',()=>loadReference(true));
    $('seaVibeEmployeeAdd')?.addEventListener('click',()=>openEmployee());
    $('seaVibePayrollReferenceContent')?.addEventListener('click',event=>{const btn=event.target.closest('[data-sea-vibe-employee-edit]');if(!btn)return;openEmployee((reference.employees||[]).find(row=>String(row.id)===String(btn.dataset.seaVibeEmployeeEdit)));});
    $('seaVibeEmployeeClose')?.addEventListener('click',()=> $('seaVibeEmployeeDialog')?.close());
    $('seaVibeEmployeeCancel')?.addEventListener('click',()=> $('seaVibeEmployeeDialog')?.close());
    $('seaVibeEmployeeForm')?.addEventListener('submit',async event=>{
      event.preventDefault();
      const record={id:$('seaVibeEmployeeId').value||null,fullName:$('seaVibeEmployeeName').value.trim(),userId:$('seaVibeEmployeeUser').value||null,baseSalary:Number($('seaVibeEmployeeBase').value||0),allowances:Number($('seaVibeEmployeeAllowances').value||0),paymentMethod:$('seaVibeEmployeePaymentMethod').value.trim(),isActive:$('seaVibeEmployeeActive').checked,notes:$('seaVibeEmployeeNotes').value.trim()};
      try{
        setStatus(t('seaVibePayroll.common.saving','جاري الحفظ...'));
        reference=await window.SeaVibePayrollService.saveEmployee(record);
        $('seaVibeEmployeeDialog')?.close();
        renderReference();
        setStatus(t('seaVibePayroll.employee.saved','تم حفظ موظف SEA VIBE بنجاح.'),'success');
      }catch(error){setStatus(error.message||String(error),'error');}
    });
    window.addEventListener('sea-vibe-payroll-data-updated',event=>{if(event.detail?.kind==='reference'&&!$('seaVibePayrollReferenceView')?.classList.contains('hidden')){const cached=window.SeaVibePayrollService.getCache();if(cached){reference=cached;renderReference();}}});
    window.addEventListener('petatoe-language-changed',()=>{if(!$('seaVibePayrollReferenceView')?.classList.contains('hidden'))renderReference();});
  }

  document.addEventListener('DOMContentLoaded',bind);
  window.SeaVibePayrollUI=Object.freeze({activate,refreshReference:()=>loadReference(true)});
})();
