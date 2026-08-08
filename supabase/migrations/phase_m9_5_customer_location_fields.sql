-- Phase M9.5 — Customer Region, City & District Fields
-- Adds optional customer location fields without changing existing records.

alter table public.customers
  add column if not exists region text,
  add column if not exists district text;

comment on column public.customers.region is 'Customer administrative region';
comment on column public.customers.city is 'Customer city';
comment on column public.customers.district is 'Customer district or neighborhood';
