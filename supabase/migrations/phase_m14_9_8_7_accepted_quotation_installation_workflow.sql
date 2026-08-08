begin;

alter table public.quotations
  add column if not exists installation_request_id uuid references public.installation_requests(id) on delete set null,
  add column if not exists installation_converted_at timestamptz;

-- A quotation can enter the installation workflow only once.
create unique index if not exists ux_installation_requests_quotation_once
  on public.installation_requests(quotation_id)
  where quotation_id is not null;

create or replace function public.enforce_accepted_quotation_installation_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quotation public.quotations%rowtype;
begin
  if new.quotation_id is null then return new; end if;
  select * into v_quotation from public.quotations where id = new.quotation_id for update;
  if not found then raise exception 'Quotation not found' using errcode='23503'; end if;
  if v_quotation.customer_id is distinct from new.customer_id then
    raise exception 'Quotation does not belong to the selected customer' using errcode='23514';
  end if;
  if v_quotation.status <> 'مقبول' then
    raise exception 'Only accepted quotations can be converted to installation requests' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_accepted_quotation_installation_workflow on public.installation_requests;
create trigger trg_enforce_accepted_quotation_installation_workflow
before insert or update of quotation_id, customer_id on public.installation_requests
for each row execute function public.enforce_accepted_quotation_installation_workflow();

create or replace function public.sync_quotation_installation_link()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.quotation_id is not null and (tg_op='DELETE' or old.quotation_id is distinct from new.quotation_id) then
    update public.quotations q set installation_request_id=null, installation_converted_at=null
    where q.id=old.quotation_id and q.installation_request_id=old.id;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.quotation_id is not null then
    update public.quotations q set installation_request_id=new.id, installation_converted_at=coalesce(q.installation_converted_at,now())
    where q.id=new.quotation_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_quotation_installation_link on public.installation_requests;
create trigger trg_sync_quotation_installation_link
after insert or update of quotation_id or delete on public.installation_requests
for each row execute function public.sync_quotation_installation_link();


create or replace function public.prevent_linked_quotation_status_downgrade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.installation_request_id is not null and new.status <> 'مقبول' then
    raise exception 'A quotation linked to an installation request must remain accepted' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_linked_quotation_status_downgrade on public.quotations;
create trigger trg_prevent_linked_quotation_status_downgrade
before update of status on public.quotations
for each row execute function public.prevent_linked_quotation_status_downgrade();

-- Backfill existing valid links.
update public.quotations q
set installation_request_id = r.id,
    installation_converted_at = coalesce(q.installation_converted_at, r.created_at, now())
from public.installation_requests r
where r.quotation_id=q.id
  and q.installation_request_id is distinct from r.id;

commit;
