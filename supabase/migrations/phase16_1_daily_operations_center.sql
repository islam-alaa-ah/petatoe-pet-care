-- KYUM Phase 16.1 — Daily Operations Center Foundation
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.daily_task_definitions (
  task_key text primary key,
  task_name text not null,
  description text,
  display_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.daily_task_definitions(task_key, task_name, description, display_order)
values ('ads_update', 'تحديث الإعلانات', 'تأكيد تحديث الإعلانات اليومية', 10)
on conflict(task_key) do update set
  task_name = excluded.task_name,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = true;

create table if not exists public.daily_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_key text not null references public.daily_task_definitions(task_key) on delete restrict,
  work_date date not null default current_date,
  user_id uuid not null references auth.users(id) on delete cascade,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_key, work_date, user_id)
);

create index if not exists idx_daily_task_completions_date
  on public.daily_task_completions(work_date desc);
create index if not exists idx_daily_task_completions_user
  on public.daily_task_completions(user_id, work_date desc);
create index if not exists idx_daily_task_completions_representative
  on public.daily_task_completions(representative_id, work_date desc);

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active) values
('dailyOperations','إدارة المهام اليومية','الرئيسية',5,true),
('dailyAdsUpdate','تحديث الإعلانات اليومي','صلاحيات المهام اليومية',6,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role, screen_key, true, true, true, true, true
from public.app_screens where screen_key in ('dailyOperations','dailyAdsUpdate')
on conflict(role,screen_key) do update set
  can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export) values
('sales_manager','dailyOperations',true,false,false,false,true),
('sales_manager','dailyAdsUpdate',true,false,true,false,true),
('sales_supervisor','dailyOperations',true,false,false,false,true),
('sales_supervisor','dailyAdsUpdate',true,false,true,false,true),
('sales_representative','dailyOperations',true,false,false,false,false),
('sales_representative','dailyAdsUpdate',true,false,false,false,false)
on conflict(role,screen_key) do nothing;

alter table public.daily_task_definitions enable row level security;
alter table public.daily_task_completions enable row level security;

drop policy if exists "authenticated read daily task definitions" on public.daily_task_definitions;
create policy "authenticated read daily task definitions"
on public.daily_task_definitions for select to authenticated using(is_active = true);

drop policy if exists "super admin manage daily task definitions" on public.daily_task_definitions;
create policy "super admin manage daily task definitions"
on public.daily_task_definitions for all to authenticated
using(public.current_user_role() = 'super_admin')
with check(public.current_user_role() = 'super_admin');

drop policy if exists "daily task completions select" on public.daily_task_completions;
create policy "daily task completions select"
on public.daily_task_completions for select to authenticated
using(
  user_id = auth.uid()
  or public.current_user_role() in ('super_admin','sales_manager','sales_supervisor')
);

drop policy if exists "daily task completions insert" on public.daily_task_completions;
create policy "daily task completions insert"
on public.daily_task_completions for insert to authenticated
with check(
  user_id = auth.uid()
  and (
    public.current_user_role() = 'super_admin'
    or exists (
      select 1 from public.role_screen_permissions p
      where p.role = public.current_user_role()
        and p.screen_key = 'dailyAdsUpdate'
        and p.can_edit = true
    )
  )
);

drop policy if exists "daily task completions update" on public.daily_task_completions;
create policy "daily task completions update"
on public.daily_task_completions for update to authenticated
using(
  user_id = auth.uid()
  and (
    public.current_user_role() = 'super_admin'
    or exists (
      select 1 from public.role_screen_permissions p
      where p.role = public.current_user_role()
        and p.screen_key = 'dailyAdsUpdate'
        and p.can_edit = true
    )
  )
)
with check(
  user_id = auth.uid()
  and (
    public.current_user_role() = 'super_admin'
    or exists (
      select 1 from public.role_screen_permissions p
      where p.role = public.current_user_role()
        and p.screen_key = 'dailyAdsUpdate'
        and p.can_edit = true
    )
  )
);

grant select on public.daily_task_definitions to authenticated;
grant select,insert,update on public.daily_task_completions to authenticated;

commit;
notify pgrst, 'reload schema';
