-- KYUM CRM Phase 17.1 — Critical Stabilization
-- Scope: lock restore execution to service_role and add deployment verification.
-- This migration intentionally does not replace the restore function body.

begin;

do $$
declare
  fn regprocedure;
begin
  select p.oid::regprocedure
    into fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'restore_kyum_backup_transactional'
  order by p.oid desc
  limit 1;

  if fn is null then
    raise exception 'Missing public.restore_kyum_backup_transactional function';
  end if;

  execute format('revoke all on function %s from public', fn);
  execute format('revoke all on function %s from anon', fn);
  execute format('revoke all on function %s from authenticated', fn);
  execute format('grant execute on function %s to service_role', fn);
end
$$;

commit;

-- Verification
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'restore_kyum_backup_transactional';
