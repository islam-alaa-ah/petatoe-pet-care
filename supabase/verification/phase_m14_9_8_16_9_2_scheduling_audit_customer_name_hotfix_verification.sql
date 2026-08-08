-- Phase M14.9.8.16.9.2 verification

-- 1) Canonical customer column must exist and the obsolete column must not be required.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'customer_name'
  ) as customer_name_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'name'
  ) as legacy_name_exists;

-- 2) Trigger function must reference customer_name and must not contain
--    a direct "select name ... from public.customers" query.
select
  position('customer_name' in lower(pg_get_functiondef('public.capture_business_activity_event()'::regprocedure))) > 0
    as uses_customer_name,
  position('select name into cname from public.customers' in lower(pg_get_functiondef('public.capture_business_activity_event()'::regprocedure))) = 0
    as obsolete_customer_name_query_removed;

-- 3) All expected audit triggers remain installed.
select
  c.relname as table_name,
  t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('customers','customer_followups','quotations','installation_requests','sales_invoices')
  and t.tgname like 'trg_business_activity_%'
  and not t.tgisinternal
order by c.relname;

-- Expected for the first two result sets:
-- customer_name_exists = true
-- uses_customer_name = true
-- obsolete_customer_name_query_removed = true
