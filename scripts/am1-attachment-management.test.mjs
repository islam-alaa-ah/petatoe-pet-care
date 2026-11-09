import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { digest, hashFile, writeArchive, wrapText } from '../assets/js/attachment-pdf.mjs';
import { createHandler, isDefinitiveStorageRejection, assertVersionBoundSignedUrl } from '../supabase/functions/attachment-admin/core.mjs';

const root = new URL('../', import.meta.url);
const sql = await readFile(new URL('supabase/migrations/20261109090000_am1r1_attachment_management.sql',root),'utf8');
const depRoot = process.env.PETATOE_AM1_TEST_DEPS;
if(!depRoot)throw new Error('Set PETATOE_AM1_TEST_DEPS to the test-only node_modules directory; no production dependency is required.');
const { PGlite } = await import(pathToFileURL(depRoot+'/\u0040electric-sql/pglite/dist/index.js'));
const uid='11111111-1111-4111-8111-111111111111';
const staff='22222222-2222-4222-8222-222222222222';
const oid='33333333-3333-4333-8333-333333333333';
const oid2='44444444-4444-4444-8444-444444444444';
const requestId='55555555-5555-4555-8555-555555555555';
const customerId='66666666-6666-4666-8666-666666666666';
const setup=`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create function auth.role() returns text language sql stable as $$select current_setting('test.jwt_role',true)$$;
create type public.app_role as enum ('super_admin','viewer');
create table public.user_profiles(id uuid primary key,full_name text,role public.app_role,is_active boolean);
insert into public.user_profiles values('${uid}','مسؤول الاختبار','super_admin',true),('${staff}','Limited user','viewer',true);
create table public.app_screens(screen_key text primary key,screen_name text,group_name text,display_order int,is_active boolean);
create table public.role_screen_permissions(role public.app_role,screen_key text,can_view boolean,can_add boolean,can_edit boolean,can_delete boolean,can_export boolean,primary key(role,screen_key));
insert into public.app_screens values('dashboard','Dashboard','Home',1,true);
insert into public.role_screen_permissions values('viewer','dashboard',true,false,false,false,false);
create table storage.buckets(id text primary key,public boolean,type text not null default 'STANDARD',versioning_status text not null default 'DISABLED' check(versioning_status in ('DISABLED','ENABLED','SUSPENDED')));
insert into storage.buckets(id,public) values('installation-evidence',false),('user-whatsapp-templates',false),('unknown-assets',false),('sea-vibe-expenses',false),('sea-vibe-journal-entries',false),('sea-vibe-treasury-vouchers',false);
create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb,created_at timestamptz,updated_at timestamptz,last_accessed_at timestamptz,owner_id text,version text,owner uuid,user_metadata jsonb,archived_at timestamptz,is_delete_marker boolean not null default false,is_versioned boolean not null default false);
create unique index idx_objects_current_version on storage.objects(bucket_id,name collate "C") where archived_at is null;
create unique index idx_objects_null_version on storage.objects(bucket_id,name collate "C") where not is_versioned;
create unique index objects_bucket_id_name_version_key on storage.objects(bucket_id,name collate "C",version) nulls not distinct;
create function storage.protect_delete() returns trigger language plpgsql as $$ begin
 if coalesce(current_setting('storage.allow_delete_query',true),'false')<>'true' then
 raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.' using hint='This prevents accidental data loss from orphaned objects.',errcode='42501'; end if; return null;
end $$;
create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
create function storage.update_updated_at_column() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
create trigger update_objects_updated_at before update on storage.objects for each row execute function storage.update_updated_at_column();
-- Fixture-only permission to exercise the row guard, not a Production RLS policy.
alter table storage.objects enable row level security;
create policy fixture_storage_access on storage.objects for all to authenticated using(true) with check(true);
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
create table public.installation_execution_files(id uuid default gen_random_uuid(),storage_path text,installation_request_id uuid,uploaded_by uuid,uploaded_at timestamptz,original_name text);
create table public.installation_completion_files(like public.installation_execution_files including defaults);
create table public.installation_requests(id uuid,customer_id uuid,request_number text);
create table public.customers(id uuid,customer_name text);
create table public.user_whatsapp_templates(user_id uuid,image_path text,image_name text);
create table public.sea_vibe_expense_attachments(id uuid,storage_path text,created_at timestamptz,expense_id uuid,created_by uuid);
create table public.sea_vibe_expenses(id uuid,trip_id uuid);
create table public.sea_vibe_trips(id uuid,customer_id uuid,trip_serial text);
create table public.sea_vibe_customers(id uuid,full_name text);
create table public.sea_vibe_treasury_voucher_attachments(id uuid,storage_path text,created_at timestamptz,voucher_id uuid);
create table public.sea_vibe_treasury_vouchers(id uuid,voucher_no text);
create table public.sea_vibe_journal_entry_attachments(id uuid,storage_path text,journal_entry_id uuid);
create table public.sea_vibe_journal_entries(id uuid,journal_no text);
insert into public.customers values('${customerId}','عميل تجريبي');
insert into public.installation_requests values('${requestId}','${customerId}','TEST-REQ-001');
insert into public.installation_execution_files(storage_path,installation_request_id,uploaded_by,uploaded_at,original_name) values('request/photo.jpg','${requestId}','${uid}','2026-10-10T08:00:00Z','صورة تجريبية.jpg');
insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,last_accessed_at,owner_id,version) values('${oid}','installation-evidence','request/photo.jpg','{"size":1234,"mimetype":"image/jpeg"}','2026-10-10T08:00:00Z','2026-10-10T08:00:00Z',null,'${uid}','v1');
`;
async function database() {
 const db=new PGlite();await db.exec(setup);await db.exec(sql);
 const rpc=async(action,input={},actor=uid)=>(await db.query('select public.petatoe_attachment_admin_am1($1::uuid,$2,$3::jsonb) as result',[actor,action,JSON.stringify({revision:'AM1R1',...input})])).rows[0].result;
 return {db,rpc,enable:()=>db.exec('update petatoe_am1.config set enabled=true')};
}
async function bindArchive(ctx,a) {
 const items=(await ctx.db.query('select ordinal,object_version from petatoe_am1.items where archive_id=$1',[a.id])).rows;
 for(const i of items)await ctx.rpc('item_signed',{archiveId:a.id,ordinal:i.ordinal,boundVersion:i.object_version});
}
// LOCAL FIXTURE ONLY: emulate Storage API transaction; never Production SQL.
async function storageRemove(ctx,where) {
 try {await ctx.db.exec("begin; set local storage.allow_delete_query='true';");await ctx.db.exec('delete from storage.objects where '+where);await ctx.db.exec('commit');}
 catch(error){await ctx.db.exec('rollback');throw error;}
}
async function readyArchive(ctx) {
 await ctx.enable();const a=await ctx.rpc('begin',{month:'2026-10'});
 await bindArchive(ctx,a);await ctx.rpc('complete',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:Array.from({length:a.count},(_,i)=>({ordinal:i+1,sha256:'b'.repeat(64)}))});
 await ctx.rpc('confirm',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000});return a;
}
test('migration installs disabled and denies the public RPC to browser roles',async()=>{
 const {db,rpc}=await database();try{
  assert.equal((await db.query('select enabled,deletion_enabled from petatoe_am1.config')).rows[0].enabled,false);
  await assert.rejects(rpc('list',{}),/AM1_NOT_ENABLED/);
  const acl=await db.query("select has_function_privilege('anon','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','execute') a,has_function_privilege('authenticated','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','execute') b,has_function_privilege('service_role','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','execute') c");
  assert.deepEqual(acl.rows[0],{a:false,b:false,c:true});
  await db.exec('set role authenticated');await assert.rejects(rpc('status'),/permission denied/);await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from public.role_screen_permissions where role='viewer' and screen_key='dashboard' and can_view=true")).rows[0].n,1);
 }finally{await db.close();}
});
test('limited, missing, inactive and mismatching users cannot access global images',async()=>{
 const c=await database();try{await c.enable();
  for(const actor of [staff,null,oid])await assert.rejects(c.rpc('status',{},actor),/AM1_FORBIDDEN/);
  await c.db.exec(`update public.user_profiles set is_active=false where id='${uid}'`);await assert.rejects(c.rpc('status'),/AM1_FORBIDDEN/);
 }finally{await c.db.close();}
});
test('list returns exact source, uploader and customer; all-month listing is supported',async()=>{
 const c=await database();try{await c.enable();const x=await c.rpc('list',{});assert.equal(x.items.length,1);assert.equal(x.items[0].customer.name,'عميل تجريبي');assert.equal(x.items[0].uploader.name,'مسؤول الاختبار');assert.equal(x.items[0].protected,false);assert.equal(x.items[0].reference,'TEST-REQ-001');
 assert.equal((await c.rpc('list',{month:'2026-09'})).items.length,0);
 assert.equal((await c.rpc('preview',{objectId:oid})).fileName,'صورة تجريبية.jpg');
 }finally{await c.db.close();}
});
test('month boundaries use provider content time in Saudi time, ignoring row updated_at',async()=>{
 const c=await database();try{await c.enable();
 await c.db.exec(`update storage.objects set created_at='2026-09-30T20:59:59Z',metadata=metadata||'{"lastModified":"2026-09-30T21:00:00Z"}'::jsonb where id='${oid}'`);
 assert.equal((await c.rpc('list',{month:'2026-09'})).items.length,0);assert.equal((await c.rpc('list',{month:'2026-10'})).items.length,1);
 await assert.rejects(c.rpc('begin',{month:'2099-12'}),/AM1_MONTH_NOT_CLOSED/);await assert.rejects(c.rpc('list',{month:'2026-13'}),/AM1_INVALID_MONTH/);
 }finally{await c.db.close();}
});
test('snapshot leases protect exact archived paths against updates, inserts and deletes',async()=>{
 const c=await database();try{await c.enable();const a=await c.rpc('begin',{month:'2026-10'});
 await c.db.exec("set test.jwt_role='authenticated'");
 await c.db.exec(`update storage.objects set last_accessed_at=now() where id='${oid}'`);
 await assert.rejects(c.db.exec(`update storage.objects set version='v2' where id='${oid}'`),/AM1_OBJECT_ARCHIVING/);
 await assert.rejects(storageRemove(c,`id='${oid}'`),/AM1_OBJECT_ARCHIVING/);
 await assert.rejects(c.db.exec(`insert into storage.objects(id,bucket_id,name) values('${oid2}','installation-evidence','request/photo.jpg')`),/AM1_OBJECT_ARCHIVING/);
 // Unrelated uploads and all financial business rows remain writable.
 await c.db.exec(`insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,last_accessed_at,owner_id,version) values('${oid2}','installation-evidence','request/new.jpg','{}',now(),now(),null,'${uid}','v1')`);
 await c.db.exec(`update public.installation_requests set request_number='TEST-REQ-002' where id='${requestId}'`);
 await c.rpc('cancel',{archiveId:a.id});await c.db.exec(`update storage.objects set version='v2' where id='${oid}'`);
 }finally{await c.db.close();}
});
test('failed/changed/incomplete exports cannot become ready; access reads do not invalidate',async()=>{
 const c=await database();try{await c.enable();const a=await c.rpc('begin',{month:'2026-10'});
 await assert.rejects(c.rpc('complete',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:[]}),/AM1_INVALID_RECEIPT/);
 await c.db.exec(`update storage.objects set last_accessed_at=now() where id='${oid}'`);
 assert.equal((await c.rpc('item',{archiveId:a.id,ordinal:1})).objectId,oid);
 await c.db.exec("update petatoe_am1.leases set expires_at=clock_timestamp()-interval '1 second'");
 await c.db.exec(`update storage.objects set version='v2' where id='${oid}'`);
 await assert.rejects(c.rpc('item',{archiveId:a.id,ordinal:1}),/AM1_OBJECT_CHANGED/);
 await assert.rejects(c.rpc('complete',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:[{ordinal:1,sha256:'b'.repeat(64)}]}),/AM1_OBJECT_CHANGED/);
 }finally{await c.db.close();}
});
test('WhatsApp and unknown images are listed/exported but protected from monthly deletion',async()=>{
 const c=await database();try{await c.enable();
 await c.db.exec(`insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,last_accessed_at,owner_id,version) values('${oid2}','user-whatsapp-templates','${uid}/default.png','{"mimetype":"image/png","size":34}','2026-10-10Z','2026-10-10Z',null,'${uid}','v1')`);
 const list=await c.rpc('list',{month:'2026-10'});assert.equal(list.items.length,2);assert.equal(list.items.find(x=>x.objectId===oid2).protected,true);
 const a=await c.rpc('begin',{month:'2026-10'});assert.equal(a.count,2);assert.equal((await c.db.query('select count(*)::int n from petatoe_am1.leases')).rows[0].n,1);
 }finally{await c.db.close();}
});
test('deletion is disabled separately and requires the exact saved PDF checksum',async()=>{
 const c=await database();try{await c.enable();const a=await c.rpc('begin',{month:'2026-10'});
 await assert.rejects(c.rpc('confirm',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000}),/AM1_PDF_MISMATCH/);
 await bindArchive(c,a);await c.rpc('complete',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:[{ordinal:1,sha256:'b'.repeat(64)}]});
 await assert.rejects(c.rpc('confirm',{archiveId:a.id,sha256:'c'.repeat(64),bytes:2000}),/AM1_PDF_MISMATCH/);
 await c.rpc('confirm',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000});
 await assert.rejects(c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'}),/AM1_DELETION_NOT_ENABLED/);
 await c.db.exec('update petatoe_am1.config set deletion_enabled=true');
 await assert.rejects(c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-09'}),/AM1_PURGE_NOT_CONFIRMED/);
 }finally{await c.db.close();}
});
test('purge excludes later uploads, rejects replaced originals and preserves business records',async()=>{
 const c=await database();try{const a=await readyArchive(c);await c.db.exec('update petatoe_am1.config set deletion_enabled=true');
 await c.db.exec(`insert into storage.objects(id,bucket_id,name,metadata,created_at,updated_at,last_accessed_at,owner_id,version) values('${oid2}','installation-evidence','request/later.jpg','{"mimetype":"image/jpeg","size":34}','2026-10-15Z','2026-10-15Z',null,'${uid}','v1')`);
 await c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'});const b=await c.rpc('purge_batch_begin',{archiveId:a.id});
 await assert.rejects(c.rpc('purge_batch_begin',{archiveId:a.id}),/AM1_PURGE_BUSY/);
 const next=await c.rpc('purge_next',{archiveId:a.id,token:b.token});assert.equal(next.objectId,oid);
 await assert.rejects(c.rpc('purge_mark',{archiveId:a.id,ordinal:next.ordinal,token:b.token}),/AM1_STORAGE_DELETE_NOT_PROVEN/);
 await storageRemove(c,`id='${oid}'`);await c.rpc('purge_mark',{archiveId:a.id,ordinal:next.ordinal,token:b.token});
 assert.equal((await c.rpc('purge_next',{archiveId:a.id,token:b.token})).done,true);assert.equal((await c.db.query('select id from storage.objects')).rows[0].id,oid2);
 assert.equal((await c.db.query('select count(*)::int n from public.installation_execution_files')).rows[0].n,1);
 assert.equal((await c.db.query('select count(*)::int n from public.customers')).rows[0].n,1);
 }finally{await c.db.close();}
});
test('replaced path and reused object name never authorize deletion of a new object',async()=>{
 const c=await database();try{const a=await readyArchive(c);await c.db.exec('update petatoe_am1.config set deletion_enabled=true');await c.db.exec(`update storage.objects set id='${oid2}' where id='${oid}'`);
 await assert.rejects(c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'}),/AM1_OBJECT_CHANGED_REEXPORT_REQUIRED/);
 }finally{await c.db.close();}
});
test('uncertain successful Storage removal is reconciled on manual resume',async()=>{
 const c=await database();try{const a=await readyArchive(c);await c.db.exec('update petatoe_am1.config set deletion_enabled=true');await c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'});
 let batch=await c.rpc('purge_batch_begin',{archiveId:a.id});await c.rpc('purge_next',{archiveId:a.id,token:batch.token});await storageRemove(c,`id='${oid}'`);
 await c.rpc('purge_batch_end',{archiveId:a.id,token:batch.token});batch=await c.rpc('purge_batch_begin',{archiveId:a.id});
 assert.equal((await c.rpc('purge_next',{archiveId:a.id,token:batch.token})).reconciled,true);assert.equal((await c.rpc('purge_next',{archiveId:a.id,token:batch.token})).done,true);
 }finally{await c.db.close();}
});
test('an uncertain pending removal is never retried while the original still exists',async()=>{
 const c=await database();try{const a=await readyArchive(c);await c.db.exec('update petatoe_am1.config set deletion_enabled=true');await c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'});
 const batch=await c.rpc('purge_batch_begin',{archiveId:a.id});await c.rpc('purge_next',{archiveId:a.id,token:batch.token});
 await c.rpc('purge_failure',{archiveId:a.id,ordinal:1,token:batch.token,definiteFailure:false});
 await assert.rejects(c.rpc('purge_next',{archiveId:a.id,token:batch.token}),/AM1_STORAGE_OUTCOME_UNCERTAIN/);
 assert.equal((await c.db.query("select count(*)::int n from petatoe_am1.leases where expires_at='infinity'")).rows[0].n,1);
 }finally{await c.db.close();}
});
test('readonly precheck, verification and disable scripts execute; no legacy policies are changed',async()=>{
 const c=await database();try{
 for(const file of ['00_PRECHECK_READONLY.sql','01_VERIFY_INSTALL_READONLY.sql','02_ENABLE_READ_EXPORT.sql','03_VERIFY_ARCHIVES_READONLY.sql','05_ROLLBACK_DISABLE.sql'])await c.db.exec(await readFile(new URL('docs/AM1/sql/'+file,root),'utf8'));
 assert.equal((await c.db.query('select enabled from petatoe_am1.config')).rows[0].enabled,false);
 assert.ok(!/drop\s+(?:table|view|function|policy)|cascade|delete\s+from\s+(?:storage\.|public\.)/i.test(sql));
 }finally{await c.db.close();}
});
test('delete activation needs a verified archive; emergency stop retains locks and data',async()=>{
 const c=await database();try{
 const enable=await readFile(new URL('docs/AM1/sql/04_ENABLE_DELETE_AFTER_REVIEW.sql',root),'utf8');
 await assert.rejects(c.db.exec(enable),/AM1_NOT_ENABLED/);await c.db.exec('rollback');
 const a=await readyArchive(c);await c.db.exec(enable);
 assert.equal((await c.db.query('select deletion_enabled from petatoe_am1.config')).rows[0].deletion_enabled,true);
 await c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'});
 await assert.rejects(c.db.exec(await readFile(new URL('docs/AM1/sql/05_ROLLBACK_DISABLE.sql',root),'utf8')),/AM1_PURGE_RECONCILIATION_REQUIRED/);await c.db.exec('rollback');
 await c.db.exec(await readFile(new URL('docs/AM1/sql/06_EMERGENCY_STOP_KEEP_LOCKS.sql',root),'utf8'));
 assert.equal((await c.db.query('select enabled from petatoe_am1.config')).rows[0].enabled,false);
 assert.equal((await c.db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
 assert.equal((await c.db.query("select count(*)::int n from petatoe_am1.leases where expires_at='infinity'")).rows[0].n,1);
 // After an explicit review, the same verified archive can resume from purging.
 await c.db.exec(await readFile(new URL('docs/AM1/sql/02_ENABLE_READ_EXPORT.sql',root),'utf8'));
 await c.db.exec(enable);assert.equal((await c.db.query('select deletion_enabled from petatoe_am1.config')).rows[0].deletion_enabled,true);
 assert.equal((await c.db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
 }finally{await c.db.close();}
});

test('SHA-256 is identical to Node crypto and incremental saved-file verification',async()=>{
 const data=new TextEncoder().encode('صورة اختبار 🐾\nPETATOE');
 assert.equal(digest(data),createHash('sha256').update(data).digest('hex'));
 assert.equal(await hashFile(new Blob([data])),digest(data));
});
test('PDF writer has valid byte offsets, exact page count, embedded original bytes and no signed URL',async()=>{
 const chunks=[];let closed=0;const image=new Uint8Array([0xff,0xd8,1,2,0xff,0xd9]);
 const result=await writeArchive({archive:{id:uid,month:'2026-10',count:2},sink:{write:async b=>chunks.push(b),close:async()=>closed++,abort:async()=>{}},load:async ordinal=>({item:{ordinal,fileName:'صورة.jpg',mimeType:'image/jpeg',signedUrl:'https://secret.invalid/token'},bytes:image}),render:async()=>({jpeg:image,width:10,height:20})});
 const out=Buffer.concat(chunks);assert.equal(closed,1);assert.equal(result.sha256,createHash('sha256').update(out).digest('hex'));assert.equal(result.bytes,out.length);assert.equal(result.originals.length,2);
 const text=out.toString('latin1');assert.match(text,/\/Count 2/);assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,2);assert.ok(text.includes('/EmbeddedFiles'));assert.ok(!text.includes('secret.invalid'));
 const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(out.subarray(start,start+4).toString(),'xref');
 const rows=text.slice(start).split('\n');const count=Number(rows[1].split(' ')[1]);for(let i=1;i<count;i++){const offset=Number(rows[i+2].slice(0,10));assert.ok(out.subarray(offset,offset+`${i} 0 obj`.length).toString()===`${i} 0 obj`);}
});
test('missing image, cancellation or sink failure aborts the entire PDF without closing it',async()=>{
 for(const failure of ['load','render','write','cancel']){
  const c=new AbortController();let aborted=0,closed=0;
  if(failure==='cancel')c.abort();
  await assert.rejects(writeArchive({archive:{count:1},signal:c.signal,sink:{write:async()=>{if(failure==='write')throw Error('write failed');},close:async()=>closed++,abort:async()=>aborted++},load:async()=>{if(failure==='load')throw Error('missing');return{item:{ordinal:1},bytes:new Uint8Array([1])};},render:async()=>{throw Error('render failed');}}));
  assert.equal(closed,0);assert.equal(aborted,1);
 }
});
test('long Arabic/English metadata wraps without dropping characters',()=>{
 const original='عميل تجريبي - Test 123 🐾';const lines=wrapText({measureText:t=>({width:Array.from(t).length*10})},original,55);assert.equal(lines.join(''),original);
});

function handlerHarness(overrides={}) {
 const calls=[];const handler=createHandler({origins:['https://example.test'],authenticate:async token=>token==='valid'?{id:uid}:null,rpc:async(actor,action,input)=>{calls.push({actor,action,input});if(action==='item'||action==='preview')return{bucket:'server-bucket',path:'server/path.jpg',objectVersion:'v1'};return{ok:true};},sign:async()=> 'https://storage.test/signed',remove:async()=>{},...overrides});
 const request=(body,token='valid',origin='https://example.test')=>new Request('https://edge.test',{method:'POST',headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},body:JSON.stringify({revision:'AM1R1',...body})});
 return{calls,handler,request};
}
test('Edge authentication, origin and action validation fail closed',async()=>{
 const h=handlerHarness();assert.equal((await h.handler(h.request({action:'status'},'invalid'))).status,401);assert.equal((await h.handler(h.request({action:'status'},'valid','https://evil.test'))).status,403);assert.equal((await h.handler(h.request({action:'purge_next'}))).status,400);assert.equal(h.calls.length,0);
});
test('Edge ignores submitted actor/path/bucket and signs only server-resolved objects',async()=>{
 const h=handlerHarness();const response=await h.handler(h.request({action:'item',actor:staff,p_actor:staff,bucket:'evil',path:'evil',archiveId:uid,ordinal:1}));assert.equal(response.status,200);assert.equal(h.calls[0].actor,uid);assert.deepEqual(h.calls[0].input,{revision:'AM1R1',archiveId:uid,ordinal:1});
});
test('Edge deletion batches are bounded, serialized by RPC token and marked after Storage succeeds',async()=>{
 let removed=0;const actions=[];
 const h=handlerHarness({rpc:async(actor,action,input)=>{actions.push(action);if(action==='purge_batch_begin')return{token:'server-token'};if(action==='purge_next'){assert.equal(input.token,'server-token');return{bucket:'server',path:'exact.jpg',objectVersion:'v1',ordinal:removed+1};}if(action==='purge_mark')assert.ok(removed>0);return{};},remove:async()=>removed++});
 const r=await h.handler(h.request({action:'purge',archiveId:uid,confirmMonth:'2026-10'}));assert.equal(r.status,200);assert.equal(removed,5);assert.equal(actions[0],'purge_prepare');assert.equal(actions.at(-1),'purge_batch_end');
});
test('Edge never marks failed removals or returns internal SQL, URLs and credentials',async()=>{
 const actions=[];const h=handlerHarness({rpc:async(actor,action)=>{actions.push(action);if(action==='purge_batch_begin')return{token:'t'};if(action==='purge_next')return{bucket:'b',path:'p',objectVersion:'v1',ordinal:1};return{};},remove:async()=>{throw Error('AM1_STORAGE_DELETE_FAILED internal_secret http://private');}});
 const r=await h.handler(h.request({action:'purge',archiveId:uid,confirmMonth:'2026-10'}));assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'AM1_STORAGE_OUTCOME_UNCERTAIN'});assert.ok(!actions.includes('purge_mark'));assert.ok(actions.includes('purge_failure'));assert.equal(actions.at(-1),'purge_batch_end');
});
test('gateway 408/499, network and server failures never authorize a deletion retry',()=>{
 for(const statusCode of [408,499,500,502,503,504])assert.equal(isDefinitiveStorageRejection({name:'StorageApiError',statusCode}),false);
 assert.equal(isDefinitiveStorageRejection({name:'StorageUnknownError',statusCode:400}),false);
 assert.equal(isDefinitiveStorageRejection({name:'StorageApiError',statusCode:401}),true);
 assert.equal(isDefinitiveStorageRejection({name:'StorageApiError',statusCode:403}),true);
});
test('module initialization on dashboard makes no requests, timers or subscriptions',async()=>{
 const events=[];const window={KYUMNavigation:{current:()=> 'dashboard'},addEventListener:(name,fn)=>events.push(name)};
 const document={readyState:'complete',getElementById:()=>null,querySelectorAll:()=>[]};
 vm.runInNewContext(await readFile(new URL('assets/js/attachment-management.js',root),'utf8'),{window,document,navigator:{onLine:true},URL,AbortController,console});
 assert.equal(window.AttachmentManagement.runtime,'AM1R1');assert.deepEqual(JSON.parse(JSON.stringify(window.AttachmentManagement.getStatus())),{active:false,busy:false,listed:0,archiveInProgress:false});
 assert.ok(events.includes('kyum-view-changed'));
});
test('release metadata, menu, HTML hooks, translation keys and cached imports agree',async()=>{
 const version=JSON.parse(await readFile(new URL('version.json',root),'utf8'));assert.equal(version.version,'18.56.145');assert.equal(version.forceUpdate,false);
 const html=await readFile(new URL('index.html',root),'utf8');const app=await readFile(new URL('assets/js/app.js',root),'utf8');const sw=await readFile(new URL('service-worker.js',root),'utf8');const locale=await readFile(new URL('assets/js/localization-center.js',root),'utf8');
 assert.match(html,/data-view="attachmentManagement"/);assert.match(app,/attachmentManagement: document.getElementById\("attachmentManagementView"\)/);assert.ok(sw.includes(version.cacheToken));assert.match(sw,/attachment-pdf.mjs/);
 for(const key of html.matchAll(/data-petatoe-i18n="(attachments\.[^"]+)"/g))assert.ok(locale.includes('"'+key[1]+'"'),key[1]);
 assert.ok(!html.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('managed bookkeeping updates preserve the archive, physical version and upload month',async()=>{
 const c=await database();try{await c.enable();const a=await c.rpc('begin',{month:'2026-10'});
 const before=(await c.rpc('item',{archiveId:a.id,ordinal:1}));
 await c.db.exec("set test.jwt_role='authenticated'");
 await c.db.exec(`update storage.objects set last_accessed_at=now() where id='${oid}'`);
 const updated=(await c.db.query('select updated_at from storage.objects where id=$1',[oid])).rows[0].updated_at;
 assert.ok(new Date(updated)>new Date('2026-10-10T08:00:00Z'));
 const after=await c.rpc('item',{archiveId:a.id,ordinal:1});
 assert.equal(after.fingerprint,before.fingerprint);assert.equal(after.objectVersion,'v1');
 assert.equal((await c.rpc('list',{month:'2026-10'})).items.length,1);
 await bindArchive(c,a);await c.rpc('complete',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:[{ordinal:1,sha256:'b'.repeat(64)}]});
 assert.equal((await c.rpc('status')).archives[0].status,'ready');
 }finally{await c.db.close();}
});
test('managed direct-delete protection remains enforced, with no production bypass setting',async()=>{
 const c=await database();try{
 await assert.rejects(c.db.exec(`delete from storage.objects where id='${oid}'`),e=>e.code==='42501'&&/Use the Storage API/.test(e.message));
 assert.ok(!/storage\.allow_delete_query/.test(sql));
 assert.equal((await c.db.query("select count(*)::int n from pg_trigger where tgrelid='storage.objects'::regclass and tgname in ('protect_objects_delete','update_objects_updated_at') and tgenabled='O'")).rows[0].n,2);
 }finally{await c.db.close();}
});
test('current-image filtering excludes archived rows and delete markers from list and export',async()=>{
 const c=await database();try{await c.enable();
 await c.db.exec(`insert into storage.objects(id,bucket_id,name,metadata,created_at,version,archived_at,is_versioned)
 values('${oid2}','installation-evidence','request/photo.jpg','{"mimetype":"image/jpeg","size":12}','2026-10-10Z','old','2026-10-11Z',true);
 insert into storage.objects(id,bucket_id,name,metadata,created_at,version,is_delete_marker)
 values('${customerId}','unknown-assets','marker.jpg','{"mimetype":"image/jpeg"}','2026-10-10Z','marker',true);`);
 assert.equal((await c.rpc('list',{})).items.length,1);
 assert.equal((await c.rpc('begin',{month:'2026-10'})).count,1);
 await assert.rejects(c.rpc('preview',{objectId:oid2}),/AM1_IMAGE_UNAVAILABLE/);
 }finally{await c.db.close();}
});
test('missing attachment links are protected and Storage owner is not asserted as the uploader',async()=>{
 const c=await database();try{await c.enable();
 await c.db.exec(`insert into storage.objects(id,bucket_id,name,metadata,created_at,owner_id,version)
 values('${oid2}','installation-evidence','request/unmapped.jpg','{"mimetype":"image/jpeg","size":12}','2026-10-10Z','${uid}','unmapped');`);
 const item=(await c.rpc('list',{})).items.find(x=>x.objectId===oid2);
 assert.equal(item.protected,true);assert.equal(item.customer,null);assert.equal(item.source,'unmapped');assert.equal(item.uploaderEvidence,'storage_owner');
 const a=await readyArchive(c);await c.db.exec('update petatoe_am1.config set deletion_enabled=true');
 await c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'});const b=await c.rpc('purge_batch_begin',{archiveId:a.id});
 assert.equal((await c.rpc('purge_next',{archiveId:a.id,token:b.token})).objectId,oid);
 assert.equal((await c.db.query('select count(*)::int n from petatoe_am1.items where protected')).rows[0].n,1);
 }finally{await c.db.close();}
});
test('invalid provider timestamps fall back explicitly; unknown dates remain visible and protected',async()=>{
 const c=await database();try{await c.enable();
 for(const value of ['not-a-date','2026-99-99T00:00:00Z','2026-10-10T10:00:00']){
 await c.db.query('update storage.objects set metadata=metadata||jsonb_build_object(\'lastModified\',$1::text) where id=$2',[value,oid]);
 const item=(await c.rpc('list',{month:'2026-10'})).items[0];assert.equal(item.uploadTimeEvidence,'storage.created_at');
 }
 await c.db.exec(`update storage.objects set created_at=null where id='${oid}'`);
 const item=(await c.rpc('list',{})).items[0];assert.equal(item.uploadedAt,null);assert.equal(item.protected,true);assert.equal(item.uploadTimeEvidence,'not_recorded');
 await assert.rejects(c.rpc('begin',{month:'2026-10'}),/AM1_EMPTY_MONTH/);
 }finally{await c.db.close();}
});
test('unsupported bucket modes and missing physical versions cannot create a partial archive',async()=>{
 const c=await database();try{await c.enable();
 await c.db.exec("update storage.buckets set versioning_status='ENABLED' where id='installation-evidence'");
 await assert.rejects(c.rpc('begin',{month:'2026-10'}),/AM1_BUCKET_MODE_UNSUPPORTED/);
 await c.db.exec("update storage.buckets set versioning_status='DISABLED'; update storage.objects set version=null");
 await assert.rejects(c.rpc('begin',{month:'2026-10'}),/AM1_VERSION_READ_UNSUPPORTED/);
 assert.equal((await c.db.query('select count(*)::int n from petatoe_am1.archives')).rows[0].n,0);
 }finally{await c.db.close();}
});
test('a saved PDF cannot become ready before trusted version-bound signing of every original',async()=>{
 const c=await database();try{await c.enable();const a=await c.rpc('begin',{month:'2026-10'});
 const receipt={archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:[{ordinal:1,sha256:'b'.repeat(64)}]};
 await assert.rejects(c.rpc('complete',receipt),/AM1_VERSION_READ_UNSUPPORTED/);
 await assert.rejects(c.rpc('item_signed',{archiveId:a.id,ordinal:1,boundVersion:'wrong'}),/AM1_VERSION_READ_UNSUPPORTED/);
 await bindArchive(c,a);assert.equal((await c.rpc('complete',receipt)).ready,true);
 }finally{await c.db.close();}
});
test('manual reconciliation recognizes a removed old version without authorizing a replacement',async()=>{
 const c=await database();try{const a=await readyArchive(c);await c.db.exec('update petatoe_am1.config set deletion_enabled=true');
 await c.rpc('purge_prepare',{archiveId:a.id,confirmMonth:'2026-10'});const b=await c.rpc('purge_batch_begin',{archiveId:a.id});
 const next=await c.rpc('purge_next',{archiveId:a.id,token:b.token});assert.equal(next.objectVersion,'v1');
 await storageRemove(c,`id='${oid}'`);
 // A privileged maintenance actor is outside the normal upload guard boundary.
 await c.db.exec('alter table storage.objects disable trigger petatoe_am1_archive_guard');
 await c.db.exec(`insert into storage.objects(id,bucket_id,name,metadata,created_at,version) values('${oid2}','installation-evidence','request/photo.jpg','{"mimetype":"image/jpeg"}',now(),'new-version')`);
 await c.db.exec('alter table storage.objects enable trigger petatoe_am1_archive_guard');
 assert.equal((await c.rpc('purge_next',{archiveId:a.id,token:b.token})).reconciled,true);
 assert.equal((await c.rpc('purge_next',{archiveId:a.id,token:b.token})).done,true);
 assert.equal((await c.db.query('select version from storage.objects')).rows[0].version,'new-version');
 }finally{await c.db.close();}
});
function signedURL({versionId='v1',url='server/path.jpg',exp=Math.floor(Date.now()/1000)+120,origin='https://storage.test',pathname='/storage/v1/object/sign/server/path.jpg'}={}){
 const token=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({versionId,url,exp})).toString('base64url')+'.test-signature';
 return origin+pathname+'?token='+token;
}
test('version binding rejects ignored version options, wrong path/host, malformed and expired signatures',()=>{
 assert.equal(assertVersionBoundSignedUrl(signedURL(),'https://storage.test','server','path.jpg','v1'),signedURL());
 for(const url of [signedURL({versionId:null}),signedURL({versionId:'v2'}),signedURL({url:'other/path.jpg'}),signedURL({exp:1}),signedURL({origin:'https://evil.test'}),signedURL({pathname:'/storage/v1/object/sign/server/other.jpg'}),'https://storage.test?token=broken'])
 assert.throws(()=>assertVersionBoundSignedUrl(url,'https://storage.test','server','path.jpg','v1'),/AM1_VERSION_READ_UNSUPPORTED/);
});
test('a mismatched Edge/UI or SQL revision stops before data access',async()=>{
 const h=handlerHarness();const r=await h.handler(h.request({action:'status',revision:'AM1'}));assert.equal(r.status,409);assert.equal(h.calls.length,0);
 const c=await database();try{await c.enable();await assert.rejects(c.rpc('status',{revision:'AM1'}),/AM1_REVISION_MISMATCH/);}finally{await c.db.close();}
});
test('guard does not depend on a Storage metadata writer retaining the user JWT role',async()=>{
 const c=await database();try{await c.enable();const a=await c.rpc('begin',{month:'2026-10'});
 for(const role of ['authenticated','service_role','']){
 await c.db.query("select set_config('test.jwt_role',$1,false)",[role]);
 await assert.rejects(c.db.exec(`update storage.objects set version='v2' where id='${oid}'`),/AM1_OBJECT_ARCHIVING/);
 }
 await c.rpc('cancel',{archiveId:a.id});await c.db.exec(`update storage.objects set version='v2' where id='${oid}'`);
 }finally{await c.db.close();}
});
test('ambiguous source mappings never invent a customer or authorize deletion',async()=>{
 const c=await database();try{await c.enable();
 await c.db.exec(`insert into public.installation_completion_files(storage_path,installation_request_id,uploaded_by) values('request/photo.jpg','${requestId}','${uid}')`);
 const item=(await c.rpc('list',{})).items[0];assert.equal(item.sourceMatches,2);assert.equal(item.protected,true);assert.equal(item.customer,null);assert.equal(item.source,'ambiguous');assert.equal(item.protectionReason,'AMBIGUOUS_REQUIRES_REVIEW');
 }finally{await c.db.close();}
});
test('actual Edge adapter and SDK serialize exact-version signing and deletion without fallback',async()=>{
 const {createClient}=await import(pathToFileURL(depRoot+'/@supabase/supabase-js/dist/index.mjs'));
 const ts=await import(pathToFileURL(depRoot+'/typescript/lib/typescript.js'));
 const seen=[];let handler,removed=false,ignoreVersion=false;
 const transport=async(input,init={})=>{
  const u=new URL(typeof input==='string'?input:input.url||input);const method=init.method||'GET';
  const body=typeof init.body==='string'?JSON.parse(init.body):null;seen.push({path:u.pathname,method,body});
  let data;
  if(u.pathname==='/auth/v1/user')data={id:uid};
  else if(u.pathname.endsWith('/rpc/petatoe_attachment_admin_am1')){
   assert.equal(body.p_actor,uid);assert.equal(body.p_input.revision,'AM1R1');
   if(body.p_action==='item')data={bucket:'server',path:'path.jpg',objectVersion:'v1'};
   else if(body.p_action==='purge_batch_begin')data={token:'t'};
   else if(body.p_action==='purge_next')data=removed?{done:true}:{bucket:'server',path:'path.jpg',objectVersion:'v1',ordinal:1};
   else data={ok:true};
  }else if(u.pathname==='/storage/v1/object/sign/server/path.jpg'){
   assert.equal(body.versionId,'v1');data={signedURL:signedURL({versionId:ignoreVersion?null:'v1'}).replace('https://storage.test/storage/v1','')};
  }else if(u.pathname==='/storage/v1/object/server'&&method==='DELETE'){
   assert.deepEqual(body.prefixes,[{path:'path.jpg',versionId:'v1'}]);removed=true;data=[];
  }else throw Error('Unexpected test request');
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
 };
 const source=(await readFile(new URL('supabase/functions/attachment-admin/index.ts',root),'utf8')).replace(/^import .*;\n/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(compiled,{createClient,createHandler,assertVersionBoundSignedUrl,isDefinitiveStorageRejection,fetch:transport,AbortSignal,URL,TextDecoder,Uint8Array,atob,console,Deno:{env:{get:key=>({SUPABASE_URL:'https://storage.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-not-a-real-key',AM1_ALLOWED_ORIGINS:'https://example.test'})[key]},serve:h=>{handler=h;}}});
 const request=action=>new Request('https://edge.test',{method:'POST',headers:{origin:'https://example.test',authorization:'Bearer test-user-token'},body:JSON.stringify({action,revision:'AM1R1',archiveId:uid,ordinal:1,confirmMonth:'2026-10'})});
 assert.equal((await handler(request('item'))).status,200);assert.ok(seen.some(x=>x.body?.p_action==='item_signed'));
 assert.equal((await handler(request('purge'))).status,200);assert.equal(seen.filter(x=>x.method==='DELETE').length,1);
 ignoreVersion=true;const boundCount=seen.filter(x=>x.body?.p_action==='item_signed').length;
 const rejected=await handler(request('item'));assert.equal(rejected.status,409);assert.equal((await rejected.json()).error,'AM1_VERSION_READ_UNSUPPORTED');
 assert.equal(seen.filter(x=>x.body?.p_action==='item_signed').length,boundCount);assert.equal(seen.filter(x=>x.method==='DELETE').length,1);
});
