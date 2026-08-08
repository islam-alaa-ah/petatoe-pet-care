-- Phase M14.9.8.11 — Installation Technician Role, Team Binding & Own Assignment Scope
begin;

create table if not exists public.installation_user_technician_bindings (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  installation_team_id uuid not null references public.installation_teams(id) on delete restrict,
  technician_name text not null,
  normalized_technician_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installation_user_technician_name_not_blank check (length(trim(technician_name)) > 0)
);

create index if not exists idx_installation_user_technician_bindings_team_name
  on public.installation_user_technician_bindings(installation_team_id, normalized_technician_name);

alter table public.installation_user_technician_bindings enable row level security;

drop policy if exists "installation technician binding view" on public.installation_user_technician_bindings;
drop policy if exists "installation technician binding manage" on public.installation_user_technician_bindings;

create policy "installation technician binding view"
on public.installation_user_technician_bindings
for select to authenticated
using (user_id = auth.uid() or public.has_screen_permission('users','view'));

create policy "installation technician binding manage"
on public.installation_user_technician_bindings
for all to authenticated
using (public.has_screen_permission('users','edit'))
with check (public.has_screen_permission('users','edit'));

grant select,insert,update,delete on public.installation_user_technician_bindings to authenticated;

create or replace function public.normalize_installation_technician_name(p_name text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g'))
$$;

create or replace function public.can_access_installation_assignment(
  p_installation_team_id uuid,
  p_technician_name text
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when auth.uid() is null then false
    when public.current_user_role()='super_admin' then true
    when not exists (
      select 1 from public.installation_user_technician_bindings b
      where b.user_id=auth.uid()
    ) then true
    else exists (
      select 1
      from public.installation_user_technician_bindings b
      join public.user_profiles u on u.id=b.user_id and u.is_active=true
      where b.user_id=auth.uid()
        and b.installation_team_id=p_installation_team_id
        and b.normalized_technician_name=public.normalize_installation_technician_name(p_technician_name)
    )
  end
$$;
grant execute on function public.can_access_installation_assignment(uuid,text) to authenticated;

create or replace function public.sync_installation_technician_team_access()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_user_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  delete from public.installation_team_access where user_id=v_user_id;
  if tg_op <> 'DELETE' then
    insert into public.installation_team_access(user_id,installation_team_id,granted_by)
    values(new.user_id,new.installation_team_id,auth.uid())
    on conflict(user_id,installation_team_id) do nothing;
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_sync_installation_technician_team_access on public.installation_user_technician_bindings;
create trigger trg_sync_installation_technician_team_access
after insert or update or delete on public.installation_user_technician_bindings
for each row execute function public.sync_installation_technician_team_access();

-- Technician-bound users may only read/update the exact team + technician assignment.
drop policy if exists "installation requests scoped select" on public.installation_requests;
create policy "installation requests scoped select" on public.installation_requests
for select to authenticated using(
  (
    public.has_screen_permission('installationRequests','view')
    or public.has_screen_permission('installationSchedule','view')
    or public.has_screen_permission('installationExecution','view')
    or public.has_screen_permission('installationCompletion','view')
    or public.has_screen_permission('installationExceptions','view')
    or public.has_screen_permission('installationReports','view')
    or public.has_screen_permission('installationsOverview','view')
  )
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
  and public.can_access_installation_assignment(installation_team_id,assigned_technician_name)
);

drop policy if exists "installation requests scoped update" on public.installation_requests;
create policy "installation requests scoped update" on public.installation_requests
for update to authenticated using(
  (
    public.has_screen_permission('installationRequests','edit')
    or public.has_screen_permission('installationSchedule','edit')
    or public.has_screen_permission('installationExecution','edit')
  )
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
  and public.can_access_installation_assignment(installation_team_id,assigned_technician_name)
) with check(
  (
    public.has_screen_permission('installationRequests','edit')
    or public.has_screen_permission('installationSchedule','edit')
    or public.has_screen_permission('installationExecution','edit')
  )
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
  and public.can_access_installation_assignment(installation_team_id,assigned_technician_name)
);

create or replace function public.get_current_installation_execution_request_id()
returns uuid language sql stable security definer set search_path=public as $$
  select r.id
  from public.installation_requests r
  where r.selected_for_execution_by=auth.uid()
    and r.selected_for_execution_at is not null
    and r.status not in ('مكتمل','ملغي')
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
    and public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)
  order by r.selected_for_execution_at desc,r.updated_at desc
  limit 1
$$;
grant execute on function public.get_current_installation_execution_request_id() to authenticated;

create or replace function public.select_installation_execution_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية بدء تنفيذ التركيبات'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
     or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)
  then raise exception 'هذا الطلب غير مرتبط بفرقتك واسم الفني الخاص بك'; end if;
  if r.status not in ('مسند','مجدول') then raise exception 'لا يمكن اختيار الطلب في حالته الحالية'; end if;
  if exists(select 1 from public.installation_requests x where x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null and x.status not in ('مكتمل','ملغي') and x.id<>r.id) then raise exception 'يوجد طلب حالي نشط بالفعل'; end if;
  update public.installation_requests
  set selected_for_execution_at=coalesce(selected_for_execution_at,now()),selected_for_execution_by=auth.uid()
  where id=r.id;
