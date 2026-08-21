-- P5.13.8.65 — Full Sales Invoice Edit + Reverse Sync
-- Scope: Sales Invoices only. Installation invoices reverse-sync invoice edits to the canonical
-- request services, confirmed execution group, collection record, and collection attachments metadata.
begin;

create table if not exists public.sales_invoice_revision_audit(
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  installation_request_id uuid references public.installation_requests(id) on delete set null,
  before_state jsonb not null,
  after_state jsonb not null,
  changed_by uuid references auth.users(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists idx_sales_invoice_revision_audit_invoice on public.sales_invoice_revision_audit(sales_invoice_id,changed_at desc);
alter table public.sales_invoice_revision_audit enable row level security;
drop policy if exists "sales invoice revision audit scoped select" on public.sales_invoice_revision_audit;
create policy "sales invoice revision audit scoped select" on public.sales_invoice_revision_audit
for select to authenticated using(
  public.has_screen_permission('salesInvoices','view') and exists(
    select 1 from public.sales_invoices si where si.id=sales_invoice_id
      and (si.representative_id is null or public.can_access_representative(si.representative_id))
  )
);
grant select on public.sales_invoice_revision_audit to authenticated;

create or replace function public.get_sales_invoice_edit_workspace(p_invoice_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  inv public.sales_invoices%rowtype;
  req public.installation_requests%rowtype;
  ids uuid[];
  result jsonb;
begin
  if not public.has_screen_permission('salesInvoices','edit') then raise exception 'لا توجد صلاحية تعديل فواتير المبيعات'; end if;
  select * into inv from public.sales_invoices where id=p_invoice_id and status<>'ملغاة';
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if inv.representative_id is not null and not public.can_access_representative(inv.representative_id) then raise exception 'الفاتورة خارج نطاق البيانات المسموح'; end if;

  if inv.source_type='manual' then
    select jsonb_build_object(
      'sourceType','manual',
      'serviceCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',stc.id,'name',coalesce(stc.name,''),'defaultPrice',coalesce(stc.default_price,0)) order by stc.name) from public.installation_service_types stc where stc.is_active=true),'[]'::jsonb),
      'services',coalesce((select jsonb_agg(jsonb_build_object(
        'requestServiceId',null,'serviceTypeId',sis.service_type_id,'serviceName',coalesce(st.name,''),
        'quantity',sis.quantity,'unitPrice',sis.unit_price
      ) order by sis.created_at,sis.id) from public.sales_invoice_services sis join public.installation_service_types st on st.id=sis.service_type_id where sis.sales_invoice_id=inv.id),'[]'::jsonb),
      'collection',jsonb_build_object('amountCollected',coalesce(inv.final_amount,inv.invoice_amount,0),'paymentMethod',coalesce(inv.payment_method,''),'notes',coalesce(inv.notes,'')),
      'attachments','[]'::jsonb
    ) into result;
    return result;
  end if;

  if inv.source_type<>'installation' or inv.installation_request_id is null or inv.installation_execution_visit_id is null then
    return jsonb_build_object('sourceType',inv.source_type,'serviceCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',stc.id,'name',coalesce(stc.name,''),'defaultPrice',coalesce(stc.default_price,0)) order by stc.name) from public.installation_service_types stc where stc.is_active=true),'[]'::jsonb),'services','[]'::jsonb,'collection',jsonb_build_object('amountCollected',0,'paymentMethod',coalesce(inv.payment_method,''),'notes',''),'attachments','[]'::jsonb);
  end if;

  select * into req from public.installation_requests where id=inv.installation_request_id;
  ids:=public.get_installation_execution_group_visit_ids(inv.installation_request_id,inv.installation_execution_visit_id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[inv.installation_execution_visit_id]; end if;

  select jsonb_build_object(
    'sourceType','installation',
    'serviceCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',stc.id,'name',coalesce(stc.name,''),'defaultPrice',coalesce(stc.default_price,0)) order by stc.name) from public.installation_service_types stc where stc.is_active=true),'[]'::jsonb),
    'requestId',inv.installation_request_id,
    'visitId',inv.installation_execution_visit_id,
    'services',coalesce((select jsonb_agg(jsonb_build_object(
      'requestServiceId',rs.id,'serviceTypeId',rs.service_type_id,'serviceName',coalesce(st.name,''),
      'quantity',x.executed_qty,'unitPrice',rs.unit_price
    ) order by rs.created_at,rs.id) from (
      select vs.request_service_id,coalesce(sum(coalesce(vs.executed_quantity,0)),0)::integer executed_qty
      from public.installation_execution_visit_services vs where vs.visit_id=any(ids)
      group by vs.request_service_id having coalesce(sum(coalesce(vs.executed_quantity,0)),0)>0
    ) x join public.installation_request_services rs on rs.id=x.request_service_id
        join public.installation_service_types st on st.id=rs.service_type_id),'[]'::jsonb),
    'collection',coalesce((select jsonb_build_object('amountCollected',coalesce(c.amount_collected,0),'paymentMethod',coalesce(c.payment_method,''),'notes',coalesce(c.collection_notes,'')) from public.installation_request_collection c where c.installation_request_id=inv.installation_request_id),jsonb_build_object('amountCollected',0,'paymentMethod','','notes','')),
    'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'storagePath',f.storage_path,'originalName',coalesce(f.original_name,'مرفق'),'mimeType',coalesce(f.mime_type,''),'fileSize',coalesce(f.file_size,0)) order by f.uploaded_at,f.id)
      from public.installation_execution_files f where f.installation_request_id=inv.installation_request_id and f.file_kind='collection' and (f.execution_visit_id is null or f.execution_visit_id=any(ids))),'[]'::jsonb)
  ) into result;
  return result;
