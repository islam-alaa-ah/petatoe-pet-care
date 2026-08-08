-- Phase M10.8.12 verification

-- 1) Only one SELECT policy should remain on public.customers.
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'customers'
  and cmd = 'SELECT';

-- 2) Confirm the target user's configured own and selected representatives.
select
  u.id as user_id,
  u.full_name,
  u.role::text as role,
  u.representative_id as own_representative_id,
  p.access_mode,
  array_remove(array_agg(distinct ar.representative_id), null) as selected_representative_ids
from public.user_profiles u
left join public.user_data_access_profiles p on p.user_id = u.id
left join public.user_data_access_representatives ar on ar.user_id = u.id
where u.id = '8eb67ff2-102a-4e4a-bbd2-def12d1f96fc'::uuid
group by u.id, u.full_name, u.role, u.representative_id, p.access_mode;

-- 3) No duplicate access rows should exist.
select user_id, representative_id, count(*)
from public.user_data_access_representatives
group by user_id, representative_id
having count(*) > 1;

-- Runtime RLS must be tested by signing in through the application as the
-- target user. The Customers screen must contain only customers whose
-- representative_id belongs to the own/selected list above.
