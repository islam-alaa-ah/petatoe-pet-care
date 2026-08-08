-- Phase M15.13.12 verification (read only)
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='sales_invoices' and column_name='installation_execution_visit_id') as visit_invoice_link_column,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='installation_execution_visits' and column_name='confirmation_cancelled_at') as cancellation_audit_column,
  to_regprocedure('public.create_sales_invoice_from_installation_visit(uuid,uuid,text,date)') is not null as visit_invoice_rpc,
  to_regprocedure('public.cancel_installation_execution_visit_confirmation(uuid,uuid,text)') is not null as superadmin_cancel_rpc;

select indexname,indexdef
from pg_indexes
where schemaname='public'
  and indexname in (
    'uq_sales_invoices_active_installation_legacy',
    'uq_sales_invoices_active_installation_visit',
    'uq_sales_invoices_active_quotation'
  )
order by indexname;

select
  count(*) filter(where installation_execution_visit_id is not null and status<>'ملغاة') as active_visit_invoices,
  count(*) filter(where installation_execution_visit_id is null and installation_request_id is not null and source_type='installation' and status<>'ملغاة') as active_legacy_request_invoices
from public.sales_invoices;
