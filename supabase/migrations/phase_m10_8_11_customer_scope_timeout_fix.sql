-- KYUM CRM Phase M10.8.11 — Customer Scope & Timeout Fix
-- Enforces own-data-only for sales representatives and removes legacy broad policies.

begin;

create or replace function public.can_access_representative(p_representative_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_role() = 'super_admin' then true
    when public.current_user_role() = 'sales_representative' then
      p_representative_id is not null
      and p_representative_id = public.current_representative_id()
    when public.current_data_access_mode() = 'all' then true
    when p_representative_id is null then false
    when p_representative_id = public.current_representative_id() then true
    when public.current_data_access_mode() = 'selected' then exists (
      select 1
      from public.user_data_access_representatives a
      where a.user_id = auth.uid()
        and a.representative_id = p_representative_id
    )
    else false
  end;
$$;

grant execute on function public.can_access_representative(uuid) to authenticated;

-- Remove every known legacy customer policy that can broaden visibility.
drop policy if exists "authenticated manage customers" on public.customers;
drop policy if exists "customers read scoped" on public.customers;
drop policy if exists "customers insert scoped" on public.customers;
drop policy if exists "customers update scoped" on public.customers;
drop policy if exists "customers delete management" on public.customers;
drop policy if exists "customers permission select" on public.customers;
drop policy if exists "customers permission insert" on public.customers;
drop policy if exists "customers permission update" on public.customers;
drop policy if exists "customers permission delete" on public.customers;

create policy "customers permission select"
on public.customers for select to authenticated
using (
  public.has_screen_permission('customers','view')
  and public.can_access_representative(representative_id)
);

create policy "customers permission insert"
on public.customers for insert to authenticated
with check (
  public.has_screen_permission('customers','add')
  and public.can_access_representative(representative_id)
);

create policy "customers permission update"
on public.customers for update to authenticated
using (
  public.has_screen_permission('customers','edit')
  and public.can_access_representative(representative_id)
)
with check (
  public.has_screen_permission('customers','edit')
  and public.can_access_representative(representative_id)
);

create policy "customers permission delete"
on public.customers for delete to authenticated
using (
  public.has_screen_permission('customers','delete')
  and public.can_access_representative(representative_id)
);

commit;
