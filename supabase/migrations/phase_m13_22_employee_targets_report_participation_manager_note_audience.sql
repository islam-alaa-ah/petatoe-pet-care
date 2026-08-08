-- KYUM Phase M13.22
-- Employee targets/report participation + manager-note audience controls.

create table if not exists public.daily_employee_report_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  effective_from date not null default current_date,
  include_in_daily_reports boolean not null default true,
  include_in_timeline_report boolean not null default true,
  requires_daily_tasks boolean not null default true,
  requires_targets boolean not null default true,
  customers_target integer not null default 3 check (customers_target between 0 and 9999),
  followups_target integer not null default 10 check (followups_target between 0 and 9999),
  quotations_target integer not null default 3 check (quotations_target between 0 and 9999),
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, effective_from)
);

create index if not exists idx_daily_employee_report_settings_effective
  on public.daily_employee_report_settings(user_id, effective_from desc);

alter table public.daily_employee_report_settings enable row level security;

drop policy if exists "employee report settings read" on public.daily_employee_report_settings;
create policy "employee report settings read"
on public.daily_employee_report_settings for select to authenticated
using (true);

drop policy if exists "employee report settings manage" on public.daily_employee_report_settings;
create policy "employee report settings manage"
on public.daily_employee_report_settings for all to authenticated
using (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
);

grant select,insert,update,delete on public.daily_employee_report_settings to authenticated;

alter table public.daily_manager_notes
  add column if not exists audience_scope text not null default 'all'
    check (audience_scope in ('all','report_participants','selected')),
  add column if not exists recipient_user_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_daily_manager_notes_recipient_users
  on public.daily_manager_notes using gin(recipient_user_ids);

-- Readers see global notes, report-participant notes (filtered in the app by settings),
-- selected-recipient notes, or notes they are authorized to manage.
drop policy if exists "daily notes read" on public.daily_manager_notes;
create policy "daily notes read"
on public.daily_manager_notes for select to authenticated
using (
  audience_scope in ('all','report_participants')
  or auth.uid() = any(recipient_user_ids)
  or public.current_user_role() = 'super_admin'
  or exists (
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
);

analyze public.daily_employee_report_settings;
analyze public.daily_manager_notes;
