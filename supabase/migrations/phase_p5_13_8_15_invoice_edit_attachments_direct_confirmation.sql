-- Phase P5.13.8.15 — Invoice Edit + Attachments + Direct Confirmation Invoice Flow
begin;

alter table public.installation_execution_files
  add column if not exists file_kind text not null default 'execution',
  add column if not exists execution_visit_id uuid references public.installation_execution_visits(id) on delete set null;

create index if not exists idx_installation_execution_files_visit on public.installation_execution_files(execution_visit_id);

alter table public.sales_invoices
  add column if not exists is_without_invoice boolean not null default false;

update public.role_screen_permissions set can_edit=true where role='super_admin' and screen_key='salesInvoices';

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
  existing public.sales_invoices%rowtype;
  created public.sales_invoices%rowtype;
  amount numeric(14,2):=0;
  cost numeric(14,2):=0;
  v_invoice_number text;
begin
  if not public.has_screen_permission('salesInvoices','add') then
    raise exception 'لا توجد صلاحية إضافة فواتير المبيعات';
  end if;

  if p_invoice_date is null then
    raise exception 'تاريخ الفاتورة مطلوب';
  end if;

  if coalesce(p_without_invoice,false) then
    v_invoice_number := 'NOINV-' || replace(gen_random_uuid()::text,'-','');
  else
    v_invoice_number := trim(coalesce(p_invoice_number,''));
    if v_invoice_number !~ '^[0-9]{9}$' then
      raise exception 'رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط';
    end if;
  end if;

  select * into r from public.installation_requests where id=p_installation_request_id;
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

  if not coalesce(p_without_invoice,false) and exists(
    select 1 from public.sales_invoices si
    where si.invoice_number=v_invoice_number and si.status<>'ملغاة'
  ) then
    raise exception 'رقم الفاتورة مستخدم بالفعل';
  end if;

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
    completion_report_id,invoice_amount,installation_expenses,invoice_date,
    source_type,status,is_without_invoice
  ) values(
    v_invoice_number,
    r.request_number||'-'||lpad(v.visit_no::text,2,'0'),
    r.customer_id,r.representative_id,
    null,r.id,v.id,
    null,amount,cost,p_invoice_date,
    'installation','صادرة',coalesce(p_without_invoice,false)
  ) returning * into created;

  update public.installation_request_collection
  set invoice_number = case when coalesce(p_without_invoice,false) then null else v_invoice_number end,
      updated_at = now()
  where installation_request_id=r.id;

  return created;
end;
$$;

grant execute on function public.create_sales_invoice_from_installation_visit_v2(uuid,uuid,text,date,boolean) to authenticated;

