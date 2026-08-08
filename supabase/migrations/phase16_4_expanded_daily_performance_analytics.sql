-- KYUM Phase 16.4 — Expanded Daily Performance Analytics
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
  'dailyPerformanceAnalytics',
  'تحليلات الأداء اليومي الموسعة',
  'التقارير والتحليلات',
  67,
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
  ('super_admin','dailyPerformanceAnalytics',true,false,false,false,true),
  ('sales_manager','dailyPerformanceAnalytics',true,false,false,false,true),
  ('sales_supervisor','dailyPerformanceAnalytics',true,false,false,false,true),
  ('viewer','dailyPerformanceAnalytics',true,false,false,false,true)
on conflict(role,screen_key) do update set
  can_view = excluded.can_view,
  can_export = excluded.can_export;

commit;

notify pgrst, 'reload schema';
