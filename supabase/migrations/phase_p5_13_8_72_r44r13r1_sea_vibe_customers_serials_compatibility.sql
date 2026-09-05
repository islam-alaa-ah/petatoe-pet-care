-- R44R13R1 — SEA VIBE Customers + Trip Serial Routing — Production View Compatibility
-- Version 18.56.56 / Build 185656
-- Independent SEA VIBE customer master, customer requirement by trip type,
-- Khawr serial series, and canonical sync integration.

begin;

-- Production compatibility preflight. The 42P16 failure in the superseded,
-- unapplied R44R13 package came from expanding t.* against a legacy view whose
-- published contract is intentionally narrower than sea_vibe_trips. Fail closed
-- if the first 20 production columns are not the verified contract supplied for
-- this recovery.
do $$
declare
  v_columns text[];
begin
  select array_agg(column_name order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema='public'
    and table_name='sea_vibe_trip_financials'
    and ordinal_position<=20;

  if v_columns is distinct from array[
    'id','trip_serial','trip_date','start_time','duration_hours','people_count',
    'trip_type_id','total_value','notes','status','closed_at','closed_by',
    'reopened_at','reopened_by','created_by','updated_by','created_at','updated_at',
    'trip_expenses','net_profit'
  ]::text[] then
    raise exception 'R44R13R1_TRIP_FINANCIALS_CONTRACT_MISMATCH: %', v_columns;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Trip-type controls and customer ownership
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_trip_types
  add column if not exists requires_customer boolean not null default true,
  add column if not exists serial_series_key text not null default 'standard';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='sea_vibe_trip_types_serial_series_key_chk') then
    alter table public.sea_vibe_trip_types
      add constraint sea_vibe_trip_types_serial_series_key_chk
      check (serial_series_key in ('standard','khawr'));
  end if;
end $$;

-- Existing Khawr/Sea Leisure type is the no-customer, separate-series type.
update public.sea_vibe_trip_types
set requires_customer=false, serial_series_key='khawr', updated_at=now()
where name_ar ilike '%خور%'
   or lower(coalesce(name_en,'')) like '%khawr%'
   or lower(coalesce(name_en,'')) like '%khor%';

create table if not exists public.sea_vibe_customers(
  id uuid primary key default gen_random_uuid(),
  customer_number text not null,
  full_name text not null,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sea_vibe_customers_number_nonempty check (btrim(customer_number)<>''),
  constraint sea_vibe_customers_name_nonempty check (btrim(full_name)<>'')
);
create unique index if not exists sea_vibe_customers_number_uidx on public.sea_vibe_customers(lower(btrim(customer_number)));
create index if not exists sea_vibe_customers_name_idx on public.sea_vibe_customers(lower(full_name));

alter table public.sea_vibe_trips add column if not exists customer_id uuid references public.sea_vibe_customers(id);
create index if not exists sea_vibe_trips_customer_id_idx on public.sea_vibe_trips(customer_id);

create or replace function public.sea_vibe_touch_customer_r44r13()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.customer_number:=btrim(new.customer_number);
  new.full_name:=btrim(new.full_name);
  new.updated_at:=now();
  new.updated_by:=coalesce(auth.uid(),new.updated_by);
  return new;
end; $$;
drop trigger if exists trg_sea_vibe_touch_customer_r44r13 on public.sea_vibe_customers;
create trigger trg_sea_vibe_touch_customer_r44r13 before insert or update on public.sea_vibe_customers
for each row execute function public.sea_vibe_touch_customer_r44r13();

-- ---------------------------------------------------------------------------
-- 2) Server-side trip/customer validation with historical grandfathering
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_validate_trip_customer_r44r13()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_required boolean;
  v_customer_active boolean;
begin
  select requires_customer into v_required from public.sea_vibe_trip_types where id=new.trip_type_id;
  if v_required is null then raise exception 'SEA_VIBE_TRIP_TYPE_NOT_FOUND'; end if;

  if not v_required then
    new.customer_id:=null;
    return new;
  end if;

  if new.customer_id is null then
    -- Existing historical trips created before R44R13 remain editable until
    -- the operator explicitly links a customer. Changing into a customer-
    -- required type is not grandfathered.
    if tg_op='UPDATE' and old.customer_id is null and old.trip_type_id=new.trip_type_id then
      return new;
    end if;
    raise exception 'SEA_VIBE_TRIP_CUSTOMER_REQUIRED';
  end if;

  select is_active into v_customer_active from public.sea_vibe_customers where id=new.customer_id;
  if v_customer_active is null then raise exception 'SEA_VIBE_CUSTOMER_NOT_FOUND'; end if;
  if not v_customer_active and not (tg_op='UPDATE' and old.customer_id is not distinct from new.customer_id) then
    raise exception 'SEA_VIBE_CUSTOMER_INACTIVE';
  end if;
  return new;
