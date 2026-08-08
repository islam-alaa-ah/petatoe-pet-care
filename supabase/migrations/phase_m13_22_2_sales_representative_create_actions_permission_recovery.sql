begin;

-- Ensure the sales representative role can open and create customers and quotations.
-- Existing edit/delete/export choices are preserved; only view/add are recovered.
insert into public.role_screen_permissions (
  role,
  screen_key,
  can_view,
  can_add,
  can_edit,
  can_delete,
  can_export,
  updated_at
)
values
  ('sales_representative', 'customers', true, true, true, false, false, now()),
  ('sales_representative', 'quotations', true, true, true, true, false, now())
on conflict (role, screen_key) do update
set
  can_view = true,
  can_add = true,
  updated_at = now();

commit;
