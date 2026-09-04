-- PETATOE P5.13.8.72 R44R3 — SEA VIBE Fuel Balance + automatic trip fuel cost
-- Scope:
--   * Independent fuel ledger (liters + SAR value) with negative balances allowed by design.
--   * Weighted purchase-price valuation with a persistent last-valid unit price.
--   * Automatic trip fuel expense/deduction by trip type at trip creation.
--   * Trip-type changes create audited delta adjustments; tariff edits do not rewrite historical trips.
--   * Safe historical backfill: legacy trips with a manual fuel expense are skipped to avoid double cost.
--   * Existing R39 replay guard remains authoritative. R44 pruning remains untouched/disabled.
begin;

-- ---------------------------------------------------------------------------
-- 1) Canonical trip-type tariff extension
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_trip_types
  add column if not exists fuel_cost_amount numeric(14,2) not null default 0;

alter table public.sea_vibe_trip_types
  drop constraint if exists sea_vibe_trip_types_fuel_cost_nonnegative;
alter table public.sea_vibe_trip_types
  add constraint sea_vibe_trip_types_fuel_cost_nonnegative
  check (fuel_cost_amount >= 0);

-- Initial business tariffs agreed for the current SEA VIBE trip types.
-- Matching is deliberately narrow to the Arabic business names/families supplied by the operator.
update public.sea_vibe_trip_types
set fuel_cost_amount = case
  when name_ar ilike '%خور%' then 30.00
  when name_ar ilike '%بياض%' then 150.00
  when name_ar ilike '%صيد%' then 150.00
  else fuel_cost_amount
end,
updated_at = now()
where fuel_cost_amount = 0
  and (name_ar ilike '%خور%' or name_ar ilike '%بياض%' or name_ar ilike '%صيد%');

insert into public.sea_vibe_expense_catalog(name_ar,name_en,system_key,is_system,is_active)
values('تكلفة البنزين التلقائية','Automatic Fuel Cost','fuel_cost',true,true)
on conflict(system_key) do update
set name_ar=excluded.name_ar,
    name_en=excluded.name_en,
    is_system=true,
    is_active=true,
    updated_at=now();

-- ---------------------------------------------------------------------------
-- 2) Fuel valuation state and immutable/auditable ledger
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_fuel_valuation_state (
  singleton_id smallint primary key default 1 check (singleton_id=1),
  last_valid_unit_price numeric(18,6),
  updated_at timestamptz not null default now(),
  constraint sea_vibe_fuel_state_price_positive check (last_valid_unit_price is null or last_valid_unit_price > 0)
);
insert into public.sea_vibe_fuel_valuation_state(singleton_id,last_valid_unit_price)
values(1,null)
on conflict(singleton_id) do nothing;

create table if not exists public.sea_vibe_fuel_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('topup','trip','trip_adjustment')),
  liters_delta numeric(18,3),
  value_delta numeric(18,2) not null check (value_delta <> 0),
  unit_price_snapshot numeric(18,6),
  valuation_status text not null default 'valued' check (valuation_status in ('valued','pending')),
  trip_id uuid references public.sea_vibe_trips(id) on delete restrict,
  reference text,
  notes text,
  transaction_date date not null default current_date,
  treasury_movement_serial text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sea_vibe_fuel_transaction_shape check (
    (
      transaction_type='topup'
      and trip_id is null
      and valuation_status='valued'
      and liters_delta is not null and liters_delta > 0
      and value_delta > 0
      and unit_price_snapshot is not null and unit_price_snapshot > 0
    )
    or
    (
      transaction_type='trip'
      and trip_id is not null
      and value_delta < 0
      and (
        (valuation_status='pending' and liters_delta is null and unit_price_snapshot is null)
        or
        (valuation_status='valued' and liters_delta is not null and liters_delta < 0 and unit_price_snapshot is not null and unit_price_snapshot > 0)
      )
    )
    or
    (
      transaction_type='trip_adjustment'
      and trip_id is not null
      and (
        (valuation_status='pending' and liters_delta is null and unit_price_snapshot is null)
        or
        (
          valuation_status='valued'
          and liters_delta is not null
          and unit_price_snapshot is not null and unit_price_snapshot > 0
          and liters_delta * value_delta > 0
        )
      )
    )
  )
);

