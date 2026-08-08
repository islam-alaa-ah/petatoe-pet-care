begin;

-- Phase M15.11.2 — Completion handoff + remaining quantity routing
-- 1) A finished visit leaves Current Execution immediately and enters quantity confirmation.
-- 2) A quantity mismatch can be appended to the already scheduled next visit or returned to scheduling.
-- 3) A returned remainder is represented by an unscheduled visit, preserving any existing future appointment.

-- Extend visit status vocabulary with an explicit unscheduled remainder state.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.installation_execution_visits'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.installation_execution_visits drop constraint if exists %I',c.conname);
  end loop;
end $$;

alter table public.installation_execution_visits
  add constraint installation_execution_visits_status_check
  check(status in ('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة','ملغاة'));

-- Extend audit actions without losing previous audit vocabulary.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.installation_execution_quantity_audit'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.installation_execution_quantity_audit drop constraint if exists %I',c.conname);
  end loop;
end $$;

alter table public.installation_execution_quantity_audit
  add constraint installation_execution_quantity_audit_action_check
  check(action in ('completed','reschedule_now','schedule_later','preserve_existing','append_to_next_visit','return_to_schedule'));

-- Conservative repair for historical visits that clearly reached the old final-status timestamp,
-- lost completed_at during migration, are no longer selected, and have a later visit.
update public.installation_execution_visits v
set completed_at=r.last_status_changed_at,
    status='بانتظار التأكيد',
    updated_at=now()
from public.installation_requests r
where r.id=v.installation_request_id
  and v.started_at is not null
  and v.completed_at is null
  and v.selected_for_execution_at is null
  and v.selected_for_execution_by is null
  and r.last_status_changed_at is not null
  and r.last_status_changed_at > v.started_at
  and (r.last_status_changed_at at time zone 'Asia/Riyadh')::date=v.scheduled_date
  and exists (
    select 1 from public.installation_execution_visits later
    where later.installation_request_id=v.installation_request_id
      and later.visit_no>v.visit_no
      and later.status in ('بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد')
  );

-- Single-day scheduler reuses an explicitly returned, unscheduled remainder visit even if
-- the request already has another scheduled future visit.
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
  if not public.has_screen_permission('installationSchedule','edit') then raise exception 'لا توجد صلاحية جدولة وإسناد طلبات التركيبات'; end if;
  if p_scheduled_date is null or p_scheduled_time is null or p_team_id is null or nullif(trim(p_technician_name),'') is null then raise exception 'بيانات الجدولة والفرقة والفني مطلوبة'; end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,p_team_id) then raise exception 'الطلب أو الفرقة خارج نطاقك التشغيلي'; end if;

  select id into v_id
  from public.installation_execution_visits
  where installation_request_id=p_request_id and status='بانتظار الجدولة'
  order by visit_no limit 1 for update;

  if v_id is null then
    select count(*) into active_count
    from public.installation_execution_visits
    where installation_request_id=p_request_id and status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد');
    if active_count>1 then raise exception 'الطلب لديه أكثر من زيارة نشطة؛ استخدم جدولة الأيام المتعددة'; end if;

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

