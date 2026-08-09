-- P5.6 — Groomer / Driver Team-Only Appointment Scope
-- Stable role key remains public.app_role = 'viewer'.
-- Business rule: viewer sees/operates appointments assigned to the linked team only.
-- No sales-representative ownership is required for this role.

begin;

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
    when public.current_user_role()='viewer' then
      p_installation_team_id is not null
      and public.can_access_installation_team(p_installation_team_id)
    else
      public.can_access_installation_representative(p_representative_id)
      and (
        public.can_access_installation_team(p_installation_team_id)
        or (
          p_installation_team_id is null
          and public.has_screen_permission('installationSchedule','edit')
        )
      )
  end
$$;

grant execute on function public.can_access_installation_request_scope(uuid,uuid) to authenticated;

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
    when public.current_user_role()='viewer' then
      exists (
        select 1
        from public.installation_user_technician_bindings b
        join public.user_profiles u on u.id=b.user_id and u.is_active=true
        where b.user_id=auth.uid()
          and b.installation_team_id=p_installation_team_id
      )
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

-- Viewer users must not retain a sales representative link.
update public.user_profiles
set representative_id=null, updated_at=now()
where role='viewer'::public.app_role
  and representative_id is not null;

-- Remove old sales/installation representative scope rows for viewer users.
delete from public.user_data_access_representatives r
using public.user_profiles u
where u.id=r.user_id
  and u.role='viewer'::public.app_role;

delete from public.installation_data_access_representatives r
using public.user_profiles u
where u.id=r.user_id
  and u.role='viewer'::public.app_role;

insert into public.user_data_access_profiles(user_id,access_mode,updated_at)
select u.id,'selected',now()
from public.user_profiles u
where u.role='viewer'::public.app_role
on conflict(user_id) do update
set access_mode='selected',updated_at=excluded.updated_at;

insert into public.installation_data_access_profiles(user_id,access_mode,updated_at)
select u.id,'own',now()
from public.user_profiles u
where u.role='viewer'::public.app_role
on conflict(user_id) do update
set access_mode='own',updated_at=excluded.updated_at;

notify pgrst, 'reload schema';

commit;

-- Verification
select
  u.id,
  u.full_name,
  u.role,
  u.representative_id,
  b.installation_team_id,
  t.name as team_name,
  dap.access_mode as installation_access_mode
from public.user_profiles u
left join public.installation_user_technician_bindings b on b.user_id=u.id
left join public.installation_teams t on t.id=b.installation_team_id
left join public.installation_data_access_profiles dap on dap.user_id=u.id
where u.role='viewer'::public.app_role
order by u.full_name;

select
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('can_access_installation_request_scope','can_access_installation_assignment')
order by p.proname;
