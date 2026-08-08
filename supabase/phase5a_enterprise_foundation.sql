-- ============================================================
-- Customer Management v1.0 — Phase 5A Enterprise Foundation
-- Project: Kyum Trading Company
-- Run this ONCE in the NEW Supabase project's SQL Editor.
-- Do NOT run it in PETATOE.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Enterprise roles and user profiles
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'super_admin',
      'sales_manager',
      'sales_representative',
      'viewer'
    );
  end if;
end $$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'viewer',
  representative_id uuid references public.sales_representatives(id) on delete set null,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'viewer'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_profiles where id = auth.uid() and is_active = true),
    'viewer'::public.app_role
  );
$$;

create or replace function public.current_representative_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select representative_id
  from public.user_profiles
  where id = auth.uid()
    and is_active = true;
$$;

create or replace function public.is_management_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('super_admin', 'sales_manager');
$$;

-- ------------------------------------------------------------
-- 2. Audit log
-- ------------------------------------------------------------

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_user_date
  on public.audit_logs (user_id, created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs (entity_type, entity_id);

-- ------------------------------------------------------------
-- 3. Enterprise future-ready CRM entities
-- ------------------------------------------------------------

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  full_name text not null,
  job_title text,
  mobile text,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_representative_id uuid references public.sales_representatives(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'متوسطة'
    check (priority in ('منخفضة', 'متوسطة', 'عالية', 'عاجلة')),
  status text not null default 'مفتوحة'
    check (status in ('مفتوحة', 'قيد التنفيذ', 'مكتملة', 'ملغاة')),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_attachments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete cascade,
  followup_id uuid references public.customer_followups(id) on delete cascade,
  file_name text not null,
  storage_bucket text not null default 'crm-attachments',
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete set null,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  order_date date not null,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status text not null default 'مسودة'
    check (status in ('مسودة', 'معتمد', 'قيد التنفيذ', 'مكتمل', 'ملغي')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_date date not null,
  due_date date,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'غير مدفوعة'
    check (status in ('غير مدفوعة', 'مدفوعة جزئيًا', 'مدفوعة', 'متأخرة', 'ملغاة')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_projects (
  id uuid primary key default gen_random_uuid(),
  project_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_name text not null,
  project_type text,
  start_date date,
  expected_end_date date,
  actual_end_date date,
  status text not null default 'مخطط'
    check (status in ('مخطط', 'قيد التنفيذ', 'متوقف', 'مكتمل', 'ملغي')),
  representative_id uuid references public.sales_representatives(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.customer_projects(id) on delete set null,
  contract_type text,
  start_date date not null,
  end_date date,
  contract_value numeric(14,2) not null default 0 check (contract_value >= 0),
  status text not null default 'نشط'
    check (status in ('مسودة', 'نشط', 'منتهي', 'ملغي')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installed_assets (
  id uuid primary key default gen_random_uuid(),
  asset_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  product_category text not null,
  brand text,
  model text,
  serial_number text,
  installation_date date,
  warranty_start_date date,
  warranty_end_date date,
  location text,
  status text not null default 'نشط'
    check (status in ('نشط', 'متوقف', 'تحت الصيانة', 'مستبدل')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  asset_id uuid references public.installed_assets(id) on delete set null,
  request_type text not null,
  opened_at timestamptz not null default now(),
  scheduled_at timestamptz,
  closed_at timestamptz,
  priority text not null default 'متوسطة'
    check (priority in ('منخفضة', 'متوسطة', 'عالية', 'عاجلة')),
  status text not null default 'مفتوح'
    check (status in ('مفتوح', 'مجدول', 'قيد التنفيذ', 'مغلق', 'ملغي')),
  description text,
  resolution text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete set null,
  complaint_date date not null default current_date,
  category text,
  description text not null,
  priority text not null default 'متوسطة'
    check (priority in ('منخفضة', 'متوسطة', 'عالية', 'عاجلة')),
  status text not null default 'مفتوحة'
    check (status in ('مفتوحة', 'قيد المعالجة', 'محلولة', 'مغلقة')),
  resolution text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  collection_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text,
  reference_number text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. Shared updated_at triggers
-- ------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles',
    'customer_contacts',
    'crm_tasks',
    'sales_orders',
    'invoices',
    'customer_projects',
    'customer_contracts',
    'installed_assets',
    'service_requests',
    'customer_complaints'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Replace permissive Phase 1–3 policies
-- ------------------------------------------------------------

drop policy if exists "authenticated manage customers" on public.customers;
drop policy if exists "authenticated manage customer interests" on public.customer_interests;
drop policy if exists "authenticated manage customer followups" on public.customer_followups;
drop policy if exists "authenticated manage quotations" on public.quotations;
drop policy if exists "authenticated read representatives" on public.sales_representatives;
drop policy if exists "authenticated read interests" on public.interest_categories;
drop policy if exists "authenticated read reasons" on public.no_sale_reasons;

-- ------------------------------------------------------------
-- 6. Enable RLS
-- ------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_attachments enable row level security;
alter table public.sales_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.customer_projects enable row level security;
alter table public.customer_contracts enable row level security;
alter table public.installed_assets enable row level security;
alter table public.service_requests enable row level security;
alter table public.customer_complaints enable row level security;
alter table public.collections enable row level security;

-- ------------------------------------------------------------
-- 7. User profile policies
-- ------------------------------------------------------------

drop policy if exists "profiles read own or management" on public.user_profiles;
create policy "profiles read own or management"
on public.user_profiles for select
to authenticated
using (id = auth.uid() or public.is_management_user());

drop policy if exists "profiles update management" on public.user_profiles;
create policy "profiles update management"
on public.user_profiles for update
to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');

-- ------------------------------------------------------------
-- 8. Reference data policies
-- ------------------------------------------------------------

create policy "authenticated read representatives"
on public.sales_representatives for select
to authenticated
using (true);

create policy "management manage representatives"
on public.sales_representatives for all
to authenticated
using (public.is_management_user())
with check (public.is_management_user());

create policy "authenticated read interests"
on public.interest_categories for select
to authenticated
using (true);

create policy "management manage interests"
on public.interest_categories for all
to authenticated
using (public.is_management_user())
with check (public.is_management_user());

create policy "authenticated read reasons"
on public.no_sale_reasons for select
to authenticated
using (true);

create policy "management manage reasons"
on public.no_sale_reasons for all
to authenticated
using (public.is_management_user())
with check (public.is_management_user());

-- ------------------------------------------------------------
-- 9. Customer, follow-up and quotation policies
-- ------------------------------------------------------------

create policy "customers read scoped"
on public.customers for select
to authenticated
using (
  public.is_management_user()
  or (
    public.current_user_role() = 'sales_representative'
    and representative_id = public.current_representative_id()
  )
  or public.current_user_role() = 'viewer'
);

create policy "customers insert scoped"
on public.customers for insert
to authenticated
with check (
  public.is_management_user()
  or (
    public.current_user_role() = 'sales_representative'
    and representative_id = public.current_representative_id()
  )
);

create policy "customers update scoped"
on public.customers for update
to authenticated
using (
  public.is_management_user()
  or (
    public.current_user_role() = 'sales_representative'
    and representative_id = public.current_representative_id()
  )
)
with check (
  public.is_management_user()
  or (
    public.current_user_role() = 'sales_representative'
    and representative_id = public.current_representative_id()
  )
);

create policy "customers delete management"
on public.customers for delete
to authenticated
using (public.is_management_user());

create policy "customer interests read scoped"
on public.customer_interests for select
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        public.is_management_user()
        or public.current_user_role() = 'viewer'
        or c.representative_id = public.current_representative_id()
      )
  )
);

create policy "customer interests manage scoped"
on public.customer_interests for all
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        public.is_management_user()
        or c.representative_id = public.current_representative_id()
      )
  )
)
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        public.is_management_user()
        or c.representative_id = public.current_representative_id()
      )
  )
);

