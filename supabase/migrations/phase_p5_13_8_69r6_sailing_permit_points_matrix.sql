-- PETATOE P5.13.8.69R6 — SEA VIBE sailing-permit canonical points matrix
begin;

-- Points are the canonical value. SAR is always derived from the Zawel rate:
-- 2500 points = 575 SAR (0.23 SAR / point).
update public.sea_vibe_sailing_permit_fees
set points = coalesce(points, round((fee_amount * 2500 / 575))::integer)
where duration_hours between 1 and 5;

update public.sea_vibe_sailing_permit_fees
set fee_amount = round((coalesce(points,0)::numeric * 575 / 2500),2)
where duration_hours between 1 and 5;

-- Hours 6..10 are operational aliases of the 5-hour tariff for the same people count.
update public.sea_vibe_sailing_permit_fees target
set points = src.points,
    fee_amount = src.fee_amount,
    updated_at = now()
from public.sea_vibe_sailing_permit_fees src
where src.people_count = target.people_count
  and src.duration_hours = 5
  and target.duration_hours between 6 and 10;

alter table public.sea_vibe_sailing_permit_fees
  alter column points set not null;

alter table public.sea_vibe_sailing_permit_fees
  drop constraint if exists sea_vibe_sailing_permit_fees_points_nonnegative;
alter table public.sea_vibe_sailing_permit_fees
  add constraint sea_vibe_sailing_permit_fees_points_nonnegative check (points >= 0);

create or replace function public.sea_vibe_permit_points_amount_guard()
returns trigger language plpgsql as $$
begin
  new.points := greatest(coalesce(new.points,0),0);
  new.fee_amount := round((new.points::numeric * 575 / 2500),2);
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_sea_vibe_permit_points_amount_guard on public.sea_vibe_sailing_permit_fees;
create trigger trg_sea_vibe_permit_points_amount_guard
before insert or update of points,fee_amount
on public.sea_vibe_sailing_permit_fees
for each row execute function public.sea_vibe_permit_points_amount_guard();

-- Canonical owner for sailing-permit expense and Zawel points.
-- 1..5 hours use their own matrix cell; 6..10 hours use the 5-hour cell.
create or replace function public.sea_vibe_sync_permit_expense() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_catalog uuid;
  v_fee numeric(12,2);
  v_points integer;
  v_old_points integer:=0;
  v_has_wallet boolean:=false;
  v_delta integer:=0;
  v_balance bigint:=0;
  v_duration integer;
  v_old_duration integer;
begin
  v_duration := least(greatest(new.duration_hours,1),5);
  v_old_duration := case when tg_op='UPDATE' then least(greatest(old.duration_hours,1),5) else v_duration end;

  select id into v_catalog
  from public.sea_vibe_expense_catalog
  where system_key='sailing_permit'
  limit 1;

  select fee_amount,points into v_fee,v_points
  from public.sea_vibe_sailing_permit_fees
  where people_count=new.people_count
    and duration_hours=v_duration;

  if v_catalog is null or v_fee is null or v_points is null then
    raise exception 'SEA_VIBE_PERMIT_REFERENCE_MISSING';
  end if;

  insert into public.sea_vibe_expenses(
    expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
    is_system_generated,system_key,created_by,updated_by
  ) values(
    'trip',new.id,v_catalog,new.trip_date,v_fee,null,
    'Auto-calculated from sailing permit reference matrix',true,'sailing_permit',
    coalesce(new.created_by,auth.uid()),auth.uid()
  )
  on conflict(trip_id,system_key) where trip_id is not null and system_key is not null
  do update set
    expense_catalog_id=excluded.expense_catalog_id,
    expense_date=excluded.expense_date,
    amount=excluded.amount,
    updated_by=auth.uid(),
    updated_at=now();

  if tg_op='INSERT' then
    if v_points>0 then
      select coalesce(sum(points_delta),0) into v_balance
      from public.sea_vibe_zawel_transactions;

      if v_balance < v_points then
        raise exception 'SEA_VIBE_ZAWEL_INSUFFICIENT_POINTS';
      end if;

      insert into public.sea_vibe_zawel_transactions(
        transaction_type,points_delta,cash_amount,trip_id,reference,notes,transaction_date,created_by
      ) values(
        'permit',-v_points,v_fee,new.id,new.trip_serial,'رسوم تصريح الإبحار',new.trip_date,auth.uid()
      );
    end if;
  else
    if old.trip_date is distinct from new.trip_date then
      update public.sea_vibe_zawel_transactions
      set transaction_date=new.trip_date
      where trip_id=new.id
        and transaction_type in ('permit','permit_adjustment');
    end if;

    select exists(
      select 1 from public.sea_vibe_zawel_transactions
      where trip_id=new.id
        and transaction_type in ('permit','permit_adjustment')
    ) into v_has_wallet;

    if v_has_wallet
       and (old.people_count is distinct from new.people_count
            or old.duration_hours is distinct from new.duration_hours) then
      select points into v_old_points
      from public.sea_vibe_sailing_permit_fees
      where people_count=old.people_count
        and duration_hours=v_old_duration;

      v_old_points:=coalesce(v_old_points,0);
      v_delta:=v_old_points-v_points;

      if v_delta<>0 then
        select coalesce(sum(points_delta),0) into v_balance
        from public.sea_vibe_zawel_transactions;

        if v_delta<0 and v_balance < abs(v_delta) then
          raise exception 'SEA_VIBE_ZAWEL_INSUFFICIENT_POINTS';
        end if;

        insert into public.sea_vibe_zawel_transactions(
          transaction_type,points_delta,cash_amount,trip_id,reference,notes,transaction_date,created_by
        ) values(
          'permit_adjustment',v_delta,
          abs(round((v_delta::numeric * 575 / 2500),2)),
          new.id,new.trip_serial,'تسوية رسوم تصريح الإبحار بعد تعديل الرحلة',new.trip_date,auth.uid()
        );
      end if;
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_sea_vibe_trip_permit_expense on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_permit_expense
after insert or update of trip_date,duration_hours,people_count
on public.sea_vibe_trips
for each row execute function public.sea_vibe_sync_permit_expense();

commit;
