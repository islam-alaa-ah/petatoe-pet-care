-- KYUM CRM Phase 17.3-A — Enterprise Backup Architecture
-- Creates a canonical backup manifest for all known application tables.
-- The function returns only tables that currently exist in public schema.

begin;

create or replace function public.kyum_backup_table_manifest()
returns table (
  table_name text,
  restore_order integer,
  category text,
  required boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with manifest(table_name, restore_order, category, required) as (
    values
      ('interest_categories',       10, 'reference', true),
      ('no_sale_reasons',           20, 'reference', true),
      ('sales_representatives',     30, 'reference', true),
      ('app_screens',               40, 'security',  true),
      ('user_profiles',             50, 'security',  true),
      ('role_screen_permissions',   60, 'security',  true),
      ('system_settings',           70, 'system',    true),

      ('customers',                100, 'crm',       true),
      ('customer_interests',       110, 'crm',       true),
      ('customer_contacts',        120, 'crm',       false),
      ('customer_followups',       130, 'crm',       true),
      ('quotations',               140, 'crm',       true),
      ('crm_tasks',                150, 'crm',       false),
      ('crm_attachments',          160, 'crm',       false),
      ('sales_orders',             170, 'crm',       false),
      ('invoices',                 180, 'crm',       false),
      ('customer_projects',        190, 'crm',       false),
      ('customer_contracts',       200, 'crm',       false),
      ('installed_assets',         210, 'crm',       false),
      ('service_requests',         220, 'crm',       false),
      ('customer_complaints',      230, 'crm',       false),
      ('collections',              240, 'crm',       false),

      ('daily_task_definitions',   300, 'daily',     false),
      ('daily_operation_targets',  310, 'daily',     false),
      ('daily_task_completions',   320, 'daily',     false),
      ('daily_manager_notes',      330, 'daily',     false),
      ('daily_alerts',             340, 'daily',     false),
      ('daily_alert_actions',      350, 'daily',     false),
      ('daily_employee_sessions',  360, 'daily',     false),

      ('audit_logs',               900, 'audit',     false),
      ('backup_operations',        910, 'audit',     false)
  )
  select
    m.table_name,
    m.restore_order,
    m.category,
    m.required
  from manifest m
  where to_regclass(format('public.%I', m.table_name)) is not null
  order by m.restore_order;
$$;

revoke all on function public.kyum_backup_table_manifest() from public;
revoke all on function public.kyum_backup_table_manifest() from anon;
revoke all on function public.kyum_backup_table_manifest() from authenticated;
grant execute on function public.kyum_backup_table_manifest() to service_role;

comment on function public.kyum_backup_table_manifest()
is 'Canonical ordered manifest for KYUM CRM enterprise backup exports. Service role only.';

commit;

-- Verification
select *
from public.kyum_backup_table_manifest();

select
  p.proname as function_name,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'kyum_backup_table_manifest';
