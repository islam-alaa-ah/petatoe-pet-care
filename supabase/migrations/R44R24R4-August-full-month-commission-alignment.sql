-- PETATOE R44R24R4
-- August 2026 full-month team-history correction for commission alignment.
--
-- Confirmed financial truth:
--   Paid August payroll commissions are correct.
--   The live commission report is swapped between the two teams.
--
-- Correct operational assignment for THE ENTIRE MONTH:
--   2026-08-01 .. 2026-08-31
--   VAN A - AXB 2558  => Groomer Roland + Driver Dinmark
--   VAN B - SXB 6066  => Groomer Chris  + Driver Brian Lacia Lucas
--
-- September/current assignment remains untouched.
-- Paid salary statements and locked commission statements are NEVER modified.
-- Appointments, visits and invoices are NEVER rewritten; they keep their existing team_id.
--
-- Run in Supabase SQL Editor as one script.

begin;

do $$
declare
  v_aug_from constant date := date '2026-08-01';
  v_aug_to   constant date := date '2026-08-31';

  -- Known team IDs from the production diagnostic / current screen.
  v_team_b_id constant uuid := '004e92e5-0280-4867-ac2f-8917cf2f4d3a';
  v_team_a_id constant uuid := 'c0a9dec5-45b8-44e6-ab43-03245a54dc32';

  v_team_b public.installation_teams%rowtype;
  v_team_a public.installation_teams%rowtype;

  -- Current September resources (used only to resolve the existing IDs safely).
  v_chris_id uuid;
  v_roland_id uuid;
  v_dinmark_id uuid;
  v_brian_id uuid;
  v_van_b_id uuid;
  v_van_a_id uuid;

  v_chris_name text;
  v_roland_name text;
  v_dinmark_name text;
  v_brian_name text;
  v_van_b_name text;
  v_van_a_name text;
  v_van_b_plate text;
  v_van_a_plate text;

  v_aug_b_count integer;
  v_aug_a_count integer;
  v_aug_b_groomer uuid;
  v_aug_b_driver uuid;
  v_aug_b_car uuid;
  v_aug_a_groomer uuid;
  v_aug_a_driver uuid;
  v_aug_a_car uuid;
