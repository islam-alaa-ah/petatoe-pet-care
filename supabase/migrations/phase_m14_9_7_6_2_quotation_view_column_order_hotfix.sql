begin;

alter table public.quotations
  add column if not exists customer_order_number text,
  add column if not exists legacy_status text;

alter table public.quotations
  drop constraint if exists quotations_customer_order_number_length;

alter table public.quotations
  add constraint quotations_customer_order_number_length
  check (
    customer_order_number is null
    or char_length(btrim(customer_order_number)) between 1 and 120
  );

comment on column public.quotations.customer_order_number is
  'Optional customer-issued purchase order or request reference. Distinct from quotation_number.';

comment on column public.quotations.legacy_status is
  'Preserves the pre-M14.9.7.6 quotation status when a legacy status is normalized.';

-- Remove every CHECK constraint that references quotations.status before changing values.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.quotations'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format(
      'alter table public.quotations drop constraint if exists %I',
      c.conname
    );
  end loop;
end $$;

-- Extra compatibility names used by older database revisions.
alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations drop constraint if exists quotations_status_check1;

-- Preserve legacy values, then normalize to the three canonical statuses.
update public.quotations
set
  legacy_status = case
    when status not in ('قيد التنفيذ', 'مقبول', 'مرفوض')
      then coalesce(legacy_status, status)
    else legacy_status
  end,
  status = case
    when status in ('تحت التجهيز', 'تم الإرسال', 'تحت المراجعة') then 'قيد التنفيذ'
    when status = 'ملغي' then 'مرفوض'
    when status in ('قيد التنفيذ', 'مقبول', 'مرفوض') then status
    else 'قيد التنفيذ'
  end
where
  status not in ('قيد التنفيذ', 'مقبول', 'مرفوض')
  or status is null;

alter table public.quotations
  add constraint quotations_status_check
  check (status in ('قيد التنفيذ', 'مقبول', 'مرفوض'));

create index if not exists idx_quotations_customer_order_number
  on public.quotations (customer_order_number)
  where customer_order_number is not null;

-- IMPORTANT:
-- Keep every existing quotation_summary column in the exact same ordinal position.
-- PostgreSQL permits CREATE OR REPLACE VIEW to append new columns only at the end.
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
  nr.name as rejection_reason,
  q.customer_order_number
from public.quotations q
join public.customers c on c.id = q.customer_id
left join public.sales_representatives r on r.id = q.representative_id
left join public.no_sale_reasons nr on nr.id = q.rejection_reason_id;

commit;
