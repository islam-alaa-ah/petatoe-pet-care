-- PETATOE P5.13.8.69 — SEA VIBE treasury + Zawel wallet
begin;

create table if not exists public.sea_vibe_zawel_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('topup','permit','permit_adjustment')),
  points_delta integer not null check (points_delta <> 0),
  cash_amount numeric(14,2) not null default 0 check (cash_amount >= 0),
  trip_id uuid references public.sea_vibe_trips(id) on delete restrict,
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint sea_vibe_zawel_trip_owner check (
    (transaction_type='topup' and trip_id is null and points_delta > 0)
    or (transaction_type in ('permit','permit_adjustment') and trip_id is not null)
  )
);
create index if not exists sea_vibe_zawel_transactions_created_idx on public.sea_vibe_zawel_transactions(created_at desc);
create index if not exists sea_vibe_zawel_transactions_trip_idx on public.sea_vibe_zawel_transactions(trip_id) where trip_id is not null;

create or replace view public.sea_vibe_zawel_balance with (security_invoker=true) as
select coalesce(sum(points_delta),0)::bigint as balance_points,
       coalesce(sum(points_delta) filter(where points_delta>0),0)::bigint as total_charged_points,
       abs(coalesce(sum(points_delta) filter(where points_delta<0),0))::bigint as total_deducted_points,
       coalesce(sum(cash_amount) filter(where transaction_type='topup'),0)::numeric(14,2) as total_topup_cost
from public.sea_vibe_zawel_transactions;

