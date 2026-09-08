-- P5.13.8.72 R44R25 — August 2026 historical team recovery + mandatory effective date
--
-- Business evidence supplied by the user from the original August PDF:
--   invoice 101343 => Chris + Brian Lacia Lucas + VAN A - AXB 2558
--   invoice 101342 => Roland + Dinmark          + VAN B - SXB 6066
--   invoice 101344 => Roland + Dinmark          + VAN B - SXB 6066
--
-- Scope:
--   1) Correct the FULL August window 2026-08-01..2026-08-31 from RAW invoice team IDs.
--   2) Do not rewrite invoices, requests, visits, paid salaries, or locked commissions.
--   3) Preserve September/current assignment history exactly as-is.
--   4) Require an explicit effective date in the canonical team-save RPC (no current_date fallback).
--   5) Consolidate the Super Admin existing-team resource override into the canonical DB guard,
--      while keeping new-team collision protection and same-team history overlap protection.
--
-- This migration is intentionally guarded. If Production invoice lineage does not match the
-- three historical invoices above, it aborts before changing August history.

begin;

-- --------------------------------------------------------------------------
-- A. Canonical role-aware current-team resource guard.
--    Static UNIQUE indexes cannot express the approved Super Admin edit-only override.
-- --------------------------------------------------------------------------
drop index if exists public.uq_installation_teams_active_groomer;
drop index if exists public.uq_installation_teams_active_driver;
drop index if exists public.uq_installation_teams_active_car;

create or replace function public.guard_installation_teams_active_resource_conflict()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_is_super_admin boolean:=false;
  v_super_admin_existing_team_override boolean:=false;
begin
  select exists(
    select 1
    from public.user_profiles up
    where up.id=auth.uid()
      and coalesce(up.is_active,true)=true
      and up.role='super_admin'::public.app_role
  ) into v_is_super_admin;

  v_super_admin_existing_team_override := (tg_op='UPDATE') and v_is_super_admin;

  if coalesce(new.status,'')<>'غير نشطة' and not v_super_admin_existing_team_override then
    if new.groomer_employee_id is not null and exists(
      select 1 from public.installation_teams t
      where t.id is distinct from new.id
        and t.status<>'غير نشطة'
        and t.groomer_employee_id=new.groomer_employee_id
    ) then
      raise exception 'الجرومر مرتبط بالفعل بفريق موعد نشط آخر' using errcode='23505';
    end if;

    if new.driver_employee_id is not null and exists(
      select 1 from public.installation_teams t
      where t.id is distinct from new.id
        and t.status<>'غير نشطة'
        and t.driver_employee_id=new.driver_employee_id
    ) then
      raise exception 'السائق مرتبط بالفعل بفريق موعد نشط آخر' using errcode='23505';
    end if;

    if new.appointment_car_id is not null and exists(
      select 1 from public.installation_teams t
      where t.id is distinct from new.id
        and t.status<>'غير نشطة'
        and t.appointment_car_id=new.appointment_car_id
    ) then
      raise exception 'السيارة مرتبطة بالفعل بفريق موعد نشط آخر' using errcode='23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_installation_teams_active_resource_conflict on public.installation_teams;
create trigger trg_guard_installation_teams_active_resource_conflict
before insert or update on public.installation_teams
for each row execute function public.guard_installation_teams_active_resource_conflict();

-- --------------------------------------------------------------------------
-- B. Canonical historical overlap/resource guard.
--    Super Admin may correct an existing team, but same-team periods never overlap.
-- --------------------------------------------------------------------------
create or replace function public.guard_installation_team_assignment_history_overlap()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_to date:=coalesce(new.effective_to,'infinity'::date);
  v_closing_existing boolean:=false;
  v_is_super_admin boolean:=false;
  v_super_admin_existing_team_override boolean:=false;