create unique index if not exists sea_vibe_fuel_trip_baseline_uidx
  on public.sea_vibe_fuel_transactions(trip_id)
  where transaction_type='trip';
create index if not exists sea_vibe_fuel_transactions_date_idx
  on public.sea_vibe_fuel_transactions(transaction_date desc,created_at desc);
create index if not exists sea_vibe_fuel_transactions_trip_idx
  on public.sea_vibe_fuel_transactions(trip_id,created_at)
  where trip_id is not null;
create unique index if not exists sea_vibe_fuel_treasury_serial_uidx
  on public.sea_vibe_fuel_transactions(treasury_movement_serial)
  where treasury_movement_serial is not null;

create or replace function public.sea_vibe_touch_fuel_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists trg_sea_vibe_fuel_touch on public.sea_vibe_fuel_transactions;
create trigger trg_sea_vibe_fuel_touch
before update on public.sea_vibe_fuel_transactions
for each row execute function public.sea_vibe_touch_fuel_updated_at();

create or replace function public.sea_vibe_assign_fuel_treasury_serial()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.transaction_type='topup'
     and (new.treasury_movement_serial is null or btrim(new.treasury_movement_serial)='') then
    new.treasury_movement_serial:=public.sea_vibe_next_treasury_movement_serial(coalesce(new.transaction_date,current_date));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sea_vibe_fuel_treasury_serial on public.sea_vibe_fuel_transactions;
create trigger trg_sea_vibe_fuel_treasury_serial
before insert on public.sea_vibe_fuel_transactions
for each row execute function public.sea_vibe_assign_fuel_treasury_serial();

create or replace function public.sea_vibe_current_fuel_unit_price_r44r3()
returns numeric
language sql stable security definer set search_path=public as $$
  select last_valid_unit_price
  from public.sea_vibe_fuel_valuation_state
  where singleton_id=1;
$$;
revoke all on function public.sea_vibe_current_fuel_unit_price_r44r3() from public,anon,authenticated;

create or replace function public.sea_vibe_refresh_fuel_unit_price_r44r3()
returns numeric
language plpgsql security definer set search_path=public as $$
declare
  v_price numeric(18,6);
  v_last numeric(18,6);
  v_topup_count bigint:=0;
begin
  -- Moving weighted-average of the CURRENT valued balance, not a lifetime
  -- average of purchases. Pending rows are excluded until a valid price exists.
  -- This preserves the agreed equation:
  --   (current inventory value + new top-up value) /
  --   (current inventory liters + new top-up liters).
  select count(*) filter(where transaction_type='topup'),
         round(sum(value_delta)/nullif(sum(liters_delta),0),6)
  into v_topup_count,v_price
  from public.sea_vibe_fuel_transactions
  where valuation_status='valued'
    and liters_delta is not null;

  select last_valid_unit_price into v_last
  from public.sea_vibe_fuel_valuation_state
  where singleton_id=1
  for update;

  if v_topup_count>0 and v_price is not null and v_price>0 then
    update public.sea_vibe_fuel_valuation_state
    set last_valid_unit_price=v_price,updated_at=now()
    where singleton_id=1;
    return v_price;
  end if;

  -- Zero/invalid current balance never erases the last known valid price.
  return v_last;
end;
$$;
revoke all on function public.sea_vibe_refresh_fuel_unit_price_r44r3() from public,anon,authenticated;

create or replace function public.sea_vibe_resolve_pending_fuel_quantities_r44r3()
returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_price numeric(18,6);
  v_count integer:=0;
