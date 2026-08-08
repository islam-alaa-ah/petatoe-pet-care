-- KYUM CRM Phase M10.8.12
-- Customer selected-scope enforcement and timeout protection.
-- Safe to run in Supabase SQL Editor.

begin;

create index if not exists idx_customers_representative_created_at
  on public.customers (representative_id, created_at desc);

create index if not exists idx_user_data_access_reps_user_rep
  on public.user_data_access_representatives (user_id, representative_id);

create or replace function public.can_access_representative(p_representative_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.id,
      p.role::text as role_name,
      p.representative_id,
      coalesce(a.access_mode, case
        when p.role::text in ('super_admin','sales_manager','viewer') then 'all'
        when p.representative_id is not null then 'own'
        else 'selected'
      end) as access_mode
    from public.user_profiles p
    left join public.user_data_access_profiles a on a.user_id = p.id
    where p.id = auth.uid()
  )
  select coalesce((
    select case
      when cp.role_name in ('super_admin','sales_manager','viewer') then true
      when cp.role_name = 'sales_representative' and p_representative_id is null then false
      when cp.role_name = 'sales_representative' and cp.representative_id is null then false
      when cp.role_name = 'sales_representative' and cp.access_mode = 'own'
        then p_representative_id = cp.representative_id
      when cp.role_name = 'sales_representative' and cp.access_mode = 'selected'
        then p_representative_id = cp.representative_id
          or exists (
            select 1
            from public.user_data_access_representatives ar
            where ar.user_id = cp.id
              and ar.representative_id = p_representative_id
          )
      -- Never allow a sales representative to become globally unscoped because
      -- of an old or accidental access_mode='all' value.
      when cp.role_name = 'sales_representative'
        then p_representative_id = cp.representative_id
      else false
    end
    from current_profile cp
  ), false);
$$;

grant execute on function public.can_access_representative(uuid) to authenticated;

-- PostgreSQL combines permissive SELECT policies with OR. An obsolete broad
-- policy can therefore bypass the canonical scope policy. Remove every SELECT
-- policy on customers, then install one authoritative policy.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.customers', policy_row.policyname);
  end loop;
end $$;

create policy "customers canonical scoped select"
on public.customers
for select
to authenticated
using (
  public.has_screen_permission('customers','view')
  and public.can_access_representative(representative_id)
);

commit;
