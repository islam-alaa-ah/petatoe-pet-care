-- Phase P5.13.8.72 R29 — Safe execution queue pilot (S4B)
-- Scope: non-financial execution transitions only.
-- Financial collection/completion/invoice operations remain server-authoritative and online-only.
begin;

create table if not exists public.installation_execution_sync_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  operation_key text not null,
  predecessor_operation_key text null,
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  execution_visit_id uuid null references public.installation_execution_visits(id) on delete cascade,
  transition text not null check (transition in ('select','on_route','map_opened','arrived','start')),
  base_updated_at timestamptz null,
  result jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, operation_key)
);

create index if not exists idx_installation_execution_sync_operations_request
  on public.installation_execution_sync_operations(installation_request_id, execution_visit_id, applied_at desc);
create index if not exists idx_installation_execution_sync_operations_applied
  on public.installation_execution_sync_operations(applied_at desc);

alter table public.installation_execution_sync_operations enable row level security;
revoke all on table public.installation_execution_sync_operations from anon, authenticated;

create or replace function public.sync_installation_execution_transition(
  p_request_id uuid,
  p_visit_id uuid,
  p_transition text,
  p_operation_key text,
  p_predecessor_operation_key text default null,
  p_base_updated_at timestamptz default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  transition_name text:=lower(trim(coalesce(p_transition,'')));
  op public.installation_execution_sync_operations%rowtype;
  predecessor public.installation_execution_sync_operations%rowtype;
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  a public.installation_execution_visits%rowtype;
  effective_visit_id uuid:=p_visit_id;
  group_ids uuid[];
  server_updated_at timestamptz;
  target_applied boolean:=false;
  active_selected boolean:=false;
  selected_for_actor_elsewhere boolean:=false;
  result_payload jsonb;
  returned_visit_id uuid;
  access_team_id uuid;
  access_technician text;
begin
  if actor is null then raise exception 'يلزم تسجيل الدخول لمزامنة تنفيذ المواعيد'; end if;
  if p_request_id is null then raise exception 'معرّف الموعد مطلوب'; end if;
  if nullif(trim(coalesce(p_operation_key,'')),'') is null then raise exception 'مفتاح مزامنة التنفيذ مطلوب'; end if;
  if length(p_operation_key)>300 then raise exception 'مفتاح مزامنة التنفيذ غير صالح'; end if;
  if transition_name not in ('select','on_route','map_opened','arrived','start') then
    raise exception 'مرحلة التنفيذ غير مسموحة للمزامنة دون اتصال';
  end if;
  if not public.has_screen_permission('installationExecution','edit') then
    raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد';
  end if;

  select * into op
  from public.installation_execution_sync_operations
  where user_id=actor and operation_key=p_operation_key;
  if found then
    if op.installation_request_id is distinct from p_request_id
       or op.transition is distinct from transition_name
       or (p_visit_id is not null and op.execution_visit_id is not null and op.execution_visit_id is distinct from p_visit_id) then
      raise exception 'مفتاح مزامنة التنفيذ مستخدم لعملية مختلفة';
    end if;
    return coalesce(op.result,'{}'::jsonb) || jsonb_build_object('ok',true,'idempotent',true);
  end if;

  if nullif(trim(coalesce(p_predecessor_operation_key,'')),'') is not null then
    select * into predecessor
    from public.installation_execution_sync_operations
    where user_id=actor and operation_key=p_predecessor_operation_key;
    if not found or predecessor.installation_request_id is distinct from p_request_id then
      return jsonb_build_object('ok',false,'conflict',true,'message','لم تتم مزامنة مرحلة التنفيذ السابقة بعد. أعد المزامنة قبل متابعة التنفيذ.');
    end if;
    if effective_visit_id is null and predecessor.execution_visit_id is not null then
      effective_visit_id:=predecessor.execution_visit_id;
    elsif effective_visit_id is not null and predecessor.execution_visit_id is not null and effective_visit_id is distinct from predecessor.execution_visit_id then
      return jsonb_build_object('ok',false,'conflict',true,'message','زيارة التنفيذ الحالية تختلف عن الزيارة التي تمت مزامنتها في المرحلة السابقة.');
    end if;
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then
    return jsonb_build_object('ok',false,'conflict',true,'message','الموعد لم يعد موجودًا على الخادم.');
  end if;

  if effective_visit_id is not null then
    select * into v
    from public.installation_execution_visits
    where id=effective_visit_id and installation_request_id=p_request_id
    for update;
    if not found then
      return jsonb_build_object('ok',false,'conflict',true,'message','زيارة التنفيذ لم تعد موجودة أو تغيرت بعد آخر مزامنة.');
    end if;

    group_ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
    perform 1 from public.installation_execution_visits where id=any(group_ids) order by id for update;
    select * into a from public.installation_execution_visits where id=any(group_ids) order by visit_no,scheduled_time,id::text limit 1;
    select max(updated_at) into server_updated_at from public.installation_execution_visits where id=any(group_ids);
    access_team_id:=case when transition_name='select' then v.installation_team_id else a.installation_team_id end;
    access_technician:=case when transition_name='select' then v.technician_name else a.technician_name end;

    if public.current_user_role() <> 'super_admin'::public.app_role and
       (not public.can_access_installation_request_scope(r.representative_id,access_team_id)
        or not public.can_access_installation_assignment(access_team_id,access_technician)) then
      raise exception 'هذه الزيارة غير مرتبطة بنطاقك الحالي أو بالجرومر المسموح لك';
    end if;

    target_applied:=case transition_name
      when 'select' then v.selected_for_execution_at is not null and v.completed_at is null
      when 'on_route' then a.on_route_at is not null
      when 'map_opened' then a.map_opened_at is not null
      when 'arrived' then a.arrived_at is not null
      when 'start' then a.started_at is not null
      else false end;

    if target_applied then
      result_payload:=jsonb_build_object('ok',true,'applied',false,'converged',true,'transition',transition_name,'visitId',effective_visit_id,'serverUpdatedAt',server_updated_at);
      insert into public.installation_execution_sync_operations(user_id,operation_key,predecessor_operation_key,installation_request_id,execution_visit_id,transition,base_updated_at,result)
      values(actor,p_operation_key,nullif(trim(coalesce(p_predecessor_operation_key,'')),''),p_request_id,effective_visit_id,transition_name,p_base_updated_at,result_payload)
      on conflict(user_id,operation_key) do nothing;
      return result_payload;
    end if;

    if nullif(trim(coalesce(p_predecessor_operation_key,'')),'') is null
       and p_base_updated_at is not null
       and server_updated_at is not null
       and server_updated_at>p_base_updated_at then
      return jsonb_build_object('ok',false,'conflict',true,'message','تم تحديث زيارة التنفيذ على الخادم بعد آخر مزامنة. حدّث الشاشة قبل متابعة التنفيذ.','serverUpdatedAt',server_updated_at,'baseUpdatedAt',p_base_updated_at);
    end if;

    if v.completed_at is not null or v.status not in ('مجدولة','قيد التنفيذ') then
      return jsonb_build_object('ok',false,'conflict',true,'message','حالة زيارة التنفيذ تغيرت ولا تسمح بمتابعة المرحلة المحفوظة.');
    end if;

    select exists(
      select 1 from public.installation_execution_visits x
      where x.id=any(group_ids) and x.selected_for_execution_at is not null and x.completed_at is null
    ) into active_selected;

    if transition_name='select' then
      select exists(
        select 1 from public.installation_execution_visits x
        where x.selected_for_execution_by=actor
          and x.selected_for_execution_at is not null
          and x.status in ('مجدولة','قيد التنفيذ')
          and x.completed_at is null
          and x.id<>v.id
      ) into selected_for_actor_elsewhere;
      if selected_for_actor_elsewhere then
        return jsonb_build_object('ok',false,'conflict',true,'message','يوجد تنفيذ حالي نشط بالفعل لهذا المستخدم.');
      end if;
    elsif not active_selected then
      return jsonb_build_object('ok',false,'conflict',true,'message','زيارة التنفيذ لم تعد محددة كتنفيذ حالي.');
    elsif transition_name='on_route' and a.on_route_at is not null then
      null;
    elsif transition_name='map_opened' and a.on_route_at is null then
      return jsonb_build_object('ok',false,'conflict',true,'message','مرحلة التحرك لم تُعتمد على الخادم قبل فتح الموقع.');
    elsif transition_name='arrived' and (a.on_route_at is null or a.map_opened_at is null) then
      return jsonb_build_object('ok',false,'conflict',true,'message','ترتيب مراحل التنفيذ على الخادم لا يسمح بتسجيل الوصول الآن.');
    elsif transition_name='start' and (a.on_route_at is null or a.map_opened_at is null or a.arrived_at is null) then
      return jsonb_build_object('ok',false,'conflict',true,'message','ترتيب مراحل التنفيذ على الخادم لا يسمح ببدء التنفيذ الآن.');
    end if;

    if transition_name='select' then
      returned_visit_id:=public.select_installation_execution_visit(p_request_id,effective_visit_id);
      effective_visit_id:=coalesce(returned_visit_id,effective_visit_id);
    elsif transition_name='on_route' then
      perform public.advance_installation_execution_visit_stage(p_request_id,effective_visit_id,'في الطريق',nullif(trim(coalesce(p_notes,'')),''));
    elsif transition_name='map_opened' then
      perform public.record_installation_visit_map_opened(p_request_id,effective_visit_id);
    elsif transition_name='arrived' then
      perform public.advance_installation_execution_visit_stage(p_request_id,effective_visit_id,'وصل إلى العميل',nullif(trim(coalesce(p_notes,'')),''));
    elsif transition_name='start' then
      perform public.advance_installation_execution_visit_stage(p_request_id,effective_visit_id,'قيد التنفيذ',nullif(trim(coalesce(p_notes,'')),''));
    end if;

    select max(updated_at) into server_updated_at
    from public.installation_execution_visits
    where id=any(public.get_installation_execution_group_visit_ids(p_request_id,effective_visit_id));
  else
    -- Genuine legacy request path. A queued select may create the canonical visit;
    -- subsequent queued operations resolve that visit through predecessor_operation_key above.
    server_updated_at:=r.updated_at;
    if public.current_user_role() <> 'super_admin'::public.app_role and
       (not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
        or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)) then
      raise exception 'هذا الموعد غير مرتبط بنطاقك الحالي أو بالجرومر المسموح لك';
    end if;

    target_applied:=case transition_name
      when 'select' then r.selected_for_execution_at is not null and r.completed_at is null
      when 'on_route' then r.on_route_at is not null
      when 'map_opened' then r.map_opened_at is not null
      when 'arrived' then r.arrived_at is not null
      when 'start' then r.started_at is not null
      else false end;

    if target_applied then
      result_payload:=jsonb_build_object('ok',true,'applied',false,'converged',true,'transition',transition_name,'visitId',null,'serverUpdatedAt',server_updated_at);
      insert into public.installation_execution_sync_operations(user_id,operation_key,predecessor_operation_key,installation_request_id,execution_visit_id,transition,base_updated_at,result)
      values(actor,p_operation_key,nullif(trim(coalesce(p_predecessor_operation_key,'')),''),p_request_id,null,transition_name,p_base_updated_at,result_payload)
      on conflict(user_id,operation_key) do nothing;
      return result_payload;
    end if;

    if nullif(trim(coalesce(p_predecessor_operation_key,'')),'') is null
       and p_base_updated_at is not null
       and server_updated_at is not null
       and server_updated_at>p_base_updated_at then
      return jsonb_build_object('ok',false,'conflict',true,'message','تم تحديث الموعد على الخادم بعد آخر مزامنة. حدّث الشاشة قبل متابعة التنفيذ.','serverUpdatedAt',server_updated_at,'baseUpdatedAt',p_base_updated_at);
    end if;

    if r.completed_at is not null or r.status in ('ملغي','بانتظار التأكيد','مكتمل') then
      return jsonb_build_object('ok',false,'conflict',true,'message','حالة الموعد تغيرت ولا تسمح بمتابعة المرحلة المحفوظة.');
    end if;

    if transition_name='select' then
      returned_visit_id:=public.select_installation_execution_visit(p_request_id,null);
      effective_visit_id:=returned_visit_id;
    elsif r.selected_for_execution_at is null then
      return jsonb_build_object('ok',false,'conflict',true,'message','الموعد لم يعد محددًا كتنفيذ حالي.');
    elsif transition_name='on_route' then
      perform public.advance_installation_execution_stage(p_request_id,'في الطريق',nullif(trim(coalesce(p_notes,'')),''));
    elsif transition_name='map_opened' then
      if r.on_route_at is null then return jsonb_build_object('ok',false,'conflict',true,'message','مرحلة التحرك لم تُعتمد على الخادم قبل فتح الموقع.'); end if;
      perform public.record_installation_map_opened(p_request_id);
    elsif transition_name='arrived' then
      if r.on_route_at is null or r.map_opened_at is null then return jsonb_build_object('ok',false,'conflict',true,'message','ترتيب مراحل التنفيذ على الخادم لا يسمح بتسجيل الوصول الآن.'); end if;
      perform public.advance_installation_execution_stage(p_request_id,'وصل إلى العميل',nullif(trim(coalesce(p_notes,'')),''));
    elsif transition_name='start' then
      if r.on_route_at is null or r.map_opened_at is null or r.arrived_at is null then return jsonb_build_object('ok',false,'conflict',true,'message','ترتيب مراحل التنفيذ على الخادم لا يسمح ببدء التنفيذ الآن.'); end if;
      perform public.advance_installation_execution_stage(p_request_id,'قيد التنفيذ',nullif(trim(coalesce(p_notes,'')),''));
    end if;

    if effective_visit_id is not null then
      select max(updated_at) into server_updated_at
      from public.installation_execution_visits
      where id=any(public.get_installation_execution_group_visit_ids(p_request_id,effective_visit_id));
    else
      select updated_at into server_updated_at from public.installation_requests where id=p_request_id;
    end if;
  end if;

  result_payload:=jsonb_build_object('ok',true,'applied',true,'converged',false,'transition',transition_name,'visitId',effective_visit_id,'serverUpdatedAt',server_updated_at);
  insert into public.installation_execution_sync_operations(user_id,operation_key,predecessor_operation_key,installation_request_id,execution_visit_id,transition,base_updated_at,result)
  values(actor,p_operation_key,nullif(trim(coalesce(p_predecessor_operation_key,'')),''),p_request_id,effective_visit_id,transition_name,p_base_updated_at,result_payload)
  on conflict(user_id,operation_key) do nothing;
  return result_payload;
end;
$$;

grant execute on function public.sync_installation_execution_transition(uuid,uuid,text,text,text,timestamptz,text) to authenticated;

commit;
