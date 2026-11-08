// Local mocks only: no Supabase requests, credentials, real storage or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('assets/js/installation-execution.js',root),'utf8');
const serviceSource=fs.readFileSync(new URL('assets/js/installations-service.js',root),'utf8');
const contractSource=fs.readFileSync(new URL('assets/js/installations-service-contract.js',root),'utf8');
const flush=async()=>{for(let i=0;i<45;i++)await Promise.resolve()};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
class EventMock extends Event{constructor(type,detail){super(type);this.detail=detail}}
class Element extends EventTarget{
 constructor(){super();this.classes=new Set();this.classList={contains:k=>this.classes.has(k),add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:(k,on)=>{const yes=on??!this.classes.has(k);yes?this.classes.add(k):this.classes.delete(k);return yes}};this.value='';this.innerHTML='';this.textContent='';this.dataset={};this.style={};this.files=[];}
 setAttribute(k,v){this[k]=v}removeAttribute(k){delete this[k]}querySelectorAll(){return []}querySelector(){return null}
}
function harness({view='dashboard',allowed=true,user='A',online=true,hidden=false,realProxy=false}={}){
 let currentView=view,permission=allowed,state=user?{user:{id:user},profile:{id:user,role:'super_admin',is_active:true}}:{};
 let clock=0,sequence=0,readQueue=[],identityQueue=[],openGate=null,closeGate=null,subscribeFailure=null;
 const win=new EventTarget(),doc=new EventTarget(),nav={onLine:online},nodes=new Map(),timers=new Map();
 const reads=[],identityReads=[],channels=[],warnings=[],authCallbacks=[],notification={removed:false};
 for(const id of ['installationExecutionView','installationExecutionStatus','installationExecutionTodayCards','installationExecutionTodayCount','installationExecutionCurrentContent','installationExecutionCurrentBadge','installationExecutionDateFilter','installationExecutionTeamFilter','installationExecutionTechnicianFilter','installationExecutionTodayTab','installationExecutionCurrentTab','installationExecutionTodayPanel','installationExecutionCurrentPanel','refreshInstallationExecutionBtn','logoutBtn'])nodes.set(id,new Element());
 const syncView=()=>nodes.get('installationExecutionView').classList.toggle('hidden',currentView!=='installationExecution');syncView();
 doc.visibilityState=hidden?'hidden':'visible';doc.getElementById=id=>nodes.get(id)||null;doc.querySelectorAll=()=>[];doc.querySelector=()=>null;doc.readyState='loading';
 const schedule=(fn,ms=0)=>{const id=++sequence;timers.set(id,{at:clock+Number(ms),fn});return id};
 const cancel=id=>timers.delete(id);
 const api={
  async subscribeExecutionWorkspace(handler){
   if(subscribeFailure)throw subscribeFailure;
   const channel={handler,removed:false,closing:false};channels.push(channel);
   if(openGate)await openGate.promise;
   return async()=>{channel.closing=true;if(closeGate)await closeGate.promise;channel.removed=true};
  },
  executionWorkspace(options){reads.push({user:state.user?.id,online:nav.onLine,force:options?.force});return Promise.resolve(readQueue.length?readQueue.shift():[])},
  executionIdentity(){identityReads.push({user:state.user?.id});return Promise.resolve(identityQueue.length?identityQueue.shift():{lockIdentity:false})}
 };
 win.CustomerAuth={getState:()=>state};win.KYUMNavigation={current:()=>currentView};
 win.PermissionEngine={canView:()=>permission};win.CustomerPermissions={canScreen:()=>true};
 win.InstallationsService={getReadStatusMessage:()=>''};
 win.PetatoeLocalization={t:k=>k,translateMessage:v=>v,applyStatic(){},effectiveLanguage:()=> 'en'};
 win.customerSupabase={auth:{onAuthStateChange(fn){authCallbacks.push(fn)}}};
 const context=vm.createContext({window:win,document:doc,navigator:nav,console:{warn:(...a)=>warnings.push(a)},
  setTimeout:schedule,clearTimeout:cancel,URL,Promise,Map,Set,Date,Number,String,JSON,Intl});
 if(realProxy){win.InstallationsService=new Proxy(api,{get(target,key){if(key==='then')return undefined;return target[key]||(()=>{})}});vm.runInContext(contractSource,context)}
 else win.InstallationsServiceSafe=api;
 vm.runInContext(source,context);doc.dispatchEvent(new Event('DOMContentLoaded'));
 return {win,doc,nav,nodes,reads,identityReads,channels,timers,warnings,notification,api,
  status:()=>win.ExecutionRealtimeLifecycle.getStatus(),
  move(view){currentView=view;syncView();win.dispatchEvent(new EventMock('kyum-view-changed',{view}))},
  visibility(value){doc.visibilityState=value;doc.dispatchEvent(new Event('visibilitychange'))},
  async tick(ms=250){clock+=ms;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);await timer.fn()}await flush()},
  queueRead(value){readQueue.push(value)},queueIdentity(value){identityQueue.push(value)},
  setOpenGate:value=>{openGate=value},setCloseGate:value=>{closeGate=value},setSubscribeFailure:value=>{subscribeFailure=value},
  fire(channel=channels.at(-1)){channel?.handler({eventType:'UPDATE'})},
  setUser(id){state=id?{user:{id},profile:{id,role:'super_admin',is_active:true}}:{}},
  setState(value){state=value},setAllowed(value){permission=value;win.dispatchEvent(new Event('kyum-permissions-refreshed'))},
  ready(){win.dispatchEvent(new Event('customer-auth-ready'))},
  auth(event,session){for(const fn of authCallbacks)fn(event,session)},
  online(value){nav.onLine=value;win.dispatchEvent(new Event(value?'online':'offline'))},
  async refresh(){nodes.get('refreshInstallationExecutionBtn').dispatchEvent(new Event('click'));await flush()},
  activeChannels:()=>channels.filter(c=>!c.removed).length
 };
}
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const row=label=>({id:label,customerName:label,scheduledDate:today(),status:'مسند',services:[]});

