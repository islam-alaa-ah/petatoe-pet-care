begin;

-- Phase M15.11.1 — Execution Visit Canonicalization
-- Root cause recovery:
-- 1) single-day scheduling used to update installation_requests directly;
-- 2) legacy selection/timeline state could remain only on the parent request;
-- 3) completing one visit must never mark the parent request completed before quantity confirmation.

-- A. Materialize a canonical visit for every active scheduled request that has no visit yet.
with candidates as (
  select r.id,
         r.scheduled_date,
         r.scheduled_time,
         r.installation_team_id,
         r.assigned_technician_name,
         case
           when r.completed_at is not null then 'بانتظار التأكيد'
           when r.on_route_at is not null or r.arrived_at is not null or r.started_at is not null then 'قيد التنفيذ'
           else 'مجدولة'
         end as visit_status
  from public.installation_requests r
  where r.scheduled_date is not null
    and r.installation_team_id is not null
    and nullif(trim(coalesce(r.assigned_technician_name,'')),'') is not null
    and r.status not in ('ملغي','ملغاة')
    and not exists (
      select 1
      from public.installation_execution_visits v
      where v.installation_request_id=r.id
    )
), inserted as (
  insert into public.installation_execution_visits(
    installation_request_id,visit_no,scheduled_date,scheduled_time,
    installation_team_id,technician_name,status
  )
  select c.id,1,c.scheduled_date,c.scheduled_time,c.installation_team_id,c.assigned_technician_name,c.visit_status
  from candidates c
  returning id,installation_request_id
)
insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
select i.id,s.id,s.quantity
from inserted i
join public.installation_request_services s on s.installation_request_id=i.installation_request_id
on conflict (visit_id,request_service_id) do nothing;

-- B. Migrate legacy execution timeline to exactly one visit whose scheduled day matches
-- the first execution event in Saudi time. This keeps later visits clean.
with legacy as (
  select r.id request_id,
         r.on_route_at,r.map_opened_at,r.arrived_at,r.started_at,r.completed_at,r.execution_notes,
         r.last_status_changed_at,r.last_status_changed_by,
         coalesce(r.on_route_at,r.map_opened_at,r.arrived_at,r.started_at,r.completed_at) first_event
  from public.installation_requests r
  where r.on_route_at is not null or r.map_opened_at is not null or r.arrived_at is not null or r.started_at is not null or r.completed_at is not null
), matched as (
  select distinct on (l.request_id)
         l.*,v.id visit_id
  from legacy l
  join public.installation_execution_visits v on v.installation_request_id=l.request_id
  where v.scheduled_date=((l.first_event at time zone 'Asia/Riyadh')::date)
  order by l.request_id,v.visit_no
)
update public.installation_execution_visits v
set on_route_at=coalesce(v.on_route_at,m.on_route_at),
    map_opened_at=coalesce(v.map_opened_at,m.map_opened_at),
    arrived_at=coalesce(v.arrived_at,m.arrived_at),
    started_at=coalesce(v.started_at,m.started_at),
    completed_at=coalesce(v.completed_at,m.completed_at),
    execution_notes=coalesce(v.execution_notes,m.execution_notes),
    last_status_changed_at=coalesce(v.last_status_changed_at,m.last_status_changed_at,m.completed_at,m.started_at,m.arrived_at,m.on_route_at),
    last_status_changed_by=coalesce(v.last_status_changed_by,m.last_status_changed_by),
    status=case when coalesce(v.completed_at,m.completed_at) is not null then 'بانتظار التأكيد'
                when coalesce(v.on_route_at,m.on_route_at) is not null then 'قيد التنفيذ'
                else v.status end,
    updated_at=now()
from matched m
where v.id=m.visit_id;

