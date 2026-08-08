select column_name,data_type from information_schema.columns where table_schema='public' and table_name='installation_requests' and column_name='arrived_at';
select to_regclass('public.installation_execution_files') as execution_files_table;
select policyname,cmd from pg_policies where schemaname='public' and tablename='installation_execution_files' order by policyname;
select routine_name from information_schema.routines where routine_schema='public' and routine_name='track_installation_execution_status';
