-- KYUM Phase 15.4.1 — Company contact person
-- Run once in the Kyum Trading Company Supabase SQL Editor.

begin;

alter table public.customers
  add column if not exists contact_person_name text;

comment on column public.customers.contact_person_name is
  'Name of the responsible contact person when customer_type is شركة';

commit;

notify pgrst, 'reload schema';
