select screen_key,screen_name,group_name,is_active from public.app_screens where screen_key='installationRequests';
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='installation_requests' order by ordinal_position;
select policyname,cmd from pg_policies where schemaname='public' and tablename='installation_requests' order by policyname;
select indexname from pg_indexes where schemaname='public' and tablename='installation_requests' order by indexname;
