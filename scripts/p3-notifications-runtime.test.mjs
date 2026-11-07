// Local mocks only. Never connects to Supabase or modifies production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const serviceSource=fs.readFileSync(new URL('../assets/js/notification-center-service.js',import.meta.url),'utf8');
const uiSource=fs.readFileSync(new URL('../assets/js/notification-center.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
const row=(id,extra={})=>({id,user_id:'A',event_key:'installation.request_updated',title:'Same title',body:'Body',
  created_at:'2026-11-07T10:00:00Z',is_read:false,in_app_delivery:true,...extra});
class CustomEventMock extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
class ElementMock extends EventTarget{
  constructor(){super();this.classes=new Set(['hidden']);this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),
    contains:x=>this.classes.has(x),toggle:(x,on)=>{const yes=on===undefined?!this.classes.has(x):on;yes?this.classes.add(x):this.classes.delete(x);return yes}};
    this.style={setProperty(){}};this.dataset={};this.innerHTML='';this.textContent='';}
  setAttribute(key,value){this[key]=value}
  getBoundingClientRect(){return{left:20,width:46,bottom:60}}
}
function harness({cached,cacheGet,cacheSet,withUI=false,cacheFails=false}={}){
  let now=Date.parse('2026-11-07T10:00:00Z'),timerId=0;
  const timers=new Map(),reads=[],writes=[],rpcCalls=[],channels=[],cacheWrites=[],warnings=[],authCallbacks=[],cache=new Map();
  const readResults=[],writeResults=[],rpcResults=[];
  let removal=null;
  let state={user:{id:'A'},profile:{id:'A'},session:{user:{id:'A'}}};
  if(cached)cache.set('user:A',cached);
  const win=new EventTarget(),doc=new EventTarget(),nodes=new Map();
  for(const id of ['notificationBellBtn','notificationDropdown','notificationDropdownList','notificationUnreadBadge','notificationMarkAllRead','logoutBtn'])nodes.set(id,new ElementMock());
  doc.readyState='complete';doc.visibilityState='visible';doc.body={appendChild(node){node.parentElement=doc.body}};
  doc.getElementById=id=>nodes.get(id)||null;doc.querySelectorAll=()=>[];doc.querySelector=()=>null;
  const nav={onLine:true};
  const schedule=(fn,ms=0)=>{const id=++timerId;timers.set(id,{at:now+Number(ms),fn});return id};
  const cancel=id=>timers.delete(id);
  function from(table){
    const filters=[];let kind='read',data;
    const query={select(){return query},eq(k,v){filters.push([k,v]);return query},order(){return query},limit(){return query},
      update(value){kind='write';data=value;return query},
      then(resolve,reject){
        const record={table,filters:plain(filters),data,at:now};
        const queue=kind==='read'?readResults:writeResults;
        (kind==='read'?reads:writes).push(record);
        const value=queue.length?queue.shift():{data:[],error:null};
        return Promise.resolve(value).then(resolve,reject);
      }};
    return query;
  }
  const supabase={from,
    rpc(name,args){rpcCalls.push({name,args:plain(args)});return Promise.resolve(rpcResults.length?rpcResults.shift():{data:null,error:null})},
    channel(name){
      const channel={name,handlers:[],removed:false,on(type,filter,handler){channel.handlers.push({type,filter,handler});return channel},
        subscribe(callback){channel.callback=callback;return channel},
        status(value){channel.callback(value)},
        event(type,value){for(const h of channel.handlers)if(h.type==='postgres_changes'&&h.filter.event===type)h.handler({new:value})},
        system(value){for(const h of channel.handlers)if(h.type==='system')h.handler(value)}};
      channels.push(channel);return channel;
    },
    async removeChannel(channel){if(removal)await removal.promise;channel.removed=true;return'ok'},
    auth:{onAuthStateChange(callback){authCallbacks.push(callback);return{data:{subscription:{unsubscribe(){}}}}}}};
  win.customerSupabase=supabase;win.CustomerAuth={getState:()=>state};
  win.KYUMSmartCache={
    async get(key,options){if(cacheFails)throw new Error('Cache unavailable');if(cacheGet)return cacheGet();return{data:cache.get(options.namespace)}},
    async set(key,data,options){if(cacheFails)throw new Error('Cache unavailable');if(cacheSet)await cacheSet();cacheWrites.push({namespace:options.namespace,rows:plain(data)});cache.set(options.namespace,plain(data))},
    async removePrefix(key,options){cache.delete(options.namespace)}};
  let syncRead;
  win.KYUMSyncEngine={register(name,fn){syncRead=fn}};
  win.matchMedia=()=>({matches:false,addEventListener(){}});
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context=vm.createContext({window:win,document:doc,navigator:nav,CustomEvent:CustomEventMock,Date:ClockDate,crypto:webcrypto,
    TextEncoder,Uint8Array,atob,btoa,CSS:{escape:x=>x},URLSearchParams,
    location:{search:'',pathname:'/',hash:''},history:{replaceState(){}},
    console:{warn:(...args)=>warnings.push(args)},setTimeout:schedule,clearTimeout:cancel,
    setInterval(){throw new Error('Notification polling interval must not be reintroduced')}});
  vm.runInContext(serviceSource,context);
  if(withUI)vm.runInContext(uiSource,context);
  const api={service:win.NotificationCenterService,ui:win.NotificationCenterUI,win,doc,nodes,nav,reads,writes,rpcCalls,channels,cacheWrites,
    readResults,writeResults,rpcResults,warnings,context,
    setUser(id){state=id?{user:{id},profile:{id},session:{user:{id}}}:{user:null,profile:null,session:null}},
    setState(value){state=value},setRemoval(value){removal=value},
    async auth(event,id){for(const fn of authCallbacks)fn(event,id?{user:{id}}:null);await flush()},
    event(name,detail){win.dispatchEvent(new CustomEventMock(name,{detail}))},
    sync(){return syncRead()},
    async tick(ms){const end=now+ms;let count=0;
      await flush();
      while(true){let nextId,next;for(const[id,item]of timers)if(item.at<=end&&(!next||item.at<next.at)){next=item;nextId=id}
        if(!next)break;if(++count>1000)throw new Error('Timer loop');now=next.at;timers.delete(nextId);next.fn();await flush();}
      now=end;await flush();
    }};
  return api;
}

