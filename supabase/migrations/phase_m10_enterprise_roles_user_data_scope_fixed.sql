-- KYUM CRM Phase M10 — Enterprise Roles & User Data Scope
-- Safe to re-run in Supabase SQL Editor after the previous migrations.

begin;

create table if not exists public.user_data_access_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  access_mode text not null default 'own' check (access_mode in ('own','selected','all')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_data_access_representatives (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  representative_id uuid not null references public.sales_representatives(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, representative_id)
);

create index if not exists idx_user_data_access_representatives_rep
  on public.user_data_access_representatives(representative_id, user_id);

alter table public.user_data_access_profiles enable row level security;
alter table public.user_data_access_representatives enable row level security;

drop policy if exists "data access profiles own or admin read" on public.user_data_access_profiles;
create policy "data access profiles own or admin read"
on public.user_data_access_profiles for select to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'super_admin');

drop policy if exists "data access profiles admin manage" on public.user_data_access_profiles;
create policy "data access profiles admin manage"
on public.user_data_access_profiles for all to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');

drop policy if exists "data access reps own or admin read" on public.user_data_access_representatives;
create policy "data access reps own or admin read"
on public.user_data_access_representatives for select to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'super_admin');

drop policy if exists "data access reps admin manage" on public.user_data_access_representatives;
create policy "data access reps admin manage"
on public.user_data_access_representatives for all to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');

create or replace function public.current_data_access_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.access_mode from public.user_data_access_profiles p where p.user_id = auth.uid()),
    case
      when public.current_user_role() in ('super_admin','sales_manager') then 'all'
      when public.current_user_role() = 'viewer' then 'all'
      when public.current_representative_id() is not null then 'own'
      else 'selected'
    end
  );
$$;

create or replace function public.can_access_representative(p_representative_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_role() = 'super_admin' then true
    when public.current_data_access_mode() = 'all' then true
    when p_representative_id is null then false
    when p_representative_id = public.current_representative_id() then true
    when public.current_data_access_mode() = 'selected' then exists (
      select 1
      from public.user_data_access_representatives a
      where a.user_id = auth.uid()
        and a.representative_id = p_representative_id
    )
    else false
  end;
$$;

grant execute on function public.current_data_access_mode() to authenticated;
grant execute on function public.can_access_representative(uuid) to authenticated;

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer_id
      and public.can_access_representative(c.representative_id)
  );
$$;

grant execute on function public.can_access_customer(uuid) to authenticated;
grant select on public.user_data_access_profiles to authenticated;
grant select on public.user_data_access_representatives to authenticated;
grant insert,update,delete on public.user_data_access_profiles to authenticated;
grant insert,update,delete on public.user_data_access_representatives to authenticated;

-- Existing users keep their current behavior until explicitly configured.
insert into public.user_data_access_profiles(user_id, access_mode, updated_by)
select p.id,
       case
         when p.role::text in ('super_admin','sales_manager','viewer') then 'all'
         when p.representative_id is not null then 'own'
         else 'selected'
       end,
       auth.uid()
from public.user_profiles p
on conflict (user_id) do nothing;

-- Core CRM scope + action permissions.
drop policy if exists "customers permission select" on public.customers;
drop policy if exists "customers permission insert" on public.customers;
drop policy if exists "customers permission update" on public.customers;
drop policy if exists "customers permission delete" on public.customers;
create policy "customers permission select" on public.customers for select to authenticated
using (public.has_screen_permission('customers','view') and public.can_access_representative(representative_id));
create policy "customers permission insert" on public.customers for insert to authenticated
with check (public.has_screen_permission('customers','add') and public.can_access_representative(representative_id));
create policy "customers permission update" on public.customers for update to authenticated
using (public.has_screen_permission('customers','edit') and public.can_access_representative(representative_id))
with check (public.has_screen_permission('customers','edit') and public.can_access_representative(representative_id));
create policy "customers permission delete" on public.customers for delete to authenticated
using (public.has_screen_permission('customers','delete') and public.can_access_representative(representative_id));

drop policy if exists "customer interests permission select" on public.customer_interests;
drop policy if exists "customer interests permission insert" on public.customer_interests;
drop policy if exists "customer interests permission delete" on public.customer_interests;
create policy "customer interests permission select" on public.customer_interests for select to authenticated
using (public.has_screen_permission('customers','view') and exists (select 1 from public.customers c where c.id = customer_id));
create policy "customer interests permission insert" on public.customer_interests for insert to authenticated
with check (public.has_screen_permission('customers','edit') and exists (select 1 from public.customers c where c.id = customer_id));
create policy "customer interests permission delete" on public.customer_interests for delete to authenticated
using (public.has_screen_permission('customers','edit') and exists (select 1 from public.customers c where c.id = customer_id));

drop policy if exists "followups permission select" on public.customer_followups;
drop policy if exists "followups permission insert" on public.customer_followups;
drop policy if exists "followups permission update" on public.customer_followups;
drop policy if exists "followups permission delete" on public.customer_followups;
create policy "followups permission select" on public.customer_followups for select to authenticated
using (public.has_screen_permission('followups','view') and public.can_access_representative(representative_id));
create policy "followups permission insert" on public.customer_followups for insert to authenticated
with check (public.has_screen_permission('followups','add') and public.can_access_representative(representative_id));
create policy "followups permission update" on public.customer_followups for update to authenticated
using (public.has_screen_permission('followups','edit') and public.can_access_representative(representative_id))
with check (public.has_screen_permission('followups','edit') and public.can_access_representative(representative_id));
create policy "followups permission delete" on public.customer_followups for delete to authenticated
using (public.has_screen_permission('followups','delete') and public.can_access_representative(representative_id));

