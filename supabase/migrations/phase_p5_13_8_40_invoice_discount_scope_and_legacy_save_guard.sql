-- Phase P5.13.8.40 — Invoice discount scope + legacy direct-save guard companion
-- Scope: invoice financial correctness only. No scheduling/execution state transitions are changed here.
-- The JS compatibility save() is routed through update_petatoe_appointment; this migration aligns
-- installation invoice_amount with the same execution-group final_amount (VAT + discount) used by
-- execution/collection, while preserving sales_invoices.invoice_amount as a pre-VAT display base.
begin;

create or replace function public.get_installation_execution_group_invoice_financials(
  p_installation_request_id uuid,
  p_visit_id uuid
)
returns table(
  invoice_amount numeric(14,2),
  final_amount_including_tax numeric(14,2),
  installation_cost numeric(14,2)
)
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  v public.installation_execution_visits%rowtype;
  ids uuid[];
  group_final numeric:=0;
  group_cost numeric:=0;
  tax_factor numeric:=1.15;
begin
  select * into r
  from public.installation_requests
  where id=p_installation_request_id;
  if not found then raise exception 'طلب الموعد غير موجود'; end if;

  select * into v
  from public.installation_execution_visits
  where id=p_visit_id and installation_request_id=p_installation_request_id;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;

  ids:=public.get_installation_execution_group_visit_ids(p_installation_request_id,p_visit_id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[p_visit_id]; end if;

  -- Mirror the canonical execution/collection allocation:
  -- request final amount is distributed across live/confirmed groups according to
  -- their scheduled service subtotal. This carries VAT and discount proportionally
  -- and guarantees the groups reconcile back to installation_requests.final_amount.
  with financial_groups as (
    select
      ev.installation_team_id as team_id,
      ev.scheduled_date as group_date,
      coalesce(sum(greatest(coalesce(vs.scheduled_quantity,0),0) * greatest(coalesce(rs.unit_price,0),0)),0)::numeric as subtotal
    from public.installation_execution_visits ev
    join public.installation_execution_visit_services vs on vs.visit_id=ev.id
    join public.installation_request_services rs
      on rs.id=vs.request_service_id
     and rs.installation_request_id=ev.installation_request_id
    where ev.installation_request_id=p_installation_request_id
      and ev.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة')
    group by ev.installation_team_id,ev.scheduled_date
  ), totals as (
    select
      coalesce(sum(subtotal),0)::numeric as allocated_subtotal,
      greatest(coalesce(r.total_services_amount,0),0)::numeric as request_subtotal
    from financial_groups
  ), ranked as (
    select
      fg.*,
      case
        when t.allocated_subtotal > t.request_subtotal + 0.01 then t.allocated_subtotal
        else t.request_subtotal
      end as allocation_base,
      (abs(t.allocated_subtotal-t.request_subtotal) <= 0.01) as fully_allocated,
      (t.allocated_subtotal > t.request_subtotal + 0.01) as over_allocated,
      row_number() over(order by fg.group_date,coalesce(fg.team_id::text,'')) as rn,
      count(*) over() as cnt
    from financial_groups fg cross join totals t
  ), prelim as (
    select
      ranked.*,
      case
        when allocation_base>0 then round(greatest(coalesce(r.final_amount,0),0) * subtotal / allocation_base,2)
        else 0
      end as preliminary_due
    from ranked
  ), allocated as (
    select
      prelim.*,
      coalesce(sum(preliminary_due) over(
        order by group_date,coalesce(team_id::text,'')
        rows between unbounded preceding and 1 preceding
      ),0) as prior_due
    from prelim
  )
  select coalesce(max(case
    when team_id is not distinct from v.installation_team_id
     and group_date is not distinct from v.scheduled_date then
      case
        when (fully_allocated or over_allocated) and rn=cnt
          then greatest(round(greatest(coalesce(r.final_amount,0),0)-prior_due,2),0)
        else greatest(preliminary_due,0)
      end
  end),0)
  into group_final
  from allocated;

  -- Safe legacy fallback: if an old visit has no allocation rows, derive its share from
  -- the confirmed executed service value, capped at original requested quantities.
  if group_final<=0 then
    with service_qty as (
      select
        rs.id,rs.unit_price,rs.quantity requested_qty,
        least(rs.quantity,coalesce(sum(coalesce(vs.executed_quantity,0)),0)) executed_qty
      from public.installation_request_services rs
      left join public.installation_execution_visit_services vs
        on vs.request_service_id=rs.id and vs.visit_id=any(ids)
      where rs.installation_request_id=p_installation_request_id
      group by rs.id,rs.unit_price,rs.quantity
    )
    select case
      when greatest(coalesce(r.total_services_amount,0),0)>0 then
        round(greatest(coalesce(r.final_amount,0),0) * coalesce(sum(executed_qty*unit_price),0)
              / greatest(coalesce(r.total_services_amount,0),0),2)
      else 0
    end
    into group_final
    from service_qty;
  end if;

  -- Cost stays based on actual confirmed quantities and is capped per request service,
  -- preserving the existing same-day duplicate-allocation protection.
  with service_qty as (
    select
      rs.id,coalesce(st.default_cost,0) default_cost,rs.quantity requested_qty,
      least(rs.quantity,coalesce(sum(coalesce(vs.executed_quantity,0)),0)) executed_qty
    from public.installation_request_services rs
    left join public.installation_service_types st on st.id=rs.service_type_id
    left join public.installation_execution_visit_services vs
      on vs.request_service_id=rs.id and vs.visit_id=any(ids)
    where rs.installation_request_id=p_installation_request_id
    group by rs.id,st.default_cost,rs.quantity
  )
  select coalesce(sum(executed_qty*default_cost),0)::numeric(14,2)
  into group_cost
  from service_qty;

  if group_final<=0 then raise exception 'لا توجد كمية منفذة بقيمة قابلة للفوترة في مجموعة التنفيذ'; end if;

  tax_factor:=1+(greatest(coalesce(r.tax_rate,15),0)/100.0);
  if tax_factor<=0 then tax_factor:=1.15; end if;

  -- sales_invoices.invoice_amount remains the pre-VAT base expected by the existing
  -- Sales Invoices UI. Back-solving from canonical final preserves the actual discounted
  -- VAT-inclusive total when the UI applies the configured VAT rate.
  invoice_amount:=round(group_final/tax_factor,2)::numeric(14,2);
  final_amount_including_tax:=round(group_final,2)::numeric(14,2);
  installation_cost:=round(group_cost,2)::numeric(14,2);
  return next;
end;
$$;

revoke all on function public.get_installation_execution_group_invoice_financials(uuid,uuid) from public,anon;
grant execute on function public.get_installation_execution_group_invoice_financials(uuid,uuid) to authenticated,service_role;

-- Keep the existing signature/call graph intact; only replace the financial source.
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
  final_with_tax numeric(14,2):=0;
  cost numeric(14,2):=0;
  v_invoice_number text;
begin
  if not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  if coalesce(p_without_invoice,false) then v_invoice_number:='NOINV-'||replace(gen_random_uuid()::text,'-','');
  else v_invoice_number:=trim(coalesce(p_invoice_number,'')); if nullif(v_invoice_number,'') is null then raise exception 'رقم الفاتورة مطلوب أو اختر بدون فاتورة'; end if; end if;

  select * into r from public.installation_requests where id=p_installation_request_id;
  if not found then raise exception 'طلب الموعد غير موجود'; end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_installation_request_id;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_installation_request_id,v.id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[v.id]; end if;
  select x.* into canon_visit from public.installation_execution_visits x where x.id=any(ids) order by x.visit_no,x.id::text limit 1;

  if exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and (x.status<>'مؤكدة' or x.confirmed_at is null)) then raise exception 'لا يمكن تحويل مجموعة التنفيذ إلى فاتورة قبل تأكيد الكمية المنفذة بالكامل'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,canon_visit.installation_team_id) then raise exception 'طلب الموعد خارج نطاق البيانات المسموح'; end if;
  select * into existing from public.sales_invoices where installation_execution_visit_id=any(ids) and status<>'ملغاة' order by created_at desc limit 1;
  if found then return existing; end if;
  if not coalesce(p_without_invoice,false) and exists(select 1 from public.sales_invoices si where si.invoice_number=v_invoice_number and si.status<>'ملغاة') then raise exception 'رقم الفاتورة مستخدم بالفعل'; end if;
  if exists(select 1 from public.sales_invoices si where si.installation_request_id=r.id and si.installation_execution_visit_id is null and si.status<>'ملغاة') then raise exception 'تم إصدار فاتورة كاملة لهذا الطلب بالفعل'; end if;

  select f.invoice_amount,f.final_amount_including_tax,f.installation_cost
  into amount,final_with_tax,cost
  from public.get_installation_execution_group_invoice_financials(p_installation_request_id,p_visit_id) f;

  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,installation_request_id,installation_execution_visit_id,completion_report_id,invoice_amount,installation_expenses,invoice_date,source_type,status,is_without_invoice)
  values(v_invoice_number,r.request_number||'-'||lpad(canon_visit.visit_no::text,2,'0'),r.customer_id,r.representative_id,null,r.id,canon_visit.id,null,amount,cost,p_invoice_date,'installation','صادرة',coalesce(p_without_invoice,false))
  returning * into created;

  update public.installation_request_collection set invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,updated_at=now() where installation_request_id=r.id;
  return created;
