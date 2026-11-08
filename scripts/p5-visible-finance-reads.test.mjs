// Local source tests only. No network, real accounts, financial records or storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const read=relative=>fs.readFileSync(new URL(relative,root),'utf8');
const sources={
  sync:read('assets/js/sync-engine.js'),
  vehicle:read('assets/js/vehicle-treasury-service.js'),
  payroll:read('assets/js/payroll-service.js'),
  sea:read('assets/js/sea-vibe-payroll-service.js'),
  vehicleUI:read('assets/js/vehicle-treasury.js')
};
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
class CustomEventMock extends Event{constructor(type,init={}){super(type);this.detail=init.detail}}
class Element extends EventTarget{
  constructor(){super();const classes=new Set();this.classList={contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key),toggle:(key,on)=>{const add=on??!classes.has(key);add?classes.add(key):classes.delete(key);return add}};this.value='';this.innerHTML='';this.textContent='';this.className='';this.open=false;this.dataset={};}
  querySelectorAll(){return []}showModal(){this.open=true}close(){this.open=false}
}
const screens=['vehicleTreasury','payrollManagement','salaryStatement','commissionManagement','commissionStatement','payrollReference','seaVibePayrollManagement','seaVibeSalaryStatement','seaVibeCommissionManagement','seaVibeCommissionStatement','seaVibePayrollReference'];
function harness({realVehicleUI=false,cacheEnabled=true}={}){
  let currentView='dashboard',state={user:{id:'A'},profile:{id:'A',role:'super_admin',is_active:true}},permission=true;
  let clock=Date.now(),sequence=0,cacheGetHook=null,rpcHook=null,authCalls=0,localUserId=null;
  const win=new EventTarget(),doc=new EventTarget(),nav={onLine:true},nodes=new Map(),timers=new Map(),store=new Map(),queueHandlers=new Map();
  const requests=[],tableReads=[],cacheWrites=[],invalidations=[],warnings=[],events=[],queued=[];
  const workspace={cars:[{id:'CAR',carName:'Mock car'}],teams:[{id:'TEAM',carId:'CAR'}],teamAssignments:[{teamId:'TEAM',carId:'CAR',effectiveFrom:'2020-01-01'}],movements:[],summary:{revenue:100,expense:20,balance:80,count:2}};
  for(const screen of screens)nodes.set(`${screen}View`,new Element());
  nodes.set('payrollAdjustmentDialog',new Element());
  for(const match of sources.vehicleUI.matchAll(/\$\('([^']+)'\)/g))if(!nodes.has(match[1]))nodes.set(match[1],new Element());
  const syncView=()=>{for(const screen of screens)nodes.get(`${screen}View`).classList.toggle('hidden',currentView!==screen)};syncView();
  doc.visibilityState='visible';doc.getElementById=id=>nodes.get(id)||null;doc.querySelectorAll=()=>[];
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  win.CustomerAuth={getState:()=>state};win.KYUMNavigation={current:()=>currentView};
  const allowed=screen=>typeof permission==='function'?permission(screen):permission;
  win.PermissionEngine={can:screen=>allowed(screen),canEdit:screen=>allowed(screen),canDelete:screen=>allowed(screen),requireAction:screen=>allowed(screen),snapshot:()=>({rows:[]})};
  win.CustomerPermissions={canScreen:()=>true,requireAction:()=>true};
  win.KYUMOfflineSessionStore={currentUserId:()=>localUserId??state.user?.id};
  win.PetatoeLocalization={t:()=>null,translateMessage:v=>v,effectiveLanguage:()=> 'en',applyStatic(){}};
  const key=(name,options)=>`${options?.namespace}:${name}`;
  const smartCache={
    hashValue:JSON.stringify,
    async get(name,options){if(cacheGetHook)await cacheGetHook(name,options);const hit=store.get(key(name,options));return hit?{hit:true,data:structuredClone(hit),stale:false,metadata:{updatedAt:clock}}:{hit:false}},
    async set(name,data,options){store.set(key(name,options),structuredClone(data));cacheWrites.push({name,namespace:options.namespace});return{updatedAt:clock}},
    async removePrefix(prefix,options){invalidations.push({prefix,namespace:options.namespace});for(const name of store.keys())if(name.startsWith(`${options.namespace}:${prefix}`))store.delete(name)}
  };
  if(cacheEnabled)win.KYUMSmartCache=smartCache;
  class ConflictError extends Error{}
  win.KYUMOfflineQueue={ConflictError,register:(entity,handler)=>queueHandlers.set(entity,handler),isRetryableError:error=>error?.retryable===true,
    getNamespace:async()=>`user:${state.user?.id}`,list:async()=>[],async enqueue(operation){queued.push(operation);return{localEntityId:operation.localEntityId}},async process(){}};
  win.customerSupabase={
    auth:{async getUser(){authCalls++;throw new Error('Unexpected auth network lookup')},async getSession(){authCalls++;throw new Error('Unexpected auth lookup')}},
    async rpc(name,args){requests.push({name,args:plain(args),view:currentView,visible:doc.visibilityState,user:state.user?.id});if(rpcHook){const result=await rpcHook(name,args);if(result!==undefined)return result}return{data:name==='get_vehicle_treasury_workspace_v2'?structuredClone(workspace):name.startsWith('get_')?{rows:[],month:args.p_month}: 'mock-id',error:null}},
    from(name){return{select(columns){return{async in(column,ids){tableReads.push({name,columns,column,ids:[...ids]});return{data:ids.map(id=>({id,updated_at:'2026-11-08T00:00:00Z'})),error:null}}}}}}
  };
  for(const name of ['payroll-data-updated','sea-vibe-payroll-data-updated','sea-vibe-payroll-employee-saved'])win.addEventListener(name,event=>events.push({name,detail:event.detail}));
  const schedule=(fn,delay=0)=>{const id=++sequence;timers.set(id,{at:clock+delay,fn});return id};
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
  const context=vm.createContext({window:win,document:doc,navigator:nav,localStorage,CustomEvent:CustomEventMock,console:{warn:(...v)=>warnings.push(v)},
    setTimeout:schedule,clearTimeout:id=>timers.delete(id),structuredClone,Date:ClockDate,URL,URLSearchParams,Intl,crypto:{randomUUID:()=> 'test-operation'}});
  for(const name of ['sync','vehicle','payroll','sea'])vm.runInContext(sources[name],context,{filename:name});
  if(realVehicleUI)vm.runInContext(sources.vehicleUI,context,{filename:'vehicle UI'});
  return{win,doc,nav,nodes,requests,tableReads,cacheWrites,invalidations,warnings,events,queued,queueHandlers,workspace,
    payroll:win.PayrollService,sea:win.SeaVibePayrollService,vehicle:win.VehicleTreasuryService,
    authCalls:()=>authCalls,
    move(view,dispatch=false){currentView=view;syncView();if(dispatch)win.dispatchEvent(new CustomEventMock('kyum-view-changed',{detail:{view}}))},
    setState:value=>{state=value},setUser:id=>{state=id?{user:{id},profile:{id,role:'super_admin',is_active:true}}:{}},setPermission:value=>{permission=value},setLocalUser:value=>{localUserId=value},
    setCacheHook:value=>{cacheGetHook=value},setRpcHook:value=>{rpcHook=value},
    clearRequests(){requests.length=0;tableReads.length=0},
    trigger:reason=>win.KYUMSyncEngine.triggerAll(reason),
    async foreground(){clock+=31000;doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await flush()},
    async online(){nav.onLine=true;win.dispatchEvent(new Event('online'));await flush()},
    async tick(ms=60000){clock+=ms;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);await timer.fn()}await flush()}
  };
}
async function seed(h){
  await h.vehicle.load({carId:'CAR',from:'2026-11-01',to:'2026-11-08',search:'kept'});
  await h.payroll.loadManagement('2026-11');await h.payroll.loadSalaryStatement();await h.payroll.loadCommissionsRange('2026-10-03','2026-11-07');
  await h.payroll.loadCommissionStatement();await h.payroll.loadReference();await h.payroll.loadAdjustmentCatalog();
  await h.sea.loadManagement('2026-10');await h.sea.loadSalaryStatement();await h.sea.loadCommissionsRange('2026-09-03','2026-10-07');
  await h.sea.loadCommissionStatement();await h.sea.loadReference();await flush();h.clearRequests();
}

