-- KYUM Phase 16.3 — Expanded Daily Checklist & Targets
-- Run once in Supabase SQL Editor.

begin;

alter table public.daily_task_definitions
  add column if not exists permission_key text;

update public.daily_task_definitions
set permission_key = 'dailyAdsUpdate'
where task_key = 'ads_update'
  and permission_key is null;

insert into public.daily_task_definitions(
  task_key, task_name, description, display_order, permission_key, is_active
)
values
  ('review_messages','مراجعة الرسائل','مراجعة الرسائل الواردة والرد على ما يحتاج إجراءً.',20,'dailyReviewMessages',true),
  ('review_overdue_followups','مراجعة المتابعات المتأخرة','مراجعة العملاء ذوي المواعيد المتأخرة واتخاذ إجراء.',30,'dailyReviewOverdue',true),
  ('review_open_quotations','مراجعة عروض الأسعار المفتوحة','مراجعة العروض المفتوحة والمعلقة قبل نهاية اليوم.',40,'dailyReviewQuotations',true),
  ('review_new_customers','مراجعة العملاء الجدد','مراجعة بيانات العملاء المضافين خلال اليوم والتأكد من اكتمالها.',50,'dailyReviewNewCustomers',true)
on conflict(task_key) do update set
  task_name = excluded.task_name,
  description = excluded.description,
  display_order = excluded.display_order,
  permission_key = excluded.permission_key,
  is_active = true;

create table if not exists public.daily_operation_targets(
  work_date date primary key,
  customers_target integer not null default 3 check(customers_target >= 0),
  followups_target integer not null default 10 check(followups_target >= 0),
  quotations_target integer not null default 3 check(quotations_target >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_manager_notes(
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  title text not null,
  note_text text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values
  ('dailyReviewMessages','مراجعة الرسائل اليومية','صلاحيات المهام اليومية',7,true),
  ('dailyReviewOverdue','مراجعة المتابعات المتأخرة','صلاحيات المهام اليومية',8,true),
  ('dailyReviewQuotations','مراجعة عروض الأسعار المفتوحة','صلاحيات المهام اليومية',9,true),
  ('dailyReviewNewCustomers','مراجعة العملاء الجدد','صلاحيات المهام اليومية',10,true),
  ('dailyOperationsSettings','إدارة أهداف وملاحظات التشغيل اليومي','صلاحيات المهام اليومية',11,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export
)
select
  'super_admin'::public.app_role,
  screen_key,true,true,true,true,true
from public.app_screens
where screen_key in(
  'dailyReviewMessages',
  'dailyReviewOverdue',
  'dailyReviewQuotations',
  'dailyReviewNewCustomers',
  'dailyOperationsSettings'
)
on conflict(role,screen_key) do update set
  can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true;

insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export
)
values
  ('sales_manager','dailyReviewMessages',true,false,true,false,false),
  ('sales_manager','dailyReviewOverdue',true,false,true,false,false),
  ('sales_manager','dailyReviewQuotations',true,false,true,false,false),
  ('sales_manager','dailyReviewNewCustomers',true,false,true,false,false),
  ('sales_manager','dailyOperationsSettings',true,true,true,false,true),
  ('sales_supervisor','dailyReviewMessages',true,false,true,false,false),
  ('sales_supervisor','dailyReviewOverdue',true,false,true,false,false),
  ('sales_supervisor','dailyReviewQuotations',true,false,true,false,false),
  ('sales_supervisor','dailyReviewNewCustomers',true,false,true,false,false),
  ('sales_supervisor','dailyOperationsSettings',true,false,false,false,false),
  ('sales_representative','dailyReviewMessages',true,false,true,false,false),
  ('sales_representative','dailyReviewOverdue',true,false,true,false,false),
  ('sales_representative','dailyReviewQuotations',true,false,true,false,false),
  ('sales_representative','dailyReviewNewCustomers',true,false,true,false,false),
  ('sales_representative','dailyOperationsSettings',true,false,false,false,false)
on conflict(role,screen_key) do nothing;

alter table public.daily_operation_targets enable row level security;
alter table public.daily_manager_notes enable row level security;

drop policy if exists "daily targets read" on public.daily_operation_targets;
create policy "daily targets read"
on public.daily_operation_targets for select to authenticated
using(true);

drop policy if exists "daily targets manage" on public.daily_operation_targets;
create policy "daily targets manage"
on public.daily_operation_targets for all to authenticated
using(
  public.current_user_role() = 'super_admin'
  or exists(
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
)
with check(
  public.current_user_role() = 'super_admin'
  or exists(
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
);

drop policy if exists "daily notes read" on public.daily_manager_notes;
create policy "daily notes read"
on public.daily_manager_notes for select to authenticated
using(true);

drop policy if exists "daily notes manage" on public.daily_manager_notes;
create policy "daily notes manage"
on public.daily_manager_notes for all to authenticated
using(
  public.current_user_role() = 'super_admin'
  or exists(
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
)
with check(
  public.current_user_role() = 'super_admin'
  or exists(
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyOperationsSettings'
      and p.can_edit = true
  )
);

drop policy if exists "daily task completions insert" on public.daily_task_completions;
create policy "daily task completions insert"
on public.daily_task_completions for insert to authenticated
with check(
  user_id = auth.uid()
  and exists(
    select 1
    from public.daily_task_definitions d
    join public.role_screen_permissions p
      on p.screen_key = d.permission_key
     and p.role = public.current_user_role()
    where d.task_key = daily_task_completions.task_key
      and d.is_active = true
      and p.can_edit = true
  )
);

drop policy if exists "daily task completions update" on public.daily_task_completions;
create policy "daily task completions update"
on public.daily_task_completions for update to authenticated
using(
  user_id = auth.uid()
  and exists(
    select 1
    from public.daily_task_definitions d
    join public.role_screen_permissions p
      on p.screen_key = d.permission_key
     and p.role = public.current_user_role()
    where d.task_key = daily_task_completions.task_key
      and d.is_active = true
      and p.can_edit = true
  )
)
with check(
  user_id = auth.uid()
  and exists(
    select 1
    from public.daily_task_definitions d
    join public.role_screen_permissions p
      on p.screen_key = d.permission_key
     and p.role = public.current_user_role()
    where d.task_key = daily_task_completions.task_key
      and d.is_active = true
      and p.can_edit = true
  )
);

grant select on public.daily_operation_targets to authenticated;
grant select,insert,update on public.daily_operation_targets to authenticated;
grant select on public.daily_manager_notes to authenticated;
grant select,insert,update on public.daily_manager_notes to authenticated;

commit;
notify pgrst, 'reload schema';
