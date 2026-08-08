-- Customer Management v1.0 — Phase 4
-- Reporting views for dashboard and representative performance.
-- Run after Phase 1, Phase 2 and Phase 3 SQL files.

create or replace view public.representative_performance_report as
select
  r.id as representative_id,
  r.representative_code,
  r.full_name as representative_name,
  count(distinct c.id) as customer_count,
  count(distinct f.id) as followup_count,
  count(distinct q.id) as quotation_count,
  coalesce(sum(distinct q.amount), 0)::numeric(14,2) as quotation_value,
  count(distinct q.id) filter (where q.status = 'مقبول') as accepted_quotation_count,
  count(distinct q.id) filter (where q.status = 'مرفوض') as rejected_quotation_count,
  case
    when count(distinct q.id) = 0 then 0
    else round(
      count(distinct q.id) filter (where q.status = 'مقبول')::numeric
      / count(distinct q.id)::numeric * 100,
      2
    )
  end as conversion_rate
from public.sales_representatives r
left join public.customers c on c.representative_id = r.id
left join public.customer_followups f on f.representative_id = r.id
left join public.quotations q on q.representative_id = r.id
group by r.id, r.representative_code, r.full_name;

create or replace view public.customer_interest_report as
select
  ic.id as interest_category_id,
  ic.name as interest_name,
  count(ci.customer_id) as customer_count
from public.interest_categories ic
left join public.customer_interests ci
  on ci.interest_category_id = ic.id
group by ic.id, ic.name;

create or replace view public.quotation_status_report as
select
  status,
  count(*) as quotation_count,
  coalesce(sum(amount), 0)::numeric(14,2) as total_amount
from public.quotations
group by status;

create or replace view public.no_sale_reason_report as
select
  nr.id as reason_id,
  nr.name as reason_name,
  count(distinct c.id) as customer_count,
  count(distinct q.id) as rejected_quotation_count
from public.no_sale_reasons nr
left join public.customers c on c.no_sale_reason_id = nr.id
left join public.quotations q
  on q.rejection_reason_id = nr.id
 and q.status = 'مرفوض'
group by nr.id, nr.name;

create or replace view public.daily_activity_report as
with activity_dates as (
  select last_contact_date as activity_date from public.customers where last_contact_date is not null
  union
  select contact_date from public.customer_followups
  union
  select quotation_date from public.quotations
)
select
  d.activity_date,
  (select count(*) from public.customers c where c.last_contact_date = d.activity_date) as customer_count,
  (select count(*) from public.customer_followups f where f.contact_date = d.activity_date) as followup_count,
  (select count(*) from public.quotations q where q.quotation_date = d.activity_date) as quotation_count
from activity_dates d
order by d.activity_date desc;