create policy "followups read scoped"
on public.customer_followups for select
to authenticated
using (
  public.is_management_user()
  or public.current_user_role() = 'viewer'
  or representative_id = public.current_representative_id()
);

create policy "followups manage scoped"
on public.customer_followups for all
to authenticated
using (
  public.is_management_user()
  or representative_id = public.current_representative_id()
)
with check (
  public.is_management_user()
  or representative_id = public.current_representative_id()
);

create policy "quotations read scoped"
on public.quotations for select
to authenticated
using (
  public.is_management_user()
  or public.current_user_role() = 'viewer'
  or representative_id = public.current_representative_id()
);

create policy "quotations manage scoped"
on public.quotations for all
to authenticated
using (
  public.is_management_user()
  or representative_id = public.current_representative_id()
)
with check (
  public.is_management_user()
  or representative_id = public.current_representative_id()
);

-- ------------------------------------------------------------
-- 10. Generic policies for future modules
-- Management: full access. Viewer: read. Representative: assigned rows.
-- ------------------------------------------------------------

create policy "audit logs management read"
on public.audit_logs for select
to authenticated
using (public.is_management_user());

create policy "customer contacts read scoped"
on public.customer_contacts for select
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        public.is_management_user()
        or public.current_user_role() = 'viewer'
        or c.representative_id = public.current_representative_id()
      )
  )
);

create policy "customer contacts manage scoped"
on public.customer_contacts for all
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        public.is_management_user()
        or c.representative_id = public.current_representative_id()
      )
  )
)
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        public.is_management_user()
        or c.representative_id = public.current_representative_id()
      )
  )
);

create policy "tasks read assigned"
on public.crm_tasks for select
to authenticated
using (
  public.is_management_user()
  or public.current_user_role() = 'viewer'
  or assigned_user_id = auth.uid()
  or assigned_representative_id = public.current_representative_id()
);

create policy "tasks manage assigned"
on public.crm_tasks for all
to authenticated
using (
  public.is_management_user()
  or assigned_user_id = auth.uid()
  or assigned_representative_id = public.current_representative_id()
)
with check (
  public.is_management_user()
  or assigned_user_id = auth.uid()
  or assigned_representative_id = public.current_representative_id()
);

-- Management-only write access for financial/service future modules.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sales_orders',
    'invoices',
    'customer_projects',
    'customer_contracts',
    'installed_assets',
    'service_requests',
    'customer_complaints',
    'collections',
    'crm_attachments'
  ]
  loop
    execute format(
      'create policy %L on public.%I for select to authenticated using (
        public.is_management_user() or public.current_user_role() = ''viewer''
      )',
      table_name || ' read authorized',
      table_name
    );

    execute format(
      'create policy %L on public.%I for all to authenticated
       using (public.is_management_user())
       with check (public.is_management_user())',
      table_name || ' management write',
      table_name
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 11. Grants required by Data API
-- ------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Ensure future public entities receive authenticated grants.
alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
grant usage, select on sequences to authenticated;

alter default privileges in schema public
grant execute on functions to authenticated;

commit;

-- Verification:
-- select table_name, row_security
-- from information_schema.tables
-- where table_schema = 'public'
-- order by table_name;
