-- P5.12.9 — Mandatory Appointment Collection Stage
-- Adds a mandatory execution checkpoint between appointment start and completion.
-- The checkpoint is enforced in the database and records collection details against the appointment.

begin;

alter table public.installation_requests
  add column if not exists collection_at timestamptz;

alter table public.installation_execution_visits
  add column if not exists collection_at timestamptz;

alter table public.installation_request_collection
  add column if not exists collection_reference text,
  add column if not exists collection_notes text,
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by uuid;

create or replace function public.complete_installation_collection_stage(
  p_request_id uuid,
  p_visit_id uuid default null,
  p_amount_received numeric default 0,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  a public.installation_execution_visits%rowtype;
  ids uuid[];
  existing_amount numeric:=0;
  remaining_amount numeric:=0;
  received numeric:=greatest(coalesce(p_amount_received,0),0);
  method text:=nullif(trim(coalesce(p_payment_method,'')),'');
  stamp timestamptz:=now();
begin
  if not public.has_screen_permission('installationExecution','edit') then
    raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;

  select coalesce(amount_collected,0)
    into existing_amount
  from public.installation_request_collection
  where installation_request_id=p_request_id
  for update;
  if not found then existing_amount:=0; end if;

  remaining_amount:=greatest(coalesce(r.final_amount,0)-existing_amount,0);
  if received>remaining_amount+0.005 then
    raise exception 'المبلغ المستلم يتجاوز المبلغ المتبقي للتحصيل';
  end if;
  if remaining_amount>0 and received<=0 then
    raise exception 'يجب تسجيل مبلغ التحصيل قبل إنهاء الموعد';
  end if;
  if received>0 and method is null then
    raise exception 'طريقة التحصيل مطلوبة';
  end if;

  if p_visit_id is not null then
    select * into v from public.installation_execution_visits
      where id=p_visit_id and installation_request_id=p_request_id for update;
    if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;

    ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
    select * into a from public.installation_execution_visits
      where id=any(ids) order by visit_no,scheduled_time limit 1;

    if not public.can_access_installation_request_scope(r.representative_id,a.installation_team_id)
       or not public.can_access_installation_assignment(a.installation_team_id,a.technician_name) then
      raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك';
    end if;
    if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null) then
      raise exception 'هذه الزيارة ليست التنفيذ الحالي لهذا المستخدم';
    end if;
    if a.started_at is null then raise exception 'ابدأ الموعد قبل مرحلة التحصيل'; end if;
    if a.collection_at is not null then raise exception 'تم تأكيد مرحلة التحصيل مسبقًا'; end if;
    if a.completed_at is not null then raise exception 'لا يمكن تعديل التحصيل بعد انتهاء الموعد'; end if;

    update public.installation_execution_visits
      set collection_at=coalesce(collection_at,stamp),
          last_status_changed_at=stamp,
          last_status_changed_by=auth.uid(),
          updated_at=stamp
    where id=any(ids);
  else
    if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
       or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name) then
      raise exception 'هذا الموعد غير مرتبط بفرقتك والجرومر الخاص بك';
    end if;
    if r.selected_for_execution_by is distinct from auth.uid() or r.selected_for_execution_at is null then
      raise exception 'هذا الموعد ليس التنفيذ الحالي لهذا المستخدم';
    end if;
    if r.started_at is null then raise exception 'ابدأ الموعد قبل مرحلة التحصيل'; end if;
    if r.collection_at is not null then raise exception 'تم تأكيد مرحلة التحصيل مسبقًا'; end if;
    if r.completed_at is not null then raise exception 'لا يمكن تعديل التحصيل بعد انتهاء الموعد'; end if;
  end if;

  insert into public.installation_request_collection(
    installation_request_id,session_value,total_discount,amount_collected,
    collection_status,payment_method,appointment_status,collection_reference,
    collection_notes,collected_at,collected_by,updated_at
  ) values (
    p_request_id,coalesce(r.final_amount,0),coalesce(r.discount_amount,0),existing_amount+received,
    case when existing_amount+received>=coalesce(r.final_amount,0)-0.005 then 'محصل بالكامل' else 'محصل جزئيًا' end,
    coalesce(method,(select payment_method from public.installation_request_collection where installation_request_id=p_request_id)),
    'قيد التنفيذ',nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),stamp,auth.uid(),stamp
  )
  on conflict (installation_request_id) do update set
    amount_collected=excluded.amount_collected,
    collection_status=excluded.collection_status,
    payment_method=coalesce(excluded.payment_method,public.installation_request_collection.payment_method),
    appointment_status='قيد التنفيذ',
    collection_reference=excluded.collection_reference,
    collection_notes=excluded.collection_notes,
    collected_at=excluded.collected_at,
    collected_by=excluded.collected_by,
    updated_at=excluded.updated_at;

  update public.installation_requests
    set collection_at=coalesce(collection_at,stamp)
  where id=p_request_id;
end;
$$;

grant execute on function public.complete_installation_collection_stage(uuid,uuid,numeric,text,text,text) to authenticated;

