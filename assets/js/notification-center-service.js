(function(){
  'use strict';
  const db=()=>{if(!window.customerSupabase)throw new Error('اتصال Supabase غير جاهز.');return window.customerSupabase};
  const profile=()=>window.CustomerAuth?.getState?.().profile||null;
  const authState=()=>window.CustomerAuth?.getState?.()||{};
  const CACHE_TTL_MS=60*1000;
  const CACHE_STALE_MAX_MS=30*24*60*60*1000;
  const CACHE_SCHEMA_VERSION=1;
  const mineRefreshes=new Map();
  const textToUint8Array=value=>new TextEncoder().encode(value);
  function base64UrlToUint8Array(value){
    const padding='='.repeat((4-(value.length%4))%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64),out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
  }
  function bufferToBase64Url(buffer){
    const bytes=new Uint8Array(buffer);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function requireOnlineWrite(label='هذه العملية'){
    if(navigator.onLine===false)throw new Error(`${label} تحتاج اتصالًا بالإنترنت.`);
  }
  async function currentNamespace(){
    const state=authState();
    const uid=state?.user?.id||state?.profile?.id||window.KYUMOfflineSessionStore?.currentUserId?.();
    if(uid)return `user:${uid}`;
    try{const result=await db().auth.getUser();return `user:${result?.data?.user?.id||'anonymous'}`}catch(_){return 'user:anonymous'}
  }
  function normalizeLimit(limit){return Math.max(1,Math.min(100,Number(limit||50)||50))}
  function mineCacheKey(limit){return `notification-center:mine:${normalizeLimit(limit)}`}
  async function readMineCache(limit){
    if(!window.KYUMSmartCache)return null;
    return window.KYUMSmartCache.get(mineCacheKey(limit),{namespace:await currentNamespace(),allowStale:true,allowStaleAnyAge:true,staleMaxMs:CACHE_STALE_MAX_MS});
  }
  async function writeMineCache(limit,rows,source='supabase'){
    if(!window.KYUMSmartCache)return null;
    return window.KYUMSmartCache.set(mineCacheKey(limit),Array.isArray(rows)?rows:[],{namespace:await currentNamespace(),ttlMs:CACHE_TTL_MS,staleMaxMs:CACHE_STALE_MAX_MS,source,schemaVersion:CACHE_SCHEMA_VERSION});
  }
  async function invalidateMineCache(){
    if(!window.KYUMSmartCache)return;
    await window.KYUMSmartCache.removePrefix('notification-center:mine:',{namespace:await currentNamespace()});
  }
  async function fetchMine(limit){
    const uid=profile()?.id||authState()?.user?.id;if(!uid)return[];
    const {data,error}=await db().from('notifications').select('id,event_key,title,body,target_view,request_id,visit_id,is_read,created_at,metadata').eq('user_id',uid).eq('in_app_delivery',true).order('created_at',{ascending:false}).limit(normalizeLimit(limit));
    if(error)throw new Error('تعذر تحميل الإشعارات: '+error.message);
    return data||[];
  }
  async function refreshMine(limit,previous=[]){
    const key=mineCacheKey(limit);
    if(mineRefreshes.has(key))return mineRefreshes.get(key);
    const job=(async()=>{
      const rows=await fetchMine(limit);
      await writeMineCache(limit,rows,'network-refresh');
      if(window.KYUMSmartCache?.hashValue?.(rows)!==window.KYUMSmartCache?.hashValue?.(previous)){
        window.dispatchEvent(new CustomEvent('kyum-notification-cache-updated',{detail:{rows,limit:normalizeLimit(limit),source:'network-refresh',updatedAt:Date.now()}}));
      }
      return rows;
    })();
    mineRefreshes.set(key,job);
    try{return await job}finally{mineRefreshes.delete(key)}
  }

  async function loadConfig(){
    const [{data:system,error:se},{data:events,error:ee},{data:rules,error:re},{data:users,error:ue}]=await Promise.all([
      db().from('notification_system_settings').select('id,is_enabled').eq('id',1).maybeSingle(),
      db().from('notification_event_settings').select('event_key,event_name,module_name,is_enabled,in_app_enabled,push_enabled,display_order,target_view').order('display_order'),
      db().from('notification_event_recipient_rules').select('id,event_key,recipient_type,role_key,user_id,is_active').eq('is_active',true),
      db().from('user_profiles').select('id,full_name,email,role,is_active').eq('is_active',true).order('full_name')
    ]);
    if(se)throw new Error('تعذر تحميل إعدادات الإشعارات: '+se.message);if(ee)throw new Error('تعذر تحميل أحداث الإشعارات: '+ee.message);if(re)throw new Error('تعذر تحميل مستلمي الإشعارات: '+re.message);if(ue)throw new Error('تعذر تحميل المستخدمين: '+ue.message);
    return {system:system||{id:1,is_enabled:true},events:events||[],rules:rules||[],users:users||[]};
  }
  async function saveConfig(payload){
    if(!window.CustomerPermissions?.requireAction?.('notificationCenter','edit',{silent:true}))throw new Error('ليس لديك صلاحية تعديل مركز الإشعارات.');
    const uid=profile()?.id||null;
    const {error:sysErr}=await db().from('notification_system_settings').upsert({id:1,is_enabled:payload.masterEnabled!==false,updated_by:uid,updated_at:new Date().toISOString()},{onConflict:'id'});if(sysErr)throw new Error('تعذر حفظ حالة نظام الإشعارات: '+sysErr.message);
    const eventRows=(payload.events||[]).map(x=>({
      event_key:x.eventKey,
      event_name:x.eventName,
      module_name:x.moduleName||'التركيبات',
      target_view:x.targetView||null,
      display_order:Number.isFinite(Number(x.displayOrder))?Number(x.displayOrder):0,
      is_enabled:!!x.enabled,
      in_app_enabled:!!x.inApp,
      push_enabled:!!x.push,
      updated_by:uid,
      updated_at:new Date().toISOString()
    }));
    if(eventRows.length){const {error}=await db().from('notification_event_settings').upsert(eventRows,{onConflict:'event_key'});if(error)throw new Error('تعذر حفظ إعدادات الأحداث: '+error.message)}
    const keys=eventRows.map(x=>x.event_key);if(keys.length){const {error}=await db().from('notification_event_recipient_rules').delete().in('event_key',keys);if(error)throw new Error('تعذر تحديث مستلمي الإشعارات: '+error.message)}
    const rows=[];(payload.events||[]).forEach(ev=>{if(ev.owner)rows.push({event_key:ev.eventKey,recipient_type:'request_owner',is_active:true,created_by:uid});(ev.roles||[]).forEach(role=>rows.push({event_key:ev.eventKey,recipient_type:'role',role_key:role,is_active:true,created_by:uid}));(ev.users||[]).forEach(userId=>rows.push({event_key:ev.eventKey,recipient_type:'user',user_id:userId,is_active:true,created_by:uid}))});
    if(rows.length){const {error}=await db().from('notification_event_recipient_rules').insert(rows);if(error)throw new Error('تعذر حفظ مصفوفة المستلمين: '+error.message)}
    return loadConfig();
  }
  async function listMine(limit=50,options={}){
    const normalizedLimit=normalizeLimit(limit),cached=!options.force?await readMineCache(normalizedLimit):null;
    if(cached?.hit&&Array.isArray(cached.data)){
      if(navigator.onLine!==false)refreshMine(normalizedLimit,cached.data).catch(()=>{});
      return cached.data;
    }
    try{const rows=await fetchMine(normalizedLimit);await writeMineCache(normalizedLimit,rows);return rows}catch(error){if(cached?.data)return cached.data;throw error}
  }
  async function markRead(id){
    requireOnlineWrite('تحديث حالة الإشعار');
    const uid=profile()?.id||authState()?.user?.id;if(!uid)return;
    const {error}=await db().from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('id',id).eq('user_id',uid);if(error)throw new Error(error.message);
    await invalidateMineCache();
  }
  async function markAllRead(){
    requireOnlineWrite('تحديث حالة الإشعارات');
    const uid=profile()?.id||authState()?.user?.id;if(!uid)return;
    const {error}=await db().from('notifications').update({is_read:true,read_at:new Date().toISOString()}).eq('user_id',uid).eq('is_read',false).eq('in_app_delivery',true);if(error)throw new Error(error.message);
    await invalidateMineCache();
  }
  let pushConfigCache=null,pushConfigExpiresAt=0;
  async function getPushConfig(force=false){
    if(!pushSupported())return{supported:false,configured:false,publicKey:'',permission:typeof Notification==='undefined'?'unsupported':Notification.permission};
    const now=Date.now();
    if(!force&&pushConfigCache&&now<pushConfigExpiresAt)return{...pushConfigCache,permission:Notification.permission};
    const {data,error}=await db().functions.invoke('notification-push-dispatch',{body:{action:'config'}});
    if(error)throw new Error('تعذر تحميل إعداد Web Push: '+error.message);
    pushConfigCache={supported:true,configured:!!data?.configured&&!!data?.publicKey,publicKey:data?.publicKey||''};
    pushConfigExpiresAt=now+5*60*1000;
    return{...pushConfigCache,permission:Notification.permission};
  }
  async function dispatchPending(){
    try{
      const cfg=await getPushConfig();
      if(!cfg.supported||!cfg.configured)return{skipped:true,reason:cfg.supported?'not-configured':'unsupported'};
      const {data,error}=await db().functions.invoke('notification-push-dispatch',{body:{action:'dispatch'}});
      if(error)throw error;
      return data||null;
    }catch(e){console.warn('[Notifications] push dispatch deferred',e?.message||e);return null}
  }
  async function emit(eventKey,{requestId=null,visitId=null,metadata={},occurrenceKey=null}={}){if(!profile()?.id)return;const {error}=await db().rpc('emit_notification_event',{p_event_key:eventKey,p_request_id:requestId,p_visit_id:visitId,p_metadata:metadata||{},p_occurrence_key:occurrenceKey||null});if(error){console.warn('[Notifications] emit failed',eventKey,error.message);return}dispatchPending()}
  function subscribe(handler){const uid=profile()?.id||authState()?.user?.id;if(!uid)return()=>{};const channel=db().channel('kyum-notifications-'+uid).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+uid},payload=>{if(payload.new?.in_app_delivery!==false){invalidateMineCache().catch(()=>{});handler?.(payload.new)}}).subscribe();return()=>db().removeChannel(channel)}
  function pushSupported(){return !!(window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window)}
  async function getPushStatus(){
    const base={supported:pushSupported(),permission:typeof Notification==='undefined'?'unsupported':Notification.permission,configured:false,subscribed:false,endpoint:null};if(!base.supported)return base;
    const cfg=await getPushConfig();base.configured=cfg.configured;if(!cfg.configured)return base;
    const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();base.endpoint=sub?.endpoint||null;base.subscribed=!!sub;
    return base;
  }
  async function enablePush(){
    if(!pushSupported())throw new Error('هذا المتصفح أو وضع التشغيل الحالي لا يدعم Web Push. استخدم HTTPS أو ثبّت التطبيق كـPWA.');
    const cfg=await getPushConfig();if(!cfg.configured)throw new Error('مفاتيح Web Push غير مهيأة على الخادم بعد.');
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('لم يتم منح صلاحية الإشعارات لهذا الجهاز.');
    const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToUint8Array(cfg.publicKey)});
    const uid=profile()?.id;if(!uid)throw new Error('يجب تسجيل الدخول قبل تفعيل إشعارات الجهاز.');
    const json=sub.toJSON(),row={user_id:uid,endpoint:sub.endpoint,p256dh:json.keys?.p256dh||'',auth_key:json.keys?.auth||'',user_agent:navigator.userAgent,device_label:[navigator.platform||'',/Mobi|Android/i.test(navigator.userAgent)?'Mobile':'Desktop'].filter(Boolean).join(' — '),is_active:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const {error}=await db().from('notification_push_subscriptions').upsert(row,{onConflict:'endpoint'});if(error)throw new Error('تعذر حفظ اشتراك Push: '+error.message);await dispatchPending();return getPushStatus();
  }
  async function disablePush(){
    if(!pushSupported())return getPushStatus();const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(sub){const endpoint=sub.endpoint;try{await sub.unsubscribe()}catch(_){ }const uid=profile()?.id;if(uid)await db().from('notification_push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('user_id',uid).eq('endpoint',endpoint)}return getPushStatus();
  }
  window.KYUMSyncEngine?.register?.('notification-center-mine',()=>listMine(50,{force:true}));
  window.NotificationCenterService=Object.freeze({loadConfig,saveConfig,listMine,markRead,markAllRead,emit,subscribe,pushSupported,getPushStatus,enablePush,disablePush,dispatchPending,invalidateMineCache});
})();
