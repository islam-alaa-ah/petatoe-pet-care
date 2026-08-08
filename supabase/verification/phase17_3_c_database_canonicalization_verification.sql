-- KYUM CRM Phase 17.3-C — Read-only Database Canonicalization Verification

-- 1. Canonical backup/restore functions and grants.
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
order by p.proname, identity_arguments;

-- 2. Restore-related functions still present.
-- Expected: only the two Phase 17.3 restore functions.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  obj_description(p.oid, 'pg_proc') as description
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%backup%'
    or p.proname ilike '%restore%'
  )
order by p.proname, identity_arguments;

-- 3. Duplicate public function signatures.
-- Expected: zero rows.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  count(*) as duplicate_count
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
group by
  p.proname,
  pg_get_function_identity_arguments(p.oid)
having count(*) > 1
order by p.proname;

-- 4. Duplicate trigger names on the same table.
-- Expected: zero rows.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  count(*) as duplicate_count
from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
group by c.relname, t.tgname
having count(*) > 1
order by c.relname, t.tgname;

-- 5. Duplicate index definitions on the same table.
-- Expected: zero rows after excluding different index names with distinct definitions.
with index_definitions as (
  select
    schemaname,
    tablename,
    regexp_replace(
      indexdef,
      'CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX ',
      'i'
    ) as normalized_index_definition,
    count(*) as duplicate_count,
    array_agg(indexname order by indexname) as index_names
  from pg_indexes
  where schemaname = 'public'
  group by
    schemaname,
    tablename,
    regexp_replace(
      indexdef,
      'CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX ',
      'i'
    )
)
select *
from index_definitions
where duplicate_count > 1
order by tablename, normalized_index_definition;

-- 6. Final PASS/REVIEW summary.
with canonical_functions as (
  select
    count(*) filter (
      where p.proname = 'kyum_backup_table_manifest'
        and pg_get_function_identity_arguments(p.oid) = ''
    ) as manifest_count,
    count(*) filter (
      where p.proname = 'kyum_validate_backup_restore'
        and pg_get_function_identity_arguments(p.oid)
          = 'p_backup jsonb, p_actor uuid'
    ) as validator_count,
    count(*) filter (
      where p.proname = 'restore_kyum_backup_enterprise'
        and pg_get_function_identity_arguments(p.oid)
          = 'p_backup jsonb, p_actor uuid'
    ) as restore_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
),
legacy as (
  select
    case
      when to_regprocedure(
        'public.restore_kyum_backup_transactional(jsonb,uuid)'
      ) is null
        then 0
      else 1
    end as legacy_restore_count
),
grant_failures as (
  select count(*) as failure_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'kyum_backup_table_manifest',
      'kyum_validate_backup_restore',
      'restore_kyum_backup_enterprise'
    )
    and (
      p.prosecdef is not true
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
      or not has_function_privilege(
        'service_role',
        p.oid,
        'EXECUTE'
      )
    )
)
select
  c.manifest_count,
  c.validator_count,
  c.restore_count,
  l.legacy_restore_count,
  g.failure_count as grant_failures,
  case
    when c.manifest_count = 1
      and c.validator_count = 1
      and c.restore_count = 1
      and l.legacy_restore_count = 0
      and g.failure_count = 0
    then 'PASS'
    else 'REVIEW_REQUIRED'
  end as overall_result
from canonical_functions c
cross join legacy l
cross join grant_failures g;