-- C. Migrate legacy "current execution" selection to the visit scheduled for the same day.
-- Example: INS-2026-000028 selected on 2026-08-08 becomes visit ...-01 selection.
with selected_requests as (
  select r.id request_id,r.selected_for_execution_at,r.selected_for_execution_by,
         coalesce((r.selected_for_execution_at at time zone 'Asia/Riyadh')::date,r.scheduled_date) selection_day
  from public.installation_requests r
  where r.selected_for_execution_at is not null
    and r.selected_for_execution_by is not null
    and (r.on_route_at is not null or r.map_opened_at is not null or r.arrived_at is not null or r.started_at is not null)
), picked as (
  select distinct on (s.request_id)
         s.*,v.id visit_id
  from selected_requests s
  join public.installation_execution_visits v on v.installation_request_id=s.request_id
  where v.status in ('مجدولة','قيد التنفيذ')
  order by s.request_id,
           case when v.scheduled_date=s.selection_day then 0 else 1 end,
           abs(coalesce(v.scheduled_date-s.selection_day,0)),
           v.visit_no
)
update public.installation_execution_visits v
set selected_for_execution_at=coalesce(v.selected_for_execution_at,p.selected_for_execution_at),
    selected_for_execution_by=coalesce(v.selected_for_execution_by,p.selected_for_execution_by),
    updated_at=now()
from picked p
where v.id=p.visit_id;

-- Parent selection is legacy compatibility state. Once a visit exists, clear it.
-- A selected-but-not-started legacy request therefore returns safely to Today's Requests.
update public.installation_requests r
set selected_for_execution_at=null,
    selected_for_execution_by=null
where (r.selected_for_execution_at is not null or r.selected_for_execution_by is not null)
  and exists (
    select 1 from public.installation_execution_visits v
    where v.installation_request_id=r.id
  );

-- D. Future single-day schedules must always own a visit immediately.
create or replace function public.schedule_installation_request_visit(
  p_request_id uuid,
  p_scheduled_date date,
  p_scheduled_time time,
  p_team_id uuid,
  p_technician_name text,
  p_assignment_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v_id uuid;
  v_no integer;
begin
  if not public.has_screen_permission('installationSchedule','edit') then
    raise exception 'لا توجد صلاحية جدولة وإسناد طلبات التركيبات';
  end if;
  if p_scheduled_date is null or p_scheduled_time is null or p_team_id is null or nullif(trim(p_technician_name),'') is null then
    raise exception 'بيانات الجدولة والفرقة والفني مطلوبة';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,p_team_id) then
    raise exception 'الطلب أو الفرقة خارج نطاقك التشغيلي';
  end if;

  -- Reuse the only unfinished visit for single-day scheduling. If a multi-day plan
  -- already exists, the caller must use the multi-day scheduling workflow instead.
  select id into v_id
  from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
  order by visit_no;

  if (select count(*) from public.installation_execution_visits where installation_request_id=p_request_id and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')) > 1 then
    raise exception 'الطلب لديه أكثر من زيارة نشطة؛ استخدم جدولة الأيام المتعددة';
  end if;

  if v_id is null then
    select coalesce(max(visit_no),0)+1 into v_no
    from public.installation_execution_visits
    where installation_request_id=p_request_id;

    insert into public.installation_execution_visits(
      installation_request_id,visit_no,scheduled_date,scheduled_time,
      installation_team_id,technician_name,status
    ) values(
      p_request_id,v_no,p_scheduled_date,p_scheduled_time,p_team_id,trim(p_technician_name),'مجدولة'
    ) returning id into v_id;

    insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
    select v_id,s.id,
           greatest(s.quantity-coalesce((
             select sum(coalesce(vs.executed_quantity,0))
             from public.installation_execution_visit_services vs
             join public.installation_execution_visits vv on vv.id=vs.visit_id
             where vv.installation_request_id=p_request_id
               and vv.status='مؤكدة'
               and vs.request_service_id=s.id
           ),0),0)
    from public.installation_request_services s
    where s.installation_request_id=p_request_id;
  else
    update public.installation_execution_visits
    set scheduled_date=p_scheduled_date,
        scheduled_time=p_scheduled_time,
        installation_team_id=p_team_id,
        technician_name=trim(p_technician_name),
        status=case when on_route_at is null then 'مجدولة' else status end,
        updated_at=now()
    where id=v_id;
  end if;

  update public.installation_requests
  set scheduled_date=p_scheduled_date,
      scheduled_time=p_scheduled_time,
      time_slot=null,
      installation_team_id=p_team_id,
      assigned_technician_name=trim(p_technician_name),
      technician_id=null,
      status='مسند',
      assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),
      completed_at=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null
  where id=p_request_id;

  return v_id;
