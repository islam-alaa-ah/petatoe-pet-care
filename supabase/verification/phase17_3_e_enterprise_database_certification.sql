-- KYUM CRM Phase 17.3-E — Enterprise Database Verification & Certification
-- Read-only certification script.
-- No schema or data changes are performed.

-- ============================================================
-- 1) Canonical backup / restore functions and least privilege
-- ============================================================
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
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select
  e.function_name,
  e.identity_arguments,
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
 and a.identity_arguments = e.identity_arguments
order by e.function_name;

-- ============================================================
-- 2) Permission engine function
-- ============================================================
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'has_screen_permission';

-- ============================================================
-- 3) Legacy restore removal
-- ============================================================
select
  case
    when to_regprocedure(
      'public.restore_kyum_backup_transactional(jsonb,uuid)'
    ) is null then 'PASS'
    else 'REVIEW_REQUIRED'
  end as legacy_restore_removed;

-- ============================================================
-- 4) Required RLS-enabled tables
-- ============================================================
with required(table_name) as (
  values
    ('customers'),
    ('customer_interests'),
    ('customer_followups'),
    ('quotations'),
    ('sales_representatives'),
    ('interest_categories'),
    ('no_sale_reasons'),
    ('user_profiles'),
    ('role_screen_permissions'),
    ('app_screens'),
    ('audit_logs'),
    ('system_settings'),
    ('backup_operations')
)
select
  r.table_name,
  c.relrowsecurity as rls_enabled,
  case
    when c.oid is null then 'MISSING'
    when c.relrowsecurity is true then 'PASS'
    else 'REVIEW'
  end as result
from required r
left join pg_class c
  on c.relname = r.table_name
left join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = 'public'
order by r.table_name;

-- ============================================================
-- 5) Broad / unsafe public policies
-- ============================================================
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    coalesce(trim(qual), '') in ('true', '(true)')
    or coalesce(trim(with_check), '') in ('true', '(true)')
  )
order by tablename, policyname;

-- ============================================================
-- 6) Super Admin permission completeness
-- ============================================================
select
  s.screen_key
from public.app_screens s
left join public.role_screen_permissions p
  on p.screen_key = s.screen_key
 and p.role = 'super_admin'
where s.is_active = true
  and (
    p.screen_key is null
    or coalesce(p.can_view, false) is not true
    or coalesce(p.can_add, false) is not true
    or coalesce(p.can_edit, false) is not true
    or coalesce(p.can_delete, false) is not true
    or coalesce(p.can_export, false) is not true
  )
order by s.screen_key;

-- ============================================================
-- 7) Orphan and duplicate permission rows
-- ============================================================
select
  p.role,
  p.screen_key
from public.role_screen_permissions p
left join public.app_screens s
  on s.screen_key = p.screen_key
where s.screen_key is null
order by p.role, p.screen_key;

select
  role,
  screen_key,
  count(*) as duplicate_count
from public.role_screen_permissions
group by role, screen_key
having count(*) > 1
order by role, screen_key;

-- ============================================================
-- 8) Duplicate function signatures
-- ============================================================
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  count(*) as duplicate_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
group by
  p.proname,
  pg_get_function_identity_arguments(p.oid)
having count(*) > 1
order by p.proname;

-- ============================================================
-- 9) Duplicate trigger names on same table
-- ============================================================
select
  c.relname as table_name,
  t.tgname as trigger_name,
  count(*) as duplicate_count
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
group by c.relname, t.tgname
having count(*) > 1
order by c.relname, t.tgname;

-- ============================================================
-- 10) Duplicate index definitions
-- ============================================================
with normalized_indexes as (
  select
    schemaname,
    tablename,
    indexname,
    regexp_replace(
      indexdef,
      'CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX ',
      'i'
    ) as normalized_definition
  from pg_indexes
  where schemaname = 'public'
),
duplicates as (
  select
    schemaname,
    tablename,
    normalized_definition,
    count(*) as duplicate_count,
    array_agg(indexname order by indexname) as index_names
  from normalized_indexes
  group by schemaname, tablename, normalized_definition
  having count(*) > 1
)
select *
from duplicates
order by tablename, normalized_definition;

