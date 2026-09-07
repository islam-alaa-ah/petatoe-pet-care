-- P5.13.8.72 R44R21 — Effective-dated appointment team assignment history
-- Scope:
--   1) Preserve groomer / driver / vehicle linkage by effective date.
--   2) Make commission, vehicle treasury, and appointment reports resolve historical assignment by business date.
--   3) Keep current installation_teams as the operational current-state projection.
--   4) Do not alter appointment financial formulas, permission decisions, offline queue contracts, or R44 pruning.

begin;

create table if not exists public.installation_team_assignment_history (
  id uuid primary key default gen_random_uuid(),
  installation_team_id uuid not null references public.installation_teams(id) on delete restrict,
  groomer_employee_id uuid references public.appointment_employees(id) on delete restrict,
  driver_employee_id uuid references public.appointment_employees(id) on delete restrict,
  appointment_car_id uuid references public.appointment_cars(id) on delete restrict,
  groomer_name_snapshot text,
  driver_name_snapshot text,
  car_name_snapshot text,
  plate_number_snapshot text,
  team_name_snapshot text,
  effective_from date not null,
  effective_to date,
  source text not null default 'assignment_change',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint installation_team_assignment_history_dates_ck check (effective_to is null or effective_to >= effective_from)
);

create index if not exists idx_installation_team_assignment_history_team_dates
  on public.installation_team_assignment_history(installation_team_id,effective_from desc,effective_to);
create index if not exists idx_installation_team_assignment_history_groomer_dates
  on public.installation_team_assignment_history(groomer_employee_id,effective_from,effective_to)
  where groomer_employee_id is not null;
create index if not exists idx_installation_team_assignment_history_driver_dates
  on public.installation_team_assignment_history(driver_employee_id,effective_from,effective_to)
  where driver_employee_id is not null;
create index if not exists idx_installation_team_assignment_history_car_dates
  on public.installation_team_assignment_history(appointment_car_id,effective_from,effective_to)
  where appointment_car_id is not null;
create unique index if not exists uq_installation_team_assignment_history_open_team
  on public.installation_team_assignment_history(installation_team_id)
  where effective_to is null;

create or replace function public.guard_installation_team_assignment_history_overlap()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_to date := coalesce(new.effective_to,'infinity'::date);
  v_closing_existing boolean := false;
begin
  if tg_op='UPDATE' then
    v_closing_existing := old.installation_team_id=new.installation_team_id
      and old.groomer_employee_id is not distinct from new.groomer_employee_id
      and old.driver_employee_id is not distinct from new.driver_employee_id
      and old.appointment_car_id is not distinct from new.appointment_car_id
      and old.effective_from=new.effective_from
      and old.effective_to is null
      and new.effective_to is not null;
  end if;

  if exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id=new.installation_team_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'فترة ربط الفريق تتداخل مع فترة موجودة بالفعل' using errcode='23514';
  end if;

  if not v_closing_existing and new.groomer_employee_id is not null and exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id<>new.installation_team_id
      and h.groomer_employee_id=new.groomer_employee_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'الجرومر مرتبط بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  if not v_closing_existing and new.driver_employee_id is not null and exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id<>new.installation_team_id
      and h.driver_employee_id=new.driver_employee_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'السائق مرتبط بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  if not v_closing_existing and new.appointment_car_id is not null and exists(
    select 1 from public.installation_team_assignment_history h
    where h.id is distinct from new.id
      and h.installation_team_id<>new.installation_team_id
      and h.appointment_car_id=new.appointment_car_id
      and daterange(h.effective_from,coalesce(h.effective_to,'infinity'::date),'[]') && daterange(new.effective_from,v_to,'[]')
  ) then
    raise exception 'السيارة مرتبطة بفريق آخر خلال جزء من الفترة المحددة' using errcode='23505';
  end if;

  return new;
end;
$$;

alter table public.installation_team_assignment_history enable row level security;
drop policy if exists "installation team assignment history read" on public.installation_team_assignment_history;
create policy "installation team assignment history read"
on public.installation_team_assignment_history
for select to authenticated
using(
  public.has_screen_permission('installationSettings','view')
  or public.can_access_installation_team(installation_team_id)
  or (
    public.has_screen_permission('installationReports','view')
    and (
      exists(
        select 1 from public.installation_requests r
        where r.installation_team_id=installation_team_assignment_history.installation_team_id
          and public.can_access_installation_representative(r.representative_id)
      )
      or exists(
        select 1
        from public.installation_execution_visits v
        join public.installation_requests r on r.id=v.installation_request_id
        where v.installation_team_id=installation_team_assignment_history.installation_team_id
          and public.can_access_installation_representative(r.representative_id)
      )
    )
  )
);
revoke insert,update,delete on public.installation_team_assignment_history from authenticated;
grant select on public.installation_team_assignment_history to authenticated;

-- Baseline seed. The repository has no authoritative generic audit trail for team-master edits
-- performed before this migration, so the current assignment is preserved as the known baseline.
-- Future edits are lossless because every change closes the previous segment and opens a new one.
insert into public.installation_team_assignment_history(
  installation_team_id,groomer_employee_id,driver_employee_id,appointment_car_id,
  groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,plate_number_snapshot,team_name_snapshot,
  effective_from,effective_to,source,created_by
)
select
  t.id,t.groomer_employee_id,t.driver_employee_id,t.appointment_car_id,
  coalesce(g.full_name,t.groomer_name,t.leader_name),
  coalesce(d.full_name,t.driver_name),
  coalesce(c.name,t.car_name),
  c.plate_number,
  coalesce(nullif(btrim(t.name),''),concat_ws(' - ',coalesce(g.full_name,t.groomer_name,t.leader_name),coalesce(d.full_name,t.driver_name),coalesce(c.name,t.car_name))),
  date '1900-01-01',null,'baseline_current',auth.uid()
from public.installation_teams t
left join public.appointment_employees g on g.id=t.groomer_employee_id
left join public.appointment_employees d on d.id=t.driver_employee_id
left join public.appointment_cars c on c.id=t.appointment_car_id
where not exists(
  select 1 from public.installation_team_assignment_history h where h.installation_team_id=t.id
);

drop trigger if exists trg_guard_installation_team_assignment_history_overlap on public.installation_team_assignment_history;
create trigger trg_guard_installation_team_assignment_history_overlap
before insert or update on public.installation_team_assignment_history
for each row execute function public.guard_installation_team_assignment_history_overlap();

