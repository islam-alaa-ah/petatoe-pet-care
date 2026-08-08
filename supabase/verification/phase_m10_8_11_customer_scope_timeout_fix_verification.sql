-- Phase M10.8.11 verification

-- 1) Confirm only the canonical policies remain.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'customers'
order by policyname;

-- 2) Inspect user linkage and configured mode.
select
  up.id as user_id,
  up.full_name,
  up.role,
  up.representative_id,
  dap.access_mode
from public.user_profiles up
left join public.user_data_access_profiles dap on dap.user_id = up.id
order by up.full_name;

-- 3) Sales representatives with missing linkage must return zero rows.
select id, full_name, role
from public.user_profiles
where role::text = 'sales_representative'
  and representative_id is null;