begin
  select exists(
    select 1
    from public.user_profiles up
    where up.id=auth.uid()
      and coalesce(up.is_active,true)=true
      and up.role='super_admin'::public.app_role
  ) into v_is_super_admin;

  if tg_op='UPDATE' then
    v_closing_existing := old.installation_team_id=new.installation_team_id
      and old.groomer_employee_id is not distinct from new.groomer_employee_id
      and old.driver_employee_id is not distinct from new.driver_employee_id
      and old.appointment_car_id is not distinct from new.appointment_car_id
      and old.effective_from=new.effective_from
      and old.effective_to is null
      and new.effective_to is not null;
  end if;

  v_super_admin_existing_team_override := v_is_super_admin and coalesce(new.source,'')<>'create';

  if exists(
    select 1
    from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id=new.installation_team_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]')
          && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل' using errcode='23514';
  end if;

  if not v_closing_existing and not v_super_admin_existing_team_override
     and new.groomer_employee_id is not null and exists(
       select 1 from public.installation_team_assignment_history h
       where h.id is distinct from new.id
         and h.installation_team_id<>new.installation_team_id
         and h.groomer_employee_id=new.groomer_employee_id
         and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]')
             && daterange(new.effective_from,v_to,'[]')
     ) then
    raise exception 'الجرومر مرتبط بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  if not v_closing_existing and not v_super_admin_existing_team_override
     and new.driver_employee_id is not null and exists(
       select 1 from public.installation_team_assignment_history h
       where h.id is distinct from new.id
         and h.installation_team_id<>new.installation_team_id
         and h.driver_employee_id=new.driver_employee_id
         and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]')
             && daterange(new.effective_from,v_to,'[]')
     ) then
    raise exception 'السائق مرتبط بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  if not v_closing_existing and not v_super_admin_existing_team_override
     and new.appointment_car_id is not null and exists(
       select 1 from public.installation_team_assignment_history h
       where h.id is distinct from new.id
         and h.installation_team_id<>new.installation_team_id
         and h.appointment_car_id=new.appointment_car_id
         and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]')
             && daterange(new.effective_from,v_to,'[]')
     ) then
    raise exception 'السيارة مرتبطة بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- C. Mandatory effective date in the canonical team-save RPC.