end;
$$;

grant execute on function public.create_sales_invoice_from_installation_visit_v2(uuid,uuid,text,date,boolean) to authenticated;

create or replace function public.create_sales_invoice_from_installation_group_v3(
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
  final_with_tax numeric(14,2):=0;
  cost numeric(14,2):=0;
  v_invoice_number text;
  display_request_number text;
begin
  if not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  if coalesce(p_without_invoice,false) then v_invoice_number:='NOINV-'||replace(gen_random_uuid()::text,'-','');
  else v_invoice_number:=trim(coalesce(p_invoice_number,'')); if nullif(v_invoice_number,'') is null then raise exception 'رقم الفاتورة مطلوب أو اختر بدون فاتورة'; end if; end if;

  select * into r from public.installation_requests where id=p_installation_request_id;
  if not found then raise exception 'طلب الموعد غير موجود'; end if;
  select * into v from public.installation_execution_visits where id=p_visit_id and installation_request_id=p_installation_request_id;
  if not found then raise exception 'زيارة التنفيذ غير موجودة لهذا الطلب'; end if;
  ids:=public.get_installation_execution_group_visit_ids(p_installation_request_id,v.id);
  if coalesce(cardinality(ids),0)=0 then ids:=array[v.id]; end if;
  select x.* into canon_visit from public.installation_execution_visits x where x.id=any(ids) order by x.visit_no,x.id::text limit 1;

  if exists(select 1 from public.installation_execution_visits x where x.id=any(ids) and (x.status<>'مؤكدة' or x.confirmed_at is null)) then raise exception 'لا يمكن تحويل مجموعة التنفيذ إلى فاتورة قبل تأكيد الكمية المنفذة بالكامل'; end if;
  if not public.can_access_installation_request_scope(r.representative_id,canon_visit.installation_team_id) then raise exception 'طلب الموعد خارج نطاق البيانات المسموح'; end if;
  select * into existing from public.sales_invoices where installation_execution_visit_id=any(ids) and status<>'ملغاة' order by created_at desc limit 1;
  if found then return existing; end if;
  if not coalesce(p_without_invoice,false) and exists(select 1 from public.sales_invoices si where si.invoice_number=v_invoice_number and si.status<>'ملغاة') then raise exception 'رقم الفاتورة مستخدم بالفعل'; end if;
  if exists(select 1 from public.sales_invoices si where si.installation_request_id=r.id and si.installation_execution_visit_id is null and si.status<>'ملغاة') then raise exception 'تم إصدار فاتورة كاملة لهذا الطلب بالفعل'; end if;

  select f.invoice_amount,f.final_amount_including_tax,f.installation_cost
  into amount,final_with_tax,cost
  from public.get_installation_execution_group_invoice_financials(p_installation_request_id,p_visit_id) f;

  display_request_number:=case when cardinality(ids)>1 then r.request_number else r.request_number||'-'||lpad(canon_visit.visit_no::text,2,'0') end;
  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,installation_request_id,installation_execution_visit_id,completion_report_id,invoice_amount,installation_expenses,invoice_date,source_type,status,is_without_invoice)
  values(v_invoice_number,display_request_number,r.customer_id,r.representative_id,null,r.id,canon_visit.id,null,amount,cost,p_invoice_date,'installation','صادرة',coalesce(p_without_invoice,false))
  returning * into created;

  update public.installation_request_collection set invoice_number=case when coalesce(p_without_invoice,false) then null else v_invoice_number end,updated_at=now() where installation_request_id=r.id;
  return created;
