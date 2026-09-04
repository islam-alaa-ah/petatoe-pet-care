-- PETATOE P5.13.8.72 R44R4 — SEA VIBE Fuel Settlement + true cutoff
-- Scope:
--   * True sequential fuel-settlement cutoff; later settlements start after the last posted cutoff.
--   * Settlement redistributes the signed fuel balance across trips by configurable People/Hours weights.
--   * Default weights are 50% people / 50% duration hours and must always total 100%.
--   * Closed trips are updated server-side only for the canonical system fuel expense.
--   * Settlement zeroes BOTH value and liters as-of the selected cutoff and keeps a full immutable audit trail.
--   * Settled periods are locked against back-dated fuel top-ups and fuel-affecting trip edits.
--   * R44 pruning and R45 activation are untouched.
begin;

-- ---------------------------------------------------------------------------
-- 1) Canonical display label only: keep system_key=fuel_cost unchanged.
-- ---------------------------------------------------------------------------
update public.sea_vibe_expense_catalog
set name_ar='بنزين',
    name_en='Fuel',
    updated_at=now()
where system_key='fuel_cost';

-- ---------------------------------------------------------------------------
-- 2) Settlement configuration (singleton reference data).
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_fuel_settlement_config (
  singleton_id smallint primary key default 1 check (singleton_id=1),
  people_weight_pct numeric(5,2) not null default 50.00,
  hours_weight_pct numeric(5,2) not null default 50.00,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint sea_vibe_fuel_settlement_people_weight_range check (people_weight_pct between 0 and 100),
  constraint sea_vibe_fuel_settlement_hours_weight_range check (hours_weight_pct between 0 and 100),
  constraint sea_vibe_fuel_settlement_weights_total check (people_weight_pct + hours_weight_pct = 100.00)
);

insert into public.sea_vibe_fuel_settlement_config(singleton_id,people_weight_pct,hours_weight_pct)
values(1,50.00,50.00)
on conflict(singleton_id) do nothing;

create or replace function public.sea_vibe_update_fuel_settlement_config_r44r4(
  p_people_weight_pct numeric,
  p_hours_weight_pct numeric
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_people numeric(5,2):=round(coalesce(p_people_weight_pct,0)::numeric,2);
  v_hours numeric(5,2):=round(coalesce(p_hours_weight_pct,0)::numeric,2);
begin
  if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
  if v_people<0 or v_people>100 or v_hours<0 or v_hours>100 then
    raise exception 'SEA_VIBE_FUEL_SETTLEMENT_WEIGHT_RANGE_INVALID';
  end if;
  if round(v_people+v_hours,2)<>100.00 then
    raise exception 'SEA_VIBE_FUEL_SETTLEMENT_WEIGHTS_MUST_TOTAL_100';
  end if;

  update public.sea_vibe_fuel_settlement_config
  set people_weight_pct=v_people,
      hours_weight_pct=v_hours,
      updated_by=auth.uid(),
      updated_at=now()
  where singleton_id=1;

  return jsonb_build_object('ok',true,'peopleWeightPct',v_people,'hoursWeightPct',v_hours);
end;
$$;
grant execute on function public.sea_vibe_update_fuel_settlement_config_r44r4(numeric,numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Settlement header/lines: immutable audit snapshots.
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_fuel_settlements (
  id uuid primary key default gen_random_uuid(),
  cutoff_date date not null unique,
  previous_cutoff_date date,
  balance_before_liters numeric(18,3) not null,
  balance_before_value numeric(18,2) not null,
  unit_price_snapshot numeric(18,6) not null check (unit_price_snapshot>0),
  people_weight_pct numeric(5,2) not null,
  hours_weight_pct numeric(5,2) not null,
  value_per_person numeric(18,6) not null,
  value_per_hour numeric(18,6) not null,
  eligible_trip_count integer not null check (eligible_trip_count>0),
  total_people integer not null check (total_people>0),
  total_hours numeric(18,3) not null check (total_hours>0),
  ledger_transaction_id uuid references public.sea_vibe_fuel_transactions(id) on delete restrict,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint sea_vibe_fuel_settlement_cutoff_chain check (previous_cutoff_date is null or previous_cutoff_date < cutoff_date),
  constraint sea_vibe_fuel_settlement_weight_snapshot check (people_weight_pct + hours_weight_pct = 100.00),
  constraint sea_vibe_fuel_settlement_nonzero_balance check (balance_before_value<>0 or balance_before_liters<>0)
);

create table if not exists public.sea_vibe_fuel_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.sea_vibe_fuel_settlements(id) on delete restrict,
  trip_id uuid not null references public.sea_vibe_trips(id) on delete restrict,
  trip_serial text not null,
  trip_date date not null,
  people_count integer not null check (people_count>0),
  duration_hours numeric(10,3) not null check (duration_hours>0),
  allocation_share numeric(18,10) not null check (allocation_share>=0 and allocation_share<=1),
  fuel_cost_before numeric(18,2) not null check (fuel_cost_before>=0),
  adjustment_value numeric(18,2) not null,
  adjustment_liters numeric(18,3) not null,
  fuel_cost_after numeric(18,2) not null check (fuel_cost_after>=0),
  created_at timestamptz not null default now(),
  unique(settlement_id,trip_id)
);

create index if not exists sea_vibe_fuel_settlements_cutoff_idx
  on public.sea_vibe_fuel_settlements(cutoff_date desc,created_at desc);
create index if not exists sea_vibe_fuel_settlement_lines_trip_idx
  on public.sea_vibe_fuel_settlement_lines(trip_id,created_at desc);

-- ---------------------------------------------------------------------------
-- 4) Fuel ledger settlement transaction type.
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_fuel_transactions
  drop constraint if exists sea_vibe_fuel_transactions_transaction_type_check;
