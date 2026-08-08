select table_name
from information_schema.tables
where table_schema='public' and table_name in ('installation_neighborhoods','installation_service_types','installation_request_services')
order by table_name;

select column_name,is_nullable,data_type
from information_schema.columns
where table_schema='public' and table_name='installation_requests'
  and column_name in ('neighborhood_id','total_services_count','total_services_amount','status')
order by ordinal_position;

select conname,pg_get_constraintdef(oid) definition
from pg_constraint
where conrelid='public.installation_requests'::regclass and conname='installation_requests_status_check';

select policyname,cmd
from pg_policies
where schemaname='public' and tablename in ('installation_requests','installation_request_services','installation_neighborhoods','installation_service_types')
order by tablename,policyname;
