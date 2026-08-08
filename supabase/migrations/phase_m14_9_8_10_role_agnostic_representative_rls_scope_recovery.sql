-- KYUM CRM Phase M14.9.8.10
-- Role-Agnostic Representative RLS Scope Recovery
-- Run in Supabase SQL Editor as postgres.
--
-- Goal:
--   Make representative data scope depend only on the explicitly saved
--   access_mode + linked/selected representatives, not on the user's role name.
--
-- Scope consumers include customers, follow-ups, quotations, daily operations,
-- installation requests and every policy/RPC that calls can_access_representative(uuid).

begin;

create index if not exists idx_user_data_access_representatives_user_rep
  on public.user_data_access_representatives (user_id, representative_id);

-- Canonical, restrictive fallback:
--   super_admin => all
--   explicit profile row => own / selected / all
--   no profile row + linked representative => own
--   no profile row + no linked representative => selected (empty until configured)
create or replace function public.current_data_access_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.role::text = 'super_admin' then 'all'
      when a.access_mode in ('own', 'selected', 'all') then a.access_mode
      when p.representative_id is not null then 'own'
      else 'selected'
    end
    from public.user_profiles p
    left join public.user_data_access_profiles a
      on a.user_id = p.id
    where p.id = auth.uid()
      and coalesce(p.is_active, true)
  ), 'selected');
$$;

create or replace function public.can_access_representative(p_representative_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.id as user_id,
      p.role::text as role_name,
      p.representative_id as own_representative_id,
      case
        when p.role::text = 'super_admin' then 'all'
        when a.access_mode in ('own', 'selected', 'all') then a.access_mode
        when p.representative_id is not null then 'own'
        else 'selected'
      end as access_mode
    from public.user_profiles p
    left join public.user_data_access_profiles a
      on a.user_id = p.id
    where p.id = auth.uid()
      and coalesce(p.is_active, true)
  )
  select coalesce((
    select case
      -- The only immutable role override.
      when cp.role_name = 'super_admin' then true

      -- "all" must be explicitly persisted for every non-super-admin role.
      when cp.access_mode = 'all' then true

      -- Unowned rows are not exposed by own/selected scopes.
      when p_representative_id is null then false

      -- The linked representative is always included in own and selected modes.
      when cp.own_representative_id = p_representative_id then true

      -- selected = linked representative + explicitly selected representatives.
      when cp.access_mode = 'selected' then exists (
        select 1
        from public.user_data_access_representatives ar
        where ar.user_id = cp.user_id
          and ar.representative_id = p_representative_id
      )

      -- own with a different representative, or an unconfigured restrictive scope.
      else false
    end
    from current_profile cp
  ), false);
$$;

grant execute on function public.current_data_access_mode() to authenticated;
grant execute on function public.can_access_representative(uuid) to authenticated;

-- Keep timestamps consistent when the scope is updated from the users screen.
update public.user_data_access_profiles
set updated_at = now()
where access_mode not in ('own', 'selected', 'all');

commit;
