-- Phase M14.9.8.8.1 verification

-- 1) Function must exist and remain SECURITY DEFINER.
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_installation_schedule_global';

-- 2) Function source must include server-side masking fields.
select
  position('customer_masked' in pg_get_functiondef(p.oid)) > 0 as has_mask_flag,
  position('case when scope.can_operate' in lower(pg_get_functiondef(p.oid))) > 0 as masks_identity_server_side
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_installation_schedule_global';

-- 3) Execute while signed in through the application session.
-- For rows outside the caller representative scope, customer_name and
-- customer_phone must be empty and customer_masked must be true.
select public.get_installation_schedule_global();