test('INSERT identity, UPDATE read state and user filtering share one bounded snapshot',async()=>{
  const h=harness();h.service.subscribe();await flush();const c=h.channels[0];c.status('SUBSCRIBED');
  h.readResults.push({data:[row('1')],error:null});await h.service.listMine();
  c.event('INSERT',row('1'));c.event('INSERT',row('2'));c.event('UPDATE',row('1',{is_read:true}));
  c.event('INSERT',row('1'));c.event('UPDATE',row('1',{is_read:false}));
  c.event('INSERT',row('foreign',{user_id:'B'}));
  assert.deepEqual(plain(h.service.getSnapshot()).map(x=>[x.id,x.is_read]),[['2',false],['1',true]]);
  c.event('UPDATE',row('2',{in_app_delivery:false}));assert.equal(h.service.getSnapshot().length,1);
  for(let i=0;i<500;i++)c.event('INSERT',row('bulk'+i));
  assert.equal(h.service.getSnapshot(100).length,100);await flush();
  assert.ok(h.cacheWrites.length<20,'cache writes are coalesced');
});

test('a missing or mismatched activated profile does not start notification access',async()=>{
  const h=harness();
  for(const state of [{user:{id:'A'},profile:null},{user:{id:'B'},profile:{id:'A'}}]){
    h.setState(state);h.service.subscribe();assert.equal((await h.service.listMine()).length,0);
    await h.service.emit('installation.request_updated',{requestId:'R'});
  }
  await flush();assert.equal(h.channels.length,0);assert.equal(h.reads.length,0);assert.equal(h.rpcCalls.length,0);
});

