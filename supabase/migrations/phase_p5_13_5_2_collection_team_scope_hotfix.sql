-- P5.13.5.2 — Collection stage team-scope hotfix
-- Aligns the mandatory collection checkpoint with the canonical team-scoped execution model.
-- selected_for_execution_by remains audit metadata only and is not a visibility/progression gate.

begin;

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

  select * into r
  from public.installation_requests
  where id=p_request_id
  for update;
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
    select * into v
    from public.installation_execution_visits
    where id=p_visit_id and installation_request_id=p_request_id
    for update;
    if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;

    ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
    select * into a
    from public.installation_execution_visits
    where id=any(ids)
    order by visit_no,scheduled_time,id::text
    limit 1;

    -- Super admin is unrestricted. Other users must have access to the active team/assignment.
    if public.current_user_role() <> 'super_admin'::public.app_role and
       (not public.can_access_installation_request_scope(r.representative_id,a.installation_team_id)
        or not public.can_access_installation_assignment(a.installation_team_id,a.technician_name)) then
      raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك';
    end if;

    -- Canonical active-execution rule: the visit group is active for the team, regardless of who started it.
    if not exists(
      select 1
      from public.installation_execution_visits x
      where x.id=any(ids)
        and x.selected_for_execution_at is not null
        and x.completed_at is null
    ) then
      raise exception 'هذه الزيارة ليست قيد التنفيذ';
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
    -- Legacy single-request fallback follows the same team/super-admin execution rule.
    if public.current_user_role() <> 'super_admin'::public.app_role and
       (not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
        or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)) then
      raise exception 'هذا الموعد غير مرتبط بفرقتك والجرومر الخاص بك';
    end if;

    if r.selected_for_execution_at is null or r.completed_at is not null then
      raise exception 'هذا الموعد ليس قيد التنفيذ';
    end if;
    if r.started_at is null then raise exception 'ابدأ الموعد قبل مرحلة التحصيل'; end if;
    if r.collection_at is not null then raise exception 'تم تأكيد مرحلة التحصيل مسبقًا'; end if;
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

commit;
