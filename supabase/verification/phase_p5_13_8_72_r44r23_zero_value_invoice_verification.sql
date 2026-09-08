-- R44R23 read-only verification — zero-value executed service invoices
-- Run AFTER phase_p5_13_8_72_r44r23_zero_value_executed_service_invoice.sql.
-- This file performs SELECTs only.

-- 1) Canonical function must contain the quantity gate and must not contain the old amount gate.
select
  position('has_executed_quantity' in pg_get_functiondef('public.get_installation_execution_group_invoice_financials(uuid,uuid)'::regprocedure)) > 0
    as has_quantity_gate,
  position('لا توجد كمية منفذة بقيمة قابلة للفوترة في مجموعة التنفيذ' in pg_get_functiondef('public.get_installation_execution_group_invoice_financials(uuid,uuid)'::regprocedure)) = 0
    as old_amount_gate_removed;

-- 2) sales_invoices must continue to allow a zero invoice_amount.
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.sales_invoices'::regclass
  and contype='c'
  and pg_get_constraintdef(oid) ilike '%invoice_amount%';

-- 3) Show confirmed execution groups that have a genuinely executed quantity and resolve to SAR 0.00.
-- These are valid free/fully-discounted invoice candidates after R44R23.
with anchors as (
  select distinct on (v.installation_request_id,v.installation_team_id,v.scheduled_date)
    v.installation_request_id,
    v.id as anchor_visit_id,
    v.installation_team_id,
    v.scheduled_date
  from public.installation_execution_visits v
  where v.status='مؤكدة' and v.confirmed_at is not null
  order by v.installation_request_id,v.installation_team_id,v.scheduled_date,v.visit_no,v.id
), resolved as (
  select
    a.*,
    coalesce((
      select sum(greatest(coalesce(vs.executed_quantity,0),0))
      from public.installation_execution_visit_services vs
      where vs.visit_id=any(public.get_installation_execution_group_visit_ids(a.installation_request_id,a.anchor_visit_id))
    ),0) as executed_quantity
  from anchors a
)
select
  r.installation_request_id,
  r.anchor_visit_id,
  r.scheduled_date,
  r.executed_quantity,
  f.invoice_amount,
  f.final_amount_including_tax,
  f.installation_cost
from resolved r
cross join lateral public.get_installation_execution_group_invoice_financials(r.installation_request_id,r.anchor_visit_id) f
where r.executed_quantity>0
  and f.final_amount_including_tax=0
order by r.scheduled_date desc,r.installation_request_id;

-- 4) Diagnostic only: confirmed groups with no executed quantity remain invalid and must NOT be invoiced.
with anchors as (
  select distinct on (v.installation_request_id,v.installation_team_id,v.scheduled_date)
    v.installation_request_id,
    v.id as anchor_visit_id,
    v.installation_team_id,
    v.scheduled_date
  from public.installation_execution_visits v
  where v.status='مؤكدة' and v.confirmed_at is not null
  order by v.installation_request_id,v.installation_team_id,v.scheduled_date,v.visit_no,v.id
)
select
  a.installation_request_id,
  a.anchor_visit_id,
  a.scheduled_date,
  coalesce((
    select sum(greatest(coalesce(vs.executed_quantity,0),0))
    from public.installation_execution_visit_services vs
    where vs.visit_id=any(public.get_installation_execution_group_visit_ids(a.installation_request_id,a.anchor_visit_id))
  ),0) as executed_quantity
from anchors a
where coalesce((
  select sum(greatest(coalesce(vs.executed_quantity,0),0))
  from public.installation_execution_visit_services vs
  where vs.visit_id=any(public.get_installation_execution_group_visit_ids(a.installation_request_id,a.anchor_visit_id))
),0)<=0
order by a.scheduled_date desc,a.installation_request_id;
