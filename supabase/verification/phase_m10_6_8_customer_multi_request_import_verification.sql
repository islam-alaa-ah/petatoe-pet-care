-- Phase M10.6.8 verification
select to_regclass('public.customer_requests') as customer_requests_table;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.customer_requests'::regclass
  and conname = 'customer_requests_customer_request_unique';

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'customer_requests'
order by indexname;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'customer_requests'
order by policyname;