test('dashboard boot creates no execution channel or screen reads',async()=>{
 const h=harness();await flush();assert.equal(h.channels.length,0);assert.equal(h.reads.length,0);assert.equal(h.status().active,false);
});
test('an authorized execution screen opens one stream and one workspace/identity read through the actual async Proxy',async()=>{
 const h=harness({realProxy:true});h.move('installationExecution');await flush();
 assert.equal(h.activeChannels(),1);assert.equal(h.reads.length,1);assert.equal(h.reads[0].force,true);assert.equal(h.identityReads.length,1);assert.equal(h.status().channelAttached,true);
});
test('anonymous, inactive, mismatched identity and denied permission do not start reads or channels',async()=>{
 for(const state of [{},{user:{id:'A'},profile:{id:'A',is_active:false}},{user:{id:'A'},profile:{id:'B'}}]){
  const h=harness();h.setState(state);h.move('installationExecution');await flush();assert.equal(h.reads.length,0);assert.equal(h.channels.length,0);
 }
 const h=harness({allowed:false,view:'installationExecution'});await flush();assert.equal(h.channels.length,0);assert.equal(h.reads.length,0);
});
test('repeated view and auth-ready events do not multiply the stream or initial read',async()=>{
 const h=harness({view:'installationExecution'});await flush();
 for(let i=0;i<10;i++){h.move('installationExecution');h.ready()}
 await flush();assert.equal(h.channels.length,1);assert.equal(h.reads.length,1);
});
test('a burst of realtime events coalesces into one refresh',async()=>{
 const h=harness({view:'installationExecution'});await flush();for(let i=0;i<20;i++)h.fire();
 assert.equal(h.timers.size,1);await h.tick();assert.equal(h.reads.length,2);
});
test('events during a read produce only one trailing reconciliation',async()=>{
 const h=harness();const waiting=deferred();h.queueRead(waiting.promise);h.move('installationExecution');await flush();
 for(let i=0;i<20;i++)h.fire();assert.equal(h.reads.length,1);
 waiting.resolve([]);await flush();await h.tick();assert.equal(h.reads.length,2);assert.equal(h.timers.size,0);
});
test('leaving cancels the pending timer and ignores callbacks from the retired stream',async()=>{
 const h=harness({view:'installationExecution'});await flush();const old=h.channels[0];h.fire(old);h.move('dashboard');await flush();h.fire(old);await h.tick();
 assert.equal(h.activeChannels(),0);assert.equal(h.reads.length,1);assert.equal(h.timers.size,0);assert.equal(h.notification.removed,false);
});
test('a late subscription is closed before a rapidly reopened screen creates another',async()=>{
 const h=harness({realProxy:true});const opening=deferred(),closing=deferred();h.setOpenGate(opening);h.setCloseGate(closing);
 h.move('installationExecution');await flush();h.move('dashboard');h.move('installationExecution');await flush();assert.equal(h.channels.length,1);
 opening.resolve();await flush();assert.equal(h.channels.length,1);assert.equal(h.channels[0].closing,true);
 closing.resolve();await flush();assert.equal(h.channels.length,2);assert.equal(h.activeChannels(),1);
});
test('leaving before the queued opener runs avoids creating the subscription',async()=>{
 const h=harness();h.move('installationExecution');h.move('dashboard');await flush();assert.equal(h.channels.length,0);assert.equal(h.reads.length,0);
});
test('hiding and showing the browser closes and recreates exactly one execution stream',async()=>{
 const h=harness({view:'installationExecution'});await flush();h.visibility('hidden');await flush();assert.equal(h.activeChannels(),0);
 h.visibility('visible');await flush();assert.equal(h.activeChannels(),1);assert.equal(h.reads.length,2);
});
test('hidden boot does not read until the execution screen becomes visible',async()=>{
 const h=harness({view:'installationExecution',hidden:true});await flush();assert.equal(h.reads.length,0);h.visibility('visible');await flush();assert.equal(h.reads.length,1);
});
test('offline execution uses the existing read path without a channel and reconciles once online',async()=>{
 const h=harness({view:'installationExecution',online:false});await flush();assert.equal(h.channels.length,0);assert.equal(h.reads[0].online,false);
 h.online(true);await flush();assert.equal(h.activeChannels(),1);assert.equal(h.reads.length,2);assert.equal(h.reads[1].online,true);
});
test('going offline closes the live stream while retaining an offline read session',async()=>{
 const h=harness({view:'installationExecution'});await flush();h.online(false);await flush();assert.equal(h.activeChannels(),0);assert.equal(h.status().active,true);assert.equal(h.status().online,false);
});
test('logout click blocks stale local auth state and clears the screen',async()=>{
 const h=harness();h.queueRead([row('A-only')]);h.move('installationExecution');await flush();assert.match(h.nodes.get('installationExecutionTodayCards').innerHTML,/A-only/);
 h.nodes.get('logoutBtn').dispatchEvent(new Event('click'));await flush();h.fire(h.channels[0]);await h.tick();
 assert.equal(h.activeChannels(),0);assert.equal(h.status().active,false);assert.doesNotMatch(h.nodes.get('installationExecutionTodayCards').innerHTML,/A-only/);assert.equal(h.reads.length,1);
});
test('SIGNED_OUT in another tab stops work before app state is cleared; token refresh alone does not reload',async()=>{
 const h=harness({view:'installationExecution'});await flush();h.auth('TOKEN_REFRESHED',{user:{id:'A'}});await flush();assert.equal(h.reads.length,1);
 h.auth('SIGNED_OUT',null);h.win.dispatchEvent(new Event('pageshow'));await flush();assert.equal(h.activeChannels(),0);assert.equal(h.reads.length,1);
 h.ready();await flush();assert.equal(h.activeChannels(),1);assert.equal(h.reads.length,2);
});
test('a result from user A cannot overwrite user B after account switch',async()=>{
 const h=harness();const old=deferred();h.queueRead(old.promise);h.move('installationExecution');await flush();
 h.auth('SIGNED_IN',{user:{id:'B'}});h.setUser('B');h.queueRead([row('B-only')]);h.ready();await flush();
 old.resolve([row('A-only')]);await flush();const html=h.nodes.get('installationExecutionTodayCards').innerHTML;
 assert.match(html,/B-only/);assert.doesNotMatch(html,/A-only/);assert.equal(h.activeChannels(),1);
});
test('a result arriving after navigation cannot repaint the inactive screen',async()=>{
 const h=harness();const old=deferred();h.queueRead(old.promise);h.move('installationExecution');await flush();h.move('dashboard');await flush();old.resolve([row('late-only')]);await flush();
 assert.doesNotMatch(h.nodes.get('installationExecutionTodayCards').innerHTML,/late-only/);
});
test('revoking execution access closes the stream and clears data; granting access reopens safely',async()=>{
 const h=harness({view:'installationExecution'});await flush();h.setAllowed(false);await flush();assert.equal(h.activeChannels(),0);assert.equal(h.status().active,false);
 h.setAllowed(true);await flush();assert.equal(h.activeChannels(),1);assert.equal(h.reads.length,2);
});
test('explicit refresh during an in-flight read waits for one subsequent read',async()=>{
 const h=harness();const old=deferred(),next=deferred();h.queueRead(old.promise);h.queueRead(next.promise);h.move('installationExecution');await flush();
 await h.refresh();await h.refresh();assert.equal(h.reads.length,1);old.resolve([row('old-version')]);await flush();assert.equal(h.reads.length,2);
 next.resolve([row('new-version')]);await flush();await h.tick();assert.equal(h.reads.length,2);assert.match(h.nodes.get('installationExecutionTodayCards').innerHTML,/new-version/);
});
test('pagehide/pageshow supports back-forward cache without leaking the old stream',async()=>{
 const h=harness({view:'installationExecution'});await flush();h.win.dispatchEvent(new Event('pagehide'));await flush();assert.equal(h.activeChannels(),0);
 h.win.dispatchEvent(new Event('pageshow'));await flush();assert.equal(h.activeChannels(),1);assert.equal(h.reads.length,2);
});
test('subscription rejection is contained and does not prevent the screen read',async()=>{
 const h=harness();h.setSubscribeFailure(new Error('mock subscription error'));h.move('installationExecution');await flush();
 assert.equal(h.reads.length,1);assert.equal(h.status().channelAttached,false);assert.equal(h.warnings.length,1);
});
test('the service cleanup forwards the actual removeChannel promise and touches only its execution channel',async()=>{
 const removal=deferred();let removed=null;
 const notification={name:'kyum-notifications-mock'},channel={on(){return channel},subscribe(){return channel}};
 const win={customerSupabase:{channel(name){assert.equal(name,'petatoe-execution-workspace-updates');return channel},removeChannel(value){removed=value;return removal.promise}},addEventListener(){},dispatchEvent(){}};
 const c=vm.createContext({window:win,navigator:{onLine:true},console,Map,Set,Promise,CustomEvent:EventMock});vm.runInContext(serviceSource,c);
 const close=win.InstallationsService.subscribeExecutionWorkspace(()=>{});const pending=close();assert.equal(pending,removal.promise);assert.equal(removed,channel);assert.notEqual(removed,notification);removal.resolve('ok');await pending;
});

