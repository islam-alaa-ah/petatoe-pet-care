(function(){
  'use strict';
  const db=()=>{if(!window.customerSupabase)throw new Error('اتصال Supabase غير جاهز.');return window.customerSupabase};
  const profile=()=>window.CustomerAuth?.getState?.().profile||null;
  const authState=()=>window.CustomerAuth?.getState?.()||{};
  const CACHE_TTL_MS=60*1000;
  const CACHE_STALE_MAX_MS=30*24*60*60*1000;
  const CACHE_SCHEMA_VERSION=1;
  if(window.NotificationCenterService?.runtimeVersion==='P3')return;
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
  // P3: all notification readers share one user-scoped snapshot and retry gate.
  const READ_GAP_MS=5000, RECONCILE_MS=15*60*1000;
  const readers=new Map(), emitFlights=new Map(), emitted=new Map(), occurrenceAttempts=new WeakMap();
  let stream=null, closeQueue=Promise.resolve(), sessionEpoch=0;
  function currentUid(){
    const state=authState(),uid=state?.user?.id,profileId=state?.profile?.id;
    if(!profileId||(uid&&String(uid)!==String(profileId)))return '';
    return String(profileId);
  }
  function normalizeLimit(limit){return Math.max(1,Math.min(100,Number(limit||50)||50))}
  function mineCacheKey(limit){return `notification-center:mine:${normalizeLimit(limit)}`}
  function normalizeRows(rows,uid){
    const byId=new Map();
    for(const row of rows||[]){
      if(!row?.id||(row.user_id&&String(row.user_id)!==uid))continue;
      if(row.in_app_delivery===false){byId.delete(String(row.id));continue;}
      byId.set(String(row.id),{...byId.get(String(row.id)),...row});
    }
    return [...byId.values()].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id))).slice(0,100);
  }
  function reader(uid=currentUid()){
    if(!uid)return null;
    if(!readers.has(uid))readers.set(uid,{uid,epoch:sessionEpoch,rows:[],hydrated:false,hydrating:null,
      hasRows:false,lastSuccessAt:0,lastAttemptAt:0,nextReadAt:0,retryAfter:0,failures:0,
      needsReconcile:true,reconcileVersion:0,source:'none',revision:0,changes:new Map(),flight:null,write:null,cacheDirty:false});
    return readers.get(uid);
  }
  function isCurrent(state){return !!state&&state.epoch===sessionEpoch&&state.uid===currentUid()&&readers.get(state.uid)===state}
  function getSnapshot(limit=50){const state=reader();return state?state.rows.slice(0,normalizeLimit(limit)):[]}
  function getReadStatus(){
    const state=reader(),live=!!(stream&&!stream.stopped&&stream.uid===currentUid()&&stream.status==='SUBSCRIBED'&&navigator.onLine!==false);
    return {userId:currentUid(),connected:live,realtimeStatus:stream?.status||'CLOSED',
      source:state?.source||'none',lastSuccessAt:state?.lastSuccessAt||0,
      lastAttemptAt:state?.lastAttemptAt||0,nextReadAt:state?.nextReadAt||0,
      retryAfter:state?.retryAfter||0,failures:state?.failures||0,
      needsReconcile:state?.needsReconcile!==false,reconcileIntervalMs:RECONCILE_MS};
  }
  function announce(state,source){
    if(!isCurrent(state))return;
    state.source=source;
    window.dispatchEvent(new CustomEvent('kyum-notification-cache-updated',{
      detail:{userId:state.uid,rows:state.rows.slice(0,50),limit:50,source,updatedAt:Date.now()}}));
  }
  function persist(state){
    state.cacheDirty=true;
    if(!state.write)state.write=Promise.resolve().then(async()=>{
      await hydrate(state);
      while(state.cacheDirty&&isCurrent(state)&&window.KYUMSmartCache){
        state.cacheDirty=false;
        await window.KYUMSmartCache.set(mineCacheKey(50),state.rows.slice(0,50),{
          namespace:`user:${state.uid}`,ttlMs:CACHE_TTL_MS,staleMaxMs:CACHE_STALE_MAX_MS,
          source:state.source,schemaVersion:CACHE_SCHEMA_VERSION});
      }
    }).catch(()=>{}).finally(()=>{state.write=null});
    return state.write;
  }
  async function hydrate(state){
    if(state.hydrated)return;
    if(state.hydrating)return state.hydrating;
    state.hydrating=(async()=>{
      try{
        const cached=await window.KYUMSmartCache?.get?.(mineCacheKey(50),{
          namespace:`user:${state.uid}`,allowStale:true,allowStaleAnyAge:true,staleMaxMs:CACHE_STALE_MAX_MS});
        if(isCurrent(state)&&Array.isArray(cached?.data)){
          state.rows=normalizeRows([...cached.data,...state.rows,...[...state.changes.values()].map(x=>x.row)],state.uid);
          state.hasRows=true;announce(state,'cache');
        }
      }catch(_){/* Cache is optional; never bypass the network retry gate. */}
      finally{state.hydrated=true;state.hydrating=null;}
    })();
    return state.hydrating;
  }
  async function invalidateMineCache(){
    const state=reader();if(!state)return;
    state.needsReconcile=true;state.reconcileVersion+=1;
    await window.KYUMSmartCache?.removePrefix?.('notification-center:mine:',{namespace:`user:${state.uid}`});
  }
  function requestReconcile(){const state=reader();if(state){state.needsReconcile=true;state.reconcileVersion+=1}}
  function applyRow(state,row,source='realtime'){
    if(!isCurrent(state)||!row?.id||(row.user_id&&String(row.user_id)!==state.uid))return;
    const id=String(row.id),old=state.rows.find(x=>String(x.id)===id);
    const next={...old,...row};
    // This app only marks notifications read. Replayed older events must not
    // undo a read acknowledged locally or received from another device.
    if(old?.is_read===true)next.is_read=true;
    state.revision+=1;state.changes.set(id,{revision:state.revision,row:next});
    if(state.changes.size>200){state.changes.delete(state.changes.keys().next().value);state.needsReconcile=true;state.reconcileVersion+=1;}
    state.rows=normalizeRows([...state.rows.filter(x=>String(x.id)!==id),next],state.uid);
    state.hasRows=true;
    announce(state,source);void persist(state);
  }
  async function listMine(limit=50,options={}){
    const state=reader();if(!state)return[];
    await hydrate(state);
    if(!isCurrent(state))return[];
    const slice=()=>state.rows.slice(0,normalizeLimit(limit));
    if(options.cacheOnly||navigator.onLine===false||document.visibilityState==='hidden')return slice();
    if(state.flight)return state.flight.then(rows=>rows.slice(0,normalizeLimit(limit)));
    const now=Date.now(),status=getReadStatus();
    if(now<state.retryAfter||now<state.nextReadAt)return slice();
    if(!options.force&&!state.needsReconcile&&status.connected&&now-state.lastSuccessAt<RECONCILE_MS)return slice();
    if(!options.force&&!state.needsReconcile&&now-state.lastSuccessAt<CACHE_TTL_MS)return slice();
    state.lastAttemptAt=now;state.nextReadAt=now+READ_GAP_MS;
    const startRevision=state.revision,startReconcileVersion=state.reconcileVersion;
    const job=Promise.resolve().then(async()=>{
      try{
        const {data,error}=await db().from('notifications')
          .select('id,user_id,event_key,title,body,target_view,request_id,visit_id,is_read,created_at,metadata,in_app_delivery')
          .eq('user_id',state.uid).eq('in_app_delivery',true)
          .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(Math.max(50,normalizeLimit(limit)));
        if(error)throw error;
        if(!isCurrent(state))return[];
        const duringRead=[...state.changes.values()].filter(x=>x.revision>startRevision).map(x=>x.row);
        state.rows=normalizeRows([...(data||[]),...duringRead],state.uid);
        state.changes.clear();state.hasRows=true;state.needsReconcile=state.reconcileVersion!==startReconcileVersion;
        state.lastSuccessAt=Date.now();state.failures=0;state.retryAfter=0;
        announce(state,'network');void persist(state);
        return isCurrent(state)?state.rows:[];
      }catch(error){
        if(!isCurrent(state))return[];
        state.failures=Math.min(8,state.failures+1);
        const delay=state.failures>4?300000:Math.min(300000,5000*Math.pow(2,state.failures-1));
        state.retryAfter=Date.now()+Math.round(delay*(0.9+Math.random()*0.2));
        state.needsReconcile=true;state.source=state.hasRows?'cache-error':'error';
        if(state.hasRows)return state.rows;
        const failure=new Error('تعذر تحميل الإشعارات: '+String(error?.message||error));
        failure.code=error?.code;failure.status=error?.status;throw failure;
      }finally{if(state.flight===job)state.flight=null;}
    });
    state.flight=job;
    return job.then(rows=>rows.slice(0,normalizeLimit(limit)));
  }
  async function markRead(id){
    requireOnlineWrite('تحديث حالة الإشعار');
    const state=reader();if(!state)return;
    const {error}=await db().from('notifications').update({is_read:true,read_at:new Date().toISOString()})
      .eq('id',id).eq('user_id',state.uid);
    if(error)throw new Error(error.message);
    if(isCurrent(state)){
      if(state.rows.some(row=>String(row.id)===String(id)))applyRow(state,{id,user_id:state.uid,is_read:true},'local-read');
      else requestReconcile();
    }
  }
  async function markAllRead(){
    requireOnlineWrite('تحديث حالة الإشعارات');
    const state=reader();if(!state)return;
    const ids=state.rows.filter(x=>!x.is_read).map(x=>String(x.id));
    const {error}=await db().from('notifications').update({is_read:true,read_at:new Date().toISOString()})
      .eq('user_id',state.uid).eq('is_read',false).eq('in_app_delivery',true);
    if(error)throw new Error(error.message);
    if(isCurrent(state)){for(const id of ids)applyRow(state,{id,user_id:state.uid,is_read:true},'local-read');}
  }
  function queueClose(channel){
    if(!channel)return closeQueue;
    closeQueue=closeQueue.catch(()=>{}).then(()=>db().removeChannel(channel)).catch(()=>{});
    return closeQueue;
  }
  function stopStream(){
    const entry=stream;stream=null;
    if(!entry)return;
    entry.stopped=true;clearTimeout(entry.retryTimer);entry.observers.clear();void queueClose(entry.channel);
  }
  function streamCurrent(entry){return !!entry&&stream===entry&&!entry.stopped&&entry.uid===currentUid()}
  function streamStatus(entry,status){
    if(!streamCurrent(entry))return;
    if(entry.status===status)return;
    entry.status=status;
    const state=reader(entry.uid);if(state){state.needsReconcile=true;state.reconcileVersion+=1;}
    if(status==='SUBSCRIBED'){entry.failures=0;clearTimeout(entry.retryTimer);entry.retryTimer=null;}
    for(const observer of entry.observers){try{observer.onStatus?.(status)}catch(_){}}
    if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)&&!entry.retryTimer){
      entry.failures=Math.min(7,entry.failures+1);
      const delay=Math.min(300000,5000*Math.pow(2,entry.failures-1));
      entry.retryTimer=setTimeout(()=>{
        entry.retryTimer=null;
        if(!streamCurrent(entry)||navigator.onLine===false)return;
        const old=entry.channel;entry.channel=null;
        void queueClose(old).then(()=>openStream(entry));
      },delay);
    }
  }
  function openStream(entry){
    if(!streamCurrent(entry)||navigator.onLine===false||!entry.observers.size||entry.channel)return;
    try{
      entry.status='CONNECTING';
      const channel=db().channel('kyum-notifications-'+entry.uid);entry.channel=channel;
      const valid=()=>streamCurrent(entry)&&entry.channel===channel;
      for(const type of ['INSERT','UPDATE'])channel.on('postgres_changes',{
        event:type,schema:'public',table:'notifications',filter:'user_id=eq.'+entry.uid
      },payload=>{
        if(!valid())return;
        const row=payload.new;
        if(!row?.id||(row.user_id&&String(row.user_id)!==entry.uid))return;
        applyRow(reader(entry.uid),row);
        for(const observer of entry.observers){try{observer.handler?.(row,type)}catch(_){}}
      });
      channel.on('system',{},payload=>{
        if(!valid()||payload?.extension!=='postgres_changes')return;
        if(payload.status==='error')streamStatus(entry,'CHANNEL_ERROR');
        else if(payload.status==='ok')streamStatus(entry,'SUBSCRIBED');
      });
      channel.subscribe(status=>{if(valid())streamStatus(entry,status)});
    }catch(_){entry.channel=null;streamStatus(entry,'CHANNEL_ERROR');}
  }
  function subscribe(handler,onStatus){
    const uid=currentUid();if(!uid)return()=>{};
    if(stream?.uid!==uid)stopStream();
    if(!stream)stream={uid,status:'CONNECTING',channel:null,observers:new Set(),stopped:false,retryTimer:null,failures:0};
    const entry=stream,observer={handler,onStatus};entry.observers.add(observer);
    void closeQueue.then(()=>openStream(entry));
    return()=>{entry.observers.delete(observer);if(stream===entry&&!entry.observers.size)stopStream()};
  }
  function resetSession(){sessionEpoch+=1;stopStream();readers.clear();emitFlights.clear();emitted.clear();}
  function resumeRealtime(){
    const entry=stream;if(!streamCurrent(entry))return;
    if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(entry.status)){
      clearTimeout(entry.retryTimer);entry.retryTimer=null;
      const old=entry.channel;entry.channel=null;void queueClose(old).then(()=>openStream(entry));
    }else void closeQueue.then(()=>openStream(entry));
  }
  function occurrenceKeyFor(action,payload){
    let fingerprint='';try{fingerprint=JSON.stringify(payload)}catch(_){}
    if(payload&&typeof payload==='object'){
      const prior=occurrenceAttempts.get(payload);
      if(prior?.action===action&&prior.userId===currentUid()&&prior.epoch===sessionEpoch&&prior.fingerprint===fingerprint)return prior.key;
    }
    let nonce;try{nonce=globalThis.crypto?.randomUUID?.()}catch(_){}
    nonce=nonce||`${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const key=`notification:${action}:${currentUid()}:${nonce}`;
    if(payload&&typeof payload==='object')occurrenceAttempts.set(payload,{action,userId:currentUid(),epoch:sessionEpoch,fingerprint,key});
    return key;
  }
  function releaseOccurrenceKey(payload,key){if(payload&&typeof payload==='object'&&occurrenceAttempts.get(payload)?.key===key)occurrenceAttempts.delete(payload)}
  async function emit(eventKey,{requestId=null,visitId=null,metadata={},occurrenceKey=null}={}){
    const uid=currentUid();if(!uid)return;
    const key=JSON.stringify([uid,eventKey,requestId,visitId,occurrenceKey||'']);
    if(emitted.has(key)||emitFlights.has(key))return emitFlights.get(key);
    const epoch=sessionEpoch;
    const job=Promise.resolve().then(async()=>{
      const {error}=await db().rpc('emit_notification_event',{p_event_key:eventKey,p_request_id:requestId,
        p_visit_id:visitId,p_metadata:metadata||{},p_occurrence_key:occurrenceKey||null});
      if(error){console.warn('[Notifications] emit failed',eventKey,error.message);return;}
      if(uid!==currentUid()||epoch!==sessionEpoch)return;
      emitted.set(key,true);if(emitted.size>500)emitted.delete(emitted.keys().next().value);
      void dispatchPending();
    }).catch(error=>{console.warn('[Notifications] emit failed',eventKey,error?.message||error)})
      .finally(()=>{if(emitFlights.get(key)===job)emitFlights.delete(key)});
    emitFlights.set(key,job);
    return job;
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
  window.KYUMSyncEngine?.register?.('notification-center-mine',()=>listMine(50));
  window.NotificationCenterService=Object.freeze({loadConfig,saveConfig,listMine,markRead,markAllRead,emit,subscribe,pushSupported,getPushStatus,enablePush,disablePush,dispatchPending,invalidateMineCache,getSnapshot,getReadStatus,requestReconcile,resumeRealtime,resetSession,occurrenceKeyFor,releaseOccurrenceKey,runtimeVersion:'P3'});
})();