create or replace function public.sea_vibe_zawel_topup(p_points integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_cost numeric(14,2);
begin
  if not public.has_screen_permission('seaVibeZawel','add') then raise exception 'permission_denied'; end if;
  if p_points is null or p_points<=0 then raise exception 'invalid_points'; end if;
  v_cost:=round((p_points::numeric*575/2500),2);
  insert into public.sea_vibe_zawel_transactions(transaction_type,points_delta,cash_amount,reference,notes,created_by)
  values('topup',p_points,v_cost,'TOPUP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),nullif(btrim(p_notes),''),auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.sea_vibe_zawel_topup(integer,text) to authenticated;

create or replace function public.sea_vibe_sync_permit_expense() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_catalog uuid; v_fee numeric(12,2); v_points integer; v_old_points integer:=0;
  v_has_wallet boolean:=false; v_delta integer:=0; v_balance bigint:=0;
begin
  select id into v_catalog from public.sea_vibe_expense_catalog where system_key='sailing_permit' limit 1;
  select fee_amount,coalesce(points,0) into v_fee,v_points from public.sea_vibe_sailing_permit_fees where people_count=new.people_count and duration_hours=new.duration_hours;
  if v_catalog is null or v_fee is null then raise exception 'SEA_VIBE_PERMIT_REFERENCE_MISSING'; end if;

  insert into public.sea_vibe_expenses(expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,is_system_generated,system_key,created_by,updated_by)
  values('trip',new.id,v_catalog,new.trip_date,v_fee,null,'Auto-calculated from sailing permit reference matrix',true,'sailing_permit',coalesce(new.created_by,auth.uid()),auth.uid())
  on conflict(trip_id,system_key) where trip_id is not null and system_key is not null
  do update set expense_catalog_id=excluded.expense_catalog_id,expense_date=excluded.expense_date,amount=excluded.amount,updated_by=auth.uid(),updated_at=now();

  if tg_op='INSERT' then
    if v_points>0 then
      select coalesce(sum(points_delta),0) into v_balance from public.sea_vibe_zawel_transactions;
      if v_balance < v_points then raise exception 'SEA_VIBE_ZAWEL_INSUFFICIENT_POINTS'; end if;
      insert into public.sea_vibe_zawel_transactions(transaction_type,points_delta,cash_amount,trip_id,reference,notes,created_by)
      values('permit',-v_points,v_fee,new.id,new.trip_serial,'رسوم تصريح الإبحار',auth.uid());
    end if;
  else
    select exists(select 1 from public.sea_vibe_zawel_transactions where trip_id=new.id and transaction_type in ('permit','permit_adjustment')) into v_has_wallet;
    if v_has_wallet and (old.people_count is distinct from new.people_count or old.duration_hours is distinct from new.duration_hours) then
      select coalesce(points,0) into v_old_points from public.sea_vibe_sailing_permit_fees where people_count=old.people_count and duration_hours=old.duration_hours;
      v_delta:=v_old_points-v_points;
      if v_delta<>0 then
        select coalesce(sum(points_delta),0) into v_balance from public.sea_vibe_zawel_transactions;
        if v_delta<0 and v_balance < abs(v_delta) then raise exception 'SEA_VIBE_ZAWEL_INSUFFICIENT_POINTS'; end if;
        insert into public.sea_vibe_zawel_transactions(transaction_type,points_delta,cash_amount,trip_id,reference,notes,created_by)
        values('permit_adjustment',v_delta,abs(round(((v_old_points-v_points)::numeric*575/2500),2)),new.id,new.trip_serial,'تسوية رسوم تصريح الإبحار بعد تعديل الرحلة',auth.uid());
      end if;
    end if;
  end if;
  return new;
end; $$;

-- Fix the update comparison in a compact trigger wrapper: the sync function itself only runs on relevant columns.
drop trigger if exists trg_sea_vibe_trip_permit_expense on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_permit_expense after insert or update of trip_date,duration_hours,people_count on public.sea_vibe_trips for each row execute function public.sea_vibe_sync_permit_expense();

create or replace view public.sea_vibe_treasury_movements with (security_invoker=true) as
select 'trip_revenue:'||t.id::text as movement_id,t.trip_date::timestamptz as movement_at,'trip_revenue'::text as movement_type,
       t.total_value::numeric(14,2) as amount,t.trip_serial as reference,coalesce(t.notes,'') as description,t.id as trip_id,null::uuid as asset_id
from public.sea_vibe_trips t
union all
select 'expense:'||e.id::text,e.expense_date::timestamptz,
       case when e.expense_scope='asset' then 'asset_expense' else 'expense' end,
       (-e.amount)::numeric(14,2),coalesce(t.trip_serial,a.asset_code,''),coalesce(c.name_ar,'')||case when e.notes is null then '' else ' — '||e.notes end,e.trip_id,e.asset_id
from public.sea_vibe_expenses e
left join public.sea_vibe_trips t on t.id=e.trip_id
left join public.sea_vibe_assets a on a.id=e.asset_id
left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
where coalesce(e.system_key,'')<>'sailing_permit'
union all
select 'zawel_topup:'||z.id::text,z.created_at,'zawel_topup',(-z.cash_amount)::numeric(14,2),coalesce(z.reference,''),'شحن رصيد زاول',null::uuid,null::uuid
from public.sea_vibe_zawel_transactions z where z.transaction_type='topup';

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active) values
('seaVibeTreasury','SEA VIBE - الخزنة','SEA VIBE',156,true),
('seaVibeZawel','SEA VIBE - رصيد زاول','SEA VIBE',157,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;
update public.app_screens set display_order=158 where screen_key='seaVibeReference';
update public.app_screens set display_order=159 where screen_key='seaVibeReports';
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,screen_key,true,true,true,true,true from public.app_screens where screen_key in ('seaVibeTreasury','seaVibeZawel')
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true,updated_at=now();

create or replace function public.sea_vibe_can_view() returns boolean language sql stable security definer set search_path=public as $$
  select public.has_screen_permission('seaVibeTrips','view') or public.has_screen_permission('seaVibeTripNew','view') or public.has_screen_permission('seaVibeTripDetails','view')
      or public.has_screen_permission('seaVibeExpenseNew','view') or public.has_screen_permission('seaVibeGeneralExpenses','view') or public.has_screen_permission('seaVibeAssets','view')
      or public.has_screen_permission('seaVibeTreasury','view') or public.has_screen_permission('seaVibeZawel','view') or public.has_screen_permission('seaVibeReference','view') or public.has_screen_permission('seaVibeReports','view');
$$;
grant execute on function public.sea_vibe_can_view() to authenticated;

alter table public.sea_vibe_zawel_transactions enable row level security;
drop policy if exists "sea vibe zawel read" on public.sea_vibe_zawel_transactions;
create policy "sea vibe zawel read" on public.sea_vibe_zawel_transactions for select to authenticated using(public.has_screen_permission('seaVibeZawel','view') or public.has_screen_permission('seaVibeTreasury','view'));
drop policy if exists "sea vibe zawel insert" on public.sea_vibe_zawel_transactions;
create policy "sea vibe zawel insert" on public.sea_vibe_zawel_transactions for insert to authenticated with check(public.has_screen_permission('seaVibeZawel','add'));
grant select on public.sea_vibe_zawel_transactions to authenticated;
grant select on public.sea_vibe_zawel_balance,public.sea_vibe_treasury_movements to authenticated;

commit;
