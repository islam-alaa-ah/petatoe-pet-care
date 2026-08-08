-- Phase M14.9.7.6.2 verification

-- 1) New columns must exist.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'quotations'
  and column_name in ('customer_order_number', 'legacy_status')
order by column_name;

-- 2) Only the three canonical statuses may remain.
select status, count(*) as rows_count
from public.quotations
group by status
order by status;

-- 3) This must return 0 rows.
select id, quotation_number, status
from public.quotations
where status is null
   or status not in ('قيد التنفيذ', 'مقبول', 'مرفوض');

-- 4) Confirm the view column order; customer_order_number must be last.
select ordinal_position, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'quotation_summary'
order by ordinal_position;

-- 5) Smoke test.
select *
from public.quotation_summary
limit 5;