begin
  v_price:=public.sea_vibe_current_fuel_unit_price_r44r3();
  if v_price is null or v_price<=0 then return 0; end if;

  update public.sea_vibe_fuel_transactions
  set liters_delta=round((value_delta/v_price)::numeric,3),
      unit_price_snapshot=v_price,
      valuation_status='valued',
      updated_at=now()
  where valuation_status='pending'
    and transaction_type in ('trip','trip_adjustment');
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.sea_vibe_resolve_pending_fuel_quantities_r44r3() from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3) Fuel balance/top-up APIs. Negative balances are explicitly allowed.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_fuel_topup(
  p_liters numeric,
  p_value numeric,
  p_notes text default null,
  p_transaction_date date default current_date
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_liters numeric(18,3):=round(coalesce(p_liters,0)::numeric,3);
  v_value numeric(18,2):=round(coalesce(p_value,0)::numeric,2);
  v_price numeric(18,6);
begin
  if not public.has_screen_permission('seaVibeFuel','add') then raise exception 'permission_denied'; end if;
  if v_liters<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_LITERS_INVALID'; end if;
  if v_value<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_VALUE_INVALID'; end if;
  v_price:=round((v_value/v_liters)::numeric,6);

  insert into public.sea_vibe_fuel_transactions(
    transaction_type,liters_delta,value_delta,unit_price_snapshot,valuation_status,
    reference,notes,transaction_date,created_by
  ) values(
    'topup',v_liters,v_value,v_price,'valued',
    'FUEL-TOPUP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),
    nullif(btrim(coalesce(p_notes,'')),''),coalesce(p_transaction_date,current_date),auth.uid()
  ) returning id into v_id;

  perform public.sea_vibe_refresh_fuel_unit_price_r44r3();
  perform public.sea_vibe_resolve_pending_fuel_quantities_r44r3();
  return v_id;
end;
$$;
grant execute on function public.sea_vibe_fuel_topup(numeric,numeric,text,date) to authenticated;

create or replace function public.sea_vibe_fuel_topup_update(
  p_id uuid,
  p_liters numeric,
  p_value numeric,
  p_notes text default null,
  p_transaction_date date default current_date
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_old public.sea_vibe_fuel_transactions%rowtype;
  v_liters numeric(18,3):=round(coalesce(p_liters,0)::numeric,3);
  v_value numeric(18,2):=round(coalesce(p_value,0)::numeric,2);
  v_price numeric(18,6);
begin
  if not public.has_screen_permission('seaVibeFuel','edit') then raise exception 'permission_denied'; end if;
  if v_liters<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_LITERS_INVALID'; end if;
  if v_value<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_VALUE_INVALID'; end if;

  select * into v_old from public.sea_vibe_fuel_transactions where id=p_id for update;
  if not found then raise exception 'SEA_VIBE_FUEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'SEA_VIBE_FUEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;

  v_price:=round((v_value/v_liters)::numeric,6);
  update public.sea_vibe_fuel_transactions
  set liters_delta=v_liters,
      value_delta=v_value,
      unit_price_snapshot=v_price,
      valuation_status='valued',
      notes=nullif(btrim(coalesce(p_notes,'')),''),
      transaction_date=coalesce(p_transaction_date,current_date)
  where id=p_id;

  perform public.sea_vibe_refresh_fuel_unit_price_r44r3();
  perform public.sea_vibe_resolve_pending_fuel_quantities_r44r3();
  return p_id;
end;
$$;
grant execute on function public.sea_vibe_fuel_topup_update(uuid,numeric,numeric,text,date) to authenticated;

create or replace function public.sea_vibe_fuel_topup_delete(p_id uuid)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_old public.sea_vibe_fuel_transactions%rowtype;
begin
  if not public.has_screen_permission('seaVibeFuel','delete') then raise exception 'permission_denied'; end if;
  select * into v_old from public.sea_vibe_fuel_transactions where id=p_id for update;
  if not found then raise exception 'SEA_VIBE_FUEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'SEA_VIBE_FUEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;

  delete from public.sea_vibe_fuel_transactions where id=p_id;
  -- If no top-up remains, keep the previously known valid price by design.
  perform public.sea_vibe_refresh_fuel_unit_price_r44r3();
  return p_id;
end;
$$;
grant execute on function public.sea_vibe_fuel_topup_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Automatic trip fuel expense + ledger deduction/adjustment
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_sync_fuel_cost_r44r3()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_catalog uuid;
  v_new_cost numeric(18,2);
  v_old_cost numeric(18,2);
  v_price numeric(18,6);
  v_value_delta numeric(18,2);
  v_liters_delta numeric(18,3);
  v_has_system boolean:=false;
  v_has_baseline boolean:=false;
  v_manual_conflict boolean:=false;
  v_apply_cost boolean:=false;
begin
  select id into v_catalog
  from public.sea_vibe_expense_catalog
  where system_key='fuel_cost'
  limit 1;
  if v_catalog is null then raise exception 'SEA_VIBE_FUEL_EXPENSE_REFERENCE_MISSING'; end if;

  select fuel_cost_amount into v_new_cost
  from public.sea_vibe_trip_types
  where id=new.trip_type_id;
  if v_new_cost is null or v_new_cost<=0 then raise exception 'SEA_VIBE_FUEL_TARIFF_MISSING'; end if;

  select exists(
    select 1 from public.sea_vibe_expenses e
    join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    where e.trip_id=new.id
      and coalesce(e.is_system_generated,false)=false
      and coalesce(c.system_key,'')=''
      and (c.name_ar ilike '%بنزين%' or c.name_en ilike '%fuel%')
  ) into v_manual_conflict;

  select exists(
    select 1 from public.sea_vibe_expenses
    where trip_id=new.id and system_key='fuel_cost'
  ) into v_has_system;

  select exists(
    select 1 from public.sea_vibe_fuel_transactions
    where trip_id=new.id and transaction_type='trip'
  ) into v_has_baseline;

  -- Legacy/manual fuel rows are intentionally not duplicated.
  if tg_op='UPDATE' and v_manual_conflict and not v_has_system then
    return new;
  end if;

  select amount into v_old_cost
  from public.sea_vibe_expenses
  where trip_id=new.id and system_key='fuel_cost'
  for update;

  if tg_op='INSERT' then
    v_old_cost:=0;
    v_apply_cost:=true;
  else
    v_old_cost:=coalesce(v_old_cost,v_new_cost);
    v_apply_cost:=old.trip_type_id is distinct from new.trip_type_id;
  end if;

  insert into public.sea_vibe_expenses(
    expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,
    notes,is_system_generated,system_key,created_by,updated_by
  ) values(
    'trip',new.id,v_catalog,new.trip_date,v_new_cost,null,
    'Auto-calculated from SEA VIBE trip-type fuel tariff',true,'fuel_cost',
    coalesce(new.created_by,auth.uid()),auth.uid()
  )
  on conflict(trip_id,system_key) where trip_id is not null and system_key is not null
  do update set
    expense_catalog_id=excluded.expense_catalog_id,
    expense_date=excluded.expense_date,
    amount=case
      when v_apply_cost and public.sea_vibe_expenses.amount is distinct from excluded.amount
      then excluded.amount
      else public.sea_vibe_expenses.amount
    end,
    updated_by=auth.uid(),
    updated_at=now();

  v_price:=public.sea_vibe_current_fuel_unit_price_r44r3();

  if not v_has_baseline then
    -- Baseline creation is idempotent and also self-heals a safe legacy trip
    -- that becomes eligible after migration (for example after first tariff
    -- configuration or removal of a conflicting manual fuel row).
    v_value_delta:=-v_new_cost;
    v_liters_delta:=case when v_price is not null and v_price>0 then round((v_value_delta/v_price)::numeric,3) else null end;
    insert into public.sea_vibe_fuel_transactions(
      transaction_type,liters_delta,value_delta,unit_price_snapshot,valuation_status,
      trip_id,reference,notes,transaction_date,created_by
    ) values(
      'trip',v_liters_delta,v_value_delta,
      case when v_liters_delta is null then null else v_price end,
      case when v_liters_delta is null then 'pending' else 'valued' end,
      new.id,new.trip_serial,
      case when tg_op='INSERT' then 'خصم بنزين الرحلة حسب نوع الرحلة' else 'خصم بنزين رحلة قديمة بعد اكتمال التعريف' end,
      new.trip_date,coalesce(new.created_by,auth.uid())
    )
    on conflict(trip_id) where transaction_type='trip' do nothing;

  elsif tg_op='UPDATE' and old.trip_type_id is distinct from new.trip_type_id then
    v_value_delta:=round((coalesce(v_old_cost,0)-v_new_cost)::numeric,2);
    if v_value_delta<>0 then
      v_liters_delta:=case when v_price is not null and v_price>0 then round((v_value_delta/v_price)::numeric,3) else null end;
      insert into public.sea_vibe_fuel_transactions(
        transaction_type,liters_delta,value_delta,unit_price_snapshot,valuation_status,
        trip_id,reference,notes,transaction_date,created_by
      ) values(
        'trip_adjustment',v_liters_delta,v_value_delta,
        case when v_liters_delta is null then null else v_price end,
        case when v_liters_delta is null then 'pending' else 'valued' end,
        new.id,new.trip_serial,'تسوية بنزين بعد تغيير نوع الرحلة',new.trip_date,auth.uid()
      );
    end if;
  end if;

  if tg_op='UPDATE' and old.trip_date is distinct from new.trip_date then
    update public.sea_vibe_fuel_transactions
    set transaction_date=new.trip_date,reference=new.trip_serial
    where trip_id=new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sea_vibe_trip_fuel_cost_r44r3 on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_fuel_cost_r44r3
after insert or update of trip_date,trip_type_id on public.sea_vibe_trips
for each row execute function public.sea_vibe_sync_fuel_cost_r44r3();

-- ---------------------------------------------------------------------------
-- 5) Historical-safe backfill helper
--    Canonical owner for both migration-time backfill and first-time tariff setup.
--    Existing manual fuel expenses are never duplicated automatically.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_backfill_fuel_for_trip_type_r44r3(
  p_trip_type_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_catalog uuid;
  v_price numeric(18,6);
  v_expense_count integer:=0;
  v_ledger_count integer:=0;
begin
  select id into v_catalog
  from public.sea_vibe_expense_catalog
  where system_key='fuel_cost'
  limit 1;
  if v_catalog is null then raise exception 'SEA_VIBE_FUEL_EXPENSE_REFERENCE_MISSING'; end if;

  v_price:=public.sea_vibe_current_fuel_unit_price_r44r3();

  with safe_trips as (
    select t.id,t.trip_date,t.created_by,t.updated_by,tt.fuel_cost_amount
    from public.sea_vibe_trips t
    join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where (p_trip_type_id is null or t.trip_type_id=p_trip_type_id)
      and tt.fuel_cost_amount>0
      and not exists(
        select 1
        from public.sea_vibe_expenses e
        join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
        where e.trip_id=t.id
          and coalesce(e.is_system_generated,false)=false
          and coalesce(c.system_key,'')=''
          and (c.name_ar ilike '%بنزين%' or c.name_en ilike '%fuel%')
      )
  )
  insert into public.sea_vibe_expenses(
    expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,
    notes,is_system_generated,system_key,created_by,updated_by
  )
  select 'trip',t.id,v_catalog,t.trip_date,t.fuel_cost_amount,null,
         'Historical fuel backfill from trip-type tariff',true,'fuel_cost',t.created_by,t.updated_by
  from safe_trips t
  where not exists(
    select 1 from public.sea_vibe_expenses e
    where e.trip_id=t.id and e.system_key='fuel_cost'
  )
  on conflict(trip_id,system_key) where trip_id is not null and system_key is not null do nothing;
  get diagnostics v_expense_count=row_count;

  with safe_trips as (
    select t.id,t.trip_serial,t.trip_date,t.created_by,tt.fuel_cost_amount
    from public.sea_vibe_trips t
    join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where (p_trip_type_id is null or t.trip_type_id=p_trip_type_id)
      and tt.fuel_cost_amount>0
      and not exists(
        select 1
        from public.sea_vibe_expenses e
        join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
        where e.trip_id=t.id
          and coalesce(e.is_system_generated,false)=false
          and coalesce(c.system_key,'')=''
          and (c.name_ar ilike '%بنزين%' or c.name_en ilike '%fuel%')
      )
  )
  insert into public.sea_vibe_fuel_transactions(
    transaction_type,liters_delta,value_delta,unit_price_snapshot,valuation_status,
    trip_id,reference,notes,transaction_date,created_by
  )
  select 'trip',
         case when v_price is not null and v_price>0 then round((-t.fuel_cost_amount/v_price)::numeric,3) else null end,
         -t.fuel_cost_amount,
         case when v_price is not null and v_price>0 then v_price else null end,
         case when v_price is not null and v_price>0 then 'valued' else 'pending' end,
         t.id,t.trip_serial,'خصم بنزين تاريخي حسب نوع الرحلة',t.trip_date,t.created_by
  from safe_trips t
  where not exists(
    select 1 from public.sea_vibe_fuel_transactions f
    where f.trip_id=t.id and f.transaction_type='trip'
  )
  on conflict(trip_id) where transaction_type='trip' do nothing;
  get diagnostics v_ledger_count=row_count;

  return jsonb_build_object(
    'ok',true,
    'tripTypeId',p_trip_type_id,
    'expensesInserted',v_expense_count,
    'ledgerRowsInserted',v_ledger_count,
    'unitPrice',v_price
  );
end;
$$;
revoke all on function public.sea_vibe_backfill_fuel_for_trip_type_r44r3(uuid) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 6) Sync-v2 extension without changing the R39 replay/retention contract
-- ---------------------------------------------------------------------------
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
    if v_fuel_cost<=0 then raise exception 'SEA_VIBE_FUEL_TARIFF_REQUIRED'; end if;

    if mutation_name='create' then
      if not public.has_screen_permission('seaVibeReference','add') then raise exception 'permission_denied'; end if;
      insert into public.sea_vibe_trip_types(name_ar,name_en,is_active,fuel_cost_amount)
      values(
        btrim(coalesce(p_payload->>'nameAr','')),
        btrim(coalesce(p_payload->>'nameEn','')),
        coalesce((p_payload->>'isActive')::boolean,true),
        v_fuel_cost
      ) returning id,updated_at into v_id,v_updated_at;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);

    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
      select name_ar,name_en,is_active,fuel_cost_amount,updated_at
      into v_name_ar,v_name_en,v_is_active,v_server_fuel_cost,v_server_updated_at
      from public.sea_vibe_trip_types
      where id=p_entity_id
      for update;
      if v_server_updated_at is null then raise exception 'SEA_VIBE_REFERENCE_NOT_FOUND'; end if;

      v_same:=v_name_ar=btrim(coalesce(p_payload->>'nameAr',''))
        and v_name_en=btrim(coalesce(p_payload->>'nameEn',''))
        and v_is_active=coalesce((p_payload->>'isActive')::boolean,true)
        and v_server_fuel_cost=v_fuel_cost;
      if not v_same and (p_base_updated_at is null or v_server_updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل نوع الرحلة على الخادم بعد آخر مزامنة.','id',p_entity_id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',v_server_updated_at);
      end if;
      if not v_same then
        update public.sea_vibe_trip_types
        set name_ar=btrim(coalesce(p_payload->>'nameAr','')),
            name_en=btrim(coalesce(p_payload->>'nameEn','')),
            is_active=coalesce((p_payload->>'isActive')::boolean,true),
            fuel_cost_amount=v_fuel_cost,
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

