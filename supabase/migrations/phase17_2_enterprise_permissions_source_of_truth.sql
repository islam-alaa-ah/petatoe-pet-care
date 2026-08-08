-- KYUM CRM Phase 17.2-A — Enterprise Permissions Source of Truth
-- Canonical permission helper used by future RLS policies.

begin;

create or replace function public.has_screen_permission(
  p_screen_key text,
  p_action text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.current_user_role() = 'super_admin'::public.app_role then true
    else exists (
      select 1
      from public.role_screen_permissions rsp
      join public.app_screens s on s.screen_key = rsp.screen_key
      where rsp.role = public.current_user_role()
        and rsp.screen_key = p_screen_key
        and s.is_active = true
        and case lower(coalesce(p_action, 'view'))
          when 'view' then rsp.can_view
          when 'add' then rsp.can_add
          when 'edit' then rsp.can_edit
          when 'delete' then rsp.can_delete
          when 'export' then rsp.can_export
          else false
        end
    )
  end;
$$;

revoke all on function public.has_screen_permission(text,text) from public;
revoke all on function public.has_screen_permission(text,text) from anon;
grant execute on function public.has_screen_permission(text,text) to authenticated;
grant execute on function public.has_screen_permission(text,text) to service_role;

-- Ensure every active screen has a complete Super Admin row.
insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export,updated_at
)
select
  'super_admin'::public.app_role, screen_key, true, true, true, true, true, now()
from public.app_screens
where is_active = true
on conflict(role,screen_key) do update set
  can_view = true, can_add = true, can_edit = true,
  can_delete = true, can_export = true, updated_at = now();

commit;

-- Verification
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'has_screen_permission';
