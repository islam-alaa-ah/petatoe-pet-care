-- Run as an authenticated super_admin or sales_manager through the application/RPC context.

select proname, prosecdef
from pg_proc
where proname = 'get_daily_customer_suggestions_team_summary';

select has_function_privilege(
  'authenticated',
  'public.get_daily_customer_suggestions_team_summary(date)',
  'EXECUTE'
) as authenticated_can_execute;

-- Expected: one row per active sales user when called from an authenticated manager session.
-- select * from public.get_daily_customer_suggestions_team_summary();
