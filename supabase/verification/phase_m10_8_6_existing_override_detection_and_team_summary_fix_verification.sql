-- Phase M10.8.6 verification
select pg_get_function_result('public.get_daily_customer_suggestions_team_summary(date)'::regprocedure)
  as declared_result;

-- Run while authenticated as super_admin or sales_manager from the application.
-- This call must return rows without HTTP 400 / structure mismatch errors.
-- select * from public.get_daily_customer_suggestions_team_summary();

select count(*) as imported_request_rows
from public.customer_requests;
