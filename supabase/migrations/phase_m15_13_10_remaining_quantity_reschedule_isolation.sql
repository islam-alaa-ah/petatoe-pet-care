begin;

-- Phase M15.13.10 — Remaining Quantity Reschedule Isolation
-- After one or more execution visits have been confirmed, scheduling may only
-- redistribute the quantity that is still unexecuted. Confirmed/history visits
-- stay immutable and are never deleted or rewritten by the scheduling workflow.

create or replace function public.schedule_installation_request_multi_day(
  p_request_id uuid,
  p_visits jsonb,
  p_assignment_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.installation_requests%rowtype;
  v jsonb;
  svc record;
  v_visit_id uuid;
  v_no integer:=0;
  v_date date;
  v_time time;
  v_team uuid;
  v_technician text;
  v_total numeric;
  v_expected numeric;
  v_executed numeric;
  v_first_date date;
  v_first_time time;
  v_first_team uuid;
  v_first_technician text;
  v_has_confirmed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.has_screen_permission('installationSchedule','edit') then raise exception 'ليس لديك صلاحية تعديل جدولة التركيبات'; end if;
  if p_request_id is null then raise exception 'معرّف طلب التركيب مطلوب'; end if;
  if jsonb_typeof(p_visits)<>'array' or jsonb_array_length(p_visits)<2 then raise exception 'يجب إضافة يومين على الأقل لتقسيم الطلب'; end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then raise exception 'الطلب خارج نطاقك التشغيلي'; end if;

  -- A visit that is currently running or waiting for confirmation must be resolved first.
  if exists(
    select 1 from public.installation_execution_visits ev
    where ev.installation_request_id=p_request_id
      and ev.status in ('قيد التنفيذ','بانتظار التأكيد')
  ) then
    raise exception 'يوجد تنفيذ جارٍ أو بانتظار تأكيد الكميات. أكمل التأكيد أولًا قبل إعادة الجدولة.';
  end if;

  select exists(
    select 1 from public.installation_execution_visits ev
    where ev.installation_request_id=p_request_id and ev.status='مؤكدة'
  ) into v_has_confirmed;

  -- Validate every service against the real remaining quantity, not the original request quantity.
  for svc in select id,quantity from public.installation_request_services where installation_request_id=p_request_id loop
    select coalesce(sum(coalesce(vs.executed_quantity,0)),0)
      into v_executed
    from public.installation_execution_visit_services vs
    join public.installation_execution_visits ev on ev.id=vs.visit_id
    where ev.installation_request_id=p_request_id
      and ev.status='مؤكدة'
      and vs.request_service_id=svc.id;

    v_expected:=greatest(coalesce(svc.quantity,0)-coalesce(v_executed,0),0);

    select coalesce(sum((line->>'quantity')::numeric),0) into v_total
    from jsonb_array_elements(p_visits) visit,
         jsonb_array_elements(coalesce(visit->'services','[]'::jsonb)) line
    where nullif(line->>'request_service_id','')::uuid=svc.id;

    if v_total<>v_expected then
      raise exception 'توزيع الكمية المتبقية للخدمة غير مكتمل. المتبقي % والموزع %',v_expected,v_total;
    end if;
  end loop;

  if exists(
    select 1
    from jsonb_array_elements(p_visits) visit,
         jsonb_array_elements(coalesce(visit->'services','[]'::jsonb)) line
    where coalesce((line->>'quantity')::numeric,0)<0
       or not exists(
         select 1 from public.installation_request_services rs
         where rs.id=nullif(line->>'request_service_id','')::uuid
           and rs.installation_request_id=p_request_id
       )
  ) then raise exception 'يوجد بند خدمة أو كمية غير صالحة في توزيع الزيارات'; end if;

  -- Preserve all historical/confirmed execution. Replace only visits that have not started.
  select coalesce(max(visit_no),0) into v_no
  from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status not in ('بانتظار الجدولة','مجدولة');

  delete from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('بانتظار الجدولة','مجدولة');

  for v in select value from jsonb_array_elements(p_visits) loop
    v_no:=v_no+1;
    v_date:=nullif(v->>'scheduled_date','')::date;
    v_time:=nullif(v->>'scheduled_time','')::time;
    v_team:=nullif(v->>'team_id','')::uuid;
    v_technician:=nullif(trim(v->>'technician_name'),'');
    if v_date is null or v_time is null or v_team is null or v_technician is null then raise exception 'أكمل التاريخ والوقت والفرقة والفني لكل يوم'; end if;
    if public.is_installation_schedule_day_locked(v_date) then raise exception 'اليوم % مغلق. افتح اليوم أولًا قبل الجدولة.',v_date; end if;
    if not public.can_access_installation_request_scope(r.representative_id,v_team) then raise exception 'الفرقة المختارة خارج نطاقك التشغيلي'; end if;

    if exists(
      select 1 from public.installation_execution_visits x
      where x.installation_request_id<>p_request_id and x.scheduled_date=v_date and x.scheduled_time=v_time
        and lower(regexp_replace(trim(coalesce(x.technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(v_technician,'\s+',' ','g'))
        and x.status not in ('ملغاة','مؤكدة')
    ) or exists(
      select 1 from public.installation_requests x
      where x.id<>p_request_id and x.scheduled_date=v_date and x.scheduled_time=v_time
        and lower(regexp_replace(trim(coalesce(x.assigned_technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(v_technician,'\s+',' ','g'))
        and coalesce(x.status,'') not in ('ملغي','ملغاة')
    ) then raise exception 'الموعد % في يوم % محجوز للفني %',v_time,v_date,v_technician; end if;

    if exists(
      select 1 from jsonb_array_elements(p_visits) other
      where other<>v and nullif(other->>'scheduled_date','')::date=v_date
        and nullif(other->>'scheduled_time','')::time=v_time
        and lower(regexp_replace(trim(coalesce(other->>'technician_name','')),'\s+',' ','g'))=lower(regexp_replace(v_technician,'\s+',' ','g'))
    ) then raise exception 'لا يمكن حجز الفني نفسه مرتين في الموعد نفسه داخل الخطة'; end if;

    insert into public.installation_execution_visits(
      installation_request_id,visit_no,scheduled_date,scheduled_time,
      installation_team_id,technician_name,status
    ) values(
      p_request_id,v_no,v_date,v_time,v_team,v_technician,'مجدولة'
    ) returning id into v_visit_id;

    insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
    select v_visit_id,nullif(line->>'request_service_id','')::uuid,(line->>'quantity')::numeric
    from jsonb_array_elements(coalesce(v->'services','[]'::jsonb)) line
    where coalesce((line->>'quantity')::numeric,0)>0;

    if v_first_date is null then
      v_first_date:=v_date;
      v_first_time:=v_time;
      v_first_team:=v_team;
      v_first_technician:=v_technician;
    end if;
  end loop;

  update public.installation_requests set
    scheduled_date=v_first_date,
    scheduled_time=v_first_time,
    time_slot=null,
    installation_team_id=v_first_team,
    assigned_technician_name=v_first_technician,
    technician_id=null,
    status='مسند',
    assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),
    completed_at=null,
    selected_for_execution_at=null,
    selected_for_execution_by=null,
    updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'requestId',p_request_id,
    'visitsCount',jsonb_array_length(p_visits),
    'status','scheduled',
    'remainingOnly',v_has_confirmed
  );
end;
$$;

grant execute on function public.schedule_installation_request_multi_day(uuid,jsonb,text) to authenticated;

commit;
