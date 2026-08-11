-- P5.11.4.10.3 — Execution slot capacity lock recovery
-- Keep every original schedule slot reserved while a same-day execution group is active.
begin;

create or replace function public.get_installation_team_booked_times(
  p_schedule_date date,
  p_team_id uuid,
  p_exclude_request_id uuid default null
)
returns table(scheduled_time time,request_number text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_screen_permission('installationSchedule','view') then
    raise exception 'ليس لديك صلاحية عرض جدولة المواعيد';
  end if;
  if p_schedule_date is null or p_team_id is null then return; end if;

  return query
  select distinct q.scheduled_time,q.request_number
  from (
    select v.scheduled_time,r.request_number
    from public.installation_execution_visits v
    join public.installation_requests r on r.id=v.installation_request_id
    where v.scheduled_date=p_schedule_date
      and v.scheduled_time is not null
      and v.installation_team_id=p_team_id
      and (p_exclude_request_id is null or v.installation_request_id<>p_exclude_request_id)
      and v.status in ('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد')

    union all

    select r.scheduled_time,r.request_number
    from public.installation_requests r
    where r.scheduled_date=p_schedule_date
      and r.scheduled_time is not null
      and r.installation_team_id=p_team_id
      and (p_exclude_request_id is null or r.id<>p_exclude_request_id)
      and coalesce(r.status,'') not in ('ملغي','ملغاة','مكتمل')
  ) q
  order by q.scheduled_time;
end $$;

grant execute on function public.get_installation_team_booked_times(date,uuid,uuid) to authenticated;

-- Keep groomer availability aligned with all active visit slots as well.
create or replace function public.get_installation_technician_booked_times(
  p_schedule_date date,
  p_technician_name text,
  p_exclude_request_id uuid default null
)
returns table(scheduled_time time,request_number text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_screen_permission('installationSchedule','view') then
    raise exception 'ليس لديك صلاحية عرض جدولة المواعيد';
  end if;
  if p_schedule_date is null or nullif(trim(coalesce(p_technician_name,'')),'') is null then return; end if;

  return query
  select distinct q.scheduled_time,q.request_number
  from (
    select v.scheduled_time,r.request_number
    from public.installation_execution_visits v
    join public.installation_requests r on r.id=v.installation_request_id
    where v.scheduled_date=p_schedule_date
      and v.scheduled_time is not null
      and lower(regexp_replace(trim(coalesce(v.technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(p_technician_name),'\s+',' ','g'))
      and (p_exclude_request_id is null or v.installation_request_id<>p_exclude_request_id)
      and v.status in ('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد')

    union all

    select r.scheduled_time,r.request_number
    from public.installation_requests r
    where r.scheduled_date=p_schedule_date
      and r.scheduled_time is not null
      and lower(regexp_replace(trim(coalesce(r.assigned_technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(p_technician_name),'\s+',' ','g'))
      and (p_exclude_request_id is null or r.id<>p_exclude_request_id)
      and coalesce(r.status,'') not in ('ملغي','ملغاة','مكتمل')
  ) q
  order by q.scheduled_time;
end $$;

grant execute on function public.get_installation_technician_booked_times(date,text,uuid) to authenticated;

-- Single-slot scheduling must enforce the same team/groomer slot lock as multi-day scheduling.
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
  active_count integer;
begin
  if not public.has_screen_permission('installationSchedule','edit') then raise exception 'لا توجد صلاحية جدولة وإسناد المواعيد'; end if;
  if p_scheduled_date is null or p_scheduled_time is null or p_team_id is null or nullif(trim(p_technician_name),'') is null then raise exception 'بيانات الجدولة والفرقة والجرومر مطلوبة'; end if;
  if p_scheduled_time not in (time '12:00',time '14:00',time '16:00',time '18:00',time '20:00',time '22:00') then raise exception 'وقت الموعد يجب أن يكون أحد المواعيد الثابتة'; end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  if coalesce(r.status,'') in ('ملغي','ملغاة','مكتمل') then raise exception 'لا يمكن جدولة موعد ملغي أو مكتمل'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,p_team_id) then raise exception 'الموعد أو الفرقة خارج نطاقك التشغيلي'; end if;
  if public.is_installation_schedule_day_locked(p_scheduled_date) then raise exception 'هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.'; end if;

  -- Capacity is based on every original visit slot, even when those visits execute as one grouped workflow.
  if exists(
    select 1 from public.installation_execution_visits x
    where x.installation_request_id<>p_request_id
      and x.scheduled_date=p_scheduled_date
      and x.scheduled_time=p_scheduled_time
      and x.installation_team_id=p_team_id
      and x.status in ('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد')
  ) or exists(
    select 1 from public.installation_requests x
    where x.id<>p_request_id
      and x.scheduled_date=p_scheduled_date
      and x.scheduled_time=p_scheduled_time
      and x.installation_team_id=p_team_id
      and coalesce(x.status,'') not in ('ملغي','ملغاة','مكتمل')
  ) then
    raise exception 'الفرقة محجوزة بالفعل في هذا الموعد';
  end if;

  if exists(
    select 1 from public.installation_execution_visits x
    where x.installation_request_id<>p_request_id
      and x.scheduled_date=p_scheduled_date
      and x.scheduled_time=p_scheduled_time
      and lower(regexp_replace(trim(coalesce(x.technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(p_technician_name),'\s+',' ','g'))
      and x.status in ('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد')
  ) then
    raise exception 'الجرومر محجوز بالفعل في هذا الموعد';
  end if;

  select id into v_id
  from public.installation_execution_visits
  where installation_request_id=p_request_id and status='بانتظار الجدولة'
  order by visit_no limit 1 for update;

  if v_id is null then
    select count(*) into active_count
    from public.installation_execution_visits
    where installation_request_id=p_request_id and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');
    if active_count>1 then raise exception 'الموعد لديه أكثر من زيارة نشطة؛ استخدم جدولة الأيام المتعددة'; end if;

    select id into v_id
    from public.installation_execution_visits
    where installation_request_id=p_request_id and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
    order by visit_no limit 1 for update;
  end if;

  if v_id is null then
    select coalesce(max(visit_no),0)+1 into v_no from public.installation_execution_visits where installation_request_id=p_request_id;
    insert into public.installation_execution_visits(installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status)
    values(p_request_id,v_no,p_scheduled_date,p_scheduled_time,p_team_id,trim(p_technician_name),'مجدولة') returning id into v_id;

    insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
    select v_id,s.id,greatest(s.quantity-coalesce((
      select sum(coalesce(vs.executed_quantity,0))
      from public.installation_execution_visit_services vs
      join public.installation_execution_visits vv on vv.id=vs.visit_id
      where vv.installation_request_id=p_request_id and vv.status='مؤكدة' and vs.request_service_id=s.id
    ),0)-coalesce((
      select sum(coalesce(vs2.scheduled_quantity,0))
      from public.installation_execution_visit_services vs2
      join public.installation_execution_visits vv2 on vv2.id=vs2.visit_id
      where vv2.installation_request_id=p_request_id and vv2.status='مجدولة' and vs2.request_service_id=s.id
    ),0),0)
    from public.installation_request_services s where s.installation_request_id=p_request_id;
  else
    update public.installation_execution_visits
    set scheduled_date=p_scheduled_date,scheduled_time=p_scheduled_time,installation_team_id=p_team_id,
        technician_name=trim(p_technician_name),status='مجدولة',updated_at=now()
    where id=v_id;
  end if;

  update public.installation_requests
  set scheduled_date=p_scheduled_date,scheduled_time=p_scheduled_time,time_slot=null,
      installation_team_id=p_team_id,assigned_technician_name=trim(p_technician_name),technician_id=null,
      status='مسند',assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),completed_at=null,
      selected_for_execution_at=null,selected_for_execution_by=null
  where id=p_request_id;

  return v_id;
end;
$$;

grant execute on function public.schedule_installation_request_visit(uuid,date,time,uuid,text,text) to authenticated;

commit;
notify pgrst,'reload schema';
