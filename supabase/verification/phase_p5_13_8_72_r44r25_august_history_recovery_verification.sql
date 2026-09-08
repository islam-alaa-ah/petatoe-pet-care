-- R44R25 — READ-ONLY Production verification
-- Run after the R44R25 migration. No writes.

-- 1) The three historical invoices must resolve to the PDF-confirmed teams.
with target as (
  select * from (values
    ('101342'::text,'Roland'::text,'Dinmark'::text,'SXB6066'::text),
    ('101343'::text,'Chris'::text,'Brian Lacia Lucas'::text,'AXB2558'::text),
    ('101344'::text,'Roland'::text,'Dinmark'::text,'SXB6066'::text)
  ) x(invoice_number,expected_groomer,expected_driver,expected_plate)
), raw as (
  select
    t.*,
    si.invoice_date,
    coalesce(v.installation_team_id,r.installation_team_id) stored_team_id
  from target t
  left join public.sales_invoices si on btrim(si.invoice_number)=t.invoice_number and si.status<>'ملغاة'
  left join public.sales_invoices ref_si on ref_si.id=si.reference_sales_invoice_id and ref_si.source_type='installation' and ref_si.status<>'ملغاة'
  left join public.installation_execution_visits v on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
  left join public.installation_requests r on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
)
select
  raw.invoice_number,
  raw.invoice_date,
  raw.stored_team_id,
  a.groomer_name,
  a.driver_name,
  a.car_name,
  a.plate_number,
  raw.expected_groomer,
  raw.expected_driver,
  raw.expected_plate,
  case when lower(btrim(coalesce(a.groomer_name,'')))=lower(raw.expected_groomer)
         and lower(btrim(coalesce(a.driver_name,'')))=lower(raw.expected_driver)
         and upper(regexp_replace(coalesce(a.plate_number,''),'[^A-Z0-9]','','g'))=raw.expected_plate
       then 'PASS' else 'FAIL' end result
from raw
left join lateral public.installation_team_assignment_at(raw.stored_team_id,raw.invoice_date) a on true
order by raw.invoice_number;

-- 2) Full August timeline for the two invoice-derived teams.
with team_ids as (
  select distinct coalesce(v.installation_team_id,r.installation_team_id) team_id
  from public.sales_invoices si
  left join public.sales_invoices ref_si on ref_si.id=si.reference_sales_invoice_id and ref_si.source_type='installation' and ref_si.status<>'ملغاة'
  left join public.installation_execution_visits v on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
  left join public.installation_requests r on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
  where btrim(si.invoice_number) in ('101342','101343','101344')
)
select h.installation_team_id,h.effective_from,h.effective_to,
       h.groomer_name_snapshot,h.driver_name_snapshot,h.car_name_snapshot,h.plate_number_snapshot,h.source
from public.installation_team_assignment_history h
join team_ids t on t.team_id=h.installation_team_id
where h.effective_to is null or h.effective_to>=date '2026-08-01'
order by h.installation_team_id,h.effective_from;

-- 3) Paid period comparison. These are read-only live values; paid payroll is not altered.
select car_name,employee_name,commission_role,eligible_sales,commission_amount
from public.payroll_live_commission_rows_range(date '2026-08-01',date '2026-08-25')
where lower(coalesce(employee_name,'')) in ('brian lacia lucas','chris','dinmark','roland')
order by car_name,commission_role,employee_name;

-- 4) Full-month August preview: same team assignments must remain through 31-Aug.
select car_name,employee_name,commission_role,eligible_sales,commission_amount
from public.payroll_live_commission_rows_range(date '2026-08-01',date '2026-08-31')
where lower(coalesce(employee_name,'')) in ('brian lacia lucas','chris','dinmark','roland')
order by car_name,commission_role,employee_name;

-- 5) Confirm paid/locked payroll remains present and untouched by the migration.
select
  count(*) filter(where s.status='تم الصرف') as paid_salary_rows,
  count(*) filter(where c.is_locked) as locked_commission_rows
from public.payroll_salary_statements s
left join public.payroll_commission_statements c
  on c.payroll_month=s.payroll_month and c.employee_id=s.employee_id
where s.payroll_month=date '2026-08-01';

select 'R44R25_VERIFICATION_COMPLETE' status;