--    This is the R44R22 canonical function with ONLY the current_date fallback removed.
-- --------------------------------------------------------------------------
create or replace function public.save_installation_team_assignment_v1(
  p_team_id uuid,
  p_groomer_employee_id uuid,
  p_driver_employee_id uuid,
  p_appointment_car_id uuid,
  p_effective_from date,
  p_status text default 'متاحة'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=p_team_id;
  v_existing public.installation_teams%rowtype;
  v_open public.installation_team_assignment_history%rowtype;
  v_groomer public.appointment_employees%rowtype;
  v_driver public.appointment_employees%rowtype;
  v_car public.appointment_cars%rowtype;
  v_effective date:=p_effective_from;
  v_cutover constant date:=date '2026-09-01';
  v_changed boolean:=false;
begin
  if p_team_id is null then
    if not public.has_screen_permission('installationSettings','add') then
      raise exception 'لا توجد صلاحية إضافة فريق موعد';
    end if;
  else
    if not public.has_screen_permission('installationSettings','edit') then
      raise exception 'لا توجد صلاحية تعديل فريق موعد';
    end if;
  end if;

  if v_effective is null then
    raise exception 'تاريخ سريان الربط مطلوب';
  end if;
  if v_effective<v_cutover then
    raise exception 'تاريخ سريان الربط لا يمكن أن يكون قبل %',to_char(v_cutover,'YYYY-MM-DD');
  end if;
  if v_effective>current_date then
    raise exception 'تاريخ سريان الربط لا يمكن أن يكون بعد تاريخ اليوم';
  end if;

  select * into v_groomer from public.appointment_employees where id=p_groomer_employee_id;
  if not found or v_groomer.employee_type<>'جرومر' or not v_groomer.is_active then
    raise exception 'الجرومر المختار غير صالح أو غير نشط';
  end if;

  select * into v_driver from public.appointment_employees where id=p_driver_employee_id;
  if not found or v_driver.employee_type<>'سائق' or not v_driver.is_active then
    raise exception 'السائق المختار غير صالح أو غير نشط';
  end if;

  select * into v_car from public.appointment_cars where id=p_appointment_car_id;
  if not found or not v_car.is_active then
    raise exception 'السيارة المختارة غير صالحة أو غير نشطة';
  end if;

  if p_team_id is null then
    insert into public.installation_teams(
      groomer_employee_id,driver_employee_id,appointment_car_id,
      groomer_name,driver_name,car_name,leader_name,name,phone,city,status
    ) values(
      v_groomer.id,v_driver.id,v_car.id,
      v_groomer.full_name,v_driver.full_name,v_car.name,v_groomer.full_name,
      v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
      null,null,coalesce(nullif(btrim(p_status),''),'متاحة')
    ) returning id into v_id;

    insert into public.installation_team_assignment_history(
      installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
      groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
      effective_from,effective_to,source,created_by
    ) values(
      v_id,v_groomer.id,v_driver.id,v_car.id,
      v_groomer.full_name,v_driver.full_name,v_car.name,v_car.plate_number,
      v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
      v_effective,null,'create',auth.uid()
    );
    return v_id;
  end if;

  select * into v_existing from public.installation_teams where id=p_team_id for update;
  if not found then raise exception 'فريق الموعد غير موجود'; end if;

  v_changed := v_existing.groomer_employee_id is distinct from v_groomer.id
            or v_existing.driver_employee_id is distinct from v_driver.id
            or v_existing.appointment_car_id is distinct from v_car.id;

  if v_changed then
    select * into v_open
    from public.installation_team_assignment_history
    where installation_team_id=p_team_id and effective_to is null
    order by effective_from desc
    limit 1
    for update;

    if not found then
      insert into public.installation_team_assignment_history(
        installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
        groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
        effective_from,effective_to,source,created_by
      ) values(
        p_team_id,v_existing.groomer_employee_id,v_existing.driver_employee_id,v_existing.appointment_car_id,
        coalesce(v_existing.groomer_name,v_existing.leader_name),v_existing.driver_name,v_existing.car_name,null,v_existing.name,
        v_cutover,null,'recovered_current_cutover',auth.uid()
      ) returning * into v_open;
    end if;

    if v_effective<v_open.effective_from then
      raise exception 'تاريخ سريان التعديل لا يمكن أن يسبق بداية الربط الحالي (%)',v_open.effective_from;
    elsif v_effective=v_open.effective_from then
      update public.installation_team_assignment_history
      set groomer_employee_id=v_groomer.id,
          driver_employee_id=v_driver.id,
          appointment_car_id=v_car.id,
          groomer_name_snapshot=v_groomer.full_name,
          driver_name_snapshot=v_driver.full_name,
          car_name_snapshot=v_car.name,
          plate_number_snapshot=v_car.plate_number,
          team_name_snapshot=v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
          source='assignment_correction_same_start'
      where id=v_open.id;
    else
      update public.installation_team_assignment_history
      set effective_to=v_effective-1
      where id=v_open.id;

      insert into public.installation_team_assignment_history(
        installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
        groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
        effective_from,effective_to,source,created_by
      ) values(
        p_team_id,v_groomer.id,v_driver.id,v_car.id,
        v_groomer.full_name,v_driver.full_name,v_car.name,v_car.plate_number,
        v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
        v_effective,null,'assignment_change',auth.uid()
      );
    end if;
  end if;

  update public.installation_teams
  set groomer_employee_id=v_groomer.id,
      driver_employee_id=v_driver.id,
      appointment_car_id=v_car.id,
      groomer_name=v_groomer.full_name,
      driver_name=v_driver.full_name,
      car_name=v_car.name,
      leader_name=v_groomer.full_name,
      name=v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,
      phone=null,
      city=null,
      status=coalesce(nullif(btrim(p_status),''),v_existing.status,'متاحة')
  where id=p_team_id;

  return p_team_id;
end;
$$;
revoke all on function public.save_installation_team_assignment_v1(uuid,uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.save_installation_team_assignment_v1(uuid,uuid,uuid,uuid,date,text) to authenticated,service_role;

-- --------------------------------------------------------------------------
-- D. Consolidate the R44R24R3 commission SQL ambiguity fix.
--    Business logic is unchanged; CTE/output columns are fully qualified so
--    PostgreSQL does not confuse installation_team_id output variables with CTE columns.
-- --------------------------------------------------------------------------
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

-- --------------------------------------------------------------------------
-- E. Full-August historical recovery from RAW invoice lineage.
--    The invoice numbers are used only as a safety/evidence gate to identify which UUID
--    represented each historical team. The correction itself covers every day in August.
-- --------------------------------------------------------------------------
do $$
declare
  v_aug_from constant date:=date '2026-08-01';
  v_aug_to   constant date:=date '2026-08-31';

  v_team_101342 uuid;
  v_team_101343 uuid;
  v_team_101344 uuid;
  v_date_101342 date;
  v_date_101343 date;
  v_date_101344 date;
  v_team_van_a uuid;
  v_team_van_b uuid;

  v_chris_id uuid;
  v_roland_id uuid;
  v_brian_id uuid;
  v_dinmark_id uuid;
  v_van_a_id uuid;
  v_van_b_id uuid;

  v_chris_name text;
  v_roland_name text;
  v_brian_name text;
  v_dinmark_name text;
  v_van_a_name text;
  v_van_b_name text;
  v_van_a_plate text;
  v_van_b_plate text;

  v_count integer;
begin
  -- RAW team ID behind invoice 101342.
  select coalesce(v.installation_team_id,r.installation_team_id),si.invoice_date
  into v_team_101342,v_date_101342
  from public.sales_invoices si
  left join public.sales_invoices ref_si
    on ref_si.id=si.reference_sales_invoice_id
   and ref_si.source_type='installation'
   and ref_si.status<>'ملغاة'
  left join public.installation_execution_visits v
    on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
  left join public.installation_requests r
    on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
  where btrim(si.invoice_number)='101342'
    and si.status<>'ملغاة'
  order by si.created_at desc
  limit 1;

  select coalesce(v.installation_team_id,r.installation_team_id),si.invoice_date
  into v_team_101343,v_date_101343
  from public.sales_invoices si
  left join public.sales_invoices ref_si
    on ref_si.id=si.reference_sales_invoice_id
   and ref_si.source_type='installation'
   and ref_si.status<>'ملغاة'
  left join public.installation_execution_visits v
    on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
  left join public.installation_requests r
    on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
  where btrim(si.invoice_number)='101343'
    and si.status<>'ملغاة'
  order by si.created_at desc
  limit 1;

  select coalesce(v.installation_team_id,r.installation_team_id),si.invoice_date
  into v_team_101344,v_date_101344
  from public.sales_invoices si
  left join public.sales_invoices ref_si
    on ref_si.id=si.reference_sales_invoice_id
   and ref_si.source_type='installation'
   and ref_si.status<>'ملغاة'
  left join public.installation_execution_visits v
    on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
  left join public.installation_requests r
    on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
  where btrim(si.invoice_number)='101344'
    and si.status<>'ملغاة'
  order by si.created_at desc
  limit 1;

  if v_team_101342 is null or v_team_101343 is null or v_team_101344 is null then
    raise exception 'R44R25 aborted: one or more historical invoice team IDs could not be resolved.';
  end if;
  if v_date_101342 not between v_aug_from and v_aug_to
     or v_date_101343 not between v_aug_from and v_aug_to
     or v_date_101344 not between v_aug_from and v_aug_to then
    raise exception 'R44R25 aborted: one or more evidence invoices are outside August 2026.';
  end if;
  if v_team_101342<>v_team_101344 then
    raise exception 'R44R25 aborted: invoices 101342 and 101344 do not share the same stored team ID.';
  end if;
  if v_team_101343=v_team_101342 then
    raise exception 'R44R25 aborted: VAN A and VAN B evidence resolved to the same team ID.';
  end if;

  -- OLD PDF truth:
  -- 101343 = VAN A / Chris / Brian
  -- 101342 + 101344 = VAN B / Roland / Dinmark
  v_team_van_a:=v_team_101343;
  v_team_van_b:=v_team_101342;

  -- Resolve the four employees uniquely by the confirmed reference names.
  select count(*) into v_count from public.appointment_employees where lower(btrim(full_name))='chris';
  if v_count<>1 then raise exception 'R44R25 aborted: Chris is not uniquely resolvable.'; end if;
  select id,full_name into v_chris_id,v_chris_name from public.appointment_employees where lower(btrim(full_name))='chris' limit 1;

  select count(*) into v_count from public.appointment_employees where lower(btrim(full_name))='roland';
  if v_count<>1 then raise exception 'R44R25 aborted: Roland is not uniquely resolvable.'; end if;
  select id,full_name into v_roland_id,v_roland_name from public.appointment_employees where lower(btrim(full_name))='roland' limit 1;

  select count(*) into v_count from public.appointment_employees where lower(btrim(full_name))='brian lacia lucas';
  if v_count<>1 then raise exception 'R44R25 aborted: Brian Lacia Lucas is not uniquely resolvable.'; end if;
  select id,full_name into v_brian_id,v_brian_name from public.appointment_employees where lower(btrim(full_name))='brian lacia lucas' limit 1;

  select count(*) into v_count from public.appointment_employees where lower(btrim(full_name))='dinmark';
  if v_count<>1 then raise exception 'R44R25 aborted: Dinmark is not uniquely resolvable.'; end if;
  select id,full_name into v_dinmark_id,v_dinmark_name from public.appointment_employees where lower(btrim(full_name))='dinmark' limit 1;

  -- Resolve the two vehicles uniquely by the confirmed plates.
  select count(*) into v_count from public.appointment_cars
  where upper(regexp_replace(coalesce(plate_number,''),'[^A-Z0-9]','','g'))='AXB2558';
  if v_count<>1 then raise exception 'R44R25 aborted: VAN A / AXB 2558 is not uniquely resolvable.'; end if;
  select id,name,plate_number into v_van_a_id,v_van_a_name,v_van_a_plate from public.appointment_cars
  where upper(regexp_replace(coalesce(plate_number,''),'[^A-Z0-9]','','g'))='AXB2558' limit 1;

  select count(*) into v_count from public.appointment_cars
  where upper(regexp_replace(coalesce(plate_number,''),'[^A-Z0-9]','','g'))='SXB6066';
  if v_count<>1 then raise exception 'R44R25 aborted: VAN B / SXB 6066 is not uniquely resolvable.'; end if;
  select id,name,plate_number into v_van_b_id,v_van_b_name,v_van_b_plate from public.appointment_cars
  where upper(regexp_replace(coalesce(plate_number,''),'[^A-Z0-9]','','g'))='SXB6066' limit 1;

  -- Require exactly one explicit full-August segment per evidence team. This is the
  -- known structure created by the previous recovery hotfixes; anything else is safer to stop.
  select count(*) into v_count
  from public.installation_team_assignment_history h
  where h.installation_team_id=v_team_van_a
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;
  if v_count<>1 then
    raise exception 'R44R25 aborted: expected exactly one full-August segment for historical VAN A team; found %.',v_count;
  end if;

  select count(*) into v_count
  from public.installation_team_assignment_history h
  where h.installation_team_id=v_team_van_b
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;
  if v_count<>1 then
    raise exception 'R44R25 aborted: expected exactly one full-August segment for historical VAN B team; found %.',v_count;
  end if;

  -- Remove both August rows first so no intermediate resource collision is possible.
  delete from public.installation_team_assignment_history h
  where h.installation_team_id in (v_team_van_a,v_team_van_b)
    and h.effective_from=v_aug_from
    and h.effective_to=v_aug_to;

  -- FULL AUGUST: invoice-101343 team UUID = Chris + Brian + VAN A.
  insert into public.installation_team_assignment_history(
    installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
    groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
    effective_from,effective_to,source,created_by
  ) values(
    v_team_van_a,v_chris_id,v_brian_id,v_van_a_id,
    v_chris_name,v_brian_name,v_van_a_name,v_van_a_plate,
    v_chris_name||' - '||v_brian_name||' - '||v_van_a_name,
    v_aug_from,v_aug_to,'august_2026_recovered_from_invoice_101343',auth.uid()
  );

  -- FULL AUGUST: invoice-101342/101344 team UUID = Roland + Dinmark + VAN B.
  insert into public.installation_team_assignment_history(
    installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
    groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
    effective_from,effective_to,source,created_by
  ) values(
    v_team_van_b,v_roland_id,v_dinmark_id,v_van_b_id,
    v_roland_name,v_dinmark_name,v_van_b_name,v_van_b_plate,
    v_roland_name||' - '||v_dinmark_name||' - '||v_van_b_name,
    v_aug_from,v_aug_to,'august_2026_recovered_from_invoice_101342_101344',auth.uid()
  );
end $$;

-- Release translations; preserve administrator-customized text.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('pwa.update.release.r44r25.title','aboutApp','system','title','استعادة ربط فرق أغسطس ومنع التاريخ الافتراضي','August Team History Recovery & Explicit Effective Date','استعادة ربط فرق أغسطس ومنع التاريخ الافتراضي','August Team History Recovery & Explicit Effective Date',true,now()),
  ('pwa.update.release.r44r25.note1','aboutApp','system','help','استعادة ربط فرق شهر أغسطس 2026 بالكامل اعتمادًا على أرقام الفواتير التاريخية المؤكدة دون تعديل الفواتير أو الرواتب المصروفة.','Recovers the full August 2026 team history from confirmed historical invoice lineage without rewriting invoices or paid payroll.','استعادة ربط فرق شهر أغسطس 2026 بالكامل اعتمادًا على أرقام الفواتير التاريخية المؤكدة دون تعديل الفواتير أو الرواتب المصروفة.','Recovers the full August 2026 team history from confirmed historical invoice lineage without rewriting invoices or paid payroll.',true,now()),
  ('pwa.update.release.r44r25.note2','aboutApp','system','help','إبقاء سبتمبر وما بعده كما هو مع استمرار احتساب المواعيد والتقارير والعمولات حسب تاريخ العملية.','Keeps September and later assignments unchanged while appointments, reports, and commissions continue resolving by business date.','إبقاء سبتمبر وما بعده كما هو مع استمرار احتساب المواعيد والتقارير والعمولات حسب تاريخ العملية.','Keeps September and later assignments unchanged while appointments, reports, and commissions continue resolving by business date.',true,now()),
  ('pwa.update.release.r44r25.note3','aboutApp','system','help','تاريخ سريان ربط الفريق أصبح إلزاميًا ولا يتم ملؤه بتاريخ اليوم تلقائيًا.','Team assignment effective date is now mandatory and is no longer auto-filled with today.','تاريخ سريان ربط الفريق أصبح إلزاميًا ولا يتم ملؤه بتاريخ اليوم تلقائيًا.','Team assignment effective date is now mandatory and is no longer auto-filled with today.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,module_name=excluded.module_name,text_type=excluded.text_type,
  default_ar=excluded.default_ar,default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' or public.app_translations.ar_text=public.app_translations.default_ar then excluded.ar_text else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' or public.app_translations.en_text=public.app_translations.default_en then excluded.en_text else public.app_translations.en_text end,
  is_active=true,updated_at=now();

notify pgrst,'reload schema';
commit;
