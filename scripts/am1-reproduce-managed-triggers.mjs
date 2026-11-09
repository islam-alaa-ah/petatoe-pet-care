// LOCAL ONLY: PostgreSQL WASM memory instance, no Supabase client or HTTP calls.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const project=process.argv[2];
const auditSql=new URL('../docs/AM1/sql/00B_STORAGE_STATE_READONLY.sql',import.meta.url);
const dependencies=process.env.PETATOE_AM1_TEST_DEPS;
if(!project||!dependencies)throw Error('Supply the AM1 source directory and test-only dependencies.');
const {PGlite}=await import(pathToFileURL(dependencies+'/@electric-sql/pglite/dist/index.js'));
const tests=await fs.readFile(project+'/scripts/am1-attachment-management.test.mjs','utf8');
let setup=tests.match(/const setup=`([\s\S]*?)`;/)?.[1];
if(!setup)throw Error('AM1 fixture not found');
const ids={uid:'11111111-1111-4111-8111-111111111111',staff:'22222222-2222-4222-8222-222222222222',oid:'33333333-3333-4333-8333-333333333333',oid2:'44444444-4444-4444-8444-444444444444',requestId:'55555555-5555-4555-8555-555555555555',customerId:'66666666-6666-4666-8666-666666666666'};
setup=setup.replace(/\$\{(\w+)\}/g,(_,key)=>{if(!ids[key])throw Error('Unknown fixture token');return ids[key];});
const db=new PGlite();
try{
 await db.exec(setup);
 await db.exec(await fs.readFile(project+'/supabase/migrations/20261108150000_am1_attachment_management.sql','utf8'));
 await db.exec(`
 create function storage.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;
 create trigger update_objects_updated_at before update on storage.objects for each row execute function storage.update_updated_at_column();
 create function storage.protect_delete() returns trigger language plpgsql as $$begin
 if coalesce(current_setting('storage.allow_delete_query',true),'false')<>'true' then
 raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.' using errcode='42501';
 end if;return null;end;$$;
 create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
 alter table storage.objects add column archived_at timestamptz;
 alter table storage.objects add column is_delete_marker boolean default false;
 alter table storage.objects add column is_versioned boolean default false;
 update petatoe_am1.config set enabled=true;
 `);
 const rpc=async(action,input={})=>(await db.query('select public.petatoe_attachment_admin_am1($1::uuid,$2,$3::jsonb) as r',[ids.uid,action,JSON.stringify(input)])).rows[0].r;
 const a=await rpc('begin',{month:'2026-10'});
 const before=(await db.query('select updated_at,last_accessed_at from storage.objects where id=$1',[ids.oid])).rows[0];
 await db.exec("set test.jwt_role='authenticated'");
 await db.query('update storage.objects set last_accessed_at=now() where id=$1',[ids.oid]);
 const after=(await db.query('select updated_at,last_accessed_at from storage.objects where id=$1',[ids.oid])).rows[0];
 let completeError;
 try{await rpc('complete',{archiveId:a.id,sha256:'a'.repeat(64),bytes:2000,originals:[{ordinal:1,sha256:'b'.repeat(64)}]});}catch(e){completeError=e.message;}
 assert.ok(after.updated_at>before.updated_at);
 assert.match(completeError,/AM1_OBJECT_CHANGED/);
 let directDeleteCode;
 try{await db.query('delete from storage.objects where id=$1',[ids.oid]);}catch(e){directDeleteCode=e.code;}
 assert.equal(directDeleteCode,'42501');
 await rpc('cancel',{archiveId:a.id});
 await db.exec("set test.jwt_role='service_role'");
 await db.query('update storage.objects set archived_at=now(),is_versioned=true where id=$1',[ids.oid]);
 const listed=await rpc('list',{});
 const archivedRowsIncluded=listed.items.some(x=>x.objectId===ids.oid);
 assert.equal(archivedRowsIncluded,true);
 await db.exec(`
 alter table storage.objects add column owner uuid;
 alter table storage.buckets add column type text default 'STANDARD';
 alter table storage.buckets add column versioning_status text default 'DISABLED';
 alter table public.sea_vibe_treasury_voucher_attachments add column created_by uuid;
 alter table public.sea_vibe_journal_entry_attachments add column created_by uuid;
 alter table public.sea_vibe_journal_entry_attachments add column created_at timestamptz;
 alter table public.user_whatsapp_templates add column created_at timestamptz;
 `);
 await db.query('update storage.objects set archived_at=null,is_versioned=false where id=$1',[ids.oid]);
 const liveOutput=await db.exec(await fs.readFile(auditSql,'utf8'));
 const liveAudit=liveOutput.flatMap(x=>x.rows||[]).find(x=>x.am1_storage_semantics_audit)?.am1_storage_semantics_audit;
 assert.equal(liveAudit?.transaction_read_only,'on');
 assert.equal(liveAudit.source_coverage.find(x=>x.bucket_id==='installation-evidence').with_exactly_one_source_record,1);
 assert.equal(liveAudit.source_coverage.find(x=>x.bucket_id==='installation-evidence').expected_customer_missing,0);
 assert.equal(liveAudit.source_coverage.find(x=>x.bucket_id==='installation-evidence').uploader_profile_unavailable,0);
 await db.query('update storage.objects set archived_at=now(),is_versioned=true where id=$1',[ids.oid]);
 const objectsBefore=JSON.stringify((await db.query('select to_jsonb(o) as r from storage.objects o order by id')).rows);
 const output=await db.exec(await fs.readFile(auditSql,'utf8'));
 const audit=output.flatMap(x=>x.rows||[]).find(x=>x.am1_storage_semantics_audit)?.am1_storage_semantics_audit;
 assert.equal(audit?.transaction_read_only,'on');
 assert.equal(audit?.phase,'AM1-AUDIT-02');
 assert.equal(audit.buckets.find(x=>x.id==='installation-evidence').archived_rows,1);
 assert.equal(audit.buckets.find(x=>x.id==='installation-evidence').current_image_rows,0);
 const objectsAfter=JSON.stringify((await db.query('select to_jsonb(o) as r from storage.objects o order by id')).rows);
 assert.equal(objectsBefore,objectsAfter);
 const monthBefore=new Date(before.updated_at).toISOString().slice(0,7);
 const monthAfter=new Date(after.updated_at).toISOString().slice(0,7);
 console.log(JSON.stringify({phase:'AM1-AUDIT-02-LOCAL',noNetworkCalls:true,noProductionAccess:true,
   verifiedCounterexamples:{lastAccessUpdateChangesUpdatedAt:true,bookkeepingOnlyCanInvalidateArchive:true,currentCandidateIncludesArchivedImageRows:true},
   conditionalOnReadAPIWritingLastAccess:true,storageReadAPIMutationNotTested:true,
   beforeMonth:monthBefore,afterMonth:monthAfter,completeError:'AM1_OBJECT_CHANGED',directSQLDeletionRejected:directDeleteCode,
   auditSQLExecutedLocally:true,auditSQLLiveSourceMappingChecked:true,auditSQLRuns:2,auditSQLTransactionReadOnly:true,auditSQLLeftObjectRowsUnchanged:true,auditSQLDistinguishesCurrentAndArchivedImages:true,conclusion:'HOLD_AM1_INSTALLATION_UNTIL_STORAGE_SEMANTICS_AUDIT_AND_COMPATIBILITY_FIX'},null,2));
}finally{await db.close();}
