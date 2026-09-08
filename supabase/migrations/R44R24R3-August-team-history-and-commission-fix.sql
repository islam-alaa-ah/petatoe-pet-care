-- PETATOE R44R24R3
-- August 2026 confirmed team-history recovery + commission SQL ambiguity fix
--
-- CONFIRMED BUSINESS HISTORY FROM USER:
--   2026-08-01 .. 2026-08-31
--   Team 004e92e5-0280-4867-ac2f-8917cf2f4d3a (VAN B - SXB 6066):
--       Groomer = Roland
--       Driver  = Dinmark
--   Team c0a9dec5-45b8-44e6-ab43-03245a54dc32 (VAN A - AXB 2558):
--       Groomer = chris
--       Driver  = Brian Lacia Lucas
--
--   From 2026-09-01 forward, the current installation_teams assignments are authoritative.
--
-- This script:
--   1) Rebuilds ONLY the two confirmed team timelines from 2026-08-01 forward.
--   2) Preserves anything before 2026-08-01 unchanged.
--   3) Does NOT rewrite appointments/visits/invoices manually.
--      Their existing installation_team_id remains the source link.
--   4) Fixes payroll_live_commission_rows_range() ambiguity by fully qualifying CTE columns.
--   5) Does NOT overwrite locked commission statements.
--   6) Does NOT widen RLS/GRANTs or touch offline/pruning.

begin;

-- ============================================================================
-- A. Recover the confirmed August team assignment history
-- ============================================================================

do $$
declare
  v_aug_from constant date := date '2026-08-01';
  v_aug_to   constant date := date '2026-08-31';
  v_sep_from constant date := date '2026-09-01';

  v_team_b_id constant uuid := '004e92e5-0280-4867-ac2f-8917cf2f4d3a';
  v_team_a_id constant uuid := 'c0a9dec5-45b8-44e6-ab43-03245a54dc32';

  v_team_b public.installation_teams%rowtype;
  v_team_a public.installation_teams%rowtype;

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
begin
  select * into v_team_b
  from public.installation_teams
  where id = v_team_b_id
  for update;

  if not found then
    raise exception 'لم يتم العثور على فريق VAN B المتوقع: %', v_team_b_id;
  end if;

  select * into v_team_a
  from public.installation_teams
  where id = v_team_a_id
  for update;

  if not found then
    raise exception 'لم يتم العثور على فريق VAN A المتوقع: %', v_team_a_id;
  end if;

  -- Current September assignments as shown/confirmed:
  v_chris_id   := v_team_b.groomer_employee_id;
  v_dinmark_id := v_team_b.driver_employee_id;
  v_van_b_id   := v_team_b.appointment_car_id;

  v_roland_id := v_team_a.groomer_employee_id;
  v_brian_id  := v_team_a.driver_employee_id;
  v_van_a_id  := v_team_a.appointment_car_id;

  if v_chris_id is null or v_dinmark_id is null or v_van_b_id is null
     or v_roland_id is null or v_brian_id is null or v_van_a_id is null then
    raise exception 'بيانات الربط الحالية غير مكتملة؛ تم إيقاف التصحيح قبل أي تعديل.';
  end if;

  select full_name into v_chris_name
  from public.appointment_employees where id=v_chris_id;

  select full_name into v_roland_name
  from public.appointment_employees where id=v_roland_id;

  select full_name into v_dinmark_name
  from public.appointment_employees where id=v_dinmark_id;

  select full_name into v_brian_name
  from public.appointment_employees where id=v_brian_id;

  select name,plate_number into v_van_b_name,v_van_b_plate
  from public.appointment_cars where id=v_van_b_id;

  select name,plate_number into v_van_a_name,v_van_a_plate
  from public.appointment_cars where id=v_van_a_id;

  -- Safety: abort if Production no longer matches the two current teams shown by the user.
  if lower(btrim(coalesce(v_chris_name,''))) <> 'chris'
     or lower(btrim(coalesce(v_roland_name,''))) <> 'roland'
     or lower(btrim(coalesce(v_dinmark_name,''))) <> 'dinmark'
     or lower(btrim(coalesce(v_brian_name,''))) <> 'brian lacia lucas'
     or lower(coalesce(v_van_b_name,'')) not like '%van b%'
     or lower(coalesce(v_van_a_name,'')) not like '%van a%' then
    raise exception
      'الحالة الحالية لا تطابق الربط المؤكد (Chris/Dinmark/VAN B و Roland/Brian/VAN A). تم الإيقاف بدون تعديل.';
  end if;

  -- Preserve all history before August exactly as it is.
  update public.installation_team_assignment_history h
  set effective_to = v_aug_from - 1
  where h.installation_team_id in (v_team_b_id,v_team_a_id)
    and h.effective_from < v_aug_from
    and (h.effective_to is null or h.effective_to >= v_aug_from);

  -- Remove only the existing/recovered timeline from August onward for these two teams.
  -- It is replaced below with the user-confirmed August history + current Sep assignment.
  delete from public.installation_team_assignment_history h
  where h.installation_team_id in (v_team_b_id,v_team_a_id)
    and h.effective_from >= v_aug_from;

  -- AUGUST CONFIRMED HISTORY:
  -- VAN B = Roland + Dinmark
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
    v_roland_id,
    v_dinmark_id,
    v_van_b_id,
    v_roland_name,
    v_dinmark_name,
    v_van_b_name,
    v_van_b_plate,
    concat_ws(' - ',v_roland_name,v_dinmark_name,v_van_b_name),
    v_aug_from,
    v_aug_to,
    'manual_confirmed_august_2026',
    auth.uid()
  );

  -- AUGUST CONFIRMED HISTORY:
  -- VAN A = chris + Brian Lacia Lucas
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
    v_chris_id,
    v_brian_id,
    v_van_a_id,
    v_chris_name,
    v_brian_name,
    v_van_a_name,
    v_van_a_plate,
    concat_ws(' - ',v_chris_name,v_brian_name,v_van_a_name),
    v_aug_from,
    v_aug_to,
    'manual_confirmed_august_2026',
    auth.uid()
  );

  -- SEPTEMBER CURRENT HISTORY:
  -- Make the CURRENT installation_teams state effective from 2026-09-01,
  -- correcting the accidental 2026-09-08 start date.
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
    v_dinmark_id,
    v_van_b_id,
    v_chris_name,
    v_dinmark_name,
    v_van_b_name,
    v_van_b_plate,
    concat_ws(' - ',v_chris_name,v_dinmark_name,v_van_b_name),
    v_sep_from,
    null,
    'manual_corrected_sep_2026_current',
    auth.uid()
  );

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
    v_brian_id,
    v_van_a_id,
    v_roland_name,
    v_brian_name,
    v_van_a_name,
    v_van_a_plate,
    concat_ws(' - ',v_roland_name,v_brian_name,v_van_a_name),
    v_sep_from,
    null,
    'manual_corrected_sep_2026_current',
    auth.uid()
  );