create or replace function public.update_sales_invoice_registry(
  p_invoice_id uuid,
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
  inv public.sales_invoices%rowtype;
  updated public.sales_invoices%rowtype;
  v_invoice_number text;
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
    if v_invoice_number !~ '^[0-9]{9}$' then
      raise exception 'رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط';
    end if;
    if exists(select 1 from public.sales_invoices si where si.id<>inv.id and si.invoice_number=v_invoice_number and si.status<>'ملغاة') then
      raise exception 'رقم الفاتورة مستخدم بالفعل';
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

grant execute on function public.update_sales_invoice_registry(uuid,text,date,boolean) to authenticated;

alter table public.installation_execution_quantity_audit
  drop constraint if exists installation_execution_quantity_audit_action_check;
alter table public.installation_execution_quantity_audit
  add constraint installation_execution_quantity_audit_action_check
  check(action in ('completed','reschedule_now','schedule_later','preserve_existing','append_to_next_visit','return_to_schedule','confirmation_cancelled'));

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
  v_count integer;
begin
  if public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'إلغاء الكمية المنفذة متاح لمدير النظام فقط';
  end if;
  if p_request_id is null or coalesce(array_length(p_visit_ids,1),0)=0 then
    raise exception 'بيانات زيارة التنفيذ غير مكتملة';
  end if;

  select * into r from public.installation_requests where id=p_request_id for update;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;

  select count(*) into v_count
  from public.installation_execution_visits v
  where v.installation_request_id=p_request_id
    and v.id=any(p_visit_ids)
    and v.status='مؤكدة';
  if v_count<>array_length(p_visit_ids,1) then
    raise exception 'بعض زيارات التنفيذ ليست في حالة كمية منفذة مؤكدة';
  end if;

  if exists(
    select 1 from public.sales_invoices si
    where si.status<>'ملغاة'
      and (
        si.installation_execution_visit_id=any(p_visit_ids)
        or (si.installation_request_id=p_request_id and si.installation_execution_visit_id is null)
      )
  ) then
    raise exception 'لا يمكن إلغاء الكمية المنفذة بعد إصدار فاتورة لها';
  end if;

  if exists(
    select 1
    from public.installation_execution_visits later
    where later.installation_request_id=p_request_id
      and not (later.id=any(p_visit_ids))
      and (
        later.on_route_at is not null or later.map_opened_at is not null or later.arrived_at is not null
        or later.started_at is not null or later.completed_at is not null
        or later.status in ('قيد التنفيذ','بانتظار التأكيد','مؤكدة')
      )
      and later.visit_no > (select min(v.visit_no) from public.installation_execution_visits v where v.id=any(p_visit_ids))
  ) then
    raise exception 'لا يمكن إلغاء هذه الكمية بعد بدء أو تأكيد زيارة تنفيذ لاحقة';
  end if;

  insert into public.installation_execution_quantity_audit(
    installation_request_id,visit_id,request_service_id,scheduled_quantity,confirmed_quantity,remaining_quantity,action,notes,created_by
  )
  select p_request_id,vs.visit_id,vs.request_service_id,coalesce(vs.scheduled_quantity,0),0,
         greatest(coalesce(rs.quantity,0)-coalesce((select sum(coalesce(other.executed_quantity,0)) from public.installation_execution_visit_services other join public.installation_execution_visits ov on ov.id=other.visit_id where ov.installation_request_id=p_request_id and ov.status='مؤكدة' and not(other.visit_id=any(p_visit_ids)) and other.request_service_id=vs.request_service_id),0),0),
         'confirmation_cancelled',nullif(trim(coalesce(p_reason,'')),''),auth.uid()
  from public.installation_execution_visit_services vs
  join public.installation_request_services rs on rs.id=vs.request_service_id
  where vs.visit_id=any(p_visit_ids);

  update public.installation_execution_visit_services
  set executed_quantity=0,updated_at=now()
  where visit_id=any(p_visit_ids);

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
  where installation_request_id=p_request_id and id=any(p_visit_ids);

  update public.installation_requests
  set status='مكتمل',
      updated_at=now()
  where id=p_request_id;
end;
$$;

grant execute on function public.cancel_installation_execution_visit_confirmation_group(uuid,uuid[],text) to authenticated;


insert into public.app_translations
(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active)
values
  ('execution.collection.attachment','installationExecution','appointments','label','مرفق التحصيل (اختياري)','Collection attachment (optional)','مرفق التحصيل (اختياري)','Collection attachment (optional)',true),
  ('execution.collection.attachmentHint','installationExecution','appointments','help','ارفع صورة مرتبطة بمرحلة التحصيل لتظهر لاحقًا ضمن المرفقات.','Upload an image related to the collection stage so it appears later in attachments.','ارفع صورة مرتبطة بمرحلة التحصيل لتظهر لاحقًا ضمن المرفقات.','Upload an image related to the collection stage so it appears later in attachments.',true),
  ('invoices.attachments.title','salesInvoices','salesInvoices','label','المرفقات','Attachments','المرفقات','Attachments',true),
  ('invoices.attachments.view','salesInvoices','salesInvoices','button','عرض المرفقات','View attachments','عرض المرفقات','View attachments',true),
  ('invoices.attachments.open','salesInvoices','salesInvoices','button','فتح','Open','فتح','Open',true),
  ('invoices.attachments.none','salesInvoices','salesInvoices','empty','لا توجد مرفقات','No attachments','لا توجد مرفقات','No attachments',true),
  ('invoices.attachments.collection','salesInvoices','salesInvoices','label','مرفق التحصيل','Collection attachment','مرفق التحصيل','Collection attachment',true),
  ('invoices.attachments.execution','salesInvoices','salesInvoices','label','مرفق التنفيذ','Execution attachment','مرفق التنفيذ','Execution attachment',true),
  ('invoices.edit.title','salesInvoices','salesInvoices','title','تعديل بيانات الفاتورة','Edit invoice details','تعديل بيانات الفاتورة','Edit invoice details',true),
  ('invoices.edit.action','salesInvoices','salesInvoices','button','تعديل','Edit','تعديل','Edit',true),
  ('invoices.edit.numberValidation','salesInvoices','salesInvoices','validation','رقم الفاتورة يجب أن يكون 9 أرقام، أو اختر بدون فاتورة.','Invoice number must be 9 digits, or choose No invoice.','رقم الفاتورة يجب أن يكون 9 أرقام، أو اختر بدون فاتورة.','Invoice number must be 9 digits, or choose No invoice.',true),
  ('appointments.completion.attachments','installationCompletion','appointments','label','مرفقات التحصيل','Collection attachments','مرفقات التحصيل','Collection attachments',true),
  ('appointments.completion.collectionAttachment','installationCompletion','appointments','label','مرفق التحصيل','Collection attachment','مرفق التحصيل','Collection attachment',true),
  ('common.save','shared','shared','button','حفظ','Save','حفظ','Save',true),
  ('common.cancel','shared','shared','button','إلغاء','Cancel','إلغاء','Cancel',true)
on conflict (translation_key) do update set
  ar_text=excluded.ar_text,en_text=excluded.en_text,default_ar=excluded.default_ar,default_en=excluded.default_en,text_type=excluded.text_type,is_active=true;

commit;
