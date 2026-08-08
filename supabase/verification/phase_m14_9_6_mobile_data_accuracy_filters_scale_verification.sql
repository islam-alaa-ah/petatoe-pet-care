-- Phase M14.9.6 verification
select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='installation_requests'
  and column_name='customer_order_number';

select conname
from pg_constraint
where conrelid='public.installation_requests'::regclass
  and conname='installation_requests_customer_order_number_length';

select proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and proname in ('create_installation_request_with_services','update_installation_request_with_services')
order by proname,arguments;

-- Expected: 0 rows. Internal request numbers must not be copied into the new customer reference by migration.
select id,request_number,customer_order_number
from public.installation_requests
where customer_order_number=request_number;
