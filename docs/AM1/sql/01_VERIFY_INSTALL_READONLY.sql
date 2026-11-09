begin read only;
set local statement_timeout='8s';
select jsonb_build_object(
 'phase','AM1R1-INSTALL-VERIFY','operation','READ_ONLY_METADATA',
 'config',(select to_jsonb(c) from petatoe_am1.config c where id=true),
 'new_rpc_anon_execute',has_function_privilege('anon','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','EXECUTE'),
 'new_rpc_authenticated_execute',has_function_privilege('authenticated','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','EXECUTE'),
 'new_rpc_service_execute',has_function_privilege('service_role','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','EXECUTE'),
 'private_function_acl',(select jsonb_agg(jsonb_build_object('function',p.proname,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'search_path',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='petatoe_am1'),
 'private_tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='petatoe_am1' and c.relkind='r'),
 'guard',(select jsonb_build_object('enabled',tgenabled,'definition',pg_get_triggerdef(oid)) from pg_trigger where tgname='petatoe_am1_archive_guard' and tgrelid='storage.objects'::regclass),
 'managed_storage_triggers',(select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname) from pg_trigger where tgrelid='storage.objects'::regclass and tgname in ('protect_objects_delete','update_objects_updated_at')),
 'version_column_required',exists(select 1 from pg_attribute where attrelid='petatoe_am1.items'::regclass and attname='object_version' and attnotnull),
 'bucket_modes',(select jsonb_agg(jsonb_build_object('id',id,'type',type,'versioning_status',versioning_status)) from storage.buckets),
 'screen',(select to_jsonb(s) from public.app_screens s where screen_key='attachmentManagement'),
 'new_screen_permissions',(select jsonb_agg(to_jsonb(p)) from public.role_screen_permissions p where screen_key='attachmentManagement'),
 'active_export_leases',(select count(*) from petatoe_am1.leases where expires_at>clock_timestamp() and expires_at<>'infinity'::timestamptz),
 'deletion_leases',(select count(*) from petatoe_am1.leases where expires_at='infinity'::timestamptz),
 'warning','METADATA_ONLY: live signed-in/anonymous tests and PDF verification are still required'
) as am1_install_verify;
commit;
