-- PETATOE P5.13.8.72 R44R6 — SEA VIBE Zawel negative balance support
-- Scope:
--   1) Sailing-permit deductions and permit adjustments may drive Zawel below zero.
--   2) Manual Zawel top-up edit/delete remain permission-protected, but no longer fail
--      solely because the resulting aggregate Zawel balance is negative.
-- Existing tariff, ledger, idempotency, system-transaction read-only, RLS and permission
-- contracts remain unchanged.
begin;

-- Canonical sailing-permit expense + Zawel ledger owner.
-- Negative aggregate balance is an accepted operating state: a trip may be created before
-- the corresponding Zawel top-up is entered, and a later top-up naturally offsets the debt.
create or replace function public.sea_vibe_sync_permit_expense() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_catalog uuid;
  v_fee numeric(12,2);
  v_points integer;
  v_old_points integer:=0;
  v_has_wallet boolean:=false;
  v_delta integer:=0;
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

-- Manual top-up edits keep the existing permission and positive-points validation.
-- Only the aggregate non-negative balance guard is removed.
create or replace function public.sea_vibe_zawel_topup_update(
  p_id uuid,
  p_points integer,
  p_notes text default null,
  p_transaction_date date default current_date
)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_old public.sea_vibe_zawel_transactions%rowtype;
  v_cost numeric(14,2);
begin
  if not public.has_screen_permission('seaVibeZawel','edit') then raise exception 'permission_denied'; end if;
  if p_points is null or p_points<=0 then raise exception 'invalid_points'; end if;

  select * into v_old
  from public.sea_vibe_zawel_transactions
  where id=p_id
  for update;

  if not found then raise exception 'ZAWEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'ZAWEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;

  v_cost:=round((p_points::numeric*575/2500),2);
  update public.sea_vibe_zawel_transactions
  set points_delta=p_points,
      cash_amount=v_cost,
      notes=nullif(btrim(p_notes),''),
      transaction_date=coalesce(p_transaction_date,current_date)
  where id=p_id;

  return p_id;
end; $$;

grant execute on function public.sea_vibe_zawel_topup_update(uuid,integer,text,date) to authenticated;

-- Manual top-up deletion remains permission-protected and top-up-only, but may expose
-- a negative aggregate balance that later top-ups can offset.
create or replace function public.sea_vibe_zawel_topup_delete(p_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_old public.sea_vibe_zawel_transactions%rowtype;
begin
  if not public.has_screen_permission('seaVibeZawel','delete') then raise exception 'permission_denied'; end if;

  select * into v_old
  from public.sea_vibe_zawel_transactions
  where id=p_id
  for update;

  if not found then raise exception 'ZAWEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'ZAWEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;

  delete from public.sea_vibe_zawel_transactions where id=p_id;
  return p_id;
end; $$;

grant execute on function public.sea_vibe_zawel_topup_delete(uuid) to authenticated;

comment on function public.sea_vibe_sync_permit_expense() is
'R44R6 canonical SEA VIBE sailing-permit expense/Zawel ledger sync. Permit deductions and adjustments may produce a negative aggregate Zawel balance; later top-ups offset it.';

comment on function public.sea_vibe_zawel_topup_update(uuid,integer,text,date) is
'R44R6 Zawel top-up edit. Permission-protected and top-up-only; resulting aggregate Zawel balance may be negative.';

comment on function public.sea_vibe_zawel_topup_delete(uuid) is
'R44R6 Zawel top-up delete. Permission-protected and top-up-only; resulting aggregate Zawel balance may be negative.';

commit;
