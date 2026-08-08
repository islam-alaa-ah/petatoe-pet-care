-- KYUM CRM Phase M10.6.1.1 verification
-- This script is safe to run from Supabase SQL Editor as role postgres.
-- It automatically selects one existing user profile as the verification target.

create temporary table if not exists phase_m10_6_1_1_test_user (
  user_id uuid primary key
) on commit preserve rows;

truncate table phase_m10_6_1_1_test_user;

insert into phase_m10_6_1_1_test_user(user_id)
select up.id
from public.user_profiles up
order by up.created_at asc nulls last, up.id
limit 1;

-- 1) Confirm which user is used for the SQL Editor test.
select
  t.user_id as verification_user_id,
  up.full_name,
  up.role,
  up.representative_id
from phase_m10_6_1_1_test_user t
join public.user_profiles up on up.id = t.user_id;

-- 2) Required helper and RPC signatures.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'can_user_access_representative',
    'replenish_daily_customer_suggestions',
    'ensure_daily_customer_suggestions',
    'get_daily_customer_suggestions'
  )
order by p.proname;

-- 3) Generate the target user's list using an explicit user ID.
select public.ensure_daily_customer_suggestions(
  (now() at time zone 'Asia/Riyadh')::date,
  t.user_id
) as inserted_rows
from phase_m10_6_1_1_test_user t;

-- 4) Read the same stable list using an explicit user ID.
select g.*
from phase_m10_6_1_1_test_user t
cross join lateral public.get_daily_customer_suggestions(
  (now() at time zone 'Asia/Riyadh')::date,
  t.user_id
) g;

-- 5) Active totals must be at most 10 per category.
select s.customer_type, s.status, count(*)
from public.daily_customer_suggestions s
join phase_m10_6_1_1_test_user t on t.user_id = s.user_id
where s.suggestion_date = ((now() at time zone 'Asia/Riyadh')::date)
group by s.customer_type, s.status
order by s.customer_type, s.status;

-- 6) Duplicate protection should return zero rows.
select s.suggestion_date, s.user_id, s.customer_id, count(*)
from public.daily_customer_suggestions s
group by s.suggestion_date, s.user_id, s.customer_id
having count(*) > 1;