create or replace function public.installation_team_assignment_at(
  p_team_id uuid,
  p_business_date date
)
returns table(
  assignment_id uuid,
  installation_team_id uuid,
  groomer_employee_id uuid,
  driver_employee_id uuid,
  appointment_car_id uuid,
  groomer_name text,
  driver_name text,
  car_name text,
  plate_number text,
  team_name text,
  effective_from date,
  effective_to date
)
language sql
stable
security definer
set search_path=public
as $$
  with wanted as (
    select coalesce(p_business_date,current_date) as business_date
  ), allowed as (
    select (
      auth.role()='service_role'
      or public.has_screen_permission('installationSchedule','view')
      or public.has_screen_permission('installationRequestNew','add')
      or public.has_screen_permission('installationRequests','edit')
      or public.has_screen_permission('installationSettings','view')
      or public.has_screen_permission('commissionManagement','view')
      or public.has_screen_permission('payrollManagement','add')
      or public.has_screen_permission('payrollManagement','edit')
      or public.has_screen_permission('vehicleTreasury','view')
      or public.has_screen_permission('vehicleTreasury','add')
      or public.has_screen_permission('vehicleTreasury','edit')
      or public.can_access_installation_team(p_team_id)
    ) as ok
  ), historical as (
    select
      h.id assignment_id,h.installation_team_id,h.groomer_employee_id,h.driver_employee_id,h.appointment_car_id,
      h.groomer_name_snapshot groomer_name,h.driver_name_snapshot driver_name,h.car_name_snapshot car_name,
      h.plate_number_snapshot plate_number,h.team_name_snapshot team_name,h.effective_from,h.effective_to
    from public.installation_team_assignment_history h,wanted w,allowed a
    where a.ok
      and h.installation_team_id=p_team_id
      and h.effective_from<=w.business_date
      and (h.effective_to is null or h.effective_to>=w.business_date)
    order by h.effective_from desc,h.created_at desc
    limit 1
  ), fallback as (
    select
      null::uuid assignment_id,t.id installation_team_id,t.groomer_employee_id,t.driver_employee_id,t.appointment_car_id,
      coalesce(g.full_name,t.groomer_name,t.leader_name) groomer_name,
      coalesce(d.full_name,t.driver_name) driver_name,
      coalesce(c.name,t.car_name) car_name,
      c.plate_number,
      t.name team_name,
      null::date effective_from,null::date effective_to
    from public.installation_teams t
    cross join allowed a
    left join public.appointment_employees g on g.id=t.groomer_employee_id
    left join public.appointment_employees d on d.id=t.driver_employee_id
    left join public.appointment_cars c on c.id=t.appointment_car_id
    where a.ok and t.id=p_team_id and not exists(select 1 from historical)
  )
  select * from historical
  union all
  select * from fallback;
$$;
revoke all on function public.installation_team_assignment_at(uuid,date) from public,anon;
grant execute on function public.installation_team_assignment_at(uuid,date) to authenticated,service_role;

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
  v_effective date:=coalesce(p_effective_from,current_date);
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
      v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name,null,null,coalesce(nullif(btrim(p_status),''),'متاحة')
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
        date '1900-01-01',null,'recovered_current',auth.uid()
      ) returning * into v_open;
    end if;

    if v_effective<=v_open.effective_from then
      raise exception 'تاريخ سريان التعديل يجب أن يكون بعد بداية الربط الحالي (%)',v_open.effective_from;
    end if;

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

-- Commission persistence must support the same employee/team on more than one car in one month.
alter table public.payroll_commission_statements drop constraint if exists payroll_commission_statement_uq;
create unique index if not exists uq_payroll_commission_statement_vehicle_segment
  on public.payroll_commission_statements(payroll_month,installation_team_id,appointment_car_id,employee_id,commission_role);

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
      coalesce(a.car_name,'غير محدد') car_name,
      a.plate_number,
      a.team_name,
      a.groomer_employee_id,
      a.driver_employee_id,
      a.groomer_name,
      a.driver_name
    from public.payroll_commission_invoice_base b
    left join lateral public.installation_team_assignment_at(b.installation_team_id,b.invoice_date) a on true
    where b.invoice_date between v_from and v_to
  ),
  groomer_sales as (
    select installation_team_id,appointment_car_id,max(car_name) car_name,max(plate_number) plate_number,
           max(team_name) team_name,groomer_employee_id,max(groomer_name) source_name,
           round(sum(eligible_sales_before_vat),2) sales
    from invoice_assignment
    where groomer_employee_id is not null
    group by installation_team_id,appointment_car_id,groomer_employee_id
  ),
  driver_sales as (
    select installation_team_id,appointment_car_id,max(car_name) car_name,max(plate_number) plate_number,
           max(team_name) team_name,driver_employee_id,max(driver_name) source_name,
           round(sum(eligible_sales_before_vat),2) sales
    from invoice_assignment
    where driver_employee_id is not null
    group by installation_team_id,appointment_car_id,driver_employee_id
  ),
  rep_sales as (
    select installation_team_id,appointment_car_id,max(car_name) car_name,max(plate_number) plate_number,
           max(team_name) team_name,representative_id,round(sum(eligible_sales_before_vat),2) sales
    from invoice_assignment
    where representative_id is not null
    group by installation_team_id,appointment_car_id,representative_id
  ),
  roles as (
    select gs.installation_team_id,gs.team_name,gs.appointment_car_id,gs.car_name,gs.plate_number,
           pe.id employee_id,coalesce(pe.full_name,ae.full_name,gs.source_name,'غير مربوط') employee_name,
           'groomer'::text commission_role,gs.sales,(pe.id is not null) linked,coalesce(pe.commission_eligible,false) commission_eligible
    from groomer_sales gs
    left join public.appointment_employees ae on ae.id=gs.groomer_employee_id
    left join public.payroll_employees pe on pe.appointment_employee_id=gs.groomer_employee_id and pe.commission_role='groomer' and pe.is_active
    union all
    select ds.installation_team_id,ds.team_name,ds.appointment_car_id,ds.car_name,ds.plate_number,
           pe.id,coalesce(pe.full_name,ae.full_name,ds.source_name,'غير مربوط'),'driver',ds.sales,(pe.id is not null),coalesce(pe.commission_eligible,false)
    from driver_sales ds
    left join public.appointment_employees ae on ae.id=ds.driver_employee_id
    left join public.payroll_employees pe on pe.appointment_employee_id=ds.driver_employee_id and pe.commission_role='driver' and pe.is_active
    union all
    select rs.installation_team_id,rs.team_name,rs.appointment_car_id,rs.car_name,rs.plate_number,
           pe.id,coalesce(pe.full_name,sr.full_name,'غير مربوط'),'representative',rs.sales,(pe.id is not null),coalesce(pe.commission_eligible,false)
    from rep_sales rs
    left join public.sales_representatives sr on sr.id=rs.representative_id
    left join public.payroll_employees pe on pe.representative_id=rs.representative_id and pe.commission_role='representative' and pe.is_active
  ), calc as (
    select roles.*,public.payroll_calc_progressive_commission(roles.commission_role,roles.sales) calc
    from roles
  )
  select v_month,calc.installation_team_id,calc.team_name,calc.appointment_car_id,calc.car_name,calc.plate_number,
         calc.employee_id,calc.employee_name,calc.commission_role,round(calc.sales,2),
         case when calc.linked and calc.commission_eligible then coalesce((calc.calc->>'total')::numeric,0) else 0 end,
         case when calc.linked and calc.commission_eligible then coalesce(calc.calc->'breakdown','[]'::jsonb) else '[]'::jsonb end,
         calc.linked,calc.commission_eligible
  from calc
  where public.has_screen_permission('commissionManagement','view')
     or public.has_screen_permission('payrollManagement','add')
     or public.has_screen_permission('payrollManagement','edit')
     or (calc.employee_id is not null and exists(
       select 1 from public.payroll_employees own where own.id=calc.employee_id and own.user_id=auth.uid()
     ))
  order by calc.car_name,case calc.commission_role when 'representative' then 1 when 'driver' then 2 else 3 end,calc.employee_name;
