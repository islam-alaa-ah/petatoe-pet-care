-- Customer Management v1.0 — Phase 3
-- إدارة عروض الأسعار
-- Run after Phase 1 and Phase 2 SQL files.

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  quotation_date date not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  status text not null check (
    status in ('تحت التجهيز', 'تم الإرسال', 'تحت المراجعة', 'مقبول', 'مرفوض', 'ملغي')
  ),
  expiry_date date,
  rejection_reason_id uuid references public.no_sale_reasons(id) on delete set null,
  description text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_quotations_updated_at on public.quotations;
create trigger trg_quotations_updated_at
before update on public.quotations
for each row execute function public.set_updated_at();

create index if not exists idx_quotations_customer
  on public.quotations (customer_id);

create index if not exists idx_quotations_representative
  on public.quotations (representative_id);

create index if not exists idx_quotations_date
  on public.quotations (quotation_date desc);

create index if not exists idx_quotations_status
  on public.quotations (status);

alter table public.quotations enable row level security;

drop policy if exists "authenticated manage quotations"
  on public.quotations;

create policy "authenticated manage quotations"
on public.quotations
for all
to authenticated
using (true)
with check (true);

create or replace view public.quotation_summary as
select
  q.id,
  q.quotation_number,
  q.quotation_date,
  q.amount,
  q.status,
  q.expiry_date,
  c.id as customer_id,
  c.customer_name,
  c.phone as customer_phone,
  r.full_name as representative_name,
  nr.name as rejection_reason
from public.quotations q
join public.customers c on c.id = q.customer_id
left join public.sales_representatives r on r.id = q.representative_id
left join public.no_sale_reasons nr on nr.id = q.rejection_reason_id;
