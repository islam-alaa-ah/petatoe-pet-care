(function(){
  'use strict';

  const $=id=>document.getElementById(id);
  const svc=()=>window.SeaVibePayrollService;
  const t=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const lang=()=>window.PetatoeLocalization?.effectiveLanguage?.()==='en'?'en':'ar';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=value=>new Intl.NumberFormat(lang()==='en'?'en-SA':'ar-SA-u-nu-latn',{style:'currency',currency:'SAR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
  const number=value=>new Intl.NumberFormat(lang()==='en'?'en-US':'ar-SA-u-nu-latn',{maximumFractionDigits:2}).format(Number(value||0));
  const monthLabel=value=>{if(!value)return '—';const d=new Date(`${String(value).slice(0,7)}-01T12:00:00`);return new Intl.DateTimeFormat(lang()==='en'?'en-US':'ar-SA-u-ca-gregory-nu-latn',{month:'long',year:'numeric'}).format(d);};
  const dateLabel=value=>value?new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`)):'—';
  const dateTime=value=>value?new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
  const currentMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
  const monthBounds=value=>{const raw=/^\d{4}-\d{2}$/.test(String(value||''))?String(value):currentMonth();const [year,month]=raw.split('-').map(Number);return{from:`${raw}-01`,to:`${raw}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}`};};
  const addDays=(value,days)=>{const d=new Date(`${String(value).slice(0,10)}T12:00:00`);d.setDate(d.getDate()+Number(days||0));return d.toISOString().slice(0,10);};

  const state={reference:{employees:[],users:[]},management:null,managementTab:'current',salary:null,salaryTab:'current',commissions:null,commissionStatement:null,commissionTab:'current'};

  function setStatus(id,message='',type='info'){
    const el=$(id);if(!el)return;
    el.textContent=message||'';
    el.classList.toggle('hidden',!message);
    el.classList.toggle('error',type==='error');
    el.classList.toggle('success',type==='success');
  }

  function cacheMessage(kind){
    const status=svc()?.getReadStatus?.(kind);if(status?.source!=='cache')return '';
    const updatedAt=Number(status?.updatedAt||0);
    if(!updatedAt)return t('shared.cache.local','يتم عرض آخر بيانات محفوظة محليًا.');
    const minutes=Math.max(0,Math.floor((Date.now()-updatedAt)/60000));
    if(minutes<1)return t('shared.cache.lessMinute','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.');
    if(minutes<60)return t('shared.cache.minutes',`يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ ${minutes} دقيقة.`,{count:minutes});
    const hours=Math.floor(minutes/60);if(hours<24)return t('shared.cache.hours',`يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ ${hours} ساعة.`,{count:hours});
    const days=Math.floor(hours/24);return t('shared.cache.days',`يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ ${days} يوم.`,{count:days});
  }

  function statusLabel(status){return ({
    draft:t('payroll.status.draft','قيد التجهيز'),
    pending_chairman:t('payroll.status.pendingChairman','بانتظار رئيس مجلس الإدارة'),
    pending_employee:t('payroll.status.pendingEmployee','بانتظار الموظف'),
    ready_for_payment:t('payroll.status.ready','جاهز للصرف'),
    paid:t('payroll.status.paid','تم الصرف')
  })[status]||status||'—';}
  const statusBadge=status=>`<span class="payroll-status ${esc(status)}">${esc(statusLabel(status))}</span>`;

  function paymentMethodLabel(value){
    const raw=String(value||'').trim();if(!raw)return '—';
    const normalized=raw.toLowerCase();
    if(raw==='تحويل بنكي'||normalized==='bank transfer')return t('payroll.paymentMethod.bankTransfer','تحويل بنكي');
    if(raw==='نقدي'||normalized==='cash')return t('payroll.paymentMethod.cash','نقدي');
    if(raw==='مدد'||normalized==='mudad')return t('payroll.paymentMethod.mudad','مدد');
    if(raw==='شيك'||['cheque','check'].includes(normalized))return t('payroll.paymentMethod.cheque','شيك');
    return raw;
  }

  // -----------------------------------------------------------------------
  // Payroll management
  // -----------------------------------------------------------------------
  function renderMonthDisplay(){
    const el=$('seaVibePayrollManagementMonthDisplay');if(el)el.textContent=monthLabel($('seaVibePayrollManagementMonth')?.value||state.management?.month||currentMonth());
  }

  function commissionPeriod(reset=false){
    const month=$('seaVibePayrollManagementMonth')?.value||currentMonth();
    const bounds=monthBounds(month),saved=state.management?.commissionPeriod||{},previous=state.management?.previousCommissionPeriod||null;
    const fromInput=$('seaVibePayrollCommissionFrom'),toInput=$('seaVibePayrollCommissionTo');
    const suggestedFrom=previous?.toDate?addDays(previous.toDate,1):bounds.from;
    const preferredFrom=saved?.fromDate||suggestedFrom||bounds.from;
    const preferredTo=saved?.toDate||bounds.to;
    if(fromInput&&(reset||!fromInput.value))fromInput.value=preferredFrom;
    if(toInput&&(reset||!toInput.value))toInput.value=preferredTo;
    const locked=Boolean(saved?.locked);
    if(fromInput)fromInput.disabled=locked;
    if(toInput)toInput.disabled=locked;
    const range={month,from:fromInput?.value||preferredFrom,to:toInput?.value||preferredTo,bounds,previous,locked,suggestedFrom};
    renderCommissionPeriodInfo(range);return range;
  }

  function periodWarnings(range){
    const warnings=[];if(!range?.previous?.toDate)return warnings;
    const previousTo=String(range.previous.toDate).slice(0,10),next=addDays(previousTo,1);
    if(range.from&&range.from<=previousTo)warnings.push(t('payroll.commissionPeriod.overlap','تنبيه: الفترة المختارة تتداخل مع عمولات سبق احتسابها حتى {date}.',{date:dateLabel(previousTo)}));
    else if(range.from&&range.from>next)warnings.push(t('payroll.commissionPeriod.gap','تنبيه: توجد أيام غير محتسبة من {from} إلى {to}.',{from:dateLabel(next),to:dateLabel(addDays(range.from,-1))}));
    return warnings;
  }

  function renderCommissionPeriodInfo(range){
    const el=$('seaVibePayrollCommissionPeriodInfo');if(!el)return;
    const lines=[];
    if(range?.previous?.toDate){
      lines.push(`<span>${esc(t('payroll.commissionPeriod.previous','آخر فترة محتسبة في راتب {month}: من {from} إلى {to}.',{month:monthLabel(range.previous.payrollMonth),from:dateLabel(range.previous.fromDate),to:dateLabel(range.previous.toDate)}))}</span>`);
      lines.push(`<span class="suggested">${esc(t('payroll.commissionPeriod.suggested','بداية الفترة التالية المقترحة: {date}.',{date:dateLabel(range.suggestedFrom)}))}</span>`);
    }else lines.push(`<span class="no-previous">${esc(t('payroll.commissionPeriod.noPrevious','لا توجد فترة عمولات سابقة.'))}</span>`);
    periodWarnings(range).forEach(message=>lines.push(`<span class="warning">${esc(message)}</span>`));
    if(range?.locked)lines.push(`<span class="locked">${esc(t('payroll.commissionPeriod.locked','تم تثبيت فترة العمولات لأن بعض رواتب الشهر خرجت من مرحلة التجهيز.'))}</span>`);
    el.innerHTML=lines.join('');
  }

  function validPeriod(range,show=true){
    let message='';
    if(!range?.from||!range?.to||range.from>range.to)message=t('payroll.commissionPeriod.invalid','يجب أن يكون تاريخ بداية عمولات الراتب قبل أو مساويًا لتاريخ النهاية.');
    else if(range.to>range.bounds.to)message=t('payroll.commissionPeriod.afterMonth','لا يمكن أن تنتهي فترة عمولات الراتب بعد نهاية شهر الراتب.');
    if(message&&show)setStatus('seaVibePayrollManagementStatus',message,'error');
    return !message;
  }

  async function loadManagement(force=false,resetPeriod=false){
    const month=$('seaVibePayrollManagementMonth')?.value||currentMonth();
    setStatus('seaVibePayrollManagementStatus',t('payroll.loading','جاري تحميل الرواتب...'));
    try{
      state.management=await svc().loadManagement(month,{force});
      setStatus('seaVibePayrollManagementStatus',cacheMessage('management'),'info');
      commissionPeriod(resetPeriod);renderManagement();
    }catch(error){setStatus('seaVibePayrollManagementStatus',error.message||String(error),'error');renderManagementEmpty();}
  }

  function renderManagementEmpty(){
    if($('seaVibePayrollManagementBody'))$('seaVibePayrollManagementBody').innerHTML=`<tr><td colspan="10" class="payroll-empty">${esc(t('payroll.empty','لا توجد بيانات.'))}</td></tr>`;
  }

  function managementRows(){
    const rows=[...(state.management?.rows||[])];
    const search=String($('seaVibePayrollManagementSearch')?.value||'').trim().toLowerCase();
    const payment=$('seaVibePayrollPaymentFilter')?.value||'';const status=$('seaVibePayrollStatusFilter')?.value||'';
    return rows.filter(row=>{
      const tabOk=state.managementTab==='reports'?row.status==='paid':row.status!=='paid';
      const searchOk=!search||String(row.employeeName||'').toLowerCase().includes(search);
      return tabOk&&searchOk&&(!payment||row.paymentMethod===payment)&&(!status||row.status===status);
    });
  }

  function syncPaymentFilter(){
    const select=$('seaVibePayrollPaymentFilter');if(!select)return;const current=select.value;
    const methods=[...new Set((state.management?.rows||[]).map(x=>String(x.paymentMethod||'').trim()).filter(Boolean))].sort();
    select.innerHTML=`<option value="">${esc(t('payroll.common.all','الكل'))}</option>`+methods.map(x=>`<option value="${esc(x)}">${esc(paymentMethodLabel(x))}</option>`).join('');
    if(methods.includes(current))select.value=current;
  }

  function actionButton(action,label,cls='payroll-action-primary',permission='edit'){
    return `<button type="button" class="${cls}" data-sea-vibe-salary-action="${action}" data-permission-screen="seaVibePayrollManagement" data-permission-action="${permission}">${esc(label)}</button>`;
  }

  function salaryActions(row){
    if(row.status==='draft')return actionButton('adjust',t('payroll.action.adjust','تعديل'),'payroll-action-neutral','add')+actionButton('submit',t('payroll.action.submit','إرسال للاعتماد'),'payroll-action-primary','add');
    if(row.status==='pending_chairman')return actionButton('chairman_approve',t('payroll.action.chairmanApprove','اعتماد رئيس مجلس الإدارة'),'payroll-action-success','edit')+actionButton('reverse_submit',t('payroll.action.reverseSubmit','إرجاع للتجهيز'),'payroll-action-danger','delete');
    if(row.status==='pending_employee')return actionButton('reverse_chairman',t('payroll.action.reverseChairman','إلغاء اعتماد رئيس مجلس الإدارة'),'payroll-action-danger','delete');
    if(row.status==='ready_for_payment'){
      const reverseAction=row.requiresEmployeeApproval
        ?actionButton('reverse_employee',t('payroll.action.reverseEmployee','إلغاء موافقة الموظف'),'payroll-action-danger','delete')
        :actionButton('reverse_chairman_ready',t('payroll.action.reverseChairman','إلغاء اعتماد رئيس مجلس الإدارة'),'payroll-action-danger','delete');
      return actionButton('mark_paid',t('payroll.action.markPaid','تم الصرف'),'payroll-action-success','edit')+reverseAction;
    }
    if(row.status==='paid')return actionButton('reverse_paid',t('payroll.action.reversePaid','إلغاء الصرف'),'payroll-action-danger','delete');
    return '';
  }

  function renderSalaryRow(row){
    return `<tr data-sea-vibe-salary-id="${esc(row.id)}"><td data-label="${esc(t('payroll.col.employee','الموظف'))}"><strong>${esc(row.employeeName)}</strong></td><td data-label="${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}">${esc(paymentMethodLabel(row.paymentMethod))}</td><td data-label="${esc(t('payroll.col.base','الأساسي'))}" class="money">${money(row.baseSalary)}</td><td data-label="${esc(t('payroll.col.allowances','البدلات'))}" class="money">${money(row.allowances)}</td><td data-label="${esc(t('payroll.col.commissions','العمولات'))}" class="money">${money(row.commissions)}</td><td data-label="${esc(t('payroll.col.overtime','الإضافي'))}" class="money">${money(row.overtime)}</td><td data-label="${esc(t('payroll.col.deductions','الخصومات'))}" class="money">${money(row.deductions)}</td><td data-label="${esc(t('payroll.col.net','الصافي'))}" class="money net">${money(row.netSalary)}</td><td data-label="${esc(t('payroll.common.status','الحالة'))}">${statusBadge(row.status)}</td><td data-label="${esc(t('payroll.common.actions','الإجراءات'))}"><div class="payroll-row-actions">${salaryActions(row)}</div></td></tr>`;
  }

  function renderTotals(rows){
    const el=$('seaVibePayrollManagementTotals');if(!el)return;
    const totals=(rows||[]).reduce((sum,row)=>({base:sum.base+Number(row.baseSalary||0),allowances:sum.allowances+Number(row.allowances||0),commissions:sum.commissions+Number(row.commissions||0),overtime:sum.overtime+Number(row.overtime||0),deductions:sum.deductions+Number(row.deductions||0),net:sum.net+Number(row.netSalary||0)}),{base:0,allowances:0,commissions:0,overtime:0,deductions:0,net:0});
    const totalLabel=t('payroll.table.total','الإجمالي');
    el.innerHTML=`<tr class="payroll-totals-row"><th><strong>${esc(totalLabel)} (${number((rows||[]).length)})</strong></th><th>—</th><th>${money(totals.base)}</th><th>${money(totals.allowances)}</th><th>${money(totals.commissions)}</th><th>${money(totals.overtime)}</th><th>${money(totals.deductions)}</th><th class="net">${money(totals.net)}</th><th>—</th><th>—</th></tr>`;
  }

  function renderManagement(){
    const summary=state.management?.summary||{};
    renderMonthDisplay();commissionPeriod(false);syncPaymentFilter();
    const kpis={Employees:summary.employees,Base:summary.baseSalary,Allowances:summary.allowances,Commissions:summary.commissions,Deductions:summary.deductions,Net:summary.netSalary};
    Object.entries(kpis).forEach(([suffix,value])=>{const el=$(`seaVibePayrollKpi${suffix}`);if(el)el.textContent=suffix==='Employees'?number(value):money(value);});
    $('seaVibePayrollManagementTabs')?.querySelectorAll('[data-sea-vibe-payroll-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.seaVibePayrollTab===state.managementTab));
    const rows=managementRows();
    $('seaVibePayrollManagementBody').innerHTML=rows.length?rows.map(renderSalaryRow).join(''):`<tr><td colspan="10" class="payroll-empty">${esc(state.managementTab==='reports'?t('payroll.reports.empty','لا توجد رواتب مصروفة في هذا الشهر.'):t('payroll.current.empty','لا توجد رواتب جارية ضمن الفلاتر الحالية.'))}</td></tr>`;
    renderTotals(rows);
    window.PermissionEngine?.applyActionVisibility?.($('seaVibePayrollManagementView'));
  }

  function adjustmentItemRow(type,item={}){
    const label=type==='addition'?t('payroll.adjustment.additions','بنود الإضافي'):t('payroll.adjustment.deductions','بنود الخصومات');
    return `<div class="salary-adjustment-item" data-sea-vibe-adjustment-type="${esc(type)}"><div class="salary-adjustment-item-grid"><label><span>${esc(t('payroll.adjustment.itemName','البيان'))}</span><input class="sea-vibe-salary-adjustment-name" autocomplete="off" maxlength="200" required value="${esc(item.name||'')}" placeholder="${esc(label)}"></label><label><span>${esc(t('payroll.adjustment.itemAmount','القيمة'))}</span><input class="sea-vibe-salary-adjustment-amount" type="number" min="0.01" step="0.01" required value="${item.amount?esc(Number(item.amount).toFixed(2)):''}"></label><label class="salary-adjustment-item-notes"><span>${esc(t('payroll.adjustment.itemNotes','ملاحظات البند'))}</span><input class="sea-vibe-salary-adjustment-note" maxlength="500" value="${esc(item.notes||'')}"></label><button class="salary-adjustment-remove" type="button" data-sea-vibe-adjustment-remove aria-label="${esc(t('payroll.adjustment.remove','حذف البند'))}">×</button></div></div>`;
  }

  function collectAdjustmentItems(){
    return [...document.querySelectorAll('#seaVibePayrollAdjustmentDialog .salary-adjustment-item')].map((row,index)=>({
      type:row.dataset.seaVibeAdjustmentType,
      name:row.querySelector('.sea-vibe-salary-adjustment-name')?.value.trim()||'',
      amount:Number(row.querySelector('.sea-vibe-salary-adjustment-amount')?.value||0),
      notes:row.querySelector('.sea-vibe-salary-adjustment-note')?.value.trim()||'',
      sortOrder:index+1
    })).filter(item=>item.name||item.amount||item.notes);
  }

  function updateAdjustmentTotals(){
    const items=collectAdjustmentItems();
    const additions=items.filter(x=>x.type==='addition').reduce((sum,x)=>sum+Number(x.amount||0),0);
    const deductions=items.filter(x=>x.type==='deduction').reduce((sum,x)=>sum+Number(x.amount||0),0);
    if($('seaVibePayrollAdjustmentAdditionTotal'))$('seaVibePayrollAdjustmentAdditionTotal').textContent=money(additions);
    if($('seaVibePayrollAdjustmentDeductionTotal'))$('seaVibePayrollAdjustmentDeductionTotal').textContent=money(deductions);
  }

  function addAdjustmentItem(type,item={}){
    const target=type==='addition'?$('seaVibePayrollAdditionItems'):$('seaVibePayrollDeductionItems');if(!target)return;
    target.insertAdjacentHTML('beforeend',adjustmentItemRow(type,item));updateAdjustmentTotals();
  }

  function openAdjustment(row){
    $('seaVibePayrollAdjustmentId').value=row.id;
    $('seaVibePayrollAdjustmentEmployee').textContent=`${row.employeeName} — ${monthLabel(state.management?.month)}`;
    $('seaVibePayrollAdjustmentNotes').value=row.notes||'';
    $('seaVibePayrollAdditionItems').innerHTML='';$('seaVibePayrollDeductionItems').innerHTML='';
    (row.adjustmentItems||[]).filter(x=>x.type==='addition').forEach(item=>addAdjustmentItem('addition',item));
    (row.adjustmentItems||[]).filter(x=>x.type==='deduction').forEach(item=>addAdjustmentItem('deduction',item));
    updateAdjustmentTotals();window.PetatoeLocalization?.applyStatic?.($('seaVibePayrollAdjustmentDialog'));$('seaVibePayrollAdjustmentDialog')?.showModal();
  }

  async function handleSalaryAction(id,action){
    const row=(state.management?.rows||[]).find(x=>String(x.id)===String(id));if(!row)return;
    if(action==='adjust'){openAdjustment(row);return;}
    const reverse=action.startsWith('reverse_');
    const confirmation=reverse?t('payroll.confirm.reverse','سيتم إلغاء المرحلة الحالية والرجوع خطوة واحدة فقط حسب التسلسل العكسي. هل تريد المتابعة؟'):t('payroll.confirm.transition','هل تريد تنفيذ هذا الإجراء؟');
    if(!window.confirm(confirmation))return;
    let reference='';if(action==='mark_paid')reference=window.prompt(t('payroll.payment.referencePrompt','مرجع الصرف (اختياري):'),'')||'';
    setStatus('seaVibePayrollManagementStatus',t('payroll.saving','جاري حفظ التغيير...'));
    try{await svc().transition(id,action,reference);await loadManagement(true,false);setStatus('seaVibePayrollManagementStatus',t('payroll.saved','تم تحديث حالة الراتب بنجاح.'),'success');}
    catch(error){setStatus('seaVibePayrollManagementStatus',error.message||String(error),'error');}
  }

  // -----------------------------------------------------------------------
  // Salary statement
  // -----------------------------------------------------------------------
  async function loadSalaryStatement(force=false){
    setStatus('seaVibeSalaryStatementStatus',t('payroll.loading','جاري التحميل...'));
    try{state.salary=await svc().loadSalaryStatement({force});setStatus('seaVibeSalaryStatementStatus',cacheMessage('salary'),'info');renderSalaryStatement();}
    catch(error){setStatus('seaVibeSalaryStatementStatus',error.message||String(error),'error');}
  }

  function salaryAdjustmentList(items,type,compact=false){
    const rows=(items||[]).filter(item=>item.type===type);if(!rows.length)return compact?'—':'';
    return `<div class="${compact?'salary-adjustment-mini':'salary-adjustment-detail-list'}">${rows.map(item=>`<div class="salary-adjustment-detail-row"><span>${esc(item.name||'—')}${item.notes?`<small>${esc(item.notes)}</small>`:''}</span><strong>${money(item.amount)}</strong></div>`).join('')}</div>`;
  }

  function salaryCommissionPeriodNote(statement){
    if(!statement?.commissionFrom||!statement?.commissionTo)return '';
    return `<div class="salary-commission-period-note">${esc(t('payroll.commissionPeriod.statementNote','تم احتساب العمولات عن الفترة من {from} إلى {to}.',{from:dateLabel(statement.commissionFrom),to:dateLabel(statement.commissionTo)}))}</div>`;
  }

  function salaryAdjustmentDetails(statement){
    const items=statement?.adjustmentItems||[];if(!items.length)return '';
    return `<div class="salary-adjustment-details"><h4>${esc(t('salaryStatement.adjustmentDetails','تفاصيل الإضافات والخصومات'))}</h4><div class="salary-adjustment-details-grid"><section><strong>${esc(t('payroll.adjustment.additions','بنود الإضافي'))}</strong>${salaryAdjustmentList(items,'addition')}</section><section><strong>${esc(t('payroll.adjustment.deductions','بنود الخصومات'))}</strong>${salaryAdjustmentList(items,'deduction')}</section></div></div>`;
  }

  function renderSalaryStatement(){
    const current=state.salary?.current,employee=state.salary?.employee;
    $('seaVibeSalaryStatementTabs')?.querySelectorAll('[data-sea-vibe-salary-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.seaVibeSalaryTab===state.salaryTab));
    $('seaVibeSalaryStatementCurrent')?.classList.toggle('hidden',state.salaryTab!=='current');$('seaVibeSalaryStatementHistory')?.classList.toggle('hidden',state.salaryTab!=='history');
    if(!employee){
      $('seaVibeSalaryStatementCurrent').innerHTML=`<div class="panel payroll-empty">${esc(t('salaryStatement.unlinked','حسابك غير مربوط بسجل موظف في البيانات المرجعية.'))}</div>`;
      $('seaVibeSalaryStatementHistory').innerHTML='';return;
    }
    if(!current)$('seaVibeSalaryStatementCurrent').innerHTML=`<div class="panel payroll-empty">${esc(t('salaryStatement.noCurrent','لا يوجد كشف راتب حالي متاح بعد اعتماد رئيس مجلس الإدارة.'))}</div>`;
    else{
      const steps=[['pending_chairman',t('payroll.flow.chairman','اعتماد رئيس مجلس الإدارة')],['pending_employee',t('payroll.flow.employee','موافقة الموظف')],['ready_for_payment',t('payroll.flow.ready','جاهز للصرف')],['paid',t('payroll.flow.paid','تم الصرف')]];
      const rank={pending_chairman:0,pending_employee:1,ready_for_payment:2,paid:3};const activeRank=rank[current.status]??0;
      $('seaVibeSalaryStatementCurrent').innerHTML=`<div class="payroll-statement-shell"><div class="payroll-statement-hero"><article class="panel payroll-statement-card"><div class="panel-header"><div><strong>${esc(employee.name)}</strong><div class="payroll-form-hint">${esc(monthLabel(current.payrollMonth))} · ${esc(paymentMethodLabel(current.paymentMethod))}</div></div>${statusBadge(current.status)}</div>${salaryCommissionPeriodNote(current)}<div class="payroll-statement-main"><div class="payroll-value"><span>${esc(t('payroll.col.base','الأساسي'))}</span><strong>${money(current.baseSalary)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.allowances','البدلات'))}</span><strong>${money(current.allowances)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.commissions','العمولات'))}</span><strong>${money(current.commissions)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.overtime','الإضافي'))}</span><strong>${money(current.overtime)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.deductions','الخصومات'))}</span><strong>${money(current.deductions)}</strong></div><div class="payroll-value net"><span>${esc(t('payroll.col.net','صافي الراتب'))}</span><strong>${money(current.netSalary)}</strong></div></div>${salaryAdjustmentDetails(current)}${current.status==='pending_employee'?`<div class="payroll-current-actions"><button id="seaVibeSalaryEmployeeApprove" class="primary-btn" type="button">${esc(t('salaryStatement.approve','أوافق على كشف الراتب'))}</button></div>`:''}</article><article class="panel"><h3>${esc(t('payroll.flow.title','مسار الاعتماد'))}</h3><div class="payroll-flow">${steps.map((step,i)=>`<div class="payroll-flow-step ${i<activeRank?'done':i===activeRank?'active':''}"><span class="payroll-flow-dot">${i<activeRank?'✓':i+1}</span><div class="payroll-flow-copy"><strong>${esc(step[1])}</strong><small>${i===1&&current.employeeApprovedAt?dateTime(current.employeeApprovedAt):i===0&&current.chairmanApprovedAt?dateTime(current.chairmanApprovedAt):''}</small></div></div>`).join('')}</div></article></div></div>`;
      $('seaVibeSalaryEmployeeApprove')?.addEventListener('click',async()=>{
        if(!confirm(t('salaryStatement.approveConfirm','أؤكد موافقتي على كشف الراتب الموضح. هل تريد المتابعة؟')))return;
        setStatus('seaVibeSalaryStatementStatus',t('payroll.saving','جاري حفظ الموافقة...'));
        try{await svc().transition(current.id,'employee_approve');await loadSalaryStatement(true);setStatus('seaVibeSalaryStatementStatus',t('salaryStatement.approved','تم اعتماد كشف الراتب وأصبح جاهزًا للصرف.'),'success');}
        catch(error){setStatus('seaVibeSalaryStatementStatus',error.message||String(error),'error');}
      });
    }
    const history=state.salary?.history||[];
    $('seaVibeSalaryStatementHistory').innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.common.month','الشهر'))}</th><th>${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}</th><th>${esc(t('payroll.commissionPeriod.title','فترة احتساب عمولات الراتب'))}</th><th>${esc(t('payroll.col.base','الأساسي'))}</th><th>${esc(t('payroll.col.allowances','البدلات'))}</th><th>${esc(t('payroll.col.commissions','العمولات'))}</th><th>${esc(t('payroll.col.overtime','الإضافي'))}</th><th>${esc(t('payroll.col.deductions','الخصومات'))}</th><th>${esc(t('payroll.col.net','الصافي'))}</th><th>${esc(t('payroll.status.paid','تم الصرف'))}</th></tr></thead><tbody>${history.length?history.map(x=>`<tr><td>${esc(monthLabel(x.payrollMonth))}</td><td>${esc(paymentMethodLabel(x.paymentMethod))}</td><td>${x.commissionFrom&&x.commissionTo?`${esc(dateLabel(x.commissionFrom))}<br>→ ${esc(dateLabel(x.commissionTo))}`:'—'}</td><td>${money(x.baseSalary)}</td><td>${money(x.allowances)}</td><td>${money(x.commissions)}</td><td>${money(x.overtime)}${salaryAdjustmentList(x.adjustmentItems,'addition',true)}</td><td>${money(x.deductions)}${salaryAdjustmentList(x.adjustmentItems,'deduction',true)}</td><td class="net">${money(x.netSalary)}</td><td>${dateTime(x.paidAt)}</td></tr>`).join(''):`<tr><td colspan="10" class="payroll-empty">${esc(t('salaryStatement.noHistory','لا توجد رواتب سابقة مصروفة.'))}</td></tr>`}</tbody></table></div>`;
  }

  // -----------------------------------------------------------------------
  // Employee master/reference — R44R8 canonical owner retained.
  // -----------------------------------------------------------------------
  function renderReference(){
    const reference=state.reference||{employees:[],users:[]};const rows=reference.employees||[];const body=$('seaVibePayrollReferenceContent');if(!body)return;
    const labels={name:t('seaVibePayroll.employee.name','اسم الموظف'),user:t('seaVibePayroll.employee.user','المستخدم المرتبط'),base:t('seaVibePayroll.employee.baseSalary','الراتب الأساسي'),allowances:t('seaVibePayroll.employee.allowances','البدلات'),payment:t('seaVibePayroll.employee.paymentMethod','طريقة الدفع'),status:t('seaVibePayroll.common.status','الحالة'),actions:t('seaVibePayroll.common.actions','الإجراءات')};
    body.innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-table"><thead><tr><th>${esc(labels.name)}</th><th>${esc(labels.user)}</th><th>${esc(labels.base)}</th><th>${esc(labels.allowances)}</th><th>${esc(labels.payment)}</th><th>${esc(labels.status)}</th><th>${esc(labels.actions)}</th></tr></thead><tbody>${rows.length?rows.map(row=>{const user=(reference.users||[]).find(u=>String(u.id)===String(row.userId));return `<tr><td><strong>${esc(row.fullName||'—')}</strong></td><td>${esc(user?`${user.fullName||'—'}${user.email?` — ${user.email}`:''}`:'—')}</td><td class="money">${esc(money(row.baseSalary))}</td><td class="money">${esc(money(row.allowances))}</td><td>${esc(row.paymentMethod||'—')}</td><td>${row.isActive!==false?esc(t('seaVibePayroll.status.active','نشط')):esc(t('seaVibePayroll.status.inactive','موقوف'))}</td><td><div class="payroll-row-actions"><button class="secondary-btn" type="button" data-sea-vibe-employee-edit="${esc(row.id)}" data-permission-screen="seaVibePayrollReference" data-permission-action="edit">${esc(t('common.edit','تعديل'))}</button></div></td></tr>`;}).join(''):`<tr><td colspan="7" class="payroll-empty">${esc(t('seaVibePayroll.reference.noEmployees','لا يوجد موظفو SEA VIBE حتى الآن.'))}</td></tr>`}</tbody></table></div>`;
    window.PermissionEngine?.applyActionVisibility?.(body);
  }

  function openEmployee(row=null){
    const reference=state.reference||{users:[]};
    $('seaVibeEmployeeId').value=row?.id||'';$('seaVibeEmployeeName').value=row?.fullName||'';$('seaVibeEmployeeBase').value=Number(row?.baseSalary||0);$('seaVibeEmployeeAllowances').value=Number(row?.allowances||0);$('seaVibeEmployeePaymentMethod').value=row?.paymentMethod||'تحويل بنكي';$('seaVibeEmployeeActive').checked=row?.isActive!==false;$('seaVibeEmployeeNotes').value=row?.notes||'';
    $('seaVibeEmployeeUser').innerHTML=`<option value="">—</option>`+(reference.users||[]).map(u=>`<option value="${esc(u.id)}">${esc(u.fullName||'—')}${u.email?` — ${esc(u.email)}`:''}</option>`).join('');$('seaVibeEmployeeUser').value=row?.userId||'';
    $('seaVibeEmployeeDialogTitle').textContent=row?t('seaVibePayroll.employee.edit','تعديل موظف SEA VIBE'):t('seaVibePayroll.employee.add','إضافة موظف SEA VIBE');$('seaVibeEmployeeDialog')?.showModal();window.PetatoeLocalization?.applyStatic?.($('seaVibeEmployeeDialog'));
  }

  async function loadReference(force=false){
    setStatus('seaVibePayrollReferenceStatus',t('seaVibePayroll.common.loading','جاري تحميل بيانات موظفي SEA VIBE...'));
    try{state.reference=await svc().loadReference({force});renderReference();setStatus('seaVibePayrollReferenceStatus',cacheMessage('reference'),'info');}
    catch(error){setStatus('seaVibePayrollReferenceStatus',error.message||String(error),'error');}
  }

  // -----------------------------------------------------------------------
  // Commission management — R44R15 canonical read model over trip expenses.
  // -----------------------------------------------------------------------
  function commissionRange(reset=false){
    const monthInput=$('seaVibeCommissionManagementMonth'),fromInput=$('seaVibeCommissionManagementFrom'),toInput=$('seaVibeCommissionManagementTo');
    const month=monthInput?.value||currentMonth(),bounds=monthBounds(month);
    if(monthInput&&!monthInput.value)monthInput.value=month;
    if(fromInput&&(reset||!fromInput.value))fromInput.value=bounds.from;
    if(toInput&&(reset||!toInput.value))toInput.value=bounds.to;
    return{month,from:fromInput?.value||bounds.from,to:toInput?.value||bounds.to,bounds};
  }

  function validCommissionRange(range,show=true){
    const ok=Boolean(range?.from&&range?.to&&range.from<=range.to);
    if(!ok&&show)setStatus('seaVibeCommissionManagementStatus',t('seaVibePayroll.commission.rangeInvalid','يجب أن يكون تاريخ بداية العمولات قبل أو مساويًا لتاريخ النهاية.'),'error');
    return ok;
  }

  function commissionName(row){return lang()==='en'?(row.commissionNameEn||row.commissionNameAr||'Commission'):(row.commissionNameAr||row.commissionNameEn||'عمولة');}
  function commissionBeneficiaryTypeLabel(value){return value==='employee'?t('seaVibePayroll.commission.employee','موظف'):t('seaVibePayroll.commission.broker','وسيط');}
  function commissionCalculationLabel(row){return row.calculationType==='percentage'?`${number(row.calculationValue)}% ${t('seaVibePayroll.commission.ofTripValue','من قيمة الرحلة')}`:`${money(row.calculationValue)} ${t('seaVibePayroll.commission.fixed','ثابت')}`;}
  function commissionPayrollState(row){if(row.beneficiaryType!=='employee')return'not_applicable';return row.payrollLinked?'linked':'pending';}
  function commissionPayrollLabel(row){
    const key=commissionPayrollState(row);if(key==='not_applicable')return t('seaVibePayroll.commission.notApplicable','لا ينطبق');
    if(key==='pending')return t('seaVibePayroll.commission.pending','لم يُدرج بعد');
    const link=(row.payrollLinks||[])[0];return link?.payrollMonth?`${t('seaVibePayroll.commission.linked','مدرج بالراتب')} — ${monthLabel(link.payrollMonth)}`:t('seaVibePayroll.commission.linked','مدرج بالراتب');
  }

  function filteredCommissionRows(){
    const rows=[...(state.commissions?.rows||[])],search=String($('seaVibeCommissionSearch')?.value||'').trim().toLowerCase(),beneficiary=$('seaVibeCommissionBeneficiaryFilter')?.value||'',payroll=$('seaVibeCommissionPayrollFilter')?.value||'';
    return rows.filter(row=>{
      const hay=`${row.tripSerial||''} ${row.beneficiaryName||''} ${row.commissionNameAr||''} ${row.commissionNameEn||''} ${row.tripTypeNameAr||''} ${row.tripTypeNameEn||''}`.toLowerCase();
      return(!search||hay.includes(search))&&(!beneficiary||row.beneficiaryType===beneficiary)&&(!payroll||commissionPayrollState(row)===payroll);
    });
  }

  async function loadCommissions(force=false,resetRange=false){
    const range=commissionRange(resetRange);if(!validCommissionRange(range))return;
    setStatus('seaVibeCommissionManagementStatus',t('commission.loading','جاري تحميل العمولات...'));
    try{state.commissions=await svc().loadCommissionsRange(range.from,range.to,{force});renderCommissions();setStatus('seaVibeCommissionManagementStatus',cacheMessage('commissions'),'info');}
    catch(error){setStatus('seaVibeCommissionManagementStatus',error.message||String(error),'error');renderCommissions();}
  }

  function renderCommissions(){
    const summary=state.commissions?.summary||{},all=state.commissions?.rows||[],rows=filteredCommissionRows();
    if($('seaVibeCommissionKpiTotal'))$('seaVibeCommissionKpiTotal').textContent=money(summary.totalCommissions||0);
    if($('seaVibeCommissionKpiEmployee'))$('seaVibeCommissionKpiEmployee').textContent=money(summary.employeeCommissions||0);
    if($('seaVibeCommissionKpiBroker'))$('seaVibeCommissionKpiBroker').textContent=money(summary.brokerCommissions||0);
    if($('seaVibeCommissionKpiTrips'))$('seaVibeCommissionKpiTrips').textContent=number(summary.tripCount||0);
    if($('seaVibeCommissionKpiPayrollLinked'))$('seaVibeCommissionKpiPayrollLinked').textContent=number(summary.payrollLinkedCount||0);
    const body=$('seaVibeCommissionManagementBody');if(body)body.innerHTML=rows.length?rows.map(row=>`<tr><td data-label="${esc(t('seaVibe.common.date','التاريخ'))}">${esc(dateLabel(row.tripDate))}</td><td data-label="${esc(t('seaVibe.trip.serial','سيريال الرحلة'))}"><strong>${esc(row.tripSerial||'—')}</strong></td><td data-label="${esc(t('seaVibePayroll.commission.name','العمولة'))}">${esc(commissionName(row))}</td><td data-label="${esc(t('seaVibePayroll.commission.beneficiary','المستفيد'))}"><strong>${esc(row.beneficiaryName||'—')}</strong></td><td data-label="${esc(t('seaVibePayroll.commission.beneficiaryType','النوع'))}">${esc(commissionBeneficiaryTypeLabel(row.beneficiaryType))}</td><td data-label="${esc(t('seaVibePayroll.commission.calculation','طريقة الحساب'))}">${esc(commissionCalculationLabel(row))}</td><td data-label="${esc(t('seaVibe.trip.value','قيمة الرحلة'))}" class="money">${money(row.tripValue)}</td><td data-label="${esc(t('commission.col.amount','العمولة'))}" class="money net"><strong>${money(row.amount)}</strong></td><td data-label="${esc(t('seaVibePayroll.commission.payrollStatus','حالة الراتب'))}">${esc(commissionPayrollLabel(row))}</td></tr>`).join(''):`<tr><td colspan="9" class="payroll-empty">${esc(t('commission.empty','لا توجد عمولات ضمن الفلاتر الحالية.'))}</td></tr>`;
    const total=rows.reduce((sum,row)=>sum+Number(row.amount||0),0);if($('seaVibeCommissionManagementFoot'))$('seaVibeCommissionManagementFoot').innerHTML=`<tr><th colspan="7">${esc(t('commission.footer.total','الإجمالي'))}</th><th class="net">${money(total)}</th><th>${number(rows.length)} / ${number(all.length)}</th></tr>`;
  }

  // -----------------------------------------------------------------------
  // Commission statement — self-service for employees, all-beneficiaries for Super Admin.
  // -----------------------------------------------------------------------
  async function loadCommissionStatement(force=false){
    setStatus('seaVibeCommissionStatementStatus',t('commission.loading','جاري تحميل العمولات...'));
    try{state.commissionStatement=await svc().loadCommissionStatement({force});renderCommissionStatement();setStatus('seaVibeCommissionStatementStatus',cacheMessage('commissionStatement'),'info');}
    catch(error){setStatus('seaVibeCommissionStatementStatus',error.message||String(error),'error');renderCommissionStatement();}
  }

  function commissionStatementCurrentTable(rows,showBeneficiary=false){
    const cols=showBeneficiary?7:5;
    return `<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('seaVibe.common.date','التاريخ'))}</th><th>${esc(t('seaVibe.trip.serial','سيريال الرحلة'))}</th><th>${esc(t('seaVibePayroll.commission.name','العمولة'))}</th>${showBeneficiary?`<th>${esc(t('seaVibePayroll.commission.beneficiary','المستفيد'))}</th><th>${esc(t('seaVibePayroll.commission.beneficiaryType','النوع'))}</th>`:''}<th>${esc(t('seaVibe.trip.value','قيمة الرحلة'))}</th><th>${esc(t('commission.col.amount','العمولة'))}</th></tr></thead><tbody>${rows.length?rows.map(row=>`<tr><td>${esc(dateLabel(row.tripDate))}</td><td><strong>${esc(row.tripSerial||'—')}</strong></td><td>${esc(commissionName(row))}</td>${showBeneficiary?`<td>${esc(row.beneficiaryName||'—')}</td><td>${esc(commissionBeneficiaryTypeLabel(row.beneficiaryType))}</td>`:''}<td class="money">${money(row.tripValue)}</td><td class="money net"><strong>${money(row.amount)}</strong></td></tr>`).join(''):`<tr><td colspan="${cols}" class="payroll-empty">${esc(t('commissionStatement.noCurrent','لا توجد عمولة محتسبة للشهر الحالي حتى الآن.'))}</td></tr>`}</tbody></table></div>`;
  }

  function renderCommissionStatement(){
    const data=state.commissionStatement||{},current=data.current||[],history=data.history||[],admin=data.mode==='admin',employee=data.employee;
    $('seaVibeCommissionStatementTabs')?.querySelectorAll('[data-sea-vibe-commission-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.seaVibeCommissionTab===state.commissionTab));
    $('seaVibeCommissionStatementCurrent')?.classList.toggle('hidden',state.commissionTab!=='current');$('seaVibeCommissionStatementHistory')?.classList.toggle('hidden',state.commissionTab!=='history');
    if(!admin&&!employee){if($('seaVibeCommissionStatementCurrent'))$('seaVibeCommissionStatementCurrent').innerHTML=`<div class="panel payroll-empty">${esc(t('commissionStatement.unlinked','حسابك غير مربوط بسجل موظف في البيانات المرجعية.'))}</div>`;if($('seaVibeCommissionStatementHistory'))$('seaVibeCommissionStatementHistory').innerHTML='';return;}
    const total=current.reduce((sum,row)=>sum+Number(row.amount||0),0),trips=new Set(current.map(row=>row.tripId).filter(Boolean)).size;
    const title=admin?t('seaVibePayroll.commissionStatement.adminTitle','ملخص عمولات SEA VIBE'):employee?.name||'—';
    if($('seaVibeCommissionStatementCurrent'))$('seaVibeCommissionStatementCurrent').innerHTML=`<div class="commission-statement-shell"><div class="commission-statement-summary"><article class="panel commission-summary-card commission-summary-total"><span>${esc(t('commission.kpi.total','إجمالي العمولة'))}</span><strong>${money(total)}</strong></article><article class="panel commission-summary-card"><span>${esc(t('seaVibePayroll.commission.kpi.trips','عدد الرحلات'))}</span><strong>${number(trips)}</strong></article><article class="panel commission-summary-card"><span>${esc(t('payroll.common.month','الشهر'))}</span><strong>${esc(monthLabel(data.month))}</strong></article><article class="panel commission-summary-card"><span>${esc(t('seaVibePayroll.commission.beneficiary','المستفيد'))}</span><strong>${esc(title)}</strong></article></div>${commissionStatementCurrentTable(current,admin)}</div>`;
    if($('seaVibeCommissionStatementHistory'))$('seaVibeCommissionStatementHistory').innerHTML=admin?`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.common.month','الشهر'))}</th><th>${esc(t('seaVibePayroll.commission.beneficiary','المستفيد'))}</th><th>${esc(t('seaVibePayroll.commission.beneficiaryType','النوع'))}</th><th>${esc(t('seaVibePayroll.commission.kpi.trips','عدد الرحلات'))}</th><th>${esc(t('commission.col.amount','العمولة'))}</th></tr></thead><tbody>${history.length?history.map(row=>`<tr><td>${esc(monthLabel(row.month))}</td><td><strong>${esc(row.beneficiaryName||'—')}</strong></td><td>${esc(commissionBeneficiaryTypeLabel(row.beneficiaryType))}</td><td>${number(row.tripCount||0)}</td><td class="money net"><strong>${money(row.commissionAmount)}</strong></td></tr>`).join(''):`<tr><td colspan="5" class="payroll-empty">${esc(t('commissionStatement.noHistory','لا توجد عمولات سابقة.'))}</td></tr>`}</tbody></table></div>`:`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.common.month','الشهر'))}</th><th>${esc(t('seaVibePayroll.commission.kpi.trips','عدد الرحلات'))}</th><th>${esc(t('commission.col.amount','العمولة'))}</th></tr></thead><tbody>${history.length?history.map(row=>`<tr><td>${esc(monthLabel(row.month))}</td><td>${number(row.tripCount||0)}</td><td class="money net"><strong>${money(row.commissionAmount)}</strong></td></tr>`).join(''):`<tr><td colspan="3" class="payroll-empty">${esc(t('commissionStatement.noHistory','لا توجد عمولات سابقة.'))}</td></tr>`}</tbody></table></div>`;
  }

  async function activate(view){
    if(view==='seaVibePayrollManagement'){
      if($('seaVibePayrollManagementMonth')&&!$('seaVibePayrollManagementMonth').value)$('seaVibePayrollManagementMonth').value=currentMonth();
      await loadManagement(false,true);
    }else if(view==='seaVibeSalaryStatement')await loadSalaryStatement(false);
    else if(view==='seaVibeCommissionManagement'){if($('seaVibeCommissionManagementMonth')&&!$('seaVibeCommissionManagementMonth').value)$('seaVibeCommissionManagementMonth').value=currentMonth();await loadCommissions(false,true);}
    else if(view==='seaVibeCommissionStatement')await loadCommissionStatement(false);
    else if(view==='seaVibePayrollReference')await loadReference(false);
    window.PetatoeLocalization?.applyStatic?.(document);
  }

  function syncSubgroupVisibility(){
    const group=document.querySelector('[data-sea-vibe-payroll-subgroup]');if(!group)return;
    const buttons=[...group.querySelectorAll('.nav-item[data-view]')];const visible=buttons.some(btn=>!btn.classList.contains('hidden')&&!btn.hidden);group.classList.toggle('hidden',!visible);
  }

  function bind(){
    const subgroup=document.querySelector('[data-sea-vibe-payroll-subgroup]');const toggle=subgroup?.querySelector('[data-sea-vibe-payroll-toggle]');
    toggle?.addEventListener('click',event=>{event.stopPropagation();const open=subgroup.classList.contains('is-collapsed');subgroup.classList.toggle('is-collapsed',!open);toggle.setAttribute('aria-expanded',String(open));});
    window.addEventListener('kyum-navigation-permissions-applied',syncSubgroupVisibility);
    window.addEventListener('kyum-view-changed',event=>{const view=String(event.detail?.view||'');if(['seaVibePayrollManagement','seaVibeSalaryStatement','seaVibeCommissionManagement','seaVibeCommissionStatement','seaVibePayrollReference'].includes(view)){subgroup?.classList.remove('is-collapsed');toggle?.setAttribute('aria-expanded','true');}});
    syncSubgroupVisibility();

    $('seaVibePayrollManagementMonth')?.addEventListener('change',()=>loadManagement(false,true));
    $('seaVibePayrollManagementRefresh')?.addEventListener('click',()=>loadManagement(true,false));
    ['seaVibePayrollCommissionFrom','seaVibePayrollCommissionTo'].forEach(id=>$(id)?.addEventListener('change',()=>validPeriod(commissionPeriod(false),false)));
    $('seaVibePayrollPrepareMonth')?.addEventListener('click',async()=>{
      const range=commissionPeriod(false);if(!validPeriod(range))return;
      const warnings=periodWarnings(range),warningText=warnings.length?`\n\n${warnings.join('\n')}`:'';
      if(!confirm(`${t('payroll.prepare.confirm','سيتم تجهيز أو تحديث مسودات رواتب الشهر من البيانات المرجعية وفترة العمولات المحددة. هل تريد المتابعة؟')}${warningText}`))return;
      setStatus('seaVibePayrollManagementStatus',t('payroll.preparing','جاري تجهيز رواتب الشهر...'));
      try{state.management=await svc().prepareMonth($('seaVibePayrollManagementMonth').value,range.from,range.to);commissionPeriod(true);renderManagement();setStatus('seaVibePayrollManagementStatus',t('payroll.prepared','تم تجهيز رواتب الشهر بنجاح.'),'success');}
      catch(error){setStatus('seaVibePayrollManagementStatus',error.message||String(error),'error');}
    });
    ['seaVibePayrollManagementSearch','seaVibePayrollPaymentFilter','seaVibePayrollStatusFilter'].forEach(id=>$(id)?.addEventListener(id==='seaVibePayrollManagementSearch'?'input':'change',renderManagement));
    $('seaVibePayrollClearFilters')?.addEventListener('click',()=>{$('seaVibePayrollManagementSearch').value='';$('seaVibePayrollPaymentFilter').value='';$('seaVibePayrollStatusFilter').value='';renderManagement();});
    $('seaVibePayrollManagementTabs')?.addEventListener('click',event=>{const btn=event.target.closest('[data-sea-vibe-payroll-tab]');if(!btn)return;state.managementTab=btn.dataset.seaVibePayrollTab;renderManagement();});
    $('seaVibePayrollManagementBody')?.addEventListener('click',event=>{const btn=event.target.closest('[data-sea-vibe-salary-action]');if(!btn)return;handleSalaryAction(btn.closest('tr')?.dataset.seaVibeSalaryId,btn.dataset.seaVibeSalaryAction);});

    $('seaVibePayrollAdjustmentClose')?.addEventListener('click',()=> $('seaVibePayrollAdjustmentDialog')?.close());
    $('seaVibePayrollAdjustmentCancel')?.addEventListener('click',()=> $('seaVibePayrollAdjustmentDialog')?.close());
    $('seaVibePayrollAddAdditionItem')?.addEventListener('click',()=>addAdjustmentItem('addition'));
    $('seaVibePayrollAddDeductionItem')?.addEventListener('click',()=>addAdjustmentItem('deduction'));
    $('seaVibePayrollAdjustmentDialog')?.addEventListener('click',event=>{const remove=event.target.closest('[data-sea-vibe-adjustment-remove]');if(!remove)return;remove.closest('.salary-adjustment-item')?.remove();updateAdjustmentTotals();});
    $('seaVibePayrollAdjustmentDialog')?.addEventListener('input',event=>{if(event.target.matches('.sea-vibe-salary-adjustment-amount'))updateAdjustmentTotals();});
    $('seaVibePayrollAdjustmentForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const items=collectAdjustmentItems();
      if(items.some(item=>!item.name||item.amount<=0)){setStatus('seaVibePayrollManagementStatus',t('payroll.adjustment.invalidItems','اكتب بيانًا وقيمة أكبر من صفر لكل بند.'),'error');return;}
      try{state.management=await svc().saveAdjustmentItems($('seaVibePayrollAdjustmentId').value,items,$('seaVibePayrollAdjustmentNotes').value)||state.management;$('seaVibePayrollAdjustmentDialog')?.close();renderManagement();setStatus('seaVibePayrollManagementStatus',t('payroll.adjustment.saved','تم حفظ بنود الإضافي والخصومات.'),'success');}
      catch(error){setStatus('seaVibePayrollManagementStatus',error.message||String(error),'error');}
    });

    $('seaVibeSalaryStatementRefresh')?.addEventListener('click',()=>loadSalaryStatement(true));
    $('seaVibeSalaryStatementTabs')?.addEventListener('click',event=>{const btn=event.target.closest('[data-sea-vibe-salary-tab]');if(!btn)return;state.salaryTab=btn.dataset.seaVibeSalaryTab;renderSalaryStatement();});

    $('seaVibeCommissionManagementMonth')?.addEventListener('change',()=>loadCommissions(false,true));
    ['seaVibeCommissionManagementFrom','seaVibeCommissionManagementTo'].forEach(id=>$(id)?.addEventListener('change',()=>loadCommissions(false,false)));
    $('seaVibeCommissionManagementRefresh')?.addEventListener('click',()=>loadCommissions(true,false));
    ['seaVibeCommissionSearch','seaVibeCommissionBeneficiaryFilter','seaVibeCommissionPayrollFilter'].forEach(id=>$(id)?.addEventListener(id==='seaVibeCommissionSearch'?'input':'change',renderCommissions));
    $('seaVibeCommissionStatementRefresh')?.addEventListener('click',()=>loadCommissionStatement(true));
    $('seaVibeCommissionStatementTabs')?.addEventListener('click',event=>{const btn=event.target.closest('[data-sea-vibe-commission-tab]');if(!btn)return;state.commissionTab=btn.dataset.seaVibeCommissionTab;renderCommissionStatement();});

    $('seaVibePayrollReferenceRefresh')?.addEventListener('click',()=>loadReference(true));$('seaVibeEmployeeAdd')?.addEventListener('click',()=>openEmployee());
    $('seaVibePayrollReferenceContent')?.addEventListener('click',event=>{const btn=event.target.closest('[data-sea-vibe-employee-edit]');if(!btn)return;openEmployee((state.reference.employees||[]).find(row=>String(row.id)===String(btn.dataset.seaVibeEmployeeEdit)));});
    $('seaVibeEmployeeClose')?.addEventListener('click',()=> $('seaVibeEmployeeDialog')?.close());$('seaVibeEmployeeCancel')?.addEventListener('click',()=> $('seaVibeEmployeeDialog')?.close());
    $('seaVibeEmployeeForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const record={id:$('seaVibeEmployeeId').value||null,fullName:$('seaVibeEmployeeName').value.trim(),userId:$('seaVibeEmployeeUser').value||null,baseSalary:Number($('seaVibeEmployeeBase').value||0),allowances:Number($('seaVibeEmployeeAllowances').value||0),paymentMethod:$('seaVibeEmployeePaymentMethod').value.trim(),isActive:$('seaVibeEmployeeActive').checked,notes:$('seaVibeEmployeeNotes').value.trim()};
      try{setStatus('seaVibePayrollReferenceStatus',t('seaVibePayroll.common.saving','جاري الحفظ...'));state.reference=await svc().saveEmployee(record);$('seaVibeEmployeeDialog')?.close();renderReference();setStatus('seaVibePayrollReferenceStatus',t('seaVibePayroll.employee.saved','تم حفظ موظف SEA VIBE بنجاح.'),'success');}
      catch(error){setStatus('seaVibePayrollReferenceStatus',error.message||String(error),'error');}
    });

    window.addEventListener('sea-vibe-payroll-data-updated',event=>{
      const cache=svc()?.getCache?.()||{};
      if(event.detail?.kind==='management'&&!$('seaVibePayrollManagementView')?.classList.contains('hidden')&&cache.management){state.management=cache.management;renderManagement();}
      if(event.detail?.kind==='salary'&&!$('seaVibeSalaryStatementView')?.classList.contains('hidden')&&cache.salary){state.salary=cache.salary;renderSalaryStatement();}
      if(event.detail?.kind==='commissions'&&!$('seaVibeCommissionManagementView')?.classList.contains('hidden')&&cache.commissions){state.commissions=cache.commissions;renderCommissions();}
      if(event.detail?.kind==='commissionStatement'&&!$('seaVibeCommissionStatementView')?.classList.contains('hidden')&&cache.commissionStatement){state.commissionStatement=cache.commissionStatement;renderCommissionStatement();}
      if(event.detail?.kind==='reference'&&!$('seaVibePayrollReferenceView')?.classList.contains('hidden')&&cache.reference){state.reference=cache.reference;renderReference();}
    });
    window.addEventListener('petatoe-language-changed',()=>{if(state.management)renderManagement();if(state.salary)renderSalaryStatement();if(state.commissions)renderCommissions();if(state.commissionStatement)renderCommissionStatement();if(state.reference)renderReference();});
  }

  document.addEventListener('DOMContentLoaded',bind);
  window.SeaVibePayrollUI=Object.freeze({activate,refreshManagement:()=>loadManagement(true,false),refreshSalary:()=>loadSalaryStatement(true),refreshCommissions:()=>loadCommissions(true,false),refreshCommissionStatement:()=>loadCommissionStatement(true),refreshReference:()=>loadReference(true)});
})();
