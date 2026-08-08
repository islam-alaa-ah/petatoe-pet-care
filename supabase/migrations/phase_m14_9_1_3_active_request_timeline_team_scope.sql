-- Phase M14.9.1.3 — Active Request Start Gate, Timeline Durations & Strict Team Scope
begin;

alter table public.installation_requests add column if not exists selected_for_execution_at timestamptz;
alter table public.installation_requests add column if not exists selected_for_execution_by uuid references auth.users(id) on delete set null;
alter table public.installation_requests add column if not exists map_opened_at timestamptz;
create index if not exists idx_installation_requests_active_selection on public.installation_requests(selected_for_execution_by,selected_for_execution_at) where selected_for_execution_at is not null;

create table if not exists public.installation_team_access(
 user_id uuid not null references public.user_profiles(id) on delete cascade,
 installation_team_id uuid not null references public.installation_teams(id) on delete cascade,
 granted_by uuid references auth.users(id) on delete set null default auth.uid(),
 granted_at timestamptz not null default now(),
 primary key(user_id,installation_team_id)
);
alter table public.installation_team_access enable row level security;
drop policy if exists installation_team_access_manage on public.installation_team_access;
create policy installation_team_access_manage on public.installation_team_access for all to authenticated
using(public.has_screen_permission('users','edit')) with check(public.has_screen_permission('users','edit'));
drop policy if exists installation_team_access_self_read on public.installation_team_access;
create policy installation_team_access_self_read on public.installation_team_access for select to authenticated
using(user_id=auth.uid() or public.has_screen_permission('users','view'));
grant select,insert,delete on public.installation_team_access to authenticated;

create or replace function public.can_access_installation_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select case when auth.uid() is null then false
 when public.current_user_role()='super_admin' then true
 when p_team_id is null then false
 else exists(select 1 from public.installation_team_access a join public.user_profiles u on u.id=a.user_id and u.is_active=true where a.user_id=auth.uid() and a.installation_team_id=p_team_id) end
$$;
grant execute on function public.can_access_installation_team(uuid) to authenticated;

create or replace function public.select_installation_execution_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype;
begin
 if not public.has_screen_permission('installationExecution','edit') then raise exception 'لا توجد صلاحية بدء تنفيذ التركيبات'; end if;
 select * into r from public.installation_requests where id=p_request_id for update;
 if not found then raise exception 'طلب التركيب غير موجود'; end if;
 if not public.can_access_installation_team(r.installation_team_id) then raise exception 'هذا الطلب تابع إلى فرقة غير مسموح لك بها'; end if;
 if r.status not in ('مسند','مجدول') then raise exception 'لا يمكن اختيار الطلب في حالته الحالية'; end if;
 if exists(select 1 from public.installation_requests x where x.selected_for_execution_by=auth.uid() and x.selected_for_execution_at is not null and x.status not in ('مكتمل','ملغي') and x.id<>r.id) then raise exception 'يوجد طلب حالي نشط بالفعل'; end if;
 update public.installation_requests set selected_for_execution_at=coalesce(selected_for_execution_at,now()),selected_for_execution_by=auth.uid() where id=r.id;
end;$$;
grant execute on function public.select_installation_execution_request(uuid) to authenticated;

create or replace function public.record_installation_map_opened(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype;
begin
 select * into r from public.installation_requests where id=p_request_id for update;
 if not found or not public.can_access_installation_team(r.installation_team_id) then raise exception 'الطلب غير مسموح'; end if;
 if r.selected_for_execution_by<>auth.uid() then raise exception 'الطلب ليس الطلب الحالي لهذا المستخدم'; end if;
 if r.on_route_at is null then raise exception 'ابدأ التحرك أولاً'; end if;
 update public.installation_requests set map_opened_at=coalesce(map_opened_at,now()) where id=r.id;
end;$$;
grant execute on function public.record_installation_map_opened(uuid) to authenticated;

-- Strengthen request scope whenever the user owns execution access.
drop policy if exists "installation requests scoped select" on public.installation_requests;
create policy "installation requests scoped select" on public.installation_requests for select to authenticated using(
 (public.has_screen_permission('installationRequests','view') or public.has_screen_permission('installationSchedule','view') or public.has_screen_permission('installationExecution','view') or public.has_screen_permission('installationCompletion','view') or public.has_screen_permission('installationExceptions','view') or public.has_screen_permission('installationReports','view') or public.has_screen_permission('installationsOverview','view'))
 and public.can_access_installation_representative(representative_id)
 and (not public.has_screen_permission('installationExecution','view') or public.can_access_installation_team(installation_team_id))
);
drop policy if exists "installation requests scoped update" on public.installation_requests;
create policy "installation requests scoped update" on public.installation_requests for update to authenticated using(
 (public.has_screen_permission('installationRequests','edit') or public.has_screen_permission('installationSchedule','edit') or public.has_screen_permission('installationExecution','edit'))
 and public.can_access_installation_representative(representative_id)
 and (not public.has_screen_permission('installationExecution','edit') or public.can_access_installation_team(installation_team_id))
) with check(
 (public.has_screen_permission('installationRequests','edit') or public.has_screen_permission('installationSchedule','edit') or public.has_screen_permission('installationExecution','edit'))
 and public.can_access_installation_representative(representative_id)
 and (not public.has_screen_permission('installationExecution','edit') or public.can_access_installation_team(installation_team_id))
);

-- Execution evidence inherits both representative and team scope.
drop policy if exists "installation execution files view" on public.installation_execution_files;
drop policy if exists "installation execution files add" on public.installation_execution_files;
create policy "installation execution files view" on public.installation_execution_files for select to authenticated using(
 public.has_screen_permission('installationExecution','view') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id) and public.can_access_installation_team(r.installation_team_id))
);
create policy "installation execution files add" on public.installation_execution_files for insert to authenticated with check(
 public.has_screen_permission('installationExecution','edit') and exists(select 1 from public.installation_requests r where r.id=installation_request_id and public.can_access_installation_representative(r.representative_id) and public.can_access_installation_team(r.installation_team_id))
);

-- Clear the active selection once the request is completed/cancelled.
create or replace function public.track_installation_execution_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status then
  new.last_status_changed_at=now(); new.last_status_changed_by=auth.uid();
  if new.status='في الطريق' and new.on_route_at is null then new.on_route_at=now(); end if;
  if new.status='وصل إلى العميل' and new.arrived_at is null then new.arrived_at=now(); end if;
  if new.status='قيد التنفيذ' and new.started_at is null then new.started_at=now(); end if;
  if new.status='مكتمل' and new.completed_at is null then new.completed_at=now(); end if;
  if new.status in ('مكتمل','ملغي') then new.selected_for_execution_at=null; new.selected_for_execution_by=null; end if;
  insert into public.installation_status_history(installation_request_id,old_status,new_status,notes,failure_reason,changed_by)
  values(new.id,old.status,new.status,new.execution_notes,new.execution_failure_reason,auth.uid());
 end if;
 return new;
end;$$;
commit;
