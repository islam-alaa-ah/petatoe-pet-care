begin;

-- Phase M15.11 — Multi-Day Execution Visit Isolation
-- Each scheduled execution visit owns its own selection state and execution timeline.

alter table public.installation_execution_visits
  add column if not exists selected_for_execution_at timestamptz,
  add column if not exists selected_for_execution_by uuid references auth.users(id) on delete set null,
  add column if not exists on_route_at timestamptz,
  add column if not exists map_opened_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists execution_notes text,
  add column if not exists last_status_changed_at timestamptz,
  add column if not exists last_status_changed_by uuid references auth.users(id) on delete set null;

create index if not exists installation_execution_visits_selected_by_idx
  on public.installation_execution_visits(selected_for_execution_by, selected_for_execution_at)
  where selected_for_execution_at is not null;

-- Safe historical backfill: copy the legacy request timeline only to the visit whose
-- scheduled day matches the actual execution day in Saudi time. This prevents a
-- completed first visit from contaminating later scheduled visits of the same request.
with legacy as (
  select r.id request_id,
         r.on_route_at,r.map_opened_at,r.arrived_at,r.started_at,r.completed_at,r.execution_notes,
         r.last_status_changed_at,r.last_status_changed_by,
         coalesce(r.on_route_at,r.map_opened_at,r.arrived_at,r.started_at,r.completed_at) first_event
  from public.installation_requests r
  where r.on_route_at is not null or r.map_opened_at is not null or r.arrived_at is not null or r.started_at is not null or r.completed_at is not null
), matched as (
  select distinct on (l.request_id)
         l.*, v.id visit_id
  from legacy l
  join public.installation_execution_visits v on v.installation_request_id=l.request_id
  where v.scheduled_date = ((l.first_event at time zone 'Asia/Riyadh')::date)
  order by l.request_id, v.visit_no
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

create or replace function public.get_current_installation_execution_visit_id()
returns uuid language sql security definer set search_path=public as $$
  select v.id
  from public.installation_execution_visits v
  join public.installation_requests r on r.id=v.installation_request_id
  where v.selected_for_execution_by=auth.uid()
    and v.selected_for_execution_at is not null
    and v.status in ('مجدولة','قيد التنفيذ')
    and public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
    and public.can_access_installation_assignment(v.installation_team_id,v.technician_name)
  order by v.selected_for_execution_at desc
  limit 1
$$;
grant execute on function public.get_current_installation_execution_visit_id() to authenticated;

create or replace function public.select_installation_execution_visit(p_request_id uuid,p_visit_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; v_id uuid;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية بدء تنفيذ التركيبات'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  v_id:=coalesce(p_visit_id,public.ensure_installation_execution_visit(p_request_id));
  select * into v from public.installation_execution_visits where id=v_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  if v.status not in ('مجدولة','قيد التنفيذ') or v.completed_at is not null then raise exception 'لا يمكن بدء زيارة التنفيذ في حالتها الحالية'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
     or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then raise exception 'هذه الزيارة غير مرتبطة بفرقتك واسم الفني الخاص بك'; end if;
  if exists(select 1 from public.installation_execution_visits x where x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null and x.status in ('مجدولة','قيد التنفيذ') and x.id<>v.id) then raise exception 'يوجد تنفيذ حالي نشط بالفعل'; end if;
  update public.installation_execution_visits set selected_for_execution_at=coalesce(selected_for_execution_at,now()),selected_for_execution_by=auth.uid(),updated_at=now() where id=v.id;
  update public.installation_requests set status=case when status in ('بانتظار المراجعة','جديد','مجدول','بانتظار الجدولة') then 'مسند' else status end where id=r.id;
  return v.id;
end;$$;
grant execute on function public.select_installation_execution_visit(uuid,uuid) to authenticated;

create or replace function public.record_installation_visit_map_opened(p_request_id uuid,p_visit_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype;
begin
  select * into r from public.installation_requests where id=p_request_id;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id) or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then raise exception 'الزيارة غير مسموحة'; end if;
  if v.selected_for_execution_by is distinct from auth.uid() then raise exception 'الزيارة ليست التنفيذ الحالي لهذا المستخدم'; end if;
  if v.on_route_at is null then raise exception 'ابدأ التحرك أولاً'; end if;
  update public.installation_execution_visits set map_opened_at=coalesce(map_opened_at,now()),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now() where id=v.id;
end;$$;
grant execute on function public.record_installation_visit_map_opened(uuid,uuid) to authenticated;

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
  if p_next_status='مكتمل' then
    update public.installation_requests set status='مكتمل',completed_at=now(),scheduled_date=v.scheduled_date,scheduled_time=v.scheduled_time,installation_team_id=v.installation_team_id,assigned_technician_name=v.technician_name where id=r.id;
  end if;
end;$$;
grant execute on function public.advance_installation_execution_visit_stage(uuid,uuid,text,text) to authenticated;

create or replace function public.get_installation_execution_visit_quantity_summary(p_request_id uuid,p_visit_id uuid)
returns table(request_id uuid,request_service_id uuid,service_name text,requested_quantity numeric,scheduled_current_quantity numeric,executed_quantity numeric,remaining_quantity numeric,unit_price numeric,executed_value numeric,remaining_value numeric,current_visit_id uuid,current_visit_no integer)
language sql security definer set search_path=public as $$
  with confirmed as (
    select vs.request_service_id,sum(coalesce(vs.executed_quantity,0)) executed_quantity
    from public.installation_execution_visit_services vs join public.installation_execution_visits v on v.id=vs.visit_id
    where v.installation_request_id=p_request_id and v.status='مؤكدة' and v.id<>p_visit_id group by vs.request_service_id
  )
  select s.installation_request_id,s.id,coalesce(st.name,'خدمة'),s.quantity,
         coalesce(vs.scheduled_quantity,0),coalesce(c.executed_quantity,0),greatest(s.quantity-coalesce(c.executed_quantity,0),0),s.unit_price,
         coalesce(c.executed_quantity,0)*s.unit_price,greatest(s.quantity-coalesce(c.executed_quantity,0),0)*s.unit_price,v.id,v.visit_no
  from public.installation_request_services s
  join public.installation_execution_visits v on v.id=p_visit_id and v.installation_request_id=s.installation_request_id
  left join public.installation_execution_visit_services vs on vs.visit_id=v.id and vs.request_service_id=s.id
  left join confirmed c on c.request_service_id=s.id
  left join public.installation_service_types st on st.id=s.service_type_id
  where s.installation_request_id=p_request_id
$$;
grant execute on function public.get_installation_execution_visit_quantity_summary(uuid,uuid) to authenticated;

create or replace function public.confirm_installation_execution_visit_quantities(p_request_id uuid,p_visit_id uuid,p_lines jsonb,p_remaining_action text,p_schedule jsonb default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; line jsonb; s public.installation_request_services%rowtype; executed numeric; already numeric; remaining numeric; total_remaining numeric:=0; nextv public.installation_execution_visits%rowtype;
begin
  if not public.has_screen_permission('installationCompletion','edit') then raise exception 'لا توجد صلاحية تأكيد تنفيذ التركيبات'; end if;
  if p_remaining_action not in ('reschedule_now','schedule_later','completed') then raise exception 'إجراء المتبقي غير صحيح'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found or v.status<>'بانتظار التأكيد' then raise exception 'زيارة التنفيذ ليست بانتظار التأكيد'; end if;
  for line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select * into s from public.installation_request_services where id=(line->>'requestServiceId')::uuid and installation_request_id=p_request_id for update;
    if not found then raise exception 'خدمة غير صالحة داخل الطلب'; end if;
    executed:=coalesce((line->>'executedQuantity')::numeric,0);
    select coalesce(sum(coalesce(vs.executed_quantity,0)),0) into already from public.installation_execution_visit_services vs join public.installation_execution_visits vv on vv.id=vs.visit_id where vv.installation_request_id=p_request_id and vv.status='مؤكدة' and vv.id<>v.id and vs.request_service_id=s.id;
    if executed<0 or already+executed>s.quantity then raise exception 'الكمية المنفذة غير صالحة للخدمة %',s.id; end if;
    update public.installation_execution_visit_services set executed_quantity=executed,updated_at=now() where visit_id=v.id and request_service_id=s.id;
    remaining:=greatest(s.quantity-(already+executed),0); total_remaining:=total_remaining+remaining;
    insert into public.installation_execution_quantity_audit(installation_request_id,visit_id,request_service_id,scheduled_quantity,confirmed_quantity,remaining_quantity,action,notes)
    values(p_request_id,v.id,s.id,coalesce((line->>'scheduledQuantity')::numeric,0),executed,remaining,case when remaining=0 then 'completed' else p_remaining_action end,nullif(trim(coalesce(p_notes,'')),''));
  end loop;
  update public.installation_execution_visits set status='مؤكدة',confirmed_at=now(),confirmed_by=auth.uid(),confirmation_notes=nullif(trim(coalesce(p_notes,'')),''),selected_for_execution_at=null,selected_for_execution_by=null,updated_at=now() where id=v.id;
  if total_remaining=0 then update public.installation_requests set status='مكتمل',completed_at=coalesce(completed_at,now()),selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id; return jsonb_build_object('status','completed','remainingQuantity',0,'visitNo',v.visit_no); end if;
  select * into nextv from public.installation_execution_visits where installation_request_id=p_request_id and id<>v.id and status='مجدولة' and scheduled_date>=coalesce(v.scheduled_date,current_date) order by scheduled_date,scheduled_time,visit_no limit 1;
  if found then
    update public.installation_requests set status='مسند',scheduled_date=nextv.scheduled_date,scheduled_time=nextv.scheduled_time,installation_team_id=nextv.installation_team_id,assigned_technician_name=nextv.technician_name,completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
    return jsonb_build_object('status','existing_next_visit','remainingQuantity',total_remaining,'visitNo',v.visit_no,'nextVisitId',nextv.id);
  end if;
  if p_remaining_action='reschedule_now' then perform public.schedule_installation_request_visit(p_request_id,(p_schedule->>'scheduledDate')::date,(p_schedule->>'scheduledTime')::time,(p_schedule->>'teamId')::uuid,nullif(trim(p_schedule->>'technicianName'),''),coalesce(p_schedule->>'assignmentNotes','استكمال الكمية المتبقية')); return jsonb_build_object('status','rescheduled','remainingQuantity',total_remaining,'visitNo',v.visit_no); end if;
  update public.installation_requests set status='بانتظار الجدولة',scheduled_date=null,scheduled_time=null,installation_team_id=null,assigned_technician_name=null,completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=p_request_id;
  return jsonb_build_object('status','pending_schedule','remainingQuantity',total_remaining,'visitNo',v.visit_no);
end;$$;
grant execute on function public.confirm_installation_execution_visit_quantities(uuid,uuid,jsonb,text,jsonb,text) to authenticated;

commit;