test('a snapshot cannot overwrite INSERT/UPDATE events delivered during its read',async()=>{
  const h=harness(),response=deferred();h.service.subscribe();await flush();h.channels[0].status('SUBSCRIBED');
  h.readResults.push(response.promise);const pending=h.service.listMine();await flush();
  h.channels[0].event('INSERT',row('2'));h.channels[0].event('UPDATE',row('1',{is_read:true}));
  response.resolve({data:[row('1')],error:null});await pending;
  assert.deepEqual(plain(h.service.getSnapshot()).map(x=>[x.id,x.is_read]),[['2',false],['1',true]]);
});

test('a notification hidden during cache hydration is not restored from old cache',async()=>{
  const cache=deferred(),h=harness({cacheGet:()=>cache.promise});
  h.service.subscribe();await flush();const pending=h.service.listMine(50,{cacheOnly:true});await flush();
  h.channels[0].event('UPDATE',row('1',{in_app_delivery:false}));cache.resolve({data:[row('1')]});await pending;
  assert.equal(h.service.getSnapshot().length,0);
});

test('local mark-read survives a concurrent stale snapshot; unknown IDs add no blank row',async()=>{
  const h=harness();h.readResults.push({data:[row('1')],error:null});await h.service.listMine();await h.tick(5000);
  const response=deferred();h.readResults.push(response.promise);const pending=h.service.listMine(50,{force:true});await flush();
  await h.service.markRead('1');response.resolve({data:[row('1')],error:null});await pending;
  assert.equal(h.service.getSnapshot()[0].is_read,true);
  await h.service.markRead('unknown');assert.equal(h.service.getSnapshot().length,1);
  assert.ok(h.writes.every(x=>x.filters.some(([k,v])=>k==='user_id'&&v==='A')));
});

test('mark-all-read preserves a new unread notification arriving during the update',async()=>{
  const h=harness(),write=deferred();h.service.subscribe();await flush();
  h.readResults.push({data:[row('1')],error:null});await h.service.listMine();
  h.writeResults.push(write.promise);const pending=h.service.markAllRead();await flush();
  h.channels[0].event('INSERT',row('2'));write.resolve({error:null});await pending;
  assert.deepEqual(plain(h.service.getSnapshot()).map(x=>[x.id,x.is_read]),[['2',false],['1',true]]);
});

test('single flight respects each reader limit and optional cache failures allow network reads',async()=>{
  const h=harness({cacheFails:true}),response=deferred();h.readResults.push(response.promise);
  const a=h.service.listMine(20),b=h.service.listMine(1);await flush();assert.equal(h.reads.length,1);
  response.resolve({data:[row('1'),row('2')],error:null});
  assert.equal((await a).length,2);assert.equal((await b).length,1);
});

test('cached data cannot bypass the central REST backoff, including sync and force calls',async()=>{
  const h=harness({cached:[row('1')]});h.readResults.push({error:{code:'PGRST002',status:503,message:'schema cache unavailable'}});
  assert.equal((await h.service.listMine()).length,1);const status=h.service.getReadStatus();
  assert.equal(status.failures,1);assert.ok(status.retryAfter>status.lastAttemptAt);
  for(let i=0;i<20;i++){await h.service.listMine(50,{force:true});await h.sync()}
  assert.equal(h.reads.length,1);await h.tick(6000);await h.service.listMine();assert.equal(h.reads.length,2);
});

test('slow cache persistence does not hold network reads or acknowledged mark-read actions',async()=>{
  const write=deferred(),h=harness({cacheSet:()=>write.promise});
  h.readResults.push({data:[row('1')],error:null});await h.service.listMine();
  await h.service.markRead('1');assert.equal(h.service.getSnapshot()[0].is_read,true);
  await h.tick(5000);await h.service.listMine(50,{force:true});assert.equal(h.reads.length,2);
  write.resolve();await flush();
});

