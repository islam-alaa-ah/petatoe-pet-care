-- KYUM CRM Phase M14.9.3.1 — Operational Reference Dropdown Scope Recovery
-- Allows CRM users to read active operational reference values without granting
-- access to the Settings management screen or any reference-data write action.

begin;

alter table public.interest_categories enable row level security;
alter table public.no_sale_reasons enable row level security;

-- PostgreSQL combines permissive SELECT policies using OR. Remove historical
-- SELECT policies before creating one canonical operational read boundary.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('interest_categories', 'no_sale_reasons')
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "interest categories canonical operational select"
on public.interest_categories
for select
to authenticated
using (
  public.has_screen_permission('settings', 'view')
  or (
    is_active = true
    and (
      public.has_screen_permission('customers', 'view')
      or public.has_screen_permission('customers', 'add')
      or public.has_screen_permission('customers', 'edit')
      or public.has_screen_permission('followups', 'view')
      or public.has_screen_permission('followups', 'add')
      or public.has_screen_permission('followups', 'edit')
      or public.has_screen_permission('quotations', 'view')
      or public.has_screen_permission('quotations', 'add')
      or public.has_screen_permission('quotations', 'edit')
    )
  )
);

create policy "no sale reasons canonical operational select"
on public.no_sale_reasons
for select
to authenticated
using (
  public.has_screen_permission('settings', 'view')
  or (
    is_active = true
    and (
      public.has_screen_permission('customers', 'view')
      or public.has_screen_permission('customers', 'add')
      or public.has_screen_permission('customers', 'edit')
      or public.has_screen_permission('followups', 'view')
      or public.has_screen_permission('followups', 'add')
      or public.has_screen_permission('followups', 'edit')
      or public.has_screen_permission('quotations', 'view')
      or public.has_screen_permission('quotations', 'add')
      or public.has_screen_permission('quotations', 'edit')
    )
  )
);

commit;
