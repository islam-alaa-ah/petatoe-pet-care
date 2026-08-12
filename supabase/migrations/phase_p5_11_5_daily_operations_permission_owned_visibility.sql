-- PETATOE P5.11.5 — Daily Operations Permission-Owned Visibility
-- Keep representative_id as business metadata, but remove it as a visibility gate
-- inside Daily Operations / Daily Performance / Daily Alerts / Daily Suggestions.

begin;

-- ------------------------------------------------------------
-- 1) Permission-owned read policies for daily operational data.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.daily_task_completions') is not null then
    execute 'drop policy if exists "daily task completions select" on public.daily_task_completions';
    execute $p$
      create policy "daily task completions select"
      on public.daily_task_completions for select to authenticated
      using (
        public.has_screen_permission('dailyOperations','view')
        or public.has_screen_permission('dailyPerformanceReport','view')
      )
    $p$;
  end if;

  if to_regclass('public.daily_alerts') is not null then
    execute 'drop policy if exists "daily alerts read" on public.daily_alerts';
    execute $p$
      create policy "daily alerts read"
      on public.daily_alerts for select to authenticated
      using (
        public.has_screen_permission('dailyOperations','view')
        or public.has_screen_permission('dailyAlertsManagement','view')
        or public.has_screen_permission('dailyPerformanceReport','view')
      )
    $p$;
  end if;

  if to_regclass('public.daily_employee_sessions') is not null then
    execute 'drop policy if exists "daily sessions own read" on public.daily_employee_sessions';
    execute 'drop policy if exists "daily sessions scope read" on public.daily_employee_sessions';
    execute $p$
      create policy "daily sessions permission read"
      on public.daily_employee_sessions for select to authenticated
      using (
        user_id = auth.uid()
        or public.has_screen_permission('dailyOperations','view')
        or public.has_screen_permission('dailyPerformanceReport','view')
      )
    $p$;
  end if;
end $$;

-- Daily performance includes the daily activity timeline. Allow the report
-- permission to read audit rows without granting any write capability.
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    execute 'drop policy if exists "audit logs permission select" on public.audit_logs';
    execute $p$
      create policy "audit logs permission select"
      on public.audit_logs for select to authenticated
      using (
        public.has_screen_permission('activityLog','view')
        or public.has_screen_permission('dailyPerformanceReport','view')
      )
    $p$;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) Security-definer daily CRM snapshot.
-- Core CRM RLS remains unchanged; this RPC is the dedicated permission-owned
-- read path for Daily Operations / Daily Performance only.
-- ------------------------------------------------------------
create or replace function public.get_daily_permission_owned_crm_snapshot(
  p_work_date date default ((now() at time zone 'Asia/Riyadh')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customers jsonb := '[]'::jsonb;
  v_followups jsonb := '[]'::jsonb;
  v_quotations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user is required';
  end if;

  if not (
    public.has_screen_permission('dailyOperations','view')
    or public.has_screen_permission('dailyPerformanceReport','view')
  ) then
    raise exception 'Permission denied: daily data view';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at_sort desc), '[]'::jsonb)
  into v_customers
  from (
    select
      c.created_at as created_at_sort,
      jsonb_build_object(
        'id', c.id,
        'customerNumber', c.customer_number,
        'code', c.customer_number,
        'name', c.customer_name,
        'address', c.address,
        'phone', c.phone,
        'mobile', c.phone,
        'createdBy', c.created_by,
        'createdAt', c.created_at,
        'updatedAt', c.updated_at
      ) as row_data
    from public.customers c
    where (c.created_at at time zone 'Asia/Riyadh')::date = p_work_date
  ) x;

  select coalesce(jsonb_agg(row_data order by contact_date_sort desc, created_at_sort desc), '[]'::jsonb)
  into v_followups
  from (
    select
      f.contact_date as contact_date_sort,
      f.created_at as created_at_sort,
      jsonb_build_object(
        'id', f.id,
        'customerId', f.customer_id,
        'customerName', c.customer_name,
        'customerPhone', c.phone,
        'contactDate', f.contact_date,
        'method', f.contact_method,
        'representative', sr.full_name,
        'representativeId', f.representative_id,
        'result', f.contact_result,
        'quotationNumber', f.quotation_number,
        'nextFollowupDate', f.next_followup_date,
        'completed', coalesce(f.is_completed,false),
        'notes', f.notes,
        'createdBy', f.created_by,
        'createdAt', f.created_at,
        'updatedAt', f.updated_at
      ) as row_data
    from public.customer_followups f
    join public.customers c on c.id = f.customer_id
    left join public.sales_representatives sr on sr.id = f.representative_id
    where f.contact_date = p_work_date
       or (
         f.next_followup_date < p_work_date
         and coalesce(f.is_completed,false) = false
       )
  ) x;

  select coalesce(jsonb_agg(row_data order by quotation_date_sort desc, created_at_sort desc), '[]'::jsonb)
  into v_quotations
  from (
    select
      q.quotation_date as quotation_date_sort,
      q.created_at as created_at_sort,
      jsonb_build_object(
        'id', q.id,
        'code', q.quotation_number,
        'customerId', q.customer_id,
        'customerName', c.customer_name,
        'customerPhone', c.phone,
        'representative', sr.full_name,
        'representativeId', q.representative_id,
        'quotationDate', q.quotation_date,
        'amount', q.amount,
        'status', q.status,
        'createdBy', q.created_by,
        'createdAt', q.created_at,
        'updatedAt', q.updated_at
      ) as row_data
    from public.quotations q
    join public.customers c on c.id = q.customer_id
    left join public.sales_representatives sr on sr.id = q.representative_id
    where q.quotation_date = p_work_date
  ) x;

  return jsonb_build_object(
    'workDate', p_work_date,
    'customers', v_customers,
    'followups', v_followups,
    'quotations', v_quotations
  );
