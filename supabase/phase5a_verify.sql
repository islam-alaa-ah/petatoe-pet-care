-- Customer Management Phase 5A verification
-- Run after phase5a_enterprise_foundation.sql

select
  'tables' as check_name,
  count(*)::text as result
from information_schema.tables
where table_schema = 'public'

union all

select
  'RLS enabled tables',
  count(*)::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true

union all

select
  'policies',
  count(*)::text
from pg_policies
where schemaname = 'public'

union all

select
  'auth users',
  count(*)::text
from auth.users;
