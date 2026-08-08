-- Phase M14.9.8.7.2 — Quotation Conversion Visibility Consistency Recovery
begin;

update public.quotations q
set installation_request_id = r.id,
    installation_converted_at = coalesce(q.installation_converted_at, r.created_at, now())
from public.installation_requests r
where r.quotation_id = q.id
  and (
    q.installation_request_id is distinct from r.id
    or q.installation_converted_at is null
  );

update public.quotations q
set installation_request_id = null,
    installation_converted_at = null
where q.installation_request_id is not null
  and not exists (
    select 1
    from public.installation_requests r
    where r.id = q.installation_request_id
      and r.quotation_id = q.id
  );

with legacy_candidates as (
  select
    r.id as request_id,
    min(q.id)::uuid as quotation_id,
    count(*) as candidate_count
  from public.installation_requests r
  join public.quotations q
    on q.customer_id = r.customer_id
   and q.status = 'مقبول'
   and q.installation_request_id is null
   and not exists (
     select 1 from public.installation_requests linked
     where linked.quotation_id = q.id
   )
   and nullif(btrim(coalesce(r.customer_order_number, '')), '') is not null
   and (
     lower(regexp_replace(btrim(q.quotation_number), '\s+', '', 'g'))
       = lower(regexp_replace(btrim(r.customer_order_number), '\s+', '', 'g'))
     or lower(regexp_replace(btrim(coalesce(q.customer_order_number, '')), '\s+', '', 'g'))
       = lower(regexp_replace(btrim(r.customer_order_number), '\s+', '', 'g'))
   )
  where r.quotation_id is null
  group by r.id
),
deterministic_matches as (
  select request_id, quotation_id
  from legacy_candidates
  where candidate_count = 1
)
update public.installation_requests r
set quotation_id = m.quotation_id,
    updated_at = now()
from deterministic_matches m
where r.id = m.request_id
  and r.quotation_id is null;

update public.quotations q
set installation_request_id = r.id,
    installation_converted_at = coalesce(q.installation_converted_at, r.created_at, now())
from public.installation_requests r
where r.quotation_id = q.id
  and (
    q.installation_request_id is distinct from r.id
    or q.installation_converted_at is null
  );

create or replace function public.sync_quotation_installation_link()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op in ('UPDATE','DELETE')
     and old.quotation_id is not null
     and (tg_op='DELETE' or old.quotation_id is distinct from new.quotation_id) then
    update public.quotations q
    set installation_request_id = null,
        installation_converted_at = null
    where q.id = old.quotation_id
      and q.installation_request_id = old.id;
  end if;

  if tg_op in ('INSERT','UPDATE') and new.quotation_id is not null then
    update public.quotations q
    set installation_request_id = new.id,
        installation_converted_at = coalesce(q.installation_converted_at, now())
    where q.id = new.quotation_id;
  end if;

  return null;
end $$;

drop trigger if exists trg_sync_quotation_installation_link on public.installation_requests;
create trigger trg_sync_quotation_installation_link
after insert or update of quotation_id or delete on public.installation_requests
for each row execute function public.sync_quotation_installation_link();

commit;