end;
$$;
grant execute on function public.select_installation_execution_request(uuid) to authenticated;

create or replace function public.record_installation_map_opened(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype;
begin
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found
     or not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
     or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)
  then raise exception 'الطلب غير مسموح'; end if;
  if r.selected_for_execution_by<>auth.uid() then raise exception 'الطلب ليس الطلب الحالي لهذا المستخدم'; end if;
  if r.on_route_at is null then raise exception 'ابدأ التحرك أولاً'; end if;
  update public.installation_requests set map_opened_at=coalesce(map_opened_at,now()) where id=r.id;
end;
$$;
grant execute on function public.record_installation_map_opened(uuid) to authenticated;

create or replace function public.advance_installation_execution_stage(
  p_request_id uuid,p_next_status text,p_notes text default null
)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; expected text;
begin
  if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية تحديث تنفيذ التركيبات'; end if;
  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
     or not public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name)
  then raise exception 'هذا الطلب غير مرتبط بفرقتك واسم الفني الخاص بك'; end if;
  if r.selected_for_execution_by is distinct from auth.uid() or r.selected_for_execution_at is null then raise exception 'هذا الطلب ليس الطلب الحالي لهذا المستخدم'; end if;
  expected := case r.status
    when 'بانتظار المراجعة' then 'في الطريق' when 'جديد' then 'في الطريق'
    when 'مجدول' then 'في الطريق' when 'مسند' then 'في الطريق'
    when 'في الطريق' then 'وصل إلى العميل' when 'وصل إلى العميل' then 'قيد التنفيذ'
    when 'قيد التنفيذ' then 'مكتمل' else null end;
  if expected is distinct from p_next_status then raise exception 'يجب تنفيذ مراحل الطلب بالترتيب'; end if;
  if p_next_status='وصل إلى العميل' and r.map_opened_at is null then raise exception 'افتح موقع العميل قبل تسجيل الوصول'; end if;
  update public.installation_requests set status=p_next_status,execution_notes=nullif(trim(coalesce(p_notes,'')),'') where id=p_request_id;
end;
$$;
grant execute on function public.advance_installation_execution_stage(uuid,text,text) to authenticated;

drop policy if exists "installation execution files view" on public.installation_execution_files;
create policy "installation execution files view" on public.installation_execution_files
for select to authenticated using(
  public.has_screen_permission('installationExecution','view')
  and exists(select 1 from public.installation_requests r
    where r.id=installation_request_id
      and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
      and public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name))
);

drop policy if exists "installation execution files add" on public.installation_execution_files;
create policy "installation execution files add" on public.installation_execution_files
for insert to authenticated with check(
  public.has_screen_permission('installationExecution','edit')
  and exists(select 1 from public.installation_requests r
    where r.id=installation_request_id
      and r.selected_for_execution_by=auth.uid()
      and r.selected_for_execution_at is not null
      and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
      and public.can_access_installation_assignment(r.installation_team_id,r.assigned_technician_name))
);

commit;
