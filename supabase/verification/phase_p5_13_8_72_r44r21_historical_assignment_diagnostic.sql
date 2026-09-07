-- P5.13.8.72 R44R21 — READ-ONLY historical assignment diagnostic
-- Purpose: identify pre-migration evidence that can support a controlled historical backfill.
-- This file performs SELECT statements only. It must not be used to guess missing driver/car history.

-- 1) Current baseline segments created by R44R21.
select
  h.installation_team_id,
  h.team_name_snapshot,
  h.groomer_employee_id,
  h.groomer_name_snapshot,
  h.driver_employee_id,
  h.driver_name_snapshot,
  h.appointment_car_id,
  h.car_name_snapshot,
  h.effective_from,
  h.effective_to,
  h.source,
  h.created_at
from public.installation_team_assignment_history h
order by h.installation_team_id,h.effective_from,h.created_at;

-- 2) Strong groomer evidence: a stored execution-visit technician differs from the baseline-current groomer.
-- These rows are candidates for review; they are NOT automatically backfilled.
select
  'VISIT_GROOMER_EVIDENCE'::text evidence_type,
  v.installation_team_id,
  v.id visit_id,
  v.installation_request_id,
  v.scheduled_date business_date,
  v.technician_name stored_groomer_name,
  h.groomer_name_snapshot baseline_groomer_name,
  h.driver_name_snapshot baseline_driver_name,
  h.car_name_snapshot baseline_car_name
from public.installation_execution_visits v
join public.installation_team_assignment_history h
  on h.installation_team_id=v.installation_team_id
 and h.source='baseline_current'
where nullif(btrim(v.technician_name),'') is not null
  and lower(regexp_replace(btrim(v.technician_name),'\s+',' ','g'))
      <> lower(regexp_replace(btrim(coalesce(h.groomer_name_snapshot,'')),'\s+',' ','g'))
order by v.scheduled_date,v.installation_team_id,v.id;

-- 3) Strong vehicle evidence: a persisted commission statement carries a different car from baseline-current.
select
  'COMMISSION_CAR_EVIDENCE'::text evidence_type,
  c.installation_team_id,
  c.payroll_month business_month,
  c.employee_id,
  c.commission_role,
  c.appointment_car_id stored_car_id,
  ac.name stored_car_name,
  h.appointment_car_id baseline_car_id,
  h.car_name_snapshot baseline_car_name,
  c.eligible_sales,
  c.commission_amount,
  c.is_locked
from public.payroll_commission_statements c
join public.installation_team_assignment_history h
  on h.installation_team_id=c.installation_team_id
 and h.source='baseline_current'
left join public.appointment_cars ac on ac.id=c.appointment_car_id
where c.appointment_car_id is not null
  and c.appointment_car_id is distinct from h.appointment_car_id
order by c.payroll_month,c.installation_team_id,c.employee_id;

-- 4) Explicit reschedule audit evidence already captured by the appointment workflow.
select
  'RESCHEDULE_EVIDENCE'::text evidence_type,
  e.installation_request_id,
  e.previous_team_id installation_team_id,
  e.previous_team_name,
  e.previous_groomer_name,
  e.previous_driver_name,
  e.created_at evidence_time
from public.installation_reschedule_events e
where e.previous_team_id is not null
order by e.created_at,e.installation_request_id;

-- Interpretation:
-- * Recoverable 100%: explicit IDs/snapshots establish the historical assignment without contradiction.
-- * Recoverable with evidence: names/dates strongly indicate the old assignment but an ID is missing.
-- * Unknown: no authoritative evidence exists; requires manual confirmation before any backfill.
