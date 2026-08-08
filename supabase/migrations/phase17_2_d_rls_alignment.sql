-- KYUM CRM Phase 17.2-D — Database / RLS Alignment
-- Align database access with the canonical screen/action permission matrix.

begin;

-- ------------------------------------------------------------
-- 1. Core CRM tables
-- ------------------------------------------------------------

drop policy if exists "authenticated manage customers" on public.customers;
drop policy if exists "customers read scoped" on public.customers;
drop policy if exists "customers insert scoped" on public.customers;
drop policy if exists "customers update scoped" on public.customers;
drop policy if exists "customers delete management" on public.customers;

create policy "customers permission select"
on public.customers for select to authenticated
using (
  public.has_screen_permission('customers','view')
  and (
    public.is_management_user()
    or public.current_user_role() = 'viewer'
    or representative_id = public.current_representative_id()
  )
);

create policy "customers permission insert"
on public.customers for insert to authenticated
with check (
  public.has_screen_permission('customers','add')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

create policy "customers permission update"
on public.customers for update to authenticated
using (
  public.has_screen_permission('customers','edit')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
)
with check (
  public.has_screen_permission('customers','edit')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

create policy "customers permission delete"
on public.customers for delete to authenticated
using (
  public.has_screen_permission('customers','delete')
  and public.is_management_user()
);

-- Customer interests inherit customer visibility and customer action rights.
drop policy if exists "customer interests read scoped" on public.customer_interests;
drop policy if exists "customer interests manage scoped" on public.customer_interests;

create policy "customer interests permission select"
on public.customer_interests for select to authenticated
using (
  public.has_screen_permission('customers','view')
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
  )
);

create policy "customer interests permission insert"
on public.customer_interests for insert to authenticated
with check (
  public.has_screen_permission('customers','edit')
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
  )
);

create policy "customer interests permission delete"
on public.customer_interests for delete to authenticated
using (
  public.has_screen_permission('customers','edit')
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
  )
);

-- Follow-ups.
drop policy if exists "authenticated manage customer followups" on public.customer_followups;
drop policy if exists "followups read scoped" on public.customer_followups;
drop policy if exists "followups manage scoped" on public.customer_followups;

create policy "followups permission select"
on public.customer_followups for select to authenticated
using (
  public.has_screen_permission('followups','view')
  and (
    public.is_management_user()
    or public.current_user_role() = 'viewer'
    or representative_id = public.current_representative_id()
  )
);