end $$;

-- ============================================================================
-- B. Fix commission report SQL ambiguity introduced in R44R21
-- ============================================================================

create or replace function public.payroll_live_commission_rows_range(p_from date,p_to date)
returns table(
  payroll_month date,
  installation_team_id uuid,
  team_name text,
  appointment_car_id uuid,
  car_name text,
  plate_number text,
  employee_id uuid,
  employee_name text,
  commission_role text,
  eligible_sales numeric,
  commission_amount numeric,
  tier_breakdown jsonb,
  linked boolean,
  commission_eligible boolean
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_from date:=p_from;
  v_to date:=p_to;
  v_month date;
begin
  if v_from is null or v_to is null or v_from>v_to then
    raise exception 'يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.';
  end if;

  v_month:=public.payroll_month_start(v_from);

  return query
  with invoice_assignment as (
    select
      b.installation_team_id,
      b.invoice_date,
      b.representative_id,
      b.eligible_sales_before_vat,
      a.appointment_car_id,
      coalesce(a.car_name,'غير محدد') as car_name,
      a.plate_number,
      a.team_name,
      a.groomer_employee_id,
      a.driver_employee_id,
      a.groomer_name,
      a.driver_name
    from public.payroll_commission_invoice_base b
    left join lateral public.installation_team_assignment_at(
      b.installation_team_id,
      b.invoice_date
    ) a on true
    where b.invoice_date between v_from and v_to
  ),
  groomer_sales as (
    select
      ia.installation_team_id,
      ia.appointment_car_id,
      max(ia.car_name) as car_name,
      max(ia.plate_number) as plate_number,
      max(ia.team_name) as team_name,
      ia.groomer_employee_id,
      max(ia.groomer_name) as source_name,
      round(sum(ia.eligible_sales_before_vat),2) as sales
    from invoice_assignment ia
    where ia.groomer_employee_id is not null
    group by
      ia.installation_team_id,
      ia.appointment_car_id,
      ia.groomer_employee_id
  ),
  driver_sales as (
    select
      ia.installation_team_id,
      ia.appointment_car_id,
      max(ia.car_name) as car_name,
      max(ia.plate_number) as plate_number,
      max(ia.team_name) as team_name,
      ia.driver_employee_id,
      max(ia.driver_name) as source_name,
      round(sum(ia.eligible_sales_before_vat),2) as sales
    from invoice_assignment ia
    where ia.driver_employee_id is not null
    group by
      ia.installation_team_id,
      ia.appointment_car_id,
      ia.driver_employee_id
  ),
  rep_sales as (
    select
      ia.installation_team_id,
      ia.appointment_car_id,
      max(ia.car_name) as car_name,
      max(ia.plate_number) as plate_number,
      max(ia.team_name) as team_name,
      ia.representative_id,
      round(sum(ia.eligible_sales_before_vat),2) as sales
    from invoice_assignment ia
    where ia.representative_id is not null
    group by
      ia.installation_team_id,
      ia.appointment_car_id,
      ia.representative_id
  ),
  roles as (
    select
      gs.installation_team_id,
      gs.team_name,
      gs.appointment_car_id,
      gs.car_name,
      gs.plate_number,
      pe.id as employee_id,
      coalesce(pe.full_name,ae.full_name,gs.source_name,'غير مربوط') as employee_name,
      'groomer'::text as commission_role,
      gs.sales,
      (pe.id is not null) as linked,
      coalesce(pe.commission_eligible,false) as commission_eligible
    from groomer_sales gs
    left join public.appointment_employees ae
      on ae.id=gs.groomer_employee_id
    left join public.payroll_employees pe
      on pe.appointment_employee_id=gs.groomer_employee_id
     and pe.commission_role='groomer'
     and pe.is_active

    union all

    select
      ds.installation_team_id,
      ds.team_name,
      ds.appointment_car_id,
      ds.car_name,
      ds.plate_number,
      pe.id as employee_id,
      coalesce(pe.full_name,ae.full_name,ds.source_name,'غير مربوط') as employee_name,
      'driver'::text as commission_role,
      ds.sales,
      (pe.id is not null) as linked,
      coalesce(pe.commission_eligible,false) as commission_eligible
    from driver_sales ds
    left join public.appointment_employees ae
      on ae.id=ds.driver_employee_id
    left join public.payroll_employees pe
      on pe.appointment_employee_id=ds.driver_employee_id
     and pe.commission_role='driver'
     and pe.is_active

    union all

    select
      rs.installation_team_id,
      rs.team_name,
      rs.appointment_car_id,
      rs.car_name,
      rs.plate_number,
      pe.id as employee_id,
      coalesce(pe.full_name,sr.full_name,'غير مربوط') as employee_name,
      'representative'::text as commission_role,
      rs.sales,
      (pe.id is not null) as linked,
      coalesce(pe.commission_eligible,false) as commission_eligible
    from rep_sales rs
    left join public.sales_representatives sr
      on sr.id=rs.representative_id
    left join public.payroll_employees pe
      on pe.representative_id=rs.representative_id
     and pe.commission_role='representative'
     and pe.is_active
  ),
  calc as (
    select
      r.*,
      public.payroll_calc_progressive_commission(
        r.commission_role,
        r.sales
      ) as calc
    from roles r
  )
  select
    v_month,
    c.installation_team_id,
    c.team_name,
    c.appointment_car_id,
    c.car_name,
    c.plate_number,
    c.employee_id,
    c.employee_name,
    c.commission_role,
    round(c.sales,2),
    case
      when c.linked and c.commission_eligible
      then coalesce((c.calc->>'total')::numeric,0)
      else 0
    end,
    case
      when c.linked and c.commission_eligible
      then coalesce(c.calc->'breakdown','[]'::jsonb)
      else '[]'::jsonb
    end,
    c.linked,
    c.commission_eligible
  from calc c
  where public.has_screen_permission('commissionManagement','view')
     or public.has_screen_permission('payrollManagement','add')
     or public.has_screen_permission('payrollManagement','edit')
     or (
       c.employee_id is not null
       and exists(
         select 1
         from public.payroll_employees own
         where own.id=c.employee_id
           and own.user_id=auth.uid()
       )
     )
  order by
    c.car_name,
    case c.commission_role
      when 'representative' then 1
      when 'driver' then 2
      else 3
    end,
    c.employee_name;
end;
$$;

revoke all on function public.payroll_live_commission_rows_range(date,date)
from public,anon;

grant execute on function public.payroll_live_commission_rows_range(date,date)
to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- ============================================================================
-- READ-ONLY VERIFICATION
-- ============================================================================

-- 1) The expected timeline must show:
--    Aug: VAN B = Roland/Dinmark; VAN A = chris/Brian
--    Sep: VAN B = chris/Dinmark; VAN A = Roland/Brian
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
  and (
    h.effective_to is null
    or h.effective_to >= date '2026-07-01'
  )