drop policy if exists "quotations permission select" on public.quotations;
drop policy if exists "quotations permission insert" on public.quotations;
drop policy if exists "quotations permission update" on public.quotations;
drop policy if exists "quotations permission delete" on public.quotations;
create policy "quotations permission select" on public.quotations for select to authenticated
using (public.has_screen_permission('quotations','view') and public.can_access_representative(representative_id));
create policy "quotations permission insert" on public.quotations for insert to authenticated
with check (public.has_screen_permission('quotations','add') and public.can_access_representative(representative_id));
create policy "quotations permission update" on public.quotations for update to authenticated
using (public.has_screen_permission('quotations','edit') and public.can_access_representative(representative_id))
with check (public.has_screen_permission('quotations','edit') and public.can_access_representative(representative_id));
create policy "quotations permission delete" on public.quotations for delete to authenticated
using (public.has_screen_permission('quotations','delete') and public.can_access_representative(representative_id));

-- Related customer records inherit the same customer ownership scope.
drop policy if exists "customer contacts read scoped" on public.customer_contacts;
drop policy if exists "customer contacts manage scoped" on public.customer_contacts;
drop policy if exists "customer contacts scope select" on public.customer_contacts;
drop policy if exists "customer contacts scope insert" on public.customer_contacts;
drop policy if exists "customer contacts scope update" on public.customer_contacts;
drop policy if exists "customer contacts scope delete" on public.customer_contacts;
create policy "customer contacts scope select" on public.customer_contacts for select to authenticated
using (public.can_access_customer(customer_id));
create policy "customer contacts scope insert" on public.customer_contacts for insert to authenticated
with check (public.has_screen_permission('customers','edit') and public.can_access_customer(customer_id));
create policy "customer contacts scope update" on public.customer_contacts for update to authenticated
using (public.has_screen_permission('customers','edit') and public.can_access_customer(customer_id))
with check (public.has_screen_permission('customers','edit') and public.can_access_customer(customer_id));
create policy "customer contacts scope delete" on public.customer_contacts for delete to authenticated
using (public.has_screen_permission('customers','edit') and public.can_access_customer(customer_id));

drop policy if exists "tasks read assigned" on public.crm_tasks;
drop policy if exists "tasks manage assigned" on public.crm_tasks;
drop policy if exists "tasks scope select" on public.crm_tasks;
drop policy if exists "tasks scope insert" on public.crm_tasks;
drop policy if exists "tasks scope update" on public.crm_tasks;
drop policy if exists "tasks scope delete" on public.crm_tasks;
create policy "tasks scope select" on public.crm_tasks for select to authenticated
using (
  assigned_user_id = auth.uid()
  or public.can_access_representative(assigned_representative_id)
  or (customer_id is not null and public.can_access_customer(customer_id))
);
create policy "tasks scope insert" on public.crm_tasks for insert to authenticated
with check (
  assigned_user_id = auth.uid()
  or public.can_access_representative(assigned_representative_id)
  or (customer_id is not null and public.can_access_customer(customer_id))
);
create policy "tasks scope update" on public.crm_tasks for update to authenticated
using (
  assigned_user_id = auth.uid()
  or public.can_access_representative(assigned_representative_id)
  or (customer_id is not null and public.can_access_customer(customer_id))
)
with check (
  assigned_user_id = auth.uid()
  or public.can_access_representative(assigned_representative_id)
  or (customer_id is not null and public.can_access_customer(customer_id))
);
create policy "tasks scope delete" on public.crm_tasks for delete to authenticated
using (
  assigned_user_id = auth.uid()
  or public.can_access_representative(assigned_representative_id)
  or (customer_id is not null and public.can_access_customer(customer_id))
);

-- Daily operations rows that carry a representative are scoped too.
do $$
begin
  if to_regclass('public.daily_task_completions') is not null then
    execute 'drop policy if exists "daily task completions select" on public.daily_task_completions';
    execute $p$create policy "daily task completions select" on public.daily_task_completions for select to authenticated
      using (public.has_screen_permission('dailyOperations','view') and public.can_access_representative(representative_id))$p$;
  end if;
  if to_regclass('public.daily_alerts') is not null then
    execute 'drop policy if exists "daily alerts read" on public.daily_alerts';
    execute $p$create policy "daily alerts read" on public.daily_alerts for select to authenticated
      using (public.has_screen_permission('dailyOperations','view') and public.can_access_representative(representative_id))$p$;
  end if;
  if to_regclass('public.daily_employee_sessions') is not null then
    execute 'drop policy if exists "daily sessions own read" on public.daily_employee_sessions';
    execute 'drop policy if exists "daily sessions scope read" on public.daily_employee_sessions';
    execute $p$create policy "daily sessions scope read" on public.daily_employee_sessions for select to authenticated
      using (user_id = auth.uid() or public.can_access_representative(representative_id))$p$;
  end if;
end $$;

commit;
