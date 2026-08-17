-- Phase P5.13.8.17 — Confirmation Group Cancel + Invoice Payment Method Edit
begin;

-- Same-day + same-team slots are one execution group. A started/confirmed sibling inside
-- that canonical group must not be treated as a later independent visit when a super admin
-- reverses quantity confirmation. A genuinely later execution group remains protected.
create or replace function public.cancel_installation_execution_visit_confirmation_group(
  p_request_id uuid,
  p_visit_ids uuid[],
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v_group_visit_ids uuid[];
  v_confirmed_visit_ids uuid[];
  v_min_visit_no integer;
begin
  if public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'إلغاء الكمية المنفذة متاح لمدير النظام فقط';
  end if;
  if p_request_id is null or coalesce(array_length(p_visit_ids,1),0)=0 then
    raise exception 'بيانات زيارة التنفيذ غير مكتملة';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  -- Expand every supplied visit anchor to its canonical same-day/same-team execution group.
  select coalesce(array_agg(distinct g.id),array[]::uuid[])
    into v_group_visit_ids
  from unnest(p_visit_ids) as p(id)
  cross join lateral unnest(public.get_installation_execution_group_visit_ids(p_request_id,p.id)) as g(id);

  if coalesce(array_length(v_group_visit_ids,1),0)=0 then
    v_group_visit_ids:=p_visit_ids;
  end if;

  -- Cancel every confirmed visit in that logical execution group as one unit.
  select array_agg(v.id order by v.visit_no), min(v.visit_no)
    into v_confirmed_visit_ids, v_min_visit_no
  from public.installation_execution_visits v
  where v.installation_request_id=p_request_id
    and v.id=any(v_group_visit_ids)
    and v.status='مؤكدة';

  if coalesce(array_length(v_confirmed_visit_ids,1),0)=0 then
    raise exception 'لا توجد زيارة بكمية منفذة مؤكدة قابلة للإلغاء';
  end if;

  if exists(
    select 1 from public.sales_invoices si
    where si.status<>'ملغاة'
      and (
        si.installation_execution_visit_id=any(v_confirmed_visit_ids)
        or (si.installation_request_id=p_request_id and si.installation_execution_visit_id is null)
      )
  ) then
    raise exception 'لا يمكن إلغاء الكمية المنفذة بعد إصدار فاتورة لها';
  end if;

  -- Preserve the real multi-visit safety rule, but exclude siblings in the SAME canonical
  -- execution group. Their stage timestamps are intentionally mirrored by the grouped workflow.
  if exists(
    select 1
    from public.installation_execution_visits later
    where later.installation_request_id=p_request_id
      and not (later.id=any(v_group_visit_ids))
      and later.visit_no > v_min_visit_no
      and (
        later.on_route_at is not null or later.map_opened_at is not null or later.arrived_at is not null
        or later.started_at is not null or later.completed_at is not null
        or later.status in ('قيد التنفيذ','مؤكدة')
      )
  ) then
    raise exception 'لا يمكن إلغاء هذه الكمية بعد بدء أو تأكيد زيارة تنفيذ لاحقة مستقلة';
  end if;

  insert into public.installation_execution_quantity_audit(
    installation_request_id,visit_id,request_service_id,scheduled_quantity,confirmed_quantity,remaining_quantity,action,notes,created_by
  )
  select p_request_id,vs.visit_id,vs.request_service_id,coalesce(vs.scheduled_quantity,0),0,
         greatest(coalesce(rs.quantity,0)-coalesce((
           select sum(coalesce(other.executed_quantity,0))
           from public.installation_execution_visit_services other
           join public.installation_execution_visits ov on ov.id=other.visit_id
           where ov.installation_request_id=p_request_id
             and ov.status='مؤكدة'
             and not(other.visit_id=any(v_confirmed_visit_ids))
             and other.request_service_id=vs.request_service_id
         ),0),0),
         'confirmation_cancelled',nullif(trim(coalesce(p_reason,'')),''),auth.uid()
  from public.installation_execution_visit_services vs
  join public.installation_request_services rs on rs.id=vs.request_service_id
  where vs.visit_id=any(v_confirmed_visit_ids);

  update public.installation_execution_visit_services
  set executed_quantity=0,updated_at=now()
  where visit_id=any(v_confirmed_visit_ids);

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
  where installation_request_id=p_request_id and id=any(v_confirmed_visit_ids);

  update public.installation_requests
  set status='مكتمل',updated_at=now()
  where id=p_request_id;
end;
$$;

grant execute on function public.cancel_installation_execution_visit_confirmation_group(uuid,uuid[],text) to authenticated;

-- Keep payment method in the canonical appointment collection record instead of duplicating it
-- on sales_invoices. This function updates invoice registry + collection atomically.
create or replace function public.update_sales_invoice_registry_v2(
  p_invoice_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_without_invoice boolean default false,
  p_payment_method text default null
)
returns public.sales_invoices
language plpgsql
security definer
set search_path=public
as $$
declare
  inv public.sales_invoices%rowtype;
  updated public.sales_invoices%rowtype;
  v_invoice_number text;
  v_payment_method text;
begin
  if not public.has_screen_permission('salesInvoices','edit') then
    raise exception 'لا توجد صلاحية تعديل فواتير المبيعات';
  end if;

  select * into inv from public.sales_invoices where id=p_invoice_id for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if inv.representative_id is not null and not public.can_access_representative(inv.representative_id) then
    raise exception 'الفاتورة خارج نطاق البيانات المسموح';
  end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;

  if coalesce(p_without_invoice,false) then
    v_invoice_number := case when inv.is_without_invoice then inv.invoice_number else 'NOINV-' || replace(gen_random_uuid()::text,'-','') end;
  else
    v_invoice_number := trim(coalesce(p_invoice_number,''));
    if nullif(v_invoice_number,'') is null then
      raise exception 'رقم الفاتورة مطلوب أو اختر بدون فاتورة';
    end if;
    if exists(select 1 from public.sales_invoices si where si.id<>inv.id and si.invoice_number=v_invoice_number and si.status<>'ملغاة') then
      raise exception 'رقم الفاتورة مستخدم بالفعل';
    end if;
  end if;

  if inv.installation_request_id is not null then
    v_payment_method := case trim(coalesce(p_payment_method,''))
      when 'تحويل' then 'تحويل بنكي'
      when 'تحويل بنكي' then 'تحويل بنكي'
      when 'بطاقة / شبكة' then 'بطاقة'
      when 'بطاقة' then 'بطاقة'
      when 'شبكة' then 'بطاقة'
      when 'نقدي' then 'نقدي'
      when 'دفع عن طريق الموقع' then 'دفع إلكتروني'
      when 'الدفع عن طريق الموقع' then 'دفع إلكتروني'
      when 'دفع إلكتروني' then 'دفع إلكتروني'
      else null
    end;
    if v_payment_method is null then
      raise exception 'اختر طريقة دفع صحيحة';
    end if;
    if not exists(select 1 from public.installation_request_collection c where c.installation_request_id=inv.installation_request_id) then
      raise exception 'لا توجد بيانات تحصيل مرتبطة بهذه الفاتورة';
    end if;
  end if;

  update public.sales_invoices
  set invoice_number=v_invoice_number,
      invoice_date=p_invoice_date,
      is_without_invoice=coalesce(p_without_invoice,false),
      updated_at=now()
  where id=inv.id
  returning * into updated;

  if inv.installation_request_id is not null then
    update public.installation_request_collection
    set invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,
        payment_method=v_payment_method,
        updated_at=now()
    where installation_request_id=inv.installation_request_id;
  end if;

  if inv.completion_report_id is not null then
    update public.installation_completion_reports
    set invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,
        invoice_date=p_invoice_date,
        updated_at=now()
    where id=inv.completion_report_id;
  end if;

  return updated;
end;
$$;

grant execute on function public.update_sales_invoice_registry_v2(uuid,text,date,boolean,text) to authenticated;

commit;
