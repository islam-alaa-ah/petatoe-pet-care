-- Phase M15.0 — Sales Invoices Registry
begin;

create sequence if not exists public.sales_invoice_number_seq;

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  request_number text,
  customer_id uuid not null references public.customers(id) on delete restrict,
  representative_id uuid references public.sales_representatives(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete restrict,
  installation_request_id uuid references public.installation_requests(id) on delete restrict,
  completion_report_id uuid references public.installation_completion_reports(id) on delete restrict,
  invoice_amount numeric(14,2) not null default 0 check (invoice_amount >= 0),
  installation_expenses numeric(14,2) not null default 0 check (installation_expenses >= 0),
  invoice_date date not null default current_date,
  source_type text not null check (source_type in ('quotation','installation')),
  status text not null default 'صادرة' check (status in ('صادرة','ملغاة')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_sales_invoices_active_quotation
  on public.sales_invoices(quotation_id) where quotation_id is not null and status <> 'ملغاة';
create unique index if not exists uq_sales_invoices_active_installation
  on public.sales_invoices(installation_request_id) where installation_request_id is not null and status <> 'ملغاة';
create unique index if not exists uq_sales_invoices_completion_report
  on public.sales_invoices(completion_report_id) where completion_report_id is not null;
create index if not exists idx_sales_invoices_representative on public.sales_invoices(representative_id);
create index if not exists idx_sales_invoices_invoice_date on public.sales_invoices(invoice_date desc);

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('salesInvoices','فواتير المبيعات','إدارة العملاء',45,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select distinct rsp.role,'salesInvoices',
       (rsp.role='super_admin'),(rsp.role='super_admin'),false,false,(rsp.role='super_admin')
from public.role_screen_permissions rsp
on conflict(role,screen_key) do nothing;

alter table public.sales_invoices enable row level security;
drop policy if exists "sales invoices scoped select" on public.sales_invoices;
drop policy if exists "sales invoices scoped insert" on public.sales_invoices;
drop policy if exists "sales invoices scoped update" on public.sales_invoices;
create policy "sales invoices scoped select" on public.sales_invoices
for select to authenticated using (
  public.has_screen_permission('salesInvoices','view')
  and (representative_id is null or public.can_access_representative(representative_id))
);
create policy "sales invoices scoped insert" on public.sales_invoices
for insert to authenticated with check (
  public.has_screen_permission('salesInvoices','add')
  and (representative_id is null or public.can_access_representative(representative_id))
);
create policy "sales invoices scoped update" on public.sales_invoices
for update to authenticated using (
  public.has_screen_permission('salesInvoices','edit')
  and (representative_id is null or public.can_access_representative(representative_id))
) with check (
  public.has_screen_permission('salesInvoices','edit')
  and (representative_id is null or public.can_access_representative(representative_id))
);

grant select,insert,update on public.sales_invoices to authenticated;

create or replace function public.next_sales_invoice_number()
returns text language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
  n := nextval('public.sales_invoice_number_seq');
  return 'INV-' || to_char(current_date,'YYYY') || '-' || lpad(n::text,6,'0');
end;$$;

create or replace function public.create_sales_invoice_from_quotation(p_quotation_id uuid)
returns public.sales_invoices language plpgsql security definer set search_path=public as $$
declare q public.quotations%rowtype; existing public.sales_invoices%rowtype; created public.sales_invoices%rowtype;
begin
  if not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  select * into q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'عرض السعر غير موجود'; end if;
  if q.status <> 'مقبول' then raise exception 'لا يمكن فوترة عرض سعر غير مقبول'; end if;
  if q.installation_request_id is not null or exists(select 1 from public.installation_requests r where r.quotation_id=q.id) then
    raise exception 'عرض السعر مرتبط بطلب تركيب ويجب إصدار الفاتورة من محضر التركيب';
  end if;
  if not public.can_access_representative(q.representative_id) then raise exception 'عرض السعر خارج نطاق البيانات المسموح'; end if;
  select * into existing from public.sales_invoices where quotation_id=q.id and status<>'ملغاة' limit 1;
  if found then return existing; end if;
  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,invoice_amount,installation_expenses,invoice_date,source_type,status)
  values(public.next_sales_invoice_number(),coalesce(nullif(q.customer_order_number,''),q.quotation_number),q.customer_id,q.representative_id,q.id,q.amount,0,current_date,'quotation','صادرة')
  returning * into created;
  return created;
end;$$;
grant execute on function public.create_sales_invoice_from_quotation(uuid) to authenticated;

create or replace function public.sync_sales_invoice_from_installation(p_installation_request_id uuid)
returns public.sales_invoices language plpgsql security definer set search_path=public as $$
declare r public.installation_requests%rowtype; cr public.installation_completion_reports%rowtype; existing public.sales_invoices%rowtype; created public.sales_invoices%rowtype; cost numeric(14,2);
begin
  select * into r from public.installation_requests where id=p_installation_request_id;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  select * into cr from public.installation_completion_reports where installation_request_id=r.id;
  if not found then raise exception 'محضر إكمال التركيب غير موجود'; end if;
  if nullif(trim(cr.invoice_number),'') is null or cr.invoice_date is null then raise exception 'رقم وتاريخ الفاتورة مطلوبان'; end if;
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
grant execute on function public.sync_sales_invoice_from_installation(uuid) to authenticated;

create or replace function public.trg_sync_sales_invoice_from_completion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sync_sales_invoice_from_installation(new.installation_request_id);
  return new;
end;$$;
drop trigger if exists trg_sync_sales_invoice_from_completion on public.installation_completion_reports;
create trigger trg_sync_sales_invoice_from_completion
after insert or update of invoice_number,invoice_date on public.installation_completion_reports
for each row execute function public.trg_sync_sales_invoice_from_completion();

-- Backfill existing documented installation invoices.
do $$ declare x record; begin
  for x in select installation_request_id from public.installation_completion_reports where nullif(trim(invoice_number),'') is not null and invoice_date is not null loop
    perform public.sync_sales_invoice_from_installation(x.installation_request_id);
  end loop;
end $$;

commit;
