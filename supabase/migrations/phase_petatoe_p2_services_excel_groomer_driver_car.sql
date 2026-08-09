-- PETATOE — P2 Appointment Settings
-- Services Excel Import + Groomer / Driver / Car appointment teams
begin;

alter table public.installation_teams
  add column if not exists groomer_name text,
  add column if not exists driver_name text,
  add column if not exists car_name text;

update public.installation_teams
set groomer_name=coalesce(nullif(btrim(groomer_name),''),nullif(btrim(leader_name),''))
where groomer_name is null or btrim(groomer_name)='';

create index if not exists idx_installation_teams_groomer_name on public.installation_teams(groomer_name);
create index if not exists idx_installation_teams_driver_name on public.installation_teams(driver_name);
create index if not exists idx_installation_teams_car_name on public.installation_teams(car_name);

create or replace function public.sync_petatoe_appointment_team_name()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_groomer text;
  v_driver text;
  v_car text;
begin
  v_groomer:=nullif(btrim(coalesce(new.groomer_name,'')),'');
  v_driver:=nullif(btrim(coalesce(new.driver_name,'')),'');
  v_car:=nullif(btrim(coalesce(new.car_name,'')),'');
  if v_groomer is not null or v_driver is not null or v_car is not null then
    if v_groomer is null or v_driver is null or v_car is null then
      raise exception 'Groomer, driver and car are required for an appointment team' using errcode='23514';
    end if;
    new.groomer_name:=v_groomer;
    new.driver_name:=v_driver;
    new.car_name:=v_car;
    new.leader_name:=v_groomer;
    new.name:=v_groomer||' - '||v_driver||' - '||v_car;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_petatoe_appointment_team_name on public.installation_teams;
create trigger trg_sync_petatoe_appointment_team_name
before insert or update of groomer_name,driver_name,car_name
on public.installation_teams
for each row execute function public.sync_petatoe_appointment_team_name();

notify pgrst,'reload schema';
commit;

select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='installation_teams'
  and column_name in('groomer_name','driver_name','car_name')
order by column_name;
