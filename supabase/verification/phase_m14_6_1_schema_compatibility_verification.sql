-- Phase M14.6.1 verification

-- 1) Canonical app_screens columns must exist.
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='app_screens'
  and column_name in ('screen_key','screen_name','group_name','display_order','is_active')
order by ordinal_position;

-- 2) Legacy/wrong columns must not be required.
select column_name
from information_schema.columns
where table_schema='public'
  and table_name in ('app_screens','role_screen_permissions')
  and column_name in ('group_key','sort_order','role_id','can_import');

-- 3) Screen registrations.
select screen_key,screen_name,group_name,display_order,is_active
from public.app_screens
where screen_key in ('installationExceptions','installationReports')
order by display_order;

-- 4) Super Admin permissions.
select role,screen_key,can_view,can_add,can_edit,can_delete,can_export
from public.role_screen_permissions
where role='super_admin'::public.app_role
  and screen_key in ('installationExceptions','installationReports')
order by screen_key;

-- 5) Revisit table and canonical time-slot constraint.
select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='installation_revisits'
order by ordinal_position;

-- 6) RLS policies.
select policyname,cmd,roles
from pg_policies
where schemaname='public' and tablename='installation_revisits'
order by policyname;
