-- Phase M15.13.9 — Completed Visit Reappearance & UUID Selection Hotfix
-- 1) Remove PostgreSQL min(uuid) usage from execution visit selection.
-- 2) Never auto-create a new visit when historical visits already exist but no active visit remains.

create or replace function public.select_installation_execution_visit(p_request_id uuid,p_visit_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  v_id uuid;
  active_count integer;
  any_visit_exists boolean;
begin
  if not public.has_screen_permission('installationExecution','edit') then
    raise exception 'لا توجد صلاحية بدء تنفيذ التركيبات';
  end if;

  select * into r
  from public.installation_requests
  where id=p_request_id
  for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  if p_visit_id is null then
    select count(*) into active_count
    from public.installation_execution_visits
    where installation_request_id=p_request_id
      and status in ('مجدولة','قيد التنفيذ')
      and completed_at is null;

    if active_count=1 then
      select id into v_id
      from public.installation_execution_visits
      where installation_request_id=p_request_id
        and status in ('مجدولة','قيد التنفيذ')
        and completed_at is null
      order by scheduled_date nulls last, scheduled_time nulls last, visit_no, id::text
      limit 1;
    elsif active_count>1 then
      raise exception 'حدد زيارة التنفيذ المطلوبة لهذا الطلب متعدد الأيام';
    else
      select exists(
        select 1
        from public.installation_execution_visits
        where installation_request_id=p_request_id
      ) into any_visit_exists;

      if any_visit_exists then
        raise exception 'لا توجد زيارة تنفيذ نشطة لهذا الطلب';
      end if;

      -- Compatibility path for genuine pre-visit legacy requests only.
      v_id:=public.ensure_installation_execution_visit(p_request_id);
    end if;
  else
    v_id:=p_visit_id;
  end if;

  select * into v
  from public.installation_execution_visits
  where id=v_id and installation_request_id=p_request_id
  for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;

  if v.status not in ('مجدولة','قيد التنفيذ') or v.completed_at is not null then
    raise exception 'لا يمكن بدء زيارة التنفيذ في حالتها الحالية';
  end if;

  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id)
     or not public.can_access_installation_assignment(v.installation_team_id,v.technician_name) then
    raise exception 'هذه الزيارة غير مرتبطة بفرقتك واسم الفني الخاص بك';
  end if;

  if exists(
    select 1
    from public.installation_execution_visits x
    where x.selected_for_execution_by=auth.uid()
      and x.selected_for_execution_at is not null
      and x.status in ('مجدولة','قيد التنفيذ')
      and x.id<>v.id
  ) then
    raise exception 'يوجد تنفيذ حالي نشط بالفعل';
  end if;

  update public.installation_execution_visits
  set selected_for_execution_at=coalesce(selected_for_execution_at,now()),
      selected_for_execution_by=auth.uid(),
      updated_at=now()
  where id=v.id;

  update public.installation_requests
  set status=case when status in ('بانتظار المراجعة','جديد','مجدول','بانتظار الجدولة') then 'مسند' else status end,
      selected_for_execution_at=null,
      selected_for_execution_by=null
  where id=r.id;

  return v.id;
end;
$$;

grant execute on function public.select_installation_execution_visit(uuid,uuid) to authenticated;