alter table public.sea_vibe_fuel_transactions
  add constraint sea_vibe_fuel_transactions_transaction_type_check
  check (transaction_type in ('topup','trip','trip_adjustment','settlement'));

alter table public.sea_vibe_fuel_transactions
  drop constraint if exists sea_vibe_fuel_transactions_value_delta_check;
alter table public.sea_vibe_fuel_transactions
  add constraint sea_vibe_fuel_transactions_value_delta_check
  check (
    (transaction_type='settlement' and (value_delta<>0 or coalesce(liters_delta,0)<>0))
    or (transaction_type<>'settlement' and value_delta<>0)
  );

alter table public.sea_vibe_fuel_transactions
  drop constraint if exists sea_vibe_fuel_transaction_shape;
alter table public.sea_vibe_fuel_transactions
  add constraint sea_vibe_fuel_transaction_shape check (
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
    or
    (
      transaction_type='settlement'
      and trip_id is null
      and valuation_status='valued'
      and liters_delta is not null
      and unit_price_snapshot is not null and unit_price_snapshot > 0
      and (value_delta<>0 or liters_delta<>0)
    )
  );

-- ---------------------------------------------------------------------------
-- 5) True cutoff helpers + settled-period guard.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_fuel_last_settlement_cutoff_r44r4()
returns date
language sql stable security definer set search_path=public as $$
  select max(cutoff_date) from public.sea_vibe_fuel_settlements;
$$;
revoke all on function public.sea_vibe_fuel_last_settlement_cutoff_r44r4() from public,anon,authenticated;

create or replace function public.sea_vibe_guard_fuel_settled_period_r44r4()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_cutoff date;
begin
  v_cutoff:=public.sea_vibe_fuel_last_settlement_cutoff_r44r4();
  if v_cutoff is null then return new; end if;

  if tg_op='INSERT' then
    if new.trip_date<=v_cutoff then
      raise exception 'SEA_VIBE_FUEL_SETTLED_PERIOD_LOCKED';
    end if;
    return new;
  end if;

  if (
       old.trip_date is distinct from new.trip_date
       or old.trip_type_id is distinct from new.trip_type_id
       or old.people_count is distinct from new.people_count
       or old.duration_hours is distinct from new.duration_hours
     )
     and (old.trip_date<=v_cutoff or new.trip_date<=v_cutoff) then
    raise exception 'SEA_VIBE_FUEL_SETTLED_PERIOD_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function public.sea_vibe_guard_fuel_settled_period_r44r4() from public,anon,authenticated;

drop trigger if exists trg_sea_vibe_fuel_settled_period_guard_r44r4 on public.sea_vibe_trips;
create trigger trg_sea_vibe_fuel_settled_period_guard_r44r4
before insert or update of trip_date,trip_type_id,people_count,duration_hours on public.sea_vibe_trips
for each row execute function public.sea_vibe_guard_fuel_settled_period_r44r4();

