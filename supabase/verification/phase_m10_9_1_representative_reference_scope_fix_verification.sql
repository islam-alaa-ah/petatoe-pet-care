-- KYUM CRM Phase M10.9.1 verification
-- Run after phase_m10_9_1_representative_reference_scope_fix.sql.

-- 1) Expected: exactly one SELECT policy on public.sales_representatives,
--    named "representatives canonical reference select".
select
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'sales_representatives'
  and cmd = 'SELECT'
order by policyname;

-- 2) Expected: write policies remain present and were not replaced by this phase.
select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'sales_representatives'
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
order by cmd, policyname;

-- 3) Expected: zero rows. Every active sales representative account must have
--    a representative reference to resolve in customer/report embedded relations.
select
  p.id as user_id,
  p.full_name,
  p.representative_id
from public.user_profiles p
left join public.sales_representatives r
  on r.id = p.representative_id
where p.role::text = 'sales_representative'
  and coalesce(p.is_active, true)
  and (p.representative_id is null or r.id is null)
order by p.full_name;

-- 4) Diagnostic reference map. This should show the account and the representative
--    name that customer/report relations are expected to resolve.
select
  p.id as user_id,
  p.full_name as user_name,
  p.role::text as role,
  p.representative_id,
  r.full_name as representative_name
from public.user_profiles p
left join public.sales_representatives r
  on r.id = p.representative_id
where coalesce(p.is_active, true)
order by p.full_name;
