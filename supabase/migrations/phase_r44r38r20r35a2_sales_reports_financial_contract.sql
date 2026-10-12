-- A2: reporting-only historical tax-source recovery; no source mutations.
-- PRECONDITION: public.appointment_historical_sales_reporting.tax_amount exists.
-- Deployment: apply in transaction, then run accompanying read-only reconciliation SQL.
begin;

create or replace function public.sales_reports_rows_r44r38r20r35()
returns table(
  row_id uuid,
  invoice_number text,
  request_number text,
  customer_id uuid,
  customer_name_ar text,
  neighborhood_id uuid,
  neighborhood_name_ar text,
  neighborhood_name_en text,
  invoice_date date,
  status text,
  payment_method text,
  source_type text,
  amount_before_tax numeric(14,2),
  tax_amount numeric(14,2),
  discount_amount numeric(14,2),
  amount_incl_tax numeric(14,2),
  team_id uuid,
  team_name text,
  car_id uuid,
  car_name text,
  plate_number text,
  is_historical boolean,
  record_type text
)
language sql
stable
security definer
set search_path=public
as $$
  with current_rows as (
    select
      si.id as row_id,
      case when coalesce(si.is_without_invoice,false) then 'بدون فاتورة' else coalesce(si.invoice_number,'') end as invoice_number,
      coalesce(si.request_number,'') as request_number,
      si.customer_id,
      coalesce(c.customer_name,'—') as customer_name_ar,
      c.neighborhood_id,
      coalesce(n.name,'') as neighborhood_name_ar,
      coalesce(n.name_en,'') as neighborhood_name_en,
      si.invoice_date,
      coalesce(si.status,'صادرة') as status,
      btrim(coalesce(
        case when si.source_type='manual' then si.payment_method else col.payment_method end,
        si.payment_method,
        ''
      )) as payment_method,
      coalesce(si.source_type,'quotation') as source_type,
      round(greatest(coalesce(si.invoice_amount,0),0),2)::numeric(14,2) as amount_before_tax,
      round(
        greatest(
          case
            when si.final_amount is not null then coalesce(si.final_amount,0)
            else coalesce(si.invoice_amount,0) * (1 + greatest(coalesce(si.tax_rate,15),0) / 100.0)
          end
          - greatest(coalesce(si.invoice_amount,0),0),
          0
        ),2
      )::numeric(14,2) as tax_amount,
      round(
        case
          when si.discount_amount is not null then coalesce(si.discount_amount,0)
          when coalesce(r.discount_amount,0)>0
            and coalesce(r.total_services_amount,0)>coalesce(r.discount_amount,0)
          then coalesce(si.invoice_amount,0) * r.discount_amount
               / nullif(r.total_services_amount-r.discount_amount,0)
          else 0
        end,
        2
      )::numeric(14,2) as discount_amount,
      round(
        greatest(
          case
            when si.final_amount is not null then coalesce(si.final_amount,0)
            else coalesce(si.invoice_amount,0) * (1 + greatest(coalesce(si.tax_rate,15),0) / 100.0)
          end,
          0
        ),2
      )::numeric(14,2) as amount_incl_tax,
      coalesce(v.installation_team_id,r.installation_team_id) as team_id,
      coalesce(ah.team_name_snapshot,t.name,'') as team_name,
      coalesce(ah.appointment_car_id,t.appointment_car_id) as car_id,
      coalesce(ah.car_name_snapshot,car.name,t.car_name,'') as car_name,
      coalesce(ah.plate_number_snapshot,car.plate_number,'') as plate_number,
      false as is_historical,
      'invoice'::text as record_type
    from public.sales_invoices si
    left join public.customers c on c.id=si.customer_id
    left join public.installation_neighborhoods n on n.id=c.neighborhood_id
    left join public.sales_invoices ref_si on ref_si.id=si.reference_sales_invoice_id
    left join public.installation_execution_visits v
      on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
    left join public.installation_requests r
      on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    left join public.installation_request_collection col
      on col.installation_request_id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    left join public.installation_teams t
      on t.id=coalesce(v.installation_team_id,r.installation_team_id)
    left join lateral (
      select h.team_name_snapshot,h.appointment_car_id,h.car_name_snapshot,h.plate_number_snapshot
      from public.installation_team_assignment_history h
      where h.installation_team_id=coalesce(v.installation_team_id,r.installation_team_id)
        and h.effective_from<=si.invoice_date
        and (h.effective_to is null or h.effective_to>=si.invoice_date)
      order by h.effective_from desc,h.created_at desc
      limit 1
    ) ah on true
    left join public.appointment_cars car
      on car.id=coalesce(ah.appointment_car_id,t.appointment_car_id)
    where public.has_screen_permission('salesReports','view')
      and (si.representative_id is null or public.can_access_representative(si.representative_id))
  ),
  historical_rows as (
    select
      h.id as row_id,
      coalesce(nullif(h.invoice_number,''),'بدون فاتورة') as invoice_number,
      ''::text as request_number,
      h.customer_id,
      coalesce(c.customer_name,h.customer_name_snapshot,h.customer_name,'—') as customer_name_ar,
      c.neighborhood_id,
      coalesce(n.name,'') as neighborhood_name_ar,
      coalesce(n.name_en,'') as neighborhood_name_en,
      h.sales_date as invoice_date,
      'صادرة'::text as status,
      btrim(coalesce(h.payment_method,'')) as payment_method,
      'historical'::text as source_type,
      round(coalesce(h.sales_before_tax,0),2)::numeric(14,2) as amount_before_tax,
      round(coalesce(h.tax_amount,0),2)::numeric(14,2) as tax_amount,
      round(coalesce(h.discount_amount,0),2)::numeric(14,2) as discount_amount,
      round(coalesce(h.sales_inclusive,0),2)::numeric(14,2) as amount_incl_tax,
      ha.installation_team_id as team_id,
      coalesce(ha.team_name_snapshot,'') as team_name,
      h.appointment_car_id as car_id,
      coalesce(ha.car_name_snapshot,hc.name,h.vehicle,'') as car_name,
      coalesce(ha.plate_number_snapshot,hc.plate_number,'') as plate_number,
      true as is_historical,
      coalesce(h.record_type,'invoice_line') as record_type
    from public.appointment_historical_sales_reporting h
    left join public.customers c on c.id=h.customer_id
    left join public.installation_neighborhoods n on n.id=c.neighborhood_id
    left join public.appointment_cars hc on hc.id=h.appointment_car_id
    left join lateral (
      select x.installation_team_id,x.team_name_snapshot,x.car_name_snapshot,x.plate_number_snapshot
      from public.installation_team_assignment_history x
      where h.appointment_car_id is not null
        and x.appointment_car_id=h.appointment_car_id
        and x.effective_from<=h.sales_date
        and (x.effective_to is null or x.effective_to>=h.sales_date)
      order by x.effective_from desc,x.created_at desc
      limit 1
    ) ha on true
    where public.has_screen_permission('salesReports','view')
      and (
        h.customer_id is null
        or c.representative_id is null
        or public.can_access_representative(c.representative_id)
      )
  )
  select * from current_rows
  union all
  select * from historical_rows
  order by invoice_date desc,row_id desc;
$$;

revoke all on function public.sales_reports_rows_r44r38r20r35() from public, anon;
grant execute on function public.sales_reports_rows_r44r38r20r35() to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