end;
$$;
grant execute on function public.schedule_installation_request_visit(uuid,date,time,uuid,text,text) to authenticated;

-- E. Selecting an execution always targets a visit. Legacy parent selection no longer controls UI state.
create or replace function public.select_installation_execution_visit(p_request_id uuid,p_visit_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; v_id uuid; active_count integer;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية بدء تنفيذ التركيبات'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  if p_visit_id is null then
    select count(*),min(id) into active_count,v_id
    from public.installation_execution_visits
    where installation_request_id=p_request_id and status in ('مجدولة','قيد التنفيذ');
    if active_count=0 then v_id:=public.ensure_installation_execution_visit(p_request_id);
    elsif active_count>1 then raise exception 'حدد زيارة التنفيذ المطلوبة لهذا الطلب متعدد الأيام';
    end if;
  else
    v_id:=p_visit_id;
  end if;

  select * into v from public.installation_execution_visits where id=v_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  if v.status not in ('مجدولة','قيد التنفيذ') or v.completed_at is not null then raise exception 'لا يمكن بدء زيارة التنفيذ في حالتها الحالية'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
     or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then raise exception 'هذه الزيارة غير مرتبطة بفرقتك واسم الفني الخاص بك'; end if;
  if exists(select 1 from public.installation_execution_visits x where x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null and x.status in ('مجدولة','قيد التنفيذ') and x.id<>v.id) then raise exception 'يوجد تنفيذ حالي نشط بالفعل'; end if;

  update public.installation_execution_visits
  set selected_for_execution_at=coalesce(selected_for_execution_at,now()),selected_for_execution_by=auth.uid(),updated_at=now()
  where id=v.id;

  -- Parent fields are compatibility-only; do not use them to resolve current execution.
  update public.installation_requests
  set status=case when status in ('بانتظار المراجعة','جديد','مجدول','بانتظار الجدولة') then 'مسند' else status end,
      selected_for_execution_at=null,
      selected_for_execution_by=null
  where id=r.id;
  return v.id;
end;$$;
grant execute on function public.select_installation_execution_visit(uuid,uuid) to authenticated;

-- F. Completing one visit only completes that visit. Parent request is completed only
-- after quantity confirmation proves there is no remaining quantity.
create or replace function public.advance_installation_execution_visit_stage(p_request_id uuid,p_visit_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; expected text;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ التركيبات'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id) or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then raise exception 'هذه الزيارة غير مرتبطة بفرقتك واسم الفني الخاص بك'; end if;
  if v.selected_for_execution_by is distinct from auth.uid() or v.selected_for_execution_at is null then raise exception 'هذه الزيارة ليست التنفيذ الحالي لهذا المستخدم'; end if;
  expected:=case when v.on_route_at is null then 'في الطريق' when v.map_opened_at is null then null when v.arrived_at is null then 'وصل إلى العميل' when v.started_at is null then 'قيد التنفيذ' when v.completed_at is null then 'مكتمل' else null end;
  if expected is distinct from p_next_status then raise exception 'يجب تنفيذ مراحل الزيارة بالترتيب'; end if;
  if p_next_status='وصل إلى العميل' and v.map_opened_at is null then raise exception 'افتح موقع العميل قبل تسجيل الوصول'; end if;

  update public.installation_execution_visits set
    on_route_at=case when p_next_status='في الطريق' then coalesce(on_route_at,now()) else on_route_at end,
    arrived_at=case when p_next_status='وصل إلى العميل' then coalesce(arrived_at,now()) else arrived_at end,
    started_at=case when p_next_status='قيد التنفيذ' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_next_status='مكتمل' then coalesce(completed_at,now()) else completed_at end,
    status=case when p_next_status='مكتمل' then 'بانتظار التأكيد' else 'قيد التنفيذ' end,
    execution_notes=nullif(trim(coalesce(p_notes,'')),''),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now()
  where id=v.id;

  update public.installation_requests
  set status='قيد التنفيذ',
      completed_at=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null
  where id=r.id;
end;$$;
grant execute on function public.advance_installation_execution_visit_stage(uuid,uuid,text,text) to authenticated;

commit;
