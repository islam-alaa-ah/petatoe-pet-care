-- PETATOE — P3 Appointment Settings Master Data
-- Employees (Groomer / Driver) + Cars + team binding by master IDs
begin;

create table if not exists public.appointment_employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  employee_type text not null check (employee_type in ('جرومر','سائق')),
  phone text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_employees_name_type_unique unique (full_name, employee_type)
);

create table if not exists public.appointment_cars (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  plate_number text unique,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_appointment_employees_updated_at on public.appointment_employees;
create trigger trg_appointment_employees_updated_at
before update on public.appointment_employees
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointment_cars_updated_at on public.appointment_cars;
create trigger trg_appointment_cars_updated_at
before update on public.appointment_cars
for each row execute function public.set_updated_at();

alter table public.appointment_employees enable row level security;
alter table public.appointment_cars enable row level security;

-- Settings permission contract.
drop policy if exists "appointment employees view" on public.appointment_employees;
drop policy if exists "appointment employees add" on public.appointment_employees;
drop policy if exists "appointment employees edit" on public.appointment_employees;
drop policy if exists "appointment employees delete" on public.appointment_employees;
create policy "appointment employees view" on public.appointment_employees
for select to authenticated using(public.has_screen_permission('installationSettings','view'));
create policy "appointment employees add" on public.appointment_employees
for insert to authenticated with check(public.has_screen_permission('installationSettings','add'));
create policy "appointment employees edit" on public.appointment_employees
for update to authenticated using(public.has_screen_permission('installationSettings','edit'))
with check(public.has_screen_permission('installationSettings','edit'));
create policy "appointment employees delete" on public.appointment_employees
for delete to authenticated using(public.has_screen_permission('installationSettings','delete'));

drop policy if exists "appointment cars view" on public.appointment_cars;
drop policy if exists "appointment cars add" on public.appointment_cars;
drop policy if exists "appointment cars edit" on public.appointment_cars;
drop policy if exists "appointment cars delete" on public.appointment_cars;
create policy "appointment cars view" on public.appointment_cars
for select to authenticated using(public.has_screen_permission('installationSettings','view'));
create policy "appointment cars add" on public.appointment_cars
for insert to authenticated with check(public.has_screen_permission('installationSettings','add'));
create policy "appointment cars edit" on public.appointment_cars
for update to authenticated using(public.has_screen_permission('installationSettings','edit'))
with check(public.has_screen_permission('installationSettings','edit'));
create policy "appointment cars delete" on public.appointment_cars
for delete to authenticated using(public.has_screen_permission('installationSettings','delete'));

grant select,insert,update,delete on public.appointment_employees,public.appointment_cars to authenticated;

alter table public.installation_teams
  add column if not exists groomer_employee_id uuid references public.appointment_employees(id) on delete restrict,
  add column if not exists driver_employee_id uuid references public.appointment_employees(id) on delete restrict,
  add column if not exists appointment_car_id uuid references public.appointment_cars(id) on delete restrict;

create index if not exists idx_installation_teams_groomer_employee_id on public.installation_teams(groomer_employee_id);
create index if not exists idx_installation_teams_driver_employee_id on public.installation_teams(driver_employee_id);
create index if not exists idx_installation_teams_appointment_car_id on public.installation_teams(appointment_car_id);

-- A currently active resource can belong to one active appointment team only.
create unique index if not exists uq_installation_teams_active_groomer
  on public.installation_teams(groomer_employee_id)
  where groomer_employee_id is not null and status <> 'غير نشطة';
create unique index if not exists uq_installation_teams_active_driver
  on public.installation_teams(driver_employee_id)
  where driver_employee_id is not null and status <> 'غير نشطة';
create unique index if not exists uq_installation_teams_active_car
  on public.installation_teams(appointment_car_id)
  where appointment_car_id is not null and status <> 'غير نشطة';

create or replace function public.sync_petatoe_appointment_team_name()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_groomer public.appointment_employees%rowtype;
  v_driver public.appointment_employees%rowtype;
  v_car public.appointment_cars%rowtype;
  v_groomer_name text;
  v_driver_name text;
  v_car_name text;
begin
  if new.groomer_employee_id is not null
     or new.driver_employee_id is not null
     or new.appointment_car_id is not null then
    if new.groomer_employee_id is null or new.driver_employee_id is null or new.appointment_car_id is null then
      raise exception 'الجرومر والسائق والسيارة بيانات مطلوبة لفريق الموعد' using errcode='23514';
    end if;

    select * into v_groomer from public.appointment_employees where id=new.groomer_employee_id;
    if not found or v_groomer.employee_type <> 'جرومر' then
      raise exception 'الموظف المختار كجرومر غير صالح' using errcode='23514';
    end if;
    if not v_groomer.is_active then
      raise exception 'الجرومر المختار غير نشط' using errcode='23514';
    end if;

    select * into v_driver from public.appointment_employees where id=new.driver_employee_id;
    if not found or v_driver.employee_type <> 'سائق' then
      raise exception 'الموظف المختار كسائق غير صالح' using errcode='23514';
    end if;
    if not v_driver.is_active then
      raise exception 'السائق المختار غير نشط' using errcode='23514';
    end if;

    select * into v_car from public.appointment_cars where id=new.appointment_car_id;
    if not found then
      raise exception 'السيارة المختارة غير موجودة' using errcode='23514';
    end if;
    if not v_car.is_active then
      raise exception 'السيارة المختارة غير نشطة' using errcode='23514';
    end if;

    new.groomer_name:=v_groomer.full_name;
    new.driver_name:=v_driver.full_name;
    new.car_name:=v_car.name;
    new.leader_name:=v_groomer.full_name;
    new.phone:=null;
    new.city:=null;
    new.name:=v_groomer.full_name||' - '||v_driver.full_name||' - '||v_car.name;
    return new;
  end if;

  -- Legacy compatibility for any team created before P3.
  v_groomer_name:=nullif(btrim(coalesce(new.groomer_name,'')),'');
  v_driver_name:=nullif(btrim(coalesce(new.driver_name,'')),'');
  v_car_name:=nullif(btrim(coalesce(new.car_name,'')),'');
  if v_groomer_name is not null or v_driver_name is not null or v_car_name is not null then
    if v_groomer_name is null or v_driver_name is null or v_car_name is null then
      raise exception 'الجرومر والسائق والسيارة بيانات مطلوبة لفريق الموعد' using errcode='23514';
    end if;
    new.leader_name:=v_groomer_name;
    new.name:=v_groomer_name||' - '||v_driver_name||' - '||v_car_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_petatoe_appointment_team_name on public.installation_teams;
create trigger trg_sync_petatoe_appointment_team_name
before insert or update
on public.installation_teams
for each row execute function public.sync_petatoe_appointment_team_name();

notify pgrst,'reload schema';
commit;

-- Verification
select 'appointment_employees' as object_name,count(*)::bigint as row_count from public.appointment_employees
union all
select 'appointment_cars',count(*)::bigint from public.appointment_cars
union all
select 'installation_teams',count(*)::bigint from public.installation_teams
order by object_name;

select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='installation_teams'
  and column_name in('groomer_employee_id','driver_employee_id','appointment_car_id')
order by column_name;