-- ============================================================
-- 11) Required Phase 17.3-D indexes
-- ============================================================
with required(index_name) as (
  values
    ('idx_customers_created_at_desc'),
    ('idx_customers_representative_created_at'),
    ('idx_followups_customer_contact_created'),
    ('idx_followups_open_next_customer'),
    ('idx_quotations_customer_date_created'),
    ('idx_quotations_status_date'),
    ('idx_app_screens_active_display'),
    ('idx_user_profiles_active_name'),
    ('idx_backup_operations_created_at_desc'),
    ('idx_daily_task_definitions_active_order'),
    ('idx_daily_task_completions_date_user'),
    ('idx_daily_alerts_date_status'),
    ('idx_daily_alert_actions_alert_created'),
    ('idx_daily_employee_sessions_user_date_activity')
),
existing as (
  select indexname
  from pg_indexes
  where schemaname = 'public'
)
select r.index_name
from required r
left join existing e on e.indexname = r.index_name
where e.indexname is null
order by r.index_name;

-- ============================================================
-- 12) Foreign keys without leading-column indexes
-- ============================================================
with foreign_keys as (
  select
    c.oid as constraint_oid,
    c.conrelid,
    n.nspname as schema_name,
    t.relname as table_name,
    c.conname as constraint_name,
    c.conkey as fk_columns
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f'
    and n.nspname = 'public'
),
indexed_foreign_keys as (
  select distinct
    fk.constraint_oid
  from foreign_keys fk
  join pg_index i
    on i.indrelid = fk.conrelid
   and i.indisvalid
   and i.indisready
  where not exists (
    select 1
    from unnest(fk.fk_columns) with ordinality as fkc(attnum, position)
    where (i.indkey::smallint[])[fkc.position] <> fkc.attnum
  )
)
select
  fk.schema_name,
  fk.table_name,
  fk.constraint_name,
  array_agg(a.attname order by k.ordinality) as fk_columns
from foreign_keys fk
cross join lateral unnest(fk.fk_columns)
  with ordinality as k(attnum, ordinality)
join pg_attribute a
  on a.attrelid = fk.conrelid
 and a.attnum = k.attnum
left join indexed_foreign_keys ifk
  on ifk.constraint_oid = fk.constraint_oid
where ifk.constraint_oid is null
group by
  fk.schema_name,
  fk.table_name,
  fk.constraint_name
order by fk.table_name, fk.constraint_name;

