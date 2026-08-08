-- Phase M14.9.4 — Mobile Installation Tables & Current Request Ownership Certification
begin;

-- Keep at most one active request selection per user. Preserve every execution timestamp.
with ranked as (
  select id, selected_for_execution_by,
         row_number() over(partition by selected_for_execution_by order by selected_for_execution_at desc nulls last, updated_at desc, id) as rn
  from public.installation_requests
  where selected_for_execution_by is not null
    and selected_for_execution_at is not null
    and status not in ('مكتمل','ملغي')
)
update public.installation_requests r
set selected_for_execution_by=null,
    selected_for_execution_at=null
from ranked x
where r.id=x.id and x.rn>1;

create unique index if not exists uq_installation_active_request_per_user
on public.installation_requests(selected_for_execution_by)
where selected_for_execution_by is not null
  and selected_for_execution_at is not null
  and status not in ('مكتمل','ملغي');

create or replace function public.get_current_installation_execution_request_id()
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select r.id
  from public.installation_requests r
  where r.selected_for_execution_by=auth.uid()
    and r.selected_for_execution_at is not null
    and r.status not in ('مكتمل','ملغي')
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
  order by r.selected_for_execution_at desc, r.updated_at desc
  limit 1
$$;
grant execute on function public.get_current_installation_execution_request_id() to authenticated;

create or replace function public.advance_installation_execution_stage(
  p_request_id uuid,
  p_next_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  expected text;
begin
  if not public.has_screen_permission('installationExecution','edit') then
    raise exception 'لا توجد صلاحية تحديث تنفيذ التركيبات';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id) then
    raise exception 'الطلب خارج نطاق المندوب أو الفرقة المسموح بها';
  end if;
  if r.selected_for_execution_by is distinct from auth.uid() or r.selected_for_execution_at is null then
    raise exception 'هذا الطلب ليس الطلب الحالي لهذا المستخدم';
  end if;

  expected := case r.status
    when 'بانتظار المراجعة' then 'في الطريق'
    when 'جديد' then 'في الطريق'
    when 'مجدول' then 'في الطريق'
    when 'مسند' then 'في الطريق'
    when 'في الطريق' then 'وصل إلى العميل'
    when 'وصل إلى العميل' then 'قيد التنفيذ'
    when 'قيد التنفيذ' then 'مكتمل'
    else null
  end;

  if expected is distinct from p_next_status then
    raise exception 'يجب تنفيذ مراحل الطلب بالترتيب';
  end if;
  if p_next_status='وصل إلى العميل' and r.map_opened_at is null then
    raise exception 'افتح موقع العميل قبل تسجيل الوصول';
  end if;

  update public.installation_requests
  set status=p_next_status,
      execution_notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=p_request_id;
end;
$$;
grant execute on function public.advance_installation_execution_stage(uuid,text,text) to authenticated;

-- Execution evidence can only be added by the user who owns the current request.
drop policy if exists "installation execution files add" on public.installation_execution_files;
create policy "installation execution files add" on public.installation_execution_files
for insert to authenticated
with check(
  public.has_screen_permission('installationExecution','edit')
  and exists(
    select 1 from public.installation_requests r
    where r.id=installation_request_id
      and r.selected_for_execution_by=auth.uid()
      and r.selected_for_execution_at is not null
      and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
  )
);

commit;
