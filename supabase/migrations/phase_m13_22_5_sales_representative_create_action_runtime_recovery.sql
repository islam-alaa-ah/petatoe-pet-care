begin;

insert into public.role_screen_permissions
  (role, screen_key, can_view, can_add, can_edit, can_delete, can_export, updated_at)
values
  ('sales_representative','customers', true, true, true, false, false, now()),
  ('sales_representative','quotations', true, true, true, false, false, now())
on conflict (role, screen_key) do update set
  can_view = true,
  can_add = true,
  updated_at = now();

commit;

select role, screen_key, can_view, can_add
from public.role_screen_permissions
where role='sales_representative'
  and screen_key in ('customers','quotations')
order by screen_key;