function serviceReadHarness({online=true,fail=false}={}){
 const queries=[],cached=[{id:'cache-only'}],nav={onLine:online};
 const win={addEventListener(){},dispatchEvent(){},CustomerAuth:{getState:()=>({user:{id:'A'},profile:{id:'A',role:'super_admin'}})},
  KYUMOfflineSessionStore:{currentUserId:()=> 'A'},PermissionEngine:{can:()=>true,snapshot:()=>({rows:[]})},
  KYUMSmartCache:{hashValue:()=> 'mock-hash',async set(){},async get(key){
   if(key==='appointments:v1:scope')return {hit:true,data:{role:'super_admin',accessMode:'all'},metadata:{}};
   if(key.includes(':executionIdentity:'))return {hit:true,data:{role:'cached',canEdit:false},metadata:{}};
   return {hit:true,data:cached,metadata:{}};
  }},customerSupabase:{from(table){const q={};
   for(const method of ['select','eq','maybeSingle','or','order','in'])q[method]=()=>q;
   q.then=(resolve,reject)=>{queries.push(table);return Promise.resolve({data:[],error:fail?{code:'mock',message:'mock network failure'}:null}).then(resolve,reject)};return q;
  }}};
 const c=vm.createContext({window:win,navigator:nav,console:{warn(){}},Map,Set,Promise,CustomEvent:EventMock});vm.runInContext(serviceSource,c);
 return {api:win.InstallationsService,queries,cached};
}
test('online execution reconciliation returns the fresh workspace instead of the old cached rows',async()=>{
 const h=serviceReadHarness();const data=await h.api.executionWorkspace({force:true});assert.equal(data.length,0);assert.equal(h.queries.length,4);
});
test('online execution identity reconciliation also waits for its fresh reads',async()=>{
 const h=serviceReadHarness();const data=await h.api.executionIdentity({force:true});assert.equal(data.role,'super_admin');assert.equal(h.queries.length,2);
});
test('a forced execution read retains the existing cached fallback when the network fails',async()=>{
 const h=serviceReadHarness({fail:true});const data=await h.api.executionWorkspace({force:true});assert.equal(data[0].id,'cache-only');assert.equal(h.api.getReadStatus('execution').source,'cache');
});
test('an offline execution read uses the cache without issuing table reads',async()=>{
 const h=serviceReadHarness({online:false});const data=await h.api.executionWorkspace({force:true});assert.equal(data[0].id,'cache-only');assert.equal(h.queries.length,0);
});
test('callers without force retain the original cache-first execution behaviour',async()=>{
 const h=serviceReadHarness();const data=await h.api.executionWorkspace();assert.equal(data[0].id,'cache-only');await flush();assert.equal(h.queries.length,4);
});