begin
  -- Lock the two current team-master rows only while the correction is applied.
  select * into v_team_b
  from public.installation_teams
  where id=v_team_b_id
  for update;

  if not found then
    raise exception 'R44R24R4 aborted: expected VAN B team was not found.';
  end if;

  select * into v_team_a
  from public.installation_teams
  where id=v_team_a_id
  for update;

  if not found then
    raise exception 'R44R24R4 aborted: expected VAN A team was not found.';
  end if;

  -- Current state shown after the September transfer:
  -- VAN B = Chris + Dinmark
  -- VAN A = Roland + Brian
  v_chris_id   := v_team_b.groomer_employee_id;
  v_dinmark_id := v_team_b.driver_employee_id;
  v_van_b_id   := v_team_b.appointment_car_id;

  v_roland_id := v_team_a.groomer_employee_id;
  v_brian_id  := v_team_a.driver_employee_id;
  v_van_a_id  := v_team_a.appointment_car_id;

  if v_chris_id is null or v_dinmark_id is null or v_van_b_id is null
     or v_roland_id is null or v_brian_id is null or v_van_a_id is null then
    raise exception 'R44R24R4 aborted: current team resources are incomplete.';
  end if;

  select ae.full_name into v_chris_name
  from public.appointment_employees ae where ae.id=v_chris_id;

  select ae.full_name into v_roland_name
  from public.appointment_employees ae where ae.id=v_roland_id;

  select ae.full_name into v_dinmark_name
  from public.appointment_employees ae where ae.id=v_dinmark_id;

  select ae.full_name into v_brian_name
  from public.appointment_employees ae where ae.id=v_brian_id;

  select ac.name,ac.plate_number into v_van_b_name,v_van_b_plate
  from public.appointment_cars ac where ac.id=v_van_b_id;

  select ac.name,ac.plate_number into v_van_a_name,v_van_a_plate
  from public.appointment_cars ac where ac.id=v_van_a_id;

  -- Strong production guard: do not touch history if current resources no longer
  -- match the exact teams confirmed in this incident.
  if lower(btrim(coalesce(v_chris_name,''))) <> 'chris'
     or lower(btrim(coalesce(v_roland_name,''))) <> 'roland'
     or lower(btrim(coalesce(v_dinmark_name,''))) <> 'dinmark'
     or lower(btrim(coalesce(v_brian_name,''))) <> 'brian lacia lucas'
     or lower(coalesce(v_van_b_name,'')) not like '%van b%'
     or lower(coalesce(v_van_a_name,'')) not like '%van a%' then
    raise exception
      'R44R24R4 aborted: current Production assignment no longer matches Chris/Dinmark/VAN B and Roland/Brian/VAN A.';
  end if;

  -- Require exactly one closed August segment for each team.
  select count(*) into v_aug_b_count
  from public.installation_team_assignment_history h
  where h.installation_team_id=v_team_b_id
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;

  select count(*) into v_aug_a_count
  from public.installation_team_assignment_history h
  where h.installation_team_id=v_team_a_id
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;

  if v_aug_b_count<>1 or v_aug_a_count<>1 then
    raise exception
      'R44R24R4 aborted: expected one 01-Aug..31-Aug history segment for each team; found VAN B %, VAN A %.',
      v_aug_b_count,v_aug_a_count;
  end if;

  -- Read current August mapping so the script is safe to rerun.
  select h.groomer_employee_id,h.driver_employee_id,h.appointment_car_id
  into v_aug_b_groomer,v_aug_b_driver,v_aug_b_car
  from public.installation_team_assignment_history h
  where h.installation_team_id=v_team_b_id
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;

  select h.groomer_employee_id,h.driver_employee_id,h.appointment_car_id
  into v_aug_a_groomer,v_aug_a_driver,v_aug_a_car
  from public.installation_team_assignment_history h
  where h.installation_team_id=v_team_a_id
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;

  -- Already correct => no destructive rewrite needed.
  if v_aug_b_groomer=v_chris_id
     and v_aug_b_driver=v_brian_id
     and v_aug_b_car=v_van_b_id
     and v_aug_a_groomer=v_roland_id
     and v_aug_a_driver=v_dinmark_id
     and v_aug_a_car=v_van_a_id then
    raise notice 'R44R24R4: August history is already correct; no rewrite performed.';
  else
    -- Accept only the known swapped state created by the previous August hotfix.
    if not (
      v_aug_b_groomer=v_roland_id
      and v_aug_b_driver=v_dinmark_id
      and v_aug_b_car=v_van_b_id
      and v_aug_a_groomer=v_chris_id
      and v_aug_a_driver=v_brian_id
      and v_aug_a_car=v_van_a_id
    ) then
      raise exception
        'R44R24R4 aborted: August history is neither the known swapped state nor the expected corrected state.';
    end if;

    -- Delete BOTH wrong August rows first so the resource-collision guard cannot
    -- see an intermediate duplicate while we swap the employees.
    delete from public.installation_team_assignment_history h
    where h.installation_team_id in (v_team_b_id,v_team_a_id)
      and h.effective_from=v_aug_from
      and h.effective_to=v_aug_to;

    -- Correct August VAN B: Chris + Brian.
    insert into public.installation_team_assignment_history(
      installation_team_id,
      groomer_employee_id,
      driver_employee_id,
      appointment_car_id,
      groomer_name_snapshot,
      driver_name_snapshot,
      car_name_snapshot,
      plate_number_snapshot,
      team_name_snapshot,
      effective_from,
      effective_to,
      source,
      created_by
    ) values (
      v_team_b_id,
      v_chris_id,
      v_brian_id,
      v_van_b_id,
      v_chris_name,
      v_brian_name,
      v_van_b_name,
      v_van_b_plate,
      concat_ws(' - ',v_chris_name,v_brian_name,v_van_b_name),
      v_aug_from,
      v_aug_to,
      'manual_confirmed_august_2026_payroll_alignment',
      auth.uid()
    );

    -- Correct August VAN A: Roland + Dinmark.
    insert into public.installation_team_assignment_history(
      installation_team_id,
      groomer_employee_id,
      driver_employee_id,
      appointment_car_id,
      groomer_name_snapshot,
      driver_name_snapshot,
      car_name_snapshot,
      plate_number_snapshot,
      team_name_snapshot,
      effective_from,
      effective_to,
      source,
      created_by
    ) values (
      v_team_a_id,
      v_roland_id,
      v_dinmark_id,
      v_van_a_id,
      v_roland_name,
      v_dinmark_name,
      v_van_a_name,
      v_van_a_plate,
      concat_ws(' - ',v_roland_name,v_dinmark_name,v_van_a_name),
      v_aug_from,
      v_aug_to,
      'manual_confirmed_august_2026_payroll_alignment',
      auth.uid()
    );
  end if;
