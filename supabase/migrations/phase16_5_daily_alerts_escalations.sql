-- KYUM Phase 16.5 — Daily Alerts, Escalations & Supervisor Control
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.daily_alerts(
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  alert_type text not null,
  severity text not null default 'normal'
    check(severity in ('normal','important','critical')),
  status text not null default 'open'
    check(status in ('open','in_progress','escalated','closed')),
  title text not null,
  details text,
  user_id uuid references auth.users(id) on delete cascade,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  source_key text not null,
  supervisor_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  escalated_at timestamptz,
  resolved_at timestamptz,
  unique(work_date,source_key,user_id)
);

create table if not exists public.daily_alert_actions(
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.daily_alerts(id) on delete cascade,
  action_type text not null
    check(action_type in ('start','escalate','close','reopen','note')),
  note text,
  action_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists daily_alerts_work_date_idx
  on public.daily_alerts(work_date);
create index if not exists daily_alerts_status_idx
  on public.daily_alerts(status);
create index if not exists daily_alerts_user_idx
  on public.daily_alerts(user_id);

insert into public.app_screens(
  screen_key,screen_name,group_name,display_order,is_active
)
values(
  'dailyAlertsManagement',
  'إدارة تنبيهات التشغيل اليومي',
  'صلاحيات المهام اليومية',
  12,
  true
)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export
)
values
  ('super_admin','dailyAlertsManagement',true,true,true,true,true),
  ('sales_manager','dailyAlertsManagement',true,true,true,false,true),
  ('sales_supervisor','dailyAlertsManagement',true,true,true,false,true),
  ('sales_representative','dailyAlertsManagement',true,false,false,false,false),
  ('customer_service','dailyAlertsManagement',true,false,false,false,false),
  ('viewer','dailyAlertsManagement',true,false,false,false,true)
on conflict(role,screen_key) do update set
  can_view=excluded.can_view,
  can_add=excluded.can_add,
  can_edit=excluded.can_edit,
  can_delete=excluded.can_delete,
  can_export=excluded.can_export;

alter table public.daily_alerts enable row level security;
alter table public.daily_alert_actions enable row level security;

drop policy if exists "daily alerts read" on public.daily_alerts;
create policy "daily alerts read"
on public.daily_alerts for select to authenticated
using(
  user_id = auth.uid()
  or public.current_user_role() in ('super_admin','sales_manager','sales_supervisor','viewer')
);

drop policy if exists "daily alerts manage" on public.daily_alerts;
create policy "daily alerts manage"
on public.daily_alerts for all to authenticated
using(
  public.current_user_role() = 'super_admin'
  or exists(
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyAlertsManagement'
      and p.can_edit = true
  )
)
with check(
  public.current_user_role() = 'super_admin'
  or exists(
    select 1 from public.role_screen_permissions p
    where p.role = public.current_user_role()
      and p.screen_key = 'dailyAlertsManagement'
      and p.can_edit = true
  )
);

drop policy if exists "daily alert actions read" on public.daily_alert_actions;
create policy "daily alert actions read"
on public.daily_alert_actions for select to authenticated
using(true);

drop policy if exists "daily alert actions insert" on public.daily_alert_actions;
create policy "daily alert actions insert"
on public.daily_alert_actions for insert to authenticated
with check(action_by = auth.uid());

create or replace function public.sync_daily_operational_alerts(
  p_work_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
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
    where up.is_active = true
      and up.role in ('sales_representative','sales_supervisor','sales_manager')
  loop
    for v_task in
      select d.task_key,d.task_name
      from public.daily_task_definitions d
      where d.is_active = true
        and not exists(
          select 1 from public.daily_task_completions c
          where c.task_key=d.task_key
            and c.work_date=p_work_date
            and c.user_id=v_user.id
            and c.is_completed=true
        )
    loop
      insert into public.daily_alerts(
        work_date,alert_type,severity,status,title,details,
        user_id,representative_id,source_key
      )
      values(
        p_work_date,'task_missing',
        case when v_task.task_key='ads_update' then 'critical' else 'important' end,
        'open',
        'مهمة يومية غير منفذة',
        'لم يتم تنفيذ: ' || v_task.task_name,
        v_user.id,v_user.representative_id,
        'task:' || v_task.task_key
      )
      on conflict(work_date,source_key,user_id) do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;

    select count(*) into v_customers
    from public.customers c
    where c.representative_id = v_user.representative_id
      and c.created_at::date = p_work_date;

    select count(*) into v_followups
    from public.customer_followups f
    where f.representative_id = v_user.representative_id
      and f.created_at::date = p_work_date;

    select count(*) into v_quotations
    from public.quotations q
    where q.representative_id = v_user.representative_id
      and q.created_at::date = p_work_date;

    select count(*) into v_overdue
    from public.customer_followups f
    where f.representative_id = v_user.representative_id
      and f.next_followup_date < p_work_date
      and coalesce(f.completed,false)=false;

    if v_customers < v_targets.customers_target then
      insert into public.daily_alerts(
        work_date,alert_type,severity,status,title,details,
        user_id,representative_id,source_key
      ) values(
        p_work_date,'target_missed','important','open',
        'هدف العملاء الجدد غير محقق',
        format('المنفذ %s من %s',v_customers,v_targets.customers_target),
        v_user.id,v_user.representative_id,'target:customers'
      ) on conflict(work_date,source_key,user_id) do nothing;
    end if;

    if v_followups < v_targets.followups_target then
      insert into public.daily_alerts(
        work_date,alert_type,severity,status,title,details,
        user_id,representative_id,source_key
      ) values(
        p_work_date,'target_missed','important','open',
        'هدف المتابعات غير محقق',
        format('المنفذ %s من %s',v_followups,v_targets.followups_target),
        v_user.id,v_user.representative_id,'target:followups'
      ) on conflict(work_date,source_key,user_id) do nothing;
    end if;

    if v_quotations < v_targets.quotations_target then
      insert into public.daily_alerts(
        work_date,alert_type,severity,status,title,details,
        user_id,representative_id,source_key
      ) values(
        p_work_date,'target_missed','important','open',
        'هدف عروض الأسعار غير محقق',
        format('المنفذ %s من %s',v_quotations,v_targets.quotations_target),
        v_user.id,v_user.representative_id,'target:quotations'
      ) on conflict(work_date,source_key,user_id) do nothing;
    end if;

    if v_overdue > 0 then
      insert into public.daily_alerts(
        work_date,alert_type,severity,status,title,details,
        user_id,representative_id,source_key
      ) values(
        p_work_date,'overdue_followups','critical','open',
        'متابعات متأخرة',
        format('يوجد %s متابعة متأخرة',v_overdue),
        v_user.id,v_user.representative_id,'overdue:followups'
      ) on conflict(work_date,source_key,user_id) do update
        set details=excluded.details,
            severity=excluded.severity,
            updated_at=now();
    end if;
  end loop;

  return jsonb_build_object(
    'success',true,
    'created',v_created,
    'work_date',p_work_date
  );
end;
$$;

grant execute on function public.sync_daily_operational_alerts(date) to authenticated;
grant select,insert,update on public.daily_alerts to authenticated;
grant select,insert on public.daily_alert_actions to authenticated;

commit;
notify pgrst,'reload schema';
