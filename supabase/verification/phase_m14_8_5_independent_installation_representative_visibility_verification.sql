select to_regclass('public.installation_data_access_profiles') as profiles_table,
       to_regclass('public.installation_data_access_representatives') as representatives_table,
       to_regprocedure('public.can_access_installation_representative(uuid)') as scope_function;

select policyname, tablename
from pg_policies
where schemaname='public'
  and tablename in ('installation_requests','installation_request_services','installation_completion_reports','installation_completion_files','installation_revisits','installation_status_history')
order by tablename,policyname;

select column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('installation_data_access_profiles','installation_data_access_representatives')
order by table_name,ordinal_position;
