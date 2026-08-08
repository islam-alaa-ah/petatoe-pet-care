-- KYUM CRM Phase M10.9.1 — Representative Reference Scope Fix
-- Purpose: allow scoped representative reference reads so embedded customer/report
-- relations can resolve the representative name without granting access to the
-- Representatives management screen or changing any write permissions.
-- Dependency: Phase M10.9 (public.can_access_representative(uuid)).
-- Run in Supabase SQL Editor as postgres.

begin;

-- Fail explicitly if the canonical scope function from Phase M10.9 is missing.
do $$
begin
  if to_regprocedure('public.can_access_representative(uuid)') is null then
    raise exception 'Phase M10.9 is required: public.can_access_representative(uuid) was not found';
  end if;
end $$;

alter table public.sales_representatives enable row level security;

-- PostgreSQL combines permissive SELECT policies with OR. Remove every legacy
-- SELECT policy first so a broad historical policy cannot bypass the canonical
-- representative reference scope below.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sales_representatives'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.sales_representatives',
      policy_row.policyname
    );
  end loop;
end $$;

-- One canonical read policy:
-- 1) users who can open the Representatives screen keep their existing read access;
-- 2) other authenticated users can read only representative rows included in their
--    canonical data scope (own / selected, or all for authorized management roles).
-- INSERT / UPDATE / DELETE policies are intentionally untouched.
create policy "representatives canonical reference select"
on public.sales_representatives
for select
to authenticated
using (
  public.has_screen_permission('representatives', 'view')
  or public.can_access_representative(id)
);

commit;
