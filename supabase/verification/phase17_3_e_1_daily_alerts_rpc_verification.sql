-- KYUM CRM Phase 17.3-E.1 — Daily Alerts RPC Verification
-- Read-only verification.

select
  c.column_name,
  c.data_type
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'customer_followups'
  and c.column_name in ('completed', 'is_completed')
order by c.column_name;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  position(
    'f.is_completed' in pg_get_functiondef(p.oid)
  ) > 0 as uses_is_completed,
  position(
    'f.completed' in pg_get_functiondef(p.oid)
  ) = 0 as legacy_column_removed,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) as service_role_can_execute,
  case
    when p.prosecdef is true
      and position(
        'f.is_completed' in pg_get_functiondef(p.oid)
      ) > 0
      and position(
        'f.completed' in pg_get_functiondef(p.oid)
      ) = 0
      and not has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        p.oid,
        'EXECUTE'
      )
    then 'PASS'
    else 'REVIEW_REQUIRED'
  end as overall_result
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sync_daily_operational_alerts';
