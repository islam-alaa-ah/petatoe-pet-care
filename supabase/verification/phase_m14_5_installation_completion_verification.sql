-- Phase M14.5 verification
select screen_key,screen_name,group_name,display_order,is_active from public.app_screens where screen_key='installationCompletion';
select role,screen_key,can_view,can_edit,can_export from public.role_screen_permissions where screen_key='installationCompletion';
select table_name from information_schema.tables where table_schema='public' and table_name in ('installation_completion_reports','installation_completion_files') order by table_name;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='installation_completion_reports' order by ordinal_position;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='installation-evidence';
select policyname,tablename,cmd from pg_policies where (schemaname='public' and tablename in ('installation_completion_reports','installation_completion_files')) or (schemaname='storage' and tablename='objects' and policyname like 'installation evidence%') order by schemaname,tablename,policyname;
