-- Phase P5.13.8.72 R44R23 — Zero-value executed service invoice eligibility
-- Scope: canonical execution-group invoice eligibility only.
-- A confirmed executed quantity may be invoiced at SAR 0.00 when the service is intentionally free.
-- No pricing, VAT, discount, commission, treasury, permission, RLS, scheduling, or execution-state rule is changed.
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
  has_executed_quantity boolean:=false;
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

  -- Invoice eligibility is quantity-based, not amount-based. A genuinely executed
  -- free service (unit price/final amount = 0) is a valid invoice, while a group
  -- with no executed quantity must remain blocked.
  select exists(
    select 1
    from public.installation_execution_visit_services vs
    join public.installation_request_services rs
      on rs.id=vs.request_service_id
     and rs.installation_request_id=p_installation_request_id
    where vs.visit_id=any(ids)
      and greatest(coalesce(vs.executed_quantity,0),0)>0
  ) into has_executed_quantity;

  if not has_executed_quantity then
    raise exception 'لا توجد كمية منفذة في مجموعة التنفيذ';
  end if;

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

-- Localized release metadata only; preserve any administrator-customized translations.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('pwa.update.release.r44r23.title','aboutApp','system','title','دعم فواتير الخدمات المجانية','Zero-Value Service Invoice Support','دعم فواتير الخدمات المجانية','Zero-Value Service Invoice Support',true,now()),
  ('pwa.update.release.r44r23.note1','aboutApp','system','help','السماح بتحويل الخدمة المنفذة فعليًا إلى فاتورة صحيحة بقيمة 0.00 عندما تكون الخدمة مجانية.','Allows genuinely executed free services to convert into a valid SAR 0.00 invoice.','السماح بتحويل الخدمة المنفذة فعليًا إلى فاتورة صحيحة بقيمة 0.00 عندما تكون الخدمة مجانية.','Allows genuinely executed free services to convert into a valid SAR 0.00 invoice.',true,now()),
  ('pwa.update.release.r44r23.note2','aboutApp','system','help','استمرار منع إنشاء الفاتورة عندما لا توجد أي كمية منفذة فعلية.','Still blocks invoice creation when no quantity was actually executed.','استمرار منع إنشاء الفاتورة عندما لا توجد أي كمية منفذة فعلية.','Still blocks invoice creation when no quantity was actually executed.',true,now()),
  ('pwa.update.release.r44r23.note3','aboutApp','system','help','لا تغيير على أسعار الخدمات أو الضريبة أو الخصومات أو العمولات أو خزينة السيارة.','No changes to service prices, VAT, discounts, commissions, or Vehicle Treasury.','لا تغيير على أسعار الخدمات أو الضريبة أو الخصومات أو العمولات أو خزينة السيارة.','No changes to service prices, VAT, discounts, commissions, or Vehicle Treasury.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' or public.app_translations.ar_text=public.app_translations.default_ar then excluded.ar_text else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' or public.app_translations.en_text=public.app_translations.default_en then excluded.en_text else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;
