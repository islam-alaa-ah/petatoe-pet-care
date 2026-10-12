-- R44R38R20R35A2: Run in Supabase SQL Editor with a permitted reporting role.
-- Read only. Historical source parity; values may have grown since the previous 2026-07-31 snapshot.
select
  count(*) as historical_source_rows,
  count(*) filter (where record_type='invoice_line') as invoice_line_rows,
  count(*) filter (where record_type='cash_aggregate') as cash_aggregate_rows,
  round(sum(coalesce(sales_inclusive,0)),2) as inclusive_total,
  round(sum(coalesce(sales_before_tax,0)),2) as before_tax_total,
  round(sum(coalesce(tax_amount,0)),2) as source_tax_total,
  round(sum(coalesce(discount_amount,0)),2) as discounts_total,
  round(sum(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0)),2) as signed_financial_delta,
  count(*) filter (where abs(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0)) > 0.05) as mismatches_over_5_cents
from public.appointment_historical_sales_reporting;

-- Pinpoint independently the historical records that differ from source arithmetic.
select invoice_number, record_type, sales_date, sales_before_tax, tax_amount, discount_amount,
       sales_inclusive, round(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0),2) as signed_delta
from public.appointment_historical_sales_reporting
where abs(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0)) > 0.05
order by abs(coalesce(sales_inclusive,0)-coalesce(sales_before_tax,0)-coalesce(tax_amount,0)) desc, invoice_number
limit 150;

-- Run this last with authenticated session bearing salesReports.view, not SQL Editor owner context.
-- select record_type, is_historical, count(*) as rows,
--        sum(amount_incl_tax) as total, sum(amount_before_tax) as before_tax,
--        sum(tax_amount) as tax,
--        sum(amount_incl_tax-amount_before_tax-tax_amount) as signed_delta
-- from public.sales_reports_rows_r44r38r20r35()
-- group by record_type,is_historical order by is_historical,record_type;
