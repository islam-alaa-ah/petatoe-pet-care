(function(){
  'use strict';
  const cache = { management:null, salary:null, commissions:null, commissionStatement:null, reference:null, adjustmentCatalog:null };
  const t=(key,fallback)=>{const value=window.PetatoeLocalization?.t?.(key);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const translateMessage=message=>window.PetatoeLocalization?.translateMessage?.(message)||String(message||'');
  const db=()=>{if(!window.customerSupabase)throw new Error(t('payroll.error.databaseNotReady','خدمة قاعدة البيانات غير جاهزة.'));return window.customerSupabase;};
  const monthStart=value=>{const raw=String(value||'').slice(0,7);return /^\d{4}-\d{2}$/.test(raw)?`${raw}-01`:new Date().toISOString().slice(0,7)+'-01';};
  const isoDate=value=>{const raw=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:null;};
  async function rpc(name,args={},messageKey='payroll.error.operation',fallback='تعذر تنفيذ العملية'){
    if(navigator.onLine===false) throw new Error(t('payroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
    const {data,error}=await db().rpc(name,args);
    if(error){
      const detail=translateMessage(error.message||'');
      throw new Error(`${t(messageKey,fallback)}${detail?`: ${detail}`:''}`);
    }
    return data;
  }
  async function loadManagement(month){cache.management=await rpc('get_payroll_management_workspace',{p_month:monthStart(month)},'payroll.error.loadManagement','تعذر تحميل إدارة الرواتب');return cache.management;}
  async function prepareMonth(month,commissionFrom,commissionTo){
    const from=isoDate(commissionFrom),to=isoDate(commissionTo);
    if(!from||!to||from>to)throw new Error(t('payroll.commissionPeriod.invalid','فترة عمولات الراتب غير صالحة.'));
    await rpc('prepare_payroll_month_range',{p_month:monthStart(month),p_commission_from:from,p_commission_to:to},'payroll.error.prepareMonth','تعذر تجهيز رواتب الشهر');
    return loadManagement(month);
  }
  async function loadAdjustmentCatalog(force=false){
    if(!force&&Array.isArray(cache.adjustmentCatalog))return cache.adjustmentCatalog;
    cache.adjustmentCatalog=await rpc('get_payroll_adjustment_catalog',{},'payroll.error.loadAdjustmentCatalog','تعذر تحميل بنود الإضافات والخصومات المحفوظة');
    return cache.adjustmentCatalog;
  }
  async function saveAdjustmentItems(id,items,notes){
    await rpc('save_payroll_salary_adjustment_items',{p_statement_id:id,p_items:Array.isArray(items)?items:[],p_notes:notes||null},'payroll.error.saveAdjustments','تعذر حفظ تعديلات الراتب');
    cache.adjustmentCatalog=null;
  }
  async function saveAdjustments(id,overtime,deductions,notes){
    const items=[];
    if(Number(overtime||0)>0)items.push({type:'addition',name:t('payroll.col.overtime','الإضافي'),amount:Number(overtime),notes:''});
    if(Number(deductions||0)>0)items.push({type:'deduction',name:t('payroll.col.deductions','الخصومات'),amount:Number(deductions),notes:''});
    return saveAdjustmentItems(id,items,notes);
  }
  async function transition(id,action,reference=''){return rpc('payroll_salary_transition',{p_statement_id:id,p_action:action,p_reference:reference||null},'payroll.error.transition','تعذر تحديث حالة الراتب');}
  async function loadSalaryStatement(){cache.salary=await rpc('get_salary_statement_workspace',{},'payroll.error.loadSalaryStatement','تعذر تحميل كشف الراتب');return cache.salary;}
  async function loadCommissions(month){cache.commissions=await rpc('get_commission_management_workspace',{p_month:monthStart(month)},'payroll.error.loadCommissionManagement','تعذر تحميل إدارة العمولات');return cache.commissions;}
  async function loadCommissionsRange(fromDate,toDate){
    const from=isoDate(fromDate),to=isoDate(toDate);
    if(!from||!to)throw new Error(t('commission.range.invalid','يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.'));
    cache.commissions=await rpc('get_commission_management_workspace_range',{p_from:from,p_to:to},'payroll.error.loadCommissionManagement','تعذر تحميل إدارة العمولات');
    return cache.commissions;
  }
  async function refreshCommissions(month,fromDate=null,toDate=null){
    await rpc('refresh_payroll_commissions',{p_month:monthStart(month)},'payroll.error.refreshCommissions','تعذر إعادة احتساب العمولات');
    return fromDate&&toDate?loadCommissionsRange(fromDate,toDate):loadCommissions(month);
  }
  async function loadCommissionStatement(){cache.commissionStatement=await rpc('get_commission_statement_workspace',{},'payroll.error.loadCommissionStatement','تعذر تحميل كشف العمولة');return cache.commissionStatement;}
  async function loadReference(){cache.reference=await rpc('get_payroll_reference_workspace',{},'payroll.error.loadReference','تعذر تحميل البيانات المرجعية');return cache.reference;}
  async function saveEmployee(record){await rpc('save_payroll_employee',{p_record:record},'payroll.error.saveEmployee','تعذر حفظ الموظف');return loadReference();}
  async function saveTier(record){await rpc('save_payroll_commission_tier',{p_record:record},'payroll.error.saveTier','تعذر حفظ شريحة العمولة');return loadReference();}
  window.PayrollService=Object.freeze({monthStart,loadManagement,prepareMonth,loadAdjustmentCatalog,saveAdjustmentItems,saveAdjustments,transition,loadSalaryStatement,loadCommissions,loadCommissionsRange,refreshCommissions,loadCommissionStatement,loadReference,saveEmployee,saveTier,getCache:()=>cache});
})();
