-- PETATOE P5 — Daily Operations & Global Runtime Diagnostic
-- READ ONLY: this script does not create, update, delete, or alter any application data/schema.
-- Run the whole script in Supabase SQL Editor and send back ALL result sets.

-- ============================================================
-- A) Current database identity / basic runtime objects
-- ============================================================
select
  current_database() as database_name,
  current_user as sql_role,
  now() as checked_at;

select
  x.object_name,
  case when to_regclass('public.' || x.object_name) is null then 'MISSING' else 'OK' end as status
from (
  values
    ('user_profiles'),
    ('daily_task_definitions'),
    ('daily_task_completions'),
    ('daily_operation_targets'),
    ('daily_manager_notes'),
    ('daily_alerts'),
    ('daily_alert_actions'),
    ('daily_employee_sessions'),
    ('daily_customer_suggestions'),
    ('business_activity_events'),
    ('audit_logs'),
    ('customers'),
    ('customer_followups'),
    ('quotations')
) as x(object_name)
order by x.object_name;

-- ============================================================
-- B) Explicit PostgREST relationships required by current JS
-- ============================================================
with required(constraint_name, table_name, local_column, target_table, target_column) as (
  values
    ('daily_task_completions_user_profile_fkey','daily_task_completions','user_id','user_profiles','id'),
    ('daily_employee_sessions_user_profile_fkey','daily_employee_sessions','user_id','user_profiles','id'),
    ('daily_alerts_user_profile_fkey','daily_alerts','user_id','user_profiles','id'),
    ('daily_alert_actions_user_profile_fkey','daily_alert_actions','action_by','user_profiles','id'),
    ('audit_logs_user_profile_fkey','audit_logs','user_id','user_profiles','id'),
    ('daily_alert_actions_alert_id_fkey','daily_alert_actions','alert_id','daily_alerts','id'),
    ('business_activity_events_user_id_fkey','business_activity_events','user_id','user_profiles','id')
)
select
  r.constraint_name,
  r.table_name,
  r.local_column,
  r.target_table,
  r.target_column,
  case when c.oid is null then 'MISSING' else 'OK' end as status,
  c.convalidated as validated,
  pg_get_constraintdef(c.oid) as actual_definition
from required r
left join pg_constraint c
  on c.conname=r.constraint_name
 and c.conrelid=to_regclass('public.' || r.table_name)
order by r.constraint_name;

-- ============================================================
-- C) Orphan audit for relationships that may need repair
-- ============================================================
select 'daily_task_completions.user_id -> user_profiles.id' as relationship,
       count(*)::bigint as orphan_rows
from public.daily_task_completions c
left join public.user_profiles p on p.id=c.user_id
where p.id is null

union all
select 'daily_employee_sessions.user_id -> user_profiles.id',
       count(*)::bigint
from public.daily_employee_sessions s
left join public.user_profiles p on p.id=s.user_id
where p.id is null

union all
select 'daily_alerts.user_id -> user_profiles.id',
       count(*)::bigint
from public.daily_alerts a
left join public.user_profiles p on p.id=a.user_id
where a.user_id is not null and p.id is null

union all
select 'daily_alert_actions.action_by -> user_profiles.id',
       count(*)::bigint
from public.daily_alert_actions a
left join public.user_profiles p on p.id=a.action_by
where a.action_by is not null and p.id is null

union all
select 'audit_logs.user_id -> user_profiles.id',
       count(*)::bigint
from public.audit_logs a
left join public.user_profiles p on p.id=a.user_id
where a.user_id is not null and p.id is null

union all
select 'business_activity_events.user_id -> user_profiles.id',
       count(*)::bigint
from public.business_activity_events b
left join public.user_profiles p on p.id=b.user_id
where b.user_id is not null and p.id is null

order by relationship;