-- ============================================================
-- 13) Unified final certification summary
-- ============================================================
with
canonical_functions as (
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
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
canonical_grant_failures as (
  select count(*) as failure_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'kyum_backup_table_manifest',
      'kyum_validate_backup_restore',
      'restore_kyum_backup_enterprise'
    )
    and (
      p.prosecdef is not true
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
),
legacy_restore as (
  select
    case
      when to_regprocedure(
        'public.restore_kyum_backup_transactional(jsonb,uuid)'
      ) is null then 0
      else 1
    end as failure_count
),
required_rls(table_name) as (
  values
    ('customers'),
    ('customer_interests'),
    ('customer_followups'),
    ('quotations'),
    ('sales_representatives'),
    ('interest_categories'),
    ('no_sale_reasons'),
    ('user_profiles'),
    ('role_screen_permissions'),
    ('app_screens'),
    ('audit_logs'),
    ('system_settings'),
    ('backup_operations')
),
rls_failures as (
  select count(*) as failure_count
  from required_rls r
  left join pg_class c on c.relname = r.table_name
  left join pg_namespace n
    on n.oid = c.relnamespace
   and n.nspname = 'public'
  where c.oid is null
     or c.relrowsecurity is not true
),
super_admin_failures as (
  select count(*) as failure_count
  from public.app_screens s
  left join public.role_screen_permissions p
    on p.screen_key = s.screen_key
   and p.role = 'super_admin'
  where s.is_active = true
    and (
      p.screen_key is null
      or coalesce(p.can_view, false) is not true
      or coalesce(p.can_add, false) is not true
      or coalesce(p.can_edit, false) is not true
      or coalesce(p.can_delete, false) is not true
      or coalesce(p.can_export, false) is not true
    )
),
orphan_permission_rows as (
  select count(*) as failure_count
  from public.role_screen_permissions p
  left join public.app_screens s
    on s.screen_key = p.screen_key
  where s.screen_key is null
),
duplicate_permission_rows as (
  select count(*) as failure_count
  from (
    select role, screen_key
    from public.role_screen_permissions
    group by role, screen_key
    having count(*) > 1
  ) d
),
duplicate_function_signatures as (
  select count(*) as failure_count
  from (
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    group by
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    having count(*) > 1
  ) d
),
duplicate_trigger_names as (
  select count(*) as failure_count
  from (
    select c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
    group by c.relname, t.tgname
    having count(*) > 1
  ) d
),
required_indexes(index_name) as (
  values
    ('idx_customers_created_at_desc'),
    ('idx_customers_representative_created_at'),
    ('idx_followups_customer_contact_created'),
    ('idx_followups_open_next_customer'),
    ('idx_quotations_customer_date_created'),
    ('idx_quotations_status_date'),
    ('idx_app_screens_active_display'),
    ('idx_user_profiles_active_name'),
    ('idx_backup_operations_created_at_desc'),
    ('idx_daily_task_definitions_active_order'),
    ('idx_daily_task_completions_date_user'),
    ('idx_daily_alerts_date_status'),
    ('idx_daily_alert_actions_alert_created'),
    ('idx_daily_employee_sessions_user_date_activity')
),
missing_indexes as (
  select count(*) as failure_count
  from required_indexes r
  left join pg_indexes i
    on i.schemaname = 'public'
   and i.indexname = r.index_name
  where i.indexname is null
)
select
  c.manifest_count,
  c.validator_count,
  c.restore_count,
  g.failure_count as canonical_grant_failures,
  l.failure_count as legacy_restore_failures,
  r.failure_count as rls_failures,
  s.failure_count as super_admin_permission_failures,
  o.failure_count as orphan_permission_rows,
  p.failure_count as duplicate_permission_rows,
  f.failure_count as duplicate_function_signatures,
  t.failure_count as duplicate_trigger_names,
  i.failure_count as missing_required_indexes,
  case
    when c.manifest_count = 1
      and c.validator_count = 1
      and c.restore_count = 1
      and g.failure_count = 0
      and l.failure_count = 0
      and r.failure_count = 0
      and s.failure_count = 0
      and o.failure_count = 0
      and p.failure_count = 0
      and f.failure_count = 0
      and t.failure_count = 0
      and i.failure_count = 0
    then 'PASS'
    else 'REVIEW_REQUIRED'
  end as overall_result,
  case
    when c.manifest_count = 1
      and c.validator_count = 1
      and c.restore_count = 1
      and g.failure_count = 0
      and l.failure_count = 0
      and r.failure_count = 0
      and s.failure_count = 0
      and o.failure_count = 0
      and p.failure_count = 0
      and f.failure_count = 0
      and t.failure_count = 0
      and i.failure_count = 0
    then 'KYUM CRM Enterprise Database Certified — Phase 17.3'
    else 'Certification pending review'
  end as certification
from canonical_functions c
cross join canonical_grant_failures g
cross join legacy_restore l
cross join rls_failures r
cross join super_admin_failures s
cross join orphan_permission_rows o
cross join duplicate_permission_rows p
cross join duplicate_function_signatures f
cross join duplicate_trigger_names t
cross join missing_indexes i;
