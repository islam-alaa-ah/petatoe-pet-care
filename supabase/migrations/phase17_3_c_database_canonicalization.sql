-- KYUM CRM Phase 17.3-C — Database Cleanup & Canonicalization
-- Safe scope:
--   1) Require the Phase 17.3 canonical backup/restore functions.
--   2) Remove the obsolete Phase 13 transactional restore RPC.
--   3) Re-apply least-privilege execution grants to the canonical RPCs.
-- Historical migration files are intentionally preserved as immutable history.

begin;

do $$
begin
  if to_regprocedure('public.kyum_backup_table_manifest()') is null then
    raise exception
      'Phase 17.3-A is missing: public.kyum_backup_table_manifest()';
  end if;

  if to_regprocedure(
    'public.kyum_validate_backup_restore(jsonb,uuid)'
  ) is null then
    raise exception
      'Phase 17.3-B is missing: public.kyum_validate_backup_restore(jsonb,uuid)';
  end if;

  if to_regprocedure(
    'public.restore_kyum_backup_enterprise(jsonb,uuid)'
  ) is null then
    raise exception
      'Phase 17.3-B is missing: public.restore_kyum_backup_enterprise(jsonb,uuid)';
  end if;
end
$$;

-- The old Phase 13 RPC supports only the legacy ten-table backup format.
-- The application now uses the manifest-based Phase 17.3 enterprise engine.
drop function if exists
  public.restore_kyum_backup_transactional(jsonb, uuid);

-- Canonical grants: callable only through trusted service-role code.
revoke all on function
  public.kyum_backup_table_manifest()
from public;

revoke all on function
  public.kyum_backup_table_manifest()
from anon;

revoke all on function
  public.kyum_backup_table_manifest()
from authenticated;

grant execute on function
  public.kyum_backup_table_manifest()
to service_role;

revoke all on function
  public.kyum_validate_backup_restore(jsonb, uuid)
from public;

revoke all on function
  public.kyum_validate_backup_restore(jsonb, uuid)
from anon;

revoke all on function
  public.kyum_validate_backup_restore(jsonb, uuid)
from authenticated;

grant execute on function
  public.kyum_validate_backup_restore(jsonb, uuid)
to service_role;

revoke all on function
  public.restore_kyum_backup_enterprise(jsonb, uuid)
from public;

revoke all on function
  public.restore_kyum_backup_enterprise(jsonb, uuid)
from anon;

revoke all on function
  public.restore_kyum_backup_enterprise(jsonb, uuid)
from authenticated;

grant execute on function
  public.restore_kyum_backup_enterprise(jsonb, uuid)
to service_role;

comment on function public.kyum_backup_table_manifest()
is
  'Canonical KYUM CRM backup manifest. Phase 17.3-A. Service role only.';

comment on function
  public.kyum_validate_backup_restore(jsonb, uuid)
is
  'Canonical KYUM CRM enterprise restore dry-run validator. Phase 17.3-B. Service role only.';

comment on function
  public.restore_kyum_backup_enterprise(jsonb, uuid)
is
  'Canonical KYUM CRM manifest-based transactional restore engine. Phase 17.3-B. Service role only.';

commit;

notify pgrst, 'reload schema';

-- Immediate verification summary.
with expected(function_name, identity_arguments) as (
  values
    ('kyum_backup_table_manifest', ''),
    ('kyum_validate_backup_restore', 'p_backup jsonb, p_actor uuid'),
    ('restore_kyum_backup_enterprise', 'p_backup jsonb, p_actor uuid')
),
actual as (
  select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    p.prosecdef as security_definer,
    has_function_privilege('anon', p.oid, 'EXECUTE')
      as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
      as authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE')
      as service_role_can_execute
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'kyum_backup_table_manifest',
      'kyum_validate_backup_restore',
      'restore_kyum_backup_enterprise'
    )
)
select
  e.function_name,
  a.identity_arguments,
  a.security_definer,
  a.anon_can_execute,
  a.authenticated_can_execute,
  a.service_role_can_execute,
  case
    when a.function_name is null then 'MISSING'
    when a.security_definer is not true then 'REVIEW'
    when a.anon_can_execute is true then 'REVIEW'
    when a.authenticated_can_execute is true then 'REVIEW'
    when a.service_role_can_execute is not true then 'REVIEW'
    else 'PASS'
  end as result
from expected e
left join actual a
  on a.function_name = e.function_name
order by e.function_name;

select
  case
    when to_regprocedure(
      'public.restore_kyum_backup_transactional(jsonb,uuid)'
    ) is null
      then 'PASS'
    else 'REVIEW'
  end as legacy_restore_removed;
