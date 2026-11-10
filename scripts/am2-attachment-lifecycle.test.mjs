import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

const root=new URL('../',import.meta.url);
const deps=process.env.PETATOE_AM1_TEST_DEPS;
if(!deps)throw new Error('Set PETATOE_AM1_TEST_DEPS to test-only node_modules.');
const {PGlite}=await import(pathToFileURL(deps+'/@electric-sql/pglite/dist/index.js'));
const source=await readFile(new URL('assets/js/attachment-upload.js',root),'utf8');
const migration=await readFile(new URL('supabase/migrations/20261110120000_am2_attachment_lifecycle.sql',root),'utf8');
const legacy=await readFile(new URL('supabase/migrations/20261109090000_am1r1_attachment_management.sql',root),'utf8');
const oldTests=await readFile(new URL('scripts/am1-attachment-management.test.mjs',root),'utf8');
const uid='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222';
const oid='33333333-3333-4333-8333-333333333333',oid2='44444444-4444-4444-8444-444444444444';
const requestId='55555555-5555-4555-8555-555555555555',customerId='66666666-6666-4666-8666-666666666666';
const team='77777777-7777-4777-8777-777777777777',visit='88888888-8888-4888-8888-888888888888';
const otherRequest='99999999-9999-4999-8999-999999999999';
const setupLiteral=oldTests.slice(oldTests.indexOf('const setup=')+'const setup='.length,oldTests.indexOf('async function database()')).trim().replace(/;$/,'');
const setup=Function('uid','staff','oid','oid2','requestId','customerId','return '+setupLiteral)(uid,staff,oid,oid2,requestId,customerId);
const extend=`
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
alter table public.installation_requests add primary key(id);
alter table public.installation_requests add column representative_id uuid,add column installation_team_id uuid,add column assigned_technician_name text,add column status text default 'مكتمل';
update public.installation_requests set installation_team_id='${team}';
insert into public.installation_requests(id,customer_id,request_number,installation_team_id) values('${otherRequest}','${customerId}','OTHER','${otherRequest}');
create table public.installation_execution_visits(id uuid primary key,installation_request_id uuid references public.installation_requests(id));
insert into public.installation_execution_visits values('${visit}','${requestId}');
alter table public.installation_execution_files add primary key(id),add column mime_type text,add column file_size bigint check(file_size between 1 and 10485760),add column file_kind text,add column execution_visit_id uuid references public.installation_execution_visits(id),add column client_evidence_key text;
alter table public.installation_completion_files add primary key(id),add column mime_type text,add column file_size bigint check(file_size between 1 and 10485760),add column file_kind text,add column client_evidence_key text;
alter table public.installation_execution_files add foreign key(uploaded_by) references public.user_profiles(id);
create unique index fixture_execution_path on public.installation_execution_files(storage_path);
create unique index fixture_completion_path on public.installation_completion_files(storage_path);
create unique index fixture_execution_key on public.installation_execution_files(client_evidence_key) where client_evidence_key is not null;
create unique index fixture_completion_key on public.installation_completion_files(client_evidence_key) where client_evidence_key is not null;
alter table public.installation_execution_files add foreign key(installation_request_id) references public.installation_requests(id) on delete cascade;
alter table public.installation_completion_files add foreign key(installation_request_id) references public.installation_requests(id) on delete cascade;
create function public.has_screen_permission(s text,a text) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select case when u.role::text='super_admin' then true else exists(select 1 from public.role_screen_permissions p where p.role=u.role and p.screen_key=s and case a when 'view' then p.can_view when 'edit' then p.can_edit else false end) end from public.user_profiles u where u.id=auth.uid() and u.is_active),false)$$;
create function public.can_access_installation_request_scope(rep uuid,t uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$select auth.uid()='${uid}'::uuid or (t='${team}'::uuid and auth.uid()='${staff}'::uuid)$$;
create function public.can_access_installation_assignment(t uuid,n text) returns boolean language sql stable security definer set search_path=pg_catalog as $$select coalesce(current_setting('test.assignment',true),'')<>'deny'$$;
create function public.can_access_representative(r uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$select auth.uid()='${uid}'::uuid$$;
insert into public.role_screen_permissions values('viewer','installationExecution',true,true,true,false,false),('viewer','installationCompletion',false,false,false,false,false);
alter table public.installation_requests enable row level security;
alter table public.installation_execution_files enable row level security;
alter table public.installation_completion_files enable row level security;
grant select on public.installation_requests,public.user_profiles,public.role_screen_permissions,public.installation_execution_visits to authenticated;
grant select,insert,delete on public.installation_execution_files,public.installation_completion_files to authenticated;
create policy fixture_request_read on public.installation_requests for select to authenticated using(public.can_access_installation_request_scope(representative_id,installation_team_id) and public.can_access_installation_assignment(installation_team_id,assigned_technician_name));
create policy fixture_execution_read on public.installation_execution_files for select to authenticated using(public.has_screen_permission('installationExecution','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id));
drop policy fixture_storage_access on storage.objects;
create policy legacy_completion_read on storage.objects for select to authenticated using(bucket_id='installation-evidence' and public.has_screen_permission('installationCompletion','view'));
`;
async function database({install=true}={}){
 const db=new PGlite();await db.exec(setup);await db.exec(extend);await db.exec(legacy);await db.exec("update petatoe_am1.config set enabled=true,deletion_enabled=true;");
 if(install)await db.exec(migration);
 const asActor=async(actor=staff)=>db.query("select set_config('test.uid',$1,false)",[actor||'']);
 await asActor();
 const rpc=async(action,input)=> (await db.query('select public.petatoe_attachment_upload_am2($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result;
 const am1=async(action,input={})=>(await db.query('select public.petatoe_attachment_admin_am1($1,$2,$3::jsonb) result',[uid,action,JSON.stringify({revision:'AM1R1',...input})])).rows[0].result;
 const prepare=(overrides={})=>rpc('prepare',{requestId,visitId:visit,target:'execution',fileKind:'execution',evidenceKey:'am2:test-evidence-key',sha256:'a'.repeat(64),mimeType:'image/jpeg',bytes:100,fileName:'test.jpg',...overrides});
 const put=async(p,overrides={})=>{
  const row={owner:staff,marker:p.intentId,size:100,mime:'image/jpeg',sha:'a'.repeat(64),...overrides};
  await db.query(`insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,owner_id,version,user_metadata) values(gen_random_uuid(),'installation-evidence',$1,$2::jsonb,'2026-10-10T10:00:00Z','2026-10-10T10:00:00Z',$3,'physical-v1',$4::jsonb)`,[p.path,JSON.stringify({size:row.size,mimetype:row.mime,lastModified:'2026-10-10T10:00:00Z'}),row.owner,JSON.stringify({petatoe_intent:row.marker,client_sha256:row.sha})]);
 };
 return {db,rpc,am1,prepare,put,asActor,close:()=>db.close()};
}
test('migration installs a private journal and grants upload RPC only to authenticated',async()=>{
 const c=await database();try{
  const acl=(await c.db.query("select has_function_privilege('anon','public.petatoe_attachment_upload_am2(text,jsonb)','execute') anon,has_function_privilege('authenticated','public.petatoe_attachment_upload_am2(text,jsonb)','execute') auth")).rows[0];
  assert.deepEqual(acl,{anon:false,auth:true});
  assert.equal((await c.db.query('select archive_unmapped_enabled from petatoe_am2.config')).rows[0].archive_unmapped_enabled,false);
  await c.db.exec('set role authenticated');await assert.rejects(c.db.query('select * from petatoe_am2.upload_intents'),/permission denied/);await c.db.exec('reset role');
  assert.equal((await c.db.query("select can_view from public.role_screen_permissions where role='viewer' and screen_key='installationCompletion'")).rows[0].can_view,false);
 }finally{await c.close();}
});
test('prepare writes metadata before bytes; retries return one stable path; commit is atomic and idempotent',async()=>{
 const c=await database();try{
  const a=await c.prepare(),b=await c.prepare();assert.equal(a.intentId,b.intentId);assert.equal(a.path,b.path);assert.equal(b.uploaded,false);
  assert.equal((await c.db.query('select count(*)::int n from petatoe_am2.upload_intents')).rows[0].n,1);
  await assert.rejects(c.rpc('commit',{intentId:a.intentId}),/AM2_UPLOAD_NOT_PRESENT/);
  await c.put(a);assert.equal((await c.prepare()).uploaded,true);
  const first=await c.rpc('commit',{intentId:a.intentId}),second=await c.rpc('commit',{intentId:a.intentId});
  assert.equal(first.id,second.id);assert.equal(first.reused,false);assert.equal(second.reused,true);assert.equal((await c.prepare()).registered,true);
  const files=await c.db.query('select uploaded_by,uploaded_at,storage_path from public.installation_execution_files where client_evidence_key is not null');
  assert.equal(files.rows.length,1);assert.equal(files.rows[0].uploaded_by,staff);assert.equal(files.rows[0].storage_path,a.path);
 }finally{await c.close();}
});
test('lost registration reply and later business failure retain the canonical attachment',async()=>{
 const c=await database();try{
  const a=await c.prepare();await c.put(a);await c.rpc('commit',{intentId:a.intentId});
  const reload=await c.prepare();assert.equal(reload.registered,true);assert.equal(reload.path,a.path);
  await assert.rejects(c.prepare({sha256:'b'.repeat(64)}),/AM2_INTENT_CONFLICT/);
  assert.equal((await c.db.query('select state from petatoe_am2.upload_intents')).rows[0].state,'registered');
 }finally{await c.close();}
});
test('failed DB insert keeps the intent pending and resumes after the constraint is repaired',async()=>{
 const c=await database();try{
  const a=await c.prepare();await c.put(a);
  await c.db.exec("alter table public.installation_execution_files add constraint fixture_fail check(client_evidence_key is null) not valid");
  await assert.rejects(c.rpc('commit',{intentId:a.intentId}),/fixture_fail/);
  assert.equal((await c.db.query('select state from petatoe_am2.upload_intents')).rows[0].state,'pending');
  assert.equal((await c.prepare()).uploaded,true);
  await c.db.exec('alter table public.installation_execution_files drop constraint fixture_fail');
  assert.equal((await c.rpc('commit',{intentId:a.intentId})).registered,true);
 }finally{await c.close();}
});
test('wrong owner, intent marker, size, MIME and hash provenance cannot be registered',async()=>{
 const c=await database();try{
  for(const [n,override] of Object.entries({owner:{owner:uid},marker:{marker:oid},size:{size:101},mime:{mime:'image/png'},hash:{sha:'b'.repeat(64)}})){
   const a=await c.prepare({evidenceKey:'am2:invalid-'+n});await c.put(a,override);
   await assert.rejects(c.rpc('commit',{intentId:a.intentId}),/AM2_INTENT_CONFLICT/);
  }
  assert.equal((await c.db.query('select count(*)::int n from public.installation_execution_files where client_evidence_key is not null')).rows[0].n,0);
 }finally{await c.close();}
});
test('anonymous/inactive/other actor, other team, denied assignment, wrong visit and completion-only access fail closed',async()=>{
 const c=await database();try{
  const p=await c.prepare();await c.asActor(null);await assert.rejects(c.prepare(),/AM2_FORBIDDEN/);
  await c.asActor(uid);await assert.rejects(c.rpc('commit',{intentId:p.intentId}),/AM2_FORBIDDEN/);
  await c.asActor();await assert.rejects(c.prepare({requestId:otherRequest}),/AM2_FORBIDDEN/);
  await assert.rejects(c.prepare({visitId:oid}),/AM2_INVALID_VISIT/);
  await assert.rejects(c.prepare({target:'completion',fileKind:'before',visitId:null}),/AM2_FORBIDDEN/);
  await c.db.exec("select set_config('test.assignment','deny',false)");await assert.rejects(c.prepare(),/AM2_FORBIDDEN/);await c.db.exec("select set_config('test.assignment','',false)");
  await c.db.query('update public.user_profiles set is_active=false where id=$1',[staff]);await assert.rejects(c.prepare(),/AM2_FORBIDDEN/);
 }finally{await c.close();}
});
test('deliberately detached registered rows are never resurrected; the next explicit upload gets a new generation',async()=>{
 const c=await database();try{
  const a=await c.prepare();await c.put(a);const saved=await c.rpc('commit',{intentId:a.intentId});
  await c.db.query('delete from public.installation_execution_files where id=$1',[saved.id]);
  await assert.rejects(c.rpc('commit',{intentId:a.intentId}),/AM2_ATTACHMENT_DETACHED/);
  const next=await c.prepare();assert.notEqual(next.intentId,a.intentId);assert.notEqual(next.path,a.path);assert.equal(next.registered,false);
  assert.deepEqual((await c.db.query('select state from petatoe_am2.upload_intents order by generation')).rows.map(x=>x.state),['detached','pending']);
 }finally{await c.close();}
});
test('scoped execution read fixes preview access without granting completion or another team',async()=>{
 const c=await database();try{
  const p=await c.prepare();await c.put(p);await c.db.exec('set role authenticated');
  const images=await c.db.query('select name from storage.objects');assert.equal(images.rows.length,1);assert.equal(images.rows[0].name,p.path);
  await c.db.exec('reset role');
  await c.db.query('update public.installation_requests set installation_team_id=$1 where id=$2',[otherRequest,requestId]);
  await c.db.exec('set role authenticated');assert.equal((await c.db.query('select name from storage.objects')).rows.length,0);await c.db.exec('reset role');
 }finally{await c.close();}
});
test('completion uploads retain their kinds/contract and require completed requests',async()=>{
 const c=await database();try{
  await c.asActor(uid);const p=await c.prepare({target:'completion',fileKind:'before',visitId:null});await c.put(p,{owner:uid});
  const saved=await c.rpc('commit',{intentId:p.intentId});assert.equal(saved.registered,true);
  assert.equal((await c.db.query('select file_kind from public.installation_completion_files where id=$1',[saved.id])).rows[0].file_kind,'before');
  await c.db.query("update public.installation_requests set status='مجدول' where id=$1",[requestId]);
  await assert.rejects(c.prepare({target:'completion',fileKind:'after',visitId:null,evidenceKey:'am2:different-key'}),/AM2_FORBIDDEN/);
 }finally{await c.close();}
});
test('new archive policy keeps unknown metadata honest and preserves hard protection',async()=>{
 const c=await database();try{
  const p=await c.prepare();await c.put(p);let row=(await c.am1('list',{month:'2026-10'})).items.find(x=>x.path===p.path);
  assert.equal(row.protected,true);await c.db.exec('update petatoe_am2.config set archive_unmapped_enabled=true');
  row=(await c.am1('list',{month:'2026-10'})).items.find(x=>x.path===p.path);
  assert.equal(row.protected,false);assert.equal(row.source,'unmapped');assert.equal(row.sourceMatches,0);assert.equal(row.customer,null);assert.equal(row.reference,null);assert.equal(row.mappingWarning,'UNMAPPED_BACKUP_REQUIRED');
  await c.db.query("insert into storage.objects(id,bucket_id,name,metadata,created_at,owner_id,version) values(gen_random_uuid(),'user-whatsapp-templates','active.jpg','{\"size\":1,\"mimetype\":\"image/jpeg\"}','2026-10-10',$1,'v1')",[staff]);
  await c.db.query("insert into public.user_whatsapp_templates values($1,'active.jpg','active.jpg')",[staff]);
  const template=(await c.am1('list',{month:'2026-10'})).items.find(x=>x.bucket==='user-whatsapp-templates');assert.equal(template.protected,true);assert.equal(template.protectionReason,'ACTIVE_TEMPLATE');
  await c.db.query('update storage.objects set version=null where name=$1',[p.path]);
  row=(await c.am1('list',{month:'2026-10'})).items.find(x=>x.path===p.path);assert.equal(row.protected,true);assert.equal(row.protectionReason,'IDENTITY_OR_TIME_UNAVAILABLE');
 }finally{await c.close();}
});
test('old archive snapshots remain unchanged; a normal new export captures the new mapping policy',async()=>{
 const c=await database();try{
  const p=await c.prepare();await c.put(p);const old=await c.am1('begin',{month:'2026-10'});
  assert.equal((await c.db.query('select protected from petatoe_am1.items where archive_id=$1 and path=$2',[old.id,p.path])).rows[0].protected,true);
  await c.am1('cancel',{archiveId:old.id});await c.db.exec('update petatoe_am2.config set archive_unmapped_enabled=true');
  const next=await c.am1('begin',{month:'2026-10'});
  assert.equal((await c.db.query('select protected from petatoe_am1.items where archive_id=$1 and path=$2',[next.id,p.path])).rows[0].protected,false);
  assert.equal((await c.db.query('select protected from petatoe_am1.items where archive_id=$1 and path=$2',[old.id,p.path])).rows[0].protected,true);
  await assert.rejects(c.rpc('commit',{intentId:p.intentId}),/AM2_OBJECT_ARCHIVING/);
  await c.am1('cancel',{archiveId:next.id});assert.equal((await c.rpc('commit',{intentId:p.intentId})).registered,true);
 }finally{await c.close();}
});
test('unmapped images still require complete PDF/original receipts, saved-file confirmation and exact version for purge',async()=>{
 const c=await database();try{
  const p=await c.prepare();await c.put(p);await c.db.exec('update petatoe_am2.config set archive_unmapped_enabled=true');
  const a=await c.am1('begin',{month:'2026-10'});
  await assert.rejects(c.am1('purge_prepare',{archiveId:a.id,confirmMonth:a.month}),/AM1_PURGE_NOT_CONFIRMED/);
  const originals=[];const items=(await c.db.query('select ordinal,object_version from petatoe_am1.items where archive_id=$1 order by ordinal',[a.id])).rows;
  for(const i of items){await c.am1('item_signed',{archiveId:a.id,ordinal:i.ordinal,boundVersion:i.object_version});originals.push({ordinal:i.ordinal,sha256:'c'.repeat(64)});}
  await c.am1('complete',{archiveId:a.id,sha256:'d'.repeat(64),bytes:2000,originals});
  await assert.rejects(c.am1('purge_prepare',{archiveId:a.id,confirmMonth:a.month}),/AM1_PURGE_NOT_CONFIRMED/);
  await c.am1('confirm',{archiveId:a.id,sha256:'d'.repeat(64),bytes:2000});
  await c.db.query("update storage.objects set version='replacement' where name=$1",[p.path]);
  await assert.rejects(c.am1('purge_prepare',{archiveId:a.id,confirmMonth:a.month}),/AM1_OBJECT_CHANGED_REEXPORT_REQUIRED/);
  assert.equal((await c.db.query('select count(*)::int n from storage.objects')).rows[0].n,2);
  await c.db.query("update storage.objects set version='physical-v1' where name=$1",[p.path]);
  assert.equal((await c.am1('purge_prepare',{archiveId:a.id,confirmMonth:a.month})).prepared,true);
  assert.equal((await c.db.query("select count(*)::int n from petatoe_am1.leases where archive_id=$1 and expires_at='infinity'::timestamptz",[a.id])).rows[0].n,2);
  await assert.rejects(c.db.query("update storage.objects set version='new-version' where name=$1",[p.path]),/AM1_OBJECT_ARCHIVING/);
 }finally{await c.close();}
});
test('drift and active leases stop installation without partial schema changes',async()=>{
 for(const state of ['drift','lease']){
  const c=await database({install:false});try{
   if(state==='drift')await c.db.exec("create or replace function petatoe_am1.describe_object(o jsonb) returns jsonb language sql as $$select o$$");
   else{const a=await c.am1('begin',{month:'2026-10'});assert.ok(a.id);}
   await assert.rejects(c.db.exec(migration),state==='drift'?/AM2_BASELINE_CHANGED/:/AM2_ARCHIVE_WORK_IN_PROGRESS/);await c.db.exec('rollback');
   assert.equal((await c.db.query("select to_regnamespace('petatoe_am2') x")).rows[0].x,null);
  }finally{await c.close();}
 }
});
test('delivered read-only verify, policy activation and rollback execute without deleting images or intent history',async()=>{
 const c=await database();try{
  const p=await c.prepare();await c.put(p);
  const verify=await readFile(new URL('supabase/operations/am2/02_VERIFY_READONLY.sql',root),'utf8');
  const enable=await readFile(new URL('supabase/operations/am2/03_ENABLE_ARCHIVE_POLICY.sql',root),'utf8');
  const rollback=await readFile(new URL('supabase/operations/am2/90_ROLLBACK.sql',root),'utf8');
  let result=(await c.db.exec(verify)).flatMap(x=>x.rows||[]).find(x=>x.am2_install_verify)?.am2_install_verify;
  assert.equal(result.upload_rpc_matches,true);assert.equal(result.classifier_matches,true);assert.equal(result.archive_guard_unchanged,true);assert.equal(result.unmapped_backup_candidates,0);
  for(const table of result.private_tables){assert.equal(table.rls,true);assert.equal(table.anon_select,false);assert.equal(table.authenticated_select,false);}
  await c.db.exec(enable);result=(await c.db.exec(verify)).flatMap(x=>x.rows||[]).find(x=>x.am2_install_verify)?.am2_install_verify;
  assert.equal(result.config.archive_unmapped_enabled,true);assert.equal(result.unmapped_backup_candidates,1);
  await c.db.exec(rollback);
  assert.equal((await c.db.query('select count(*)::int n from storage.objects')).rows[0].n,2);
  assert.equal((await c.db.query('select count(*)::int n from petatoe_am2.upload_intents')).rows[0].n,1);
  const oldBody=legacy.match(/create function petatoe_am1\.describe_object[\s\S]*?as \$\$([\s\S]*?)\$\$;/)[1];
  assert.equal((await c.db.query("select md5(replace(prosrc,chr(13)||chr(10),chr(10))) original from pg_proc where oid='petatoe_am1.describe_object(jsonb)'::regprocedure")).rows[0].original,createHash('md5').update(oldBody).digest('hex'));
  assert.equal((await c.db.query("select has_function_privilege('authenticated','public.petatoe_attachment_upload_am2(text,jsonb)','execute') allowed")).rows[0].allowed,false);
 }finally{await c.close();}
});

function browser({mode='success'}={}){
 let current=staff,physical=false,registered=false,commits=0,uploads=0,failOnce=true;const requests=[];
 const file=new Blob(['image-data'],{type:'image/jpeg'});Object.defineProperty(file,'name',{value:'photo.jpg'});
 const window={crypto:webcrypto,CustomerAuth:{getState:()=>({user:{id:current},profile:{id:current,is_active:true},offline:false})},PetatoeLocalization:{t:key=>key}};
 window.customerSupabase={rpc:async(_,{p_action,p_input})=>{
  requests.push([p_action,p_input]);
  if(p_action==='prepare')return {data:{revision:'AM2',registered,id:registered?'file-id':null,intentId:'intent-id',bucket:'installation-evidence',path:requestId+'/execution/intent.jpg',uploaded:physical},error:null};
  commits++;if(mode==='commit-error'&&failOnce){failOnce=false;return {error:{message:'registration failed'}};}
  registered=true;return {data:{revision:'AM2',registered:true,id:'file-id',path:requestId+'/execution/intent.jpg'},error:null};
 },storage:{from:()=>({upload:async(_path,_file,options)=>{uploads++;assert.equal(options.upsert,false);assert.equal(options.metadata.petatoe_intent,'intent-id');physical=true;if(mode==='switch')current=uid;if(mode==='timeout'&&failOnce){failOnce=false;throw new Error('network timeout');}return {error:null};}})}};
 vm.runInNewContext(source,{window,navigator:{onLine:true},TextEncoder,Uint8Array,Map,Error,console});
 return {api:window.PetatoeAttachmentUpload,file,requests,stats:()=>({uploads,commits}),input:{requestId,visitId:visit,target:'execution',fileKind:'execution',file}};
}
test('client makes no passive requests and concurrent/reloaded uploads reuse stable evidence identity',async()=>{
 const h=browser();assert.equal(h.requests.length,0);const [a,b]=await Promise.all([h.api.upload(h.input),h.api.upload(h.input)]);assert.equal(a.path,b.path);assert.equal(h.stats().uploads,1);
 await h.api.upload(h.input);assert.equal(h.stats().uploads,1);assert.equal(h.requests[0][1].evidenceKey,h.requests.at(-1)[1].evidenceKey);
});
test('client commit failure and uncertain upload resume without another upload or path deletion',async()=>{
 for(const mode of ['commit-error','timeout']){const h=browser({mode});await assert.rejects(h.api.upload(h.input));const result=await h.api.upload(h.input);assert.equal(result.retained,true);assert.equal(h.stats().uploads,1);}
});
test('client account switch blocks commit and financial evidence keys are passed through unchanged',async()=>{
 const h=browser({mode:'switch'});await assert.rejects(h.api.upload(h.input),/identityChanged/);assert.equal(h.stats().commits,0);
 const other=browser();await other.api.upload({...other.input,evidenceKey:'existing-financial-operation-evidence'});assert.equal(other.requests[0][1].evidenceKey,'existing-financial-operation-evidence');
 const error=other.api.retainedFailure(new Error('business failed'),[{reused:true}]);assert.match(error.message,/retained/);
});