end $$;

-- Explicit safety assertions: this hotfix MUST NOT mutate paid/locked finance.
do $$
begin
  -- Deliberately no UPDATE/DELETE statements against these tables.
  -- This block documents the invariant in the transaction itself.
  if to_regclass('public.payroll_salary_statements') is null
     or to_regclass('public.payroll_commission_statements') is null then
    raise exception 'R44R24R4 aborted: payroll tables are missing.';
  end if;
end $$;

notify pgrst,'reload schema';

commit;

-- ============================================================================
-- READ-ONLY VERIFICATION 1 — August assignment timeline
-- Expected:
--   VAN B Aug = Chris + Brian
--   VAN A Aug = Roland + Dinmark
-- September rows remain whatever the current approved September history says.
-- ============================================================================

select
  h.installation_team_id,
  h.effective_from,
  h.effective_to,
  h.groomer_name_snapshot,
  h.driver_name_snapshot,
  h.car_name_snapshot,
  h.source
from public.installation_team_assignment_history h
where h.installation_team_id in (
  '004e92e5-0280-4867-ac2f-8917cf2f4d3a',
  'c0a9dec5-45b8-44e6-ab43-03245a54dc32'
)
  and (h.effective_to is null or h.effective_to>=date '2026-08-01')
order by h.installation_team_id,h.effective_from;

-- ============================================================================
-- READ-ONLY VERIFICATION 2 — 01-Aug..25-Aug
-- This is the period shown in the already-paid August payroll.
-- Expected commissions from the user's paid payroll:
--   Brian   290.01
--   Chris   820.79
--   Dinmark 273.35
--   Roland  773.64
-- delta_vs_paid_salary should be 0.00 for these employees if their salary
-- statement commission period is 01-Aug..25-Aug as shown/confirmed.
-- ============================================================================

with invoice_assignment as (
  select
    b.installation_team_id,
    b.invoice_date,
    b.eligible_sales_before_vat,
    h.appointment_car_id,
    h.car_name_snapshot as car_name,
    h.groomer_employee_id,
    h.driver_employee_id
  from public.payroll_commission_invoice_base b
  join public.installation_team_assignment_history h
    on h.installation_team_id=b.installation_team_id
   and h.effective_from<=b.invoice_date
   and (h.effective_to is null or h.effective_to>=b.invoice_date)
  where b.invoice_date between date '2026-08-01' and date '2026-08-25'
),
role_sales as (
  select
    ia.installation_team_id,
    ia.appointment_car_id,
    ia.car_name,
    ia.groomer_employee_id as appointment_employee_id,
    'groomer'::text as commission_role,
    round(sum(ia.eligible_sales_before_vat),2) as eligible_sales
  from invoice_assignment ia
  where ia.groomer_employee_id is not null
  group by ia.installation_team_id,ia.appointment_car_id,ia.car_name,ia.groomer_employee_id

  union all

  select
    ia.installation_team_id,
    ia.appointment_car_id,
    ia.car_name,
    ia.driver_employee_id,
    'driver'::text,
    round(sum(ia.eligible_sales_before_vat),2)
  from invoice_assignment ia
  where ia.driver_employee_id is not null
  group by ia.installation_team_id,ia.appointment_car_id,ia.car_name,ia.driver_employee_id
),
calc as (
  select
    rs.*,
    pe.id as payroll_employee_id,
    pe.full_name as employee_name,
    case
      when pe.id is not null and pe.commission_eligible
      then coalesce(
        (public.payroll_calc_progressive_commission(
          rs.commission_role,
          rs.eligible_sales
        )->>'total')::numeric,
        0
      )
      else 0
    end as live_commission
  from role_sales rs
  left join public.payroll_employees pe
    on pe.appointment_employee_id=rs.appointment_employee_id
   and pe.commission_role=rs.commission_role
   and pe.is_active
)
select
  c.car_name,
  c.employee_name,
  c.commission_role,
  c.eligible_sales,
  round(c.live_commission,2) as live_commission_01_25,
  s.commissions_snapshot as paid_salary_commission,
  s.commission_period_from,
  s.commission_period_to,
  s.status as salary_status,
  round(c.live_commission-coalesce(s.commissions_snapshot,0),2) as delta_vs_paid_salary
