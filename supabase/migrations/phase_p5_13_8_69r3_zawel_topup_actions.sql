-- PETATOE P5.13.8.69R3 — Zawel top-up edit/delete actions
begin;

create or replace function public.sea_vibe_zawel_topup_update(
  p_id uuid,
  p_points integer,
  p_notes text default null,
  p_transaction_date date default current_date
)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_old public.sea_vibe_zawel_transactions%rowtype;
  v_balance bigint;
  v_new_balance bigint;
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

  select coalesce(sum(points_delta),0) into v_balance
  from public.sea_vibe_zawel_transactions;
  v_new_balance:=v_balance-v_old.points_delta+p_points;
  if v_new_balance<0 then raise exception 'SEA_VIBE_ZAWEL_INSUFFICIENT_POINTS'; end if;

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

create or replace function public.sea_vibe_zawel_topup_delete(p_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_old public.sea_vibe_zawel_transactions%rowtype;
  v_balance bigint;
begin
  if not public.has_screen_permission('seaVibeZawel','delete') then raise exception 'permission_denied'; end if;

  select * into v_old
  from public.sea_vibe_zawel_transactions
  where id=p_id
  for update;

  if not found then raise exception 'ZAWEL_TRANSACTION_NOT_FOUND'; end if;
  if v_old.transaction_type<>'topup' then raise exception 'ZAWEL_SYSTEM_TRANSACTION_READ_ONLY'; end if;

  select coalesce(sum(points_delta),0) into v_balance
  from public.sea_vibe_zawel_transactions;
  if v_balance-v_old.points_delta<0 then raise exception 'SEA_VIBE_ZAWEL_INSUFFICIENT_POINTS'; end if;

  delete from public.sea_vibe_zawel_transactions where id=p_id;
  return p_id;
end; $$;

grant execute on function public.sea_vibe_zawel_topup_delete(uuid) to authenticated;

commit;
