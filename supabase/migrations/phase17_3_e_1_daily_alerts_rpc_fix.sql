-- KYUM CRM Phase 17.3-E.1 — Daily Alerts RPC Operational Fix
-- Root Cause:
-- sync_daily_operational_alerts referenced customer_followups.completed,
-- but the production column is customer_followups.is_completed.

begin;

create or replace function public.sync_daily_operational_alerts(
  p_work_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_task record;
  v_targets public.daily_operation_targets%rowtype;
  v_customers integer;
  v_followups integer;
  v_quotations integer;
  v_overdue integer;
  v_created integer := 0;
begin
  select *
  into v_targets
  from public.daily_operation_targets
  where work_date = p_work_date;

  if not found then
    v_targets.work_date := p_work_date;
    v_targets.customers_target := 3;
    v_targets.followups_target := 10;
    v_targets.quotations_target := 3;
  end if;

  for v_user in
    select up.id, up.full_name, up.representative_id
    from public.user_profiles up
    where up.is_active = true
      and up.role in (
        'sales_representative',
        'sales_supervisor',
        'sales_manager'
      )
  loop
    for v_task in
      select d.task_key, d.task_name
      from public.daily_task_definitions d
      where d.is_active = true
        and not exists (
          select 1
          from public.daily_task_completions c
          where c.task_key = d.task_key
            and c.work_date = p_work_date
            and c.user_id = v_user.id
            and c.is_completed = true
        )
    loop
      insert into public.daily_alerts (
        work_date,
        alert_type,
        severity,
        status,
        title,
        details,
        user_id,
        representative_id,
        source_key
      )
      values (
        p_work_date,
        'task_missing',
        case
          when v_task.task_key = 'ads_update' then 'critical'
          else 'important'
        end,
        'open',
        'مهمة يومية غير منفذة',
        'لم يتم تنفيذ: ' || v_task.task_name,
        v_user.id,
        v_user.representative_id,
        'task:' || v_task.task_key
      )
      on conflict (work_date, source_key, user_id) do nothing;

      if found then
        v_created := v_created + 1;
      end if;
    end loop;

    select count(*)
    into v_customers
    from public.customers c
    where c.representative_id = v_user.representative_id
      and c.created_at::date = p_work_date;

    select count(*)
    into v_followups
    from public.customer_followups f
    where f.representative_id = v_user.representative_id
      and f.created_at::date = p_work_date;

    select count(*)
    into v_quotations
    from public.quotations q
    where q.representative_id = v_user.representative_id
      and q.created_at::date = p_work_date;

    select count(*)
    into v_overdue
    from public.customer_followups f
    where f.representative_id = v_user.representative_id
      and f.next_followup_date < p_work_date
      and coalesce(f.is_completed, false) = false;

    if v_customers < v_targets.customers_target then
      insert into public.daily_alerts (
        work_date,
        alert_type,
        severity,
        status,
        title,
        details,
        user_id,
        representative_id,
        source_key
      )
      values (
        p_work_date,
        'target_missed',
        'important',
        'open',
        'هدف العملاء الجدد غير محقق',
        format(
          'المنفذ %s من %s',
          v_customers,
          v_targets.customers_target
        ),
        v_user.id,
        v_user.representative_id,
        'target:customers'
      )
      on conflict (work_date, source_key, user_id) do nothing;
    end if;

    if v_followups < v_targets.followups_target then
      insert into public.daily_alerts (
        work_date,
        alert_type,
        severity,
        status,
        title,
        details,
        user_id,
        representative_id,
        source_key
      )
      values (
        p_work_date,
        'target_missed',
        'important',
        'open',
        'هدف المتابعات غير محقق',
        format(
          'المنفذ %s من %s',
          v_followups,
          v_targets.followups_target
        ),
        v_user.id,
        v_user.representative_id,
        'target:followups'
      )
      on conflict (work_date, source_key, user_id) do nothing;
    end if;

    if v_quotations < v_targets.quotations_target then
      insert into public.daily_alerts (
        work_date,
        alert_type,
        severity,
        status,
        title,
        details,
        user_id,
        representative_id,
        source_key
      )
      values (
        p_work_date,
        'target_missed',
        'important',
        'open',
        'هدف عروض الأسعار غير محقق',
        format(
          'المنفذ %s من %s',
          v_quotations,
          v_targets.quotations_target
        ),
        v_user.id,
        v_user.representative_id,
        'target:quotations'
      )
      on conflict (work_date, source_key, user_id) do nothing;
    end if;

    if v_overdue > 0 then
      insert into public.daily_alerts (
        work_date,
        alert_type,
        severity,
        status,
        title,
        details,
        user_id,
        representative_id,
        source_key
      )
      values (
        p_work_date,
        'overdue_followups',
        'critical',
        'open',
        'متابعات متأخرة',
        format('يوجد %s متابعة متأخرة', v_overdue),
        v_user.id,
        v_user.representative_id,
        'overdue:followups'
      )
      on conflict (work_date, source_key, user_id) do update
      set
        details = excluded.details,
        severity = excluded.severity,
        updated_at = now();
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'created', v_created,
    'work_date', p_work_date
  );
end;
$$;

revoke all on function
  public.sync_daily_operational_alerts(date)
from public;

revoke all on function
  public.sync_daily_operational_alerts(date)
from anon;

grant execute on function
  public.sync_daily_operational_alerts(date)
to authenticated;

grant execute on function
  public.sync_daily_operational_alerts(date)
to service_role;

comment on function public.sync_daily_operational_alerts(date)
is
  'Synchronizes daily operational alerts. Phase 17.3-E.1 fixes customer_followups.is_completed reference.';

commit;

notify pgrst, 'reload schema';

-- Immediate verification.
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  position(
    'f.is_completed' in pg_get_functiondef(p.oid)
  ) > 0 as uses_is_completed,
  position(
    'f.completed' in pg_get_functiondef(p.oid)
  ) = 0 as legacy_column_removed,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    p.oid,
    'EXECUTE'
  ) as service_role_can_execute,
  case
    when p.prosecdef is true
      and position(
        'f.is_completed' in pg_get_functiondef(p.oid)
      ) > 0
      and position(
        'f.completed' in pg_get_functiondef(p.oid)
      ) = 0
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        p.oid,
        'EXECUTE'
      )
    then 'PASS'
    else 'REVIEW_REQUIRED'
  end as overall_result
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'sync_daily_operational_alerts';