from calc c
left join public.payroll_salary_statements s
  on s.payroll_month=date '2026-08-01'
 and s.employee_id=c.payroll_employee_id
where lower(coalesce(c.employee_name,'')) in (
  'brian lacia lucas','chris','dinmark','roland'
)
order by c.car_name,c.commission_role,c.employee_name;

-- ============================================================================
-- READ-ONLY VERIFICATION 3 — FULL MONTH 01-Aug..31-Aug
-- This is the authoritative live commission preview for the whole August month.
-- The same August assignment must be used for all six remaining days 26..31.
-- ============================================================================

with invoice_assignment as (
  select
    b.installation_team_id,
    b.invoice_date,
    b.eligible_sales_before_vat,
    h.appointment_car_id,
    h.car_name_snapshot as car_name,
    h.groomer_employee_id,
    h.driver_employee_id
  from public.payroll_commission_invoice_base b
  join public.installation_team_assignment_history h
    on h.installation_team_id=b.installation_team_id
   and h.effective_from<=b.invoice_date
   and (h.effective_to is null or h.effective_to>=b.invoice_date)
  where b.invoice_date between date '2026-08-01' and date '2026-08-31'
),
role_sales as (
  select
    ia.appointment_car_id,
    ia.car_name,
    ia.groomer_employee_id as appointment_employee_id,
    'groomer'::text as commission_role,
    round(sum(ia.eligible_sales_before_vat),2) as eligible_sales
  from invoice_assignment ia
  where ia.groomer_employee_id is not null
  group by ia.appointment_car_id,ia.car_name,ia.groomer_employee_id

  union all

  select
    ia.appointment_car_id,
    ia.car_name,
    ia.driver_employee_id,
    'driver'::text,
    round(sum(ia.eligible_sales_before_vat),2)
  from invoice_assignment ia
  where ia.driver_employee_id is not null
  group by ia.appointment_car_id,ia.car_name,ia.driver_employee_id
)
select
  rs.car_name,
  pe.full_name as employee_name,
  rs.commission_role,
  rs.eligible_sales,
  round(
    case
      when pe.id is not null and pe.commission_eligible
      then coalesce(
        (public.payroll_calc_progressive_commission(
          rs.commission_role,
          rs.eligible_sales
        )->>'total')::numeric,
        0
      )
      else 0
    end
  ,2) as full_august_commission
from role_sales rs
left join public.payroll_employees pe
  on pe.appointment_employee_id=rs.appointment_employee_id
 and pe.commission_role=rs.commission_role
 and pe.is_active
where lower(coalesce(pe.full_name,'')) in (
  'brian lacia lucas','chris','dinmark','roland'
)
order by rs.car_name,rs.commission_role,pe.full_name;

select
  'R44R24R4_APPLIED' as status,
  'August 2026 full-month history aligned to paid payroll truth; paid/locked finance untouched.' as details;
