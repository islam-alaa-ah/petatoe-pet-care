-- PETATOE P5.13.8.69R2 — Zawel top-up date + async form reset hotfix
begin;

alter table public.sea_vibe_zawel_transactions
  add column if not exists transaction_date date;

update public.sea_vibe_zawel_transactions
set transaction_date = created_at::date
where transaction_date is null;

alter table public.sea_vibe_zawel_transactions
  alter column transaction_date set default current_date;

alter table public.sea_vibe_zawel_transactions
  alter column transaction_date set not null;

create index if not exists sea_vibe_zawel_transactions_date_idx
  on public.sea_vibe_zawel_transactions(transaction_date desc, created_at desc);

drop function if exists public.sea_vibe_zawel_topup(integer,text);
create or replace function public.sea_vibe_zawel_topup(
  p_points integer,
  p_notes text default null,
  p_transaction_date date default current_date
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_cost numeric(14,2); v_date date;
begin
  if not public.has_screen_permission('seaVibeZawel','add') then raise exception 'permission_denied'; end if;
  if p_points is null or p_points<=0 then raise exception 'invalid_points'; end if;
  v_date:=coalesce(p_transaction_date,current_date);
  v_cost:=round((p_points::numeric*575/2500),2);
  insert into public.sea_vibe_zawel_transactions(transaction_type,points_delta,cash_amount,reference,notes,transaction_date,created_by)
  values('topup',p_points,v_cost,'TOPUP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),nullif(btrim(p_notes),''),v_date,auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.sea_vibe_zawel_topup(integer,text,date) to authenticated;

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
select 'zawel_topup:'||z.id::text,
       z.transaction_date::timestamptz + (z.created_at::time),
       'zawel_topup',(-z.cash_amount)::numeric(14,2),coalesce(z.reference,''),'شحن رصيد زاول',null::uuid,null::uuid
from public.sea_vibe_zawel_transactions z where z.transaction_type='topup';

commit;
