-- KYUM Phase M10.6.8 — Customer Multi-Request Import
-- A customer remains unique by normalized phone. Requests are unique per customer + request number.

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  request_number text not null,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  request_date date not null default current_date,
  quotation_number text,
  notes text,
  source_row integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_requests_number_not_blank check (btrim(request_number) <> ''),
  constraint customer_requests_customer_request_unique unique (customer_id, request_number)
);

create index if not exists idx_customer_requests_customer
  on public.customer_requests (customer_id);
create index if not exists idx_customer_requests_date
  on public.customer_requests (request_date desc);
create index if not exists idx_customer_requests_representative
  on public.customer_requests (representative_id);

drop trigger if exists trg_customer_requests_updated_at on public.customer_requests;
create trigger trg_customer_requests_updated_at
before update on public.customer_requests
for each row execute function public.set_updated_at();

alter table public.customer_requests enable row level security;

drop policy if exists "customer requests visible through customer scope" on public.customer_requests;
create policy "customer requests visible through customer scope"
on public.customer_requests
for select
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_requests.customer_id
  )
);

drop policy if exists "authenticated insert customer requests" on public.customer_requests;
create policy "authenticated insert customer requests"
on public.customer_requests
for insert
to authenticated
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_requests.customer_id
  )
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "authenticated update customer requests" on public.customer_requests;
create policy "authenticated update customer requests"
on public.customer_requests
for update
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_requests.customer_id
  )
)
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_requests.customer_id
  )
);

drop policy if exists "authenticated delete customer requests" on public.customer_requests;
create policy "authenticated delete customer requests"
on public.customer_requests
for delete
to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_requests.customer_id
  )
);
