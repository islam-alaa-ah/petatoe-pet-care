-- Phase P5.13.8.18 — Atomic Quantity Confirmation → Sales Invoice Handoff
-- Restores the canonical same-day/same-team invoice group and makes confirmation + invoice atomic.
begin;

create or replace function public.create_sales_invoice_from_installation_visit_v2(
  p_installation_request_id uuid,
  p_visit_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_without_invoice boolean default false
)
returns public.sales_invoices
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  canon_visit public.installation_execution_visits%rowtype;
  ids uuid[];
  existing public.sales_invoices%rowtype;
  created public.sales_invoices%rowtype;
  amount numeric(14,2):=0;
  cost numeric(14,2):=0;
  v_invoice_number text;
begin
  if not public.has_screen_permission('salesInvoices','add') then
    raise exception 'لا توجد صلاحية إضافة فواتير المبيعات';
  end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;

  if coalesce(p_without_invoice,false) then
    v_invoice_number := 'NOINV-' || replace(gen_random_uuid()::text,'-','');
  else
    v_invoice_number := trim(coalesce(p_invoice_number,''));
    if nullif(v_invoice_number,'') is null then raise exception 'رقم الفاتورة مطلوب أو اختر بدون فاتورة'; end if;
  end if;

  select * into r from public.installation_requests where id=p_installation_request_id;
  if not found then raise exception 'طلب الموعد غير موجود'; end if;

  select * into v
  from public.installation_execution_visits
  where id=p_visit_id and installation_request_id=p_installation_request_id;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;

  ids := public.get_installation_execution_group_visit_ids(p_installation_request_id,v.id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[v.id]; end if;

  select x.* into canon_visit
  from public.installation_execution_visits x
  where x.id=any(ids)
  order by x.visit_no,x.id::text
  limit 1;

  if exists(
    select 1 from public.installation_execution_visits x
    where x.id=any(ids) and (x.status<>'مؤكدة' or x.confirmed_at is null)
  ) then
    raise exception 'لا يمكن تحويل مجموعة التنفيذ إلى فاتورة قبل تأكيد الكمية المنفذة بالكامل';
  end if;

  if not public.can_access_installation_request_scope(r.representative_id,canon_visit.installation_team_id) then
    raise exception 'طلب الموعد خارج نطاق البيانات المسموح';
  end if;

  select * into existing
  from public.sales_invoices
  where installation_execution_visit_id=any(ids) and status<>'ملغاة'
  order by created_at desc
  limit 1;
  if found then return existing; end if;

  if not coalesce(p_without_invoice,false) and exists(
    select 1 from public.sales_invoices si
    where si.invoice_number=v_invoice_number and si.status<>'ملغاة'
  ) then raise exception 'رقم الفاتورة مستخدم بالفعل'; end if;

  if exists(
    select 1 from public.sales_invoices si
    where si.installation_request_id=r.id
      and si.installation_execution_visit_id is null
      and si.status<>'ملغاة'
  ) then raise exception 'تم إصدار فاتورة كاملة لهذا الطلب بالفعل'; end if;

  select
    coalesce(sum(coalesce(vs.executed_quantity,0)*coalesce(rs.unit_price,0)),0)::numeric(14,2),
    coalesce(sum(coalesce(vs.executed_quantity,0)*coalesce(st.default_cost,0)),0)::numeric(14,2)
  into amount,cost
  from public.installation_execution_visit_services vs
  join public.installation_request_services rs on rs.id=vs.request_service_id
  left join public.installation_service_types st on st.id=rs.service_type_id
  where vs.visit_id=any(ids);

  if amount<=0 then raise exception 'لا توجد كمية منفذة بقيمة قابلة للفوترة في مجموعة التنفيذ'; end if;

  insert into public.sales_invoices(
    invoice_number,request_number,customer_id,representative_id,
    quotation_id,installation_request_id,installation_execution_visit_id,
    completion_report_id,invoice_amount,installation_expenses,invoice_date,
    source_type,status,is_without_invoice
  ) values(
    v_invoice_number,
    r.request_number||'-'||lpad(canon_visit.visit_no::text,2,'0'),
    r.customer_id,r.representative_id,
    null,r.id,canon_visit.id,
    null,amount,cost,p_invoice_date,
    'installation','صادرة',coalesce(p_without_invoice,false)
  ) returning * into created;

  update public.installation_request_collection
  set invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,
      updated_at=now()
  where installation_request_id=r.id;

  return created;
end;
$$;

grant execute on function public.create_sales_invoice_from_installation_visit_v2(uuid,uuid,text,date,boolean) to authenticated;

create or replace function public.confirm_installation_execution_visit_and_create_invoice_v3(
  p_request_id uuid,
  p_visit_id uuid,
  p_lines jsonb,
  p_remaining_action text,
  p_schedule jsonb default null,
  p_notes text default null,
  p_invoice_number text default null,
  p_invoice_date date default current_date,
  p_without_invoice boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  confirmation_result jsonb;
  invoice_row public.sales_invoices%rowtype;
begin
  if p_request_id is null or p_visit_id is null then raise exception 'بيانات زيارة التنفيذ غير مكتملة'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  if not coalesce(p_without_invoice,false) and nullif(trim(coalesce(p_invoice_number,'')),'') is null then
    raise exception 'رقم الفاتورة مطلوب أو اختر بدون فاتورة';
  end if;

  -- One database transaction: invoice failure automatically rolls quantity confirmation back.
  select public.confirm_installation_execution_visit_quantities(
    p_request_id,p_visit_id,coalesce(p_lines,'[]'::jsonb),p_remaining_action,p_schedule,p_notes
  ) into confirmation_result;

  select * into invoice_row
  from public.create_sales_invoice_from_installation_visit_v2(
    p_request_id,p_visit_id,
    case when coalesce(p_without_invoice,false) then null else trim(coalesce(p_invoice_number,'')) end,
    p_invoice_date,coalesce(p_without_invoice,false)
  );

  if invoice_row.id is null then raise exception 'تعذر إنشاء فاتورة الموعد بعد اعتماد الكمية'; end if;

  return jsonb_build_object(
    'confirmation',confirmation_result,
    'invoiceId',invoice_row.id,
    'invoiceNumber',case when invoice_row.is_without_invoice then null else invoice_row.invoice_number end,
    'withoutInvoice',invoice_row.is_without_invoice,
    'requestNumber',invoice_row.request_number
  );
end;
$$;

grant execute on function public.confirm_installation_execution_visit_and_create_invoice_v3(uuid,uuid,jsonb,text,jsonb,text,text,date,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