end;$$;
revoke all on function public.get_sales_invoice_edit_workspace(uuid) from public,anon;
grant execute on function public.get_sales_invoice_edit_workspace(uuid) to authenticated,service_role;

create or replace function public.update_sales_invoice_full_v1(
  p_invoice_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_without_invoice boolean,
  p_payment_method text,
  p_services jsonb,
  p_collection_notes text default null,
  p_removed_attachment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  inv public.sales_invoices%rowtype;
  req public.installation_requests%rowtype;
  ids uuid[];
  anchor_visit uuid;
  item jsonb;
  rid uuid;
  sid uuid;
  qty integer;
  price numeric(14,2);
  old_group_qty numeric;
  other_qty numeric;
  new_request_qty integer;
  v_invoice_number text;
  v_payment text;
  subtotal numeric(14,2):=0;
  tax numeric(14,2):=0;
  final_total numeric(14,2):=0;
  fin record;
  sibling_inv record;
  before_state jsonb;
  after_state jsonb;
  removed_paths jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('salesInvoices','edit') then raise exception 'لا توجد صلاحية تعديل فواتير المبيعات'; end if;
  select * into inv from public.sales_invoices where id=p_invoice_id for update;
  if not found or inv.status='ملغاة' then raise exception 'الفاتورة غير موجودة أو ملغاة'; end if;
  if inv.representative_id is not null and not public.can_access_representative(inv.representative_id) then raise exception 'الفاتورة خارج نطاق البيانات المسموح'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  if jsonb_typeof(coalesce(p_services,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_services,'[]'::jsonb))=0 then raise exception 'أضف خدمة واحدة على الأقل'; end if;

  v_invoice_number:=case when coalesce(p_without_invoice,false) then 'NOINV-'||replace(gen_random_uuid()::text,'-','') else btrim(coalesce(p_invoice_number,'')) end;
  if not coalesce(p_without_invoice,false) and nullif(v_invoice_number,'') is null then raise exception 'رقم الفاتورة مطلوب أو اختر بدون فاتورة'; end if;
  if not coalesce(p_without_invoice,false) and exists(select 1 from public.sales_invoices si where si.id<>inv.id and si.invoice_number=v_invoice_number and si.status<>'ملغاة') then raise exception 'رقم الفاتورة مستخدم بالفعل'; end if;
  v_payment:=nullif(btrim(coalesce(p_payment_method,'')),'');
  if v_payment is null then raise exception 'اختر طريقة الدفع'; end if;

  before_state:=jsonb_build_object('invoice',to_jsonb(inv));

  if inv.source_type='manual' then
    delete from public.sales_invoice_services where sales_invoice_id=inv.id;
    for item in select value from jsonb_array_elements(p_services) loop
      sid:=nullif(item->>'service_type_id','')::uuid; qty:=coalesce((item->>'quantity')::integer,0); price:=coalesce((item->>'unit_price')::numeric,0);
      if sid is null or qty<1 or price<0 or not exists(select 1 from public.installation_service_types st where st.id=sid and st.is_active=true) then raise exception 'راجع نوع الخدمة والعدد والسعر في جميع الخدمات'; end if;
      insert into public.sales_invoice_services(sales_invoice_id,service_type_id,quantity,unit_price,line_total) values(inv.id,sid,qty,price,round(qty*price,2));
      subtotal:=subtotal+round(qty*price,2);
    end loop;
    tax:=round(subtotal*.15,2);
    if inv.discount_type='percentage' then
      final_total:=round(greatest((subtotal+tax)-round((subtotal+tax)*least(greatest(coalesce(inv.discount_value,0),0),100)/100.0,2),0),2);
      update public.sales_invoices set discount_amount=round((subtotal+tax)*least(greatest(coalesce(inv.discount_value,0),0),100)/100.0,2) where id=inv.id;
    else
      final_total:=round(greatest((subtotal+tax)-least(greatest(coalesce(inv.discount_value,inv.discount_amount,0),0),subtotal+tax),0),2);
      update public.sales_invoices set discount_amount=least(greatest(coalesce(inv.discount_value,inv.discount_amount,0),0),subtotal+tax) where id=inv.id;
    end if;
    update public.sales_invoices set invoice_number=v_invoice_number,is_without_invoice=coalesce(p_without_invoice,false),invoice_date=p_invoice_date,payment_method=v_payment,
      manual_subtotal=subtotal,tax_rate=15,tax_amount=tax,final_amount=final_total,invoice_amount=round(final_total/1.15,2),notes=nullif(btrim(coalesce(p_collection_notes,'')),''),updated_at=now() where id=inv.id;
  elsif inv.source_type='installation' and inv.installation_request_id is not null and inv.installation_execution_visit_id is not null then
    select * into req from public.installation_requests where id=inv.installation_request_id for update;
    if not found then raise exception 'طلب الموعد غير موجود'; end if;
    ids:=public.get_installation_execution_group_visit_ids(inv.installation_request_id,inv.installation_execution_visit_id);
    if coalesce(cardinality(ids),0)=0 then ids:=array[inv.installation_execution_visit_id]; end if;
    if exists(select 1 from public.installation_execution_visits v where v.id=any(ids) and v.status<>'مؤكدة') then raise exception 'لا يمكن تعديل خدمات فاتورة لمجموعة تنفيذ غير مؤكدة'; end if;
    select v.id into anchor_visit from public.installation_execution_visits v where v.id=any(ids) order by case when v.id=inv.installation_execution_visit_id then 0 else 1 end,v.visit_no,v.id::text limit 1;

    create temporary table if not exists tmp_invoice_edit_services(ord bigint,request_service_id uuid,service_type_id uuid,quantity integer,unit_price numeric) on commit drop;
    truncate tmp_invoice_edit_services;
    create temporary table if not exists tmp_invoice_group_existing(request_service_id uuid primary key,group_quantity numeric) on commit drop;
    truncate tmp_invoice_group_existing;
    insert into tmp_invoice_group_existing(request_service_id,group_quantity)
    select vs.request_service_id,coalesce(sum(greatest(coalesce(vs.scheduled_quantity,0),coalesce(vs.executed_quantity,0))),0)
    from public.installation_execution_visit_services vs
    where vs.visit_id=any(ids)
    group by vs.request_service_id;
    insert into tmp_invoice_edit_services
    select x.ordinality,nullif(x.item->>'request_service_id','')::uuid,nullif(x.item->>'service_type_id','')::uuid,(x.item->>'quantity')::integer,(x.item->>'unit_price')::numeric
    from jsonb_array_elements(p_services) with ordinality x(item,ordinality);
    if exists(select 1 from tmp_invoice_edit_services where service_type_id is null or quantity<1 or unit_price<0) then raise exception 'راجع نوع الخدمة والعدد والسعر في جميع الخدمات'; end if;
    if exists(select request_service_id from tmp_invoice_edit_services where request_service_id is not null group by request_service_id having count(*)>1) then raise exception 'تكرار غير صالح لسطر خدمة'; end if;
    if exists(select 1 from tmp_invoice_edit_services t where t.request_service_id is not null and not exists(select 1 from public.installation_request_services rs where rs.id=t.request_service_id and rs.installation_request_id=inv.installation_request_id)) then raise exception 'سطر خدمة لا يخص الطلب'; end if;

    -- Remove group allocations first; request-service quantity is corrected below.
    delete from public.installation_execution_visit_services vs where vs.visit_id=any(ids);

    -- Existing request lines that were removed from this invoice group.
    for rid,old_group_qty in
      select rs.id,coalesce((select sum(coalesce(vs2.executed_quantity,0)) from public.installation_execution_visit_services vs2 join public.installation_execution_visits v2 on v2.id=vs2.visit_id where vs2.request_service_id=rs.id and v2.installation_request_id=inv.installation_request_id and not (v2.id=any(ids))),0)
      from public.installation_request_services rs join tmp_invoice_group_existing ge on ge.request_service_id=rs.id
      where rs.installation_request_id=inv.installation_request_id and not exists(select 1 from tmp_invoice_edit_services t where t.request_service_id=rs.id)
    loop
      -- Keep services still used/scheduled by other groups; otherwise remove the request line entirely.
      if old_group_qty>0 or exists(select 1 from public.installation_execution_visit_services vs3 join public.installation_execution_visits v3 on v3.id=vs3.visit_id where vs3.request_service_id=rid and v3.installation_request_id=inv.installation_request_id) then
        update public.installation_request_services set quantity=greatest(ceil(old_group_qty)::integer,1),updated_at=now() where id=rid;
      else
        delete from public.installation_request_services where id=rid;
      end if;
    end loop;

    for item in select to_jsonb(t) from tmp_invoice_edit_services t order by ord loop
      rid:=nullif(item->>'request_service_id','')::uuid; sid:=(item->>'service_type_id')::uuid; qty:=(item->>'quantity')::integer; price:=(item->>'unit_price')::numeric;
      if rid is null then
        insert into public.installation_request_services(installation_request_id,service_type_id,quantity,unit_price) values(inv.installation_request_id,sid,qty,price) returning id into rid;
      else
        select coalesce(sum(greatest(coalesce(vs.scheduled_quantity,0),coalesce(vs.executed_quantity,0))),0) into other_qty from public.installation_execution_visit_services vs join public.installation_execution_visits v on v.id=vs.visit_id where vs.request_service_id=rid and v.installation_request_id=inv.installation_request_id;
        if other_qty>0 and exists(select 1 from public.installation_request_services rs where rs.id=rid and rs.service_type_id<>sid) then raise exception 'لا يمكن تغيير نوع خدمة مستخدمة في زيارة أخرى'; end if;
        new_request_qty:=ceil(other_qty)::integer+qty;
        update public.installation_request_services set service_type_id=sid,quantity=greatest(new_request_qty,1),unit_price=price,updated_at=now() where id=rid;
      end if;
      insert into public.installation_execution_visit_services(visit_id,request_service_id,scheduled_quantity,executed_quantity,updated_at) values(anchor_visit,rid,qty,qty,now())
      on conflict(visit_id,request_service_id) do update set scheduled_quantity=excluded.scheduled_quantity,executed_quantity=excluded.executed_quantity,updated_at=now();
    end loop;

    perform public.refresh_installation_request_totals(inv.installation_request_id);
    -- Touch financial owner so the canonical trigger recalculates VAT/discount/final amount.
    update public.installation_requests set discount_amount=discount_amount,updated_at=now() where id=inv.installation_request_id;

    update public.installation_request_collection c
    set payment_method=v_payment,
        collection_notes=nullif(btrim(coalesce(p_collection_notes,'')),''),
        invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,
        session_value=(select r3.final_amount from public.installation_requests r3 where r3.id=inv.installation_request_id),
        total_discount=(select r3.discount_amount from public.installation_requests r3 where r3.id=inv.installation_request_id),
        amount_collected=least(coalesce(c.amount_collected,0),(select r3.final_amount from public.installation_requests r3 where r3.id=inv.installation_request_id)),
        collection_status=case
          when least(coalesce(c.amount_collected,0),(select r3.final_amount from public.installation_requests r3 where r3.id=inv.installation_request_id))<=0 then 'غير محصل'
          when least(coalesce(c.amount_collected,0),(select r3.final_amount from public.installation_requests r3 where r3.id=inv.installation_request_id)) >= (select r3.final_amount from public.installation_requests r3 where r3.id=inv.installation_request_id) then 'محصل بالكامل'
          else 'محصل جزئيًا' end,
        updated_at=now()
    where c.installation_request_id=inv.installation_request_id;

    -- Recalculate every issued installation invoice for the same request because request-service
    -- price/quantity is canonical at request level and may be shared by another confirmed group.
    for sibling_inv in
      select si.id,si.installation_execution_visit_id
      from public.sales_invoices si
      where si.installation_request_id=inv.installation_request_id
        and si.source_type='installation' and si.status<>'ملغاة'
        and si.installation_execution_visit_id is not null
    loop
      select * into fin from public.get_installation_execution_group_invoice_financials(inv.installation_request_id,sibling_inv.installation_execution_visit_id);
      update public.sales_invoices
      set invoice_amount=fin.invoice_amount,final_amount=fin.final_amount_including_tax,installation_expenses=fin.installation_cost,updated_at=now()
      where id=sibling_inv.id;
    end loop;
    update public.sales_invoices set invoice_number=v_invoice_number,is_without_invoice=coalesce(p_without_invoice,false),invoice_date=p_invoice_date,payment_method=v_payment,updated_at=now() where id=inv.id;
    if inv.completion_report_id is not null then update public.installation_completion_reports set invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,invoice_date=p_invoice_date,updated_at=now() where id=inv.completion_report_id; end if;
  else
    update public.sales_invoices set invoice_number=v_invoice_number,is_without_invoice=coalesce(p_without_invoice,false),invoice_date=p_invoice_date,updated_at=now() where id=inv.id;
  end if;

  if coalesce(cardinality(p_removed_attachment_ids),0)>0 and inv.installation_request_id is not null then
    select coalesce(jsonb_agg(f.storage_path),'[]'::jsonb) into removed_paths from public.installation_execution_files f where f.id=any(p_removed_attachment_ids) and f.installation_request_id=inv.installation_request_id and f.file_kind='collection';
    delete from public.installation_execution_files f where f.id=any(p_removed_attachment_ids) and f.installation_request_id=inv.installation_request_id and f.file_kind='collection';
  end if;

  select to_jsonb(si) into after_state from public.sales_invoices si where si.id=inv.id;
  insert into public.sales_invoice_revision_audit(sales_invoice_id,installation_request_id,before_state,after_state) values(inv.id,inv.installation_request_id,before_state,after_state);
  return jsonb_build_object('invoiceId',inv.id,'removedStoragePaths',removed_paths);
end;$$;
revoke all on function public.update_sales_invoice_full_v1(uuid,text,date,boolean,text,jsonb,text,uuid[]) from public,anon;
grant execute on function public.update_sales_invoice_full_v1(uuid,text,date,boolean,text,jsonb,text,uuid[]) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