test('cold dashboard and retained contexts issue no finance reads for every SyncEngine reason',async()=>{
  const h=harness();
  for(const reason of ['online','foreground','offline-queue','retry','manual'])await h.trigger(reason);
  assert.equal(h.requests.length,0);assert.equal(h.authCalls(),0);
  await seed(h);
  for(const reason of ['online','foreground','offline-queue','retry','manual'])await h.trigger(reason);
  assert.equal(h.requests.length,0);assert.equal(h.tableReads.length,0);assert.equal(h.authCalls(),0);
});
test('actual online and foreground listeners skip retained workspaces on dashboard',async()=>{
  const h=harness();await seed(h);await h.online();await h.foreground();
  assert.equal(h.requests.length,0);assert.equal(h.authCalls(),0);
});
test('hidden, offline, missing profile, mismatched identity, inactive and signed-out states skip automatic reads',async()=>{
  const cases=[h=>{h.doc.visibilityState='hidden'},h=>{h.nav.onLine=false},h=>h.setState({user:{id:'A'}}),h=>h.setState({user:{id:'A'},profile:{id:'B'}}),h=>h.setState({user:{id:'A'},profile:{id:'A',is_active:false}}),h=>h.setUser(null)];
  for(const change of cases)for(const screen of ['vehicleTreasury','payrollManagement','seaVibePayrollManagement']){
    const h=harness();await seed(h);h.move(screen);change(h);await h.trigger('online');await h.trigger('offline-queue');
    assert.equal(h.requests.length,0,screen);assert.equal(h.authCalls(),0,screen);
  }
});
test('a hidden screen element and a missing route do not authorize automatic reads',async()=>{
  for(const screen of ['vehicleTreasury','payrollManagement','seaVibePayrollManagement']){
    const h=harness();await seed(h);h.move(screen);h.nodes.get(`${screen}View`).classList.add('hidden');await h.trigger('online');assert.equal(h.requests.length,0);
    h.move(screen);h.win.KYUMNavigation.current=()=>undefined;await h.trigger('offline-queue');assert.equal(h.requests.length,0);
  }
});
test('explicit deny wins over permissive fallback and a previous visit',async()=>{
  for(const screen of ['vehicleTreasury','payrollManagement','seaVibePayrollManagement']){
    const h=harness();await seed(h);h.move(screen);h.setPermission(false);await h.trigger('online');assert.equal(h.requests.length,0);
  }
});
test('retained filters from a different signed-in user or offline namespace are skipped',async()=>{
  for(const screen of ['vehicleTreasury','payrollManagement','seaVibePayrollManagement']){
    const h=harness();await seed(h);h.setUser('B');h.move(screen);await h.trigger('online');assert.equal(h.requests.length,0);
  }
  const h=harness();h.setLocalUser('old-user');await h.payroll.loadManagement('2026-11');h.clearRequests();h.move('payrollManagement');await h.trigger('online');assert.equal(h.requests.length,0);
});
test('a new user can open and automatically refresh their own workspace',async()=>{
  const h=harness();await seed(h);h.setUser('B');
  h.move('payrollManagement');await h.payroll.loadManagement('2026-09');h.clearRequests();await h.trigger('online');
  assert.deepEqual(h.requests.map(r=>r.args),[{p_month:'2026-09-01'}]);assert.equal(h.requests[0].user,'B');
  h.move('seaVibePayrollManagement');await h.sea.loadManagement('2026-08');h.clearRequests();await h.trigger('online');
  assert.deepEqual(h.requests.map(r=>r.args),[{p_month:'2026-08-01'}]);
});
const visibleCases=[
  ['vehicleTreasury','get_vehicle_treasury_workspace_v2',{p_car_id:'CAR',p_from:'2026-11-01',p_to:'2026-11-08',p_search:'kept'}],
  ['payrollManagement','get_payroll_management_workspace',{p_month:'2026-11-01'}],
  ['salaryStatement','get_salary_statement_workspace',{}],
  ['commissionManagement','get_commission_management_workspace_range',{p_from:'2026-10-03',p_to:'2026-11-07'}],
  ['commissionStatement','get_commission_statement_workspace',{}],
  ['payrollReference','get_payroll_reference_workspace',{}],
  ['seaVibePayrollManagement','get_sea_vibe_payroll_management_workspace_r44r9',{p_month:'2026-10-01'}],
  ['seaVibeSalaryStatement','get_sea_vibe_salary_statement_workspace_r44r9',{}],
  ['seaVibeCommissionManagement','get_sea_vibe_commission_management_workspace_r44r15',{p_from:'2026-09-03',p_to:'2026-10-07'}],
  ['seaVibeCommissionStatement','get_sea_vibe_commission_statement_workspace_r44r15',{}],
  ['seaVibePayrollReference','get_sea_vibe_payroll_reference_workspace_r44r8',{}]
];
for(const [view,name,args]of visibleCases)test(`only ${view} refreshes, preserving its original RPC arguments`,async()=>{
  const h=harness();await seed(h);h.move(view);await h.trigger('online');
  assert.deepEqual(h.requests.map(r=>({name:r.name,args:r.args})),[{name,args}]);
  assert.equal(h.requests[0].visible,'visible');assert.equal(h.requests[0].view,view);
});
test('retained monthly commission mode keeps its month RPC',async()=>{
  const h=harness();await h.payroll.loadCommissions('2026-07');h.clearRequests();h.move('commissionManagement');await h.trigger('online');
  assert.deepEqual(h.requests.map(r=>({name:r.name,args:r.args})),[{name:'get_commission_management_workspace',args:{p_month:'2026-07-01'}}]);
});
test('adjustment catalog refreshes only while its existing dialog is open on payroll management',async()=>{
  const h=harness();await seed(h);h.move('payrollManagement');h.nodes.get('payrollAdjustmentDialog').open=true;await h.trigger('online');
  assert.deepEqual(h.requests.map(r=>r.name),['get_payroll_management_workspace','get_payroll_adjustment_catalog']);
  h.clearRequests();h.move('dashboard');await h.trigger('online');assert.equal(h.requests.length,0);
});
test('leaving, hiding or permission changes during async context resolution prevents the next read',async()=>{
  for(const change of [h=>h.move('dashboard'),h=>{h.doc.visibilityState='hidden'},h=>h.setPermission(false),h=>h.setUser('B')]){
    const h=harness();await seed(h);h.move('payrollManagement');const pending=h.trigger('online');change(h);await pending;
    assert.equal(h.requests.length,0);
  }
});
test('changing the retained payroll period while lifecycle resolution waits skips the retired period',async()=>{
  const h=harness();await seed(h);h.move('payrollManagement');const pending=h.trigger('online');
  await h.payroll.loadManagement('2026-09');await pending;await flush();
  assert.equal(h.requests.filter(r=>r.args.p_month==='2026-11-01').length,0);
  assert.ok(h.requests.some(r=>r.args.p_month==='2026-09-01'));
});
test('closing the catalog dialog while the management read waits skips the following catalog read',async()=>{
  const h=harness();await seed(h);h.move('payrollManagement');h.nodes.get('payrollAdjustmentDialog').open=true;const gate=deferred();
  h.setRpcHook(name=>name==='get_payroll_management_workspace'?gate.promise:undefined);
  const pending=h.trigger('online');await flush();h.nodes.get('payrollAdjustmentDialog').open=false;gate.resolve({data:{rows:[]},error:null});await pending;
  assert.deepEqual(h.requests.map(r=>r.name),['get_payroll_management_workspace']);
});
test('overlapping lifecycle events coalesce identical payroll and SEA VIBE reads',async()=>{
  for(const [view,name]of [['payrollManagement','get_payroll_management_workspace'],['seaVibePayrollManagement','get_sea_vibe_payroll_management_workspace_r44r9']]){
    const h=harness();await seed(h);h.move(view);const gate=deferred();h.setRpcHook(n=>n===name?gate.promise:undefined);
    const pending=Array.from({length:12},()=>h.trigger('online'));await flush();assert.equal(h.requests.length,1);
    gate.resolve({data:{rows:[]},error:null});await Promise.all(pending);assert.equal(h.requests.length,1);
  }
});
test('visible payroll refreshes still notify the existing UI update listeners',async()=>{
  const h=harness();await seed(h);h.events.length=0;h.move('payrollManagement');await h.trigger('online');
  h.move('seaVibePayrollManagement');await h.trigger('online');
  assert.deepEqual(h.events.map(e=>[e.name,e.detail.kind]),[['payroll-data-updated','management'],['sea-vibe-payroll-data-updated','management']]);
});
test('explicit opening and refresh read functions remain usable independently of lifecycle visibility',async()=>{
  const h=harness();await seed(h);h.move('dashboard');h.doc.visibilityState='hidden';
  await h.vehicle.load({carId:'CAR'});await h.payroll.loadSalaryStatement();await h.sea.loadSalaryStatement({force:true});await flush();
  assert.deepEqual(h.requests.map(r=>r.name),['get_vehicle_treasury_workspace_v2','get_salary_statement_workspace','get_sea_vibe_salary_statement_workspace_r44r9']);
});
test('actual vehicle UI opening, foreground refresh, live filters and summary rendering still work',async()=>{
  const h=harness({realVehicleUI:true});h.move('vehicleTreasury',true);await flush();
  assert.ok(h.requests.some(r=>r.name==='get_vehicle_treasury_workspace_v2'));
  h.nodes.get('vehicleTreasuryTeam').value='CAR';h.nodes.get('vehicleTreasuryFrom').value='2026-11-02';h.nodes.get('vehicleTreasurySearch').value='current filter';
  h.workspace.summary.balance=125;h.clearRequests();await h.online();
  assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].args,{p_car_id:'CAR',p_from:'2026-11-02',p_to:null,p_search:'current filter'});
  assert.match(h.nodes.get('vehicleTreasuryBalance').textContent,/125/);
  h.clearRequests();h.move('dashboard',true);await h.foreground();await h.online();assert.equal(h.requests.length,0);
});
test('vehicle queue reconciliation waits for an explicit read and performs one trailing refresh',async()=>{
  const h=harness({realVehicleUI:true});h.move('vehicleTreasury',true);await flush();h.clearRequests();const gate=deferred();
  h.setRpcHook(name=>name==='get_vehicle_treasury_workspace_v2'?gate.promise:undefined);
  const opening=h.win.VehicleTreasuryUI.load(false);await flush();const pending=Array.from({length:8},()=>h.trigger('offline-queue'));await flush();
  assert.equal(h.requests.length,1);gate.resolve({data:structuredClone(h.workspace),error:null});await opening;await Promise.all(pending);assert.equal(h.requests.length,2);
});
test('leaving or hiding the vehicle screen while reconciliation waits cancels the trailing refresh',async()=>{
  for(const change of [h=>h.move('dashboard',true),h=>{h.doc.visibilityState='hidden'},h=>h.setUser('B'),h=>h.setPermission(false)]){
    const h=harness({realVehicleUI:true});h.move('vehicleTreasury',true);await flush();h.clearRequests();const gate=deferred();
    h.setRpcHook(name=>name==='get_vehicle_treasury_workspace_v2'?gate.promise:undefined);
    const opening=h.win.VehicleTreasuryUI.load(false);await flush();const pending=h.trigger('offline-queue');await flush();
    change(h);gate.resolve({data:structuredClone(h.workspace),error:null});await opening;await pending;
    assert.equal(h.requests.length,1);
  }
});
test('vehicle UI error display preserves SyncEngine retries and the retry rechecks screen visibility',async()=>{
  for(const leave of [false,true]){
    const h=harness({realVehicleUI:true});h.move('vehicleTreasury',true);await flush();h.clearRequests();let failures=1;
    h.setRpcHook(name=>name==='get_vehicle_treasury_workspace_v2'&&failures-->0?{data:null,error:{message:'Mock temporary failure'}}:undefined);
    await h.trigger('online');assert.equal(h.requests.length,1);assert.match(h.nodes.get('vehicleTreasuryStatus').textContent,/Unable to load Vehicle Treasury/);
    if(leave)h.move('dashboard',true);await h.tick();assert.equal(h.requests.length,leave?1:2);
  }
});
test('expense version reads remain attached to editable server movements',async()=>{
  const h=harness();h.workspace.movements=[{id:'expense',sourceId:'expense',movementType:'expense',editable:true,amount:-20}];
  await h.vehicle.load({carId:'CAR'});assert.equal(h.tableReads.length,1);assert.equal(h.vehicle.getSnapshot().movements[0].updatedAt,'2026-11-08T00:00:00Z');
  h.clearRequests();h.move('dashboard');await h.trigger('online');assert.equal(h.tableReads.length,0);
});
test('offline cache reads still work and a cacheless explicit read reports the existing error',async()=>{
  const h=harness();await seed(h);h.nav.onLine=false;
  const cached=await h.vehicle.load({carId:'CAR',from:'2026-11-01',to:'2026-11-08',search:'kept'});assert.equal(cached.summary.balance,80);
  await h.payroll.loadManagement('2026-11');await h.sea.loadManagement('2026-10',{force:true});assert.equal(h.requests.length,0);
  const empty=harness({cacheEnabled:false});empty.nav.onLine=false;await assert.rejects(empty.vehicle.load({}),/محفوظة/);
});
test('vehicle online save, guarded update and delete preserve payloads and cache invalidation on dashboard',async()=>{
  const h=harness();await seed(h);const record={teamId:'TEAM',carId:'CAR',date:'2026-11-08',description:'Mock expense',amount:25,notes:'Mock',clientOperationKey:'fixed-key'};
  await h.vehicle.saveExpense(record);await h.vehicle.saveExpense({...record,id:'expense',baseUpdatedAt:'2026-11-07T00:00:00Z'});await h.vehicle.deleteExpense('expense');
  assert.deepEqual(h.requests.map(r=>r.name),['add_vehicle_treasury_expense_idempotent','update_vehicle_treasury_expense_guarded','delete_vehicle_treasury_expense']);
  assert.equal(h.requests[0].args.p_amount,25);assert.equal(h.requests[0].args.p_client_operation_key,'fixed-key');assert.equal(h.requests[1].args.p_base_updated_at,'2026-11-07T00:00:00Z');
  assert.equal(h.invalidations.filter(i=>i.prefix==='vehicle-treasury:workspace:v3:').length,3);
  h.clearRequests();await h.trigger('offline-queue');assert.equal(h.requests.length,0);
});
test('offline expense queue creation and replay still work while dashboard automatic reads stay silent',async()=>{
  const h=harness();await seed(h);h.nav.onLine=false;await h.vehicle.saveExpense({teamId:'TEAM',carId:'CAR',date:'2026-11-08',description:'Queued',amount:30});
  assert.equal(h.queued.length,1);assert.equal(h.requests.length,0);assert.equal(h.queued[0].entity,'vehicle_treasury');assert.equal(h.queued[0].action,'create');
  h.nav.onLine=true;const result=await h.queueHandlers.get('vehicle_treasury')({...h.queued[0],namespace:'user:A'});
  assert.equal(result.id,'mock-id');assert.deepEqual(h.requests.map(r=>r.name),['add_vehicle_treasury_expense_idempotent']);
  h.clearRequests();await h.trigger('offline-queue');assert.equal(h.requests.length,0);
});
test('payroll preparation, adjustment, approval and explicit commission recalculation retain their writes and reloads',async()=>{
  const h=harness();await seed(h);
  await h.payroll.prepareMonth('2026-11','2026-10-03','2026-11-07');
  await h.payroll.saveAdjustmentItems('statement',[{type:'addition',name:'Mock',amount:10}],null);
  await h.payroll.transition('statement','submit','REF');
  await h.payroll.refreshCommissions('2026-11','2026-10-03','2026-11-07');
  assert.deepEqual(h.requests.map(r=>r.name),['prepare_payroll_month_range','get_payroll_management_workspace','save_payroll_salary_adjustment_items','payroll_salary_transition','refresh_payroll_commissions','get_commission_management_workspace_range']);
  assert.deepEqual(h.requests[0].args,{p_month:'2026-11-01',p_commission_from:'2026-10-03',p_commission_to:'2026-11-07'});
  h.clearRequests();await h.trigger('offline-queue');assert.equal(h.requests.length,0);
});
test('SEA VIBE preparation, adjustments, transition and employee save retain invalidation and explicit reloads',async()=>{
  const h=harness();await seed(h);let employeeRefreshes=0;h.win.SeaVibeService={async refreshCommissionEmployees(){employeeRefreshes++}};
  await h.sea.prepareMonth('2026-10','2026-09-03','2026-10-07');await h.sea.saveAdjustmentItems('statement',[{amount:10}],null);await h.sea.transition('statement','submit','REF');
  await h.sea.saveEmployee({id:'employee',name:'Mock'});
  assert.deepEqual(h.requests.map(r=>r.name),['prepare_sea_vibe_payroll_month_range_r44r9','get_sea_vibe_payroll_management_workspace_r44r9','save_sea_vibe_payroll_salary_adjustment_items_r44r9','get_sea_vibe_payroll_management_workspace_r44r9','sea_vibe_payroll_salary_transition_r44r9','get_sea_vibe_payroll_management_workspace_r44r9','save_sea_vibe_employee_r44r8','get_sea_vibe_payroll_reference_workspace_r44r8']);
  assert.equal(employeeRefreshes,1);assert.ok(h.invalidations.filter(i=>i.prefix==='sea-vibe-payroll:v2:').length>=4);
  h.clearRequests();await h.trigger('offline-queue');assert.equal(h.requests.length,0);
});
test('diagnostic getters are passive and contain no account IDs, filters or financial rows',async()=>{
  const h=harness();await seed(h);const result={};
  for(const service of [h.vehicle,h.payroll,h.sea]){assert.equal(service.runtimeVersion,'P5');Object.assign(result,service.getLifecycleReadStatus())}
  assert.equal(h.requests.length,0);assert.equal(h.authCalls(),0);assert.equal(result.eligible,false);
  assert.deepEqual(Object.keys(result).sort(),['eligible','invocations','pending','refreshCalls','retainedContexts']);
});
test('the delivered console capture reads local state without requests, storage writes or new listeners',()=>{
  let mutations=0;const passive=read('scripts/p5-visible-finance-live-readonly.js');
  const service={runtimeVersion:'P5',getLifecycleReadStatus:()=>({invocations:0,refreshCalls:0,pending:false,eligible:false})};
  const deny=()=>{mutations++;throw new Error('Unexpected side effect')};
  const win={KYUM_RELEASE_VERSION:'18.56.143',KYUMNavigation:{current:()=> 'dashboard'},VehicleTreasuryService:service,PayrollService:service,SeaVibePayrollService:service,
    ExecutionRealtimeLifecycle:{runtimeVersion:'P4',getStatus:()=>({active:false,channelAttached:false})},
    customerSupabase:{getChannels:()=>[{topic:'realtime:kyum-notifications-mock'}],rpc:deny,from:deny,channel:deny,auth:{getSession:deny}},KYUMSyncEngine:{triggerAll:deny},addEventListener:deny};
  const result=JSON.parse(vm.runInNewContext(passive,{window:win,document:{visibilityState:'visible'},navigator:{onLine:true},localStorage:{setItem:deny},setTimeout:deny,setInterval:deny}));
  assert.equal(mutations,0);assert.equal(result.version,'18.56.143');assert.deepEqual(result.channels,{notification:1,execution:0,other:0});assert.equal(result.executionRuntime,'P4');assert.equal(result.vehicleTreasury.runtime,'P5');
});
test('release version, cache token and the four changed script URLs agree',()=>{
  const release=JSON.parse(read('version.json')),pkg=JSON.parse(read('package.json')),index=read('index.html');
  assert.equal(release.version,'18.56.143');assert.equal(pkg.version,release.version);assert.equal(release.build,185743);assert.equal(release.forceUpdate,false);
  assert.ok(read('assets/js/pwa.js').includes(`const CURRENT_VERSION = "${release.version}"`));assert.ok(read('service-worker.js').includes(`const CACHE_VERSION = "${release.cacheToken}"`));
  for(const asset of ['vehicle-treasury-service','payroll-service','sea-vibe-payroll-service','pwa'])assert.ok(index.includes(`assets/js/${asset}.js?v=${release.version}`));
  assert.ok(index.includes('assets/js/installations-service.js?v=18.56.142'));assert.ok(index.includes('assets/js/installation-execution.js?v=18.56.142'));
});
