-- KYUM Phase 15.1 — Reports Hub screen registration
-- Run once in the Kyum Trading Company Supabase SQL Editor.

begin;

insert into public.app_screens (
  screen_key,
  screen_name,
  group_name,
  display_order,
  is_active
)
values (
  'reportsOverview',
  'مركز التقارير',
  'التقارير والتحليلات',
  65,
  true
)
on conflict (screen_key) do update
set
  screen_name = excluded.screen_name,
  group_name = excluded.group_name,
  display_order = excluded.display_order,
  is_active = true;

insert into public.role_screen_permissions (
  role,
  screen_key,
  can_view,
  can_add,
  can_edit,
  can_delete,
  can_export
)
values
  ('super_admin','reportsOverview',true,false,false,false,true),
  ('sales_manager','reportsOverview',true,false,false,false,true),
  ('sales_supervisor','reportsOverview',true,false,false,false,true),
  ('sales_representative','reportsOverview',true,false,false,false,false),
  ('customer_service','reportsOverview',true,false,false,false,false),
  ('viewer','reportsOverview',true,false,false,false,true)
on conflict (role,screen_key) do update
set
  can_view = excluded.can_view,
  can_add = excluded.can_add,
  can_edit = excluded.can_edit,
  can_delete = excluded.can_delete,
  can_export = excluded.can_export;

commit;

notify pgrst, 'reload schema';
