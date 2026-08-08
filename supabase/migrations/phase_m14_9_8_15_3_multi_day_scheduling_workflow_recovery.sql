begin;

-- Phase M14.9.8.15.3 — Multi-Day Scheduling Workflow Recovery
-- Restores initial multi-day allocation for one installation request while keeping one request number.

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
  v_first_date date;
  v_first_time time;
  v_first_team uuid;
  v_first_technician text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.has_screen_permission('installationSchedule','edit') then raise exception 'ليس لديك صلاحية تعديل جدولة التركيبات'; end if;
  if p_request_id is null then raise exception 'معرّف طلب التركيب مطلوب'; end if;
  if jsonb_typeof(p_visits)<>'array' or jsonb_array_length(p_visits)<2 then raise exception 'يجب إضافة يومين على الأقل لتقسيم الطلب'; end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then raise exception 'الطلب خارج نطاقك التشغيلي'; end if;

  if exists(
    select 1 from public.installation_execution_visits ev
    join public.installation_execution_visit_services es on es.visit_id=ev.id
    where ev.installation_request_id=p_request_id and coalesce(es.executed_quantity,0)>0
  ) then raise exception 'لا يمكن إعادة توزيع طلب بدأ تنفيذه. استخدم مسار تأكيد الكميات وإعادة الجدولة.'; end if;

  -- Validate every service is distributed exactly once across all visits.
  for svc in select id,quantity from public.installation_request_services where installation_request_id=p_request_id loop
    select coalesce(sum((line->>'quantity')::numeric),0) into v_total
    from jsonb_array_elements(p_visits) visit,
         jsonb_array_elements(coalesce(visit->'services','[]'::jsonb)) line
    where nullif(line->>'request_service_id','')::uuid=svc.id;
    v_expected:=coalesce(svc.quantity,0);
    if v_total<>v_expected then
      raise exception 'توزيع كميات الخدمات غير مكتمل. المطلوب % والموزع %',v_expected,v_total;
    end if;
  end loop;

  -- Ensure payload does not contain unknown services or negative quantities.
  if exists(
    select 1
    from jsonb_array_elements(p_visits) visit,
         jsonb_array_elements(coalesce(visit->'services','[]'::jsonb)) line
    where coalesce((line->>'quantity')::numeric,0)<0
       or not exists(select 1 from public.installation_request_services rs where rs.id=nullif(line->>'request_service_id','')::uuid and rs.installation_request_id=p_request_id)
  ) then raise exception 'يوجد بند خدمة أو كمية غير صالحة في توزيع الزيارات'; end if;

  -- Replace only not-started planned visits.
  delete from public.installation_execution_visits
  where installation_request_id=p_request_id and status in ('مجدولة','بانتظار التأكيد');

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

    insert into public.installation_execution_visits(installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status)
    values(p_request_id,v_no,v_date,v_time,v_team,v_technician,'مجدولة') returning id into v_visit_id;

    insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
    select v_visit_id,nullif(line->>'request_service_id','')::uuid,(line->>'quantity')::numeric
    from jsonb_array_elements(coalesce(v->'services','[]'::jsonb)) line
    where coalesce((line->>'quantity')::numeric,0)>0;

    if v_no=1 then v_first_date:=v_date;v_first_time:=v_time;v_first_team:=v_team;v_first_technician:=v_technician; end if;
  end loop;

  update public.installation_requests set
    scheduled_date=v_first_date,scheduled_time=v_first_time,time_slot=null,
    installation_team_id=v_first_team,assigned_technician_name=v_first_technician,technician_id=null,
    status='مسند',assignment_notes=nullif(trim(coalesce(p_assignment_notes,'')),''),
    completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null,updated_at=now()
  where id=p_request_id;

  return jsonb_build_object('requestId',p_request_id,'visitsCount',v_no,'status','scheduled');
end;
$$;

grant execute on function public.schedule_installation_request_multi_day(uuid,jsonb,text) to authenticated;

-- Include visit bookings in availability lookup.
create or replace function public.get_installation_technician_booked_times(p_schedule_date date,p_technician_name text,p_exclude_request_id uuid default null)
returns table(scheduled_time time,request_number text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_screen_permission('installationSchedule','view') then raise exception 'ليس لديك صلاحية عرض جدولة التركيبات'; end if;
  return query
  select distinct q.scheduled_time,q.request_number from (
    select r.scheduled_time,r.request_number
    from public.installation_requests r
    where r.scheduled_date=p_schedule_date and r.scheduled_time is not null
      and lower(regexp_replace(trim(coalesce(r.assigned_technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(p_technician_name,'')),'\s+',' ','g'))
      and (p_exclude_request_id is null or r.id<>p_exclude_request_id)
      and coalesce(r.status,'') not in ('ملغي','ملغاة')
    union all
    select v.scheduled_time,r.request_number
    from public.installation_execution_visits v join public.installation_requests r on r.id=v.installation_request_id
    where v.scheduled_date=p_schedule_date and v.scheduled_time is not null
      and lower(regexp_replace(trim(coalesce(v.technician_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(p_technician_name,'')),'\s+',' ','g'))
      and (p_exclude_request_id is null or v.installation_request_id<>p_exclude_request_id)
      and v.status not in ('ملغاة','مؤكدة')
  ) q;
end $$;

grant execute on function public.get_installation_technician_booked_times(date,text,uuid) to authenticated;

commit;