end; $$;
drop trigger if exists trg_sea_vibe_00_validate_trip_customer_r44r13 on public.sea_vibe_trips;
create trigger trg_sea_vibe_00_validate_trip_customer_r44r13
before insert or update of trip_type_id,customer_id on public.sea_vibe_trips
for each row execute function public.sea_vibe_validate_trip_customer_r44r13();

-- ---------------------------------------------------------------------------
-- 3) Canonical serial assignment: existing standard sequence + Khawr series
-- ---------------------------------------------------------------------------
create sequence if not exists public.sea_vibe_khawr_trip_serial_seq start with 1000001 increment by 1 minvalue 1000001;
revoke all on sequence public.sea_vibe_khawr_trip_serial_seq from public,anon,authenticated;
do $$ declare v_max bigint; begin
  select max(trip_serial::bigint) into v_max
  from public.sea_vibe_trips
  where trip_serial ~ '^[0-9]+$' and trip_serial::numeric>=1000001;
  if coalesce(v_max,0)>=1000001 then perform setval('public.sea_vibe_khawr_trip_serial_seq',v_max,true); end if;
end $$;

create or replace function public.sea_vibe_assign_trip_serial() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_series text;
  v_seq bigint;
begin
  if new.trip_serial is not null and btrim(new.trip_serial)<>'' then return new; end if;
  select serial_series_key into v_series from public.sea_vibe_trip_types where id=new.trip_type_id;
  if coalesce(v_series,'standard')='khawr' then
    v_seq:=nextval('public.sea_vibe_khawr_trip_serial_seq');
    new.trip_serial:=v_seq::text;
  else
    v_seq:=nextval('public.sea_vibe_trip_serial_seq');
    new.trip_serial:='SV-'||extract(year from coalesce(new.trip_date,current_date))::int||'-'||lpad(v_seq::text,6,'0');
  end if;
  new.created_by:=coalesce(new.created_by,auth.uid());
  new.updated_by:=coalesce(new.updated_by,auth.uid());
  return new;
end; $$;

create or replace function public.preview_sea_vibe_trip_serial_r44r13(p_trip_type_id uuid,p_trip_date date default current_date)
returns text language plpgsql security definer set search_path=public as $$
declare v_series text; v_last bigint; v_called boolean; v_next bigint;
begin
  if not (public.has_screen_permission('seaVibeTripNew','view') or public.has_screen_permission('seaVibeTrips','view')) then raise exception 'permission_denied'; end if;
  select serial_series_key into v_series from public.sea_vibe_trip_types where id=p_trip_type_id;
  if v_series is null then return ''; end if;
  if v_series='khawr' then
    select last_value,is_called into v_last,v_called from public.sea_vibe_khawr_trip_serial_seq;
    v_next:=case when v_called then v_last+1 else v_last end;
    return v_next::text;
  end if;
  select last_value,is_called into v_last,v_called from public.sea_vibe_trip_serial_seq;
  v_next:=case when v_called then v_last+1 else v_last end;
  return 'SV-'||extract(year from coalesce(p_trip_date,current_date))::int||'-'||lpad(v_next::text,6,'0');