end;
$$;
revoke all on function public.payroll_live_commission_rows_range(date,date) from public,anon;
grant execute on function public.payroll_live_commission_rows_range(date,date) to authenticated,service_role;

create or replace function public.payroll_live_commission_rows(p_month date)
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
language sql
stable
security definer
set search_path=public
as $$
  select * from public.payroll_live_commission_rows_range(
    public.payroll_month_start(p_month),
    (public.payroll_month_start(p_month)+interval '1 month - 1 day')::date
  );
$$;
revoke all on function public.payroll_live_commission_rows(date) from public,anon;
grant execute on function public.payroll_live_commission_rows(date) to authenticated,service_role;

create or replace function public.rebuild_payroll_commissions_internal(p_month date,p_actor uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_month date:=public.payroll_month_start(p_month);
begin
  delete from public.payroll_commission_statements
  where payroll_month=v_month and is_locked=false;

  insert into public.payroll_commission_statements(
    payroll_month,installation_team_id,appointment_car_id,employee_id,commission_role,
    eligible_sales,commission_amount,tier_breakdown,is_locked,calculated_at,calculated_by
  )
  select l.payroll_month,l.installation_team_id,l.appointment_car_id,l.employee_id,l.commission_role,
         l.eligible_sales,l.commission_amount,l.tier_breakdown,false,now(),p_actor
  from public.payroll_live_commission_rows(v_month) l
  where l.linked=true and l.employee_id is not null
    and not exists(
      select 1 from public.payroll_commission_statements locked
      where locked.payroll_month=v_month and locked.employee_id=l.employee_id and locked.is_locked=true
    )
  on conflict(payroll_month,installation_team_id,appointment_car_id,employee_id,commission_role) do update set
    eligible_sales=excluded.eligible_sales,
    commission_amount=excluded.commission_amount,
    tier_breakdown=excluded.tier_breakdown,
    calculated_at=now(),
    calculated_by=p_actor,
    updated_at=now()
  where public.payroll_commission_statements.is_locked=false;
end;
$$;
revoke all on function public.rebuild_payroll_commissions_internal(date,uuid) from public,anon,authenticated;
grant execute on function public.rebuild_payroll_commissions_internal(date,uuid) to service_role;

create or replace function public.get_commission_management_workspace_range(p_from date,p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_from date:=p_from;
  v_to date:=p_to;
  result jsonb;
begin
  if not public.has_screen_permission('commissionManagement','view') then
    raise exception 'لا توجد صلاحية عرض إدارة العمولات';
  end if;
  if v_from is null or v_to is null or v_from>v_to then
    raise exception 'يجب أن يكون تاريخ البداية قبل أو مساويًا لتاريخ النهاية.';
  end if;

  with rows as (select * from public.payroll_live_commission_rows_range(v_from,v_to))
  select jsonb_build_object(
    'month',public.payroll_month_start(v_from),
    'fromDate',v_from,
    'toDate',v_to,
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'teamId',installation_team_id,'teamName',team_name,'carId',appointment_car_id,'carName',car_name,'plateNumber',coalesce(plate_number,''),
      'employeeId',employee_id,'employeeName',employee_name,'role',commission_role,'eligibleSales',eligible_sales,
      'commissionAmount',commission_amount,'tierBreakdown',tier_breakdown,'linked',linked,'commissionEligible',commission_eligible
    ) order by car_name,commission_role,employee_name),'[]'::jsonb),
    'totalSales',coalesce((
      select round(sum(b.eligible_sales_before_vat),2)
      from public.payroll_commission_invoice_base b
      where b.invoice_date between v_from and v_to
    ),0),
    'totalCommissions',coalesce(sum(commission_amount),0)
  ) into result from rows;
  return result;
end;
$$;
revoke all on function public.get_commission_management_workspace_range(date,date) from public,anon;
grant execute on function public.get_commission_management_workspace_range(date,date) to authenticated,service_role;