end;
$$;

revoke all on function public.get_daily_permission_owned_crm_snapshot(date) from public, anon;
grant execute on function public.get_daily_permission_owned_crm_snapshot(date) to authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Daily suggestions no longer require the current user account to be
-- linked to a representative. The single business representative remains
-- metadata on the source CRM rows.
-- ------------------------------------------------------------
create or replace function public.replenish_daily_customer_suggestions(
  p_user_id uuid,
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_type text;
  v_missing integer;
  v_next_sequence integer;
  v_inserted integer := 0;
  v_rows integer;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  if v_actor_id is null then raise exception 'Authenticated user is required'; end if;

  if not exists(
    select 1 from public.user_profiles up
    where up.id = p_user_id and coalesce(up.is_active,true)
  ) then
    raise exception 'Target user was not found or is inactive';
  end if;

  if v_actor_id is distinct from p_user_id then
    raise exception 'Suggestions may only be generated for the current user';
  end if;

  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  foreach v_type in array array['شركة'::text, 'فردي'::text]
  loop
    select greatest(10 - count(*), 0)::integer
    into v_missing
    from public.daily_customer_suggestions s
    join public.customers current_customer on current_customer.id = s.customer_id
    where s.user_id = p_user_id
      and s.suggestion_date = p_suggestion_date
      and s.customer_type = v_type
      and s.status = 'active';

    if v_missing = 0 then continue; end if;

    select coalesce(max(s.sequence_no), 0) + 1
    into v_next_sequence
    from public.daily_customer_suggestions s
    where s.user_id = p_user_id
      and s.suggestion_date = p_suggestion_date
      and s.customer_type = v_type;

    with eligible as (
      select
        c.id,
        row_number() over (
          order by
            case when c.last_contact_date is null then 0 else 1 end,
            c.last_contact_date asc nulls first,
            c.created_at asc,
            c.customer_number asc,
            c.id asc
        ) as rn
      from public.customers c
      where c.customer_type = v_type
        and not exists (
          select 1 from public.daily_customer_suggestions existing
          where existing.user_id = p_user_id
            and existing.suggestion_date = p_suggestion_date
            and existing.customer_id = c.id
        )
        and not exists (
          select 1 from public.customer_followups f
          where f.customer_id = c.id
            and f.contact_date = p_suggestion_date
        )
      limit v_missing
    )
    insert into public.daily_customer_suggestions(
      suggestion_date,user_id,customer_id,customer_type,sequence_no,status
    )
    select p_suggestion_date,p_user_id,e.id,v_type,v_next_sequence+e.rn-1,'active'
    from eligible e
    on conflict do nothing;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  return v_inserted;
end;
$$;

create or replace function public.get_daily_customer_suggestions(
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date),
  p_user_id uuid default auth.uid()
)
returns table (
  suggestion_id uuid,
  suggestion_date date,
  customer_type text,
  sequence_no integer,
  status text,
  customer_id uuid,
  customer_number text,
  customer_name text,
  phone text,
  contact_person_name text,
  last_contact_date date,
  representative_id uuid,
  representative_name text,
  latest_quotation_number text,
  latest_quotation_date date
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'User is required';
  end if;
  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  perform public.replenish_daily_customer_suggestions(p_user_id,p_suggestion_date);

  return query
  select
    s.id,
    s.suggestion_date,
    s.customer_type,
    s.sequence_no,
    s.status,
    c.id,
    c.customer_number,
    c.customer_name,
    c.phone,
    c.contact_person_name,
    (
      select max(f.contact_date)
      from public.customer_followups f
      where f.customer_id = c.id
    ),
    coalesce(q.representative_id, f_last.representative_id),
    coalesce(q.representative_name, f_last.representative_name),
    q.quotation_number,
    q.quotation_date
  from public.daily_customer_suggestions s
  join public.customers c on c.id = s.customer_id
  left join lateral (
    select qq.representative_id, sr.full_name representative_name,
           qq.quotation_number, qq.quotation_date
    from public.quotations qq
    left join public.sales_representatives sr on sr.id = qq.representative_id
    where qq.customer_id = c.id
    order by qq.quotation_date desc, qq.created_at desc, qq.id desc
    limit 1
  ) q on true
  left join lateral (
    select f.representative_id, sr.full_name representative_name
    from public.customer_followups f
    left join public.sales_representatives sr on sr.id = f.representative_id
    where f.customer_id = c.id
    order by f.contact_date desc, f.created_at desc, f.id desc
    limit 1
  ) f_last on true
  where s.user_id = p_user_id
    and s.suggestion_date = p_suggestion_date
    and s.status = 'active'
  order by s.customer_type, s.sequence_no;
end;
$$;

create or replace function public.get_daily_customer_suggestions_team_summary(
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date)
)
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  user_role text,
  representative_name text,
  company_active integer,
  company_completed integer,
  individual_active integer,
  individual_completed integer,
  total_active integer,
  total_completed integer,
  completion_percent integer,
  last_completed_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authenticated user is required'; end if;
  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  return query
  with eligible as (
    select up.id,up.full_name,up.email,up.role::text role_name,sr.full_name representative_name
    from public.user_profiles up
    left join public.sales_representatives sr on sr.id=up.representative_id
    left join public.role_screen_permissions rsp
      on rsp.role = up.role and rsp.screen_key = 'dailyOperations'
    where coalesce(up.is_active,true)
      and coalesce(rsp.can_view,false)
  ), totals as (
    select s.user_id,
      count(*) filter(where s.status='active' and s.customer_type='شركة')::integer company_active,
      count(*) filter(where s.status='completed' and s.customer_type='شركة')::integer company_completed,
      count(*) filter(where s.status='active' and s.customer_type='فردي')::integer individual_active,
      count(*) filter(where s.status='completed' and s.customer_type='فردي')::integer individual_completed,
      count(*) filter(where s.status='active')::integer total_active,
      count(*) filter(where s.status='completed')::integer total_completed,
      max(s.completed_at) last_completed_at
    from public.daily_customer_suggestions s
    where s.suggestion_date=p_suggestion_date
    group by s.user_id
  )
  select
    e.id,e.full_name,e.email,e.role_name,e.representative_name,
    coalesce(t.company_active,0),coalesce(t.company_completed,0),
    coalesce(t.individual_active,0),coalesce(t.individual_completed,0),
    coalesce(t.total_active,0),coalesce(t.total_completed,0),
    least(100,round((coalesce(t.total_completed,0)::numeric/20)*100)::integer),
    t.last_completed_at
  from eligible e
  left join totals t on t.user_id=e.id
  order by coalesce(t.total_completed,0) desc,e.full_name;