end; $$;
revoke all on function public.preview_sea_vibe_trip_serial_r44r13(uuid,date) from public,anon;
grant execute on function public.preview_sea_vibe_trip_serial_r44r13(uuid,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) SEA VIBE Customers permission surface + least-privilege RLS/RPC
-- ---------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values('seaVibeCustomers','SEA VIBE - العملاء','SEA VIBE',151,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,is_active=true;
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,'seaVibeCustomers',true,true,true,false,true
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_export=true,updated_at=now();

create or replace function public.sea_vibe_can_view()
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_screen_permission('seaVibeTrips','view')
      or public.has_screen_permission('seaVibeTripNew','view')
      or public.has_screen_permission('seaVibeTripDetails','view')
      or public.has_screen_permission('seaVibeExpenseNew','view')
      or public.has_screen_permission('seaVibeGeneralExpenses','view')
      or public.has_screen_permission('seaVibeAssets','view')
      or public.has_screen_permission('seaVibeTreasury','view')
      or public.has_screen_permission('seaVibeZawel','view')
      or public.has_screen_permission('seaVibeFuel','view')
      or public.has_screen_permission('seaVibeCustomers','view')
      or public.has_screen_permission('seaVibeReference','view')
      or public.has_screen_permission('seaVibeReports','view');
$$;
grant execute on function public.sea_vibe_can_view() to authenticated;

alter table public.sea_vibe_customers enable row level security;
revoke all on table public.sea_vibe_customers from anon,authenticated;
grant select on table public.sea_vibe_customers to authenticated;
drop policy if exists "sea vibe customers read" on public.sea_vibe_customers;
create policy "sea vibe customers read" on public.sea_vibe_customers for select to authenticated using(public.sea_vibe_can_view());

create or replace function public.save_sea_vibe_customer_r44r13(
  p_id uuid default null,p_customer_number text default null,p_full_name text default null,
  p_notes text default null,p_is_active boolean default true
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_number text:=btrim(coalesce(p_customer_number,'')); v_name text:=btrim(coalesce(p_full_name,''));
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if v_number='' then raise exception 'SEA_VIBE_CUSTOMER_NUMBER_REQUIRED'; end if;
  if v_name='' then raise exception 'SEA_VIBE_CUSTOMER_NAME_REQUIRED'; end if;
  if p_id is null then
    if not public.has_screen_permission('seaVibeCustomers','add') then raise exception 'permission_denied'; end if;
    insert into public.sea_vibe_customers(customer_number,full_name,notes,is_active,created_by,updated_by)
    values(v_number,v_name,nullif(btrim(coalesce(p_notes,'')),''),coalesce(p_is_active,true),auth.uid(),auth.uid()) returning id into v_id;
  else
    if not public.has_screen_permission('seaVibeCustomers','edit') then raise exception 'permission_denied'; end if;
    update public.sea_vibe_customers set customer_number=v_number,full_name=v_name,notes=nullif(btrim(coalesce(p_notes,'')),''),is_active=coalesce(p_is_active,true),updated_by=auth.uid() where id=p_id returning id into v_id;
    if v_id is null then raise exception 'SEA_VIBE_CUSTOMER_NOT_FOUND'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'SEA_VIBE_CUSTOMER_NUMBER_EXISTS';
end; $$;
revoke all on function public.save_sea_vibe_customer_r44r13(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.save_sea_vibe_customer_r44r13(uuid,text,text,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Financial read model includes customer snapshots for trip UI
-- ---------------------------------------------------------------------------
-- Production compatibility contract: the existing view has 20 canonical columns.
-- Keep those first 20 names and positions byte-for-contract compatible, then append
-- the new SEA VIBE customer fields. Never use t.* here because sea_vibe_trips has
-- acquired additional physical columns over time that are intentionally not part
-- of this legacy read-model contract.
create or replace view public.sea_vibe_trip_financials with (security_invoker=true) as
select
  t.id,
  t.trip_serial,
  t.trip_date,
  t.start_time,
  t.duration_hours,
  t.people_count,
  t.trip_type_id,
  t.total_value,
  t.notes,
  t.status,
  t.closed_at,
  t.closed_by,
  t.reopened_at,
  t.reopened_by,
  t.created_by,
  t.updated_by,
  t.created_at,
  t.updated_at,
  coalesce(sum(e.amount) filter(where e.expense_scope='trip'),0)::numeric(14,2) as trip_expenses,
  (t.total_value-coalesce(sum(e.amount) filter(where e.expense_scope='trip'),0))::numeric(14,2) as net_profit,
  t.customer_id,
  c.customer_number,
  c.full_name as customer_name
from public.sea_vibe_trips t
left join public.sea_vibe_customers c on c.id=t.customer_id
left join public.sea_vibe_expenses e on e.trip_id=t.id
group by t.id,c.customer_number,c.full_name;

-- Assert the replacement kept the existing contract intact and appended only
-- the customer linkage plus display columns at the end.
do $$
declare
  v_columns text[];
begin
  select array_agg(column_name order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema='public'
    and table_name='sea_vibe_trip_financials';

  if v_columns is distinct from array[
    'id','trip_serial','trip_date','start_time','duration_hours','people_count',
    'trip_type_id','total_value','notes','status','closed_at','closed_by',
    'reopened_at','reopened_by','created_by','updated_by','created_at','updated_at',
    'trip_expenses','net_profit','customer_id','customer_number','customer_name'
  ]::text[] then
    raise exception 'R44R13R1_TRIP_FINANCIALS_POSTCHECK_FAILED: %', v_columns;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Canonical sync cores: extend existing owners, no parallel business logic
-- ---------------------------------------------------------------------------
create or replace function public.sync_sea_vibe_mutation_core_r39(
  p_kind text,
  p_mutation text,
  p_operation_key text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  kind_name text:=lower(trim(coalesce(p_kind,'')));
  mutation_name text:=lower(trim(coalesce(p_mutation,'')));
  op public.sea_vibe_sync_operations%rowtype;
  trip public.sea_vibe_trips%rowtype;
  asset public.sea_vibe_assets%rowtype;
  v_id uuid;
  v_updated_at timestamptz;
  v_name_ar text;
  v_name_en text;
  v_is_active boolean;
  v_table text;
  v_ref_kind text;
  v_status text;
  v_result jsonb;
  v_batch jsonb;
  v_entry jsonb;
  v_people integer;
  v_hours integer;
  v_points integer;
  v_amount numeric(14,2);
  v_server_points integer;
  v_server_amount numeric(14,2);
  v_server_updated_at timestamptz;
  v_base timestamptz;
  v_topup_id uuid;
  v_same boolean:=false;
begin
  if actor is null then raise exception 'SEA_VIBE_SYNC_AUTH_REQUIRED'; end if;
  if nullif(trim(coalesce(p_operation_key,'')),'') is null then raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_REQUIRED'; end if;
  if length(p_operation_key)>300 then raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_INVALID'; end if;

  select * into op
  from public.sea_vibe_sync_operations
  where user_id=actor and operation_key=p_operation_key;
  if found then
    if op.entity_kind is distinct from kind_name
       or op.mutation_kind is distinct from mutation_name
       or (p_entity_id is not null and op.entity_id is not null and op.entity_id is distinct from p_entity_id) then
      raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_REUSED';
    end if;
    return coalesce(op.result,'{}'::jsonb)||jsonb_build_object('ok',true,'idempotent',true);
  end if;

  if kind_name='trip' then
    if mutation_name='create' then
      if not (public.has_screen_permission('seaVibeTripNew','add') or public.has_screen_permission('seaVibeTrips','add')) then
        raise exception 'permission_denied';
      end if;
      insert into public.sea_vibe_trips(
        trip_date,start_time,duration_hours,people_count,trip_type_id,customer_id,total_value,notes,created_by,updated_by
      ) values(
        nullif(p_payload->>'date','')::date,
        nullif(p_payload->>'startTime','')::time,
        coalesce((p_payload->>'durationHours')::integer,0),
        coalesce((p_payload->>'peopleCount')::integer,0),
        nullif(p_payload->>'tripTypeId','')::uuid,
        nullif(p_payload->>'customerId','')::uuid,
        coalesce((p_payload->>'totalValue')::numeric,0),
        nullif(btrim(coalesce(p_payload->>'notes','')),''),
        actor,actor
      ) returning id,updated_at into v_id,v_updated_at;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);

    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeTrips','edit') then raise exception 'permission_denied'; end if;
      select * into trip from public.sea_vibe_trips where id=p_entity_id for update;
      if not found then raise exception 'SEA_VIBE_TRIP_NOT_FOUND'; end if;
      v_same:=trip.trip_date = nullif(p_payload->>'date','')::date
        and trip.start_time = nullif(p_payload->>'startTime','')::time
        and trip.duration_hours = coalesce((p_payload->>'durationHours')::integer,0)
        and trip.people_count = coalesce((p_payload->>'peopleCount')::integer,0)
        and trip.trip_type_id = nullif(p_payload->>'tripTypeId','')::uuid
        and trip.customer_id is not distinct from nullif(p_payload->>'customerId','')::uuid
        and trip.total_value = coalesce((p_payload->>'totalValue')::numeric,0)
        and coalesce(trip.notes,'') = coalesce(nullif(btrim(coalesce(p_payload->>'notes','')),''),'');
      if not v_same and (p_base_updated_at is null or trip.updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل الرحلة على الخادم بعد آخر مزامنة.','id',trip.id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',trip.updated_at);
      end if;
      if not v_same then
        update public.sea_vibe_trips set
          trip_date=nullif(p_payload->>'date','')::date,
          start_time=nullif(p_payload->>'startTime','')::time,
          duration_hours=coalesce((p_payload->>'durationHours')::integer,0),
          people_count=coalesce((p_payload->>'peopleCount')::integer,0),
          trip_type_id=nullif(p_payload->>'tripTypeId','')::uuid,
          customer_id=nullif(p_payload->>'customerId','')::uuid,
          total_value=coalesce((p_payload->>'totalValue')::numeric,0),
          notes=nullif(btrim(coalesce(p_payload->>'notes','')),''),
          updated_by=actor
        where id=trip.id
        returning updated_at into v_updated_at;
      else
        v_updated_at:=trip.updated_at;
      end if;
      v_id:=trip.id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);

    elsif mutation_name='status' then
      if not public.has_screen_permission('seaVibeTrips','edit') then raise exception 'permission_denied'; end if;
      v_status:=lower(trim(coalesce(p_payload->>'status','')));
      if v_status not in ('open','closed') then raise exception 'SEA_VIBE_TRIP_STATUS_INVALID'; end if;
      select * into trip from public.sea_vibe_trips where id=p_entity_id for update;
      if not found then raise exception 'SEA_VIBE_TRIP_NOT_FOUND'; end if;
      if trip.status<>v_status and (p_base_updated_at is null or trip.updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تغيير حالة الرحلة على الخادم بعد آخر مزامنة.','id',trip.id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',trip.updated_at,'serverStatus',trip.status);
      end if;
      if trip.status<>v_status then
        if v_status='closed' then
          update public.sea_vibe_trips set status='closed',closed_at=now(),closed_by=actor,updated_by=actor where id=trip.id returning updated_at into v_updated_at;
        else
          update public.sea_vibe_trips set status='open',reopened_at=now(),reopened_by=actor,updated_by=actor where id=trip.id returning updated_at into v_updated_at;
        end if;
      else
        v_updated_at:=trip.updated_at;
      end if;
      v_id:=trip.id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',trip.status<>v_status,'converged',trip.status=v_status,'status',v_status);
    else
      raise exception 'SEA_VIBE_TRIP_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='asset' then
    if mutation_name='create' then
      if not public.has_screen_permission('seaVibeAssets','add') then raise exception 'permission_denied'; end if;
      insert into public.sea_vibe_assets(asset_name,initial_value,notes,is_active,created_by,updated_by)
      values(
        btrim(coalesce(p_payload->>'name','')),
        coalesce((p_payload->>'initialValue')::numeric,0),
        nullif(btrim(coalesce(p_payload->>'notes','')),''),
        coalesce((p_payload->>'isActive')::boolean,true),actor,actor
      ) returning id,updated_at into v_id,v_updated_at;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);
    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeAssets','edit') then raise exception 'permission_denied'; end if;
      select * into asset from public.sea_vibe_assets where id=p_entity_id for update;
      if not found then raise exception 'SEA_VIBE_ASSET_NOT_FOUND'; end if;
      v_same:=asset.asset_name=btrim(coalesce(p_payload->>'name',''))
        and asset.initial_value=coalesce((p_payload->>'initialValue')::numeric,0)
        and coalesce(asset.notes,'')=coalesce(nullif(btrim(coalesce(p_payload->>'notes','')),''),'')
        and asset.is_active=coalesce((p_payload->>'isActive')::boolean,true);
      if not v_same and (p_base_updated_at is null or asset.updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل الأصل على الخادم بعد آخر مزامنة.','id',asset.id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',asset.updated_at);
      end if;
      if not v_same then
        update public.sea_vibe_assets set
          asset_name=btrim(coalesce(p_payload->>'name','')),
          initial_value=coalesce((p_payload->>'initialValue')::numeric,0),
          notes=nullif(btrim(coalesce(p_payload->>'notes','')),''),
          is_active=coalesce((p_payload->>'isActive')::boolean,true),
          updated_by=actor
        where id=asset.id returning updated_at into v_updated_at;
      else
        v_updated_at:=asset.updated_at;
      end if;
      v_id:=asset.id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);
    else
      raise exception 'SEA_VIBE_ASSET_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='reference' then
    v_ref_kind:=coalesce(p_payload->>'refKind','');
    if v_ref_kind='tripTypes' then v_table:='sea_vibe_trip_types';
    elsif v_ref_kind='paymentMethods' then v_table:='sea_vibe_payment_methods';
    elsif v_ref_kind='expenseCatalog' then v_table:='sea_vibe_expense_catalog';
    else raise exception 'SEA_VIBE_REFERENCE_KIND_INVALID'; end if;

    if mutation_name='create' then
      if not public.has_screen_permission('seaVibeReference','add') then raise exception 'permission_denied'; end if;
      execute format('insert into public.%I(name_ar,name_en,is_active) values($1,$2,$3) returning id,updated_at',v_table)
      into v_id,v_updated_at
      using btrim(coalesce(p_payload->>'nameAr','')),btrim(coalesce(p_payload->>'nameEn','')),coalesce((p_payload->>'isActive')::boolean,true);
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);
    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
      execute format('select name_ar,name_en,is_active,updated_at from public.%I where id=$1 for update',v_table)
      into v_name_ar,v_name_en,v_is_active,v_server_updated_at using p_entity_id;
      if v_server_updated_at is null then raise exception 'SEA_VIBE_REFERENCE_NOT_FOUND'; end if;
      v_same:=v_name_ar=btrim(coalesce(p_payload->>'nameAr',''))
        and v_name_en=btrim(coalesce(p_payload->>'nameEn',''))
        and v_is_active=coalesce((p_payload->>'isActive')::boolean,true);
      if not v_same and (p_base_updated_at is null or v_server_updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل البيانات المرجعية على الخادم بعد آخر مزامنة.','id',p_entity_id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',v_server_updated_at);
      end if;
      if not v_same then
        execute format('update public.%I set name_ar=$1,name_en=$2,is_active=$3,updated_at=now() where id=$4 returning updated_at',v_table)
        into v_updated_at
        using btrim(coalesce(p_payload->>'nameAr','')),btrim(coalesce(p_payload->>'nameEn','')),coalesce((p_payload->>'isActive')::boolean,true),p_entity_id;
      else
        v_updated_at:=v_server_updated_at;
      end if;
      v_id:=p_entity_id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);
    else
      raise exception 'SEA_VIBE_REFERENCE_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='expense_batch' then
    if mutation_name<>'create' then raise exception 'SEA_VIBE_EXPENSE_MUTATION_UNSUPPORTED'; end if;
    v_batch:=public.sea_vibe_add_expense_batch(
      p_payload->>'scope',
      nullif(p_payload->>'tripId','')::uuid,
      nullif(p_payload->>'assetId','')::uuid,
      coalesce(p_payload->'lines','[]'::jsonb)
    );
    v_id:=nullif(v_batch->>'movement_group_id','')::uuid;
    v_result:=coalesce(v_batch,'{}'::jsonb)||jsonb_build_object('ok',true,'id',v_id,'applied',true);

  elsif kind_name='permit_fees' then
    if mutation_name<>'update' then raise exception 'SEA_VIBE_PERMIT_MUTATION_UNSUPPORTED'; end if;
    if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
    if jsonb_typeof(p_payload->'entries')<>'array' then raise exception 'SEA_VIBE_PERMIT_ENTRIES_REQUIRED'; end if;

    -- Validate all rows before applying any row so the batch is atomic on conflict.
    for v_entry in select value from jsonb_array_elements(p_payload->'entries') loop
      v_people:=coalesce((v_entry->>'peopleCount')::integer,0);
      v_hours:=coalesce((v_entry->>'durationHours')::integer,0);
      v_points:=coalesce((v_entry->>'points')::integer,0);
      v_amount:=coalesce((v_entry->>'amount')::numeric,0);
      v_base:=nullif(v_entry->>'baseUpdatedAt','')::timestamptz;
      select points,fee_amount,updated_at into v_server_points,v_server_amount,v_server_updated_at
      from public.sea_vibe_sailing_permit_fees
      where people_count=v_people and duration_hours=v_hours
      for update;
      if v_server_updated_at is not null
         and not (coalesce(v_server_points,0)=v_points and v_server_amount=v_amount)
         and (v_base is null or v_server_updated_at<>v_base) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل مصفوفة تصريح الإبحار على الخادم بعد آخر مزامنة.','peopleCount',v_people,'durationHours',v_hours,'baseUpdatedAt',v_base,'serverUpdatedAt',v_server_updated_at);
      end if;
    end loop;

    for v_entry in select value from jsonb_array_elements(p_payload->'entries') loop
      v_people:=coalesce((v_entry->>'peopleCount')::integer,0);
      v_hours:=coalesce((v_entry->>'durationHours')::integer,0);
      v_points:=coalesce((v_entry->>'points')::integer,0);
      v_amount:=coalesce((v_entry->>'amount')::numeric,0);
      insert into public.sea_vibe_sailing_permit_fees(people_count,duration_hours,fee_amount,points,updated_at)
      values(v_people,v_hours,v_amount,v_points,now())
      on conflict(people_count,duration_hours) do update set fee_amount=excluded.fee_amount,points=excluded.points,updated_at=now();
    end loop;
    v_result:=jsonb_build_object('ok',true,'id','permit-fees','applied',true);

  elsif kind_name='zawel_topup' then
    if mutation_name<>'create' then raise exception 'SEA_VIBE_ZAWEL_MUTATION_UNSUPPORTED'; end if;
    v_topup_id:=public.sea_vibe_zawel_topup(
      coalesce((p_payload->>'points')::integer,0),
      nullif(btrim(coalesce(p_payload->>'notes','')),''),
      coalesce(nullif(p_payload->>'transactionDate','')::date,current_date)
    );
    v_id:=v_topup_id;
    v_result:=jsonb_build_object('ok',true,'id',v_id,'applied',true);

  else
    raise exception 'SEA_VIBE_SYNC_KIND_UNSUPPORTED';
  end if;

  insert into public.sea_vibe_sync_operations(user_id,operation_key,entity_kind,mutation_kind,entity_id,result)
  values(actor,p_operation_key,kind_name,mutation_name,v_id,coalesce(v_result,'{}'::jsonb))
  on conflict(user_id,operation_key) do nothing;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.sync_sea_vibe_mutation_core_r39(text,text,text,uuid,jsonb,timestamptz) from public,anon,authenticated;