create or replace function public.sync_sea_vibe_mutation_v2(
  p_kind text,
  p_mutation text,
  p_operation_key text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_base_updated_at timestamptz default null,
  p_replay_anchor_at timestamptz default null,
  p_replay_policy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_kind text:=lower(trim(coalesce(p_kind,'')));
begin
  perform public.assert_sync_server_replay_allowed_r39(
    'sea_vibe',p_operation_key,p_replay_anchor_at,p_replay_policy_version,false
  );
  if v_kind in ('fuel_topup','trip_type_reference') then
    return public.sync_sea_vibe_fuel_mutation_core_r44r3(
      p_kind,p_mutation,p_operation_key,p_entity_id,p_payload,p_base_updated_at
    );
  end if;
  return public.sync_sea_vibe_mutation_core_r39(
    p_kind,p_mutation,p_operation_key,p_entity_id,p_payload,p_base_updated_at
  );
end;
$$;
grant execute on function public.sync_sea_vibe_mutation_v2(text,text,text,uuid,jsonb,timestamptz,timestamptz,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Safe historical backfill
--    Uses the same canonical helper used when an existing trip type receives
--    its first fuel tariff later from Reference Data.
-- ---------------------------------------------------------------------------
select public.sea_vibe_backfill_fuel_for_trip_type_r44r3(null);

-- ---------------------------------------------------------------------------
-- 8) Balance + diagnostic surfaces
-- ---------------------------------------------------------------------------
create or replace view public.sea_vibe_fuel_balance with (security_invoker=true) as
with totals as (
  select
    coalesce(sum(coalesce(liters_delta,0)),0)::numeric(18,3) as balance_liters,
    coalesce(sum(value_delta),0)::numeric(18,2) as balance_value,
    coalesce(sum(liters_delta) filter(where transaction_type='topup'),0)::numeric(18,3) as total_topup_liters,
    coalesce(sum(value_delta) filter(where transaction_type='topup'),0)::numeric(18,2) as total_topup_value,
    abs(coalesce(sum(liters_delta) filter(where transaction_type in ('trip','trip_adjustment') and liters_delta<0),0))::numeric(18,3) as total_deducted_liters,
    abs(coalesce(sum(value_delta) filter(where transaction_type in ('trip','trip_adjustment') and value_delta<0),0))::numeric(18,2) as total_deducted_value,
    count(*) filter(where valuation_status='pending')::bigint as pending_valuation_count
  from public.sea_vibe_fuel_transactions
), review as (
  select
    count(*) filter(where tt.fuel_cost_amount<=0)::bigint as unconfigured_trip_count,
    count(*) filter(where tt.fuel_cost_amount>0 and not exists(select 1 from public.sea_vibe_fuel_transactions f where f.trip_id=t.id and f.transaction_type='trip'))::bigint as historical_review_count
  from public.sea_vibe_trips t
  join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
)
select totals.*,
       s.last_valid_unit_price::numeric(18,6) as average_unit_price,
       review.unconfigured_trip_count,
       review.historical_review_count
from totals
cross join public.sea_vibe_fuel_valuation_state s
cross join review
where s.singleton_id=1;

grant select on public.sea_vibe_fuel_balance to authenticated;

create or replace function public.get_sea_vibe_fuel_reconciliation_preview_r44r3()
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_balance public.sea_vibe_fuel_balance%rowtype;
  v_candidates jsonb;
begin
  select * into v_balance from public.sea_vibe_fuel_balance;
  select coalesce(jsonb_agg(x order by x->>'tripDate',x->>'tripSerial'),'[]'::jsonb)
  into v_candidates
  from (
    select jsonb_build_object(
      'tripId',t.id,
      'tripSerial',t.trip_serial,
      'tripDate',t.trip_date,
      'tripType',tt.name_ar,
      'fuelCostAmount',tt.fuel_cost_amount,
      'hasBaseline',exists(select 1 from public.sea_vibe_fuel_transactions f where f.trip_id=t.id and f.transaction_type='trip'),
      'hasManualFuelExpense',exists(
        select 1 from public.sea_vibe_expenses e
        join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
        where e.trip_id=t.id and coalesce(e.is_system_generated,false)=false
          and coalesce(c.system_key,'')=''
          and (c.name_ar ilike '%بنزين%' or c.name_en ilike '%fuel%')
      )
    ) as x
    from public.sea_vibe_trips t
    join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where tt.fuel_cost_amount<=0
       or not exists(select 1 from public.sea_vibe_fuel_transactions f where f.trip_id=t.id and f.transaction_type='trip')
  ) q;

  return jsonb_build_object(
    'ok',true,
    'phase','R44R3',
    'balanceLiters',v_balance.balance_liters,
    'balanceValue',v_balance.balance_value,
    'averageUnitPrice',v_balance.average_unit_price,
    'pendingValuationCount',v_balance.pending_valuation_count,
    'unconfiguredTripCount',v_balance.unconfigured_trip_count,
    'historicalReviewCount',v_balance.historical_review_count,
    'reviewTrips',v_candidates,
    'negativeBalanceAllowed',true,
    'pruningChanged',false
  );
end;
$$;
revoke all on function public.get_sea_vibe_fuel_reconciliation_preview_r44r3() from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 9) Treasury integration: fuel purchase is cash-out at top-up time;
--    automatic trip fuel expense is excluded to avoid double treasury counting.
-- ---------------------------------------------------------------------------
create or replace view public.sea_vibe_treasury_movements with (security_invoker=true) as
select 'trip_revenue:'||t.id::text as movement_id,
       t.created_at as movement_at,
       'trip_revenue'::text as movement_type,
       t.total_value::numeric(14,2) as amount,
       t.trip_serial as reference,
       coalesce(t.notes,'') as description,
       t.id as trip_id,
       null::uuid as asset_id,
       t.treasury_movement_serial as movement_serial,
       'trip'::text as source_kind,
       t.id as source_id,
       null::uuid as expense_group_id,
       t.trip_date as movement_date
