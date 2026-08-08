-- Phase M14.8.6 verification
select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='installation_requests'
  and column_name='customer_map_url';

select conname,pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.installation_requests'::regclass
  and conname='installation_requests_customer_map_url_check';

select p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='create_installation_request_with_services'
order by arguments;
