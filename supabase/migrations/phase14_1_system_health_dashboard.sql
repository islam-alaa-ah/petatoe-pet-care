-- KYUM Phase 14.1 — System Health Dashboard
begin;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('systemHealth','مراقبة النظام','الإعدادات والخصوصية',105,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin','systemHealth',true,false,false,false,true)
on conflict(role,screen_key) do update set can_view=true,can_export=true;

create or replace function public.get_system_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_tables jsonb;
  v_recent_backups jsonb;
  v_alerts jsonb;
  v_public_tables integer;
  v_rls_tables integer;
  v_policy_count integer;
  v_database_size bigint;
  v_rows_total bigint;
  v_indexes integer;
begin
  select role into v_role from public.user_profiles where id=v_actor and is_active=true;
  if v_role is distinct from 'super_admin'::public.app_role then
    raise exception 'Super Admin only';
  end if;

  select count(*)::int into v_public_tables from pg_tables where schemaname='public';
  select count(*)::int into v_rls_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;
  select count(*)::int into v_policy_count from pg_policies where schemaname='public';
  select pg_database_size(current_database()) into v_database_size;
  select count(*)::int into v_indexes from pg_indexes where schemaname='public';

  select coalesce(sum(c.reltuples)::bigint,0) into v_rows_total
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r';

  select coalesce(jsonb_agg(to_jsonb(x) order by x.total_bytes desc),'[]'::jsonb)
  into v_tables
  from (
    select c.relname as table_name,
           greatest(c.reltuples::bigint,0) as row_count,
           pg_total_relation_size(c.oid) as total_bytes,
           c.relrowsecurity as rls_enabled,
           (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies_count
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
    order by pg_total_relation_size(c.oid) desc
    limit 20
  ) x;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]'::jsonb)
  into v_recent_backups
  from (
    select operation_type,file_name,total_records,status,created_at
    from public.backup_operations order by created_at desc limit 5
  ) b;

  select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)
  into v_alerts
  from (
    select 'فشل عملية نسخ أو استعادة'::text as title,
           'critical'::text as severity,
           coalesce(file_name,'بدون اسم') || ' — ' || created_at::text as detail
    from public.backup_operations
    where status='failed' and created_at >= now()-interval '24 hours'
    order by created_at desc limit 5
  ) a;

  return jsonb_build_object(
    'database_online',true,
    'server_time',now(),
    'version','1.0.14',
    'tables_count',v_public_tables,
    'rows_total',v_rows_total,
    'database_size_bytes',v_database_size,
    'indexes_count',v_indexes,
    'users_total',(select count(*) from public.user_profiles),
    'users_active',(select count(*) from public.user_profiles where is_active=true),
    'inactive_users',(select count(*) from public.user_profiles where is_active=false),
    'super_admins',(select count(*) from public.user_profiles where role='super_admin' and is_active=true),
    'failed_backups_24h',(select count(*) from public.backup_operations where status='failed' and created_at>=now()-interval '24 hours'),
    'security',jsonb_build_object(
      'public_tables',v_public_tables,
      'rls_enabled_tables',v_rls_tables,
      'rls_coverage_percent',case when v_public_tables=0 then 100 else round((v_rls_tables::numeric/v_public_tables::numeric)*100) end,
      'policies_count',v_policy_count
    ),
    'tables',v_tables,
    'recent_backups',v_recent_backups,
    'alerts',v_alerts
  );
end;
$function$;

revoke all on function public.get_system_health_snapshot() from public;
grant execute on function public.get_system_health_snapshot() to authenticated;

commit;
notify pgrst,'reload schema';
