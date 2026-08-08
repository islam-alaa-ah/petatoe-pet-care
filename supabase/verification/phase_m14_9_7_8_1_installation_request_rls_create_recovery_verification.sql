-- Phase M14.9.7.8.1 verification

-- 1. Exactly one canonical INSERT policy must remain.
select policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'installation_requests'
  and cmd = 'INSERT';

-- 2. Confirm the create RPC is SECURITY DEFINER and available to authenticated.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_installation_request_with_services'
order by p.oid desc;

-- 3. Operational users who can create installation requests but are not linked
-- to a sales representative. Review any returned rows before live testing.
select
  up.id as user_id,
  up.full_name,
  up.role,
  up.representative_id
from public.user_profiles up
join public.role_screen_permissions rsp
  on rsp.role = up.role
 and rsp.screen_key = 'installationRequestNew'
where up.is_active = true
  and rsp.can_add = true
  and up.role::text = 'sales_representative'
  and up.representative_id is null;

-- 4. Customers without an owner cannot be safely created by a sales representative.
select id, customer_number, customer_name, phone
from public.customers
where representative_id is null
order by created_at desc
limit 100;

-- 5. No request created by a normal user should be assigned to a team at creation.
-- Expected result: 0 rows for requests created after deploying this migration.
select id, request_number, created_by, installation_team_id, created_at
from public.installation_requests
where created_at >= now() - interval '1 day'
  and created_by is not null
  and installation_team_id is not null
  and status = 'بانتظار المراجعة';