from public.sea_vibe_trips t
union all
select 'expense:'||e.id::text,
       e.created_at,
       case when e.expense_scope='asset' then 'asset_expense' else 'expense' end,
       (-e.amount)::numeric(14,2),
       coalesce(t.trip_serial,a.asset_code,''),
       coalesce(c.name_ar,'')||case when e.notes is null then '' else ' — '||e.notes end,
       e.trip_id,
       e.asset_id,
       e.movement_serial,
       'expense'::text,
       e.movement_group_id,
       e.movement_group_id,
       e.expense_date
from public.sea_vibe_expenses e
left join public.sea_vibe_trips t on t.id=e.trip_id
left join public.sea_vibe_assets a on a.id=e.asset_id
left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
where coalesce(e.system_key,'') not in ('sailing_permit','fuel_cost')
union all
select 'zawel_topup:'||z.id::text,
       z.created_at,
       'zawel_topup'::text,
       (-z.cash_amount)::numeric(14,2),
       coalesce(z.reference,''),
       'شحن رصيد زاول',
       null::uuid,
       null::uuid,
       z.treasury_movement_serial,
       'zawel_topup'::text,
       z.id,
       null::uuid,
       z.transaction_date
from public.sea_vibe_zawel_transactions z
where z.transaction_type='topup'
union all
select 'fuel_topup:'||f.id::text,
       f.created_at,
       'fuel_topup'::text,
       (-f.value_delta)::numeric(14,2),
       coalesce(f.reference,''),
       'شحن رصيد البنزين',
       null::uuid,
       null::uuid,
       f.treasury_movement_serial,
       'fuel_topup'::text,
       f.id,
       null::uuid,
       f.transaction_date