-- ============================================================
-- D) Daily Operations columns expected by the current frontend
-- ============================================================
with expected(table_name,column_name) as (
  values
    ('daily_task_definitions','task_key'),
    ('daily_task_definitions','task_name'),
    ('daily_task_definitions','description'),
    ('daily_task_definitions','display_order'),
    ('daily_task_definitions','is_active'),
    ('daily_task_definitions','permission_key'),

    ('daily_task_completions','id'),
    ('daily_task_completions','task_key'),
    ('daily_task_completions','work_date'),
    ('daily_task_completions','user_id'),
    ('daily_task_completions','representative_id'),
    ('daily_task_completions','is_completed'),
    ('daily_task_completions','completed_at'),
    ('daily_task_completions','updated_at'),

    ('daily_operation_targets','work_date'),
    ('daily_operation_targets','customers_target'),
    ('daily_operation_targets','followups_target'),
    ('daily_operation_targets','quotations_target'),
    ('daily_operation_targets','updated_at'),

    ('daily_manager_notes','id'),
    ('daily_manager_notes','work_date'),
    ('daily_manager_notes','title'),
    ('daily_manager_notes','note_text'),
    ('daily_manager_notes','created_by'),
    ('daily_manager_notes','audience_scope'),
    ('daily_manager_notes','recipient_user_ids'),
    ('daily_manager_notes','updated_at'),

    ('daily_employee_sessions','id'),
    ('daily_employee_sessions','user_id'),
    ('daily_employee_sessions','representative_id'),
    ('daily_employee_sessions','work_date'),
    ('daily_employee_sessions','first_activity_at'),
    ('daily_employee_sessions','last_activity_at'),
    ('daily_employee_sessions','ended_at'),
    ('daily_employee_sessions','heartbeat_count'),
    ('daily_employee_sessions','event_count'),
    ('daily_employee_sessions','last_event_type'),
    ('daily_employee_sessions','updated_at'),

    ('daily_alerts','id'),
    ('daily_alerts','work_date'),
    ('daily_alerts','alert_type'),
    ('daily_alerts','severity'),
    ('daily_alerts','status'),
    ('daily_alerts','user_id'),
    ('daily_alerts','representative_id'),
    ('daily_alerts','source_key'),

    ('daily_alert_actions','id'),
    ('daily_alert_actions','alert_id'),
    ('daily_alert_actions','action_type'),
    ('daily_alert_actions','action_by')
)
select
  e.table_name,
  e.column_name,
  case when c.column_name is null then 'MISSING' else 'OK' end as status,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from expected e
left join information_schema.columns c
  on c.table_schema='public'
 and c.table_name=e.table_name
 and c.column_name=e.column_name
order by e.table_name,e.column_name;

-- ============================================================
-- E) Daily runtime RPC availability + security
-- ============================================================
with required(function_name) as (
  values
    ('touch_daily_employee_session'),
    ('end_daily_employee_session'),
    ('sync_daily_operational_alerts'),
    ('replenish_daily_customer_suggestions'),
    ('get_daily_customer_suggestions'),
    ('get_daily_customer_suggestions_team_summary'),
    ('log_business_activity_event'),
    ('can_read_business_activity_event')
)
select
  r.function_name,
  coalesce(pg_get_function_identity_arguments(p.oid),'') as arguments,
  case when p.oid is null then 'MISSING' else 'OK' end as status,
  p.prosecdef as security_definer,
  case when p.oid is null then null
       else has_function_privilege('anon',p.oid,'EXECUTE') end as anon_can_execute,
  case when p.oid is null then null
       else has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_can_execute
from required r
left join pg_proc p on p.proname=r.function_name
left join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
where p.oid is null or n.nspname='public'
order by r.function_name,arguments;

-- ============================================================
-- F) Row counts / current data footprint
-- ============================================================
select 'user_profiles' object_name,count(*)::bigint row_count from public.user_profiles
union all select 'daily_task_definitions',count(*)::bigint from public.daily_task_definitions
union all select 'daily_task_completions',count(*)::bigint from public.daily_task_completions
union all select 'daily_operation_targets',count(*)::bigint from public.daily_operation_targets
union all select 'daily_manager_notes',count(*)::bigint from public.daily_manager_notes
union all select 'daily_alerts',count(*)::bigint from public.daily_alerts
union all select 'daily_alert_actions',count(*)::bigint from public.daily_alert_actions
union all select 'daily_employee_sessions',count(*)::bigint from public.daily_employee_sessions
union all select 'daily_customer_suggestions',count(*)::bigint from public.daily_customer_suggestions
union all select 'business_activity_events',count(*)::bigint from public.business_activity_events
order by object_name;

-- ============================================================
-- G) Task definitions currently expected by Daily Operations
-- ============================================================
select
  task_key,
  task_name,
  permission_key,
  display_order,
  is_active
from public.daily_task_definitions
order by display_order,task_key;

-- ============================================================
-- H) Daily Operations screen permissions
-- ============================================================
select
  s.screen_key,
  s.screen_name,
  p.role,
  p.can_view,
  p.can_add,
  p.can_edit,
  p.can_delete,
  p.can_export
from public.app_screens s
left join public.role_screen_permissions p
  on p.screen_key=s.screen_key
