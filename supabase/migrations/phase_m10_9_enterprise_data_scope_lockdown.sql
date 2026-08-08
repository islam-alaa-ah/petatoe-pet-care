-- KYUM CRM Phase M10.9 — Enterprise Data Scope Lockdown
-- Canonical server-side scope for every report source: customers, follow-ups and quotations.
-- Run in Supabase SQL Editor as postgres.

begin;

create index if not exists idx_customers_scope_created
  on public.customers (representative_id, created_at desc);
create index if not exists idx_followups_scope_contact
  on public.customer_followups (representative_id, contact_date desc, created_at desc);
create index if not exists idx_quotations_scope_date
  on public.quotations (representative_id, quotation_date desc, created_at desc);
create index if not exists idx_access_representatives_user_rep
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
      and coalesce(p.is_active, true)
  )
  select coalesce((
    select case
      when cp.role_name in ('super_admin','sales_manager','viewer') then true
      when cp.role_name <> 'sales_representative' then false
      when cp.representative_id is null or p_representative_id is null then false
      when cp.access_mode = 'selected' then
        p_representative_id = cp.representative_id
        or exists (
          select 1
          from public.user_data_access_representatives ar
          where ar.user_id = cp.id
            and ar.representative_id = p_representative_id
        )
      else p_representative_id = cp.representative_id
    end
    from current_profile cp
  ), false);
$$;

grant execute on function public.can_access_representative(uuid) to authenticated;

-- Remove all permissive SELECT policies on core report-source tables. PostgreSQL
-- combines permissive policies with OR, so one legacy broad policy can expose
-- data even when a newer scoped policy exists.
do $$
declare
  target_table text;
  policy_row record;
begin
  foreach target_table in array array['customers','customer_followups','quotations','customer_interests']
  loop
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and cmd = 'SELECT'
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;
end $$;

create policy "customers canonical scoped select"
on public.customers for select to authenticated
using (
  public.has_screen_permission('customers','view')
  and public.can_access_representative(representative_id)
);

create policy "followups canonical scoped select"
on public.customer_followups for select to authenticated
using (
  public.has_screen_permission('followups','view')
  and public.can_access_representative(representative_id)
);

create policy "quotations canonical scoped select"
on public.quotations for select to authenticated
using (
  public.has_screen_permission('quotations','view')
  and public.can_access_representative(representative_id)
);

create policy "customer interests canonical scoped select"
on public.customer_interests for select to authenticated
using (
  public.has_screen_permission('customers','view')
  and exists (
    select 1
    from public.customers c
    where c.id = customer_id
      and public.can_access_representative(c.representative_id)
  )
);

commit;
