-- Expected: exactly two rows, both can_view=true and can_add=true.
select role, screen_key, can_view, can_add, can_edit, can_delete, can_export
from public.role_screen_permissions
where role = 'sales_representative'
  and screen_key in ('customers', 'quotations')
order by screen_key;

-- Expected: two INSERT policies using has_screen_permission(..., 'add').
select tablename, policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('customers', 'quotations')
  and cmd = 'INSERT'
order by tablename, policyname;