where s.screen_key in(
  'dailyOperations',
  'dailyAdsUpdate',
  'dailyReviewMessages',
  'dailyReviewOverdue',
  'dailyReviewQuotations',
  'dailyReviewNewCustomers',
  'dailyOperationsSettings',
  'dailyAlertsManagement',
  'dailyAttendanceActivity',
  'dailyPerformanceReport'
)
order by s.display_order,p.role;

-- ============================================================
-- I) RLS status + policies for all Daily Operations tables
-- ============================================================
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in(
    'daily_task_definitions',
    'daily_task_completions',
    'daily_operation_targets',
    'daily_manager_notes',
    'daily_alerts',
    'daily_alert_actions',
    'daily_employee_sessions',
    'daily_customer_suggestions',
    'business_activity_events'
  )
order by c.relname;

select
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname='public'
  and tablename in(
    'daily_task_definitions',
    'daily_task_completions',
    'daily_operation_targets',
    'daily_manager_notes',
    'daily_alerts',
    'daily_alert_actions',
    'daily_employee_sessions',
    'daily_customer_suggestions',
    'business_activity_events'
  )
order by tablename,policyname;

-- ============================================================
-- J) Auth/Profile integrity
-- ============================================================
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.user_profiles) as user_profiles,
  (
    select count(*)
    from auth.users u
    left join public.user_profiles p on p.id=u.id
    where p.id is null
  ) as auth_users_without_profile,
  (
    select count(*)
    from public.user_profiles p
    left join auth.users u on u.id=p.id
    where u.id is null
  ) as profiles_without_auth_user;

select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  p.representative_id
from public.user_profiles p
order by p.created_at,p.id;

-- ============================================================
-- K) Stale DB functions that still reference REMOVED customer-master fields
--    This is critical after P4 canonical customer model.
-- ============================================================
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case
    when lower(pg_get_functiondef(p.oid)) like '%customer_type%' then 'customer_type'
    when lower(pg_get_functiondef(p.oid)) like '%customers%representative_id%' then 'customers.representative_id'
    when lower(pg_get_functiondef(p.oid)) like '%c.representative_id%' then 'c.representative_id'
    when lower(pg_get_functiondef(p.oid)) like '%contact_person_name%' then 'contact_person_name'
    when lower(pg_get_functiondef(p.oid)) like '%quotation_number%' then 'quotation_number'
    when lower(pg_get_functiondef(p.oid)) like '%no_sale_reason_id%' then 'no_sale_reason_id'
    when lower(pg_get_functiondef(p.oid)) like '%customers%region%' then 'customers.region'
    when lower(pg_get_functiondef(p.oid)) like '%customers%city%' then 'customers.city'
    when lower(pg_get_functiondef(p.oid)) like '%customers%district%' then 'customers.district'
    else 'legacy customer reference'
  end as legacy_reference,
  left(regexp_replace(pg_get_functiondef(p.oid), E'[\\n\\r\\t]+',' ','g'),800) as definition_preview
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (
    lower(pg_get_functiondef(p.oid)) like '%customer_type%'
    or lower(pg_get_functiondef(p.oid)) like '%customers%representative_id%'
    or lower(pg_get_functiondef(p.oid)) like '%c.representative_id%'
    or lower(pg_get_functiondef(p.oid)) like '%contact_person_name%'
    or lower(pg_get_functiondef(p.oid)) like '%quotation_number%'
    or lower(pg_get_functiondef(p.oid)) like '%no_sale_reason_id%'
    or lower(pg_get_functiondef(p.oid)) like '%customers%region%'
    or lower(pg_get_functiondef(p.oid)) like '%customers%city%'
    or lower(pg_get_functiondef(p.oid)) like '%customers%district%'
  )
order by p.proname,arguments;

-- ============================================================
-- L) High-risk daily function definitions in full
-- ============================================================
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in(
    'sync_daily_operational_alerts',
    'replenish_daily_customer_suggestions',
    'get_daily_customer_suggestions',
    'get_daily_customer_suggestions_team_summary',
    'touch_daily_employee_session',
    'end_daily_employee_session'
  )
order by p.proname,arguments;

-- ============================================================
-- M) Grants for Daily Operations objects
-- ============================================================
select
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee='authenticated'
  and table_name in(
    'daily_task_definitions',
    'daily_task_completions',
    'daily_operation_targets',
    'daily_manager_notes',
    'daily_alerts',
    'daily_alert_actions',
    'daily_employee_sessions',
    'daily_customer_suggestions',
    'business_activity_events'
  )
order by table_name,privilege_type;
