(function(){
  'use strict';

  const CACHE_KEY='sea-vibe-payroll:v1:reference';
  const CACHE_TTL_MS=10*60*1000;
  const CACHE_STALE_MAX_MS=180*24*60*60*1000;
  let memory=null;
  let readStatus={source:'none',updatedAt:0,stale:false};

  const t=(key,fallback)=>{const value=window.PetatoeLocalization?.t?.(key);return value&&!/^\[.+\]$/.test(value)?value:fallback;};
  const db=()=>{if(!window.customerSupabase)throw new Error(t('seaVibePayroll.error.databaseNotReady','خدمة قاعدة البيانات غير جاهزة.'));return window.customerSupabase;};
  const can=(action='view')=>window.PermissionEngine?.can?.('seaVibePayrollReference',action) ?? window.CustomerPermissions?.canScreen?.('seaVibePayrollReference',action) ?? false;

  function requirePermission(action='view'){
    if(can(action))return true;
    throw new Error(t('seaVibePayroll.error.permission','لا توجد صلاحية لهذه العملية في رواتب وعمولات SEA VIBE.'));
  }

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

  async function cacheGet(){
    if(!window.KYUMSmartCache)return null;
    const ns=await namespace();
    const hit=await window.KYUMSmartCache.get(CACHE_KEY,{namespace:ns,allowStale:true,allowStaleAnyAge:true,staleMaxMs:CACHE_STALE_MAX_MS});
    return hit?.hit?hit:null;
  }

  async function cacheSet(data,source='supabase'){
    if(!window.KYUMSmartCache)return null;
    const ns=await namespace();
    return window.KYUMSmartCache.set(CACHE_KEY,data,{namespace:ns,ttlMs:CACHE_TTL_MS,staleMaxMs:CACHE_STALE_MAX_MS,source,schemaVersion:1});
  }

  async function cacheClear(){
    memory=null;
    const ns=await namespace().catch(()=>null);
    if(ns&&window.KYUMSmartCache)await window.KYUMSmartCache.removePrefix('sea-vibe-payroll:',{namespace:ns});
  }

  async function fetchReference(){
    if(navigator.onLine===false)throw new Error(t('seaVibePayroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
    const {data,error}=await db().rpc('get_sea_vibe_payroll_reference_workspace_r44r8');
    if(error)throw new Error(error.message||t('seaVibePayroll.error.loadReference','تعذر تحميل بيانات موظفي SEA VIBE.'));
    const result=data&&typeof data==='object'?data:{employees:[],users:[]};
    memory=result;
    const meta=await cacheSet(result,'supabase');
    readStatus={source:'network',updatedAt:Number(meta?.updatedAt||Date.now()),stale:false};
    window.dispatchEvent(new CustomEvent('sea-vibe-payroll-data-updated',{detail:{kind:'reference',source:'network'}}));
    return result;
  }

  async function loadReference(options={}){
    requirePermission('view');
    if(memory&&!options.force)return memory;
    const cached=await cacheGet().catch(()=>null);
    if(cached&&!options.force){
      memory=cached.data||{employees:[],users:[]};
      readStatus={source:'cache',updatedAt:Number(cached.updatedAt||cached.metadata?.updatedAt||Date.now()),stale:Boolean(cached.stale)};
      if(navigator.onLine!==false)fetchReference().catch(error=>console.warn('SEA VIBE payroll reference background refresh skipped:',error));
      return memory;
    }
    try{return await fetchReference();}catch(error){if(cached){memory=cached.data;return memory;}throw error;}
  }

  async function saveEmployee(record){
    requirePermission(record?.id?'edit':'add');
    if(navigator.onLine===false)throw new Error(t('seaVibePayroll.error.onlineRequired','هذه العملية تحتاج اتصالًا بالإنترنت.'));
    const {data,error}=await db().rpc('save_sea_vibe_employee_r44r8',{p_record:record||{}});
    if(error)throw new Error(error.message||t('seaVibePayroll.error.saveEmployee','تعذر حفظ موظف SEA VIBE.'));
    await cacheClear();
    try{await window.SeaVibeService?.invalidate?.();}catch(_){}
    const result=await loadReference({force:true});
    window.dispatchEvent(new CustomEvent('sea-vibe-payroll-employee-saved',{detail:{id:data||null}}));
    return result;
  }

  window.SeaVibePayrollService=Object.freeze({loadReference,saveEmployee,invalidate:cacheClear,getCache:()=>memory,getReadStatus:()=>({...readStatus})});
})();
