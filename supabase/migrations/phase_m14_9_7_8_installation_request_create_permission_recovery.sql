begin;

-- A dedicated create screen must carry its own add permission.
-- Recover operational roles that can already view the screen and add customers,
-- without granting access to roles that cannot see the screen.
update public.role_screen_permissions target
set can_add = true
from public.role_screen_permissions customer_permission
where target.role = customer_permission.role
  and target.screen_key = 'installationRequestNew'
  and target.can_view = true
  and customer_permission.screen_key = 'customers'
  and customer_permission.can_add = true
  and target.can_add is distinct from true;

-- Ensure the standard sales representative role can create installation requests.
insert into public.role_screen_permissions(
  role, screen_key, can_view, can_add, can_edit, can_delete, can_export
) values (
  'sales_representative'::public.app_role,
  'installationRequestNew',
  true, true, false, false, false
)
on conflict(role, screen_key) do update
set can_view = true,
    can_add = true;

commit;
