-- PETATOE P5.11.4.9 — Permission Matrix Full Authority Recovery
-- Goals:
-- 1) Screen/action permissions remain the functional authority.
-- 2) Appointment representative scope (own/selected/all) is independent from team binding
--    for all non-viewer roles.
-- 3) Groomer/Driver (viewer) remains strictly team-bound.
-- 4) User data-scope saves are atomic SECURITY DEFINER RPCs authorized by users.edit,
--    avoiding browser-side multi-write/RLS partial failures.

begin;

-- ============================================================
-- A. Canonical appointment data access mode
-- ============================================================
create or replace function public.current_installation_data_access_mode()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select coalesce((
    select case
      when up.role::text='super_admin' then 'all'
      when up.role::text='viewer' then 'own'
      when ap.access_mode in ('own','selected','all') then ap.access_mode
      when up.representative_id is not null then 'own'
      else 'selected'
    end
    from public.user_profiles up
    left join public.installation_data_access_profiles ap on ap.user_id=up.id
    where up.id=auth.uid()
      and coalesce(up.is_active,true)
  ),'selected');
$$;

revoke all on function public.current_installation_data_access_mode() from public,anon;
grant execute on function public.current_installation_data_access_mode() to authenticated,service_role;

-- ============================================================
-- B. Canonical appointment request scope
-- Team binding is a Groomer/Driver boundary, not an extra manager boundary.
-- ============================================================
create or replace function public.can_access_installation_request_scope(
  p_representative_id uuid,
  p_installation_team_id uuid
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

    -- Groomer / Driver remains strictly team-bound.
    when public.current_user_role()='viewer' then
      p_installation_team_id is not null
      and public.can_access_installation_team(p_installation_team_id)

    -- Explicit all-appointments scope means all appointments for a non-viewer role.
    -- A missing installation_team_access row must not downgrade Matrix permissions.
    when public.current_installation_data_access_mode()='all' then true

    -- own / selected are determined only by the independent appointment representative scope.
    when p_representative_id is not null then
      public.can_access_installation_representative(p_representative_id)

    -- Unassigned appointments retain the existing explicit authorization rule.
    else public.can_access_unassigned_appointment()
  end;
$$;

revoke all on function public.can_access_installation_request_scope(uuid,uuid) from public,anon;
grant execute on function public.can_access_installation_request_scope(uuid,uuid) to authenticated,service_role;

-- ============================================================
-- C. Atomic CRM data-scope save — authorized by users.edit
-- ============================================================
create or replace function public.save_user_data_access_scope(
  p_user_id uuid,
  p_access_mode text,
  p_representative_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_mode text:=lower(coalesce(p_access_mode,''));
  v_rep uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not public.has_screen_permission('users','edit') then
    raise exception 'Missing users.edit permission' using errcode='42501';
  end if;
  if p_user_id is null or not exists(select 1 from public.user_profiles where id=p_user_id) then
    raise exception 'User does not exist' using errcode='23503';
  end if;
  if v_mode not in ('own','selected','all') then
    raise exception 'Invalid data access mode' using errcode='23514';
  end if;

  insert into public.user_data_access_profiles(user_id,access_mode,updated_by,updated_at)
  values(p_user_id,v_mode,auth.uid(),now())
  on conflict(user_id) do update set
    access_mode=excluded.access_mode,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  delete from public.user_data_access_representatives where user_id=p_user_id;

  if v_mode='selected' then
    foreach v_rep in array coalesce(p_representative_ids,'{}'::uuid[]) loop
      if v_rep is not null then
        insert into public.user_data_access_representatives(user_id,representative_id)
        values(p_user_id,v_rep)
        on conflict(user_id,representative_id) do nothing;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.save_user_data_access_scope(uuid,text,uuid[]) from public,anon;
grant execute on function public.save_user_data_access_scope(uuid,text,uuid[]) to authenticated,service_role;

-- ============================================================
-- D. Atomic appointment data-scope save — authorized by users.edit
-- ============================================================
create or replace function public.save_installation_data_access_scope(
  p_user_id uuid,
  p_access_mode text,
  p_representative_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_mode text:=lower(coalesce(p_access_mode,''));
  v_rep uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not public.has_screen_permission('users','edit') then
    raise exception 'Missing users.edit permission' using errcode='42501';
  end if;
  if p_user_id is null or not exists(select 1 from public.user_profiles where id=p_user_id) then
    raise exception 'User does not exist' using errcode='23503';
  end if;
  if v_mode not in ('own','selected','all') then
    raise exception 'Invalid appointment access mode' using errcode='23514';
  end if;

  insert into public.installation_data_access_profiles(user_id,access_mode,updated_by,updated_at)
  values(p_user_id,v_mode,auth.uid(),now())
  on conflict(user_id) do update set
    access_mode=excluded.access_mode,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  delete from public.installation_data_access_representatives where user_id=p_user_id;

  if v_mode='selected' then
    foreach v_rep in array coalesce(p_representative_ids,'{}'::uuid[]) loop
      if v_rep is not null then
        insert into public.installation_data_access_representatives(user_id,representative_id)
        values(p_user_id,v_rep)
        on conflict(user_id,representative_id) do nothing;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.save_installation_data_access_scope(uuid,text,uuid[]) from public,anon;
grant execute on function public.save_installation_data_access_scope(uuid,text,uuid[]) to authenticated,service_role;

-- ============================================================
-- E. Canonical RLS for users-screen scope metadata
-- Remove historical policy overlap, including deployments that still carry old names.
-- ============================================================
do $$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'user_data_access_profiles',
    'user_data_access_representatives',
    'installation_data_access_profiles',
    'installation_data_access_representatives'
  ] loop
    for v_policy in
      select policyname from pg_policies
      where schemaname='public' and tablename=v_table
    loop
      execute format('drop policy if exists %I on public.%I',v_policy.policyname,v_table);
    end loop;
  end loop;
end;
$$;

create policy "user data access profiles read"
on public.user_data_access_profiles for select to authenticated
using(user_id=auth.uid() or public.has_screen_permission('users','view'));

create policy "user data access profiles manage"
on public.user_data_access_profiles for all to authenticated
using(public.has_screen_permission('users','edit'))
with check(public.has_screen_permission('users','edit'));

create policy "user data access reps read"
on public.user_data_access_representatives for select to authenticated
using(user_id=auth.uid() or public.has_screen_permission('users','view'));

create policy "user data access reps manage"
on public.user_data_access_representatives for all to authenticated
using(public.has_screen_permission('users','edit'))
with check(public.has_screen_permission('users','edit'));

create policy "appointment data access profiles read"
on public.installation_data_access_profiles for select to authenticated
using(user_id=auth.uid() or public.has_screen_permission('users','view'));

create policy "appointment data access profiles manage"
on public.installation_data_access_profiles for all to authenticated
using(public.has_screen_permission('users','edit'))
with check(public.has_screen_permission('users','edit'));

create policy "appointment data access reps read"
on public.installation_data_access_representatives for select to authenticated
using(user_id=auth.uid() or public.has_screen_permission('users','view'));

create policy "appointment data access reps manage"
on public.installation_data_access_representatives for all to authenticated
using(public.has_screen_permission('users','edit'))
with check(public.has_screen_permission('users','edit'));

grant select,insert,update,delete on public.user_data_access_profiles to authenticated;
grant select,insert,update,delete on public.user_data_access_representatives to authenticated;
grant select,insert,update,delete on public.installation_data_access_profiles to authenticated;
grant select,insert,update,delete on public.installation_data_access_representatives to authenticated;

commit;
notify pgrst,'reload schema';
