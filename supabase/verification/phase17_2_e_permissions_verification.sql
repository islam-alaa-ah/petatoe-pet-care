-- KYUM CRM Phase 17.2-E — Enterprise Permissions Verification
-- Read-only verification. This script does not modify production data.

-- 1) Canonical permission helper metadata and grants.
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
  and p.proname = 'has_screen_permission';

-- 2) RLS must be enabled on all protected tables.
with expected(table_name) as (
  values
    ('customers'), ('customer_interests'), ('customer_followups'), ('quotations'),
    ('sales_representatives'), ('interest_categories'), ('no_sale_reasons'),
    ('user_profiles'), ('role_screen_permissions'), ('app_screens'),
    ('audit_logs'), ('system_settings'), ('backup_operations')
)
select
  e.table_name,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  case when c.oid is null then 'MISSING_TABLE'
       when c.relrowsecurity then 'PASS'
       else 'FAIL'
  end as result
from expected e
left join pg_class c on c.relname = e.table_name
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by e.table_name;

-- 3) Show all active policies on the protected tables.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customers','customer_interests','customer_followups','quotations',
    'sales_representatives','interest_categories','no_sale_reasons',
    'user_profiles','role_screen_permissions','app_screens',
    'audit_logs','system_settings','backup_operations'
  )
order by tablename, cmd, policyname;

-- 4) Detect broad authenticated policies that bypass the permission helper.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customers','customer_interests','customer_followups','quotations',
    'sales_representatives','interest_categories','no_sale_reasons',
    'user_profiles','role_screen_permissions','app_screens',
    'audit_logs','system_settings','backup_operations'
  )
  and 'authenticated' = any(roles)
  and (
    coalesce(qual, '') in ('true', '(true)')
    or coalesce(with_check, '') in ('true', '(true)')
  )
order by tablename, policyname;

-- 5) Every active screen must have a permission row for super_admin.
select
  s.screen_key,
  case when rp.screen_key is null then 'MISSING' else 'PASS' end as result,
  coalesce(rp.can_view, false) as can_view,
  coalesce(rp.can_add, false) as can_add,
  coalesce(rp.can_edit, false) as can_edit,
  coalesce(rp.can_delete, false) as can_delete,
  coalesce(rp.can_export, false) as can_export
from public.app_screens s
left join public.role_screen_permissions rp
  on rp.role = 'super_admin'
 and rp.screen_key = s.screen_key
where s.is_active = true
order by s.screen_key;

-- 6) Detect invalid permission rows that reference missing screens.
select rp.*
from public.role_screen_permissions rp
left join public.app_screens s on s.screen_key = rp.screen_key
where s.screen_key is null
order by rp.role, rp.screen_key;

-- 7) Detect duplicate role/screen permission rows.
select role, screen_key, count(*) as duplicate_count
from public.role_screen_permissions
group by role, screen_key
having count(*) > 1
order by role, screen_key;

-- 8) Summary. All failure counters should be zero.
with protected_tables(table_name) as (
  values
    ('customers'), ('customer_interests'), ('customer_followups'), ('quotations'),
    ('sales_representatives'), ('interest_categories'), ('no_sale_reasons'),
    ('user_profiles'), ('role_screen_permissions'), ('app_screens'),
    ('audit_logs'), ('system_settings'), ('backup_operations')
), rls_failures as (
  select count(*)::int as count
  from protected_tables e
  left join pg_class c on c.relname = e.table_name
  left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.oid is null or not coalesce(c.relrowsecurity, false)
), super_admin_failures as (
  select count(*)::int as count
  from public.app_screens s
  left join public.role_screen_permissions rp
    on rp.role = 'super_admin' and rp.screen_key = s.screen_key
  where s.is_active = true
    and (
      rp.screen_key is null
      or not coalesce(rp.can_view, false)
      or not coalesce(rp.can_add, false)
      or not coalesce(rp.can_edit, false)
      or not coalesce(rp.can_delete, false)
      or not coalesce(rp.can_export, false)
    )
), orphan_failures as (
  select count(*)::int as count
  from public.role_screen_permissions rp
  left join public.app_screens s on s.screen_key = rp.screen_key
  where s.screen_key is null
), duplicate_failures as (
  select count(*)::int as count
  from (
    select role, screen_key
    from public.role_screen_permissions
    group by role, screen_key
    having count(*) > 1
  ) d
)
select
  (select count from rls_failures) as rls_failures,
  (select count from super_admin_failures) as super_admin_permission_failures,
  (select count from orphan_failures) as orphan_permission_rows,
  (select count from duplicate_failures) as duplicate_permission_keys,
  case when
    (select count from rls_failures) = 0
    and (select count from super_admin_failures) = 0
    and (select count from orphan_failures) = 0
    and (select count from duplicate_failures) = 0
  then 'PASS' else 'REVIEW_REQUIRED' end as overall_result;
