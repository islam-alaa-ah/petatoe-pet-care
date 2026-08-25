(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const svc=()=>window.PayrollService;
  const t=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const lang=()=>window.PetatoeLocalization?.effectiveLanguage?.()==='en'?'en':'ar';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=value=>new Intl.NumberFormat(lang()==='en'?'en-SA':'ar-SA-u-nu-latn',{style:'currency',currency:'SAR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
  const number=value=>new Intl.NumberFormat(lang()==='en'?'en-US':'ar-SA-u-nu-latn',{maximumFractionDigits:2}).format(Number(value||0));
  const monthLabel=value=>{if(!value)return '—';const d=new Date(`${String(value).slice(0,7)}-01T12:00:00`);return new Intl.DateTimeFormat(lang()==='en'?'en-US':'ar-SA-u-ca-gregory-nu-latn',{month:'long',year:'numeric'}).format(d);};
  const dateTime=value=>value?new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
  const dateLabel=value=>value?new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`)):'—';
  const addDays=(value,days)=>{const d=new Date(`${String(value).slice(0,10)}T12:00:00`);d.setDate(d.getDate()+Number(days||0));return d.toISOString().slice(0,10);};
  const currentMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
  const monthBounds=value=>{const raw=/^\d{4}-\d{2}$/.test(String(value||''))?String(value):currentMonth();const [year,month]=raw.split('-').map(Number);return{from:`${raw}-01`,to:`${raw}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}`};};
  const roleOrder={representative:1,driver:2,groomer:3};
  const state={management:null,managementTab:'current',salary:null,salaryTab:'current',commissions:null,commissionStatement:null,commissionTab:'current',reference:null,referenceType:'employees'};

  function setStatus(id,message='',type='info'){
    const el=$(id);if(!el)return;el.textContent=message||'';el.classList.toggle('hidden',!message);el.classList.toggle('error',type==='error');el.classList.toggle('success',type==='success');
  }
  function statusLabel(status){return ({
    draft:t('payroll.status.draft','قيد التجهيز'),pending_chairman:t('payroll.status.pendingChairman','بانتظار رئيس مجلس الإدارة'),pending_employee:t('payroll.status.pendingEmployee','بانتظار الموظف'),ready_for_payment:t('payroll.status.ready','جاهز للصرف'),paid:t('payroll.status.paid','تم الصرف')
  })[status]||status||'—';}
  function roleLabel(role){return ({representative:t('commission.role.representative','المندوب'),driver:t('commission.role.driver','السائق'),groomer:t('commission.role.groomer','الجرومر')})[role]||role||'—';}
  function statusBadge(status){return `<span class="payroll-status ${esc(status)}">${esc(statusLabel(status))}</span>`;}
  function roleBadge(role){return `<span class="commission-role ${esc(role)}">${esc(roleLabel(role))}</span>`;}
  function paymentMethodLabel(value){
    const raw=String(value||'').trim();
    if(!raw)return '—';
    const normalized=raw.toLowerCase();
    if(['تحويل بنكي','bank transfer'].includes(raw)||['bank transfer'].includes(normalized))return t('payroll.paymentMethod.bankTransfer','Bank transfer');
    if(['نقدي','cash'].includes(raw)||normalized==='cash')return t('payroll.paymentMethod.cash','Cash');
    if(['مدد','mudad'].includes(raw)||normalized==='mudad')return t('payroll.paymentMethod.mudad','mudad');
    if(['شيك','cheque','check'].includes(raw)||['cheque','check'].includes(normalized))return t('payroll.paymentMethod.cheque','Cheque');
    return raw;
  }
  function renderPayrollMonthDisplay(){
    const el=$('payrollManagementMonthDisplay');if(!el)return;
    const value=$('payrollManagementMonth')?.value||state.management?.month||currentMonth();
    el.textContent=monthLabel(value);
  }
  function can(screen,action){return Boolean(window.PermissionEngine?.can?.(screen,action)??window.CustomerPermissions?.canScreen?.(screen,action));}
  function tierLabel(tierNo){
    const n=Number(tierNo||0);
    return ({
      1:t('commission.tierFirst','الشريحة الأولى'),
      2:t('commission.tierSecond','الشريحة الثانية'),
      3:t('commission.tierThird','الشريحة الثالثة')
    })[n]||`${t('commission.tier','الشريحة')} ${number(n)}`;
  }

  function updateStatic(){window.PetatoeLocalization?.applyStatic?.(document);}

  function commissionRange(reset=false){
    const month=$('commissionManagementMonth')?.value||currentMonth();
    const bounds=monthBounds(month),fromInput=$('commissionManagementFrom'),toInput=$('commissionManagementTo');
    if(fromInput&&(reset||!fromInput.value))fromInput.value=bounds.from;
    if(toInput&&(reset||!toInput.value))toInput.value=bounds.to;
    const range={month,from:fromInput?.value||bounds.from,to:toInput?.value||bounds.to,bounds};
    const fullMonth=range.from===bounds.from&&range.to===bounds.to;
    const recalc=$('commissionRecalculate');
    if(recalc){recalc.disabled=!fullMonth;recalc.title=fullMonth?'':t('commission.recalculate.fullMonthOnly','إعادة احتساب العمولات وربطها بالرواتب متاحة عند اختيار الشهر كاملًا فقط.');}
    return range;
  }
  function validCommissionRange(range,showError=true){
    let message='';
    if(!range?.from||!range?.to||range.from>range.to)message=t('commission.range.invalid','يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.');
    if(message&&showError)setStatus('commissionManagementStatus',message,'error');
    return !message;
  }
  function isFullCommissionMonth(range){return Boolean(range&&range.from===range.bounds.from&&range.to===range.bounds.to);}

  function payrollCommissionPeriod(reset=false){
    const month=$('payrollManagementMonth')?.value||currentMonth();
    const bounds=monthBounds(month),saved=state.management?.commissionPeriod||{},previous=state.management?.previousCommissionPeriod||null;
    const fromInput=$('payrollCommissionFrom'),toInput=$('payrollCommissionTo');
    const suggestedFrom=previous?.toDate?addDays(previous.toDate,1):bounds.from;
    const preferredFrom=saved?.fromDate||suggestedFrom||bounds.from;
    const preferredTo=saved?.toDate||bounds.to;
    if(fromInput&&(reset||!fromInput.value))fromInput.value=preferredFrom;
    if(toInput&&(reset||!toInput.value))toInput.value=preferredTo;
    const locked=Boolean(saved?.locked);
    if(fromInput)fromInput.disabled=locked;
    if(toInput)toInput.disabled=locked;
    const range={month,from:fromInput?.value||preferredFrom,to:toInput?.value||preferredTo,bounds,previous,saved,locked,suggestedFrom};
    renderPayrollCommissionPeriodInfo(range);
    return range;
  }
  function payrollCommissionPeriodWarnings(range){
    const warnings=[];
    if(!range?.previous?.toDate)return warnings;
    const previousTo=String(range.previous.toDate).slice(0,10),next=addDays(previousTo,1);
    if(range.from&&range.from<=previousTo){warnings.push(t('payroll.commissionPeriod.overlap','تنبيه: الفترة المختارة تتداخل مع عمولات سبق احتسابها حتى {date}.',{date:dateLabel(previousTo)}));}
    else if(range.from&&range.from>next){warnings.push(t('payroll.commissionPeriod.gap','تنبيه: توجد أيام غير محتسبة من {from} إلى {to}.',{from:dateLabel(next),to:dateLabel(addDays(range.from,-1))}));}
    return warnings;
  }
  function renderPayrollCommissionPeriodInfo(range){
    const el=$('payrollCommissionPeriodInfo');if(!el)return;
    const lines=[];
    if(range?.previous?.toDate){
      lines.push(`<span>${esc(t('payroll.commissionPeriod.previous','آخر فترة محتسبة في راتب {month}: من {from} إلى {to}.',{month:monthLabel(range.previous.payrollMonth),from:dateLabel(range.previous.fromDate),to:dateLabel(range.previous.toDate)}))}</span>`);
      lines.push(`<span class="suggested">${esc(t('payroll.commissionPeriod.suggested','بداية الفترة التالية المقترحة: {date}.',{date:dateLabel(range.suggestedFrom)}))}</span>`);
    }else lines.push(`<span class="no-previous">${esc(t('payroll.commissionPeriod.noPrevious','لا توجد فترة عمولات سابقة.'))}</span>`);
    payrollCommissionPeriodWarnings(range).forEach(message=>lines.push(`<span class="warning">${esc(message)}</span>`));
    if(range?.locked)lines.push(`<span class="locked">${esc(t('payroll.commissionPeriod.locked','تم تثبيت فترة العمولات لأن بعض رواتب الشهر خرجت من مرحلة التجهيز.'))}</span>`);
    el.innerHTML=lines.join('');
  }
  function validPayrollCommissionPeriod(range,showError=true){
    let message='';
    if(!range?.from||!range?.to||range.from>range.to)message=t('payroll.commissionPeriod.invalid','يجب أن يكون تاريخ بداية عمولات الراتب قبل أو مساويًا لتاريخ النهاية.');
    else if(range.to>range.bounds.to)message=t('payroll.commissionPeriod.endAfterMonth','لا يمكن أن تنتهي فترة عمولات الراتب بعد نهاية شهر الراتب.');
    if(message&&showError)setStatus('payrollManagementStatus',message,'error');
    return !message;
  }

  // -----------------------------------------------------------------------
  // Payroll management
  // -----------------------------------------------------------------------
  async function loadManagement(forceStatus=true,resetPeriod=false){
    const month=$('payrollManagementMonth')?.value||currentMonth();
    if(forceStatus)setStatus('payrollManagementStatus',t('payroll.loading','جاري تحميل الرواتب...'));
    try{
      state.management=await svc().loadManagement(month);
      setStatus('payrollManagementStatus','');payrollCommissionPeriod(resetPeriod);renderManagement();
    }catch(error){setStatus('payrollManagementStatus',error.message,'error');renderManagementEmpty();}
  }
  function renderManagementEmpty(){if($('payrollManagementBody'))$('payrollManagementBody').innerHTML=`<tr><td colspan="10" class="payroll-empty">${esc(t('payroll.empty','لا توجد بيانات.'))}</td></tr>`;}
  function managementRows(){
    const rows=[...(state.management?.rows||[])];
    const search=String($('payrollManagementSearch')?.value||'').trim().toLowerCase();
    const payment=$('payrollPaymentFilter')?.value||'';const status=$('payrollStatusFilter')?.value||'';
    return rows.filter(row=>{
      const tabOk=state.managementTab==='reports'?row.status==='paid':row.status!=='paid';
      const searchOk=!search||String(row.employeeName||'').toLowerCase().includes(search);
      return tabOk&&searchOk&&(!payment||row.paymentMethod===payment)&&(!status||row.status===status);
    });
  }
  function syncPaymentFilter(){
    const select=$('payrollPaymentFilter');if(!select)return;const current=select.value;
    const methods=[...new Set((state.management?.rows||[]).map(x=>String(x.paymentMethod||'').trim()).filter(Boolean))].sort();
    select.innerHTML=`<option value="">${esc(t('payroll.common.all','الكل'))}</option>`+methods.map(x=>`<option value="${esc(x)}">${esc(paymentMethodLabel(x))}</option>`).join('');
    if(methods.includes(current))select.value=current;
  }
  function renderManagement(){
    const summary=state.management?.summary||{};
    renderPayrollMonthDisplay();payrollCommissionPeriod(false);
    $('payrollKpiEmployees').textContent=number(summary.employees);$('payrollKpiBase').textContent=money(summary.baseSalary);$('payrollKpiAllowances').textContent=money(summary.allowances);$('payrollKpiCommissions').textContent=money(summary.commissions);$('payrollKpiDeductions').textContent=money(summary.deductions);$('payrollKpiNet').textContent=money(summary.netSalary);
    syncPaymentFilter();
    $('payrollManagementTabs')?.querySelectorAll('[data-payroll-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.payrollTab===state.managementTab));
    const rows=managementRows();
    $('payrollManagementBody').innerHTML=rows.length?rows.map(renderSalaryRow).join(''):`<tr><td colspan="10" class="payroll-empty">${esc(state.managementTab==='reports'?t('payroll.reports.empty','لا توجد رواتب مصروفة في هذا الشهر.'):t('payroll.current.empty','لا توجد رواتب جارية ضمن الفلاتر الحالية.'))}</td></tr>`;
    renderManagementTotals(rows);
    window.CustomerPermissions?.applyActionVisibility?.($('payrollManagementView'));
  }
  function renderSalaryRow(row){
    return `<tr data-salary-id="${esc(row.id)}"><td data-label="${esc(t('payroll.col.employee','الموظف'))}"><strong>${esc(row.employeeName)}</strong></td><td data-label="${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}">${esc(paymentMethodLabel(row.paymentMethod))}</td><td data-label="${esc(t('payroll.col.base','الأساسي'))}" class="money">${money(row.baseSalary)}</td><td data-label="${esc(t('payroll.col.allowances','البدلات'))}" class="money">${money(row.allowances)}</td><td data-label="${esc(t('payroll.col.commissions','العمولات'))}" class="money">${money(row.commissions)}</td><td data-label="${esc(t('payroll.col.overtime','الإضافي'))}" class="money">${money(row.overtime)}</td><td data-label="${esc(t('payroll.col.deductions','الخصومات'))}" class="money">${money(row.deductions)}</td><td data-label="${esc(t('payroll.col.net','الصافي'))}" class="money net">${money(row.netSalary)}</td><td data-label="${esc(t('payroll.common.status','الحالة'))}">${statusBadge(row.status)}</td><td data-label="${esc(t('payroll.common.actions','الإجراءات'))}"><div class="payroll-row-actions">${salaryActions(row)}</div></td></tr>`;
  }
  function renderManagementTotals(rows){
    const el=$('payrollManagementTotals');if(!el)return;
    const totals=(rows||[]).reduce((sum,row)=>({
      base:sum.base+Number(row.baseSalary||0),allowances:sum.allowances+Number(row.allowances||0),commissions:sum.commissions+Number(row.commissions||0),
      overtime:sum.overtime+Number(row.overtime||0),deductions:sum.deductions+Number(row.deductions||0),net:sum.net+Number(row.netSalary||0)
    }),{base:0,allowances:0,commissions:0,overtime:0,deductions:0,net:0});
    const totalLabel=t('payroll.table.total','الإجمالي');
    el.innerHTML=`<tr class="payroll-totals-row"><th data-label="${esc(totalLabel)}"><strong>${esc(totalLabel)} (${number((rows||[]).length)})</strong></th><th data-label="${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}">—</th><th data-label="${esc(t('payroll.col.base','الأساسي'))}">${money(totals.base)}</th><th data-label="${esc(t('payroll.col.allowances','البدلات'))}">${money(totals.allowances)}</th><th data-label="${esc(t('payroll.col.commissions','العمولات'))}">${money(totals.commissions)}</th><th data-label="${esc(t('payroll.col.overtime','الإضافي'))}">${money(totals.overtime)}</th><th data-label="${esc(t('payroll.col.deductions','الخصومات'))}">${money(totals.deductions)}</th><th data-label="${esc(t('payroll.col.net','الصافي'))}" class="net">${money(totals.net)}</th><th data-label="${esc(t('payroll.common.status','الحالة'))}">—</th><th data-label="${esc(t('payroll.common.actions','الإجراءات'))}">—</th></tr>`;
  }
  function actionButton(action,label,cls='payroll-action-primary',permission='edit'){return `<button type="button" class="${cls}" data-salary-action="${action}" data-permission-screen="payrollManagement" data-permission-action="${permission}">${esc(label)}</button>`;}
  function salaryActions(row){
    if(row.status==='draft')return actionButton('adjust',t('payroll.action.adjust','تعديل'),'payroll-action-neutral','add')+actionButton('submit',t('payroll.action.submit','إرسال للاعتماد'),'payroll-action-primary','add');
    if(row.status==='pending_chairman')return actionButton('chairman_approve',t('payroll.action.chairmanApprove','اعتماد رئيس مجلس الإدارة'),'payroll-action-success','edit')+actionButton('reverse_submit',t('payroll.action.reverseSubmit','إرجاع للتجهيز'),'payroll-action-danger','delete');
    if(row.status==='pending_employee')return actionButton('reverse_chairman',t('payroll.action.reverseChairman','إلغاء اعتماد رئيس مجلس الإدارة'),'payroll-action-danger','delete');
    if(row.status==='ready_for_payment')return actionButton('mark_paid',t('payroll.action.markPaid','تم الصرف'),'payroll-action-success','edit')+actionButton('reverse_employee',t('payroll.action.reverseEmployee','إلغاء موافقة الموظف'),'payroll-action-danger','delete');
    if(row.status==='paid')return actionButton('reverse_paid',t('payroll.action.reversePaid','إلغاء الصرف'),'payroll-action-danger','delete');
    return '';
  }
  function adjustmentItemRow(type,item={}){
    const typeLabel=type==='addition'?t('payroll.adjustment.additions','بنود الإضافي'):t('payroll.adjustment.deductions','بنود الخصومات');
    return `<div class="salary-adjustment-item" data-adjustment-type="${esc(type)}"><div class="salary-adjustment-item-grid"><label><span>${esc(t('payroll.adjustment.itemName','البيان'))}</span><input class="salary-adjustment-item-name" maxlength="200" required value="${esc(item.name||'')}" placeholder="${esc(typeLabel)}"></label><label><span>${esc(t('payroll.adjustment.itemAmount','القيمة'))}</span><input class="salary-adjustment-item-amount" type="number" min="0.01" step="0.01" required value="${item.amount?esc(Number(item.amount).toFixed(2)):''}"></label><label class="salary-adjustment-item-notes"><span>${esc(t('payroll.adjustment.itemNotes','ملاحظات البند'))}</span><input class="salary-adjustment-item-note" maxlength="500" value="${esc(item.notes||'')}"></label><button class="salary-adjustment-remove" type="button" data-adjustment-remove aria-label="${esc(t('payroll.adjustment.remove','حذف البند'))}">×</button></div></div>`;
  }
  function adjustmentItemsFor(row,type){
    const items=(row?.adjustmentItems||[]).filter(item=>item.type===type);
    if(items.length)return items;
    const legacy=type==='addition'?Number(row?.overtime||0):Number(row?.deductions||0);
    return legacy>0?[{type,name:type==='addition'?t('payroll.col.overtime','الإضافي'):t('payroll.col.deductions','الخصومات'),amount:legacy,notes:''}]:[];
  }
  function renderAdjustmentEditor(row){
    $('payrollAdditionItems').innerHTML=adjustmentItemsFor(row,'addition').map(item=>adjustmentItemRow('addition',item)).join('');
    $('payrollDeductionItems').innerHTML=adjustmentItemsFor(row,'deduction').map(item=>adjustmentItemRow('deduction',item)).join('');
    updateAdjustmentTotals();
  }
  function addAdjustmentItem(type,item={}){
    const target=type==='addition'?$('payrollAdditionItems'):$('payrollDeductionItems');if(!target)return;
    target.insertAdjacentHTML('beforeend',adjustmentItemRow(type,item));
    target.querySelector('.salary-adjustment-item:last-child .salary-adjustment-item-name')?.focus();
    updateAdjustmentTotals();
  }
  function collectAdjustmentItems(){
    return [...document.querySelectorAll('#payrollAdjustmentDialog .salary-adjustment-item')].map((row,index)=>({
      type:row.dataset.adjustmentType,
      name:row.querySelector('.salary-adjustment-item-name')?.value.trim()||'',
      amount:Number(row.querySelector('.salary-adjustment-item-amount')?.value||0),
      notes:row.querySelector('.salary-adjustment-item-note')?.value.trim()||'',
      sortOrder:index+1
    })).filter(item=>item.name||item.amount||item.notes);
  }
  function updateAdjustmentTotals(){
    const items=collectAdjustmentItems();
    const additions=items.filter(x=>x.type==='addition').reduce((sum,x)=>sum+Number(x.amount||0),0);
    const deductions=items.filter(x=>x.type==='deduction').reduce((sum,x)=>sum+Number(x.amount||0),0);
    if($('payrollAdjustmentAdditionTotal'))$('payrollAdjustmentAdditionTotal').textContent=money(additions);
    if($('payrollAdjustmentDeductionTotal'))$('payrollAdjustmentDeductionTotal').textContent=money(deductions);
  }
  function openAdjustment(row){
    $('payrollAdjustmentId').value=row.id;$('payrollAdjustmentEmployee').textContent=`${row.employeeName} — ${monthLabel(state.management?.month)}`;$('payrollAdjustmentNotes').value=row.notes||'';renderAdjustmentEditor(row);updateStatic();$('payrollAdjustmentDialog')?.showModal();
  }
  async function handleSalaryAction(id,action){
    const row=(state.management?.rows||[]).find(x=>x.id===id);if(!row)return;
    if(action==='adjust'){openAdjustment(row);return;}
    const reverse=action.startsWith('reverse_');
    const confirmation=reverse?t('payroll.confirm.reverse','سيتم إلغاء المرحلة الحالية والرجوع خطوة واحدة فقط حسب التسلسل العكسي. هل تريد المتابعة؟'):t('payroll.confirm.transition','هل تريد تنفيذ هذا الإجراء؟');
    if(!window.confirm(confirmation))return;
    let reference='';if(action==='mark_paid')reference=window.prompt(t('payroll.payment.referencePrompt','مرجع الصرف (اختياري):'),'')||'';
    setStatus('payrollManagementStatus',t('payroll.saving','جاري حفظ التغيير...'));
    try{await svc().transition(id,action,reference);await loadManagement(false);setStatus('payrollManagementStatus',t('payroll.saved','تم تحديث حالة الراتب بنجاح.'),'success');}
    catch(error){setStatus('payrollManagementStatus',error.message,'error');}
  }

  // -----------------------------------------------------------------------
  // Salary self-service
  // -----------------------------------------------------------------------
  async function loadSalaryStatement(){setStatus('salaryStatementStatus',t('payroll.loading','جاري التحميل...'));try{state.salary=await svc().loadSalaryStatement();setStatus('salaryStatementStatus','');renderSalaryStatement();}catch(error){setStatus('salaryStatementStatus',error.message,'error');}}
  function salaryAdjustmentList(items,type,compact=false){
    const rows=(items||[]).filter(item=>item.type===type);
    if(!rows.length)return compact?'—':'';
    return `<div class="${compact?'salary-adjustment-mini':'salary-adjustment-detail-list'}">${rows.map(item=>`<div class="salary-adjustment-detail-row"><span>${esc(item.name||'—')}${item.notes?`<small>${esc(item.notes)}</small>`:''}</span><strong>${money(item.amount)}</strong></div>`).join('')}</div>`;
  }
  function salaryCommissionPeriodNote(statement){
    if(!statement?.commissionFrom||!statement?.commissionTo)return '';
    return `<div class="salary-commission-period-note">${esc(t('payroll.commissionPeriod.statementNote','تم احتساب العمولات عن الفترة من {from} إلى {to}.',{from:dateLabel(statement.commissionFrom),to:dateLabel(statement.commissionTo)}))}</div>`;
  }
  function salaryAdjustmentDetails(statement){
    const items=statement?.adjustmentItems||[];
    if(!items.length)return '';
    return `<div class="salary-adjustment-details"><h4>${esc(t('salaryStatement.adjustmentDetails','تفاصيل الإضافات والخصومات'))}</h4><div class="salary-adjustment-details-grid"><section><strong>${esc(t('payroll.adjustment.additions','بنود الإضافي'))}</strong>${salaryAdjustmentList(items,'addition')}</section><section><strong>${esc(t('payroll.adjustment.deductions','بنود الخصومات'))}</strong>${salaryAdjustmentList(items,'deduction')}</section></div></div>`;
  }
  function renderSalaryStatement(){
    const current=state.salary?.current, employee=state.salary?.employee;
    $('salaryStatementTabs')?.querySelectorAll('[data-salary-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.salaryTab===state.salaryTab));
    $('salaryStatementCurrent')?.classList.toggle('hidden',state.salaryTab!=='current');$('salaryStatementHistory')?.classList.toggle('hidden',state.salaryTab!=='history');
    if(!employee){$('salaryStatementCurrent').innerHTML=`<div class="panel payroll-empty">${esc(t('salaryStatement.unlinked','حسابك غير مربوط بسجل موظف في البيانات المرجعية.'))}</div>`;$('salaryStatementHistory').innerHTML='';return;}
    if(!current){$('salaryStatementCurrent').innerHTML=`<div class="panel payroll-empty">${esc(t('salaryStatement.noCurrent','لا يوجد كشف راتب حالي متاح بعد اعتماد رئيس مجلس الإدارة.'))}</div>`;}
    else{
      const steps=[['pending_chairman',t('payroll.flow.chairman','اعتماد رئيس مجلس الإدارة')],['pending_employee',t('payroll.flow.employee','موافقة الموظف')],['ready_for_payment',t('payroll.flow.ready','جاهز للصرف')],['paid',t('payroll.flow.paid','تم الصرف')]];
      const rank={pending_chairman:0,pending_employee:1,ready_for_payment:2,paid:3};const activeRank=rank[current.status]??0;
      $('salaryStatementCurrent').innerHTML=`<div class="payroll-statement-shell"><div class="payroll-statement-hero"><article class="panel payroll-statement-card"><div class="panel-header"><div><strong>${esc(employee.name)}</strong><div class="payroll-form-hint">${esc(monthLabel(current.payrollMonth))} · ${esc(paymentMethodLabel(current.paymentMethod))}</div></div>${statusBadge(current.status)}</div>${salaryCommissionPeriodNote(current)}<div class="payroll-statement-main"><div class="payroll-value"><span>${esc(t('payroll.col.base','الأساسي'))}</span><strong>${money(current.baseSalary)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.allowances','البدلات'))}</span><strong>${money(current.allowances)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.commissions','العمولات'))}</span><strong>${money(current.commissions)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.overtime','الإضافي'))}</span><strong>${money(current.overtime)}</strong></div><div class="payroll-value"><span>${esc(t('payroll.col.deductions','الخصومات'))}</span><strong>${money(current.deductions)}</strong></div><div class="payroll-value net"><span>${esc(t('payroll.col.net','صافي الراتب'))}</span><strong>${money(current.netSalary)}</strong></div></div>${salaryAdjustmentDetails(current)}${current.status==='pending_employee'?`<div class="payroll-current-actions"><button id="salaryEmployeeApprove" class="primary-btn" type="button">${esc(t('salaryStatement.approve','أوافق على كشف الراتب'))}</button></div>`:''}</article><article class="panel"><h3>${esc(t('payroll.flow.title','مسار الاعتماد'))}</h3><div class="payroll-flow">${steps.map((step,i)=>`<div class="payroll-flow-step ${i<activeRank?'done':i===activeRank?'active':''}"><span class="payroll-flow-dot">${i<activeRank?'✓':i+1}</span><div class="payroll-flow-copy"><strong>${esc(step[1])}</strong><small>${i===1&&current.employeeApprovedAt?dateTime(current.employeeApprovedAt):i===0&&current.chairmanApprovedAt?dateTime(current.chairmanApprovedAt):''}</small></div></div>`).join('')}</div></article></div></div>`;
      $('salaryEmployeeApprove')?.addEventListener('click',async()=>{if(!confirm(t('salaryStatement.approveConfirm','أؤكد موافقتي على كشف الراتب الموضح. هل تريد المتابعة؟')))return;setStatus('salaryStatementStatus',t('payroll.saving','جاري حفظ الموافقة...'));try{await svc().transition(current.id,'employee_approve');await loadSalaryStatement();setStatus('salaryStatementStatus',t('salaryStatement.approved','تم اعتماد كشف الراتب وأصبح جاهزًا للصرف.'),'success');}catch(error){setStatus('salaryStatementStatus',error.message,'error');}});
    }
    const history=state.salary?.history||[];
    $('salaryStatementHistory').innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.common.month','الشهر'))}</th><th>${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}</th><th>${esc(t('payroll.commissionPeriod.title','فترة احتساب عمولات الراتب'))}</th><th>${esc(t('payroll.col.base','الأساسي'))}</th><th>${esc(t('payroll.col.allowances','البدلات'))}</th><th>${esc(t('payroll.col.commissions','العمولات'))}</th><th>${esc(t('payroll.col.overtime','الإضافي'))}</th><th>${esc(t('payroll.col.deductions','الخصومات'))}</th><th>${esc(t('payroll.col.net','الصافي'))}</th><th>${esc(t('payroll.status.paid','تم الصرف'))}</th></tr></thead><tbody>${history.length?history.map(x=>`<tr><td data-label="${esc(t('payroll.common.month','الشهر'))}">${esc(monthLabel(x.payrollMonth))}</td><td data-label="${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}">${esc(paymentMethodLabel(x.paymentMethod))}</td><td data-label="${esc(t('payroll.commissionPeriod.title','فترة احتساب عمولات الراتب'))}">${x.commissionFrom&&x.commissionTo?`${esc(dateLabel(x.commissionFrom))}<br>→ ${esc(dateLabel(x.commissionTo))}`:'—'}</td><td data-label="${esc(t('payroll.col.base','الأساسي'))}">${money(x.baseSalary)}</td><td data-label="${esc(t('payroll.col.allowances','البدلات'))}">${money(x.allowances)}</td><td data-label="${esc(t('payroll.col.commissions','العمولات'))}">${money(x.commissions)}</td><td data-label="${esc(t('payroll.col.overtime','الإضافي'))}">${money(x.overtime)}${salaryAdjustmentList(x.adjustmentItems,'addition',true)}</td><td data-label="${esc(t('payroll.col.deductions','الخصومات'))}">${money(x.deductions)}${salaryAdjustmentList(x.adjustmentItems,'deduction',true)}</td><td data-label="${esc(t('payroll.col.net','الصافي'))}" class="net">${money(x.netSalary)}</td><td data-label="${esc(t('payroll.status.paid','تم الصرف'))}">${dateTime(x.paidAt)}</td></tr>`).join(''):`<tr><td colspan="10" class="payroll-empty">${esc(t('salaryStatement.noHistory','لا توجد رواتب سابقة مصروفة.'))}</td></tr>`}</tbody></table></div>`;
  }

  // -----------------------------------------------------------------------
  // Commission management
  // -----------------------------------------------------------------------
  async function loadCommissions(options={}){const range=commissionRange(Boolean(options?.resetRange));if(!validCommissionRange(range))return;setStatus('commissionManagementStatus',t('commission.loading','جاري تحميل العمولات...'));try{state.commissions=await svc().loadCommissionsRange(range.from,range.to);setStatus('commissionManagementStatus','');renderCommissions();}catch(error){setStatus('commissionManagementStatus',error.message,'error');$('commissionManagementBody').innerHTML=`<tr><td colspan="9" class="payroll-empty">${esc(t('payroll.empty','لا توجد بيانات.'))}</td></tr>`;}}
  function commissionEligibility(row){if(!row.linked)return'unlinked';if(!row.commissionEligible)return'not_eligible';return'eligible';}
  function filteredCommissionRows(){const rows=[...(state.commissions?.rows||[])];const search=String($('commissionSearch')?.value||'').trim().toLowerCase();const car=$('commissionCarFilter')?.value||'';const role=$('commissionRoleFilter')?.value||'';const eligibility=$('commissionEligibilityFilter')?.value||'';return rows.filter(r=>(!search||`${r.employeeName||''} ${r.carName||''} ${r.plateNumber||''}`.toLowerCase().includes(search))&&(!car||r.teamId===car)&&(!role||r.role===role)&&(!eligibility||commissionEligibility(r)===eligibility));}
  function tierReached(row){const lines=row.tierBreakdown||[];const reached=lines.filter(x=>Number(x.salesPart||0)>0);if(!row.linked)return t('commission.unlinked','غير مربوط');if(!row.commissionEligible)return t('commission.notEligible','غير مستحق');if(!reached.length)return t('commission.noTier','لا توجد شريحة');return reached.map(x=>tierLabel(x.tierNo)).join(' + ');}
  function tierRates(row){const lines=(row.tierBreakdown||[]).filter(x=>Number(x.salesPart||0)>0);if(!row.linked||!row.commissionEligible)return'0%';return lines.length?lines.map(x=>`${number(x.rate)}%${x.active?'':' ×'}`).join(' / '):'0%';}
  function syncCarFilter(){const select=$('commissionCarFilter');if(!select)return;const current=select.value;const map=new Map((state.commissions?.rows||[]).map(r=>[r.teamId,`${r.carName||r.teamName}${r.plateNumber?` — ${r.plateNumber}`:''}`]));select.innerHTML=`<option value="">${esc(t('payroll.common.all','الكل'))}</option>`+[...map.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');if(map.has(current))select.value=current;}
  function renderCommissions(){
    const all=state.commissions?.rows||[];const uniqueCars=new Set(all.map(x=>x.teamId));$('commissionKpiSales').textContent=money(state.commissions?.totalSales);$('commissionKpiTotal').textContent=money(state.commissions?.totalCommissions);$('commissionKpiCars').textContent=number(uniqueCars.size);$('commissionKpiLinked').textContent=number(new Set(all.filter(r=>r.linked&&r.commissionEligible).map(r=>r.employeeId)).size);syncCarFilter();
    const rows=filteredCommissionRows().sort((a,b)=>String(a.carName).localeCompare(String(b.carName))||(roleOrder[a.role]||9)-(roleOrder[b.role]||9)||String(a.employeeName).localeCompare(String(b.employeeName)));
    const groups=[];for(const row of rows){let g=groups.find(x=>x.teamId===row.teamId);if(!g){g={teamId:row.teamId,carName:row.carName,plateNumber:row.plateNumber,rows:[]};groups.push(g);}g.rows.push(row);}
    let index=0;const html=[];for(const g of groups){index++;const carTotal=g.rows.reduce((sum,r)=>sum+Number(r.commissionAmount||0),0);const teamSales=Math.max(0,...g.rows.map(r=>Number(r.eligibleSales||0)));g.rows.forEach((row,i)=>{const stateKey=commissionEligibility(row);html.push(`<tr class="commission-vehicle-group ${i===0?'commission-vehicle-start':''} ${i===g.rows.length-1?'commission-vehicle-end':''}" data-role="${esc(row.role)}">${i===0?`<td data-label="#" rowspan="${g.rows.length}">${index}</td><td data-label="${esc(t('commission.col.car','السيارة'))}" rowspan="${g.rows.length}"><strong>${esc(g.carName||'—')}</strong>${g.plateNumber?`<div class="payroll-form-hint">${esc(g.plateNumber)}</div>`:''}</td><td data-label="${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}" rowspan="${g.rows.length}" class="money"><strong>${money(teamSales)}</strong></td>`:''}<td data-label="${esc(t('commission.col.role','القسم'))}">${roleBadge(row.role)}</td><td data-label="${esc(t('payroll.employee.name','الموظف'))}"><strong>${esc(row.employeeName||'—')}</strong>${stateKey!=='eligible'?`<div class="${stateKey==='unlinked'?'commission-unlinked':'payroll-form-hint'}">${esc(stateKey==='unlinked'?t('commission.unlinked','غير مربوط'):t('commission.notEligible','غير مستحق'))}</div>`:''}</td><td data-label="${esc(t('commission.col.tier','الشريحة'))}">${esc(tierReached(row))}</td><td data-label="${esc(t('commission.col.rate','النسبة'))}">${esc(tierRates(row))}</td><td data-label="${esc(t('commission.col.amount','العمولة'))}" class="money"><strong>${money(row.commissionAmount)}</strong></td>${i===0?`<td data-label="${esc(t('commission.col.carTotal','إجمالي عمولات السيارة'))}" rowspan="${g.rows.length}" class="money net"><strong>${money(carTotal)}</strong></td>`:''}</tr>`);});}
    $('commissionManagementBody').innerHTML=html.length?html.join(''):`<tr><td colspan="9" class="payroll-empty">${esc(t('commission.empty','لا توجد عمولات ضمن الفلاتر الحالية.'))}</td></tr>`;
    const rep=rows.filter(x=>x.role==='representative').reduce((s,x)=>s+Number(x.commissionAmount||0),0),driver=rows.filter(x=>x.role==='driver').reduce((s,x)=>s+Number(x.commissionAmount||0),0),groomer=rows.filter(x=>x.role==='groomer').reduce((s,x)=>s+Number(x.commissionAmount||0),0),total=rep+driver+groomer;
    $('commissionManagementFoot').innerHTML=`<tr><th colspan="5">${esc(t('commission.footer.total','الإجمالي'))}</th><th colspan="1">${esc(t('commission.role.representative','المندوب'))}: ${money(rep)}</th><th>${esc(t('commission.role.driver','السائق'))}: ${money(driver)}</th><th>${esc(t('commission.role.groomer','الجرومر'))}: ${money(groomer)}</th><th>${money(total)}</th></tr>`;
  }

  // -----------------------------------------------------------------------
  // Commission self-service
  // -----------------------------------------------------------------------
  async function loadCommissionStatement(){setStatus('commissionStatementStatus',t('commission.loading','جاري تحميل العمولات...'));try{state.commissionStatement=await svc().loadCommissionStatement();setStatus('commissionStatementStatus','');renderCommissionStatement();}catch(error){setStatus('commissionStatementStatus',error.message,'error');}}
  function commissionTierStatus(line){
    const part=Number(line?.salesPart||0);
    if(!line?.active)return {key:'inactive',label:t('commissionStatement.tierInactive','غير مفعلة')};
    if(part>0)return {key:'calculated',label:t('commissionStatement.tierCalculated','محتسبة')};
    return {key:'unused',label:t('commissionStatement.tierUnused','غير مستخدمة')};
  }
  function commissionTierTableMarkup(row){
    const lines=row.tierBreakdown||[];
    if(!lines.length)return`<div class="payroll-empty">${esc(t('commission.breakdown.empty','لا توجد عمولة مستحقة من الشرائح الحالية.'))}</div>`;
    return `<div class="commission-statement-tier-wrap"><table class="commission-statement-tier-table"><thead><tr><th>${esc(t('commission.col.tier','الشريحة'))}</th><th>${esc(t('commission.tier.from','من'))}</th><th>${esc(t('commission.tier.to','إلى'))}</th><th>${esc(t('commission.col.rate','النسبة'))}</th><th>${esc(t('commissionStatement.tierPart','المبلغ الداخل في الشريحة'))}</th><th>${esc(t('commissionStatement.tierCommission','العمولة الناتجة'))}</th><th>${esc(t('commissionStatement.tierStatus','الحالة'))}</th></tr></thead><tbody>${lines.map(line=>{const status=commissionTierStatus(line);return `<tr class="${status.key==='inactive'?'is-inactive':''}"><td data-label="${esc(t('commission.col.tier','الشريحة'))}"><strong>${esc(tierLabel(line.tierNo))}</strong></td><td data-label="${esc(t('commission.tier.from','من'))}" class="money">${money(line.from)}</td><td data-label="${esc(t('commission.tier.to','إلى'))}" class="money">${line.to==null?'∞':money(line.to)}</td><td data-label="${esc(t('commission.col.rate','النسبة'))}">${number(line.rate)}%</td><td data-label="${esc(t('commissionStatement.tierPart','المبلغ الداخل في الشريحة'))}" class="money">${money(line.salesPart)}</td><td data-label="${esc(t('commissionStatement.tierCommission','العمولة الناتجة'))}" class="money net"><strong>${money(line.commission)}</strong></td><td data-label="${esc(t('commissionStatement.tierStatus','الحالة'))}"><span class="commission-tier-status ${status.key}">${esc(status.label)}</span></td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function commissionConditionsMarkup(employee,row){
    const lines=row.tierBreakdown||[];
    const used=lines.filter(line=>Number(line.salesPart||0)>0);
    const conditions=[
      {ok:Boolean(employee?.eligible),label:t('commissionStatement.condition.employeeEligible','الموظف مفعل كمستحق عمولة')},
      {ok:Boolean(row.carName),label:t('commissionStatement.condition.roleLinked','الدور مرتبط بالسيارة')},
      {ok:Number(row.eligibleSales||0)>0,label:t('commissionStatement.condition.salesAvailable','توجد مبيعات مؤهلة')},
      {ok:used.length>0&&used.every(line=>Boolean(line.active)),label:t('commissionStatement.condition.tierActive','الشريحة المستخدمة مفعلة')}
    ];
    return `<div class="commission-statement-conditions">${conditions.map(item=>`<div class="commission-condition ${item.ok?'ok':'off'}"><span class="commission-condition-dot" aria-hidden="true">${item.ok?'✓':'×'}</span><span>${esc(item.label)}</span></div>`).join('')}</div>`;
  }
  function commissionCalculationMarkup(row){
    const eligible=Number(row.eligibleSales||0),gross=Math.round(eligible*1.15*100)/100,arrow=lang()==='en'?'→':'←';
    return `<div class="commission-calculation-flow"><div class="commission-calc-step"><span>${esc(t('commissionStatement.finalInvoiceAfterDiscount','قيمة الفواتير النهائية بعد الخصم'))}</span><strong>${money(gross)}</strong></div><span class="commission-calc-arrow">÷ 1.15</span><div class="commission-calc-step"><span>${esc(t('commissionStatement.eligibleSales','إجمالي المبيعات المؤهلة'))}</span><strong>${money(eligible)}</strong></div><span class="commission-calc-arrow">${arrow}</span><div class="commission-calc-step"><span>${esc(t('commissionStatement.reachedTier','الشريحة المحققة'))}</span><strong>${esc(tierReached({...row,linked:true,commissionEligible:true}))}</strong></div><span class="commission-calc-arrow">${arrow}</span><div class="commission-calc-step"><span>${esc(t('commission.col.rate','النسبة'))}</span><strong>${esc(tierRates({...row,linked:true,commissionEligible:true}))}</strong></div><span class="commission-calc-arrow">${arrow}</span><div class="commission-calc-step highlight"><span>${esc(t('commission.kpi.total','إجمالي العمولة'))}</span><strong>${money(row.commissionAmount)}</strong></div></div>`;
  }
  function commissionVehicleStatementMarkup(employee,row){
    return `<article class="panel commission-statement-card"><div class="commission-statement-card-head"><div><strong class="commission-statement-car">${esc(row.carName||'—')}</strong><div class="payroll-form-hint">${esc(t('commission.formula','قيمة الفواتير النهائية بعد الخصم ÷ 1.15'))}</div></div><strong class="commission-statement-amount">${money(row.commissionAmount)}</strong></div><div class="commission-statement-card-grid"><section class="commission-statement-section commission-calculation"><h4>${esc(t('commissionStatement.calculationTitle','طريقة الحساب'))}</h4>${commissionCalculationMarkup(row)}</section><aside class="commission-statement-section commission-conditions"><h4>${esc(t('commissionStatement.conditionsTitle','شروط الاستحقاق'))}</h4>${commissionConditionsMarkup(employee,row)}<div class="commission-statement-note">${esc(t('commissionStatement.formulaNote','يتم احتساب العمولة من قيمة الفواتير النهائية بعد الخصم ÷ 1.15 ثم توزيع المبيعات على الشرائح المفعلة.'))}</div></aside></div><section class="commission-statement-tier-section"><h4>${esc(t('commission.breakdown.title','تفصيل الشرائح'))}</h4>${commissionTierTableMarkup(row)}</section></article>`;
  }
  function renderCommissionAdminStatement(data){
    const current=data.current||[],history=data.history||[];
    const currentRows=current.length?current.map(row=>`<tr><td data-label="${esc(t('payroll.employee.name','الموظف'))}"><strong>${esc(row.employeeName||'—')}</strong></td><td data-label="${esc(t('commission.col.role','القسم'))}">${roleBadge(row.role)}</td><td data-label="${esc(t('commission.col.car','السيارة'))}">${esc(row.carName||'—')}</td><td data-label="${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}" class="money">${money(row.eligibleSales)}</td><td data-label="${esc(t('commission.col.tier','الشريحة'))}">${esc(tierReached({...row,linked:true,commissionEligible:true}))}</td><td data-label="${esc(t('commission.col.rate','النسبة'))}">${esc(tierRates({...row,linked:true,commissionEligible:true}))}</td><td data-label="${esc(t('commission.col.amount','العمولة'))}" class="money net"><strong>${money(row.commissionAmount)}</strong></td></tr>`).join(''):`<tr><td colspan="7" class="payroll-empty">${esc(t('commissionStatement.noCurrent','لا توجد عمولة محتسبة للشهر الحالي حتى الآن.'))}</td></tr>`;
    const historyRows=history.length?history.map(row=>`<tr><td data-label="${esc(t('payroll.common.month','الشهر'))}">${esc(monthLabel(row.month))}</td><td data-label="${esc(t('payroll.employee.name','الموظف'))}"><strong>${esc(row.employeeName||'—')}</strong></td><td data-label="${esc(t('commission.col.role','القسم'))}">${roleBadge(row.role)}</td><td data-label="${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}" class="money">${money(row.eligibleSales)}</td><td data-label="${esc(t('commission.col.amount','العمولة'))}" class="money net"><strong>${money(row.commissionAmount)}</strong></td></tr>`).join(''):`<tr><td colspan="5" class="payroll-empty">${esc(t('commissionStatement.noHistory','لا توجد عمولات سابقة.'))}</td></tr>`;
    $('commissionStatementCurrent').innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.employee.name','الموظف'))}</th><th>${esc(t('commission.col.role','القسم'))}</th><th>${esc(t('commission.col.car','السيارة'))}</th><th>${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}</th><th>${esc(t('commission.col.tier','الشريحة'))}</th><th>${esc(t('commission.col.rate','النسبة'))}</th><th>${esc(t('commission.col.amount','العمولة'))}</th></tr></thead><tbody>${currentRows}</tbody></table></div>`;
    $('commissionStatementHistory').innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.common.month','الشهر'))}</th><th>${esc(t('payroll.employee.name','الموظف'))}</th><th>${esc(t('commission.col.role','القسم'))}</th><th>${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}</th><th>${esc(t('commission.col.amount','العمولة'))}</th></tr></thead><tbody>${historyRows}</tbody></table></div>`;
  }
  function renderCommissionStatement(){
    const data=state.commissionStatement||{},employee=data.employee,current=data.current||[],history=data.history||[];$('commissionStatementTabs')?.querySelectorAll('[data-commission-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.commissionTab===state.commissionTab));$('commissionStatementCurrent')?.classList.toggle('hidden',state.commissionTab!=='current');$('commissionStatementHistory')?.classList.toggle('hidden',state.commissionTab!=='history');
    if(data.mode==='admin'){renderCommissionAdminStatement(data);return;}
    if(!employee){$('commissionStatementCurrent').innerHTML=`<div class="panel payroll-empty">${esc(t('commissionStatement.unlinked','حسابك غير مربوط بسجل موظف في البيانات المرجعية.'))}</div>`;$('commissionStatementHistory').innerHTML='';return;}
    const totalSales=current.reduce((sum,row)=>sum+Number(row.eligibleSales||0),0),totalCommission=current.reduce((sum,row)=>sum+Number(row.commissionAmount||0),0);
    const vehicleSummary=current.length===1?(current[0].carName||'—'):`${number(current.length)} ${t('commissionStatement.vehicles','سيارات')}`;
    const statementStatus=employee.eligible?t('commissionStatement.statusEligible','مستحق'):t('commission.notEligible','غير مستحق');
    $('commissionStatementCurrent').innerHTML=current.length?`<div class="commission-statement-shell"><div class="commission-statement-summary"><article class="panel commission-summary-card commission-summary-total"><span>${esc(t('commission.kpi.total','إجمالي العمولة'))}</span><strong>${money(totalCommission)}</strong></article><article class="panel commission-summary-card"><span>${esc(t('commissionStatement.eligibleSales','إجمالي المبيعات المؤهلة'))}</span><strong>${money(totalSales)}</strong></article><article class="panel commission-summary-card"><span>${esc(t('commission.col.role','القسم'))}</span><strong>${esc(roleLabel(employee.role))}</strong></article><article class="panel commission-summary-card"><span>${esc(t('commission.col.car','السيارة'))}</span><strong>${esc(vehicleSummary)}</strong></article><article class="panel commission-summary-card"><span>${esc(t('payroll.common.month','الشهر'))}</span><strong>${esc(monthLabel(current[0].month))}</strong></article></div><section class="panel commission-statement-overview"><div class="commission-statement-overview-head"><div><h4>${esc(t('commissionStatement.summaryTitle','ملخص كشف العمولة'))}</h4><span class="payroll-form-hint">${esc(employee.name||'—')}</span></div><span class="commission-statement-eligibility ${employee.eligible?'eligible':'ineligible'}">${esc(statementStatus)}</span></div><div class="commission-statement-overview-grid"><div><span>${esc(t('payroll.employee.name','الموظف'))}</span><strong>${esc(employee.name||'—')}</strong></div><div><span>${esc(t('commission.col.role','القسم'))}</span><strong>${esc(roleLabel(employee.role))}</strong></div><div><span>${esc(t('payroll.common.month','الشهر'))}</span><strong>${esc(monthLabel(current[0].month))}</strong></div><div><span>${esc(t('commission.col.car','السيارة'))}</span><strong>${esc(vehicleSummary)}</strong></div><div><span>${esc(t('commissionStatement.eligibleSales','إجمالي المبيعات المؤهلة'))}</span><strong>${money(totalSales)}</strong></div><div class="net"><span>${esc(t('commission.kpi.total','إجمالي العمولة'))}</span><strong>${money(totalCommission)}</strong></div></div></section>${current.map(row=>commissionVehicleStatementMarkup(employee,row)).join('')}</div>`:`<div class="panel payroll-empty">${esc(employee.eligible?t('commissionStatement.noCurrent','لا توجد عمولة محتسبة للشهر الحالي حتى الآن.'):t('commissionStatement.notEligible','الموظف غير مفعّل كمستحق للعمولة.'))}</div>`;
    $('commissionStatementHistory').innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-history-table"><thead><tr><th>${esc(t('payroll.common.month','الشهر'))}</th><th>${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}</th><th>${esc(t('commission.col.amount','العمولة'))}</th></tr></thead><tbody>${history.length?history.map(x=>`<tr><td data-label="${esc(t('payroll.common.month','الشهر'))}">${esc(monthLabel(x.month))}</td><td data-label="${esc(t('commission.col.sales','المبيعات قبل الضريبة'))}">${money(x.eligibleSales)}</td><td data-label="${esc(t('commission.col.amount','العمولة'))}" class="net">${money(x.commissionAmount)}</td></tr>`).join(''):`<tr><td colspan="3" class="payroll-empty">${esc(t('commissionStatement.noHistory','لا توجد عمولات سابقة.'))}</td></tr>`}</tbody></table></div>`;
  }


  // -----------------------------------------------------------------------
  // Reference data
  // -----------------------------------------------------------------------
  async function loadReference(){setStatus('payrollReferenceStatus',t('payroll.loading','جاري التحميل...'));try{state.reference=await svc().loadReference();setStatus('payrollReferenceStatus','');renderReference();}catch(error){setStatus('payrollReferenceStatus',error.message,'error');}}
  function renderReference(){state.referenceType=$('payrollReferenceType')?.value||state.referenceType;$('payrollEmployeeAdd')?.classList.toggle('hidden',state.referenceType!=='employees');if(state.referenceType==='employees')renderEmployeesReference();else renderTiersReference();window.CustomerPermissions?.applyActionVisibility?.($('payrollReferenceView'));}
  function renderEmployeesReference(){const rows=state.reference?.employees||[];$('payrollReferenceContent').innerHTML=`<div class="panel payroll-table-wrap"><table class="data-table payroll-table"><thead><tr><th>${esc(t('payroll.employee.name','الموظف'))}</th><th>${esc(t('payroll.employee.user','المستخدم'))}</th><th>${esc(t('payroll.employee.baseSalary','الراتب الأساسي'))}</th><th>${esc(t('payroll.employee.allowances','البدلات'))}</th><th>${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}</th><th>${esc(t('payroll.employee.commissionRole','دور العمولة'))}</th><th>${esc(t('payroll.employee.commissionEligible','استحقاق العمولة'))}</th><th>${esc(t('payroll.common.status','الحالة'))}</th><th>${esc(t('payroll.common.actions','الإجراءات'))}</th></tr></thead><tbody>${rows.length?rows.map(row=>{const user=(state.reference.users||[]).find(x=>x.id===row.userId);return `<tr><td data-label="${esc(t('payroll.employee.name','الموظف'))}"><strong>${esc(row.fullName)}</strong></td><td data-label="${esc(t('payroll.employee.user','المستخدم'))}">${esc(user?`${user.fullName} — ${user.email}`:'—')}</td><td data-label="${esc(t('payroll.employee.baseSalary','الراتب الأساسي'))}">${money(row.baseSalary)}</td><td data-label="${esc(t('payroll.employee.allowances','البدلات'))}">${money(row.allowances)}</td><td data-label="${esc(t('payroll.employee.paymentMethod','طريقة الدفع'))}">${esc(paymentMethodLabel(row.paymentMethod))}</td><td data-label="${esc(t('payroll.employee.commissionRole','دور العمولة'))}">${row.commissionRole?roleBadge(row.commissionRole):'—'}</td><td data-label="${esc(t('payroll.employee.commissionEligible','استحقاق العمولة'))}">${row.commissionEligible?`<span class="payroll-status paid">${esc(t('commission.eligible','مستحق'))}</span>`:`<span class="payroll-status draft">${esc(t('commission.notEligible','غير مستحق'))}</span>`}</td><td data-label="${esc(t('payroll.common.status','الحالة'))}">${row.isActive?esc(t('payroll.employee.active','فعال')):esc(t('payroll.employee.inactive','غير فعال'))}</td><td data-label="${esc(t('payroll.common.actions','الإجراءات'))}"><button type="button" class="edit-btn" data-payroll-employee-edit="${esc(row.id)}" data-permission-screen="payrollReference" data-permission-action="edit">${esc(t('payroll.action.edit','تعديل'))}</button></td></tr>`;}).join(''):`<tr><td colspan="9" class="payroll-empty">${esc(t('payroll.employee.empty','لم يتم تكويد موظفين بعد.'))}</td></tr>`}</tbody></table></div>`;}
  function renderTiersReference(){const roles=['representative','driver','groomer'];$('payrollReferenceContent').innerHTML=`<div class="payroll-reference-grid">${roles.map(role=>`<article class="panel tier-card"><h4>${esc(t('commission.tiersFor','شرائح'))} ${esc(roleLabel(role))}</h4><div class="payroll-form-hint">${esc(t('commission.progressiveHint','كل شريحة تحسب على جزء المبيعات الخاص بها فقط.'))}</div>${(state.reference?.tiers||[]).filter(x=>x.role===role).sort((a,b)=>a.tierNo-b.tierNo).map(x=>tierCard(x)).join('')}</article>`).join('')}</div>`;}
  function tierCard(tier){return `<form class="tier-card-grid" data-tier-form="${esc(tier.id)}" data-role="${esc(tier.role)}" data-tier-no="${tier.tierNo}"><h5 class="full-span">${esc(tierLabel(tier.tierNo))}</h5><label><span>${esc(t('commission.tier.from','من'))}</span><input name="from" type="number" min="0" step="0.01" value="${Number(tier.fromAmount||0)}"></label><label><span>${esc(t('commission.tier.to','إلى'))}</span><input name="to" type="number" min="0" step="0.01" value="${tier.toAmount==null?'':Number(tier.toAmount)}" placeholder="∞"></label><label><span>${esc(t('commission.tier.rate','النسبة %'))}</span><input name="rate" type="number" min="0" step="0.0001" value="${Number(tier.ratePercent||0)}"></label><label class="switch-row"><span>${esc(t('commission.tier.active','تفعيل الشريحة'))}</span><span class="payroll-switch"><input name="active" type="checkbox" ${tier.isActive?'checked':''}><span>${tier.isActive?esc(t('payroll.common.active','مفعلة')):esc(t('payroll.common.inactive','غير مفعلة'))}</span></span></label><button class="primary-btn full-span" type="submit" data-permission-screen="payrollReference" data-permission-action="edit">${esc(t('common.save','حفظ'))}</button></form>`;}
  function syncEmployeeSourceFields(){const role=$('payrollEmployeeCommissionRole')?.value||'';$('payrollAppointmentEmployeeField')?.classList.toggle('hidden',!['driver','groomer'].includes(role));$('payrollRepresentativeField')?.classList.toggle('hidden',role!=='representative');if(role==='driver'||role==='groomer'){const type=role==='driver'?'سائق':'جرومر';const source=$('payrollEmployeeAppointmentSource');source.innerHTML=`<option value="">—</option>`+(state.reference?.appointmentEmployees||[]).filter(x=>x.employeeType===type).map(x=>`<option value="${esc(x.id)}">${esc(x.fullName)}</option>`).join('');}}
  function openEmployeeDialog(row=null){
    const users=state.reference?.users||[],reps=state.reference?.representatives||[];$('payrollEmployeeForm')?.reset();$('payrollEmployeeId').value=row?.id||'';$('payrollEmployeeName').value=row?.fullName||'';$('payrollEmployeeBase').value=Number(row?.baseSalary||0);$('payrollEmployeeAllowances').value=Number(row?.allowances||0);$('payrollEmployeePaymentMethod').value=row?.paymentMethod||'تحويل بنكي';$('payrollEmployeeCommissionRole').value=row?.commissionRole||'';$('payrollEmployeeEligible').checked=Boolean(row?.commissionEligible);$('payrollEmployeeActive').checked=row?.isActive!==false;$('payrollEmployeeNotes').value=row?.notes||'';
    $('payrollEmployeeUser').innerHTML=`<option value="">—</option>`+users.map(x=>`<option value="${esc(x.id)}">${esc(x.fullName)} — ${esc(x.email)}</option>`).join('');$('payrollEmployeeUser').value=row?.userId||'';$('payrollEmployeeRepresentative').innerHTML=`<option value="">—</option>`+reps.map(x=>`<option value="${esc(x.id)}">${esc(x.fullName)}</option>`).join('');$('payrollEmployeeRepresentative').value=row?.representativeId||'';syncEmployeeSourceFields();$('payrollEmployeeAppointmentSource').value=row?.appointmentEmployeeId||'';$('payrollEmployeeDialogTitle').textContent=row?t('payroll.employee.edit','تعديل الموظف'):t('payroll.employee.add','إضافة موظف');updateStatic();$('payrollEmployeeDialog')?.showModal();
  }

  // -----------------------------------------------------------------------
  // Activation and bindings
  // -----------------------------------------------------------------------
  async function activate(view){
    if(!['payrollManagement','salaryStatement','commissionManagement','commissionStatement','payrollReference'].includes(view))return;
    updateStatic();
    if(view==='payrollManagement'){if(!$('payrollManagementMonth').value)$('payrollManagementMonth').value=currentMonth();await loadManagement(true,true);}
    if(view==='salaryStatement')await loadSalaryStatement();
    if(view==='commissionManagement'){if(!$('commissionManagementMonth').value)$('commissionManagementMonth').value=currentMonth();commissionRange(true);await loadCommissions();}
    if(view==='commissionStatement')await loadCommissionStatement();
    if(view==='payrollReference')await loadReference();
  }
  function bind(){
    if(document.documentElement.dataset.payrollBound==='true')return;document.documentElement.dataset.payrollBound='true';
    $('payrollManagementMonth')?.addEventListener('change',()=>loadManagement(true,true));$('payrollManagementRefresh')?.addEventListener('click',()=>loadManagement());['payrollCommissionFrom','payrollCommissionTo'].forEach(id=>$(id)?.addEventListener('change',()=>{const range=payrollCommissionPeriod(false);validPayrollCommissionPeriod(range,false);}));$('payrollPrepareMonth')?.addEventListener('click',async()=>{const range=payrollCommissionPeriod(false);if(!validPayrollCommissionPeriod(range))return;const warnings=payrollCommissionPeriodWarnings(range);const warningText=warnings.length?`\n\n${warnings.join('\n')}`:'';if(!confirm(`${t('payroll.prepare.confirm','سيتم تجهيز أو تحديث مسودات رواتب الشهر من البيانات المرجعية وفترة العمولات المحددة. هل تريد المتابعة؟')}${warningText}`))return;setStatus('payrollManagementStatus',t('payroll.preparing','جاري تجهيز رواتب الشهر...'));try{state.management=await svc().prepareMonth($('payrollManagementMonth').value,range.from,range.to);payrollCommissionPeriod(true);renderManagement();setStatus('payrollManagementStatus',t('payroll.prepared','تم تجهيز رواتب الشهر بنجاح.'),'success');}catch(error){setStatus('payrollManagementStatus',error.message,'error');}});
    ['payrollManagementSearch','payrollPaymentFilter','payrollStatusFilter'].forEach(id=>$(id)?.addEventListener(id==='payrollManagementSearch'?'input':'change',renderManagement));$('payrollClearFilters')?.addEventListener('click',()=>{$('payrollManagementSearch').value='';$('payrollPaymentFilter').value='';$('payrollStatusFilter').value='';renderManagement();});$('payrollManagementTabs')?.addEventListener('click',e=>{const btn=e.target.closest('[data-payroll-tab]');if(!btn)return;state.managementTab=btn.dataset.payrollTab;renderManagement();});$('payrollManagementBody')?.addEventListener('click',e=>{const btn=e.target.closest('[data-salary-action]');if(!btn)return;handleSalaryAction(btn.closest('tr')?.dataset.salaryId,btn.dataset.salaryAction);});
    $('payrollAdjustmentClose')?.addEventListener('click',()=> $('payrollAdjustmentDialog')?.close());$('payrollAdjustmentCancel')?.addEventListener('click',()=> $('payrollAdjustmentDialog')?.close());$('payrollAddAdditionItem')?.addEventListener('click',()=>addAdjustmentItem('addition'));$('payrollAddDeductionItem')?.addEventListener('click',()=>addAdjustmentItem('deduction'));$('payrollAdjustmentDialog')?.addEventListener('click',e=>{const remove=e.target.closest('[data-adjustment-remove]');if(!remove)return;remove.closest('.salary-adjustment-item')?.remove();updateAdjustmentTotals();});$('payrollAdjustmentDialog')?.addEventListener('input',e=>{if(e.target.matches('.salary-adjustment-item-amount'))updateAdjustmentTotals();});$('payrollAdjustmentForm')?.addEventListener('submit',async e=>{e.preventDefault();const items=collectAdjustmentItems();if(items.some(item=>!item.name||item.amount<=0)){setStatus('payrollManagementStatus',t('payroll.adjustment.invalidItems','اكتب بيانًا وقيمة أكبر من صفر لكل بند.'),'error');return;}try{await svc().saveAdjustmentItems($('payrollAdjustmentId').value,items,$('payrollAdjustmentNotes').value);$('payrollAdjustmentDialog')?.close();await loadManagement(false);setStatus('payrollManagementStatus',t('payroll.adjustment.saved','تم حفظ بنود الإضافي والخصومات.'),'success');}catch(error){setStatus('payrollManagementStatus',error.message,'error');}});
    $('salaryStatementRefresh')?.addEventListener('click',loadSalaryStatement);$('salaryStatementTabs')?.addEventListener('click',e=>{const btn=e.target.closest('[data-salary-tab]');if(!btn)return;state.salaryTab=btn.dataset.salaryTab;renderSalaryStatement();});
    $('commissionManagementMonth')?.addEventListener('change',()=>loadCommissions({resetRange:true}));['commissionManagementFrom','commissionManagementTo'].forEach(id=>$(id)?.addEventListener('change',()=>loadCommissions()));$('commissionManagementRefresh')?.addEventListener('click',()=>loadCommissions());$('commissionRecalculate')?.addEventListener('click',async()=>{const range=commissionRange(false);if(!validCommissionRange(range))return;if(!isFullCommissionMonth(range)){setStatus('commissionManagementStatus',t('commission.recalculate.fullMonthOnly','إعادة احتساب العمولات وربطها بالرواتب متاحة عند اختيار الشهر كاملًا فقط.'),'error');return;}if(!confirm(t('commission.recalculate.confirm','سيتم إعادة احتساب عمولات الشهر من القيمة النهائية للفواتير بعد الخصم ÷ 1.15 والشرائح الحالية. هل تريد المتابعة؟')))return;setStatus('commissionManagementStatus',t('commission.recalculating','جاري إعادة احتساب العمولات...'));try{state.commissions=await svc().refreshCommissions(range.month,range.from,range.to);renderCommissions();setStatus('commissionManagementStatus',t('commission.recalculated','تم تحديث العمولات بنجاح.'),'success');}catch(error){setStatus('commissionManagementStatus',error.message,'error');}});['commissionSearch','commissionCarFilter','commissionRoleFilter','commissionEligibilityFilter'].forEach(id=>$(id)?.addEventListener(id==='commissionSearch'?'input':'change',renderCommissions));
    $('commissionStatementRefresh')?.addEventListener('click',loadCommissionStatement);$('commissionStatementTabs')?.addEventListener('click',e=>{const btn=e.target.closest('[data-commission-tab]');if(!btn)return;state.commissionTab=btn.dataset.commissionTab;renderCommissionStatement();});
    $('payrollReferenceRefresh')?.addEventListener('click',loadReference);$('payrollReferenceType')?.addEventListener('change',renderReference);$('payrollEmployeeAdd')?.addEventListener('click',()=>openEmployeeDialog());$('payrollReferenceContent')?.addEventListener('click',e=>{const btn=e.target.closest('[data-payroll-employee-edit]');if(!btn)return;openEmployeeDialog((state.reference?.employees||[]).find(x=>x.id===btn.dataset.payrollEmployeeEdit));});$('payrollReferenceContent')?.addEventListener('submit',async e=>{const form=e.target.closest('[data-tier-form]');if(!form)return;e.preventDefault();const record={role:form.dataset.role,tierNo:Number(form.dataset.tierNo),fromAmount:Number(form.elements.from.value||0),toAmount:form.elements.to.value===''?null:Number(form.elements.to.value),ratePercent:Number(form.elements.rate.value||0),isActive:form.elements.active.checked};setStatus('payrollReferenceStatus',t('payroll.saving','جاري الحفظ...'));try{state.reference=await svc().saveTier(record);renderReference();setStatus('payrollReferenceStatus',t('commission.tier.saved','تم حفظ الشريحة.'),'success');}catch(error){setStatus('payrollReferenceStatus',error.message,'error');}});
    $('payrollEmployeeCommissionRole')?.addEventListener('change',syncEmployeeSourceFields);$('payrollEmployeeClose')?.addEventListener('click',()=> $('payrollEmployeeDialog')?.close());$('payrollEmployeeCancel')?.addEventListener('click',()=> $('payrollEmployeeDialog')?.close());$('payrollEmployeeForm')?.addEventListener('submit',async e=>{e.preventDefault();const role=$('payrollEmployeeCommissionRole').value;const record={id:$('payrollEmployeeId').value||null,fullName:$('payrollEmployeeName').value.trim(),userId:$('payrollEmployeeUser').value||null,baseSalary:Number($('payrollEmployeeBase').value||0),allowances:Number($('payrollEmployeeAllowances').value||0),paymentMethod:$('payrollEmployeePaymentMethod').value.trim(),commissionRole:role||null,appointmentEmployeeId:['driver','groomer'].includes(role)?$('payrollEmployeeAppointmentSource').value||null:null,representativeId:role==='representative'?$('payrollEmployeeRepresentative').value||null:null,commissionEligible:$('payrollEmployeeEligible').checked,isActive:$('payrollEmployeeActive').checked,notes:$('payrollEmployeeNotes').value.trim()};setStatus('payrollReferenceStatus',t('payroll.saving','جاري الحفظ...'));try{state.reference=await svc().saveEmployee(record);$('payrollEmployeeDialog')?.close();renderReference();setStatus('payrollReferenceStatus',t('payroll.employee.saved','تم حفظ بيانات الموظف.'),'success');}catch(error){setStatus('payrollReferenceStatus',error.message,'error');}});
    window.addEventListener('petatoe-language-changed',()=>{updateStatic();if(state.management)renderManagement();if(state.salary)renderSalaryStatement();if(state.commissions)renderCommissions();if(state.commissionStatement)renderCommissionStatement();if(state.reference)renderReference();});
  }
  bind();
  window.PayrollUI=Object.freeze({activate,refreshManagement:loadManagement,refreshCommissions:loadCommissions,refreshReference:loadReference});
})();