test('release metadata and cache versions agree, with Arabic and English release notes',()=>{
  const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
  const release=JSON.parse(read('version.json')),pkg=JSON.parse(read('package.json')),pwa=read('assets/js/pwa.js'),sw=read('service-worker.js'),html=read('index.html');
  assert.equal(release.version,pkg.version);assert.equal(release.version,'18.56.141');
  assert.ok(pwa.includes('const CURRENT_VERSION = "'+release.version+'"'));
  assert.ok(sw.includes('const CACHE_VERSION = "'+release.cacheToken+'"'));
  for(const script of ['notification-center-service','notification-center','installations-service','pwa'])assert.ok(html.includes('assets/js/'+script+'.js?v='+release.version));
  assert.ok(release.title&&release.titleEn&&release.notes.length&&release.notesEn.length);
});

test('healthy WebSocket replaces minute polling and keeps a 15-minute reconciliation',async()=>{
  const h=harness({withUI:true});h.readResults.push({data:[row('1')],error:null});await h.tick(0);
  h.channels[0].status('SUBSCRIBED');await h.tick(1000);
  h.event('customer-auth-ready');h.event('kyum-auth-state-changed');await h.tick(70000);
  assert.equal(h.channels.length,1);assert.equal(h.reads.length,1);
  h.channels[0].event('INSERT',row('1'));h.channels[0].event('INSERT',row('2'));await flush();
  assert.equal((h.nodes.get('notificationDropdownList').innerHTML.match(/data-notification-id=/g)||[]).length,2);
  assert.equal(h.nodes.get('notificationUnreadBadge').textContent,'2');
  await h.tick(15*60000);assert.equal(h.reads.length,2);
});

test('Realtime failure retains REST fallback, bounded retries, and hidden/offline silence',async()=>{
  const h=harness({withUI:true,cached:[row('cached')]});
  h.readResults.push({error:{status:503,message:'PGRST002'}});await h.tick(0);h.channels[0].status('CHANNEL_ERROR');await h.tick(1000);
  assert.equal(h.reads.length,1);const until=h.service.getReadStatus().retryAfter;
  await h.ui.refresh({force:true});assert.equal(h.reads.length,1);
  h.doc.visibilityState='hidden';h.doc.dispatchEvent(new Event('visibilitychange'));await h.tick(6*60000);assert.equal(h.reads.length,1);
  h.nav.onLine=false;h.doc.visibilityState='visible';h.doc.dispatchEvent(new Event('visibilitychange'));await h.tick(60000);assert.equal(h.reads.length,1);
  h.nav.onLine=true;h.event('online');await h.tick(1000);assert.equal(h.reads.length,2);
  assert.ok(until>0);
});

test('initial REST load works even if the Realtime channel never subscribes',async()=>{
  const h=harness({withUI:true});h.readResults.push({data:[row('rest')],error:null});await h.tick(2500);
  assert.equal(h.reads.length,1);assert.match(h.nodes.get('notificationDropdownList').innerHTML,/rest/);
});

test('reconnection during an in-flight snapshot still requires a later reconciliation',async()=>{
  const h=harness(),response=deferred();h.service.subscribe();await flush();h.channels[0].status('SUBSCRIBED');
  h.readResults.push(response.promise);const pending=h.service.listMine();await flush();
  h.channels[0].status('CHANNEL_ERROR');h.channels[0].status('SUBSCRIBED');
  response.resolve({data:[row('1')],error:null});await pending;
  assert.equal(h.service.getReadStatus().needsReconcile,true);
  await h.tick(5000);await h.service.listMine();assert.equal(h.reads.length,2);
});

