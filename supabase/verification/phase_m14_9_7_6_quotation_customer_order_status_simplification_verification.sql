-- Phase M14.9.7.6 verification

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='quotations'
  and column_name in ('customer_order_number','legacy_status')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.quotations'::regclass
  and conname in ('quotations_status_check','quotations_customer_order_number_length')
order by conname;

select status, count(*)
from public.quotations
group by status
order by status;

-- Must return 0 rows.
select id, quotation_number, status
from public.quotations
where status not in ('قيد التنفيذ','مقبول','مرفوض');

-- Must return 0 rows.
select id, quotation_number, customer_order_number
from public.quotations
where customer_order_number is not null
  and (char_length(btrim(customer_order_number)) < 1 or char_length(btrim(customer_order_number)) > 120);