-- Back-dated fuel top-ups are also forbidden after a true cutoff.
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
  v_date date:=coalesce(p_transaction_date,current_date);
  v_cutoff date;
begin
  if not public.has_screen_permission('seaVibeFuel','add') then raise exception 'permission_denied'; end if;
  if v_liters<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_LITERS_INVALID'; end if;
  if v_value<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_VALUE_INVALID'; end if;
  v_cutoff:=public.sea_vibe_fuel_last_settlement_cutoff_r44r4();
  if v_cutoff is not null and v_date<=v_cutoff then raise exception 'SEA_VIBE_FUEL_SETTLED_PERIOD_LOCKED'; end if;
  v_price:=round((v_value/v_liters)::numeric,6);

  insert into public.sea_vibe_fuel_transactions(
    transaction_type,liters_delta,value_delta,unit_price_snapshot,valuation_status,
    reference,notes,transaction_date,created_by
  ) values(
    'topup',v_liters,v_value,v_price,'valued',
    'FUEL-TOPUP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),
    nullif(btrim(coalesce(p_notes,'')),''),v_date,auth.uid()
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
  v_date date:=coalesce(p_transaction_date,current_date);
  v_cutoff date;
begin
  if not public.has_screen_permission('seaVibeFuel','edit') then raise exception 'permission_denied'; end if;
  if v_liters<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_LITERS_INVALID'; end if;
  if v_value<=0 then raise exception 'SEA_VIBE_FUEL_TOPUP_VALUE_INVALID'; end if;

  select * into v_old from public.sea_vibe_fuel_transactions where id=p_id for update;
  if not found then raise exception 'SEA_VIBE_FUEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'SEA_VIBE_FUEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;
  v_cutoff:=public.sea_vibe_fuel_last_settlement_cutoff_r44r4();
  if v_cutoff is not null and (v_old.transaction_date<=v_cutoff or v_date<=v_cutoff) then
    raise exception 'SEA_VIBE_FUEL_SETTLED_PERIOD_LOCKED';
  end if;

  v_price:=round((v_value/v_liters)::numeric,6);
  update public.sea_vibe_fuel_transactions
  set liters_delta=v_liters,
      value_delta=v_value,
      unit_price_snapshot=v_price,
      valuation_status='valued',
      notes=nullif(btrim(coalesce(p_notes,'')),''),
      transaction_date=v_date
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
  v_cutoff date;
begin
  if not public.has_screen_permission('seaVibeFuel','delete') then raise exception 'permission_denied'; end if;
  select * into v_old from public.sea_vibe_fuel_transactions where id=p_id for update;
  if not found then raise exception 'SEA_VIBE_FUEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'SEA_VIBE_FUEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;
  v_cutoff:=public.sea_vibe_fuel_last_settlement_cutoff_r44r4();
  if v_cutoff is not null and v_old.transaction_date<=v_cutoff then
    raise exception 'SEA_VIBE_FUEL_SETTLED_PERIOD_LOCKED';
  end if;

  delete from public.sea_vibe_fuel_transactions where id=p_id;
  perform public.sea_vibe_refresh_fuel_unit_price_r44r3();
  return p_id;
end;
$$;
grant execute on function public.sea_vibe_fuel_topup_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Cutoff-consistent fuel unit price snapshot.
--    Never let a later top-up influence the audit snapshot of an earlier cutoff.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_fuel_unit_price_at_r44r4(p_cutoff_date date)
returns numeric
language sql stable security definer set search_path=public as $$
with balance_at_cutoff as (
  select round(sum(value_delta)/nullif(sum(liters_delta),0),6)::numeric as price
  from public.sea_vibe_fuel_transactions
  where transaction_date<=p_cutoff_date
    and valuation_status='valued'
    and liters_delta is not null
), last_known as (
  select unit_price_snapshot::numeric as price
  from public.sea_vibe_fuel_transactions
  where transaction_date<=p_cutoff_date
    and valuation_status='valued'
    and unit_price_snapshot is not null
    and unit_price_snapshot>0
  order by transaction_date desc,created_at desc,id desc
  limit 1
)
select case
  when (select price from balance_at_cutoff)>0 then (select price from balance_at_cutoff)
  else (select price from last_known)
end;
$$;
revoke all on function public.sea_vibe_fuel_unit_price_at_r44r4(date) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 7) Canonical settlement distribution helper reused by Preview + Apply.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_fuel_settlement_distribution_r44r4(p_cutoff_date date)
returns table(
  trip_id uuid,
  trip_serial text,
  trip_date date,
  people_count integer,
  duration_hours numeric,
  allocation_share numeric,
  fuel_cost_before numeric,
  adjustment_value numeric,
  adjustment_liters numeric,
  fuel_cost_after numeric
)
language sql stable security definer set search_path=public as $$
with cfg as (
  select people_weight_pct/100.0 as pw,hours_weight_pct/100.0 as hw
  from public.sea_vibe_fuel_settlement_config where singleton_id=1
), prev as (
  select max(cutoff_date) as cutoff_date from public.sea_vibe_fuel_settlements where cutoff_date < p_cutoff_date
), bal as (
  select
    round(coalesce(sum(value_delta),0),2)::numeric as value_balance,
    round(coalesce(sum(coalesce(liters_delta,0)),0),3)::numeric as liters_balance
  from public.sea_vibe_fuel_transactions
  where transaction_date<=p_cutoff_date
), base as (
  select t.id,t.trip_serial,t.trip_date,t.people_count::integer,t.duration_hours::numeric,
         e.amount::numeric as fuel_cost_before,
         row_number() over(order by t.trip_date,t.trip_serial,t.id) as rn,
         count(*) over() as cnt,
         sum(t.people_count) over()::numeric as total_people,
         sum(t.duration_hours) over()::numeric as total_hours
  from public.sea_vibe_trips t
  cross join prev p
  join public.sea_vibe_expenses e on e.trip_id=t.id and e.system_key='fuel_cost'
  where t.trip_date<=p_cutoff_date
    and (p.cutoff_date is null or t.trip_date>p.cutoff_date)
), shares as (
  select b.*,
         ((select pw from cfg)*(b.people_count/nullif(b.total_people,0))
          +(select hw from cfg)*(b.duration_hours/nullif(b.total_hours,0)))::numeric as share_raw
  from base b
), rounded as (
  select s.*,
         round((select value_balance from bal)*s.share_raw,2)::numeric as rounded_value,
         round((select liters_balance from bal)*s.share_raw,3)::numeric as rounded_liters
  from shares s
), final_alloc as (
  select r.*,
         case when rn=cnt then
           round((select value_balance from bal)-coalesce(sum(rounded_value) over(rows between unbounded preceding and 1 preceding),0),2)
         else rounded_value end::numeric as final_value,
         case when rn=cnt then
           round((select liters_balance from bal)-coalesce(sum(rounded_liters) over(rows between unbounded preceding and 1 preceding),0),3)
         else rounded_liters end::numeric as final_liters
  from rounded r
)
select id,trip_serial,trip_date,people_count,duration_hours,
       round(share_raw,10),fuel_cost_before,final_value,final_liters,
       round(fuel_cost_before+final_value,2)
