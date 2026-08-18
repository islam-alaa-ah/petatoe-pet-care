-- P5.13.8.39 — Scoped completion collection recovery
-- Strict scope: only historical/stuck execution visits that already reached
-- completion/awaiting-confirmation without a collection stage timestamp.
-- Normal active execution remains owned exclusively by complete_installation_collection_stage().
begin;

create or replace function public.get_installation_completion_collection_recovery_state(
  p_request_id uuid,
  p_visit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  ids uuid[];
  has_stage boolean:=false;
  all_finished boolean:=false;
  eligible boolean:=false;
  reason text:='';
begin
  if not public.has_screen_permission('installationCompletion','edit') then
    raise exception 'لا توجد صلاحية تأكيد تنفيذ المواعيد';
  end if;
  if p_request_id is null or p_visit_id is null then
    return jsonb_build_object('eligible',false,'confirmed',false,'reason','بيانات زيارة التنفيذ غير مكتملة.');
  end if;

  select * into r from public.installation_requests where id=p_request_id;
  if not found then return jsonb_build_object('eligible',false,'confirmed',false,'reason','الموعد غير موجود.'); end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id;
  if not found then return jsonb_build_object('eligible',false,'confirmed',false,'reason','زيارة التنفيذ غير موجودة لهذا الموعد.'); end if;

  if public.current_user_role() <> 'super_admin'::public.app_role and
     (not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
      or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name)) then
    raise exception 'هذه الزيارة غير مرتبطة بنطاق صلاحيتك';
  end if;

  ids:=public.get_installation_execution_group_visit_ids(p_request_id,p_visit_id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[p_visit_id]; end if;

  select exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.collection_at is not null)
    or r.collection_at is not null into has_stage;

  select not exists(
    select 1 from public.installation_execution_visits x
    where x.id=any(ids)
      and (x.completed_at is null or x.status not in ('بانتظار التأكيد','مؤكدة'))
  ) into all_finished;

  if has_stage then
    return jsonb_build_object('eligible',false,'confirmed',true,'reason','مرحلة التحصيل مؤكدة بالفعل.');
  end if;
  if v.started_at is null then
    return jsonb_build_object('eligible',false,'confirmed',false,'reason','لا يمكن استرداد التحصيل لزيارة لم تبدأ فعليًا.');
  end if;
  if not all_finished then
    return jsonb_build_object('eligible',false,'confirmed',false,'reason','الاسترداد متاح فقط لزيارة مكتملة عالقة بانتظار التأكيد؛ استخدم شاشة التنفيذ للحالات النشطة.');
  end if;

  eligible:=true;
  reason:='هذه الزيارة مكتملة وعالقة بدون علامة مرحلة التحصيل. راجع بيانات التحصيل الحالية ثم أكد المرحلة مرة واحدة.';
  return jsonb_build_object('eligible',eligible,'confirmed',false,'reason',reason,'visitIds',to_jsonb(ids));
end;
$$;

revoke all on function public.get_installation_completion_collection_recovery_state(uuid,uuid) from public,anon;
grant execute on function public.get_installation_completion_collection_recovery_state(uuid,uuid) to authenticated,service_role;

create or replace function public.recover_installation_completion_collection_stage(
  p_request_id uuid,
  p_visit_id uuid,
  p_amount_collected numeric,
  p_payment_method text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  ids uuid[];
  final_amount numeric:=0;
  amount numeric:=round(greatest(coalesce(p_amount_collected,0),0),2);
  method text:=nullif(trim(coalesce(p_payment_method,'')),'');
  stamp timestamptz:=now();
  state jsonb;
begin
  if not public.has_screen_permission('installationCompletion','edit') then
    raise exception 'لا توجد صلاحية تأكيد تنفيذ المواعيد';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;

  if public.current_user_role() <> 'super_admin'::public.app_role and
     (not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
      or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name)) then
    raise exception 'هذه الزيارة غير مرتبطة بنطاق صلاحيتك';
  end if;

  ids:=public.get_installation_execution_group_visit_ids(p_request_id,p_visit_id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[p_visit_id]; end if;

  -- Hard boundary: never use this recovery RPC for an active execution visit.
  if exists(
    select 1 from public.installation_execution_visits x
    where x.id=any(ids)
      and (x.completed_at is null or x.status not in ('بانتظار التأكيد','مؤكدة'))
  ) then
    raise exception 'الاسترداد متاح فقط للزيارات المكتملة العالقة؛ استخدم مرحلة التحصيل في شاشة التنفيذ للحالات النشطة';
  end if;

  if v.started_at is null then raise exception 'لا يمكن استرداد التحصيل لزيارة لم تبدأ فعليًا'; end if;
  if r.collection_at is not null or exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.collection_at is not null) then
    raise exception 'مرحلة التحصيل مؤكدة بالفعل';
  end if;

  final_amount:=round(greatest(coalesce(r.final_amount,0),0),2);
  if amount>final_amount+0.01 then raise exception 'المبلغ المحصل لا يمكن أن يتجاوز الإجمالي النهائي'; end if;
  if final_amount>0 and amount<=0 then raise exception 'سجل المبلغ المحصل الفعلي قبل تأكيد مرحلة التحصيل'; end if;
  if amount>0 and method is null then raise exception 'طريقة التحصيل مطلوبة'; end if;

  insert into public.installation_request_collection(
    installation_request_id,session_value,total_discount,amount_collected,
    collection_status,payment_method,appointment_status,collection_reference,
    collection_notes,collected_at,collected_by,updated_at
  ) values (
    p_request_id,final_amount,coalesce(r.discount_amount,0),amount,
    case when amount>=final_amount-0.01 then 'محصل بالكامل' else 'محصل جزئيًا' end,
    method,coalesce(r.status,'مكتمل'),null,
    nullif(trim(coalesce(p_notes,'')),''),stamp,auth.uid(),stamp
  )
  on conflict (installation_request_id) do update set
    session_value=excluded.session_value,
    total_discount=excluded.total_discount,
    amount_collected=excluded.amount_collected,
    collection_status=excluded.collection_status,
    payment_method=excluded.payment_method,
    collection_notes=coalesce(excluded.collection_notes,public.installation_request_collection.collection_notes),
    collected_at=excluded.collected_at,
    collected_by=excluded.collected_by,
    updated_at=excluded.updated_at;

  update public.installation_execution_visits
    set collection_at=stamp,updated_at=stamp
  where id=any(ids) and collection_at is null;

  update public.installation_requests
    set collection_at=stamp
  where id=p_request_id and collection_at is null;

  return jsonb_build_object('ok',true,'collectionAt',stamp,'visitIds',to_jsonb(ids));
end;
$$;

revoke all on function public.recover_installation_completion_collection_stage(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.recover_installation_completion_collection_stage(uuid,uuid,numeric,text,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
