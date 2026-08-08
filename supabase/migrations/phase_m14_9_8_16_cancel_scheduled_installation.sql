begin;

-- Phase M14.9.8.16 — Cancel Scheduled Installation
-- Cancels the complete schedule for one request and returns it to the pending scheduling queue.

create or replace function public.cancel_installation_request_schedule(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.installation_requests%rowtype;
  v_visits integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not public.has_screen_permission('installationSchedule','edit') then
    raise exception 'ليس لديك صلاحية تعديل جدولة التركيبات';
  end if;
  if p_request_id is null then
    raise exception 'معرّف طلب التركيب مطلوب';
  end if;

  select * into r
  from public.installation_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'طلب التركيب غير موجود';
  end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then
    raise exception 'الطلب خارج نطاقك التشغيلي';
  end if;

  if coalesce(r.status,'') in ('في الطريق','وصل إلى العميل','قيد التنفيذ','مكتمل')
     or r.completed_at is not null
     or exists(
       select 1
       from public.installation_execution_visits v
       left join public.installation_execution_visit_services s on s.visit_id=v.id
       where v.installation_request_id=p_request_id
         and (
           coalesce(s.executed_quantity,0)>0
           or coalesce(v.status,'') not in ('مجدولة','بانتظار التأكيد','ملغاة')
         )
     ) then
    raise exception 'لا يمكن إلغاء الجدولة بعد بدء تنفيذ الطلب';
  end if;

  select count(*) into v_visits
  from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('مجدولة','بانتظار التأكيد');

  delete from public.installation_execution_visits
  where installation_request_id=p_request_id
    and status in ('مجدولة','بانتظار التأكيد');

  update public.installation_requests
  set scheduled_date=null,
      scheduled_time=null,
      time_slot=null,
      installation_team_id=null,
      assigned_technician_name=null,
      technician_id=null,
      assigned_at=null,
      assigned_by=null,
      assignment_notes=null,
      status='بانتظار الجدولة',
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      completed_at=null,
      updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'requestId',p_request_id,
    'cancelledVisits',v_visits,
    'status','بانتظار الجدولة'
  );
end;
$$;

revoke all on function public.cancel_installation_request_schedule(uuid) from public;
grant execute on function public.cancel_installation_request_schedule(uuid) to authenticated;

commit;
