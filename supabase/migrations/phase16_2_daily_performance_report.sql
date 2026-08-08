-- KYUM Phase 16.2 — Daily Performance Report
-- Run once in Supabase SQL Editor.

begin;

insert into public.app_screens(
  screen_key,
  screen_name,
  group_name,
  display_order,
  is_active
)
values(
  'dailyPerformanceReport',
  'تقرير الأداء اليومي',
  'التقارير والتحليلات',
  66,
  true
)
on conflict(screen_key) do update set
  screen_name = excluded.screen_name,
  group_name = excluded.group_name,
  display_order = excluded.display_order,
  is_active = true;

insert into public.role_screen_permissions(
  role,
  screen_key,
  can_view,
  can_add,
  can_edit,
  can_delete,
  can_export
)
values
  ('super_admin','dailyPerformanceReport',true,false,false,false,true),
  ('sales_manager','dailyPerformanceReport',true,false,false,false,true),
  ('sales_supervisor','dailyPerformanceReport',true,false,false,false,true),
  ('sales_representative','dailyPerformanceReport',false,false,false,false,false),
  ('customer_service','dailyPerformanceReport',false,false,false,false,false),
  ('viewer','dailyPerformanceReport',true,false,false,false,true)
on conflict(role,screen_key) do update set
  can_view = excluded.can_view,
  can_add = excluded.can_add,
  can_edit = excluded.can_edit,
  can_delete = excluded.can_delete,
  can_export = excluded.can_export;

commit;

notify pgrst, 'reload schema';
