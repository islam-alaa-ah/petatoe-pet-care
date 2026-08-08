-- Phase M10.4 verification
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_function_arguments(p.oid) as arguments,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'check_customer_phone_ownership';

-- Run while authenticated from the application for behavior verification:
-- select * from public.check_customer_phone_ownership('05XXXXXXXX', null);
-- Expected outside scope: phone_exists=true, customer/representative names present,
-- customer_id=null, can_access=false, no contact person/type disclosed.