from final_alloc
order by trip_date,trip_serial,id;
$$;
revoke all on function public.sea_vibe_fuel_settlement_distribution_r44r4(date) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 8) Online preview: no writes.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_fuel_settlement_preview_r44r4(p_cutoff_date date)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_cutoff date:=p_cutoff_date;
  v_last_cutoff date;
  v_value numeric(18,2):=0;
  v_liters numeric(18,3):=0;
  v_price numeric(18,6);
  v_pending bigint:=0;
  v_trip_count integer:=0;
  v_total_people integer:=0;
  v_total_hours numeric(18,3):=0;
  v_missing_system bigint:=0;
  v_unconfigured bigint:=0;
  v_people_weight numeric(5,2);
  v_hours_weight numeric(5,2);
  v_negative_final bigint:=0;
  v_lines jsonb:='[]'::jsonb;
  v_gate text:='READY';
begin
  if not public.has_screen_permission('seaVibeFuel','view') then raise exception 'permission_denied'; end if;
  if v_cutoff is null then raise exception 'SEA_VIBE_FUEL_SETTLEMENT_CUTOFF_REQUIRED'; end if;

  select max(cutoff_date) into v_last_cutoff from public.sea_vibe_fuel_settlements;
  select people_weight_pct,hours_weight_pct into v_people_weight,v_hours_weight
  from public.sea_vibe_fuel_settlement_config where singleton_id=1;

  select round(coalesce(sum(value_delta),0),2),
         round(coalesce(sum(coalesce(liters_delta,0)),0),3),
         count(*) filter(where valuation_status='pending')
  into v_value,v_liters,v_pending
  from public.sea_vibe_fuel_transactions
  where transaction_date<=v_cutoff;

  select count(*),coalesce(sum(t.people_count),0),round(coalesce(sum(t.duration_hours),0),3),
         count(*) filter(where e.id is null),
         count(*) filter(where tt.fuel_cost_amount<=0)
  into v_trip_count,v_total_people,v_total_hours,v_missing_system,v_unconfigured
  from public.sea_vibe_trips t
  join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
  left join public.sea_vibe_expenses e on e.trip_id=t.id and e.system_key='fuel_cost'
  where t.trip_date<=v_cutoff
    and (v_last_cutoff is null or t.trip_date>v_last_cutoff);

  v_price:=public.sea_vibe_fuel_unit_price_at_r44r4(v_cutoff);

  if v_cutoff>current_date then v_gate:='HOLD_FUTURE_CUTOFF';
  elsif v_last_cutoff is not null and v_cutoff<=v_last_cutoff then v_gate:='HOLD_CUTOFF_NOT_AFTER_LAST';
  elsif v_people_weight is null or v_hours_weight is null or round(v_people_weight+v_hours_weight,2)<>100.00 then v_gate:='HOLD_INVALID_WEIGHTS';
  elsif v_pending>0 or v_price is null or v_price<=0 then v_gate:='HOLD_PENDING_VALUATION';
  elsif v_trip_count<=0 or v_total_people<=0 or v_total_hours<=0 then v_gate:='HOLD_NO_ELIGIBLE_TRIPS';
  elsif v_missing_system>0 or v_unconfigured>0 then v_gate:='HOLD_TRIP_FUEL_INCOMPLETE';
  elsif v_value=0 and v_liters=0 then v_gate:='HOLD_ALREADY_ZERO';
  end if;

  if v_gate='READY' then
    select count(*) filter(where fuel_cost_after<0),
           coalesce(jsonb_agg(jsonb_build_object(
             'tripId',trip_id,
             'tripSerial',trip_serial,
             'tripDate',trip_date,
             'peopleCount',people_count,
             'durationHours',duration_hours,
             'allocationShare',allocation_share,
             'fuelCostBefore',fuel_cost_before,
             'adjustmentValue',adjustment_value,
             'adjustmentLiters',adjustment_liters,
             'fuelCostAfter',fuel_cost_after
           ) order by trip_date,trip_serial),'[]'::jsonb)
    into v_negative_final,v_lines
    from public.sea_vibe_fuel_settlement_distribution_r44r4(v_cutoff);
    if v_negative_final>0 then v_gate:='HOLD_NEGATIVE_TRIP_FUEL_COST'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'phase','R44R4',
    'mode','preview',
    'gate',v_gate,
    'cutoffDate',v_cutoff,
    'previousCutoffDate',v_last_cutoff,
    'periodStartDate',case when v_last_cutoff is null then null else v_last_cutoff+1 end,
    'balanceValue',v_value,
    'balanceLiters',v_liters,
    'unitPriceSnapshot',v_price,
    'peopleWeightPct',v_people_weight,
    'hoursWeightPct',v_hours_weight,
    'valuePerPerson',case when v_total_people>0 then round((v_value*(v_people_weight/100.0))/v_total_people,6) else 0 end,
    'valuePerHour',case when v_total_hours>0 then round((v_value*(v_hours_weight/100.0))/v_total_hours,6) else 0 end,
    'eligibleTripCount',v_trip_count,
    'totalPeople',v_total_people,
    'totalHours',v_total_hours,
    'pendingValuationCount',v_pending,
    'missingSystemFuelCount',v_missing_system,
    'unconfiguredTripCount',v_unconfigured,
    'distribution',v_lines,
    'negativeBalanceAllowed',true,
    'pruningChanged',false
  );
