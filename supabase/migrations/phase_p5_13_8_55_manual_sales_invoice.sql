-- Phase P5.13.8.55 — Manual Sales Invoice
-- Scope: Sales Invoices only. Adds a manual invoice source, reusable appointment services,
-- the canonical appointment discount/VAT rule, and an optional same-customer/same-month
-- reference to an already issued appointment invoice.
begin;

alter table public.sales_invoices
  add column if not exists payment_method text,
  add column if not exists reference_sales_invoice_id uuid references public.sales_invoices(id) on delete set null,
  add column if not exists manual_subtotal numeric(14,2),
  add column if not exists tax_rate numeric(6,2),
  add column if not exists tax_amount numeric(14,2),
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(14,2),
  add column if not exists discount_amount numeric(14,2),
  add column if not exists final_amount numeric(14,2),
  add column if not exists notes text;

alter table public.sales_invoices
  drop constraint if exists sales_invoices_source_type_check;
alter table public.sales_invoices
  add constraint sales_invoices_source_type_check
  check (source_type in ('quotation','installation','manual'));

alter table public.sales_invoices
  drop constraint if exists sales_invoices_manual_discount_type_check;
alter table public.sales_invoices
  add constraint sales_invoices_manual_discount_type_check
  check (discount_type is null or discount_type in ('amount','percentage'));

create index if not exists idx_sales_invoices_reference
  on public.sales_invoices(reference_sales_invoice_id)
  where reference_sales_invoice_id is not null;
create index if not exists idx_sales_invoices_manual_customer_month
  on public.sales_invoices(customer_id,invoice_date desc)
  where source_type='manual';

create table if not exists public.sales_invoice_services (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  service_type_id uuid not null references public.installation_service_types(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_invoice_services_invoice
  on public.sales_invoice_services(sales_invoice_id);
create index if not exists idx_sales_invoice_services_service
  on public.sales_invoice_services(service_type_id);

alter table public.sales_invoice_services enable row level security;
drop policy if exists "sales invoice services scoped select" on public.sales_invoice_services;
create policy "sales invoice services scoped select" on public.sales_invoice_services
for select to authenticated using (
  public.has_screen_permission('salesInvoices','view')
  and exists (
    select 1
    from public.sales_invoices si
    where si.id=sales_invoice_services.sales_invoice_id
      and (si.representative_id is null or public.can_access_representative(si.representative_id))
  )
);
grant select on public.sales_invoice_services to authenticated;

create or replace function public.get_manual_sales_invoice_catalog()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'customers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'customer_number',coalesce(c.customer_number,''),
        'customer_name',coalesce(c.customer_name,''),
        'phone',coalesce(c.phone,'')
      ) order by c.customer_name)
      from public.customers c
      where c.representative_id is null or public.can_access_representative(c.representative_id)
    ),'[]'::jsonb),
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',st.id,
        'name',coalesce(st.name,''),
        'default_price',coalesce(st.default_price,0)
      ) order by st.name)
      from public.installation_service_types st
      where st.is_active=true
    ),'[]'::jsonb)
  )
  where public.has_screen_permission('salesInvoices','add')
$$;

revoke all on function public.get_manual_sales_invoice_catalog() from public,anon;
grant execute on function public.get_manual_sales_invoice_catalog() to authenticated,service_role;

create or replace function public.create_manual_sales_invoice(
  p_customer_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_payment_method text,
  p_reference_sales_invoice_id uuid default null,
  p_services jsonb default '[]'::jsonb,
  p_discount_type text default 'amount',
  p_discount_value numeric default 0,
  p_notes text default null
)
returns public.sales_invoices
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.customers%rowtype;
  ref public.sales_invoices%rowtype;
  created public.sales_invoices%rowtype;
  item jsonb;
  service_id uuid;
  qty integer;
  price numeric(14,2);
  subtotal numeric(14,2):=0;
  tax numeric(14,2):=0;
  gross numeric(14,2):=0;
  discount_kind text;
  requested_discount numeric(14,2):=0;
  applied_discount numeric(14,2):=0;
  final_total numeric(14,2):=0;
  pre_vat_compat numeric(14,2):=0;
