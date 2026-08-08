-- KYUM CRM Phase M10.6.11 verification

-- 1) This query must return zero rows.
select
  s.user_id,
  up.full_name as user_name,
  up.representative_id as linked_representative_id,
  c.id as customer_id,
  c.representative_id as customer_representative_id
from public.daily_customer_suggestions s
join public.user_profiles up on up.id = s.user_id
join public.customers c on c.id = s.customer_id
where s.status = 'active'
  and (
    up.representative_id is null
    or c.representative_id is distinct from up.representative_id
  );

-- 2) Per-account totals after generation. Replace the UUID only when testing
-- a specific account in SQL Editor.
-- select public.ensure_daily_customer_suggestions(
--   (now() at time zone 'Asia/Riyadh')::date,
--   'USER_UUID_HERE'::uuid
-- );

-- 3) Inspect the linked representative and active suggestions by account.
select
  up.id as user_id,
  up.full_name as user_name,
  up.representative_id,
  count(s.id) filter (where s.status = 'active') as active_suggestions
from public.user_profiles up
left join public.daily_customer_suggestions s
  on s.user_id = up.id
 and s.suggestion_date = (now() at time zone 'Asia/Riyadh')::date
group by up.id, up.full_name, up.representative_id
order by up.full_name;
