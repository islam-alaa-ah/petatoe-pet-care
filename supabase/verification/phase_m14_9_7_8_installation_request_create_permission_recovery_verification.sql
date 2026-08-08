-- Sales representative must be able to open and create from the dedicated screen.
select role, screen_key, can_view, can_add
from public.role_screen_permissions
where role = 'sales_representative'::public.app_role
  and screen_key = 'installationRequestNew';

-- Any role that can add customers and view the new request screen should not have add=false.
-- Expected result: 0 rows.
select target.role, target.can_view, target.can_add
from public.role_screen_permissions target
join public.role_screen_permissions customer_permission
  on customer_permission.role = target.role
 and customer_permission.screen_key = 'customers'
where target.screen_key = 'installationRequestNew'
  and target.can_view = true
  and customer_permission.can_add = true
  and coalesce(target.can_add, false) = false;
