-- PETATOE P5.11.4.5 — Execution Return To Scheduling
-- Explicitly restricted to super_admin and sales_manager.
-- Groomer/Driver (viewer) cannot execute this RPC even by direct API call.

begin;

create or replace function public.return_installation_execution_to_schedule(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.installation_requests%rowtype;
  v_role text;
  v_cancelled_visits integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  v_role := public.current_user_role()::text;
  if v_role not in ('super_admin','sales_manager') then
    raise exception 'إلغاء الطلب وإعادته للجدولة متاح للسوبر أدمن ومدير المبيعات فقط'
      using errcode='42501';
  end if;

  if p_request_id is null then
    raise exception 'معرّف الموعد مطلوب' using errcode='23502';
  end if;

  select *
    into r
  from public.installation_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'الموعد غير موجود' using errcode='P0002';
  end if;

  -- Safety: this action is a scheduling rollback, not an execution-history eraser.
  -- Once field execution has actually started, preserve the audit trail.
  if r.on_route_at is not null
     or r.map_opened_at is not null
     or r.arrived_at is not null
     or r.started_at is not null
     or r.completed_at is not null
     or exists(
       select 1
       from public.installation_execution_visits v
       where v.installation_request_id=p_request_id
         and (
           v.on_route_at is not null
           or v.map_opened_at is not null
           or v.arrived_at is not null
           or v.started_at is not null
           or v.completed_at is not null
         )
     )
  then
    raise exception 'لا يمكن إعادة الموعد إلى الجدولة بعد بدء خطوات التنفيذ'
      using errcode='23514';
  end if;

  select count(*)
    into v_cancelled_visits
  from public.installation_execution_visits v
  where v.installation_request_id=p_request_id
    and coalesce(v.status,'') in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

  delete from public.installation_execution_visits v
  where v.installation_request_id=p_request_id
    and coalesce(v.status,'') in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');

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
      completed_at=null,
      updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'requestId',p_request_id,
    'cancelledVisits',v_cancelled_visits,
    'status','بانتظار الجدولة'
  );
end;
$$;

revoke all on function public.return_installation_execution_to_schedule(uuid)
from public,anon;

grant execute on function public.return_installation_execution_to_schedule(uuid)
to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- Verification
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='return_installation_execution_to_schedule';