end;
$$;
grant execute on function public.sea_vibe_fuel_settlement_preview_r44r4(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Atomic apply: lock -> re-preview -> snapshot -> distribute -> zero -> verify.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_apply_fuel_settlement_r44r4(p_cutoff_date date)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_preview jsonb;
  v_settlement_id uuid;
  v_ledger_id uuid;
  v_value numeric(18,2);
  v_liters numeric(18,3);
  v_price numeric(18,6);
  v_after_value numeric(18,2);
  v_after_liters numeric(18,3);
  v_rows integer:=0;
begin
  if public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'super_admin_required';
  end if;
  if not public.has_screen_permission('seaVibeFuel','edit') then raise exception 'permission_denied'; end if;

  lock table public.sea_vibe_fuel_settlements in share row exclusive mode;
  lock table public.sea_vibe_fuel_settlement_lines in share row exclusive mode;
  lock table public.sea_vibe_fuel_transactions in share row exclusive mode;
  lock table public.sea_vibe_expenses in share row exclusive mode;
  lock table public.sea_vibe_trips in share mode;

  v_preview:=public.sea_vibe_fuel_settlement_preview_r44r4(p_cutoff_date);
  if coalesce(v_preview->>'gate','')<>'READY' then
    raise exception 'SEA_VIBE_FUEL_SETTLEMENT_NOT_READY:%',coalesce(v_preview->>'gate','UNKNOWN');
  end if;

  v_value:=(v_preview->>'balanceValue')::numeric;
  v_liters:=(v_preview->>'balanceLiters')::numeric;
  v_price:=(v_preview->>'unitPriceSnapshot')::numeric;

  insert into public.sea_vibe_fuel_settlements(
    cutoff_date,previous_cutoff_date,balance_before_liters,balance_before_value,
    unit_price_snapshot,people_weight_pct,hours_weight_pct,value_per_person,value_per_hour,
    eligible_trip_count,total_people,total_hours,created_by
  ) values(
    p_cutoff_date,nullif(v_preview->>'previousCutoffDate','')::date,
    v_liters,v_value,v_price,
    (v_preview->>'peopleWeightPct')::numeric,(v_preview->>'hoursWeightPct')::numeric,
    (v_preview->>'valuePerPerson')::numeric,(v_preview->>'valuePerHour')::numeric,
    (v_preview->>'eligibleTripCount')::integer,(v_preview->>'totalPeople')::integer,
    (v_preview->>'totalHours')::numeric,auth.uid()
  ) returning id into v_settlement_id;

  insert into public.sea_vibe_fuel_settlement_lines(
    settlement_id,trip_id,trip_serial,trip_date,people_count,duration_hours,
    allocation_share,fuel_cost_before,adjustment_value,adjustment_liters,fuel_cost_after
  )
  select v_settlement_id,trip_id,trip_serial,trip_date,people_count,duration_hours,
         allocation_share,fuel_cost_before,adjustment_value,adjustment_liters,fuel_cost_after
  from public.sea_vibe_fuel_settlement_distribution_r44r4(p_cutoff_date);
  get diagnostics v_rows=row_count;

  if v_rows<>(v_preview->>'eligibleTripCount')::integer then
    raise exception 'SEA_VIBE_FUEL_SETTLEMENT_DISTRIBUTION_CHANGED';
  end if;

  update public.sea_vibe_expenses e
  set amount=l.fuel_cost_after,
      notes=case
        when nullif(btrim(coalesce(e.notes,'')),'') is null then 'Fuel settlement through '||p_cutoff_date::text
        else e.notes||' | Fuel settlement through '||p_cutoff_date::text
      end,
      updated_by=auth.uid(),
      updated_at=now()
  from public.sea_vibe_fuel_settlement_lines l
  where l.settlement_id=v_settlement_id
    and e.trip_id=l.trip_id
    and e.system_key='fuel_cost';

  insert into public.sea_vibe_fuel_transactions(
    transaction_type,liters_delta,value_delta,unit_price_snapshot,valuation_status,
    trip_id,reference,notes,transaction_date,created_by
  ) values(
    'settlement',round(-v_liters,3),round(-v_value,2),v_price,'valued',
    null,'FUEL-SETTLEMENT-'||to_char(p_cutoff_date,'YYYYMMDD'),
    'تصفير رصيد البنزين وتوزيعه على الرحلات حتى '||p_cutoff_date::text,
    p_cutoff_date,auth.uid()
  ) returning id into v_ledger_id;

  update public.sea_vibe_fuel_settlements
  set ledger_transaction_id=v_ledger_id
  where id=v_settlement_id;

  select round(coalesce(sum(value_delta),0),2),round(coalesce(sum(coalesce(liters_delta,0)),0),3)
  into v_after_value,v_after_liters
  from public.sea_vibe_fuel_transactions
  where transaction_date<=p_cutoff_date;

  if v_after_value<>0 or v_after_liters<>0 then
    raise exception 'SEA_VIBE_FUEL_SETTLEMENT_POST_VERIFY_FAILED';
  end if;

  perform public.sea_vibe_refresh_fuel_unit_price_r44r3();

  return jsonb_build_object(
    'ok',true,
    'phase','R44R4',
    'settlementId',v_settlement_id,
    'cutoffDate',p_cutoff_date,
    'tripCount',v_rows,
    'settledValue',v_value,
    'settledLiters',v_liters,
    'balanceAfterValue',v_after_value,
    'balanceAfterLiters',v_after_liters,
    'pruningChanged',false
  );
end;
$$;
grant execute on function public.sea_vibe_apply_fuel_settlement_r44r4(date) to authenticated;


-- Keep the existing fuel balance surface canonical while making settlement
-- adjustments part of net consumed fuel. Positive settlement corrections reduce
-- consumed totals; negative settlement rows increase them.
create or replace view public.sea_vibe_fuel_balance with (security_invoker=true) as
with totals as (
  select
    coalesce(sum(coalesce(liters_delta,0)),0)::numeric(18,3) as balance_liters,
    coalesce(sum(value_delta),0)::numeric(18,2) as balance_value,
    coalesce(sum(liters_delta) filter(where transaction_type='topup'),0)::numeric(18,3) as total_topup_liters,
    coalesce(sum(value_delta) filter(where transaction_type='topup'),0)::numeric(18,2) as total_topup_value,
    greatest(0,-coalesce(sum(coalesce(liters_delta,0)) filter(where transaction_type<>'topup'),0))::numeric(18,3) as total_deducted_liters,
    greatest(0,-coalesce(sum(value_delta) filter(where transaction_type<>'topup'),0))::numeric(18,2) as total_deducted_value,
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

-- ---------------------------------------------------------------------------
-- 10) RLS/read surfaces. No direct writes are granted.
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_fuel_settlement_config enable row level security;
alter table public.sea_vibe_fuel_settlements enable row level security;
alter table public.sea_vibe_fuel_settlement_lines enable row level security;

revoke all on table public.sea_vibe_fuel_settlement_config from anon,authenticated;
revoke all on table public.sea_vibe_fuel_settlements from anon,authenticated;
revoke all on table public.sea_vibe_fuel_settlement_lines from anon,authenticated;
grant select on public.sea_vibe_fuel_settlement_config to authenticated;
grant select on public.sea_vibe_fuel_settlements to authenticated;
grant select on public.sea_vibe_fuel_settlement_lines to authenticated;

drop policy if exists "sea vibe fuel settlement config read" on public.sea_vibe_fuel_settlement_config;
create policy "sea vibe fuel settlement config read" on public.sea_vibe_fuel_settlement_config
for select to authenticated
using(public.has_screen_permission('seaVibeReference','view') or public.has_screen_permission('seaVibeFuel','view'));

drop policy if exists "sea vibe fuel settlements read" on public.sea_vibe_fuel_settlements;
create policy "sea vibe fuel settlements read" on public.sea_vibe_fuel_settlements
for select to authenticated
using(public.has_screen_permission('seaVibeFuel','view'));

drop policy if exists "sea vibe fuel settlement lines read" on public.sea_vibe_fuel_settlement_lines;
create policy "sea vibe fuel settlement lines read" on public.sea_vibe_fuel_settlement_lines
for select to authenticated
using(public.has_screen_permission('seaVibeFuel','view'));

comment on table public.sea_vibe_fuel_settlements is
'R44R4 immutable SEA VIBE fuel settlement headers. A posted cutoff closes that fuel period and later settlements start after it.';
comment on table public.sea_vibe_fuel_settlement_lines is
'R44R4 per-trip settlement allocation snapshots used for audit and future fuel-efficiency analytics.';
comment on column public.sea_vibe_fuel_settlements.value_per_person is
'Signed SAR per-person settlement rate snapshot for the people-weight component.';
comment on column public.sea_vibe_fuel_settlements.value_per_hour is
'Signed SAR per-hour settlement rate snapshot for the duration-weight component.';
comment on column public.sea_vibe_fuel_settlement_lines.adjustment_value is
'Signed SAR amount added to the trip canonical fuel expense during settlement.';
comment on column public.sea_vibe_fuel_settlement_lines.adjustment_liters is
'Signed liters allocated to the trip for settlement/efficiency analysis; same allocation share as value.';

commit;
