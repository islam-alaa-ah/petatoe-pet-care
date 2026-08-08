-- Phase M10 verification — run after the migration.

select to_regclass('public.user_data_access_profiles') as access_profiles_table,
       to_regclass('public.user_data_access_representatives') as access_representatives_table;

select p.id, p.full_name, p.role, p.representative_id,
       coalesce(a.access_mode, 'missing') as access_mode,
       count(ar.representative_id) as selected_representatives
from public.user_profiles p
left join public.user_data_access_profiles a on a.user_id = p.id
left join public.user_data_access_representatives ar on ar.user_id = p.id
group by p.id, p.full_name, p.role, p.representative_id, a.access_mode
order by p.full_name;

select role, count(*) as permission_rows,
       count(*) filter (where can_view) as view_rows,
       count(*) filter (where can_add) as add_rows,
       count(*) filter (where can_edit) as edit_rows,
       count(*) filter (where can_delete) as delete_rows,
       count(*) filter (where can_export) as export_rows
from public.role_screen_permissions
group by role
order by role;

select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customers','customer_interests','customer_followups','quotations',
    'customer_contacts','crm_tasks','daily_task_completions','daily_alerts','daily_employee_sessions',
    'user_data_access_profiles','user_data_access_representatives'
  )
order by tablename, policyname;
