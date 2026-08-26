(function(){
  'use strict';

  const CACHE_PREFIX='payroll:v1:';
  const CACHE_TTL_MS=10*60*1000;
  const CACHE_STALE_MAX_MS=180*24*60*60*1000;
  const CACHE_SCHEMA_VERSION=1;
  const PAYROLL_SCREENS=['payrollManagement','salaryStatement','commissionManagement','commissionStatement','payrollReference'];
  const cache={management:null,salary:null,commissions:null,commissionStatement:null,reference:null,adjustmentCatalog:null};
  const readStatus={};
  const activeContexts=new Map();
  const refreshes=new Map();

  const t=(key,fallback)=>{const value=window.PetatoeLocalization?.t?.(key);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const translateMessage=message=>window.PetatoeLocalization?.translateMessage?.(message)||String(message||'');
  const db=()=>{if(!window.customerSupabase)throw new Error(t('payroll.error.databaseNotReady','خدمة قاعدة البيانات غير جاهزة.'));return window.customerSupabase;};
  const monthStart=value=>{const raw=String(value||'').slice(0,7);return /^\d{4}-\d{2}$/.test(raw)?`${raw}-01`:new Date().toISOString().slice(0,7)+'-01';};
  const isoDate=value=>{const raw=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:null;};

  function permissionErrorKey(screen){
    return ({
      payrollManagement:['payroll.db.noPayrollViewPermission','لا توجد صلاحية عرض إدارة الرواتب'],
      salaryStatement:['payroll.db.noSalaryViewPermission','لا توجد صلاحية عرض كشف الراتب'],
      commissionManagement:['payroll.db.noCommissionViewPermission','لا توجد صلاحية عرض إدارة العمولات'],
      commissionStatement:['payroll.db.noCommissionStatementPermission','لا توجد صلاحية عرض كشف العمولة'],
      payrollReference:['payroll.db.noReferenceViewPermission','لا توجد صلاحية عرض البيانات المرجعية للرواتب والعمولات']
    })[screen]||['payroll.error.operation','لا توجد صلاحية لهذه العملية'];
  }

  function requireView(screen){
    const allowed=window.PermissionEngine?.can?.(screen,'view')
      ?? window.CustomerPermissions?.canScreen?.(screen,'view');
    if(allowed===true)return true;
    const [key,fallback]=permissionErrorKey(screen);
    throw new Error(t(key,fallback));
  }

  async function namespace(){
    const localId=window.KYUMOfflineSessionStore?.currentUserId?.();
    if(localId)return `user:${localId}`;
    const stateId=window.CustomerAuth?.getState?.().user?.id||window.CustomerAuth?.getState?.().profile?.id;
    if(stateId)return `user:${stateId}`;
    if(navigator.onLine!==false){
      try{
        const result=await db().auth?.getUser?.();
        const id=result?.data?.user?.id;
        if(id)return `user:${id}`;
      }catch(_){}
    }
    throw new Error(t('payroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
  }

  function normalizedPermissionRows(rows){
    return (Array.isArray(rows)?rows:[])
      .filter(row=>PAYROLL_SCREENS.includes(String(row?.screenKey||row?.screen_key||'')))
      .map(row=>({
        screenKey:String(row?.screenKey||row?.screen_key||''),
        canView:Boolean(row?.can_view??row?.canView),
        canAdd:Boolean(row?.can_add??row?.canAdd),
        canEdit:Boolean(row?.can_edit??row?.canEdit),
        canDelete:Boolean(row?.can_delete??row?.canDelete),
        canExport:Boolean(row?.can_export??row?.canExport)
      }))
      .sort((a,b)=>a.screenKey.localeCompare(b.screenKey));
  }

  function permissionFingerprint(){
    const auth=window.CustomerAuth?.getState?.()||{};
    const role=String(auth?.profile?.role||window.CustomerPermissions?.currentRole?.()||'viewer');
    const snapshot=window.PermissionEngine?.snapshot?.();
    let rows=normalizedPermissionRows(snapshot?.rows||[]);
    if(!rows.length&&role!=='super_admin'){
      const userId=window.KYUMOfflineSessionStore?.currentUserId?.()||auth?.user?.id||auth?.profile?.id;
      rows=normalizedPermissionRows(window.KYUMOfflineSessionStore?.loadPermissions?.(userId)||[]);
    }
    const payload={role,rows};
    return window.KYUMSmartCache?.hashValue?.(payload)||`role-${encodeURIComponent(role)}`;
  }

  function token(parts=[]){
    return (parts||[]).map(value=>encodeURIComponent(String(value??'').trim()||'*')).join('|');
  }

  async function makeContext(kind,screen,parts=[]){
    requireView(screen);
    const ns=await namespace();
    const permissionHash=permissionFingerprint();
    const contextToken=token(parts);
    return {kind,screen,namespace:ns,permissionHash,contextToken,key:`${CACHE_PREFIX}${permissionHash}:${kind}:${contextToken}`};
  }

  function setMemory(kind,data,context){
    cache[kind]=data;
    if(context)activeContexts.set(kind,context);
    return data;
  }

  function setReadStatus(kind,source,metadata=null,stale=false){
    readStatus[kind]={source,stale:Boolean(stale),metadata:metadata||null,updatedAt:Number(metadata?.updatedAt||Date.now())};
    return readStatus[kind];
  }

  function emitUpdate(kind,context,source){
    window.dispatchEvent?.(new CustomEvent('payroll-data-updated',{detail:{kind,contextKey:context?.key||'',source,updatedAt:Date.now()}}));
  }

  async function persist(context,data,source='supabase'){
    if(!window.KYUMSmartCache)return null;
    return window.KYUMSmartCache.set(context.key,data,{
      namespace:context.namespace,
      ttlMs:CACHE_TTL_MS,
      staleMaxMs:CACHE_STALE_MAX_MS,
      source,
      schemaVersion:CACHE_SCHEMA_VERSION
    });
  }

  async function readCached(context){
    if(!window.KYUMSmartCache)return null;
    const hit=await window.KYUMSmartCache.get(context.key,{
      namespace:context.namespace,
      allowStale:true,
      staleMaxMs:CACHE_STALE_MAX_MS
    });
    return hit?.hit?hit:null;
  }

  async function rpcOnline(name,args={},messageKey='payroll.error.operation',fallback='تعذر تنفيذ العملية'){
    if(navigator.onLine===false)throw new Error(t('payroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
    const {data,error}=await db().rpc(name,args);
    if(error){
      const detail=translateMessage(error.message||'');
      throw new Error(`${t(messageKey,fallback)}${detail?`: ${detail}`:''}`);
    }
    return data;
  }

  async function fetchAndPersist(kind,context,fetcher,{emit=false}={}){
    if(navigator.onLine===false)throw new Error(t('payroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
    if(refreshes.has(context.key))return refreshes.get(context.key);
    const operation=(async()=>{
      const data=await fetcher();
      const meta=await persist(context,data,'supabase');
      if(activeContexts.get(kind)?.key===context.key){
        setMemory(kind,data,context);
        setReadStatus(kind,'network',{updatedAt:meta?.updatedAt||Date.now(),recordCount:meta?.recordCount??null},false);
      }
      if(emit)emitUpdate(kind,context,'network-background');
      return data;
    })();
    refreshes.set(context.key,operation);
    try{return await operation;}finally{refreshes.delete(context.key);}
  }

  async function loadWorkspace({kind,screen,parts=[],fetcher,force=false}){
    const context=await makeContext(kind,screen,parts);
    activeContexts.set(kind,context);
    const cached=await readCached(context);

    if(cached&&(!force||navigator.onLine===false)){
      setMemory(kind,cached.data,context);
      setReadStatus(kind,'cache',cached.metadata||null,Boolean(cached.stale));
      if(navigator.onLine!==false){
        fetchAndPersist(kind,context,fetcher,{emit:true}).catch(error=>console.warn(`Payroll ${kind} background refresh skipped:`,error));
      }
      return cached.data;
    }

    try{
      return await fetchAndPersist(kind,context,fetcher,{emit:false});
    }catch(error){
      if(cached){
        setMemory(kind,cached.data,context);
        setReadStatus(kind,'cache',cached.metadata||null,Boolean(cached.stale));
        return cached.data;
      }
      throw error;
    }
  }

  async function invalidatePayrollCache(){
    const ns=await namespace().catch(()=>null);
    if(ns&&window.KYUMSmartCache)await window.KYUMSmartCache.removePrefix(CACHE_PREFIX,{namespace:ns});
    Object.keys(cache).forEach(key=>{cache[key]=null;});
    Object.keys(readStatus).forEach(key=>{delete readStatus[key];});
    activeContexts.clear();
  }

  async function loadManagement(month){
    const normalized=monthStart(month);
    return loadWorkspace({
      kind:'management',screen:'payrollManagement',parts:['month',normalized],
      fetcher:()=>rpcOnline('get_payroll_management_workspace',{p_month:normalized},'payroll.error.loadManagement','تعذر تحميل إدارة الرواتب')
    });
  }

  async function prepareMonth(month,commissionFrom,commissionTo){
    const from=isoDate(commissionFrom),to=isoDate(commissionTo);
    if(!from||!to||from>to)throw new Error(t('payroll.commissionPeriod.invalid','فترة عمولات الراتب غير صالحة.'));
    await rpcOnline('prepare_payroll_month_range',{p_month:monthStart(month),p_commission_from:from,p_commission_to:to},'payroll.error.prepareMonth','تعذر تجهيز رواتب الشهر');
    await invalidatePayrollCache();
    return loadManagement(month);
  }

  async function loadAdjustmentCatalog(force=false){
    return loadWorkspace({
      kind:'adjustmentCatalog',screen:'payrollManagement',parts:['catalog'],force:Boolean(force),
      fetcher:()=>rpcOnline('get_payroll_adjustment_catalog',{},'payroll.error.loadAdjustmentCatalog','تعذر تحميل بنود الإضافات والخصومات المحفوظة')
    });
  }

  async function saveAdjustmentItems(id,items,notes){
    await rpcOnline('save_payroll_salary_adjustment_items',{p_statement_id:id,p_items:Array.isArray(items)?items:[],p_notes:notes||null},'payroll.error.saveAdjustments','تعذر حفظ تعديلات الراتب');
    await invalidatePayrollCache();
  }

  async function saveAdjustments(id,overtime,deductions,notes){
    const items=[];
    if(Number(overtime||0)>0)items.push({type:'addition',name:t('payroll.col.overtime','الإضافي'),amount:Number(overtime),notes:''});
    if(Number(deductions||0)>0)items.push({type:'deduction',name:t('payroll.col.deductions','الخصومات'),amount:Number(deductions),notes:''});
    return saveAdjustmentItems(id,items,notes);
  }

  async function transition(id,action,reference=''){
    const result=await rpcOnline('payroll_salary_transition',{p_statement_id:id,p_action:action,p_reference:reference||null},'payroll.error.transition','تعذر تحديث حالة الراتب');
    await invalidatePayrollCache();
    return result;
  }

  async function loadSalaryStatement(){
    return loadWorkspace({
      kind:'salary',screen:'salaryStatement',parts:['self'],
      fetcher:()=>rpcOnline('get_salary_statement_workspace',{},'payroll.error.loadSalaryStatement','تعذر تحميل كشف الراتب')
    });
  }

  async function loadCommissions(month){
    const normalized=monthStart(month);
    return loadWorkspace({
      kind:'commissions',screen:'commissionManagement',parts:['month',normalized],
      fetcher:()=>rpcOnline('get_commission_management_workspace',{p_month:normalized},'payroll.error.loadCommissionManagement','تعذر تحميل إدارة العمولات')
    });
  }

  async function loadCommissionsRange(fromDate,toDate){
    const from=isoDate(fromDate),to=isoDate(toDate);
    if(!from||!to||from>to)throw new Error(t('commission.range.invalid','يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.'));
    return loadWorkspace({
      kind:'commissions',screen:'commissionManagement',parts:['range',from,to],
      fetcher:()=>rpcOnline('get_commission_management_workspace_range',{p_from:from,p_to:to},'payroll.error.loadCommissionManagement','تعذر تحميل إدارة العمولات')
    });
  }

  async function refreshCommissions(month,fromDate=null,toDate=null){
    await rpcOnline('refresh_payroll_commissions',{p_month:monthStart(month)},'payroll.error.refreshCommissions','تعذر إعادة احتساب العمولات');
    await invalidatePayrollCache();
    return fromDate&&toDate?loadCommissionsRange(fromDate,toDate):loadCommissions(month);
  }

  async function loadCommissionStatement(){
    return loadWorkspace({
      kind:'commissionStatement',screen:'commissionStatement',parts:['self'],
      fetcher:()=>rpcOnline('get_commission_statement_workspace',{},'payroll.error.loadCommissionStatement','تعذر تحميل كشف العمولة')
    });
  }

  async function loadReference(){
    return loadWorkspace({
      kind:'reference',screen:'payrollReference',parts:['workspace'],
      fetcher:()=>rpcOnline('get_payroll_reference_workspace',{},'payroll.error.loadReference','تعذر تحميل البيانات المرجعية')
    });
  }

  async function saveEmployee(record){
    await rpcOnline('save_payroll_employee',{p_record:record},'payroll.error.saveEmployee','تعذر حفظ الموظف');
    await invalidatePayrollCache();
    return loadReference();
  }

  async function saveTier(record){
    await rpcOnline('save_payroll_commission_tier',{p_record:record},'payroll.error.saveTier','تعذر حفظ شريحة العمولة');
    await invalidatePayrollCache();
    return loadReference();
  }

  async function refreshActiveContexts(){
    if(navigator.onLine===false)return;
    const contexts=[...activeContexts.entries()];
    for(const [kind,context] of contexts){
      try{
        const current=await makeContext(kind,context.screen,context.contextToken.split('|').map(value=>decodeURIComponent(value==='*'?'':value)));
        if(current.key!==context.key)continue;
        let fetcher=null;
        const values=context.contextToken.split('|').map(value=>decodeURIComponent(value==='*'?'':value));
        if(kind==='management')fetcher=()=>rpcOnline('get_payroll_management_workspace',{p_month:values[1]},'payroll.error.loadManagement','تعذر تحميل إدارة الرواتب');
        else if(kind==='salary')fetcher=()=>rpcOnline('get_salary_statement_workspace',{},'payroll.error.loadSalaryStatement','تعذر تحميل كشف الراتب');
        else if(kind==='commissionStatement')fetcher=()=>rpcOnline('get_commission_statement_workspace',{},'payroll.error.loadCommissionStatement','تعذر تحميل كشف العمولة');
        else if(kind==='reference')fetcher=()=>rpcOnline('get_payroll_reference_workspace',{},'payroll.error.loadReference','تعذر تحميل البيانات المرجعية');
        else if(kind==='adjustmentCatalog')fetcher=()=>rpcOnline('get_payroll_adjustment_catalog',{},'payroll.error.loadAdjustmentCatalog','تعذر تحميل بنود الإضافات والخصومات المحفوظة');
        else if(kind==='commissions'&&values[0]==='range')fetcher=()=>rpcOnline('get_commission_management_workspace_range',{p_from:values[1],p_to:values[2]},'payroll.error.loadCommissionManagement','تعذر تحميل إدارة العمولات');
        else if(kind==='commissions'&&values[0]==='month')fetcher=()=>rpcOnline('get_commission_management_workspace',{p_month:values[1]},'payroll.error.loadCommissionManagement','تعذر تحميل إدارة العمولات');
        if(fetcher)await fetchAndPersist(kind,context,fetcher,{emit:true});
      }catch(error){console.warn(`Payroll ${kind} lifecycle refresh skipped:`,error);}
    }
  }

  window.KYUMSyncEngine?.register?.('payroll',async()=>refreshActiveContexts());

  window.PayrollService=Object.freeze({
    monthStart,loadManagement,prepareMonth,loadAdjustmentCatalog,saveAdjustmentItems,saveAdjustments,transition,
    loadSalaryStatement,loadCommissions,loadCommissionsRange,refreshCommissions,loadCommissionStatement,
    loadReference,saveEmployee,saveTier,invalidateCache:invalidatePayrollCache,
    getCache:()=>cache,getReadStatus:kind=>kind?readStatus[kind]||null:{...readStatus}
  });
})();
