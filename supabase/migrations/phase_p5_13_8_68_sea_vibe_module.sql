-- PETATOE P5.13.8.68 — SEA VIBE operational module
begin;

create extension if not exists pgcrypto;

create table if not exists public.sea_vibe_trip_types (
  id uuid primary key default gen_random_uuid(), name_ar text not null, name_en text not null,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(name_ar)
);
create table if not exists public.sea_vibe_payment_methods (
  id uuid primary key default gen_random_uuid(), name_ar text not null, name_en text not null,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(name_ar)
);
create table if not exists public.sea_vibe_expense_catalog (
  id uuid primary key default gen_random_uuid(), name_ar text not null, name_en text not null,
  system_key text unique, is_system boolean not null default false, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(name_ar)
);
create table if not exists public.sea_vibe_sailing_permit_fees (
  people_count integer not null check (people_count between 1 and 10), duration_hours integer not null check (duration_hours between 1 and 10),
  fee_amount numeric(12,2) not null check (fee_amount >= 0), points integer, updated_at timestamptz not null default now(),
  primary key (people_count,duration_hours)
);

create sequence if not exists public.sea_vibe_trip_serial_seq start with 1;
create sequence if not exists public.sea_vibe_asset_serial_seq start with 1;

grant usage, select on sequence public.sea_vibe_trip_serial_seq to authenticated;
grant usage, select on sequence public.sea_vibe_asset_serial_seq to authenticated;