create policy "followups permission insert"
on public.customer_followups for insert to authenticated
with check (
  public.has_screen_permission('followups','add')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

create policy "followups permission update"
on public.customer_followups for update to authenticated
using (
  public.has_screen_permission('followups','edit')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
)
with check (
  public.has_screen_permission('followups','edit')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

create policy "followups permission delete"
on public.customer_followups for delete to authenticated
using (
  public.has_screen_permission('followups','delete')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

-- Quotations.
drop policy if exists "authenticated manage quotations" on public.quotations;
drop policy if exists "quotations read scoped" on public.quotations;
drop policy if exists "quotations manage scoped" on public.quotations;

create policy "quotations permission select"
on public.quotations for select to authenticated
using (
  public.has_screen_permission('quotations','view')
  and (
    public.is_management_user()
    or public.current_user_role() = 'viewer'
    or representative_id = public.current_representative_id()
  )
);

create policy "quotations permission insert"
on public.quotations for insert to authenticated
with check (
  public.has_screen_permission('quotations','add')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

create policy "quotations permission update"
on public.quotations for update to authenticated
using (
  public.has_screen_permission('quotations','edit')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
)
with check (
  public.has_screen_permission('quotations','edit')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

create policy "quotations permission delete"
on public.quotations for delete to authenticated
using (
  public.has_screen_permission('quotations','delete')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

-- ------------------------------------------------------------
-- 2. Reference data
-- ------------------------------------------------------------

-- Keep authenticated read access only when the reference-data screen is viewable.
drop policy if exists "authenticated read representatives" on public.sales_representatives;
drop policy if exists "management manage representatives" on public.sales_representatives;
create policy "representatives permission select" on public.sales_representatives
for select to authenticated using (public.has_screen_permission('representatives','view'));
create policy "representatives permission insert" on public.sales_representatives
for insert to authenticated with check (public.has_screen_permission('representatives','add'));
create policy "representatives permission update" on public.sales_representatives
for update to authenticated using (public.has_screen_permission('representatives','edit'))
with check (public.has_screen_permission('representatives','edit'));
create policy "representatives permission delete" on public.sales_representatives
for delete to authenticated using (public.has_screen_permission('representatives','delete'));

drop policy if exists "authenticated read interests" on public.interest_categories;
drop policy if exists "management manage interests" on public.interest_categories;
create policy "interests permission select" on public.interest_categories
for select to authenticated using (public.has_screen_permission('settings','view'));
create policy "interests permission insert" on public.interest_categories
for insert to authenticated with check (public.has_screen_permission('settings','add'));
create policy "interests permission update" on public.interest_categories
for update to authenticated using (public.has_screen_permission('settings','edit'))
with check (public.has_screen_permission('settings','edit'));
create policy "interests permission delete" on public.interest_categories
for delete to authenticated using (public.has_screen_permission('settings','delete'));

drop policy if exists "authenticated read reasons" on public.no_sale_reasons;
drop policy if exists "management manage reasons" on public.no_sale_reasons;
create policy "reasons permission select" on public.no_sale_reasons
for select to authenticated using (public.has_screen_permission('settings','view'));
create policy "reasons permission insert" on public.no_sale_reasons
for insert to authenticated with check (public.has_screen_permission('settings','add'));
create policy "reasons permission update" on public.no_sale_reasons
for update to authenticated using (public.has_screen_permission('settings','edit'))
with check (public.has_screen_permission('settings','edit'));
create policy "reasons permission delete" on public.no_sale_reasons
for delete to authenticated using (public.has_screen_permission('settings','delete'));

-- ------------------------------------------------------------
-- 3. Administration and privacy
-- ------------------------------------------------------------

drop policy if exists "profiles read own or management" on public.user_profiles;
drop policy if exists "profiles update management" on public.user_profiles;
create policy "profiles permission select" on public.user_profiles
for select to authenticated
using (id = auth.uid() or public.has_screen_permission('users','view'));
create policy "profiles permission update" on public.user_profiles
for update to authenticated
using (public.has_screen_permission('users','edit'))
with check (public.has_screen_permission('users','edit'));

-- Permission matrix itself.
drop policy if exists "authenticated read role permissions" on public.role_screen_permissions;
drop policy if exists "super admin manage role permissions" on public.role_screen_permissions;
create policy "role permissions permission select" on public.role_screen_permissions
for select to authenticated
using (
  role = public.current_user_role()
  or public.has_screen_permission('permissions','view')
);
create policy "role permissions permission insert" on public.role_screen_permissions
for insert to authenticated with check (public.has_screen_permission('permissions','add'));
create policy "role permissions permission update" on public.role_screen_permissions
for update to authenticated using (public.has_screen_permission('permissions','edit'))
with check (public.has_screen_permission('permissions','edit'));
create policy "role permissions permission delete" on public.role_screen_permissions
for delete to authenticated using (public.has_screen_permission('permissions','delete'));

-- Screen metadata is needed to build the current user's menu. It remains read-only.
drop policy if exists "authenticated read app screens" on public.app_screens;
create policy "app screens authenticated select" on public.app_screens
for select to authenticated using (true);

-- Activity log.
drop policy if exists "audit logs management read" on public.audit_logs;
create policy "audit logs permission select" on public.audit_logs
for select to authenticated using (public.has_screen_permission('activityLog','view'));

-- System settings.
drop policy if exists "authenticated read system settings" on public.system_settings;
drop policy if exists "super admin manage system settings" on public.system_settings;
create policy "system settings permission select" on public.system_settings
for select to authenticated using (public.has_screen_permission('systemSettings','view'));
create policy "system settings permission insert" on public.system_settings
for insert to authenticated with check (public.has_screen_permission('systemSettings','add'));
create policy "system settings permission update" on public.system_settings
for update to authenticated using (public.has_screen_permission('systemSettings','edit'))
with check (public.has_screen_permission('systemSettings','edit'));
create policy "system settings permission delete" on public.system_settings
for delete to authenticated using (public.has_screen_permission('systemSettings','delete'));

-- Backup operation history. Actual export/restore still runs through the secured Edge Function.
drop policy if exists "super admin read backup operations" on public.backup_operations;
create policy "backup operations permission select" on public.backup_operations
for select to authenticated using (public.has_screen_permission('backups','view'));

commit;

-- ------------------------------------------------------------
-- Verification: all Phase 17.2-D policies and missing RLS flags.
-- ------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and policyname like '%permission%'
order by tablename, cmd, policyname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'customers','customer_interests','customer_followups','quotations',
    'sales_representatives','interest_categories','no_sale_reasons',
    'user_profiles','role_screen_permissions','app_screens','audit_logs',
    'system_settings','backup_operations'
  )
order by c.relname;