-- Canonical grouped-visit stage progression. Completion is unavailable until collection_at exists.
create or replace function public.advance_installation_execution_visit_stage(p_request_id uuid,p_visit_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; v public.installation_execution_visits%rowtype; a public.installation_execution_visits%rowtype; ids uuid[]; expected text; nextv public.installation_execution_visits%rowtype;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  select * into a from public.installation_execution_visits where id=any(ids) order by visit_no,scheduled_time limit 1;
  if not public.can_access_installation_request_scope(r.representative_id,a.installation_team_id) or not public.can_access_installation_assignment(a.installation_team_id,a.technician_name) then raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك'; end if;
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null) then raise exception 'هذه الزيارة ليست التنفيذ الحالي لهذا المستخدم'; end if;
  expected:=case when a.on_route_at is null then 'في الطريق' when a.map_opened_at is null then null when a.arrived_at is null then 'وصل إلى العميل' when a.started_at is null then 'قيد التنفيذ' when a.collection_at is null then null when a.completed_at is null then 'مكتمل' else null end;
  if expected is distinct from p_next_status then
    if a.started_at is not null and a.collection_at is null and p_next_status='مكتمل' then raise exception 'يجب تأكيد مرحلة التحصيل قبل إنهاء الموعد'; end if;
    raise exception 'يجب تنفيذ مراحل الزيارة بالترتيب';
  end if;
  if p_next_status='وصل إلى العميل' and a.map_opened_at is null then raise exception 'افتح موقع العميل قبل تسجيل الوصول'; end if;
  update public.installation_execution_visits set
    on_route_at=case when p_next_status='في الطريق' then coalesce(on_route_at,now()) else on_route_at end,
    arrived_at=case when p_next_status='وصل إلى العميل' then coalesce(arrived_at,now()) else arrived_at end,
    started_at=case when p_next_status='قيد التنفيذ' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_next_status='مكتمل' then coalesce(completed_at,now()) else completed_at end,
    status=case when p_next_status='مكتمل' then 'بانتظار التأكيد' else 'قيد التنفيذ' end,
    selected_for_execution_at=case when p_next_status='مكتمل' then null else selected_for_execution_at end,
    selected_for_execution_by=case when p_next_status='مكتمل' then null else selected_for_execution_by end,
    execution_notes=nullif(trim(coalesce(p_notes,'')),''),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now()
  where id=any(ids);
  if p_next_status='مكتمل' then
    select * into nextv from public.installation_execution_visits where installation_request_id=p_request_id and not(id=any(ids)) and status='مجدولة' order by scheduled_date,scheduled_time,visit_no limit 1;
    update public.installation_requests set status=case when nextv.id is not null then 'مسند' else 'قيد التنفيذ' end,scheduled_date=coalesce(nextv.scheduled_date,a.scheduled_date),scheduled_time=coalesce(nextv.scheduled_time,a.scheduled_time),installation_team_id=coalesce(nextv.installation_team_id,a.installation_team_id),assigned_technician_name=coalesce(nextv.technician_name,a.technician_name),completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null where id=r.id;
  end if;
end;$$;

grant execute on function public.advance_installation_execution_visit_stage(uuid,uuid,text,text) to authenticated;

-- Legacy single-request execution follows the same mandatory collection gate.
create or replace function public.advance_installation_execution_stage(p_request_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; expected text;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name) then raise exception 'هذا الموعد غير مرتبط بفرقتك والجرومر الخاص بك'; end if;
  if r.selected_for_execution_by is distinct from auth.uid() or r.selected_for_execution_at is null then raise exception 'هذا الموعد ليس التنفيذ الحالي لهذا المستخدم'; end if;
  expected:=case when r.on_route_at is null then 'في الطريق' when r.map_opened_at is null then null when r.arrived_at is null then 'وصل إلى العميل' when r.started_at is null then 'قيد التنفيذ' when r.collection_at is null then null when r.completed_at is null then 'مكتمل' else null end;
  if expected is distinct from p_next_status then
    if r.started_at is not null and r.collection_at is null and p_next_status='مكتمل' then raise exception 'يجب تأكيد مرحلة التحصيل قبل إنهاء الموعد'; end if;
    raise exception 'يجب تنفيذ مراحل الموعد بالترتيب';
  end if;
  if p_next_status='وصل إلى العميل' and r.map_opened_at is null then raise exception 'افتح موقع العميل قبل تسجيل الوصول'; end if;
  update public.installation_requests set
    on_route_at=case when p_next_status='في الطريق' then coalesce(on_route_at,now()) else on_route_at end,
    arrived_at=case when p_next_status='وصل إلى العميل' then coalesce(arrived_at,now()) else arrived_at end,
    started_at=case when p_next_status='قيد التنفيذ' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_next_status='مكتمل' then coalesce(completed_at,now()) else completed_at end,
    status=p_next_status,
    execution_notes=nullif(trim(coalesce(p_notes,'')),''),
    selected_for_execution_at=case when p_next_status='مكتمل' then null else selected_for_execution_at end,
    selected_for_execution_by=case when p_next_status='مكتمل' then null else selected_for_execution_by end
  where id=p_request_id;
end;$$;

grant execute on function public.advance_installation_execution_stage(uuid,text,text) to authenticated;

-- Defense-in-depth: direct completion transitions cannot bypass collection.
create or replace function public.guard_mandatory_installation_collection_stage()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='installation_execution_visits' then
    if ((new.completed_at is not null and old.completed_at is null) or (new.status='بانتظار التأكيد' and old.status is distinct from 'بانتظار التأكيد')) and new.collection_at is null then
      raise exception 'يجب تأكيد مرحلة التحصيل قبل إنهاء الموعد';
    end if;
  else
    if ((new.completed_at is not null and old.completed_at is null) or (new.status='مكتمل' and old.status is distinct from 'مكتمل')) and new.collection_at is null then
      raise exception 'يجب تأكيد مرحلة التحصيل قبل إنهاء الموعد';
    end if;
  end if;
  return new;
end;$$;

drop trigger if exists trg_mandatory_collection_before_visit_completion on public.installation_execution_visits;
create trigger trg_mandatory_collection_before_visit_completion
before update on public.installation_execution_visits
for each row execute function public.guard_mandatory_installation_collection_stage();

drop trigger if exists trg_mandatory_collection_before_request_completion on public.installation_requests;
create trigger trg_mandatory_collection_before_request_completion
before update on public.installation_requests
for each row execute function public.guard_mandatory_installation_collection_stage();

commit;
