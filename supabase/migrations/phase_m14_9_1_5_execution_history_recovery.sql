-- Phase M14.9.1.5 — Execution History Classification Recovery
-- Preserve legacy execution history, keep progressed requests out of Today, and allow authorised team members to resume them.
begin;

-- Mark incomplete progressed requests as active without changing or deleting any stage timestamp.
update public.installation_requests
set selected_for_execution_at = coalesce(
  selected_for_execution_at,
  on_route_at,
  map_opened_at,
  arrived_at,
  started_at,
  last_status_changed_at,
  updated_at,
  now()
)
where status not in ('مكتمل','ملغي')
  and selected_for_execution_at is null
  and (
    on_route_at is not null or map_opened_at is not null or arrived_at is not null or started_at is not null
    or status in ('في الطريق','وصل إلى العميل','قيد التنفيذ')
  );

create or replace function public.select_installation_execution_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare r public.installation_requests%rowtype;
begin
  if not public.has_screen_permission('installationExecution','edit') then
    raise exception 'لا توجد صلاحية بدء تنفيذ التركيبات';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_team(r.installation_team_id) then
    raise exception 'هذا الطلب تابع إلى فرقة غير مسموح لك بها';
  end if;
  if r.installation_team_id is null then raise exception 'يجب إسناد الطلب إلى فرقة قبل بدء التنفيذ'; end if;
  if r.scheduled_date is null or r.scheduled_time is null then raise exception 'يجب جدولة الطلب قبل بدء التنفيذ'; end if;
  if r.status in ('مكتمل','ملغي','مؤجل','متعذر') then raise exception 'لا يمكن اختيار الطلب في حالته الحالية'; end if;

  if exists(
    select 1 from public.installation_requests x
    where x.selected_for_execution_by=auth.uid()
      and x.selected_for_execution_at is not null
      and x.status not in ('مكتمل','ملغي')
      and x.id<>r.id
  ) then raise exception 'يوجد طلب حالي نشط بالفعل'; end if;

  -- Legacy progressed requests are resumed, never reset or rejected.
  if r.on_route_at is not null or r.map_opened_at is not null or r.arrived_at is not null
     or r.started_at is not null or r.status in ('في الطريق','وصل إلى العميل','قيد التنفيذ') then
    update public.installation_requests
    set selected_for_execution_at=coalesce(selected_for_execution_at,on_route_at,map_opened_at,arrived_at,started_at,now()),
        selected_for_execution_by=auth.uid()
    where id=r.id;
    return;
  end if;

  update public.installation_requests
  set selected_for_execution_at=coalesce(selected_for_execution_at,now()),
      selected_for_execution_by=auth.uid(),
      status=case when status in ('بانتظار المراجعة','جديد','مجدول') then 'مسند' else status end
  where id=r.id;
end;
$$;

grant execute on function public.select_installation_execution_request(uuid) to authenticated;
commit;
