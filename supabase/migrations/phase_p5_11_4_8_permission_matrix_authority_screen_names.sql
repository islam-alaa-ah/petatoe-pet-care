-- PETATOE P5.11.4.8 — Permission Matrix Authority & Screen Names
begin;

-- Keep stable screen_key values; update only user-facing metadata.
update public.app_screens set screen_name='عقود العملاء' where screen_key='quotations';
update public.app_screens set screen_name='لوحة المواعيد', group_name='إدارة المواعيد' where screen_key='installationsOverview';
update public.app_screens set screen_name='إضافة موعد جديد', group_name='إدارة المواعيد' where screen_key='installationRequestNew';
update public.app_screens set screen_name='المواعيد', group_name='إدارة المواعيد' where screen_key='installationRequests';
update public.app_screens set screen_name='جدولة وتوزيع المواعيد', group_name='إدارة المواعيد' where screen_key='installationSchedule';
update public.app_screens set screen_name='تنفيذ المواعيد', group_name='إدارة المواعيد' where screen_key='installationExecution';
update public.app_screens set screen_name='تأكيد انتهاء المواعيد', group_name='إدارة المواعيد' where screen_key='installationCompletion';
update public.app_screens set group_name='إدارة المواعيد' where screen_key='installationExceptions';
update public.app_screens set screen_name='تقارير المواعيد', group_name='إدارة المواعيد' where screen_key='installationReports';
update public.app_screens set screen_name='إعدادات المواعيد', group_name='إدارة المواعيد' where screen_key='installationSettings';
update public.app_screens set screen_name='مراجعة عقود العملاء المفتوحة' where screen_key='dailyReviewQuotations';

-- Users screen permission must also authorize its data-scope editor dependencies.
drop policy if exists "data access profiles own or admin read" on public.user_data_access_profiles;
create policy "data access profiles own or users read"
on public.user_data_access_profiles for select to authenticated
using (user_id = auth.uid() or public.has_screen_permission('users','view'));

drop policy if exists "data access profiles admin manage" on public.user_data_access_profiles;
create policy "data access profiles users manage"
on public.user_data_access_profiles for all to authenticated
using (public.has_screen_permission('users','edit'))
with check (public.has_screen_permission('users','edit'));

drop policy if exists "data access reps own or admin read" on public.user_data_access_representatives;
create policy "data access reps own or users read"
on public.user_data_access_representatives for select to authenticated
using (user_id = auth.uid() or public.has_screen_permission('users','view'));

drop policy if exists "data access reps admin manage" on public.user_data_access_representatives;
create policy "data access reps users manage"
on public.user_data_access_representatives for all to authenticated
using (public.has_screen_permission('users','edit'))
with check (public.has_screen_permission('users','edit'));

-- System Health is a normal permission-matrix screen; keep the security-definer RPC
-- but authorize the authenticated caller through the canonical matrix helper.
create or replace function public.get_system_health_snapshot()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
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
  if not public.has_screen_permission('systemHealth','view') then
    raise exception 'Missing systemHealth.view permission';
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
    'version','1.0.15',
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
revoke all on function public.get_system_health_snapshot() from anon;
grant execute on function public.get_system_health_snapshot() to authenticated;

commit;
notify pgrst,'reload schema';
