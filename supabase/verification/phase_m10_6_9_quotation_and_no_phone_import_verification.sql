-- Phase M10.6.9 verification (read-only)

select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customers'
  and column_name = 'phone';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'uq_customers_normalized_phone_present',
    'uq_customer_requests_import_identity'
  )
order by indexname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.customers'::regclass,
  'public.customer_requests'::regclass
)
and conname in (
  'customers_valid_mobile_check',
  'customer_requests_identifier_required'
)
order by conname;
