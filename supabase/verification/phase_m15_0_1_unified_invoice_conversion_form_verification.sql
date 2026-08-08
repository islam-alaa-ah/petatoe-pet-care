-- Phase M15.0.1 verification
-- Expected 0 rows: duplicate invoice numbers
select invoice_number,count(*) from public.sales_invoices group by invoice_number having count(*)>1;
-- Expected 0 rows for invoices created after this phase deployment
select id,invoice_number,created_at from public.sales_invoices where created_at >= now()-interval '1 day' and invoice_number !~ '^[0-9]{9}$';
-- Expected 0 rows: active duplicate source cycles
select quotation_id,count(*) from public.sales_invoices where quotation_id is not null and status<>'ملغاة' group by quotation_id having count(*)>1;
select installation_request_id,count(*) from public.sales_invoices where installation_request_id is not null and status<>'ملغاة' group by installation_request_id having count(*)>1;
