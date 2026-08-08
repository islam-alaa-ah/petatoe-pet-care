-- KYUM CRM Phase 17.3-D — Database Performance & Index Alignment
-- Scope:
--   - Add safe composite indexes that match verified application query patterns.
--   - Add indexes for currently unindexed foreign-key access paths.
--   - Refresh planner statistics.
-- No table data is changed.

begin;

-- Customers: dashboard/list ordering, representative filtering, recent records.
create index if not exists idx_customers_created_at_desc
  on public.customers (created_at desc);

create index if not exists idx_customers_representative_created_at
  on public.customers (representative_id, created_at desc)
  where representative_id is not null;

create index if not exists idx_customers_last_contact_created_at
  on public.customers (last_contact_date desc, created_at desc);

create index if not exists idx_customers_no_sale_reason
  on public.customers (no_sale_reason_id)
  where no_sale_reason_id is not null;

create index if not exists idx_customers_created_by
  on public.customers (created_by)
  where created_by is not null;

-- Followups: customer history and representative/date reporting.
create index if not exists idx_followups_customer_contact_created
  on public.customer_followups (
    customer_id,
    contact_date desc,
    created_at desc
  );

create index if not exists idx_followups_representative_contact
  on public.customer_followups (
    representative_id,
    contact_date desc
  )
  where representative_id is not null;

create index if not exists idx_followups_open_next_customer
  on public.customer_followups (
    next_followup_date,
    customer_id
  )
  where is_completed = false
    and next_followup_date is not null;

create index if not exists idx_followups_no_sale_reason
  on public.customer_followups (no_sale_reason_id)
  where no_sale_reason_id is not null;

create index if not exists idx_followups_created_by
  on public.customer_followups (created_by)
  where created_by is not null;

-- Quotations: customer history, representative/date and status/date reports.
create index if not exists idx_quotations_customer_date_created
  on public.quotations (
    customer_id,
    quotation_date desc,
    created_at desc
  );

create index if not exists idx_quotations_representative_date
  on public.quotations (
    representative_id,
    quotation_date desc
  )
  where representative_id is not null;

create index if not exists idx_quotations_status_date
  on public.quotations (
    status,
    quotation_date desc
  );

create index if not exists idx_quotations_expiry_open
  on public.quotations (expiry_date)
  where expiry_date is not null
    and status not in ('مقبول', 'مرفوض', 'ملغي');

create index if not exists idx_quotations_rejection_reason
  on public.quotations (rejection_reason_id)
  where rejection_reason_id is not null;

create index if not exists idx_quotations_created_by
  on public.quotations (created_by)
  where created_by is not null;

-- Permissions/navigation: active-screen sorting and role matrix loading.
create index if not exists idx_app_screens_active_display
  on public.app_screens (is_active, display_order, screen_key);

create index if not exists idx_role_screen_permissions_role_screen
  on public.role_screen_permissions (role, screen_key);

-- User administration and active-directory lists.
create index if not exists idx_user_profiles_active_name
  on public.user_profiles (is_active, full_name);

create index if not exists idx_user_profiles_role_active
  on public.user_profiles (role, is_active);

create index if not exists idx_user_profiles_representative
  on public.user_profiles (representative_id)
  where representative_id is not null;

-- Reference-data list ordering.
create index if not exists idx_sales_representatives_active_name
  on public.sales_representatives (is_active, full_name);

create index if not exists idx_interest_categories_active_name
  on public.interest_categories (is_active, name);

create index if not exists idx_no_sale_reasons_active_name
  on public.no_sale_reasons (is_active, name);

-- Audit, diagnostics and backup history.
create index if not exists idx_audit_logs_created_at_desc
  on public.audit_logs (created_at desc);

create index if not exists idx_backup_operations_created_at_desc
  on public.backup_operations (created_at desc);

create index if not exists idx_backup_operations_status_created
  on public.backup_operations (status, created_at desc);

create index if not exists idx_backup_operations_created_by
  on public.backup_operations (created_by)
  where created_by is not null;

-- Daily operations.
create index if not exists idx_daily_task_definitions_active_order
  on public.daily_task_definitions (
    is_active,
    display_order,
    task_key
  );

create index if not exists idx_daily_task_completions_date_user
  on public.daily_task_completions (
    work_date desc,
    user_id
  );

create index if not exists idx_daily_task_completions_date_completed
  on public.daily_task_completions (
    work_date desc,
    is_completed
  );

create index if not exists idx_daily_task_completions_task_date
  on public.daily_task_completions (
    task_key,
    work_date desc
  );

create index if not exists idx_daily_alerts_date_status
  on public.daily_alerts (
    work_date desc,
    status,
    severity
  );

create index if not exists idx_daily_alerts_representative_date
  on public.daily_alerts (
    representative_id,
    work_date desc
  )
  where representative_id is not null;

create index if not exists idx_daily_alert_actions_alert_created
  on public.daily_alert_actions (
    alert_id,
    created_at desc
  );

create index if not exists idx_daily_alert_actions_action_by
  on public.daily_alert_actions (action_by)
  where action_by is not null;

create index if not exists idx_daily_employee_sessions_user_date_activity
  on public.daily_employee_sessions (
    user_id,
    work_date desc,
    last_activity_at desc
  );

create index if not exists idx_daily_employee_sessions_representative_date
  on public.daily_employee_sessions (
    representative_id,
    work_date desc
  )
  where representative_id is not null;

create index if not exists idx_daily_manager_notes_created_by
  on public.daily_manager_notes (created_by)
  where created_by is not null;

commit;

-- Refresh PostgreSQL planner statistics after index deployment.
analyze public.customers;
analyze public.customer_followups;
analyze public.quotations;
analyze public.app_screens;
analyze public.role_screen_permissions;
analyze public.user_profiles;
analyze public.sales_representatives;
analyze public.interest_categories;
analyze public.no_sale_reasons;
analyze public.audit_logs;
analyze public.backup_operations;
analyze public.daily_task_definitions;
analyze public.daily_task_completions;
analyze public.daily_alerts;
analyze public.daily_alert_actions;
analyze public.daily_employee_sessions;
analyze public.daily_manager_notes;

notify pgrst, 'reload schema';

-- Immediate deployment summary.
select
  schemaname,
  tablename,
  indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_customers_created_at_desc',
    'idx_customers_representative_created_at',
    'idx_customers_last_contact_created_at',
    'idx_followups_customer_contact_created',
    'idx_followups_representative_contact',
    'idx_followups_open_next_customer',
    'idx_quotations_customer_date_created',
    'idx_quotations_representative_date',
    'idx_quotations_status_date',
    'idx_app_screens_active_display',
    'idx_user_profiles_active_name',
    'idx_backup_operations_created_at_desc',
    'idx_daily_task_definitions_active_order',
    'idx_daily_task_completions_date_user',
    'idx_daily_alerts_date_status',
    'idx_daily_alert_actions_alert_created',
    'idx_daily_employee_sessions_user_date_activity'
  )
order by tablename, indexname;