create table if not exists public.sea_vibe_trips (
  id uuid primary key default gen_random_uuid(), trip_serial text not null unique, trip_date date not null, start_time time not null,
  duration_hours integer not null check (duration_hours between 1 and 10), people_count integer not null check (people_count between 1 and 10),
  trip_type_id uuid not null references public.sea_vibe_trip_types(id), total_value numeric(14,2) not null check (total_value >= 0), notes text,
  status text not null default 'open' check (status in ('open','closed')), closed_at timestamptz, closed_by uuid references auth.users(id),
  reopened_at timestamptz, reopened_by uuid references auth.users(id), created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sea_vibe_assets (
  id uuid primary key default gen_random_uuid(), asset_code text not null unique, asset_name text not null,
  initial_value numeric(14,2) not null check (initial_value >= 0), notes text, is_active boolean not null default true,
  created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sea_vibe_expenses (
  id uuid primary key default gen_random_uuid(), expense_scope text not null check (expense_scope in ('general','trip','asset')),
  trip_id uuid references public.sea_vibe_trips(id) on delete restrict, asset_id uuid references public.sea_vibe_assets(id) on delete restrict,
  expense_catalog_id uuid not null references public.sea_vibe_expense_catalog(id), expense_date date not null,
  amount numeric(14,2) not null check (amount >= 0), payment_method_id uuid references public.sea_vibe_payment_methods(id), notes text,
  is_system_generated boolean not null default false, system_key text, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint sea_vibe_expense_scope_owner check (
    (expense_scope='general' and trip_id is null and asset_id is null)
    or (expense_scope='trip' and trip_id is not null and asset_id is null)
    or (expense_scope='asset' and asset_id is not null and trip_id is null)
  )
);
create unique index if not exists sea_vibe_trip_system_expense_uidx on public.sea_vibe_expenses(trip_id,system_key)
where trip_id is not null and system_key is not null;
create table if not exists public.sea_vibe_expense_attachments (
  id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.sea_vibe_expenses(id) on delete cascade,
  storage_path text not null, file_name text not null, mime_type text, file_size bigint, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

create or replace function public.sea_vibe_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at:=now(); if tg_table_name in ('sea_vibe_trips','sea_vibe_assets','sea_vibe_expenses') then new.updated_by:=auth.uid(); end if; return new; end; $$;
create or replace function public.sea_vibe_assign_trip_serial() returns trigger language plpgsql as $$
begin
  if new.trip_serial is null or btrim(new.trip_serial)='' then new.trip_serial:='SV-'||extract(year from new.trip_date)::int||'-'||lpad(nextval('public.sea_vibe_trip_serial_seq')::text,6,'0'); end if;
  new.created_by:=coalesce(new.created_by,auth.uid()); new.updated_by:=coalesce(new.updated_by,auth.uid()); return new;
end; $$;
create or replace function public.sea_vibe_assign_asset_code() returns trigger language plpgsql as $$
begin
  if new.asset_code is null or btrim(new.asset_code)='' then new.asset_code:='AS-'||lpad(nextval('public.sea_vibe_asset_serial_seq')::text,4,'0'); end if;
  new.created_by:=coalesce(new.created_by,auth.uid()); new.updated_by:=coalesce(new.updated_by,auth.uid()); return new;
end; $$;

drop trigger if exists trg_sea_vibe_trip_serial on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_serial before insert on public.sea_vibe_trips for each row execute function public.sea_vibe_assign_trip_serial();
drop trigger if exists trg_sea_vibe_asset_code on public.sea_vibe_assets;
create trigger trg_sea_vibe_asset_code before insert on public.sea_vibe_assets for each row execute function public.sea_vibe_assign_asset_code();

do $$ declare t text; begin
  foreach t in array array['sea_vibe_trip_types','sea_vibe_payment_methods','sea_vibe_expense_catalog','sea_vibe_trips','sea_vibe_assets','sea_vibe_expenses'] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I',t,t);
    execute format('create trigger trg_%s_touch before update on public.%I for each row execute function public.sea_vibe_touch_updated_at()',t,t);
  end loop;
end $$;

insert into public.sea_vibe_trip_types(name_ar,name_en) values ('رحلة صيد','Fishing Trip'),('نزهة بحرية','Sea Leisure Trip') on conflict(name_ar) do nothing;
insert into public.sea_vibe_payment_methods(name_ar,name_en) values ('نقدي','Cash'),('بطاقة','Card'),('تحويل بنكي','Bank Transfer') on conflict(name_ar) do nothing;
insert into public.sea_vibe_expense_catalog(name_ar,name_en,system_key,is_system) values
('عمولة كابتن الرحلة','Captain Commission',null,false),('شراء ثلج','Ice Purchase',null,false),('بنزين','Fuel',null,false),('رسوم المرسى','Marina Fees',null,false),
('رسوم تصريح الإبحار','Sailing Permit Fee','sailing_permit',true)
on conflict(name_ar) do update set name_en=excluded.name_en,system_key=coalesce(public.sea_vibe_expense_catalog.system_key,excluded.system_key),is_system=public.sea_vibe_expense_catalog.is_system or excluded.is_system;

insert into public.sea_vibe_sailing_permit_fees(people_count,duration_hours,fee_amount,points)
select p,h,case when h>5 then 0 else round((3.45*p*h)::numeric,2) end,case when h>5 then null else 15*p*h end
from generate_series(1,10) p cross join generate_series(1,10) h
on conflict(people_count,duration_hours) do update set fee_amount=excluded.fee_amount,points=excluded.points,updated_at=now();

create or replace function public.sea_vibe_sync_permit_expense() returns trigger language plpgsql security definer set search_path=public as $$
declare v_catalog uuid; v_fee numeric(12,2);
begin
  select id into v_catalog from public.sea_vibe_expense_catalog where system_key='sailing_permit' limit 1;
  select fee_amount into v_fee from public.sea_vibe_sailing_permit_fees where people_count=new.people_count and duration_hours=new.duration_hours;
  if v_catalog is null or v_fee is null then raise exception 'SEA_VIBE_PERMIT_REFERENCE_MISSING'; end if;
  insert into public.sea_vibe_expenses(expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,is_system_generated,system_key,created_by,updated_by)
  values('trip',new.id,v_catalog,new.trip_date,v_fee,null,'Auto-calculated from sailing permit reference matrix',true,'sailing_permit',coalesce(new.created_by,auth.uid()),auth.uid())
  on conflict(trip_id,system_key) where trip_id is not null and system_key is not null
  do update set expense_catalog_id=excluded.expense_catalog_id,expense_date=excluded.expense_date,amount=excluded.amount,updated_by=auth.uid(),updated_at=now();
  return new;
end; $$;
drop trigger if exists trg_sea_vibe_trip_permit_expense on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_permit_expense after insert or update of trip_date,duration_hours,people_count on public.sea_vibe_trips for each row execute function public.sea_vibe_sync_permit_expense();

create or replace function public.sea_vibe_add_expense(
  p_scope text,p_trip_id uuid,p_asset_id uuid,p_catalog_id uuid,p_date date,p_amount numeric,p_payment_method_id uuid default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_status text; v_screen text;
begin
  v_screen:=case when p_scope='trip' then 'seaVibeExpenseNew' when p_scope='asset' then 'seaVibeExpenseNew' else 'seaVibeExpenseNew' end;
  if not public.has_screen_permission(v_screen,'add') then raise exception 'permission_denied'; end if;
  if p_scope='trip' then
    select status into v_status from public.sea_vibe_trips where id=p_trip_id for update;
    if v_status is null then raise exception 'trip_not_found'; end if;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  end if;
  insert into public.sea_vibe_expenses(expense_scope,trip_id,asset_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,created_by,updated_by)
  values(p_scope,case when p_scope='trip' then p_trip_id else null end,case when p_scope='asset' then p_asset_id else null end,p_catalog_id,p_date,p_amount,p_payment_method_id,nullif(btrim(p_notes),''),auth.uid(),auth.uid()) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.sea_vibe_add_expense(text,uuid,uuid,uuid,date,numeric,uuid,text) to authenticated;

create or replace function public.sea_vibe_guard_trip_expense_mutation() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_trip_id uuid; v_status text; v_system boolean;
begin
  v_trip_id:=coalesce(new.trip_id,old.trip_id);
  v_system:=coalesce(new.is_system_generated,old.is_system_generated,false);
  if v_trip_id is not null and not v_system then
    select status into v_status from public.sea_vibe_trips where id=v_trip_id;
    if v_status='closed' then raise exception 'trip_closed'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists trg_sea_vibe_guard_trip_expense_mutation on public.sea_vibe_expenses;
create trigger trg_sea_vibe_guard_trip_expense_mutation
before update or delete on public.sea_vibe_expenses
for each row execute function public.sea_vibe_guard_trip_expense_mutation();


create or replace view public.sea_vibe_assets_with_value with (security_invoker=true) as
select a.*,coalesce(sum(e.amount) filter(where e.expense_scope='asset'),0)::numeric(14,2) as capitalized_expenses,
       (a.initial_value+coalesce(sum(e.amount) filter(where e.expense_scope='asset'),0))::numeric(14,2) as current_value
from public.sea_vibe_assets a left join public.sea_vibe_expenses e on e.asset_id=a.id group by a.id;

create or replace view public.sea_vibe_trip_financials with (security_invoker=true) as
select t.*,coalesce(sum(e.amount) filter(where e.expense_scope='trip'),0)::numeric(14,2) as trip_expenses,
       (t.total_value-coalesce(sum(e.amount) filter(where e.expense_scope='trip'),0))::numeric(14,2) as net_profit
from public.sea_vibe_trips t left join public.sea_vibe_expenses e on e.trip_id=t.id group by t.id;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active) values
('seaVibeTrips','SEA VIBE - الرحلات','SEA VIBE',150,true),
('seaVibeTripNew','SEA VIBE - إضافة رحلة','SEA VIBE',151,true),
('seaVibeTripDetails','SEA VIBE - تفاصيل الرحلة','SEA VIBE',152,true),
('seaVibeExpenseNew','SEA VIBE - إضافة مصروف','SEA VIBE',153,true),
('seaVibeGeneralExpenses','SEA VIBE - المصاريف العامة','SEA VIBE',154,true),
('seaVibeAssets','SEA VIBE - الأصول','SEA VIBE',155,true),
('seaVibeReference','SEA VIBE - البيانات المرجعية','SEA VIBE',156,true),
('seaVibeReports','SEA VIBE - التقارير والتحليلات','SEA VIBE',157,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,screen_key,true,true,true,true,true from public.app_screens where screen_key like 'seaVibe%'
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true,updated_at=now();

create or replace function public.sea_vibe_can_view() returns boolean language sql stable security definer set search_path=public as $$
  select public.has_screen_permission('seaVibeTrips','view')
      or public.has_screen_permission('seaVibeTripNew','view')
      or public.has_screen_permission('seaVibeTripDetails','view')
      or public.has_screen_permission('seaVibeExpenseNew','view')
      or public.has_screen_permission('seaVibeGeneralExpenses','view')
      or public.has_screen_permission('seaVibeAssets','view')
      or public.has_screen_permission('seaVibeReference','view')
      or public.has_screen_permission('seaVibeReports','view');
$$;
grant execute on function public.sea_vibe_can_view() to authenticated;

alter table public.sea_vibe_trip_types enable row level security;
alter table public.sea_vibe_payment_methods enable row level security;
alter table public.sea_vibe_expense_catalog enable row level security;
alter table public.sea_vibe_sailing_permit_fees enable row level security;
alter table public.sea_vibe_trips enable row level security;
alter table public.sea_vibe_assets enable row level security;
alter table public.sea_vibe_expenses enable row level security;
alter table public.sea_vibe_expense_attachments enable row level security;

do $$ declare t text; begin
  foreach t in array array['sea_vibe_trip_types','sea_vibe_payment_methods','sea_vibe_expense_catalog','sea_vibe_sailing_permit_fees'] loop
    execute format('drop policy if exists "sea vibe reference read" on public.%I',t);
    execute format('create policy "sea vibe reference read" on public.%I for select to authenticated using (public.sea_vibe_can_view())',t);
  end loop;
end $$;

drop policy if exists "sea vibe reference manage trip types" on public.sea_vibe_trip_types;
create policy "sea vibe reference manage trip types" on public.sea_vibe_trip_types for all to authenticated using(public.has_screen_permission('seaVibeReference','edit')) with check(public.has_screen_permission('seaVibeReference','edit'));
drop policy if exists "sea vibe reference manage payment methods" on public.sea_vibe_payment_methods;
create policy "sea vibe reference manage payment methods" on public.sea_vibe_payment_methods for all to authenticated using(public.has_screen_permission('seaVibeReference','edit')) with check(public.has_screen_permission('seaVibeReference','edit'));
drop policy if exists "sea vibe reference manage expense catalog" on public.sea_vibe_expense_catalog;
create policy "sea vibe reference manage expense catalog" on public.sea_vibe_expense_catalog for all to authenticated using(public.has_screen_permission('seaVibeReference','edit')) with check(public.has_screen_permission('seaVibeReference','edit'));
drop policy if exists "sea vibe reference manage permit fees" on public.sea_vibe_sailing_permit_fees;
create policy "sea vibe reference manage permit fees" on public.sea_vibe_sailing_permit_fees for all to authenticated using(public.has_screen_permission('seaVibeReference','edit')) with check(public.has_screen_permission('seaVibeReference','edit'));

drop policy if exists "sea vibe trips read" on public.sea_vibe_trips;
create policy "sea vibe trips read" on public.sea_vibe_trips for select to authenticated using(public.sea_vibe_can_view());
drop policy if exists "sea vibe trips insert" on public.sea_vibe_trips;
create policy "sea vibe trips insert" on public.sea_vibe_trips for insert to authenticated with check(public.has_screen_permission('seaVibeTripNew','add') or public.has_screen_permission('seaVibeTrips','add'));
drop policy if exists "sea vibe trips update" on public.sea_vibe_trips;
create policy "sea vibe trips update" on public.sea_vibe_trips for update to authenticated using(public.has_screen_permission('seaVibeTrips','edit')) with check(public.has_screen_permission('seaVibeTrips','edit'));

drop policy if exists "sea vibe assets read" on public.sea_vibe_assets;
create policy "sea vibe assets read" on public.sea_vibe_assets for select to authenticated using(public.sea_vibe_can_view());
drop policy if exists "sea vibe assets manage" on public.sea_vibe_assets;
create policy "sea vibe assets manage" on public.sea_vibe_assets for all to authenticated using(public.has_screen_permission('seaVibeAssets','edit')) with check(public.has_screen_permission('seaVibeAssets','add') or public.has_screen_permission('seaVibeAssets','edit'));

drop policy if exists "sea vibe expenses read" on public.sea_vibe_expenses;
create policy "sea vibe expenses read" on public.sea_vibe_expenses for select to authenticated using(public.sea_vibe_can_view());
drop policy if exists "sea vibe expenses update" on public.sea_vibe_expenses;
create policy "sea vibe expenses update" on public.sea_vibe_expenses for update to authenticated using(not is_system_generated and public.has_screen_permission('seaVibeExpenseNew','edit')) with check(not is_system_generated and public.has_screen_permission('seaVibeExpenseNew','edit'));
drop policy if exists "sea vibe expenses delete" on public.sea_vibe_expenses;
create policy "sea vibe expenses delete" on public.sea_vibe_expenses for delete to authenticated using(not is_system_generated and public.has_screen_permission('seaVibeExpenseNew','delete'));

drop policy if exists "sea vibe attachments read" on public.sea_vibe_expense_attachments;
create policy "sea vibe attachments read" on public.sea_vibe_expense_attachments for select to authenticated using(public.sea_vibe_can_view());
drop policy if exists "sea vibe attachments manage" on public.sea_vibe_expense_attachments;
create policy "sea vibe attachments manage" on public.sea_vibe_expense_attachments for all to authenticated using(public.has_screen_permission('seaVibeExpenseNew','edit')) with check(public.has_screen_permission('seaVibeExpenseNew','add') or public.has_screen_permission('seaVibeExpenseNew','edit'));

grant select,insert,update,delete on public.sea_vibe_trip_types to authenticated;
grant select,insert,update,delete on public.sea_vibe_payment_methods to authenticated;
grant select,insert,update,delete on public.sea_vibe_expense_catalog to authenticated;
grant select,insert,update,delete on public.sea_vibe_sailing_permit_fees to authenticated;
grant select,insert,update,delete on public.sea_vibe_trips to authenticated;
grant select,insert,update,delete on public.sea_vibe_assets to authenticated;
grant select,insert,update,delete on public.sea_vibe_expenses to authenticated;
grant select,insert,update,delete on public.sea_vibe_expense_attachments to authenticated;
grant select on public.sea_vibe_assets_with_value,public.sea_vibe_trip_financials to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sea-vibe-expenses','sea-vibe-expenses',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "sea vibe expense files read" on storage.objects;
create policy "sea vibe expense files read" on storage.objects for select to authenticated using(bucket_id='sea-vibe-expenses' and (public.sea_vibe_can_view()));
drop policy if exists "sea vibe expense files add" on storage.objects;
create policy "sea vibe expense files add" on storage.objects for insert to authenticated with check(bucket_id='sea-vibe-expenses' and public.has_screen_permission('seaVibeExpenseNew','add'));
drop policy if exists "sea vibe expense files delete" on storage.objects;
create policy "sea vibe expense files delete" on storage.objects for delete to authenticated using(bucket_id='sea-vibe-expenses' and public.has_screen_permission('seaVibeExpenseNew','delete'));

commit;