end;
$$;

grant execute on function public.create_sales_invoice_from_installation_group_v3(uuid,uuid,text,date,boolean) to authenticated;

-- Legacy request-level completion still exists only for appointments that predate execution visits.
-- Keep it functional, but align its financial value with the request canonical final_amount.
create or replace function public.sync_sales_invoice_from_installation(p_installation_request_id uuid)
returns public.sales_invoices
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.installation_requests%rowtype;
  cr public.installation_completion_reports%rowtype;
  existing public.sales_invoices%rowtype;
  created public.sales_invoices%rowtype;
  cost numeric(14,2);
  amount numeric(14,2);
  tax_factor numeric:=1.15;
begin
  if auth.uid() is not null and not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  select * into r from public.installation_requests where id=p_installation_request_id;
  if not found then raise exception 'طلب التركيب غير موجود'; end if;
  select * into cr from public.installation_completion_reports where installation_request_id=r.id;
  if not found then raise exception 'بيانات تأكيد انتهاء التركيب غير موجودة'; end if;
  if nullif(btrim(coalesce(cr.invoice_number,'')),'') is null then raise exception 'رقم الفاتورة مطلوب'; end if;
  if cr.invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;

  tax_factor:=1+(greatest(coalesce(r.tax_rate,15),0)/100.0);
  if tax_factor<=0 then tax_factor:=1.15; end if;
  amount:=round(greatest(coalesce(r.final_amount,0),0)/tax_factor,2)::numeric(14,2);
  if amount<=0 then raise exception 'لا توجد قيمة نهائية قابلة للفوترة لهذا الموعد'; end if;

  select coalesce(sum(s.quantity*coalesce(t.default_cost,0)),0)::numeric(14,2) into cost
  from public.installation_request_services s
  join public.installation_service_types t on t.id=s.service_type_id
  where s.installation_request_id=r.id;

  select * into existing from public.sales_invoices where installation_request_id=r.id and status<>'ملغاة' order by created_at desc limit 1;
  if found then
    update public.sales_invoices
    set invoice_number=cr.invoice_number,
        request_number=coalesce(nullif(r.customer_order_number,''),r.request_number),
        invoice_amount=amount,installation_expenses=cost,invoice_date=cr.invoice_date,
        completion_report_id=cr.id,quotation_id=r.quotation_id,updated_at=now()
    where id=existing.id returning * into created;
    return created;
  end if;

  insert into public.sales_invoices(invoice_number,request_number,customer_id,representative_id,quotation_id,installation_request_id,completion_report_id,invoice_amount,installation_expenses,invoice_date,source_type,status)
  values(cr.invoice_number,coalesce(nullif(r.customer_order_number,''),r.request_number),r.customer_id,r.representative_id,r.quotation_id,r.id,cr.id,amount,cost,cr.invoice_date,'installation','صادرة')
  returning * into created;
  return created;
end;
$$;

grant execute on function public.sync_sales_invoice_from_installation(uuid) to authenticated;

-- Obsolete public visit endpoint remains as a compatibility alias only. It must not
-- retain an independent financial formula that can diverge from the canonical v2/group path.
create or replace function public.create_sales_invoice_from_installation_visit(
  p_installation_request_id uuid,
  p_visit_id uuid,
  p_invoice_number text,
  p_invoice_date date
)
returns public.sales_invoices
language sql
security definer
set search_path=public
as $$
  select public.create_sales_invoice_from_installation_visit_v2(
    p_installation_request_id,p_visit_id,p_invoice_number,p_invoice_date,false
  );
$$;

grant execute on function public.create_sales_invoice_from_installation_visit(uuid,uuid,text,date) to authenticated;

notify pgrst,'reload schema';
commit;
