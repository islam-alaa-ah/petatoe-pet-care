begin;

-- M13.22.4: cumulative recovery for sales-representative create actions.
-- This migration is intentionally idempotent and preserves edit/delete/export choices.

insert into public.role_screen_permissions (
  role,
  screen_key,
  can_view,
  can_add,
  can_edit,
  can_delete,
  can_export,
  updated_at
)
values
  ('sales_representative', 'customers', true, true, true, false, false, now()),
  ('sales_representative', 'quotations', true, true, true, true, false, now())
on conflict (role, screen_key) do update
set
  can_view = true,
  can_add = true,
  updated_at = now();

-- Re-create INSERT policies so UI permission and database enforcement use the same keys.
drop policy if exists "customers permission insert" on public.customers;
create policy "customers permission insert"
on public.customers for insert to authenticated
with check (
  public.has_screen_permission('customers','add')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

drop policy if exists "quotations permission insert" on public.quotations;
create policy "quotations permission insert"
on public.quotations for insert to authenticated
with check (
  public.has_screen_permission('quotations','add')
  and (
    public.is_management_user()
    or representative_id = public.current_representative_id()
  )
);

-- Fail the migration if the required role rows were not recovered.
do $$
declare
  v_missing text[];
begin
  select array_agg(required.screen_key)
    into v_missing
  from (values ('customers'), ('quotations')) as required(screen_key)
  left join public.role_screen_permissions rsp
    on rsp.role = 'sales_representative'
   and rsp.screen_key = required.screen_key
   and rsp.can_view is true
   and rsp.can_add is true
  where rsp.screen_key is null;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'M13.22.4 permission recovery failed for: %', array_to_string(v_missing, ', ');
  end if;
end $$;

commit;