begin
  if not public.has_screen_permission('salesInvoices','add') then
    raise exception 'لا توجد صلاحية إضافة فواتير المبيعات';
  end if;
  if p_customer_id is null then raise exception 'العميل مطلوب'; end if;
  if nullif(btrim(coalesce(p_invoice_number,'')),'') is null then raise exception 'رقم الفاتورة مطلوب'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  if nullif(btrim(coalesce(p_payment_method,'')),'') is null then raise exception 'طريقة الدفع مطلوبة'; end if;
  if jsonb_typeof(coalesce(p_services,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_services,'[]'::jsonb))=0 then
    raise exception 'أضف خدمة واحدة على الأقل';
  end if;

  select * into c from public.customers where id=p_customer_id;
  if not found then raise exception 'العميل غير موجود'; end if;
  if c.representative_id is not null and not public.can_access_representative(c.representative_id) then raise exception 'العميل خارج نطاق البيانات المسموح'; end if;

  if exists(
    select 1 from public.sales_invoices si
    where si.invoice_number=btrim(p_invoice_number) and si.status<>'ملغاة'
  ) then
    raise exception 'رقم الفاتورة مستخدم بالفعل';
  end if;

  if p_reference_sales_invoice_id is not null then
    select * into ref
    from public.sales_invoices
    where id=p_reference_sales_invoice_id
      and source_type='installation'
      and status<>'ملغاة';
    if not found then raise exception 'مرجع الفاتورة يجب أن يكون موعدًا محولًا إلى فاتورة بالفعل'; end if;
    if ref.customer_id<>p_customer_id then raise exception 'مرجع الفاتورة لا يخص العميل المحدد'; end if;
    if date_trunc('month',ref.invoice_date::timestamp)<>date_trunc('month',p_invoice_date::timestamp) then
      raise exception 'مرجع الفاتورة يجب أن يكون من نفس شهر تاريخ الفاتورة اليدوية';
    end if;
  end if;

  for item in select value from jsonb_array_elements(p_services)
  loop
    begin
      service_id:=(item->>'service_type_id')::uuid;
    exception when others then
      raise exception 'نوع خدمة غير صالح في الفاتورة';
    end;
    qty:=coalesce((item->>'quantity')::integer,0);
    price:=coalesce((item->>'unit_price')::numeric,0);
    if qty<1 or price<0 then raise exception 'راجع العدد والسعر في جميع الخدمات'; end if;
    if not exists(select 1 from public.installation_service_types st where st.id=service_id and st.is_active=true) then
      raise exception 'إحدى خدمات الفاتورة غير موجودة أو غير نشطة';
    end if;
    subtotal:=subtotal + round(qty*price,2);
  end loop;

  subtotal:=round(subtotal,2);
  tax:=round(subtotal*0.15,2);
  gross:=round(subtotal+tax,2);
  discount_kind:=case when p_discount_type='percentage' then 'percentage' else 'amount' end;
  requested_discount:=greatest(coalesce(p_discount_value,0),0);
  if discount_kind='percentage' then
    requested_discount:=least(requested_discount,100);
    applied_discount:=round(gross*requested_discount/100.0,2);
  else
    applied_discount:=least(requested_discount,gross);
  end if;
  final_total:=round(greatest(gross-applied_discount,0),2);
  -- Keep invoice_amount compatible with the existing registry/report paths that derive VAT-inclusive
  -- value by multiplying invoice_amount by 1.15. final_amount is the canonical exact total for manual invoices.
  pre_vat_compat:=round(final_total/1.15,2);

  insert into public.sales_invoices(
    invoice_number,request_number,customer_id,representative_id,
    quotation_id,installation_request_id,completion_report_id,
    invoice_amount,installation_expenses,invoice_date,source_type,status,is_without_invoice,
    payment_method,reference_sales_invoice_id,manual_subtotal,tax_rate,tax_amount,
    discount_type,discount_value,discount_amount,final_amount,notes
  ) values(
    btrim(p_invoice_number),null,p_customer_id,c.representative_id,
    null,null,null,
    pre_vat_compat,0,p_invoice_date,'manual','صادرة',false,
    btrim(p_payment_method),p_reference_sales_invoice_id,subtotal,15,tax,
    discount_kind,requested_discount,applied_discount,final_total,nullif(btrim(coalesce(p_notes,'')),'')
  ) returning * into created;

  for item in select value from jsonb_array_elements(p_services)
  loop
    service_id:=(item->>'service_type_id')::uuid;
    qty:=(item->>'quantity')::integer;
    price:=(item->>'unit_price')::numeric;
    insert into public.sales_invoice_services(sales_invoice_id,service_type_id,quantity,unit_price,line_total)
    values(created.id,service_id,qty,price,round(qty*price,2));
  end loop;

  return created;
end;
$$;

revoke all on function public.create_manual_sales_invoice(uuid,text,date,text,uuid,jsonb,text,numeric,text) from public,anon;
grant execute on function public.create_manual_sales_invoice(uuid,text,date,text,uuid,jsonb,text,numeric,text) to authenticated,service_role;

commit;
