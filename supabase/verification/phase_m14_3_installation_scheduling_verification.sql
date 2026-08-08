select screen_key,screen_name,is_active from public.app_screens where screen_key='installationSchedule';
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='installation_requests' and column_name in ('technician_id','assignment_notes','assigned_at','assigned_by') order by column_name;
select tablename,policyname from pg_policies where schemaname='public' and tablename in ('installation_requests','installation_technicians') order by tablename,policyname;
select indexname from pg_indexes where schemaname='public' and indexname in ('idx_installation_requests_technician_schedule','idx_installation_technicians_status_city');
