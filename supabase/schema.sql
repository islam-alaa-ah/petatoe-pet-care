
-- Customer Management v1.0 - Phase 1
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.sales_representatives (
  id uuid primary key default gen_random_uuid(),
  representative_code text unique not null,
  full_name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.interest_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.no_sale_reasons (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists public.customer_number_seq start 1;

create or replace function public.generate_customer_number()
returns text
language sql
as $$
  select 'C' || lpad(nextval('public.customer_number_seq')::text, 6, '0');
$$;


create or replace function public.normalize_customer_phone(value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  normalized := regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g');

  if normalized like '00966%' then
    normalized := substring(normalized from 6);
  elsif normalized like '966%' then
    normalized := substring(normalized from 4);
  end if;

  if normalized ~ '^5[0-9]{8}$' then
    normalized := '0' || normalized;
  end if;

  return normalized;
end;
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text unique not null default public.generate_customer_number(),
  customer_name text not null,
  customer_type text not null check (customer_type in ('شركة', 'فردي')),
  phone text not null,
  normalized_phone text generated always as (public.normalize_customer_phone(phone)) stored,
  secondary_phone text,
  email text,
  region text,
  city text,
  district text,
  address text,
  contact_person_name text,
  contact_person_title text,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  last_contact_date date,
  quotation_number text,
  no_sale_reason_id uuid references public.no_sale_reasons(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_interests (
  customer_id uuid not null references public.customers(id) on delete cascade,
  interest_category_id uuid not null references public.interest_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, interest_category_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create index if not exists idx_customers_name on public.customers (customer_name);
create index if not exists idx_customers_number on public.customers (customer_number);
create index if not exists idx_customers_representative on public.customers (representative_id);
create index if not exists idx_customers_contact_date on public.customers (last_contact_date);
create unique index if not exists uq_customers_normalized_phone
  on public.customers (normalized_phone);

alter table public.customers
  drop constraint if exists customers_valid_mobile_check;

alter table public.customers
  add constraint customers_valid_mobile_check
  check (normalized_phone ~ '^05[0-9]{8}$');
