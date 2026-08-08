-- Phase M10.6.9 — Quotation-aware and no-phone customer import
-- Run after Phase M10.6.8.

begin;

-- Imported customers may legitimately have no available mobile number.
alter table public.customers
  alter column phone drop not null;

alter table public.customers
  drop constraint if exists customers_valid_mobile_check;

alter table public.customers
  add constraint customers_valid_mobile_check
  check (
    phone is null
    or btrim(phone) = ''
    or normalized_phone ~ '^05[0-9]{8}$'
  );

-- Empty normalized phones must not collide with one another.
drop index if exists public.uq_customers_normalized_phone;
create unique index if not exists uq_customers_normalized_phone_present
  on public.customers (normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';

-- A row can be identified by request number, quotation number, or both.
alter table public.customer_requests
  alter column request_number drop not null;

alter table public.customer_requests
  drop constraint if exists customer_requests_number_not_blank;

alter table public.customer_requests
  add constraint customer_requests_identifier_required
  check (
    nullif(btrim(request_number), '') is not null
    or nullif(btrim(quotation_number), '') is not null
  );

alter table public.customer_requests
  drop constraint if exists customer_requests_customer_request_unique;

drop index if exists public.uq_customer_requests_import_identity;
create unique index uq_customer_requests_import_identity
  on public.customer_requests (
    customer_id,
    coalesce(nullif(lower(btrim(request_number)), ''), ''),
    coalesce(nullif(lower(btrim(quotation_number)), ''), '')
  );

commit;