test('account switching discards old reads/events and waits for the old channel to close',async()=>{
  const h=harness({withUI:true}),response=deferred(),removal=deferred();h.readResults.push(response.promise);await h.tick(2500);
  const old=h.channels[0];h.setRemoval(removal);h.setUser('B');await h.auth('SIGNED_IN','B');h.event('customer-auth-ready');await flush();
  assert.equal(h.channels.length,1,'new subscription waits for removal');
  old.event('INSERT',row('leaked'));response.resolve({data:[row('old-read')],error:null});await flush();
  assert.doesNotMatch(h.nodes.get('notificationDropdownList').innerHTML,/leaked|old-read/);
  removal.resolve();await flush();assert.equal(h.channels.length,2);assert.equal(old.removed,true);
  h.readResults.push({data:[row('B-row',{user_id:'B'})],error:null});h.channels[1].status('SUBSCRIBED');await h.tick(1000);
  assert.match(h.nodes.get('notificationDropdownList').innerHTML,/B-row/);
  assert.ok(h.cacheWrites.filter(x=>x.namespace==='user:B').every(x=>x.rows.every(r=>r.user_id==='B')));
  h.setUser(null);await h.auth('SIGNED_OUT');await h.tick(1000);
  assert.equal(h.service.getSnapshot().length,0);assert.equal(h.nodes.get('notificationUnreadBadge').textContent,'0');
  assert.equal(h.channels[1].removed,true);
});

test('offline logout clears the notification panel and duplicate script inclusion is harmless',async()=>{
  const h=harness({withUI:true,cached:[row('secret')]});await h.tick(0);await h.ui.refresh({cacheOnly:true});
  const oldService=h.service,oldUI=h.ui;vm.runInContext(serviceSource,h.context);vm.runInContext(uiSource,h.context);
  assert.equal(h.win.NotificationCenterService,oldService);assert.equal(h.win.NotificationCenterUI,oldUI);
  h.nav.onLine=false;h.nodes.get('logoutBtn').dispatchEvent(new Event('click'));await flush();
  assert.doesNotMatch(h.nodes.get('notificationDropdownList').innerHTML,/secret/);assert.equal(h.channels[0].removed,true);
});

test('repeat emits share the same occurrence; failures can retry; distinct actions remain distinct',async()=>{
  const h=harness(),reply=deferred(),args={requestId:'R',occurrenceKey:'operation-1'};h.rpcResults.push(reply.promise);
  const a=h.service.emit('installation.request_updated',args),b=h.service.emit('installation.request_updated',args);await flush();
  assert.equal(h.rpcCalls.length,1);reply.resolve({error:null});await Promise.all([a,b]);
  await h.service.emit('installation.request_updated',args);assert.equal(h.rpcCalls.length,1);
  h.rpcResults.push({error:{message:'503'}});await h.service.emit('installation.request_updated',{...args,occurrenceKey:'operation-2'});
  await h.service.emit('installation.request_updated',{...args,occurrenceKey:'operation-2'});assert.equal(h.rpcCalls.length,3);
  await h.service.emit('installation.request_updated',{...args,occurrenceKey:'operation-3'});assert.equal(h.rpcCalls.length,4);
  const thrown=deferred(),retryArgs={...args,occurrenceKey:'operation-4'};h.rpcResults.push(thrown.promise);
  const failedA=h.service.emit('installation.request_updated',retryArgs),failedB=h.service.emit('installation.request_updated',retryArgs);
  await flush();thrown.reject(new Error('Network failed'));await Promise.all([failedA,failedB]);
  await h.service.emit('installation.request_updated',retryArgs);assert.equal(h.rpcCalls.length,6);
  const payload={id:'R',notes:'one'},key=h.service.occurrenceKeyFor('edit',payload);
  assert.equal(h.service.occurrenceKeyFor('edit',payload),key);
  payload.notes='two';assert.notEqual(h.service.occurrenceKeyFor('edit',payload),key);
  const second=h.service.occurrenceKeyFor('edit',payload);h.service.releaseOccurrenceKey(payload,second);
  assert.notEqual(h.service.occurrenceKeyFor('edit',payload),second,'a successful later save is a new event');
  h.context.crypto={randomUUID(){throw new Error('Unavailable')}};
  assert.ok(h.service.occurrenceKeyFor('edit',{id:'fallback'}),'optional crypto cannot block an operation');
});
