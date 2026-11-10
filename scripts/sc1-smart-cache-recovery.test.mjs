// Isolated in-memory IndexedDB only. No browser storage, Supabase or credentials.
// Test dependency: fake-indexeddb 6.2.7 (not a production dependency).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {IDBFactory,IDBKeyRange,forceCloseDatabase}=require(process.env.PETATOE_SC1_TEST_MODULE||'fake-indexeddb');
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('assets/js/smart-cache.js',root),'utf8');
const DB='kyum_crm_smart_cache';
const plain=v=>JSON.parse(JSON.stringify(v));
const requestResult=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let i=0;i<1000;i++){if(predicate())return;await tick()}throw Error('Local test condition did not settle')}
async function rawOpen(factory,version=1){
  const request=factory.open(DB,version);request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains('entries')){const store=request.result.createObjectStore('entries',{keyPath:'id'});store.createIndex('namespace','namespace');store.createIndex('updatedAt','updatedAt')}
  };return requestResult(request);
}
async function rawRead(factory,id){const db=await rawOpen(factory);try{return await requestResult(db.transaction('entries').objectStore('entries').get(id))}finally{db.close()}}
async function rawWrite(factory,entry){
  const db=await rawOpen(factory);try{await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put(entry);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
function harness({factory=new IDBFactory(),supported=true,throwOpens=0,closeOnOpen=0,blockedSignal=false,versionOverride=null}={}){
  let clock=Date.UTC(2026,10,8),opens=0,openFaults=throwOpens,earlyCloses=closeOnOpen,blockNext=blockedSignal;
  let nextTxError=null,nextOperationError=null,abortNextWrite=false,abortNextCursor=false;
  const handles=[],warnings=[],transactions=[],putCalls=[],deleteCalls=[],openRequests=[];
  const facade={open(name,version){
    opens++;assert.equal(name,DB);assert.equal(version,1);
    if(openFaults>0){openFaults--;throw new DOMException('Mock open denied','UnknownError')}
    const request=factory.open(name,versionOverride??version);openRequests.push(request);
    if(blockNext){blockNext=false;queueMicrotask(()=>request.onblocked?.({type:'blocked'}))}
    request.addEventListener('success',()=>{
      const db=request.result;handles.push(db);const original=db.transaction.bind(db);
      db.transaction=(...args)=>{
        if(nextTxError){const error=nextTxError;nextTxError=null;throw error}
        const tx=original(...args);transactions.push(tx);const getStore=tx.objectStore.bind(tx);const stores=new Map();
        tx.objectStore=name=>{
          if(stores.has(name))return stores.get(name);
          const store=getStore(name);stores.set(name,store);
          for(const method of ['get','put','delete','openCursor']){
            const run=store[method].bind(store);
            store[method]=(...args)=>{
              if(nextOperationError){const error=nextOperationError;nextOperationError=null;throw error}
              if(method==='put')putCalls.push(args[0].id);if(method==='delete')deleteCalls.push(args[0]);
              const req=run(...args);
              if(method==='put'&&abortNextWrite){abortNextWrite=false;tx.abort()}
              if(method==='openCursor'&&abortNextCursor){abortNextCursor=false;tx.abort()}
              return req;
            };
          }
          return store;
        };
        return tx;
      };
      if(earlyCloses>0){earlyCloses--;db.close()}
    });
    return request;
  },deleteDatabase(){throw Error('The service must never delete its database')}};
  const win={dispatchEvent(){},addEventListener(){}};if(supported)win.indexedDB=facade;
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
  const context=vm.createContext({window:win,indexedDB:facade,IDBKeyRange,Date:ClockDate,structuredClone,console:{warn:(...args)=>warnings.push(args)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},fetch(){throw Error('Unexpected network')}});
  vm.runInContext(source,context);
  return{service:win.KYUMSmartCache,win,context,factory,handles,warnings,transactions,putCalls,deleteCalls,openRequests,
    openCount:()=>opens,advance:ms=>{clock+=ms},status:()=>plain(win.KYUMSmartCache.getConnectionStatus()),
    failNextTransaction:name=>{nextTxError=new DOMException('Mock transaction creation failure',name)},
    failNextOperation:name=>{nextOperationError=new DOMException('Mock operation failure',name)},
    abortWrite:()=>{abortNextWrite=true},abortCursor:()=>{abortNextCursor=true},
    closeSilently(){handles.at(-1).close()},forceClose(){forceCloseDatabase(handles.at(-1))},
    close(){for(const db of handles)db.close()}
  };
}
const ns={namespace:'user:A'};
async function seed(h){await h.service.set('keep:one',[{id:'A',value:7}],ns);await h.service.set('keep:two',[1,2],ns);await h.service.set('keep:one',[{id:'B',value:9}],{namespace:'user:B'})}

test('normal persistence, schema, indexes and legacy metadata stay compatible',async()=>{
  const h=harness();const meta=await h.service.set('sample',[1,2],{...ns,source:'local-test',schemaVersion:4,ttlMs:1000});
  const hit=await h.service.get('sample',ns);assert.equal(hit.hit,true);assert.deepEqual(plain(hit.data),[1,2]);assert.equal(hit.metadata.hash,meta.hash);assert.equal(hit.metadata.source,'local-test');assert.equal(hit.metadata.schemaVersion,4);
  assert.equal(h.service.version,'M13.5');assert.equal(h.service.runtimeVersion,'SC1');assert.equal(h.handles[0].version,1);
  assert.deepEqual([...h.handles[0].objectStoreNames],['entries']);assert.deepEqual([...h.handles[0].transaction('entries').objectStore('entries').indexNames],['namespace','updatedAt']);h.close();
});
test('a second page reads the persisted cache without relying on the first page memory',async()=>{
  const factory=new IDBFactory(),first=harness({factory});await seed(first);first.close();const h=harness({factory});
  assert.deepEqual(plain((await h.service.get('keep:one',ns)).data),[{id:'A',value:7}]);assert.equal(h.warnings.length,0);h.close();
});
test('concurrent cold reads and writes share one opening request',async()=>{
  const h=harness();await Promise.all(Array.from({length:30},(_,i)=>h.service.set('key:'+i,{i},ns)));
  await Promise.all(Array.from({length:30},(_,i)=>h.service.get('key:'+i,ns)));
  assert.equal(h.openCount(),1);assert.equal(h.putCalls.length,30);assert.equal(h.warnings.length,0);h.close();
});

for(const kind of ['read','write','remove','prefix','stats'])for(const mode of ['silent','forced'])test(`${kind} recovers after ${mode} closure without clearing other entries or namespaces`,async()=>{
  const h=harness();await seed(h);mode==='silent'?h.closeSilently():h.forceClose();if(mode==='forced')await until(()=>h.status().invalidations===1);
  if(kind==='read')assert.deepEqual(plain((await h.service.get('keep:one',ns)).data),[{id:'A',value:7}]);
  if(kind==='write'){await h.service.set('new',{value:11},ns);assert.equal((await rawRead(h.factory,'user:A::new')).data.value,11)}
  if(kind==='remove'){await h.service.remove('keep:two',ns);assert.equal(await rawRead(h.factory,'user:A::keep:two'),undefined)}
  if(kind==='prefix'){await h.service.removePrefix('keep:',ns);assert.equal(await rawRead(h.factory,'user:A::keep:one'),undefined);assert.equal(await rawRead(h.factory,'user:A::keep:two'),undefined)}
  if(kind==='stats'){const stats=await h.service.stats(ns);assert.equal(stats.entries,2);assert.equal(stats.records,3)}
  assert.deepEqual(plain((await rawRead(h.factory,'user:B::keep:one')).data),[{id:'B',value:9}]);
  if(!['remove','prefix'].includes(kind))assert.ok(await rawRead(h.factory,'user:A::keep:two'));
  assert.equal(h.openCount(),2);assert.equal(h.warnings.length,0);assert.equal(h.status().transactionRetries,mode==='silent'?1:0);h.close();
});
test('a cold page can recover a silently closed handle and still read disk-only entries',async()=>{
  const factory=new IDBFactory(),old=harness({factory});await seed(old);old.close();const h=harness({factory,closeOnOpen:1});
  const hit=await h.service.get('keep:one',ns);assert.equal(hit.hit,true);assert.deepEqual(plain(hit.data),[{id:'A',value:7}]);assert.equal(h.openCount(),2);assert.equal(h.status().transactionRetries,1);h.close();
});
test('many concurrent callers replace a closed handle once and preserve write ordering',async()=>{
  const h=harness();await seed(h);h.closeSilently();
  await Promise.all(Array.from({length:40},(_,i)=>h.service.set('ordered',{sequence:i},ns)));
  assert.equal(h.openCount(),2);assert.equal((await rawRead(h.factory,'user:A::ordered')).data.sequence,39);assert.equal(h.warnings.length,0);h.close();
});
test('a late close event from an old handle cannot invalidate a newer connection',async()=>{
  const h=harness();await seed(h);const old=h.handles[0];h.closeSilently();await h.service.get('keep:one',ns);const count=h.openCount();old.onclose();
  assert.equal(h.status().state,'open');await h.service.get('keep:two',ns);assert.equal(h.openCount(),count);h.close();
});
test('repeatedly closing fresh handles produces one retry then a cooldown, not a reopen loop',async()=>{
  const h=harness({closeOnOpen:2});await h.service.set('volatile',{value:1},ns);
  assert.equal(h.openCount(),2);assert.equal(h.putCalls.length,0);assert.equal(h.status().state,'backoff');assert.equal(h.warnings.length,1);
  for(let i=0;i<20;i++)assert.equal((await h.service.get('volatile',ns)).data.value,1);
  assert.equal(h.openCount(),2);h.advance(5001);await h.service.set('persisted',{value:2},ns);assert.equal(h.openCount(),3);assert.equal((await rawRead(h.factory,'user:A::persisted')).data.value,2);h.close();
});
test('synchronous open failure is shared and retried by a later operation after cooldown',async()=>{
  const h=harness({throwOpens:1});await h.service.set('volatile',{value:1},ns);assert.equal(h.openCount(),1);assert.equal(h.status().state,'backoff');
  await Promise.all(Array.from({length:20},()=>h.service.get('volatile',ns)));assert.equal(h.openCount(),1);assert.equal(h.warnings.length,1);
  h.advance(5001);await h.service.set('persisted',{value:2},ns);assert.equal(h.openCount(),2);assert.equal((await rawRead(h.factory,'user:A::persisted')).data.value,2);h.close();
});
test('an asynchronous VersionError uses memory and backs off without downgrading or deleting data',async()=>{
  const factory=new IDBFactory(),newer=await rawOpen(factory,2);newer.close();const h=harness({factory});
  await h.service.set('volatile',{value:1},ns);assert.equal(h.status().state,'backoff');assert.equal(h.openCount(),1);assert.equal((await h.service.get('volatile',ns)).data.value,1);
  const check=await rawOpen(factory,2);assert.equal(check.version,2);check.close();h.close();
});
test('versionchange releases this page handle and prevents the old page blocking another page upgrade',async()=>{
  const h=harness();await seed(h);const upgrade=await rawOpen(h.factory,2);assert.equal(upgrade.version,2);assert.equal(h.status().state,'reload-required');assert.equal(h.status().reloadRequired,true);
  const count=h.openCount();await h.service.get('keep:one',ns);await h.service.set('memory-only',{x:1},ns);assert.equal(h.openCount(),count);assert.equal(h.warnings.length,0);upgrade.close();h.close();
});
test('a blocked open that later needs an upgrade is aborted without a late schema change',async()=>{
  const factory=new IDBFactory(),owner=await rawOpen(factory);owner.onversionchange=()=>{};const h=harness({factory,versionOverride:2});
  await h.service.set('volatile',{value:1},ns);assert.equal(h.status().state,'backoff');assert.equal(h.status().blockedOpens,1);assert.equal(h.status().openFailures,1);
  owner.close();await until(()=>h.openRequests[0].readyState==='done');const check=await rawOpen(factory);assert.equal(check.version,1);check.close();assert.equal(h.warnings.length,1);h.close();
});
test('late success after an already blocked result is closed and is not cached as a live handle',async()=>{
  const factory=new IDBFactory(),existing=await rawOpen(factory);existing.close();
  const h=harness({factory,blockedSignal:true});await h.service.set('volatile',{x:1},ns);await until(()=>h.handles.length===1);
  assert.equal(h.status().state,'backoff');assert.equal(h.status().successfulOpens,0);assert.throws(()=>h.handles[0].transaction('entries'),{name:'InvalidStateError'});
  h.advance(5001);await h.service.set('later',{x:2},ns);assert.equal(h.openCount(),2);assert.equal(h.status().state,'open');h.close();
});
test('NotFoundError at transaction creation is reported without rebuilding the schema or retrying',async()=>{
  const h=harness();await seed(h);const count=h.openCount();h.failNextTransaction('NotFoundError');await h.service.get('keep:one',ns);
  assert.equal(h.openCount(),count);assert.equal(h.status().transactionRetries,0);assert.equal(h.warnings.length,1);assert.equal(h.handles[0].version,1);h.close();
});
test('InvalidStateError after transaction creation does not replay an operation',async()=>{
  const h=harness();await seed(h);const count=h.openCount();h.failNextOperation('InvalidStateError');await h.service.get('keep:one',ns);
  assert.equal(h.openCount(),count);assert.equal(h.status().transactionRetries,0);assert.equal(h.warnings.length,1);h.close();
});
test('a started write transaction aborts once without being automatically replayed',async()=>{
  const h=harness();await seed(h);const before=h.putCalls.length;h.abortWrite();await h.service.set('aborted',{x:1},ns);
  assert.equal(h.putCalls.length,before+1);assert.equal(await rawRead(h.factory,'user:A::aborted'),undefined);assert.equal(h.status().transactionRetries,0);assert.equal(h.warnings.length,1);h.close();
});
test('quota failure on a write does not cause a reconnect or replay',async()=>{
  const h=harness();await seed(h);const count=h.openCount();h.failNextOperation('QuotaExceededError');await h.service.set('quota',{x:1},ns);
  assert.equal(h.openCount(),count);assert.equal(h.status().transactionRetries,0);assert.equal(h.warnings.length,1);h.close();
});
test('aborted prefix deletion settles without hanging and is not replayed',async()=>{
  const h=harness();await seed(h);h.abortCursor();await h.service.removePrefix('keep:',ns);
  assert.ok(await rawRead(h.factory,'user:A::keep:one'));assert.equal(h.warnings.length,1);assert.equal(h.status().transactionRetries,0);h.close();
});
test('an aborted stats transaction settles without hanging or replaying its cursor',async()=>{
  const h=harness();await seed(h);const db=h.handles[0],original=db.transaction.bind(db);let abort=true;
  db.transaction=(...args)=>{const tx=original(...args);if(abort){abort=false;queueMicrotask(()=>tx.abort())}return tx};
  const result=await h.service.stats(ns);assert.equal(typeof result.entries,'number');assert.equal(h.warnings.length,1);assert.equal(h.status().transactionRetries,0);h.close();
});
test('memory fallback retains namespaces and the public API when IndexedDB is unavailable',async()=>{
  const h=harness({supported:false});await seed(h);assert.equal(h.openCount(),0);assert.equal((await h.service.get('keep:one',ns)).data[0].id,'A');
  assert.equal((await h.service.stats(ns)).records,3);await h.service.removePrefix('keep:',ns);assert.equal((await h.service.get('keep:one',ns)).hit,false);assert.equal((await h.service.get('keep:one',{namespace:'user:B'})).data[0].id,'B');assert.equal(h.status().state,'unavailable');
});
test('TTL boundaries, maximum stale age and explicit allowStaleAnyAge keep their existing behavior',async()=>{
  const h=harness();await h.service.set('expiry',{x:1},{...ns,ttlMs:1000,staleMaxMs:2000});h.advance(1000);assert.equal((await h.service.get('expiry',ns)).stale,false);
  h.advance(1);assert.equal((await h.service.get('expiry',ns)).hit,false);assert.equal((await h.service.get('expiry',{...ns,allowStale:true})).hit,true);
  h.advance(1001);assert.equal((await h.service.get('expiry',{...ns,allowStale:true})).hit,false);assert.equal((await h.service.get('expiry',{...ns,allowStale:true,allowStaleAnyAge:true})).hit,true);h.close();
});
test('integrity failure removes only the corrupt entry and preserves the other user namespace',async()=>{
  const h=harness();await seed(h);const entry=await rawRead(h.factory,'user:A::keep:one');entry.hash='corrupt';await rawWrite(h.factory,entry);
  const hit=await h.service.get('keep:one',ns);assert.equal(hit.integrityFailed,true);assert.equal(hit.hit,false);assert.equal(await rawRead(h.factory,'user:A::keep:one'),undefined);assert.ok(await rawRead(h.factory,'user:B::keep:one'));h.close();
});
test('reopening cache connections does not touch a separate queue database',async()=>{
  const h=harness(),request=h.factory.open('MOCK_SEPARATE_QUEUE',1);request.onupgradeneeded=()=>request.result.createObjectStore('operations',{keyPath:'id'});const queue=await requestResult(request);
  await new Promise((resolve,reject)=>{const tx=queue.transaction('operations','readwrite');tx.objectStore('operations').put({id:'pending-operation',status:'pending'});tx.oncomplete=resolve;tx.onabort=reject});
  await seed(h);h.closeSilently();await h.service.set('cache',{x:1},ns);h.forceClose();await until(()=>h.status().invalidations===2);await h.service.get('cache',ns);
  assert.equal((await requestResult(queue.transaction('operations').objectStore('operations').get('pending-operation'))).status,'pending');queue.close();h.close();
});
test('connection diagnostics are passive, contain no entries and open no database',()=>{
  const h=harness();const state=h.status();assert.equal(h.openCount(),0);assert.equal(state.state,'idle');assert.equal(state.runtime,'SC1');assert.equal(state.database,DB);assert.equal(state.schemaVersion,1);assert.equal('namespace' in state,false);assert.equal('data' in state,false);assert.equal(h.warnings.length,0);
});
test('the delivered live capture prints a result without opening databases, network calls or listener changes',()=>{
  let mutations=0;const deny=()=>{mutations++;throw Error('Unexpected side effect')};let output='';
  const script=fs.readFileSync(new URL('scripts/sc1-live-readonly.js',root),'utf8');
  const win={KYUM_RELEASE_VERSION:'18.56.144',customerSupabaseStatus:{configured:true},CustomerAuth:{getState:()=>({initialized:true,offline:false})},
    KYUMSmartCache:{runtimeVersion:'SC1',getConnectionStatus:()=>({state:'open',schemaVersion:1}),health:deny},
    customerSupabase:{getChannels:()=>[{topic:'realtime:kyum-notifications-mock'}],rpc:deny,from:deny,channel:deny,auth:{getSession:deny}},
    VehicleTreasuryService:{runtimeVersion:'P5'},PayrollService:{runtimeVersion:'P5'},SeaVibePayrollService:{runtimeVersion:'P5'},NotificationCenterService:{runtimeVersion:'P3'},ExecutionRealtimeLifecycle:{runtimeVersion:'P4'},addEventListener:deny};
  vm.runInNewContext(script,{window:win,document:{visibilityState:'visible'},navigator:{onLine:true},console:{log:value=>{output=value}},indexedDB:{open:deny,deleteDatabase:deny},fetch:deny,setTimeout:deny});
  const result=JSON.parse(output.slice('SC1_RESULT\n'.length));assert.equal(mutations,0);assert.equal(result.cacheRuntime,'SC1');assert.equal(result.configured,true);assert.equal(result.authOffline,false);assert.deepEqual(result.channels,{notification:1,execution:0,other:0});
});
test('release metadata is coherent and unchanged SC1/runtime assets retain their versioned URLs',()=>{
  const read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
  const release=JSON.parse(read('version.json')),pkg=JSON.parse(read('package.json')),index=read('index.html');
  assert.match(release.version,/^18\.56\.\d+$/);assert.ok(Number.isInteger(release.build)&&release.build>=185744);assert.equal(release.forceUpdate,false);assert.equal(pkg.version,release.version);
  assert.ok(read('assets/js/pwa.js').includes(`const CURRENT_VERSION = "${release.version}"`));assert.ok(read('service-worker.js').includes(`const CACHE_VERSION = "${release.cacheToken}"`));
  assert.ok(index.includes('assets/js/smart-cache.js?v=18.56.144'));assert.ok(index.includes(`assets/js/pwa.js?v=${release.version}`));
  for(const file of ['vehicle-treasury-service','payroll-service','sea-vibe-payroll-service'])assert.ok(index.includes(`assets/js/${file}.js?v=18.56.143`));
  assert.ok(index.includes('assets/js/installation-execution.js?v=18.56.142'));assert.ok(index.includes('assets/js/notification-center-service.js?v=18.56.141'));
  assert.equal('fake-indexeddb' in (pkg.dependencies||{}),false);assert.equal('fake-indexeddb' in (pkg.devDependencies||{}),false);
});
