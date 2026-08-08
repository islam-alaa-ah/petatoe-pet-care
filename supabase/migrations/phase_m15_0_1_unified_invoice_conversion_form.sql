-- Phase M15.0.1 — Unified Invoice Conversion Form
begin;

-- Enforce nine English digits for every new or changed invoice number while
-- preserving any historical M15.0 generated identifiers until manually reviewed.
alter table public.sales_invoices
  drop constraint if exists sales_invoices_invoice_number_nine_digits;
alter table public.sales_invoices
  add constraint sales_invoices_invoice_number_nine_digits
  check (invoice_number ~ '^[0-9]{9}$') not valid;

create or replace function public.create_sales_invoice_from_quotation(
  p_quotation_id uuid,
  p_invoice_number text,
  p_invoice_date date
)
returns public.sales_invoices language plpgsql security definer set search_path=public as $$
declare q public.quotations%rowtype; existing public.sales_invoices%rowtype; created public.sales_invoices%rowtype;
begin
  if not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  if coalesce(p_invoice_number,'') !~ '^[0-9]{9}$' then raise exception 'رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  select * into q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'عرض السعر غير موجود'; end if;
  if q.status <> 'مقبول' then raise exception 'لا يمكن فوترة عرض سعر غير مقبول'; end if;
  if q.installation_request_id is not null or exists(select 1 from public.installation_requests r where r.quotation_id=q.id) then raise exception 'عرض السعر مرتبط بطلب تركيب ويجب إصدار الفاتورة من تأكيد الانتهاء من التركيبات'; end if;
  if not public.can_access_representative(q.representative_id) then raise exception 'عرض السعر خارج نطاق البيانات المسموح'; end if;
  select * into existing from public.sales_invoices where quotation_id=q.id and status<>'ملغاة' limit 1;
  if found then return existing; end if;
  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,invoice_amount,installation_expenses,invoice_date,source_type,status)
  values(p_invoice_number,coalesce(nullif(q.customer_order_number,''),q.quotation_number),q.customer_id,q.representative_id,q.id,q.amount,0,p_invoice_date,'quotation','صادرة')
  returning * into created;
  return created;
end;$$;
grant execute on function public.create_sales_invoice_from_quotation(uuid,text,date) to authenticated;
revoke execute on function public.create_sales_invoice_from_quotation(uuid) from authenticated;

create or replace function public.sync_sales_invoice_from_installation(p_installation_request_id uuid)
returns public.sales_invoices language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; cr public.installation_completion_reports%rowtype; existing public.sales_invoices%rowtype; created public.sales_invoices%rowtype; cost numeric(14,2);
begin
  if auth.uid() is not null and not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  select * into r from public.installation_requests where id=p_installation_request_id;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  select * into cr from public.installation_completion_reports where installation_request_id=r.id;
  if not found then raise exception 'بيانات تأكيد انتهاء التركيب غير موجودة'; end if;
  if coalesce(trim(cr.invoice_number),'') !~ '^[0-9]{9}$' then raise exception 'رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط'; end if;
  if cr.invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  select * into existing from public.sales_invoices where installation_request_id=r.id and status<>'ملغاة' limit 1;
  select coalesce(sum(s.quantity * coalesce(t.default_cost,0)),0)::numeric(14,2) into cost
  from public.installation_request_services s join public.installation_service_types t on t.id=s.service_type_id
  where s.installation_request_id=r.id;
  if found then
    update public.sales_invoices set invoice_number=cr.invoice_number,request_number=coalesce(nullif(r.customer_order_number,''),r.request_number),invoice_amount=r.total_services_amount,installation_expenses=cost,invoice_date=cr.invoice_date,completion_report_id=cr.id,quotation_id=r.quotation_id,updated_at=now() where id=existing.id returning * into created;
    return created;
  end if;
  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,installation_request_id,completion_report_id,invoice_amount,installation_expenses,invoice_date,source_type,status)
  values(cr.invoice_number,coalesce(nullif(r.customer_order_number,''),r.request_number),r.customer_id,r.representative_id,r.quotation_id,r.id,cr.id,r.total_services_amount,cost,cr.invoice_date,'installation','صادرة')
  returning * into created;
  return created;
end;$$;

drop function if exists public.create_sales_invoice_from_quotation(uuid);
commit;
