-- Phase M15.13.12 — Confirmed Quantity Super Admin Cancel + Visit Invoice Flow
begin;

-- Keep a durable audit marker when a confirmed execution visit is reopened by Super Admin.
alter table public.installation_execution_visits
  add column if not exists confirmation_cancelled_at timestamptz,
  add column if not exists confirmation_cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmation_cancel_reason text;

-- Sales invoices must be able to reference one confirmed execution visit so partial/multi-day
-- installations can be invoiced independently without collapsing the whole request.
alter table public.sales_invoices
  add column if not exists installation_execution_visit_id uuid references public.installation_execution_visits(id) on delete restrict;

-- Preserve legacy request-level invoices, while allowing one active invoice per confirmed visit.
drop index if exists public.uq_sales_invoices_active_installation;
create unique index if not exists uq_sales_invoices_active_installation_legacy
  on public.sales_invoices(installation_request_id)
  where installation_request_id is not null
    and installation_execution_visit_id is null
    and status <> 'ملغاة';

create unique index if not exists uq_sales_invoices_active_installation_visit
  on public.sales_invoices(installation_execution_visit_id)
  where installation_execution_visit_id is not null
    and status <> 'ملغاة';

create index if not exists idx_sales_invoices_installation_visit
  on public.sales_invoices(installation_execution_visit_id);

-- A quotation-origin uniqueness rule must not prevent multiple installation-visit invoices.
drop index if exists public.uq_sales_invoices_active_quotation;
create unique index if not exists uq_sales_invoices_active_quotation
  on public.sales_invoices(quotation_id)
  where quotation_id is not null
    and source_type='quotation'
    and status <> 'ملغاة';

create or replace function public.create_sales_invoice_from_installation_visit(
  p_installation_request_id uuid,
  p_visit_id uuid,
  p_invoice_number text,
  p_invoice_date date
)
returns public.sales_invoices
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  existing public.sales_invoices%rowtype;
  created public.sales_invoices%rowtype;
  amount numeric(14,2):=0;
  cost numeric(14,2):=0;
begin
  if not public.has_screen_permission('salesInvoices','add') then
    raise exception 'لا توجد صلاحية إضافة فواتير المبيعات';
  end if;
  if coalesce(p_invoice_number,'') !~ '^[0-9]{9}$' then
    raise exception 'رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط';
  end if;
  if p_invoice_date is null then
    raise exception 'تاريخ الفاتورة مطلوب';
  end if;

  select * into r
  from public.installation_requests
  where id=p_installation_request_id;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  select * into v
  from public.installation_execution_visits
  where id=p_visit_id and installation_request_id=p_installation_request_id
  for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  if v.status<>'مؤكدة' or v.confirmed_at is null then
    raise exception 'لا يمكن تحويل الزيارة إلى فاتورة قبل تأكيد الكمية المنفذة';
  end if;
  if not public.can_access_installation_request_scope(r.representative_id,v.installation_team_id) then
    raise exception 'طلب التركيب خارج نطاق البيانات المسموح';
  end if;

  select * into existing
  from public.sales_invoices
  where installation_execution_visit_id=v.id and status<>'ملغاة'
  limit 1;
  if found then return existing; end if;

  -- A legacy whole-request invoice already covers every visit and blocks a duplicate visit invoice.
  if exists(
    select 1 from public.sales_invoices si
    where si.installation_request_id=r.id
      and si.installation_execution_visit_id is null
      and si.status<>'ملغاة'
  ) then
    raise exception 'تم إصدار فاتورة كاملة لهذا الطلب بالفعل';
  end if;

  select
    coalesce(sum(coalesce(vs.executed_quantity,0) * coalesce(rs.unit_price,0)),0)::numeric(14,2),
    coalesce(sum(coalesce(vs.executed_quantity,0) * coalesce(st.default_cost,0)),0)::numeric(14,2)
  into amount,cost
  from public.installation_execution_visit_services vs
  join public.installation_request_services rs on rs.id=vs.request_service_id
  left join public.installation_service_types st on st.id=rs.service_type_id
  where vs.visit_id=v.id;

  if amount<=0 then
    raise exception 'لا توجد كمية منفذة بقيمة قابلة للفوترة في هذه الزيارة';
  end if;

  insert into public.sales_invoices(
    invoice_number,request_number,customer_id,representative_id,
    quotation_id,installation_request_id,installation_execution_visit_id,
    completion_report_id,invoice_amount,installation_expenses,invoice_date,source_type,status
  ) values(
    p_invoice_number,
    r.request_number||'-'||lpad(v.visit_no::text,2,'0'),
    r.customer_id,r.representative_id,
    null,r.id,v.id,
    null,amount,cost,p_invoice_date,'installation','صادرة'
  ) returning * into created;

  return created;
end;
$$;

grant execute on function public.create_sales_invoice_from_installation_visit(uuid,uuid,text,date) to authenticated;

-- Reopening a confirmed executed quantity is an exceptional correction and is always
-- server-enforced as Super Admin only, regardless of screen permissions.
create or replace function public.cancel_installation_execution_visit_confirmation(
  p_request_id uuid,
  p_visit_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  nextv public.installation_execution_visits%rowtype;
begin
  if public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'إلغاء الكمية المنفذة متاح لمدير النظام فقط';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  select * into v
  from public.installation_execution_visits
  where id=p_visit_id and installation_request_id=p_request_id
  for update;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  if v.status<>'مؤكدة' then raise exception 'الزيارة ليست في حالة كمية منفذة مؤكدة'; end if;

  if exists(
    select 1 from public.sales_invoices si
    where si.status<>'ملغاة'
      and (
        si.installation_execution_visit_id=v.id
        or (si.installation_request_id=r.id and si.installation_execution_visit_id is null)
      )
  ) then
    raise exception 'لا يمكن إلغاء الكمية المنفذة بعد إصدار فاتورة لها';
  end if;

  -- Never reopen historical quantities after a later visit has started execution.
  if exists(
    select 1 from public.installation_execution_visits later
    where later.installation_request_id=r.id
      and later.visit_no>v.visit_no
      and (
        later.on_route_at is not null or later.map_opened_at is not null or later.arrived_at is not null
        or later.started_at is not null or later.completed_at is not null
        or later.status in ('قيد التنفيذ','بانتظار التأكيد','مؤكدة')
      )
  ) then
    raise exception 'لا يمكن إلغاء هذه الكمية بعد بدء أو تأكيد زيارة تنفيذ لاحقة';
  end if;

  update public.installation_execution_visits
  set status='بانتظار التأكيد',
      confirmation_cancelled_at=now(),
      confirmation_cancelled_by=auth.uid(),
      confirmation_cancel_reason=nullif(trim(coalesce(p_reason,'')),''),
      confirmed_at=null,
      confirmed_by=null,
      confirmation_notes=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      updated_at=now()
  where id=v.id;

  select * into nextv
  from public.installation_execution_visits
  where installation_request_id=r.id
    and visit_no>v.visit_no
    and status in ('بانتظار الجدولة','مجدولة')
  order by visit_no
  limit 1;

  update public.installation_requests
  set status=case when nextv.id is not null and nextv.status='مجدولة' then 'مسند' else 'قيد التنفيذ' end,
      completed_at=null,
      selected_for_execution_at=null,
      selected_for_execution_by=null,
      updated_at=now()
  where id=r.id;
end;
$$;

grant execute on function public.cancel_installation_execution_visit_confirmation(uuid,uuid,text) to authenticated;

commit;
