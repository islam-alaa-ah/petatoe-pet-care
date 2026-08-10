-- PETATOE P5.11.4.6 — Auditable Execution Reschedule
-- Allows Super Admin / Sales Manager to return an active appointment to scheduling
-- even after execution has started, while preserving the cancelled visit and a full
-- daily-report audit record with stage + reason.

begin;

create table if not exists public.installation_reschedule_events (
  id uuid primary key default gen_random_uuid(),
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  execution_visit_id uuid references public.installation_execution_visits(id) on delete set null,
  occurred_at timestamptz not null default now(),
  occurred_by uuid references public.user_profiles(id) on delete set null,
  performed_by_name text,
  reason text not null check(length(btrim(reason)) > 0),
  execution_stage text not null,
  previous_status text,
  previous_scheduled_date date,
  previous_scheduled_time time,
  previous_team_id uuid references public.installation_teams(id) on delete set null,
  previous_team_name text,
  previous_groomer_name text,
  previous_driver_name text,
  previous_representative_id uuid references public.sales_representatives(id) on delete set null,
  request_number text,
  customer_name text,
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists idx_installation_reschedule_events_time
  on public.installation_reschedule_events(occurred_at desc);
create index if not exists idx_installation_reschedule_events_request
  on public.installation_reschedule_events(installation_request_id,occurred_at desc);
create index if not exists idx_installation_reschedule_events_team
  on public.installation_reschedule_events(previous_team_id,occurred_at desc);

alter table public.installation_reschedule_events enable row level security;

drop policy if exists "installation reschedule report read" on public.installation_reschedule_events;
create policy "installation reschedule report read"
on public.installation_reschedule_events
for select
to authenticated
using(
  public.current_user_role()='super_admin'
  or public.has_screen_permission('installationReports','view')
);

revoke insert,update,delete on public.installation_reschedule_events from authenticated;
grant select on public.installation_reschedule_events to authenticated;

create or replace function public.return_installation_execution_to_schedule(
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  v_role text;
  v_reason text;
  v_stage text;
  v_user_name text;
  v_customer_name text;
  v_team_name text;
  v_groomer text;
  v_driver text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  v_role := public.current_user_role()::text;
  if v_role not in ('super_admin','sales_manager') then
    raise exception 'إلغاء الطلب وإعادته للجدولة متاح للسوبر أدمن ومدير المبيعات فقط'
      using errcode='42501';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'سبب إعادة الجدولة مطلوب' using errcode='23514';
  end if;

  select *
    into r
  from public.installation_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'الموعد غير موجود' using errcode='P0002';
  end if;

  if coalesce(r.status,'') in ('مكتمل','ملغي') then
    raise exception 'لا يمكن إعادة موعد مكتمل أو ملغي إلى الجدولة' using errcode='23514';
  end if;

  select *
    into v
  from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
  order by
    case when selected_for_execution_at is not null then 0 else 1 end,
    scheduled_date nulls last,
    scheduled_time nulls last,
    visit_no
  limit 1
  for update;

  -- Determine the exact stage at the moment of rescheduling.
  if coalesce(v.completed_at,r.completed_at) is not null then
    v_stage := 'تم الانتهاء';
  elsif coalesce(v.started_at,r.started_at) is not null then
    v_stage := 'بدأ الموعد';
  elsif coalesce(v.arrived_at,r.arrived_at) is not null then
    v_stage := 'وصل الموقع';
  elsif coalesce(v.map_opened_at,r.map_opened_at) is not null then
    v_stage := 'فتح موقع العميل';
  elsif coalesce(v.on_route_at,r.on_route_at) is not null then
    v_stage := 'بدء التحرك';
  elsif coalesce(v.selected_for_execution_at,r.selected_for_execution_at) is not null then
    v_stage := 'تم اختيار الطلب الحالي';
  else
    v_stage := 'قبل بدء التنفيذ';
  end if;

  select up.full_name into v_user_name
  from public.user_profiles up where up.id=auth.uid();

  select c.customer_name into v_customer_name
  from public.customers c where c.id=r.customer_id;

  select t.name,t.groomer_name,t.driver_name
    into v_team_name,v_groomer,v_driver
  from public.installation_teams t
  where t.id=coalesce(v.installation_team_id,r.installation_team_id);

  insert into public.installation_reschedule_events(
    installation_request_id,
    execution_visit_id,
    occurred_by,
    performed_by_name,
    reason,
    execution_stage,
    previous_status,
    previous_scheduled_date,
    previous_scheduled_time,
    previous_team_id,
    previous_team_name,
    previous_groomer_name,
    previous_driver_name,
    previous_representative_id,
    request_number,
    customer_name,
    snapshot
  )
  values(
    r.id,
    v.id,
    auth.uid(),
    v_user_name,
    v_reason,
    v_stage,
    r.status,
    coalesce(v.scheduled_date,r.scheduled_date),
    coalesce(v.scheduled_time,r.scheduled_time),
    coalesce(v.installation_team_id,r.installation_team_id),
    v_team_name,
    v_groomer,
    v_driver,
    r.representative_id,
    r.request_number,
    v_customer_name,
    jsonb_build_object(
      'request',to_jsonb(r),
      'visit',case when v.id is null then null else to_jsonb(v) end
    )
  );

  -- Preserve execution history. Do NOT delete a started visit.
  update public.installation_execution_visits
  set status='ملغاة',
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      updated_at=now()
  where installation_request_id=p_request_id
    and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

  -- Reset the request to a clean scheduling state for the next assignment.
  update public.installation_requests
  set scheduled_date=null,
      scheduled_time=null,
      time_slot=null,
      installation_team_id=null,
      assigned_technician_name=null,
      technician_id=null,
      assigned_at=null,
      assigned_by=null,
      assignment_notes=null,
      status='بانتظار الجدولة',
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      on_route_at=null,
      map_opened_at=null,
      arrived_at=null,
      started_at=null,
      completed_at=null,
      execution_notes=null,
      execution_failure_reason=null,
      last_status_changed_at=now(),
      last_status_changed_by=auth.uid(),
      updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'requestId',p_request_id,
    'status','بانتظار الجدولة',
    'stage',v_stage,
    'reason',v_reason
  );
end;
$$;

revoke all on function public.return_installation_execution_to_schedule(uuid,text)
from public,anon;

grant execute on function public.return_installation_execution_to_schedule(uuid,text)
to authenticated,service_role;

-- Remove execute access from the obsolete one-argument signature if it exists.
do $$
begin
  if to_regprocedure('public.return_installation_execution_to_schedule(uuid)') is not null then
    execute 'revoke all on function public.return_installation_execution_to_schedule(uuid) from public,anon,authenticated';
  end if;
end $$;

notify pgrst,'reload schema';

commit;

-- Verification
select
  to_regclass('public.installation_reschedule_events') is not null as reschedule_log_table_ok,
  to_regprocedure('public.return_installation_execution_to_schedule(uuid,text)') is not null as reschedule_rpc_ok;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) arguments,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='return_installation_execution_to_schedule'
order by arguments;