end;
$$;

revoke all on function public.replenish_daily_customer_suggestions(uuid,date) from public,anon;
revoke all on function public.get_daily_customer_suggestions(date,uuid) from public,anon;
revoke all on function public.get_daily_customer_suggestions_team_summary(date) from public,anon;
grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions(date,uuid) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions_team_summary(date) to authenticated,service_role;

-- Daily suggestions are readable by users who can open Daily Operations.
drop policy if exists "daily suggestions own or manager read" on public.daily_customer_suggestions;
drop policy if exists "daily suggestions permission read" on public.daily_customer_suggestions;
create policy "daily suggestions permission read"
on public.daily_customer_suggestions for select to authenticated
using (
  user_id = auth.uid()
  and public.has_screen_permission('dailyOperations','view')
);

-- ------------------------------------------------------------
-- 4) Alerts are calculated by the actual user who created the activity,
-- not by the representative linked to that user account.
-- representative_id remains metadata only.
-- ------------------------------------------------------------
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
  if auth.uid() is null then raise exception 'Authenticated user is required'; end if;
  if not (
    public.has_screen_permission('dailyOperations','view')
    or public.has_screen_permission('dailyAlertsManagement','view')
  ) then
    raise exception 'Permission denied: daily alerts sync';
  end if;

  select * into v_targets
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
    join public.role_screen_permissions rsp
      on rsp.role = up.role and rsp.screen_key = 'dailyOperations' and rsp.can_view = true
    where coalesce(up.is_active,true)
  loop
    for v_task in
      select d.task_key, d.task_name
      from public.daily_task_definitions d
      where d.is_active = true
        and not exists (
          select 1 from public.daily_task_completions c
          where c.task_key = d.task_key
            and c.work_date = p_work_date
            and c.user_id = v_user.id
            and c.is_completed = true
        )
    loop
      insert into public.daily_alerts(
        work_date,alert_type,severity,status,title,details,user_id,representative_id,source_key
      ) values (
        p_work_date,'task_missing',
        case when v_task.task_key='ads_update' then 'critical' else 'important' end,
        'open','مهمة يومية غير منفذة','لم يتم تنفيذ: '||v_task.task_name,
        v_user.id,v_user.representative_id,'task:'||v_task.task_key
      ) on conflict(work_date,source_key,user_id) do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;

    select count(*) into v_customers
    from public.customers c
    where c.created_by = v_user.id
      and (c.created_at at time zone 'Asia/Riyadh')::date = p_work_date;

    select count(*) into v_followups
    from public.customer_followups f
    where f.created_by = v_user.id and f.contact_date = p_work_date;

    select count(*) into v_quotations
    from public.quotations q
    where q.created_by = v_user.id and q.quotation_date = p_work_date;

    select count(*) into v_overdue
    from public.customer_followups f
    where f.created_by = v_user.id
      and f.next_followup_date < p_work_date
      and coalesce(f.is_completed,false)=false;

    if v_customers < v_targets.customers_target then
      insert into public.daily_alerts(work_date,alert_type,severity,status,title,details,user_id,representative_id,source_key)
      values(p_work_date,'target_missed','important','open','هدف العملاء الجدد غير محقق',
        format('المنفذ %s من %s',v_customers,v_targets.customers_target),v_user.id,v_user.representative_id,'target:customers')
      on conflict(work_date,source_key,user_id) do update set details=excluded.details,updated_at=now();
    end if;

    if v_followups < v_targets.followups_target then
      insert into public.daily_alerts(work_date,alert_type,severity,status,title,details,user_id,representative_id,source_key)
      values(p_work_date,'target_missed','important','open','هدف المتابعات غير محقق',
        format('المنفذ %s من %s',v_followups,v_targets.followups_target),v_user.id,v_user.representative_id,'target:followups')
      on conflict(work_date,source_key,user_id) do update set details=excluded.details,updated_at=now();
    end if;

    if v_quotations < v_targets.quotations_target then
      insert into public.daily_alerts(work_date,alert_type,severity,status,title,details,user_id,representative_id,source_key)
      values(p_work_date,'target_missed','important','open','هدف عقود العملاء غير محقق',
        format('المنفذ %s من %s',v_quotations,v_targets.quotations_target),v_user.id,v_user.representative_id,'target:quotations')
      on conflict(work_date,source_key,user_id) do update set details=excluded.details,updated_at=now();
    end if;

    if v_overdue > 0 then
      insert into public.daily_alerts(work_date,alert_type,severity,status,title,details,user_id,representative_id,source_key)
      values(p_work_date,'overdue_followups','critical','open','متابعات متأخرة',
        format('يوجد %s متابعة متأخرة',v_overdue),v_user.id,v_user.representative_id,'overdue:followups')
      on conflict(work_date,source_key,user_id) do update
      set details=excluded.details,severity=excluded.severity,updated_at=now();
    end if;
  end loop;

  return jsonb_build_object('success',true,'created',v_created,'work_date',p_work_date);
end;
$$;

revoke all on function public.sync_daily_operational_alerts(date) from public,anon;
grant execute on function public.sync_daily_operational_alerts(date) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
