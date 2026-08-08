-- Phase M15.0 verification
select screen_key,screen_name,group_name,is_active from public.app_screens where screen_key='salesInvoices';
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='sales_invoices' order by ordinal_position;
-- Expected: 0 rows
select quotation_id,count(*) from public.sales_invoices where quotation_id is not null and status<>'ملغاة' group by quotation_id having count(*)>1;
-- Expected: 0 rows
select installation_request_id,count(*) from public.sales_invoices where installation_request_id is not null and status<>'ملغاة' group by installation_request_id having count(*)>1;
-- Existing completion reports with invoices should all be represented. Expected: 0 rows
select cr.installation_request_id,cr.invoice_number from public.installation_completion_reports cr left join public.sales_invoices si on si.installation_request_id=cr.installation_request_id and si.status<>'ملغاة' where nullif(trim(cr.invoice_number),'') is not null and cr.invoice_date is not null and si.id is null;
select invoice_number,request_number,invoice_amount,installation_expenses,invoice_date,source_type,status from public.sales_invoices order by invoice_date desc limit 20;
