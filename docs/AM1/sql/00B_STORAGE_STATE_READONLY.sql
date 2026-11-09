-- AM1-AUDIT-02. READ ONLY. No application RPC, image fetch, DDL or deletion.
-- Uses columns confirmed by AM1-PRECHECK captured 2026-11-09T06:44:18Z.
begin read only;
set local statement_timeout='8s';
set local lock_timeout='2s';
with objects as (
 select o.*,
   (lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
    or (coalesce(o.metadata->>'mimetype','') in ('','application/octet-stream')
        and lower(o.name) ~ '\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?|svg)$')) as image_row,
   (o.archived_at is null and not coalesce(o.is_delete_marker,false)) as current_content_row
 from storage.objects o
), current_images as (
 select * from objects where image_row and current_content_row
), refs as (
 select 'installation-evidence'::text bucket_id,f.storage_path path,
   'installation_execution_files'::text source,f.uploaded_by uploader,f.uploaded_at recorded_at,
   (r.id is not null) parent_exists,true customer_expected,(c.id is not null) customer_exists
 from public.installation_execution_files f
 left join public.installation_requests r on r.id=f.installation_request_id
 left join public.customers c on c.id=r.customer_id
 union all
 select 'installation-evidence',f.storage_path,'installation_completion_files',f.uploaded_by,f.uploaded_at,
   r.id is not null,true,c.id is not null
 from public.installation_completion_files f
 left join public.installation_requests r on r.id=f.installation_request_id
 left join public.customers c on c.id=r.customer_id
 union all
 select 'sea-vibe-expenses',f.storage_path,'sea_vibe_expense_attachments',f.created_by,f.created_at,
   e.id is not null,e.trip_id is not null,c.id is not null
 from public.sea_vibe_expense_attachments f
 left join public.sea_vibe_expenses e on e.id=f.expense_id
 left join public.sea_vibe_trips t on t.id=e.trip_id
 left join public.sea_vibe_customers c on c.id=t.customer_id
 union all
 select 'sea-vibe-treasury-vouchers',f.storage_path,'sea_vibe_treasury_voucher_attachments',f.created_by,f.created_at,
   v.id is not null,false,false
 from public.sea_vibe_treasury_voucher_attachments f
 left join public.sea_vibe_treasury_vouchers v on v.id=f.voucher_id
 union all
 select 'sea-vibe-journal-entries',f.storage_path,'sea_vibe_journal_entry_attachments',f.created_by,f.created_at,
   j.id is not null,false,false
 from public.sea_vibe_journal_entry_attachments f
 left join public.sea_vibe_journal_entries j on j.id=f.journal_entry_id
 union all
 select 'user-whatsapp-templates',f.image_path,'user_whatsapp_templates',f.user_id,f.created_at,true,false,false
 from public.user_whatsapp_templates f where f.image_path is not null
), mappings as (
 select o.id,o.bucket_id,o.name,
   x.matches,x.sources,x.parent_exists,x.customer_expected,x.customer_exists,
   x.recorded_at,
   coalesce(x.recorded_uploader,nullif(o.owner_id,''),o.owner::text) resolved_user,
   x.recorded_uploader is not null as uploader_recorded_in_attachment
 from current_images o left join lateral (
   select count(*) matches,string_agg(distinct r.source,',' order by r.source) sources,
     bool_and(r.parent_exists) parent_exists,bool_or(r.customer_expected) customer_expected,
     bool_or(r.customer_exists) customer_exists,
     max(r.recorded_at) recorded_at,max(r.uploader::text) recorded_uploader
   from refs r where r.bucket_id=o.bucket_id and r.path=o.name
 )x on true
), buckets as (
 select b.id,b.public,b.type::text as bucket_type,b.versioning_status,
   count(o.id) as all_object_rows,
   count(o.id) filter(where o.image_row) as all_image_rows,
   count(o.id) filter(where o.image_row and o.current_content_row) as current_image_rows,
   count(o.id) filter(where o.archived_at is not null) as archived_rows,
   count(o.id) filter(where coalesce(o.is_delete_marker,false)) as delete_markers,
   count(o.id) filter(where coalesce(o.is_versioned,false)) as versioned_rows,
   count(o.id) filter(where o.image_row and o.current_content_row and nullif(o.version,'') is null) as current_images_without_version_id,
   coalesce(sum((o.metadata->>'size')::bigint) filter(where o.image_row and o.current_content_row),0) as current_image_recorded_bytes,
   coalesce(sum((o.metadata->>'size')::bigint) filter(where o.image_row and o.archived_at is not null),0) as archived_image_recorded_bytes
 from storage.buckets b left join objects o on o.bucket_id=b.id
 group by b.id,b.public,b.type,b.versioning_status
), formats as (
 select bucket_id,coalesce(nullif(lower(metadata->>'mimetype'),''),'not_recorded') as mime_type,
   substring(lower(name) from '\.([a-z0-9]+)$') as extension,
   count(*) as current_images,coalesce(sum((metadata->>'size')::bigint),0) as recorded_bytes,
   max((metadata->>'size')::bigint) as largest_image_recorded_bytes
 from current_images group by 1,2,3
), timestamps as (
 select bucket_id,count(*) as current_images,
   count(*) filter(where to_char(created_at at time zone 'Asia/Riyadh','YYYY-MM')
     is distinct from to_char(updated_at at time zone 'Asia/Riyadh','YYYY-MM')) as created_and_updated_month_differ,
   count(*) filter(where last_accessed_at is not null) as with_last_accessed_at,
   count(*) filter(where last_accessed_at=updated_at) as access_timestamp_equals_updated_timestamp,
   count(*) filter(where metadata ? 'lastModified') as metadata_has_lastModified,
   count(*) filter(where metadata ? 'last_modified') as metadata_has_last_modified,
   count(*) filter(where metadata ? 'eTag' or metadata ? 'etag') as metadata_has_etag,
   count(*) filter(where nullif(version,'') is not null) as with_version_id
 from current_images group by bucket_id
), metadata_keys as (
 select o.bucket_id,k.key,jsonb_typeof(k.value) value_type,count(*) as rows_with_key
 from current_images o cross join lateral jsonb_each(
   case when jsonb_typeof(o.metadata)='object' then o.metadata else '{}'::jsonb end)k
 group by o.bucket_id,k.key,jsonb_typeof(k.value)
), date_samples as (
 select bucket_id,created_at,updated_at,last_accessed_at,
   metadata->>'lastModified' as metadata_lastModified,
   metadata->>'last_modified' as metadata_last_modified,
   row_number() over(partition by bucket_id order by updated_at desc,id) as sample_number
 from current_images
), monthly as (
 select bucket_id,to_char(created_at at time zone 'Asia/Riyadh','YYYY-MM') as first_storage_month,
   to_char(greatest(created_at,updated_at) at time zone 'Asia/Riyadh','YYYY-MM') as updated_month,
   count(*) as images,coalesce(sum((metadata->>'size')::bigint),0) as recorded_bytes
 from current_images group by 1,2,3
), coverage as (
 select m.bucket_id,count(*) as current_images,
   count(*) filter(where m.matches=0) as without_source_record,
   count(*) filter(where m.matches=1) as with_exactly_one_source_record,
   count(*) filter(where m.matches>1) as with_multiple_source_records,
   count(*) filter(where m.matches>0 and not m.parent_exists) as source_without_parent_record,
   count(*) filter(where m.customer_expected and not m.customer_exists) as expected_customer_missing,
   count(*) filter(where m.uploader_recorded_in_attachment) as uploader_recorded_in_attachment,
   count(*) filter(where not m.uploader_recorded_in_attachment) as requires_storage_owner_fallback,
   count(*) filter(where up.id is null) as uploader_profile_unavailable,
   count(*) filter(where m.recorded_at is null) as attachment_timestamp_unavailable
 from mappings m left join public.user_profiles up on up.id::text=m.resolved_user
 group by m.bucket_id
), relations as (
 select c.oid,n.nspname||'.'||c.relname as relation_name,pg_get_userbyid(c.relowner) as owner,
   c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced,
   has_table_privilege('anon',c.oid,'SELECT') as anon_table_select,
   has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_table_select
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.oid in ('storage.objects'::regclass,'storage.buckets'::regclass)
), defaults as (
 select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as data_type,a.attnotnull,
   pg_get_expr(d.adbin,d.adrelid) as default_expression
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname='storage' and c.relname in ('buckets','objects')
   and a.attname in ('version','archived_at','is_delete_marker','is_versioned','versioning_status','created_at','updated_at','last_accessed_at')
)
select jsonb_build_object(
 'phase','AM1-AUDIT-02','operation','READ_ONLY_STORAGE_STATE_AND_SOURCE_MAPPING',
 'status','CAPTURE_ONLY_AM1_INSTALLATION_STILL_ON_HOLD',
 'captured_at',clock_timestamp(),'runner',current_user,
 'transaction_read_only',current_setting('transaction_read_only'),
 'am1_schema_exists',to_regnamespace('petatoe_am1') is not null,
 'am1_rpc_exists',to_regprocedure('public.petatoe_attachment_admin_am1(uuid,text,jsonb)') is not null,
 'buckets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from buckets b),
 'image_formats',(select coalesce(jsonb_agg(to_jsonb(f) order by bucket_id,mime_type,extension),'[]') from formats f),
 'timestamp_observations',(select coalesce(jsonb_agg(to_jsonb(t) order by t.bucket_id),'[]') from timestamps t),
 'metadata_key_coverage',(select coalesce(jsonb_agg(to_jsonb(k) order by k.bucket_id,k.key),'[]') from metadata_keys k),
 'date_samples_no_paths_or_customer_data',(select coalesce(jsonb_agg(to_jsonb(s) order by bucket_id,sample_number),'[]') from date_samples s where sample_number<=2),
 'month_comparison',(select coalesce(jsonb_agg(to_jsonb(m) order by first_storage_month,updated_month,bucket_id),'[]') from monthly m),
 'source_coverage',(select coalesce(jsonb_agg(to_jsonb(c) order by c.bucket_id),'[]') from coverage c),
 'duplicate_current_path_groups',(select count(*) from (select bucket_id,name from current_images group by bucket_id,name having count(*)>1)d),
 'storage_access_metadata',(select jsonb_agg(to_jsonb(r)-'oid' order by relation_name) from relations r),
 'version_column_defaults',(select jsonb_agg(to_jsonb(d) order by relname,attname) from defaults d),
 'storage_indexes',(select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) order by tablename,indexname) from pg_indexes where schemaname='storage' and tablename in ('objects','buckets')),
 'storage_triggers',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled) order by tgrelid::regclass::text,tgname) from pg_trigger where tgrelid in ('storage.objects'::regclass,'storage.buckets'::regclass) and not tgisinternal),
 'storage_constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid in ('storage.objects'::regclass,'storage.buckets'::regclass)),
 'storage_migrations_table_exists',to_regclass('storage.migrations') is not null,
 'storage_migrations_columns',(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=to_regclass('storage.migrations') and a.attnum>0 and not a.attisdropped),
 'application_rpc_executed',false,'storage_api_called',false,'storage_allow_delete_query_changed',false,
 'notes',jsonb_build_array(
   'Timestamp relationships are observations, not proof that an HTTP read changes them.',
   'Versioning columns do not by themselves prove bucket versioning or exact-version API support.',
   'Recorded metadata bytes are not a billing or quota-enforcement measurement.',
   'No filenames, customer names, phone numbers, tokens or image bytes are returned.'
 )
) as am1_storage_semantics_audit;
commit;