-- Finishing a visit means "waiting for quantity confirmation", not completing the parent request.
create or replace function public.advance_installation_execution_visit_stage(p_request_id uuid,p_visit_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  expected text;
  nextv public.installation_execution_visits%rowtype;
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
    selected_for_execution_at=case when p_next_status='مكتمل' then null else selected_for_execution_at end,
    selected_for_execution_by=case when p_next_status='مكتمل' then null else selected_for_execution_by end,
    execution_notes=nullif(trim(coalesce(p_notes,'')),''),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now()
  where id=v.id;

  if p_next_status='مكتمل' then
    select * into nextv from public.installation_execution_visits
    where installation_request_id=p_request_id and id<>v.id and status='مجدولة'
      and (scheduled_date>v.scheduled_date or (scheduled_date=v.scheduled_date and coalesce(scheduled_time,'00:00')>coalesce(v.scheduled_time,'00:00')))
    order by scheduled_date,scheduled_time,visit_no limit 1;

    update public.installation_requests
    set status=case when nextv.id is not null then 'مسند' else 'قيد التنفيذ' end,
        scheduled_date=coalesce(nextv.scheduled_date,v.scheduled_date),
        scheduled_time=coalesce(nextv.scheduled_time,v.scheduled_time),
        installation_team_id=coalesce(nextv.installation_team_id,v.installation_team_id),
        assigned_technician_name=coalesce(nextv.technician_name,v.technician_name),
        completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null
    where id=r.id;
  end if;
end;
$$;
grant execute on function public.advance_installation_execution_visit_stage(uuid,uuid,text,text) to authenticated;

-- Confirm actual quantities and route only the difference from the current visit.
create or replace function public.confirm_installation_execution_visit_quantities(p_request_id uuid,p_visit_id uuid,p_lines jsonb,p_remaining_action text,p_schedule jsonb default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  nextv public.installation_execution_visits%rowtype;
  pendingv public.installation_execution_visits%rowtype;
  line jsonb;
  s public.installation_request_services%rowtype;
  curvs public.installation_execution_visit_services%rowtype;
  executed numeric;
  already numeric;
  remaining numeric;
  total_remaining numeric:=0;
  mismatch boolean:=false;
  pending_created boolean:=false;
  v_no integer;
  future_other numeric;
  target_next numeric;
  pending_qty numeric;
begin
  if not public.has_screen_permission('installationCompletion','edit') then raise exception 'لا توجد صلاحية تأكيد تنفيذ التركيبات'; end if;
  if p_remaining_action not in ('completed','preserve_existing','append_to_next_visit','return_to_schedule') then raise exception 'إجراء المتبقي غير صحيح'; end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found or v.status<>'بانتظار التأكيد' then raise exception 'زيارة التنفيذ ليست بانتظار التأكيد'; end if;

  select * into nextv from public.installation_execution_visits
  where installation_request_id=p_request_id and id<>v.id and status='مجدولة'
    and (scheduled_date>v.scheduled_date or (scheduled_date=v.scheduled_date and coalesce(scheduled_time,'00:00')>coalesce(v.scheduled_time,'00:00')))
  order by scheduled_date,scheduled_time,visit_no limit 1 for update;

  for line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select * into s from public.installation_request_services where id=(line->>'requestServiceId')::uuid and installation_request_id=p_request_id for update;
    if not found then raise exception 'خدمة غير صالحة داخل الطلب'; end if;
    select * into curvs from public.installation_execution_visit_services where visit_id=v.id and request_service_id=s.id for update;
    executed:=coalesce((line->>'executedQuantity')::numeric,0);
    select coalesce(sum(coalesce(vs.executed_quantity,0)),0) into already
    from public.installation_execution_visit_services vs join public.installation_execution_visits vv on vv.id=vs.visit_id
    where vv.installation_request_id=p_request_id and vv.status='مؤكدة' and vv.id<>v.id and vs.request_service_id=s.id;
    if executed<0 or already+executed>s.quantity then raise exception 'الكمية المنفذة غير صالحة للخدمة %',s.id; end if;
    mismatch:=mismatch or executed<>coalesce(curvs.scheduled_quantity,0);
    update public.installation_execution_visit_services set executed_quantity=executed,updated_at=now() where id=curvs.id;
    remaining:=greatest(s.quantity-(already+executed),0); total_remaining:=total_remaining+remaining;
    insert into public.installation_execution_quantity_audit(installation_request_id,visit_id,request_service_id,scheduled_quantity,confirmed_quantity,remaining_quantity,action,notes)
    values(p_request_id,v.id,s.id,coalesce(curvs.scheduled_quantity,0),executed,remaining,case when remaining=0 then 'completed' else p_remaining_action end,nullif(trim(coalesce(p_notes,'')),''));
  end loop;

  if total_remaining>0 and mismatch and p_remaining_action='preserve_existing' then raise exception 'اختر طريقة معالجة فرق الكمية قبل الاعتماد'; end if;
  if total_remaining>0 and mismatch and p_remaining_action='append_to_next_visit' and nextv.id is null then raise exception 'لا يوجد موعد مجدول لاحق لإضافة فرق الكمية إليه'; end if;

  update public.installation_execution_visits set status='مؤكدة',confirmed_at=now(),confirmed_by=auth.uid(),confirmation_notes=nullif(trim(coalesce(p_notes,'')),''),selected_for_execution_at=null,selected_for_execution_by=null,updated_at=now() where id=v.id;

  if total_remaining=0 then
    update public.installation_requests set status='مكتمل',completed_at=coalesce(v.completed_at,now()),selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
    return jsonb_build_object('status','completed','remainingQuantity',0,'visitNo',v.visit_no);
  end if;

  -- Rebalance the next scheduled visit to the real remaining quantity after confirmation.
  if nextv.id is not null and (not mismatch or p_remaining_action in ('preserve_existing','append_to_next_visit','return_to_schedule')) then
    for s in select * from public.installation_request_services where installation_request_id=p_request_id loop
      select greatest(s.quantity-coalesce(sum(coalesce(vs.executed_quantity,0)),0),0) into remaining
      from public.installation_execution_visit_services vs join public.installation_execution_visits vv on vv.id=vs.visit_id
      where vv.installation_request_id=p_request_id and vv.status='مؤكدة' and vs.request_service_id=s.id;

      if p_remaining_action='append_to_next_visit' or not mismatch then
        select coalesce(sum(coalesce(vs2.scheduled_quantity,0)),0) into future_other
        from public.installation_execution_visit_services vs2 join public.installation_execution_visits vv2 on vv2.id=vs2.visit_id
        where vv2.installation_request_id=p_request_id and vv2.status='مجدولة' and vv2.id<>nextv.id and vs2.request_service_id=s.id;
        target_next:=greatest(remaining-future_other,0);
        insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
        values(nextv.id,s.id,target_next)
        on conflict(visit_id,request_service_id) do update set scheduled_quantity=excluded.scheduled_quantity,updated_at=now();
      elsif p_remaining_action='return_to_schedule' then
        -- Keep the existing appointment as much as possible, but never let it exceed the real remaining quantity.
        select coalesce(sum(coalesce(vs2.scheduled_quantity,0)),0) into future_other
        from public.installation_execution_visit_services vs2 join public.installation_execution_visits vv2 on vv2.id=vs2.visit_id
        where vv2.installation_request_id=p_request_id and vv2.status='مجدولة' and vv2.id<>nextv.id and vs2.request_service_id=s.id;
        select least(coalesce((select scheduled_quantity from public.installation_execution_visit_services where visit_id=nextv.id and request_service_id=s.id),0),greatest(remaining-future_other,0)) into target_next;
        insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
        values(nextv.id,s.id,target_next)
        on conflict(visit_id,request_service_id) do update set scheduled_quantity=excluded.scheduled_quantity,updated_at=now();
      end if;
    end loop;
  end if;

  if mismatch and p_remaining_action='return_to_schedule' then
    select coalesce(max(visit_no),0)+1 into v_no from public.installation_execution_visits where installation_request_id=p_request_id;
    insert into public.installation_execution_visits(installation_request_id,visit_no,status)
    values(p_request_id,v_no,'بانتظار الجدولة') returning * into pendingv;

    for s in select * from public.installation_request_services where installation_request_id=p_request_id loop
      select greatest(s.quantity-coalesce(sum(coalesce(vs.executed_quantity,0)),0),0) into remaining
      from public.installation_execution_visit_services vs join public.installation_execution_visits vv on vv.id=vs.visit_id
      where vv.installation_request_id=p_request_id and vv.status='مؤكدة' and vs.request_service_id=s.id;
      select coalesce(sum(coalesce(vs2.scheduled_quantity,0)),0) into future_other
      from public.installation_execution_visit_services vs2 join public.installation_execution_visits vv2 on vv2.id=vs2.visit_id
      where vv2.installation_request_id=p_request_id and vv2.status='مجدولة' and vs2.request_service_id=s.id;
      pending_qty:=greatest(remaining-future_other,0);
      if pending_qty>0 then
        pending_created:=true;
        insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity)
        values(pendingv.id,s.id,pending_qty)
        on conflict(visit_id,request_service_id) do update set scheduled_quantity=excluded.scheduled_quantity,updated_at=now();
      end if;
    end loop;
    if not pending_created then delete from public.installation_execution_visits where id=pendingv.id; end if;
  end if;

  if pending_created then
    update public.installation_requests set status='بانتظار الجدولة',completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
    return jsonb_build_object('status','pending_schedule','remainingQuantity',total_remaining,'visitNo',v.visit_no,'pendingVisitId',pendingv.id,'nextVisitId',nextv.id);
  end if;

  if nextv.id is not null then
    update public.installation_requests set status='مسند',scheduled_date=nextv.scheduled_date,scheduled_time=nextv.scheduled_time,installation_team_id=nextv.installation_team_id,assigned_technician_name=nextv.technician_name,completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
    return jsonb_build_object('status',case when mismatch then 'next_visit_adjusted' else 'existing_next_visit' end,'remainingQuantity',total_remaining,'visitNo',v.visit_no,'nextVisitId',nextv.id);
  end if;

  -- No existing future appointment: return all remaining quantities to scheduling.
  if not pending_created then
    select coalesce(max(visit_no),0)+1 into v_no from public.installation_execution_visits where installation_request_id=p_request_id;
    insert into public.installation_execution_visits(installation_request_id,visit_no,status)
    values(p_request_id,v_no,'بانتظار الجدولة') returning * into pendingv;
    for s in select * from public.installation_request_services where installation_request_id=p_request_id loop
      select greatest(s.quantity-coalesce(sum(coalesce(vs.executed_quantity,0)),0),0) into remaining
      from public.installation_execution_visit_services vs join public.installation_execution_visits vv on vv.id=vs.visit_id
      where vv.installation_request_id=p_request_id and vv.status='مؤكدة' and vs.request_service_id=s.id;
      if remaining>0 then insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity) values(pendingv.id,s.id,remaining); end if;
    end loop;
  end if;
  update public.installation_requests set status='بانتظار الجدولة',scheduled_date=null,scheduled_time=null,installation_team_id=null,assigned_technician_name=null,completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
  return jsonb_build_object('status','pending_schedule','remainingQuantity',total_remaining,'visitNo',v.visit_no,'pendingVisitId',pendingv.id);
end;
$$;
grant execute on function public.confirm_installation_execution_visit_quantities(uuid,uuid,jsonb,text,jsonb,text) to authenticated;

commit;
