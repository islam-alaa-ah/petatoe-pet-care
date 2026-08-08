-- Phase M14.1 — Installations Module Foundation
begin;

insert into public.app_screens (
  screen_key,
  screen_name,
  group_name,
  display_order,
  is_active
) values (
  'installationsOverview',
  'لوحة التركيبات',
  'إدارة التركيبات',
  65,
  true
)
on conflict (screen_key) do update set
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
values (
  'super_admin'::public.app_role,
  'installationsOverview',
  true,
  true,
  true,
  true,
  true
)
on conflict (role, screen_key) do update set
  can_view = excluded.can_view,
  can_add = excluded.can_add,
  can_edit = excluded.can_edit,
  can_delete = excluded.can_delete,
  can_export = excluded.can_export,
  updated_at = now();

commit;
