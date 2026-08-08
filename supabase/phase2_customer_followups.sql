-- Customer Management v1.0 — Phase 2
-- سجل متابعات العملاء
-- Run after Phase 1 schema.sql

create table if not exists public.customer_followups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  contact_date date not null,
  contact_method text not null check (
    contact_method in ('اتصال', 'واتساب', 'زيارة', 'بريد إلكتروني', 'اجتماع')
  ),
  representative_id uuid references public.sales_representatives(id) on delete set null,
  contact_result text not null check (
    contact_result in (
      'تم التواصل',
      'لم يتم الرد',
      'طلب عرض سعر',
      'تم إرسال عرض سعر',
      'تفاوض',
      'تم البيع',
      'لم يتم البيع',
      'مؤجل'
    )
  ),
  quotation_number text,
  no_sale_reason_id uuid references public.no_sale_reasons(id) on delete set null,
  next_followup_date date,
  is_completed boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_customer_followups_updated_at on public.customer_followups;
create trigger trg_customer_followups_updated_at
before update on public.customer_followups
for each row execute function public.set_updated_at();

create index if not exists idx_followups_customer
  on public.customer_followups (customer_id);

create index if not exists idx_followups_contact_date
  on public.customer_followups (contact_date desc);

create index if not exists idx_followups_next_date
  on public.customer_followups (next_followup_date)
  where is_completed = false;

create index if not exists idx_followups_representative
  on public.customer_followups (representative_id);

alter table public.customer_followups enable row level security;

drop policy if exists "authenticated manage customer followups"
  on public.customer_followups;

create policy "authenticated manage customer followups"
on public.customer_followups
for all
to authenticated
using (true)
with check (true);

create or replace view public.customer_followup_summary as
select
  c.id as customer_id,
  c.customer_number,
  c.customer_name,
  c.phone,
  max(f.contact_date) as last_contact_date,
  min(f.next_followup_date) filter (
    where f.is_completed = false
      and f.next_followup_date is not null
  ) as next_followup_date,
  count(f.id) as followup_count,
  count(f.id) filter (
    where f.is_completed = false
      and f.next_followup_date < current_date
  ) as overdue_followup_count
from public.customers c
left join public.customer_followups f on f.customer_id = c.id
group by c.id, c.customer_number, c.customer_name, c.phone;