order by h.installation_team_id,h.effective_from;

-- 2) Confirm August appointments/visits still point to the same team IDs.
select
  coalesce(v.installation_team_id,r.installation_team_id) as installation_team_id,
  count(*) as august_visits,
  min(coalesce(v.scheduled_date,r.scheduled_date)) as first_date,
  max(coalesce(v.scheduled_date,r.scheduled_date)) as last_date
from public.installation_requests r
left join public.installation_execution_visits v
  on v.installation_request_id=r.id
where coalesce(v.scheduled_date,r.scheduled_date)
      between date '2026-08-01' and date '2026-08-31'
  and coalesce(v.installation_team_id,r.installation_team_id) in (
    '004e92e5-0280-4867-ac2f-8917cf2f4d3a',
    'c0a9dec5-45b8-44e6-ab43-03245a54dc32'
  )
group by coalesce(v.installation_team_id,r.installation_team_id)
order by installation_team_id;

-- 3) IMPORTANT: if locked_count > 0, do NOT manually delete/overwrite those rows.
--    Send this result back before changing locked payroll history.
select
  count(*) filter (where pcs.is_locked) as locked_count,
  count(*) filter (where not pcs.is_locked) as unlocked_count
from public.payroll_commission_statements pcs
where pcs.payroll_month=date '2026-08-01';

select 'R44R24R3_APPLIED' as status;
