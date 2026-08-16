-- Phase P5.12.12 — Execution stage progression + execution evidence integrity hotfix
-- Canonical fixes only: team-scoped active execution, mandatory collection gate, and safe execution evidence upload/rollback.
begin;

-- A running visit is team-scoped. selected_for_execution_by remains audit metadata only.
create or replace function public.record_installation_visit_map_opened(p_request_id uuid,p_visit_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  ids uuid[];
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role and
     (not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
      or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name)) then
    raise exception 'الزيارة غير مسموحة';
  end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.selected_for_execution_at is not null and x.completed_at is null) then
    raise exception 'الزيارة ليست قيد التنفيذ';
  end if;
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.on_route_at is not null) then raise exception 'ابدأ التحرك أولاً'; end if;
  update public.installation_execution_visits
     set map_opened_at=coalesce(map_opened_at,now()),last_status_changed_at=now(),last_status_changed_by=auth.uid(),updated_at=now()
   where id=any(ids);
end;
$$;
grant execute on function public.record_installation_visit_map_opened(uuid,uuid) to authenticated;

-- Legacy request fallback follows the same team-scoped active execution rule.
create or replace function public.record_installation_map_opened(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role and
     (not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
      or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)) then
    raise exception 'الموعد غير مسموح';
  end if;
  if r.selected_for_execution_at is null or r.completed_at is not null then raise exception 'الموعد ليس قيد التنفيذ'; end if;
  if r.on_route_at is null then raise exception 'ابدأ التحرك أولاً'; end if;
  update public.installation_requests set map_opened_at=coalesce(map_opened_at,now()),last_status_changed_at=now(),last_status_changed_by=auth.uid() where id=p_request_id;
end;
$$;
grant execute on function public.record_installation_map_opened(uuid) to authenticated;

-- Canonical grouped visit progression with mandatory collection, but no per-user ownership gate.
create or replace function public.advance_installation_execution_visit_stage(p_request_id uuid,p_visit_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  a public.installation_execution_visits%rowtype;
  ids uuid[];
  expected text;
  nextv public.installation_execution_visits%rowtype;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_request_id for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الموعد'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_request_id,v.id);
  select * into a from public.installation_execution_visits where id=any(ids) order by visit_no,scheduled_time,id::text limit 1;
  if public.current_user_role() <> 'super_admin'::public.app_role and
     (not public.can_access_installation_request_scope(r.representative_id,a.installation_team_id)
      or not public.can_access_installation_assignment(a.installation_team_id,a.technician_name)) then
    raise exception 'هذه الزيارة غير مرتبطة بفرقتك والجرومر الخاص بك';
  end if;
  if not exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and x.selected_for_execution_at is not null and x.completed_at is null) then
    raise exception 'هذه الزيارة ليست قيد التنفيذ';
  end if;
  expected:=case
    when a.on_route_at is null then 'في الطريق'
    when a.map_opened_at is null then null
    when a.arrived_at is null then 'وصل إلى العميل'
    when a.started_at is null then 'قيد التنفيذ'
    when a.collection_at is null then null
    when a.completed_at is null then 'مكتمل'
    else null end;
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
    select * into nextv from public.installation_execution_visits
     where installation_request_id=p_request_id and not(id=any(ids)) and status='مجدولة'
     order by scheduled_date,scheduled_time,visit_no limit 1;
    update public.installation_requests set
      status=case when nextv.id is not null then 'مسند' else 'قيد التنفيذ' end,
      scheduled_date=coalesce(nextv.scheduled_date,a.scheduled_date),
      scheduled_time=coalesce(nextv.scheduled_time,a.scheduled_time),
      installation_team_id=coalesce(nextv.installation_team_id,a.installation_team_id),
      assigned_technician_name=coalesce(nextv.technician_name,a.technician_name),
      completed_at=null,selected_for_execution_at=null,selected_for_execution_by=null
    where id=r.id;
  end if;
end;
$$;
grant execute on function public.advance_installation_execution_visit_stage(uuid,uuid,text,text) to authenticated;

create or replace function public.advance_installation_execution_stage(p_request_id uuid,p_next_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; expected text;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ المواعيد'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'الموعد غير موجود'; end if;
  if public.current_user_role() <> 'super_admin'::public.app_role and
     (not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
      or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)) then
    raise exception 'هذا الموعد غير مرتبط بفرقتك والجرومر الخاص بك';
  end if;
  if r.selected_for_execution_at is null or r.completed_at is not null then raise exception 'هذا الموعد ليس قيد التنفيذ'; end if;
  expected:=case
    when r.on_route_at is null then 'في الطريق'
    when r.map_opened_at is null then null
    when r.arrived_at is null then 'وصل إلى العميل'
    when r.started_at is null then 'قيد التنفيذ'
    when r.collection_at is null then null
    when r.completed_at is null then 'مكتمل'
    else null end;
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
    selected_for_execution_by=case when p_next_status='مكتمل' then null else selected_for_execution_by end,
    last_status_changed_at=now(),last_status_changed_by=auth.uid()
  where id=p_request_id;
end;
$$;
grant execute on function public.advance_installation_execution_stage(uuid,text,text) to authenticated;

-- Execution evidence must be uploadable while the request is active, before the completion stage flips status.
drop policy if exists "installation evidence scoped upload" on storage.objects;
create policy "installation evidence scoped upload" on storage.objects for insert to authenticated with check(
  bucket_id='installation-evidence' and exists(
    select 1 from public.installation_requests r
    where r.id::text=split_part(name,'/',1)
      and (
        (public.has_screen_permission('installationCompletion','edit') and r.status='مكتمل' and public.can_access_representative(r.representative_id))
        or
        (public.has_screen_permission('installationExecution','edit')
          and (public.current_user_role()='super_admin'::public.app_role or public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)))
      )
  )
);

drop policy if exists "installation evidence execution rollback" on storage.objects;
create policy "installation evidence execution rollback" on storage.objects for delete to authenticated using(
  bucket_id='installation-evidence'
  and position('/execution/' in name)>0
  and public.has_screen_permission('installationExecution','edit')
  and exists(
    select 1 from public.installation_requests r
    where r.id::text=split_part(name,'/',1)
      and (public.current_user_role()='super_admin'::public.app_role or public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
  )
);

drop policy if exists "installation execution files add" on public.installation_execution_files;
create policy "installation execution files add" on public.installation_execution_files
for insert to authenticated with check(
  public.has_screen_permission('installationExecution','edit')
  and exists(select 1 from public.installation_requests r
    where r.id=installation_request_id
      and (public.current_user_role()='super_admin'::public.app_role or public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)))
);

drop policy if exists "installation execution files remove own" on public.installation_execution_files;
create policy "installation execution files remove own" on public.installation_execution_files
for delete to authenticated using(
  public.has_screen_permission('installationExecution','edit')
  and uploaded_by=auth.uid()
  and exists(select 1 from public.installation_requests r
    where r.id=installation_request_id
      and (public.current_user_role()='super_admin'::public.app_role or public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)))
);
grant delete on public.installation_execution_files to authenticated;

commit;
