select screen_key,screen_name,group_name,display_order,is_active
from public.app_screens where screen_key='installationRequestNew';

select role,screen_key,can_view,can_add,can_edit,can_delete,can_export
from public.role_screen_permissions where screen_key='installationRequestNew';

select is_nullable
from information_schema.columns
where table_schema='public' and table_name='installation_requests' and column_name='quotation_id';
