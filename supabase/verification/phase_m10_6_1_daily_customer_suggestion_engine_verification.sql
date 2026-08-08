-- KYUM CRM Phase M10.6.1 verification
-- Run after the migration while authenticated in the application.

-- 1) Structure and RLS
select
  to_regclass('public.daily_customer_suggestions') as suggestions_table,
  relrowsecurity as rls_enabled
from pg_class
where oid = 'public.daily_customer_suggestions'::regclass;

-- 2) Required RPC functions
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'replenish_daily_customer_suggestions',
    'ensure_daily_customer_suggestions',
    'get_daily_customer_suggestions',
    'complete_daily_customer_suggestion'
  )
order by proname;

-- 3) Generate/read the current user's stable list.
select public.ensure_daily_customer_suggestions();
select * from public.get_daily_customer_suggestions();

-- 4) Active totals must be at most 10 per category; they can be lower only when no more eligible customers exist.
select customer_type, status, count(*)
from public.daily_customer_suggestions
where user_id = auth.uid()
  and suggestion_date = ((now() at time zone 'Asia/Riyadh')::date)
group by customer_type, status
order by customer_type, status;

-- 5) Duplicate protection should return zero rows.
select suggestion_date, user_id, customer_id, count(*)
from public.daily_customer_suggestions
group by suggestion_date, user_id, customer_id
having count(*) > 1;