-- Vehicle treasury: resolve revenue and expense vehicle metadata as of movement date.
create or replace function public.get_vehicle_treasury_workspace(
  p_team_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
  v_search text := lower(btrim(coalesce(p_search,'')));
begin
  if not public.has_screen_permission('vehicleTreasury','view') then
    raise exception 'لا توجد صلاحية عرض خزينة السيارة';
  end if;
  if p_team_id is not null and not public.can_access_installation_team(p_team_id) then
    raise exception 'الفرقة / السيارة خارج نطاقك المسموح';
  end if;

  with allowed_teams as (
    select t.id,t.name team_name,c.id car_id,
           coalesce(nullif(btrim(c.name),''),nullif(btrim(t.car_name),''),t.name) car_name,c.plate_number
    from public.installation_teams t
    left join public.appointment_cars c on c.id=t.appointment_car_id
    where t.appointment_car_id is not null and t.status<>'غير نشطة' and public.can_access_installation_team(t.id)
  ), revenue_base as (
    select
      si.id source_id,'revenue'::text movement_type,
      ('VT-REV-'||replace(si.id::text,'-',''))::text movement_serial,
      si.invoice_date movement_date,
      case
        when si.source_type='manual' then case
          when ref_si.id is null then '—'
          when coalesce(ref_si.is_without_invoice,false) or coalesce(ref_si.invoice_number,'') ilike 'NOINV-%'
            then coalesce(nullif(ref_si.request_number,''),'بدون فاتورة')
          else coalesce(nullif(ref_si.invoice_number,''),nullif(ref_si.request_number,''),'—') end
        when coalesce(si.is_without_invoice,false) or coalesce(si.invoice_number,'') ilike 'NOINV-%' then 'بدون فاتورة'
        else coalesce(nullif(si.invoice_number,''),nullif(si.request_number,''),'—')
      end reference,
      case when si.source_type='manual'
        then ('فاتورة يدوية نقدية'||case when ref_si.request_number is not null then ' — مرجع '||ref_si.request_number else '' end)::text
        else ('فاتورة نقدية — '||coalesce(si.request_number,'بدون رقم طلب'))::text end description,
      coalesce(si.final_amount,round(si.invoice_amount*1.15,2))::numeric amount,
      coalesce(v.installation_team_id,r.installation_team_id) team_id,
      null::uuid car_id,null::text notes,false editable,si.created_at sort_at
    from public.sales_invoices si
    left join public.sales_invoices ref_si on ref_si.id=si.reference_sales_invoice_id and ref_si.source_type='installation' and ref_si.status<>'ملغاة'
    left join public.installation_execution_visits v on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
    left join public.installation_requests r on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    left join public.installation_request_collection c on c.installation_request_id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    where si.status='صادرة' and si.source_type in ('installation','manual') and (si.source_type<>'manual' or ref_si.id is not null)
      and btrim(coalesce(case when si.source_type='manual' then si.payment_method else c.payment_method end,si.payment_method,''))='نقدي'
      and coalesce(v.installation_team_id,r.installation_team_id) is not null
      and public.can_access_installation_team(coalesce(v.installation_team_id,r.installation_team_id))
  ), revenue as (
    select rb.source_id,rb.movement_type,rb.movement_serial,rb.movement_date,rb.reference,rb.description,rb.amount,rb.team_id,
           a.appointment_car_id car_id,rb.notes,rb.editable,rb.sort_at,
           coalesce(a.team_name,t.name) team_name,
           coalesce(a.car_name,c.name,t.car_name,t.name) car_name,
           coalesce(a.plate_number,c.plate_number) plate_number
    from revenue_base rb
    left join lateral public.installation_team_assignment_at(rb.team_id,rb.movement_date) a on true
    left join public.installation_teams t on t.id=rb.team_id
    left join public.appointment_cars c on c.id=a.appointment_car_id
  ), expense as (
    select e.id source_id,'expense'::text movement_type,e.movement_serial,e.expense_date movement_date,e.movement_serial reference,e.description,
           (-e.amount)::numeric amount,e.installation_team_id team_id,e.appointment_car_id car_id,e.notes,true editable,e.created_at sort_at,
           coalesce(a.team_name,t.name) team_name,
           coalesce(a.car_name,c.name,t.car_name,t.name) car_name,
           coalesce(a.plate_number,c.plate_number) plate_number
    from public.vehicle_treasury_expenses e
    left join lateral public.installation_team_assignment_at(e.installation_team_id,e.expense_date) a on true
    left join public.installation_teams t on t.id=e.installation_team_id
    left join public.appointment_cars c on c.id=e.appointment_car_id
    where public.can_access_installation_team(e.installation_team_id)
  ), movements as (
    select * from revenue union all select * from expense
  ), filtered as (
    select * from movements m
    where (p_team_id is null or m.team_id=p_team_id)
      and (p_from is null or m.movement_date>=p_from)
      and (p_to is null or m.movement_date<=p_to)
      and (v_search='' or lower(coalesce(m.reference,'')||' '||coalesce(m.description,'')||' '||coalesce(m.car_name,'')||' '||coalesce(m.team_name,'')) like '%'||v_search||'%')
  )
  select jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'teamName',team_name,'carId',car_id,'carName',car_name,'plateNumber',plate_number) order by car_name,team_name) from allowed_teams),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(jsonb_build_object(
      'id',source_id,'sourceId',source_id,'movementType',movement_type,'movementSerial',movement_serial,'movementDate',movement_date,
      'reference',reference,'description',description,'amount',amount,'teamId',team_id,'teamName',team_name,'carId',car_id,'carName',car_name,
      'plateNumber',plate_number,'notes',notes,'editable',editable
    ) order by movement_date desc,sort_at desc) from filtered),'[]'::jsonb),
    'summary',jsonb_build_object(
      'revenue',coalesce((select sum(amount) from filtered where amount>0),0),
      'expense',abs(coalesce((select sum(amount) from filtered where amount<0),0)),
      'balance',coalesce((select sum(amount) from filtered),0),
      'count',(select count(*) from filtered)
    )
  ) into result;
  return result;
end;
$$;
grant execute on function public.get_vehicle_treasury_workspace(uuid,date,date,text) to authenticated;