from public.sea_vibe_fuel_transactions f
where f.transaction_type='topup';

grant select on public.sea_vibe_treasury_movements to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Permissions / RLS
-- ---------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values('seaVibeFuel','SEA VIBE - رصيد البنزين','SEA VIBE',158,true)
on conflict(screen_key) do update
set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;
update public.app_screens set display_order=159 where screen_key='seaVibeReference';
update public.app_screens set display_order=160 where screen_key='seaVibeReports';

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,'seaVibeFuel',true,true,true,true,true
on conflict(role,screen_key) do update
set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true,updated_at=now();

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
      or public.has_screen_permission('seaVibeReference','view')
      or public.has_screen_permission('seaVibeReports','view');
$$;
grant execute on function public.sea_vibe_can_view() to authenticated;

alter table public.sea_vibe_fuel_transactions enable row level security;
revoke all on table public.sea_vibe_fuel_transactions from anon,authenticated;
grant select on public.sea_vibe_fuel_transactions to authenticated;

drop policy if exists "sea vibe fuel read" on public.sea_vibe_fuel_transactions;
create policy "sea vibe fuel read" on public.sea_vibe_fuel_transactions
for select to authenticated
using(public.has_screen_permission('seaVibeFuel','view') or public.has_screen_permission('seaVibeTreasury','view'));

alter table public.sea_vibe_fuel_valuation_state enable row level security;
revoke all on table public.sea_vibe_fuel_valuation_state from anon,authenticated;
grant select on public.sea_vibe_fuel_valuation_state to authenticated;
drop policy if exists "sea vibe fuel state read" on public.sea_vibe_fuel_valuation_state;
create policy "sea vibe fuel state read" on public.sea_vibe_fuel_valuation_state
for select to authenticated
using(public.has_screen_permission('seaVibeFuel','view'));

comment on table public.sea_vibe_fuel_transactions is
'R44R3 SEA VIBE fuel ledger. Negative aggregate balances are valid and do not block trip creation.';
comment on column public.sea_vibe_trip_types.fuel_cost_amount is
'Canonical SAR fuel cost deducted for a newly created trip of this type; liters are derived from the last valid weighted fuel unit price.';

commit;