create or replace function public.sync_sea_vibe_fuel_mutation_core_r44r3(
  p_kind text,
  p_mutation text,
  p_operation_key text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  kind_name text:=lower(trim(coalesce(p_kind,'')));
  mutation_name text:=lower(trim(coalesce(p_mutation,'')));
  op public.sea_vibe_sync_operations%rowtype;
  v_id uuid;
  v_result jsonb;
  v_server_updated_at timestamptz;
  v_updated_at timestamptz;
  v_name_ar text;
  v_name_en text;
  v_is_active boolean;
  v_fuel_cost numeric(18,2);
  v_server_fuel_cost numeric(18,2);
  v_requires_customer boolean;
  v_server_requires_customer boolean;
  v_serial_series_key text;
  v_server_serial_series_key text;
  v_same boolean:=false;
begin
  if actor is null then raise exception 'SEA_VIBE_SYNC_AUTH_REQUIRED'; end if;
  if nullif(trim(coalesce(p_operation_key,'')),'') is null then raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_REQUIRED'; end if;
  if length(p_operation_key)>300 then raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_INVALID'; end if;

  select * into op
  from public.sea_vibe_sync_operations
  where user_id=actor and operation_key=p_operation_key;
  if found then
    if op.entity_kind is distinct from kind_name
       or op.mutation_kind is distinct from mutation_name
       or (p_entity_id is not null and op.entity_id is not null and op.entity_id is distinct from p_entity_id) then
      raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_REUSED';
    end if;
    return coalesce(op.result,'{}'::jsonb)||jsonb_build_object('ok',true,'idempotent',true);
  end if;

  if kind_name='trip_type_reference' then
    v_fuel_cost:=round(coalesce((p_payload->>'fuelCostAmount')::numeric,0),2);
    v_requires_customer:=coalesce((p_payload->>'requiresCustomer')::boolean,true);
    if v_fuel_cost<=0 then raise exception 'SEA_VIBE_FUEL_TARIFF_REQUIRED'; end if;

    if mutation_name='create' then
      if not public.has_screen_permission('seaVibeReference','add') then raise exception 'permission_denied'; end if;
      v_serial_series_key:=case
        when btrim(coalesce(p_payload->>'nameAr','')) ilike '%خور%'
          or lower(btrim(coalesce(p_payload->>'nameEn',''))) like '%khawr%'
          or lower(btrim(coalesce(p_payload->>'nameEn',''))) like '%khor%'
        then 'khawr' else 'standard' end;
      insert into public.sea_vibe_trip_types(name_ar,name_en,is_active,fuel_cost_amount,requires_customer,serial_series_key)
      values(
        btrim(coalesce(p_payload->>'nameAr','')),
        btrim(coalesce(p_payload->>'nameEn','')),
        coalesce((p_payload->>'isActive')::boolean,true),
        v_fuel_cost,
        v_requires_customer,
        v_serial_series_key
      ) returning id,updated_at into v_id,v_updated_at;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);

    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
      select name_ar,name_en,is_active,fuel_cost_amount,requires_customer,serial_series_key,updated_at
      into v_name_ar,v_name_en,v_is_active,v_server_fuel_cost,v_server_requires_customer,v_server_serial_series_key,v_server_updated_at
      from public.sea_vibe_trip_types
      where id=p_entity_id
      for update;
      if v_server_updated_at is null then raise exception 'SEA_VIBE_REFERENCE_NOT_FOUND'; end if;

      v_same:=v_name_ar=btrim(coalesce(p_payload->>'nameAr',''))
        and v_name_en=btrim(coalesce(p_payload->>'nameEn',''))
        and v_is_active=coalesce((p_payload->>'isActive')::boolean,true)
        and v_server_fuel_cost=v_fuel_cost
        and v_server_requires_customer=v_requires_customer;
      if not v_same and (p_base_updated_at is null or v_server_updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل نوع الرحلة على الخادم بعد آخر مزامنة.','id',p_entity_id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',v_server_updated_at);
      end if;
      if not v_same then
        update public.sea_vibe_trip_types
        set name_ar=btrim(coalesce(p_payload->>'nameAr','')),
            name_en=btrim(coalesce(p_payload->>'nameEn','')),
            is_active=coalesce((p_payload->>'isActive')::boolean,true),
            fuel_cost_amount=v_fuel_cost,
            requires_customer=v_requires_customer,
            updated_at=now()
        where id=p_entity_id
        returning updated_at into v_updated_at;

        -- First-time configuration backfills only previously unvalued safe
        -- historical trips. Later tariff changes remain snapshot-safe and do
        -- not rewrite existing trip expenses/ledger rows.
        if coalesce(v_server_fuel_cost,0)<=0 and v_fuel_cost>0 then
          perform public.sea_vibe_backfill_fuel_for_trip_type_r44r3(p_entity_id);
        end if;
      else
        v_updated_at:=v_server_updated_at;
      end if;
      v_id:=p_entity_id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);
    else
      raise exception 'SEA_VIBE_TRIP_TYPE_REFERENCE_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='fuel_topup' then
    if mutation_name<>'create' then raise exception 'SEA_VIBE_FUEL_MUTATION_UNSUPPORTED'; end if;
    v_id:=public.sea_vibe_fuel_topup(
      coalesce((p_payload->>'liters')::numeric,0),
      coalesce((p_payload->>'value')::numeric,0),
      nullif(btrim(coalesce(p_payload->>'notes','')),''),
      coalesce(nullif(p_payload->>'transactionDate','')::date,current_date)
    );
    v_result:=jsonb_build_object('ok',true,'id',v_id,'applied',true);

  else
    raise exception 'SEA_VIBE_FUEL_SYNC_KIND_UNSUPPORTED';
  end if;

  insert into public.sea_vibe_sync_operations(user_id,operation_key,entity_kind,mutation_kind,entity_id,result)
  values(actor,p_operation_key,kind_name,mutation_name,v_id,coalesce(v_result,'{}'::jsonb))
  on conflict(user_id,operation_key) do nothing;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.sync_sea_vibe_fuel_mutation_core_r44r3(text,text,text,uuid,jsonb,timestamptz) from public,anon,authenticated;

comment on table public.sea_vibe_customers is 'R44R13 independent SEA VIBE customer master; intentionally isolated from CRM customers.';
comment on column public.sea_vibe_trip_types.requires_customer is 'Controls whether new trips of this type require a SEA VIBE customer. Historical pre-R44R13 trips are grandfathered until explicitly linked.';
comment on column public.sea_vibe_trip_types.serial_series_key is 'Stable hidden routing key for standard versus Khawr serial sequence; survives display-name changes.';

commit;