-- Canonical R44R21 treasury workspace: treasury ownership is the physical car, not the
-- mutable team row. Team assignment is still retained on each movement for permission/
-- operational traceability, while the workspace filter and balance are car-based.
create or replace function public.get_vehicle_treasury_workspace_v2(
  p_car_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  if not public.has_screen_permission('vehicleTreasury','view') then
    raise exception 'لا توجد صلاحية عرض خزينة السيارة';
  end if;

  if p_car_id is not null and not exists(
    select 1
    from public.installation_team_assignment_history h
    where h.appointment_car_id=p_car_id
      and public.can_access_installation_team(h.installation_team_id)
  ) then
    raise exception 'السيارة خارج نطاقك المسموح';
  end if;

  with allowed_assignments as (
    select
      h.id assignment_id,
      h.installation_team_id team_id,
      coalesce(nullif(btrim(h.team_name_snapshot),''),t.name) team_name,
      h.appointment_car_id car_id,
      coalesce(nullif(btrim(c.name),''),nullif(btrim(h.car_name_snapshot),''),nullif(btrim(t.car_name),''),t.name) car_name,
      coalesce(nullif(btrim(c.plate_number),''),nullif(btrim(h.plate_number_snapshot),'')) plate_number,
      h.effective_from,
      h.effective_to
    from public.installation_team_assignment_history h
    join public.installation_teams t on t.id=h.installation_team_id
    left join public.appointment_cars c on c.id=h.appointment_car_id
    where h.appointment_car_id is not null
      and public.can_access_installation_team(h.installation_team_id)
  ), allowed_cars as (
    select distinct on (a.car_id)
      a.car_id id,
      a.car_name,
      a.plate_number
    from allowed_assignments a
    order by a.car_id,a.effective_from desc,a.assignment_id
  ), current_teams as (
    select
      t.id,
      t.name team_name,
      t.appointment_car_id car_id,
      coalesce(nullif(btrim(c.name),''),nullif(btrim(t.car_name),''),t.name) car_name,
      c.plate_number
    from public.installation_teams t
    left join public.appointment_cars c on c.id=t.appointment_car_id
    where t.status<>'غير نشطة'
      and t.appointment_car_id is not null
      and public.can_access_installation_team(t.id)
  ), revenue_base as (
    select
      si.id source_id,'revenue'::text movement_type,
      ('VT-REV-'||replace(si.id::text,'-',''))::text movement_serial,
      si.invoice_date movement_date,
      case
        when si.source_type='manual' then case
          when ref_si.id is null then '—'
          when coalesce(ref_si.is_without_invoice,false) or coalesce(ref_si.invoice_number,'') ilike 'NOINV-%'
            then coalesce(nullif(ref_si.request_number,''),'بدون فاتورة')
          else coalesce(nullif(ref_si.invoice_number,''),nullif(ref_si.request_number,''),'—') end
        when coalesce(si.is_without_invoice,false) or coalesce(si.invoice_number,'') ilike 'NOINV-%' then 'بدون فاتورة'
        else coalesce(nullif(si.invoice_number,''),nullif(si.request_number,''),'—')
      end reference,
      case when si.source_type='manual'
        then ('فاتورة يدوية نقدية'||case when ref_si.request_number is not null then ' — مرجع '||ref_si.request_number else '' end)::text
        else ('فاتورة نقدية — '||coalesce(si.request_number,'بدون رقم طلب'))::text end description,
      coalesce(si.final_amount,round(si.invoice_amount*1.15,2))::numeric amount,
      coalesce(v.installation_team_id,r.installation_team_id) team_id,
      null::text notes,false editable,si.created_at sort_at
    from public.sales_invoices si
    left join public.sales_invoices ref_si on ref_si.id=si.reference_sales_invoice_id and ref_si.source_type='installation' and ref_si.status<>'ملغاة'
    left join public.installation_execution_visits v on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
    left join public.installation_requests r on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    left join public.installation_request_collection col on col.installation_request_id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    where si.status='صادرة'
      and si.source_type in ('installation','manual')
      and (si.source_type<>'manual' or ref_si.id is not null)
      and btrim(coalesce(case when si.source_type='manual' then si.payment_method else col.payment_method end,si.payment_method,''))='نقدي'
      and coalesce(v.installation_team_id,r.installation_team_id) is not null
      and public.can_access_installation_team(coalesce(v.installation_team_id,r.installation_team_id))
  ), revenue as (
    select
      rb.source_id,rb.movement_type,rb.movement_serial,rb.movement_date,rb.reference,rb.description,rb.amount,rb.team_id,
      a.appointment_car_id car_id,rb.notes,rb.editable,rb.sort_at,
      coalesce(a.team_name,t.name) team_name,
      coalesce(a.car_name,c.name,t.car_name,t.name) car_name,
      coalesce(a.plate_number,c.plate_number) plate_number
    from revenue_base rb
    left join lateral public.installation_team_assignment_at(rb.team_id,rb.movement_date) a on true
    left join public.installation_teams t on t.id=rb.team_id
    left join public.appointment_cars c on c.id=a.appointment_car_id
  ), expense as (
    select
      e.id source_id,'expense'::text movement_type,e.movement_serial,e.expense_date movement_date,e.movement_serial reference,e.description,
      (-e.amount)::numeric amount,e.installation_team_id team_id,e.appointment_car_id car_id,e.notes,true editable,e.created_at sort_at,
      coalesce(h.team_name_snapshot,t.name) team_name,
      coalesce(c.name,h.car_name_snapshot,t.car_name,t.name) car_name,
      coalesce(c.plate_number,h.plate_number_snapshot) plate_number
    from public.vehicle_treasury_expenses e
    left join lateral (
      select x.*
      from public.installation_team_assignment_history x
      where x.installation_team_id=e.installation_team_id
        and x.appointment_car_id=e.appointment_car_id
        and x.effective_from<=e.expense_date
        and (x.effective_to is null or x.effective_to>=e.expense_date)
      order by x.effective_from desc,x.created_at desc
      limit 1
    ) h on true
    left join public.installation_teams t on t.id=e.installation_team_id
    left join public.appointment_cars c on c.id=e.appointment_car_id
    where public.can_access_installation_team(e.installation_team_id)
  ), movements as (
    select * from revenue
    union all
    select * from expense
  ), filtered as (
    select *
    from movements m
    where (p_car_id is null or m.car_id=p_car_id)
      and (p_from is null or m.movement_date>=p_from)
      and (p_to is null or m.movement_date<=p_to)
      and (v_search='' or lower(coalesce(m.reference,'')||' '||coalesce(m.description,'')||' '||coalesce(m.car_name,'')||' '||coalesce(m.team_name,'')) like '%'||v_search||'%')
  )
  select jsonb_build_object(
    'cars',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'carName',car_name,'plateNumber',plate_number) order by car_name,id)
      from allowed_cars
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'teamName',team_name,'carId',car_id,'carName',car_name,'plateNumber',plate_number) order by car_name,team_name)
      from current_teams
    ),'[]'::jsonb),
    'teamAssignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignmentId',assignment_id,'teamId',team_id,'teamName',team_name,'carId',car_id,'carName',car_name,'plateNumber',plate_number,
        'effectiveFrom',effective_from,'effectiveTo',effective_to
      ) order by effective_from,team_name)
      from allowed_assignments
    ),'[]'::jsonb),
    'movements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',source_id,'sourceId',source_id,'movementType',movement_type,'movementSerial',movement_serial,'movementDate',movement_date,
        'reference',reference,'description',description,'amount',amount,'teamId',team_id,'teamName',team_name,'carId',car_id,'carName',car_name,
        'plateNumber',plate_number,'notes',notes,'editable',editable
      ) order by movement_date desc,sort_at desc)
      from filtered
    ),'[]'::jsonb),
    'summary',jsonb_build_object(
      'revenue',coalesce((select sum(amount) from filtered where amount>0),0),
      'expense',abs(coalesce((select sum(amount) from filtered where amount<0),0)),
      'balance',coalesce((select sum(amount) from filtered),0),
      'count',(select count(*) from filtered)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_vehicle_treasury_workspace_v2(uuid,date,date,text) from public,anon;
grant execute on function public.get_vehicle_treasury_workspace_v2(uuid,date,date,text) to authenticated,service_role;

create or replace function public.add_vehicle_treasury_expense(p_team_id uuid,p_expense_date date,p_description text,p_amount numeric,p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid; v_car uuid; v_date date:=coalesce(p_expense_date,current_date);
begin
  if not public.has_screen_permission('vehicleTreasury','add') then raise exception 'لا توجد صلاحية صرف من خزينة السيارة'; end if;
  if not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة خارج نطاقك المسموح'; end if;
  select appointment_car_id into v_car from public.installation_team_assignment_at(p_team_id,v_date);
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة في تاريخ المصروف'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'بيان المصروف مطلوب'; end if;
  insert into public.vehicle_treasury_expenses(installation_team_id,appointment_car_id,expense_date,description,amount,notes,created_by,updated_by)
  values(p_team_id,v_car,v_date,btrim(p_description),p_amount,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.add_vehicle_treasury_expense(uuid,date,text,numeric,text) to authenticated;

create or replace function public.update_vehicle_treasury_expense(p_id uuid,p_team_id uuid,p_expense_date date,p_description text,p_amount numeric,p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_old public.vehicle_treasury_expenses%rowtype; v_car uuid; v_date date:=coalesce(p_expense_date,current_date);
begin
  if not public.has_screen_permission('vehicleTreasury','edit') then raise exception 'لا توجد صلاحية تعديل خزينة السيارة'; end if;
  select * into v_old from public.vehicle_treasury_expenses where id=p_id for update;
  if not found or not public.can_access_installation_team(v_old.installation_team_id) then raise exception 'حركة الصرف غير مسموحة'; end if;
  if not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة الجديدة خارج نطاقك المسموح'; end if;
  select appointment_car_id into v_car from public.installation_team_assignment_at(p_team_id,v_date);
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة في تاريخ المصروف'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'بيان المصروف مطلوب'; end if;
  update public.vehicle_treasury_expenses set installation_team_id=p_team_id,appointment_car_id=v_car,expense_date=v_date,description=btrim(p_description),amount=p_amount,notes=nullif(btrim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now() where id=p_id;
  return p_id;
end;
$$;
grant execute on function public.update_vehicle_treasury_expense(uuid,uuid,date,text,numeric,text) to authenticated;

create or replace function public.add_vehicle_treasury_expense_idempotent(
  p_team_id uuid,p_expense_date date,p_description text,p_amount numeric,p_notes text,p_client_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;v_car uuid;v_existing public.vehicle_treasury_expenses%rowtype;
  v_key text:=nullif(btrim(coalesce(p_client_operation_key,'')),'');v_date date:=coalesce(p_expense_date,current_date);
begin
  if not public.has_screen_permission('vehicleTreasury','add') then raise exception 'لا توجد صلاحية صرف من خزينة السيارة'; end if;
  if v_key is null then raise exception 'VEHICLE_TREASURY_IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into v_existing from public.vehicle_treasury_expenses where client_operation_key=v_key;
  if found then
    if not public.can_access_installation_team(v_existing.installation_team_id) then raise exception 'حركة الصرف غير مسموحة'; end if;
    return v_existing.id;
  end if;
  if not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة خارج نطاقك المسموح'; end if;
  select appointment_car_id into v_car from public.installation_team_assignment_at(p_team_id,v_date);
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة في تاريخ المصروف'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'بيان المصروف مطلوب'; end if;
  insert into public.vehicle_treasury_expenses(installation_team_id,appointment_car_id,expense_date,description,amount,notes,created_by,updated_by,client_operation_key)
  values(p_team_id,v_car,v_date,btrim(p_description),p_amount,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid(),v_key)
  on conflict do nothing returning id into v_id;
  if v_id is null then
    select * into v_existing from public.vehicle_treasury_expenses where client_operation_key=v_key;
    if not found then raise exception 'تعذر تثبيت عملية صرف خزينة السيارة'; end if;
    if not public.can_access_installation_team(v_existing.installation_team_id) then raise exception 'حركة الصرف غير مسموحة'; end if;
    v_id:=v_existing.id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.add_vehicle_treasury_expense_idempotent(uuid,date,text,numeric,text,text) to authenticated;

create or replace function public.update_vehicle_treasury_expense_guarded(
  p_id uuid,p_team_id uuid,p_expense_date date,p_description text,p_amount numeric,p_notes text,p_base_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old public.vehicle_treasury_expenses%rowtype;v_car uuid;
  v_date date:=coalesce(p_expense_date,current_date);v_description text:=btrim(coalesce(p_description,''));v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
begin
  if not public.has_screen_permission('vehicleTreasury','edit') then raise exception 'لا توجد صلاحية تعديل خزينة السيارة'; end if;
  select * into v_old from public.vehicle_treasury_expenses where id=p_id for update;
  if not found or not public.can_access_installation_team(v_old.installation_team_id) then raise exception 'حركة الصرف غير مسموحة'; end if;
  if not public.can_access_installation_team(p_team_id) then raise exception 'الفرقة / السيارة الجديدة خارج نطاقك المسموح'; end if;
  select appointment_car_id into v_car from public.installation_team_assignment_at(p_team_id,v_date);
  if v_car is null then raise exception 'لا توجد سيارة مرتبطة بهذه الفرقة في تاريخ المصروف'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  if nullif(v_description,'') is null then raise exception 'بيان المصروف مطلوب'; end if;
  if v_old.installation_team_id=p_team_id and v_old.appointment_car_id=v_car and v_old.expense_date=v_date
     and v_old.description=v_description and v_old.amount=p_amount and coalesce(v_old.notes,'')=coalesce(v_notes,'') then return p_id; end if;
  if p_base_updated_at is null then raise exception 'VT_SYNC_BASE_REQUIRED'; end if;
  if v_old.updated_at<>p_base_updated_at then
    raise exception using message='VEHICLE_TREASURY_SYNC_CONFLICT',detail=jsonb_build_object('id',p_id,'base_updated_at',p_base_updated_at,'server_updated_at',v_old.updated_at)::text;
  end if;
  update public.vehicle_treasury_expenses set installation_team_id=p_team_id,appointment_car_id=v_car,expense_date=v_date,description=v_description,amount=p_amount,notes=v_notes,updated_by=auth.uid(),updated_at=now() where id=p_id;
  return p_id;
end;
$$;
grant execute on function public.update_vehicle_treasury_expense_guarded(uuid,uuid,date,text,numeric,text,timestamptz) to authenticated;

-- New UI strings are seeded without overwriting user-customized translations.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  ar_text,en_text,default_ar,default_en,is_active,updated_at
) values
  ('appointments.schedule.error.historyMigrationRequired','installationSchedule','appointments','error','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد المحاولة.','Run the appointment team assignment history update first, then try again.','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد المحاولة.','Run the appointment team assignment history update first, then try again.',true,now()),
  ('appointments.schedule.error.assignmentLookupFailed','installationSchedule','appointments','error','تعذر تحديد ربط الفرقة في تاريخ الموعد: {error}','Unable to resolve the team assignment for the appointment date: {error}','تعذر تحديد ربط الفرقة في تاريخ الموعد: {error}','Unable to resolve the team assignment for the appointment date: {error}',true,now()),
  ('appointments.schedule.error.multiDayIncomplete','installationSchedule','appointments','error','أكمل التاريخ والوقت والفرقة لكل يوم.','Complete the date, time, and team for every day.','أكمل التاريخ والوقت والفرقة لكل يوم.','Complete the date, time, and team for every day.',true,now()),
  ('appointments.schedule.error.noGroomerVisitDate','installationSchedule','appointments','error','لا يوجد جرومر مرتبط بالفرقة في تاريخ الزيارة المحدد.','No groomer is assigned to the team on the selected visit date.','لا يوجد جرومر مرتبط بالفرقة في تاريخ الزيارة المحدد.','No groomer is assigned to the team on the selected visit date.',true,now()),
  ('appointments.schedule.error.fixedSlotRequired','installationSchedule','appointments','error','كل زيارة يجب أن تستخدم أحد مواعيد PETATOE الثابتة.','Every visit must use one of the fixed PETATOE time slots.','كل زيارة يجب أن تستخدم أحد مواعيد PETATOE الثابتة.','Every visit must use one of the fixed PETATOE time slots.',true,now()),
  ('appointments.schedule.error.dateRequired','installationSchedule','appointments','error','تاريخ الموعد مطلوب.','Appointment date is required.','تاريخ الموعد مطلوب.','Appointment date is required.',true,now()),
  ('appointments.schedule.error.timeRequired','installationSchedule','appointments','error','وقت الموعد مطلوب.','Appointment time is required.','وقت الموعد مطلوب.','Appointment time is required.',true,now()),
  ('appointments.schedule.error.invalidFixedSlot','installationSchedule','appointments','error','وقت الموعد يجب أن يكون أحد المواعيد الثابتة: 12 ظهرًا، 2، 4، 6، 8 أو 10 مساءً.','Appointment time must be one of the fixed slots: 12 PM, 2 PM, 4 PM, 6 PM, 8 PM, or 10 PM.','وقت الموعد يجب أن يكون أحد المواعيد الثابتة: 12 ظهرًا، 2، 4، 6، 8 أو 10 مساءً.','Appointment time must be one of the fixed slots: 12 PM, 2 PM, 4 PM, 6 PM, 8 PM, or 10 PM.',true,now()),
  ('appointments.schedule.error.teamRequired','installationSchedule','appointments','error','اختر فرقة المواعيد.','Select an appointment team.','اختر فرقة المواعيد.','Select an appointment team.',true,now()),
  ('appointments.schedule.error.noGroomerDate','installationSchedule','appointments','error','لا يوجد جرومر مرتبط بالفرقة في تاريخ الموعد المحدد.','No groomer is assigned to the team on the selected appointment date.','لا يوجد جرومر مرتبط بالفرقة في تاريخ الموعد المحدد.','No groomer is assigned to the team on the selected appointment date.',true,now()),
  ('appointments.schedule.error.suggestionSave','installationSchedule','appointments','error','تعذر حفظ اسم الفني في قائمة المقترحات: {error}','Unable to save the technician name to suggestions: {error}','تعذر حفظ اسم الفني في قائمة المقترحات: {error}','Unable to save the technician name to suggestions: {error}',true,now()),
  ('appointments.schedule.error.dayLockCheck','installationSchedule','appointments','error','تعذر التحقق من حالة يوم الجدولة: {error}','Unable to check the scheduling day status: {error}','تعذر التحقق من حالة يوم الجدولة: {error}','Unable to check the scheduling day status: {error}',true,now()),
  ('appointments.schedule.error.dayLocked','installationSchedule','appointments','error','هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.','This day is closed. Open the day before scheduling.','هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.','This day is closed. Open the day before scheduling.',true,now()),
  ('appointments.schedule.error.bookedCheck','installationSchedule','appointments','error','تعذر التحقق من موعد الفني: {error}','Unable to check the groomer booking: {error}','تعذر التحقق من موعد الفني: {error}','Unable to check the groomer booking: {error}',true,now()),
  ('appointments.schedule.error.slotBooked','installationSchedule','appointments','error','هذا الموعد محجوز للفني المحدد. اختر موعدًا آخر.','This time slot is booked for the selected groomer. Choose another time.','هذا الموعد محجوز للفني المحدد. اختر موعدًا آخر.','This time slot is booked for the selected groomer. Choose another time.',true,now()),
  ('appointments.schedule.error.assignmentSave','installationSchedule','appointments','error','تعذر حفظ الجدولة والإسناد: {error}','Unable to save scheduling and assignment: {error}','تعذر حفظ الجدولة والإسناد: {error}','Unable to save scheduling and assignment: {error}',true,now()),
  ('appointments.reports.error.historyMigrationRequired','installationReports','appointments','error','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد فتح التقرير.','Run the appointment team assignment history update first, then reopen the report.','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد فتح التقرير.','Run the appointment team assignment history update first, then reopen the report.',true,now()),
  ('appointments.common.unassigned','appointmentsShared','appointments','label','غير مسند','Unassigned','غير مسند','Unassigned',true,now()),
  ('appointments.common.unspecifiedService','appointmentsShared','appointments','label','خدمة غير محددة','Unspecified service','خدمة غير محددة','Unspecified service',true,now()),
  ('appointmentSettings.team.effectiveFrom','installationSettings','appointments','label','تاريخ سريان الربط','Assignment Effective Date','تاريخ سريان الربط','Assignment Effective Date',true,now()),
  ('appointmentSettings.team.effectiveFromCurrent','installationSettings','appointments','label','بداية الربط الحالي','Current Assignment Start','بداية الربط الحالي','Current Assignment Start',true,now()),
  ('appointmentSettings.team.effectiveHint','installationSettings','appointments','help','أي موعد أو تقرير قبل هذا التاريخ يحتفظ بالجرومر والسائق والسيارة السابقين، ومن هذا التاريخ يبدأ الربط الجديد.','Appointments and reports before this date keep the previous groomer, driver, and vehicle; the new assignment starts on this date.','أي موعد أو تقرير قبل هذا التاريخ يحتفظ بالجرومر والسائق والسيارة السابقين، ومن هذا التاريخ يبدأ الربط الجديد.','Appointments and reports before this date keep the previous groomer, driver, and vehicle; the new assignment starts on this date.',true,now()),
  ('appointmentSettings.team.effectiveRequired','installationSettings','appointments','error','تاريخ سريان الربط مطلوب.','Assignment effective date is required.','تاريخ سريان الربط مطلوب.','Assignment effective date is required.',true,now()),
  ('appointmentSettings.team.migrationRequired','installationSettings','appointments','error','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد المحاولة.','Run the appointment team assignment history update first, then try again.','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد المحاولة.','Run the appointment team assignment history update first, then try again.',true,now()),
  ('appointmentSettings.team.historyLoadRequired','installationSettings','appointments','error','شغّل Migration تاريخ ربط فرق المواعيد أولًا ثم أعد تحميل الصفحة.','Run the appointment team assignment history migration first, then reload the page.','شغّل Migration تاريخ ربط فرق المواعيد أولًا ثم أعد تحميل الصفحة.','Run the appointment team assignment history migration first, then reload the page.',true,now()),
  ('appointmentSettings.team.assignmentConflict','installationSettings','appointments','error','الجرومر أو السائق أو السيارة مرتبط بالفعل بفريق آخر خلال الفترة المحددة.','The groomer, driver, or vehicle is already assigned to another team during the selected period.','الجرومر أو السائق أو السيارة مرتبط بالفعل بفريق آخر خلال الفترة المحددة.','The groomer, driver, or vehicle is already assigned to another team during the selected period.',true,now()),
  ('appointmentSettings.team.saveHistoricalError','installationSettings','appointments','error','تعذر حفظ ربط الفريق التاريخي: {error}','Unable to save the historical team assignment: {error}','تعذر حفظ ربط الفريق التاريخي: {error}','Unable to save the historical team assignment: {error}',true,now()),
  ('appointmentNew.schedule.groomerFromTeam','installationRequestNew','appointments','help','يتم تحديد الجرومر تلقائيًا من الفرقة المختارة حسب تاريخ الموعد.','The groomer is selected automatically from the chosen team for the appointment date.','يتم تحديد الجرومر تلقائيًا من الفرقة المختارة حسب تاريخ الموعد.','The groomer is selected automatically from the chosen team for the appointment date.',true,now()),
  ('vehicleTreasury.filter.car','vehicleTreasury','finance','label','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('vehicleTreasury.filter.selectCar','vehicleTreasury','finance','option','اختر السيارة','Select vehicle','اختر السيارة','Select vehicle',true,now()),
  ('vehicleTreasury.expense.noTeamForDate','vehicleTreasury','finance','option','لا يوجد فريق مرتبط بهذه السيارة في التاريخ المحدد','No team is assigned to this vehicle on the selected date','لا يوجد فريق مرتبط بهذه السيارة في التاريخ المحدد','No team is assigned to this vehicle on the selected date',true,now()),
  ('vehicleTreasury.error.historyMigrationRequired','vehicleTreasury','finance','error','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد فتح خزينة السيارة.','Run the appointment team assignment history update first, then reopen Vehicle Treasury.','شغّل تحديث تاريخ ربط فرق المواعيد أولًا ثم أعد فتح خزينة السيارة.','Run the appointment team assignment history update first, then reopen Vehicle Treasury.',true,now()),
  ('vehicleTreasury.error.load','vehicleTreasury','finance','error','تعذر تحميل خزينة السيارة: {error}','Unable to load Vehicle Treasury: {error}','تعذر تحميل خزينة السيارة: {error}','Unable to load Vehicle Treasury: {error}',true,now()),
  ('pwa.update.release.r44r21.title','aboutApp','system','title','تاريخ ربط فرق المواعيد والعمولات','Effective-Dated Team Assignment History','تاريخ ربط فرق المواعيد والعمولات','Effective-Dated Team Assignment History',true,now()),
  ('pwa.update.release.r44r21.note1','aboutApp','system','help','حفظ تاريخ ربط الجرومر والسائق والسيارة حسب تاريخ السريان دون إعادة تفسير المواعيد الجديدة بعد النقل.','Preserves groomer, driver, and vehicle assignments by effective date without rewriting future assignment history.','حفظ تاريخ ربط الجرومر والسائق والسيارة حسب تاريخ السريان دون إعادة تفسير المواعيد الجديدة بعد النقل.','Preserves groomer, driver, and vehicle assignments by effective date without rewriting future assignment history.',true,now()),
  ('pwa.update.release.r44r21.note2','aboutApp','system','help','تطبيق الربط التاريخي على المواعيد والتنفيذ وتقارير العمولات وخزينة السيارة حسب تاريخ العملية.','Applies historical assignment resolution to appointments, execution, commission reports, and Vehicle Treasury by business date.','تطبيق الربط التاريخي على المواعيد والتنفيذ وتقارير العمولات وخزينة السيارة حسب تاريخ العملية.','Applies historical assignment resolution to appointments, execution, commission reports, and Vehicle Treasury by business date.',true,now()),
  ('pwa.update.release.r44r21.note3','aboutApp','system','help','تحديد الجرومر تلقائيًا من الفرقة وتاريخ الموعد مع الحفاظ على الصلاحيات والمزامنة وR44 Pruning بدون تغيير.','Automatically resolves the groomer from the team and appointment date while preserving permissions, sync, and R44 pruning behavior.','تحديد الجرومر تلقائيًا من الفرقة وتاريخ الموعد مع الحفاظ على الصلاحيات والمزامنة وR44 Pruning بدون تغيير.','Automatically resolves the groomer from the team and appointment date while preserving permissions, sync, and R44 pruning behavior.',true,now())
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

-- Verification / read-only diagnostics
select installation_team_id,effective_from,effective_to,groomer_name_snapshot,driver_name_snapshot,car_name_snapshot,source
from public.installation_team_assignment_history
order by installation_team_id,effective_from;
