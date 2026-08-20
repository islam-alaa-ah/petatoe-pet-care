-- PETATOE P5.13.8.44 — Revisit Transactional Guard
-- Scope: installationExceptions revisit save only.
-- Purpose: remove client-side split writes and make revisit + parent compatibility state atomic,
-- while preventing the legacy exception workflow from overwriting an active/confirmed execution visit.

begin;

create or replace function public.save_installation_revisit_schedule_v2(
  p_request_id uuid,
  p_scheduled_date date,
  p_time_slot text,
  p_technician_id uuid,
  p_action_type text default 'إعادة زيارة',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  r public.installation_requests%rowtype;
  v_revisit_id uuid;
  v_time_slot text:=coalesce(nullif(btrim(p_time_slot),''),'صباحي');
  v_action_type text:=coalesce(nullif(btrim(p_action_type),''),'إعادة زيارة');
  v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not public.has_screen_permission('installationExceptions','edit') then
    raise exception 'لا توجد صلاحية تعديل الاستثناءات وإعادة الزيارة' using errcode='42501';
  end if;
  if p_request_id is null or p_scheduled_date is null or p_technician_id is null then
    raise exception 'تاريخ إعادة الزيارة والفني مطلوبان' using errcode='23514';
  end if;
  if v_time_slot not in ('صباحي','مسائي') then
    raise exception 'فترة إعادة الزيارة غير صالحة' using errcode='23514';
  end if;
  if v_action_type not in ('إعادة زيارة','زيارة استكمال','زيارة معاينة') then
    raise exception 'نوع إعادة الزيارة غير صالح' using errcode='23514';
  end if;

  select * into r
  from public.installation_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'الموعد غير موجود' using errcode='P0002';
  end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then
    raise exception 'الموعد خارج نطاقك التشغيلي' using errcode='42501';
  end if;
  if coalesce(r.status,'') not in ('مؤجل','متعذر') then
    raise exception 'إعادة الزيارة متاحة فقط للموعد المؤجل أو المتعذر' using errcode='23514';
  end if;
  if public.is_installation_schedule_day_locked(p_scheduled_date) then
    raise exception 'هذا اليوم مغلق. افتح اليوم أولًا قبل جدولة إعادة الزيارة.' using errcode='23514';
  end if;
  if not exists(select 1 from public.installation_technicians t where t.id=p_technician_id) then
    raise exception 'الفني المحدد غير موجود' using errcode='23503';
  end if;

  -- The legacy exception screen must never overwrite a live canonical execution visit.
  -- If a live visit exists, scheduling must be completed through the main scheduling workflow.
  if exists(
    select 1
    from public.installation_execution_visits v
    where v.installation_request_id=p_request_id
      and v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة')
  ) then
    raise exception 'للموعد زيارة تنفيذ مسجلة. استخدم شاشة الجدولة لتعديل الموعد.' using errcode='23514';
  end if;

  if exists(
    select 1 from public.sales_invoices si
    where si.installation_request_id=p_request_id
      and coalesce(si.status,'')<>'ملغاة'
  ) then
    raise exception 'لا يمكن جدولة إعادة زيارة بعد إصدار فاتورة للموعد' using errcode='23514';
  end if;

  select id into v_revisit_id
  from public.installation_revisits
  where installation_request_id=p_request_id and status='مجدولة'
  order by created_at desc
  limit 1
  for update;

  if v_revisit_id is null then
    insert into public.installation_revisits(
      installation_request_id,scheduled_date,time_slot,technician_id,
      action_type,notes,status,created_by,created_at,updated_at
    ) values(
      p_request_id,p_scheduled_date,v_time_slot,p_technician_id,
      v_action_type,v_notes,'مجدولة',auth.uid(),now(),now()
    ) returning id into v_revisit_id;
  else
    update public.installation_revisits
    set scheduled_date=p_scheduled_date,
        time_slot=v_time_slot,
        technician_id=p_technician_id,
        action_type=v_action_type,
        notes=v_notes,
        updated_at=now()
    where id=v_revisit_id;
  end if;

  -- Compatibility projection retained for existing reports/dashboard only.
  -- It is now part of the same DB transaction, so a revisit can no longer be saved
  -- while the parent appointment update fails (or vice versa).
  update public.installation_requests
  set scheduled_date=p_scheduled_date,
      time_slot=v_time_slot,
      technician_id=p_technician_id,
      status='مسند',
      assignment_notes=v_notes,
      last_status_changed_at=now(),
      last_status_changed_by=auth.uid()
  where id=p_request_id;

  return v_revisit_id;
end;
$$;

revoke all on function public.save_installation_revisit_schedule_v2(uuid,date,text,uuid,text,text) from public,anon;
grant execute on function public.save_installation_revisit_schedule_v2(uuid,date,text,uuid,text,text) to authenticated,service_role;

commit;
notify pgrst,'reload schema';
