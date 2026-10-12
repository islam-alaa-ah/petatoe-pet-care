-- Read-only completeness and parity inspection. Execute in SQL Editor; permissions may differ from authenticated end-user.
-- 1: Available years/months in each SOURCE (unrestricted SQL Editor view).
select 'historical' as source, extract(year from sales_date)::int as year,
 extract(month from sales_date)::int as month, count(*) as rows,
 round(sum(coalesce(sales_inclusive,0)),2) as total
from public.appointment_historical_sales_reporting
where sales_date is not null
group by 1,2,3
union all
select 'current', extract(year from invoice_date)::int, extract(month from invoice_date)::int,
 count(*), round(sum(coalesce(final_amount,invoice_amount*(1+coalesce(tax_rate,15)/100.0),0)),2)
from public.sales_invoices
where invoice_date is not null
group by 1,2,3
order by year,month,source;

-- 2: Source historical by kind and financial mismatch; do NOT erase mismatch via rounding.
select record_type, extract(year from sales_date)::int as year,
 count(*) as rows, round(sum(coalesce(sales_inclusive,0)),2) as inclusive,
 round(sum(coalesce(sales_before_tax,0)),2) as before_tax,
 round(sum(coalesce(tax_amount,0)),2) as tax,
 round(sum(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0)),2) as signed_delta,
 count(*) filter (where abs(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0)) > .05) as mismatched_rows
from public.appointment_historical_sales_reporting
group by 1,2 order by 2,1;

-- 3: Evaluate in an authenticated session with salesReports.view granted; compare against the source
-- select extract(year from invoice_date)::int year, extract(month from invoice_date)::int month,
-- is_historical,record_type,count(*) rows,round(sum(amount_incl_tax),2) inclusive
-- from public.sales_reports_rows_r44r38r20r35()
-- group by 1,2,3,4 order by 1,2,3,4;
-- If SQL Editor owner bypasses application identity, its result must NOT certify ordinary-user permissions.
