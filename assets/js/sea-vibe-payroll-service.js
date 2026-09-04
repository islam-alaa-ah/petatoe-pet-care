(function(){
  'use strict';

  const CACHE_PREFIX='sea-vibe-payroll:v2:';
  const CACHE_TTL_MS=10*60*1000;
  const CACHE_STALE_MAX_MS=180*24*60*60*1000;
  const memory={reference:null,management:null,salary:null};
  const readStatus={};
  const activeContexts=new Map();
  const refreshes=new Map();

  const t=(key,fallback)=>{const value=window.PetatoeLocalization?.t?.(key);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const db=()=>{if(!window.customerSupabase)throw new Error(t('seaVibePayroll.error.databaseNotReady','خدمة قاعدة البيانات غير جاهزة.'));return window.customerSupabase;};
  const can=(screen,action='view')=>window.PermissionEngine?.can?.(screen,action) ?? window.CustomerPermissions?.canScreen?.(screen,action) ?? false;

  const ERROR_MAP={
    SEA_VIBE_PAYROLL_PREPARE_PERMISSION_REQUIRED:'لا توجد صلاحية تجهيز رواتب SEA VIBE.',
    SEA_VIBE_PAYROLL_COMMISSION_PERIOD_INVALID:'فترة عمولات راتب SEA VIBE غير صالحة.',
    SEA_VIBE_PAYROLL_COMMISSION_PERIOD_AFTER_MONTH_END:'لا يمكن أن تنتهي فترة عمولات الراتب بعد نهاية شهر الراتب.',
    SEA_VIBE_PAYROLL_COMMISSION_PERIOD_LOCKED:'لا يمكن تغيير فترة العمولات بعد إرسال أي راتب SEA VIBE للاعتماد.',
    SEA_VIBE_PAYROLL_ADJUST_PERMISSION_REQUIRED:'لا توجد صلاحية تعديل تجهيز رواتب SEA VIBE.',
    SEA_VIBE_PAYROLL_STATEMENT_NOT_FOUND:'كشف راتب SEA VIBE غير موجود.',
    SEA_VIBE_PAYROLL_ADJUST_DRAFT_ONLY:'يمكن تعديل الإضافات والخصومات أثناء التجهيز فقط.',
    SEA_VIBE_PAYROLL_ADJUST_ITEMS_INVALID:'بنود الإضافات والخصومات غير صالحة.',
    SEA_VIBE_PAYROLL_ADJUST_TYPE_INVALID:'نوع بند الراتب غير صالح.',
    SEA_VIBE_PAYROLL_ADJUST_NAME_REQUIRED:'يجب كتابة اسم لكل بند إضافي أو خصم.',
    SEA_VIBE_PAYROLL_ADJUST_NAME_TOO_LONG:'اسم بند الراتب أطول من الحد المسموح.',
    SEA_VIBE_PAYROLL_ADJUST_AMOUNT_INVALID:'قيمة بند الراتب يجب أن تكون أكبر من صفر.',
    SEA_VIBE_PAYROLL_SUBMIT_INVALID:'لا يمكن إرسال الراتب للاعتماد من حالته الحالية.',
    SEA_VIBE_PAYROLL_CHAIRMAN_APPROVE_INVALID:'لا يمكن اعتماد رئيس مجلس الإدارة من الحالة الحالية.',
    SEA_VIBE_PAYROLL_EMPLOYEE_APPROVE_FORBIDDEN:'لا يمكنك اعتماد كشف الراتب هذا.',
    SEA_VIBE_PAYROLL_MARK_PAID_INVALID:'الراتب غير جاهز للصرف.',
    SEA_VIBE_PAYROLL_REVERSE_PAID_INVALID:'يجب إلغاء الصرف أولًا وبالترتيب العكسي.',
    SEA_VIBE_PAYROLL_REVERSE_EMPLOYEE_INVALID:'إلغاء موافقة الموظف غير متاح من الحالة الحالية.',
    SEA_VIBE_PAYROLL_REVERSE_CHAIRMAN_READY_INVALID:'إلغاء اعتماد رئيس مجلس الإدارة غير متاح من الحالة الحالية.',
    SEA_VIBE_PAYROLL_REVERSE_CHAIRMAN_INVALID:'إلغاء اعتماد رئيس مجلس الإدارة يجب أن يتم بعد إلغاء اعتماد الموظف.',
    SEA_VIBE_PAYROLL_REVERSE_SUBMIT_INVALID:'لا يمكن إرجاع الراتب للتجهيز من الحالة الحالية.',
    SEA_VIBE_PAYROLL_ACTION_UNKNOWN:'إجراء راتب SEA VIBE غير معروف.',
    SEA_VIBE_PAYROLL_MANAGEMENT_VIEW_PERMISSION_REQUIRED:'لا توجد صلاحية عرض إدارة رواتب SEA VIBE.',
    SEA_VIBE_SALARY_STATEMENT_VIEW_PERMISSION_REQUIRED:'لا توجد صلاحية عرض كشف راتب SEA VIBE.'
  };

  function translateMessage(message=''){
    const raw=String(message||'');
    const key=Object.keys(ERROR_MAP).find(code=>raw.includes(code));
    return key?ERROR_MAP[key]:raw;
  }

  function requirePermission(screen,action='view'){
    if(can(screen,action))return true;
    throw new Error(t('seaVibePayroll.error.permission','لا توجد صلاحية لهذه العملية في رواتب وعمولات SEA VIBE.'));
  }

  function monthStart(value){
    const raw=String(value||'').trim();
    if(/^\d{4}-\d{2}$/.test(raw))return `${raw}-01`;
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return `${raw.slice(0,7)}-01`;
    const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  }
  function isoDate(value){const raw=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:null;}

  async function namespace(){
    const localId=window.KYUMOfflineSessionStore?.currentUserId?.();
    if(localId)return `user:${localId}`;
    const state=window.CustomerAuth?.getState?.()||{};
    const id=state?.user?.id||state?.profile?.id;
    if(id)return `user:${id}`;
    if(navigator.onLine!==false){
      const result=await db().auth?.getUser?.().catch(()=>null);
      if(result?.data?.user?.id)return `user:${result.data.user.id}`;
    }
    throw new Error(t('seaVibePayroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
  }

  function context(kind,screen,parts=[]){
    const token=parts.map(v=>encodeURIComponent(v??'')).join('|');
    return {kind,screen,parts,key:`${CACHE_PREFIX}${kind}${token?`:${token}`:''}`};
  }

  async function cacheGet(ctx){
    if(!window.KYUMSmartCache)return null;
    const ns=await namespace();
    const hit=await window.KYUMSmartCache.get(ctx.key,{namespace:ns,allowStale:true,allowStaleAnyAge:true,staleMaxMs:CACHE_STALE_MAX_MS});
    return hit?.hit?hit:null;
  }

  async function cacheSet(ctx,data,source='supabase'){
    if(!window.KYUMSmartCache)return null;
    const ns=await namespace();
    return window.KYUMSmartCache.set(ctx.key,data,{namespace:ns,ttlMs:CACHE_TTL_MS,staleMaxMs:CACHE_STALE_MAX_MS,source,schemaVersion:2});
  }

  function setMemory(kind,data,ctx){
    memory[kind]=data;
    activeContexts.set(kind,ctx);
  }

  function setReadStatus(kind,source,meta={},stale=false){
    readStatus[kind]={source,updatedAt:Number(meta?.updatedAt||Date.now()),stale:Boolean(stale)};
  }

  function emitUpdate(kind,source='network'){
    window.dispatchEvent(new CustomEvent('sea-vibe-payroll-data-updated',{detail:{kind,source}}));
  }

  async function rpcOnline(name,args={},fallback='تعذر تنفيذ العملية'){
    if(navigator.onLine===false)throw new Error(t('seaVibePayroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
    const {data,error}=await db().rpc(name,args);
    if(error)throw new Error(translateMessage(error.message)||fallback);
    return data;
  }

  async function fetchAndPersist(kind,ctx,fetcher,{emit=false}={}){
    if(refreshes.has(ctx.key))return refreshes.get(ctx.key);
    const operation=(async()=>{
      const data=await fetcher();
      const meta=await cacheSet(ctx,data,'supabase');
      if(activeContexts.get(kind)?.key===ctx.key){
        setMemory(kind,data,ctx);
        setReadStatus(kind,'network',meta||{},false);
      }
      if(emit)emitUpdate(kind,'network-background');
      return data;
    })();
    refreshes.set(ctx.key,operation);
    try{return await operation;}finally{refreshes.delete(ctx.key);}
  }

  async function loadWorkspace({kind,screen,parts=[],fetcher,force=false}){
    requirePermission(screen,'view');
    const ctx=context(kind,screen,parts);
    activeContexts.set(kind,ctx);
    const cached=await cacheGet(ctx).catch(()=>null);
    if(cached&&!force){
      setMemory(kind,cached.data,ctx);
      setReadStatus(kind,'cache',cached.metadata||cached,Boolean(cached.stale));
      if(navigator.onLine!==false)fetchAndPersist(kind,ctx,fetcher,{emit:true}).catch(error=>console.warn(`SEA VIBE payroll ${kind} background refresh skipped:`,error));
      return cached.data;
    }
    try{return await fetchAndPersist(kind,ctx,fetcher);}catch(error){
      if(cached){setMemory(kind,cached.data,ctx);setReadStatus(kind,'cache',cached.metadata||cached,Boolean(cached.stale));return cached.data;}
      throw error;
    }
  }

  async function invalidate(){
    Object.keys(memory).forEach(k=>{memory[k]=null;});
    Object.keys(readStatus).forEach(k=>delete readStatus[k]);
    activeContexts.clear();
    const ns=await namespace().catch(()=>null);
    if(ns&&window.KYUMSmartCache)await window.KYUMSmartCache.removePrefix(CACHE_PREFIX,{namespace:ns});
  }

  async function loadReference(options={}){
    return loadWorkspace({
      kind:'reference',screen:'seaVibePayrollReference',parts:['workspace'],force:Boolean(options.force),
      fetcher:()=>rpcOnline('get_sea_vibe_payroll_reference_workspace_r44r8',{},t('seaVibePayroll.error.loadReference','تعذر تحميل بيانات موظفي SEA VIBE.'))
    });
  }

  async function saveEmployee(record){
    requirePermission('seaVibePayrollReference',record?.id?'edit':'add');
    await rpcOnline('save_sea_vibe_employee_r44r8',{p_record:record||{}},t('seaVibePayroll.error.saveEmployee','تعذر حفظ موظف SEA VIBE.'));
    await invalidate();
    try{await window.SeaVibeService?.refreshCommissionEmployees?.();}catch(error){console.warn('SEA VIBE commission employee refresh deferred:',error);try{await window.SeaVibeService?.invalidate?.();}catch(_){}}
    const result=await loadReference({force:true});
    window.dispatchEvent(new CustomEvent('sea-vibe-payroll-employee-saved'));
    return result;
  }

  async function loadManagement(month,options={}){
    const normalized=monthStart(month);
    return loadWorkspace({
      kind:'management',screen:'seaVibePayrollManagement',parts:['month',normalized],force:Boolean(options.force),
      fetcher:()=>rpcOnline('get_sea_vibe_payroll_management_workspace_r44r9',{p_month:normalized},'تعذر تحميل إدارة رواتب SEA VIBE.')
    });
  }

  async function prepareMonth(month,commissionFrom,commissionTo){
    requirePermission('seaVibePayrollManagement','add');
    const from=isoDate(commissionFrom),to=isoDate(commissionTo);
    if(!from||!to||from>to)throw new Error('فترة عمولات راتب SEA VIBE غير صالحة.');
    const normalized=monthStart(month);
    await rpcOnline('prepare_sea_vibe_payroll_month_range_r44r9',{p_month:normalized,p_commission_from:from,p_commission_to:to},'تعذر تجهيز رواتب SEA VIBE.');
    await invalidate();
    return loadManagement(normalized,{force:true});
  }

  async function saveAdjustmentItems(id,items,notes){
    requirePermission('seaVibePayrollManagement','add');
    await rpcOnline('save_sea_vibe_payroll_salary_adjustment_items_r44r9',{p_statement_id:id,p_items:Array.isArray(items)?items:[],p_notes:notes||null},'تعذر حفظ تعديلات راتب SEA VIBE.');
    const current=activeContexts.get('management');
    await invalidate();
    if(current?.parts?.[1])return loadManagement(current.parts[1],{force:true});
    return null;
  }

  async function transition(id,action,reference=''){
    await rpcOnline('sea_vibe_payroll_salary_transition_r44r9',{p_statement_id:id,p_action:action,p_reference:reference||null},'تعذر تحديث حالة راتب SEA VIBE.');
    const managementContext=activeContexts.get('management');
    await invalidate();
    if(managementContext?.parts?.[1])await loadManagement(managementContext.parts[1],{force:true}).catch(()=>null);
    return true;
  }

  async function loadSalaryStatement(options={}){
    return loadWorkspace({
      kind:'salary',screen:'seaVibeSalaryStatement',parts:['self'],force:Boolean(options.force),
      fetcher:()=>rpcOnline('get_sea_vibe_salary_statement_workspace_r44r9',{},'تعذر تحميل كشف راتب SEA VIBE.')
    });
  }

  async function refreshActiveContexts(){
    if(navigator.onLine===false)return;
    const management=activeContexts.get('management');
    const salary=activeContexts.get('salary');
    const reference=activeContexts.get('reference');
    if(management?.parts?.[1])await loadManagement(management.parts[1],{force:true}).catch(error=>console.warn('SEA VIBE payroll management refresh skipped:',error));
    if(salary)await loadSalaryStatement({force:true}).catch(error=>console.warn('SEA VIBE salary statement refresh skipped:',error));
    if(reference)await loadReference({force:true}).catch(error=>console.warn('SEA VIBE payroll reference refresh skipped:',error));
  }

  window.KYUMSyncEngine?.register?.('sea-vibe-payroll',refreshActiveContexts);

  window.SeaVibePayrollService=Object.freeze({
    monthStart,loadReference,saveEmployee,loadManagement,prepareMonth,saveAdjustmentItems,transition,loadSalaryStatement,
    invalidate,getCache:()=>({...memory}),getReadStatus:kind=>kind?readStatus[kind]||null:{...readStatus}
  });
})();
