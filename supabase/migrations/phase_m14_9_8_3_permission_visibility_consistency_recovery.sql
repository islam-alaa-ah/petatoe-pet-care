-- Phase M14.9.8.3 — Representative Identity, Installation Ownership & Quotation Action Consistency
begin;

-- Canonical sales owner of an installation request is the current representative of its customer.
-- Fall back to the request value only for legacy customers without a representative.
create or replace function public.installation_request_effective_representative(
  p_customer_id uuid,
  p_request_representative_id uuid
)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (select c.representative_id from public.customers c where c.id=p_customer_id),
    p_request_representative_id
  )
$$;
grant execute on function public.installation_request_effective_representative(uuid,uuid) to authenticated;

-- Repair old/null ownership records that cause the owner's requests to disappear.
update public.installation_requests r
set representative_id=c.representative_id,
    updated_at=now()
from public.customers c
where c.id=r.customer_id
  and c.representative_id is not null
  and r.representative_id is distinct from c.representative_id;

create or replace function public.sync_installation_request_representative()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  new.representative_id := public.installation_request_effective_representative(
    new.customer_id,
    new.representative_id
  );
  return new;
end
$$;

drop trigger if exists trg_sync_installation_request_representative on public.installation_requests;
create trigger trg_sync_installation_request_representative
before insert or update of customer_id,representative_id
on public.installation_requests
for each row execute function public.sync_installation_request_representative();

-- Requests screen is representative-scoped. Team scope is only an additional boundary for
-- scheduling/execution/completion screens; it must not hide a sales representative's own request.
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
  select
    public.can_access_installation_representative(p_representative_id)
    and (
      public.current_user_role()='super_admin'
      or public.has_screen_permission('installationRequests','view')
      or public.can_access_installation_team(p_installation_team_id)
      or (
        p_installation_team_id is null
        and public.has_screen_permission('installationSchedule','edit')
      )
    )
$$;
grant execute on function public.can_access_installation_request_scope(uuid,uuid) to authenticated;

commit;
