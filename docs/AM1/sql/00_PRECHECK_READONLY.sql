-- AM1 step zero. Read-only; no application RPCs, image downloads or exact customer counts.
begin read only;
set local statement_timeout='8s';
with wanted(name) as (values
 ('public.user_profiles'),('public.app_screens'),('public.role_screen_permissions'),
 ('public.installation_execution_files'),('public.installation_completion_files'),
 ('public.installation_requests'),('public.customers'),('public.user_whatsapp_templates'),
 ('public.sea_vibe_expense_attachments'),('public.sea_vibe_expenses'),('public.sea_vibe_trips'),
 ('public.sea_vibe_customers'),('public.sea_vibe_treasury_voucher_attachments'),
 ('public.sea_vibe_treasury_vouchers'),('public.sea_vibe_journal_entry_attachments'),
 ('public.sea_vibe_journal_entries'),('storage.objects'),('storage.buckets')),
relations as (
 select w.name,to_regclass(w.name) is not null as exists,
   (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum)
    from pg_attribute a where a.attrelid=to_regclass(w.name) and a.attnum>0 and not a.attisdropped) as columns
 from wanted w),
buckets as (
 select b.id,b.public,count(o.id) as object_count,
 count(o.id) filter(where lower(coalesce(o.metadata->>'mimetype','')) like 'image/%') as images_by_mime,
 coalesce(sum((o.metadata->>'size')::bigint),0) as recorded_bytes
 from storage.buckets b left join storage.objects o on o.bucket_id=b.id group by b.id,b.public),
monthly as (
 select to_char(greatest(o.created_at,o.updated_at) at time zone 'Asia/Riyadh','YYYY-MM') as month,o.bucket_id,
 count(*) as images,coalesce(sum((o.metadata->>'size')::bigint),0) as bytes,
 count(*) filter(where coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner','')='') as without_storage_owner
 from storage.objects o where lower(coalesce(o.metadata->>'mimetype','')) like 'image/%'
 group by 1,2)
select jsonb_build_object(
 'phase','AM1-PRECHECK','operation','READ_ONLY_METADATA','captured_at',clock_timestamp(),
 'status','CAPTURE_ONLY_NOT_DEPLOYMENT_OR_DELETION_APPROVAL','runner',current_user,
 'transaction_read_only',current_setting('transaction_read_only'),
 'existing_am1_schema',to_regnamespace('petatoe_am1') is not null,
 'can_create_storage_trigger',has_table_privilege(current_user,'storage.objects','TRIGGER'),
 'relations',(select jsonb_agg(to_jsonb(r)) from relations r),
 'buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from buckets b),
 'months',(select coalesce(jsonb_agg(to_jsonb(m) order by month desc,bucket_id),'[]') from monthly m),
 'storage_triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled)),'[]') from pg_trigger where tgrelid='storage.objects'::regclass and not tgisinternal),
 'permission_table_triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled)),'[]') from pg_trigger where tgrelid in ('public.app_screens'::regclass,'public.role_screen_permissions'::regclass) and not tgisinternal),
 'storage_trigger_functions',(select coalesce(jsonb_agg(distinct pg_get_functiondef(tgfoid)),'[]') from pg_trigger where tgrelid='storage.objects'::regclass and not tgisinternal),
 'storage_policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from pg_policies p where schemaname='storage' and tablename='objects'),
 'new_screen_exists',exists(select 1 from public.app_screens where screen_key='attachmentManagement'),
 'new_rpc_exists',to_regprocedure('public.petatoe_attachment_admin_am1(uuid,text,jsonb)') is not null,
 'backup_of_storage_originals_required',true,
 'application_function_executed',false
) as am1_precheck;
commit;
