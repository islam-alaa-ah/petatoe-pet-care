-- PETATOE P5.13.8.69R4 — Treasury movement serials + grouped expense edit/delete
begin;

create sequence if not exists public.sea_vibe_treasury_movement_seq;

create or replace function public.sea_vibe_next_treasury_movement_serial(p_date date default current_date)
returns text language plpgsql security definer set search_path=public as $$
begin
  return 'SV-MOV-'||extract(year from coalesce(p_date,current_date))::int||'-'||lpad(nextval('public.sea_vibe_treasury_movement_seq')::text,6,'0');
end; $$;
grant execute on function public.sea_vibe_next_treasury_movement_serial(date) to authenticated;

alter table public.sea_vibe_trips add column if not exists treasury_movement_serial text;
alter table public.sea_vibe_expenses add column if not exists movement_group_id uuid;
alter table public.sea_vibe_expenses add column if not exists movement_serial text;
alter table public.sea_vibe_zawel_transactions add column if not exists treasury_movement_serial text;

update public.sea_vibe_trips
set treasury_movement_serial=public.sea_vibe_next_treasury_movement_serial(trip_date)
where treasury_movement_serial is null;

update public.sea_vibe_expenses
set movement_group_id=id,
    movement_serial=public.sea_vibe_next_treasury_movement_serial(expense_date)
where coalesce(is_system_generated,false)=false and movement_group_id is null;

update public.sea_vibe_zawel_transactions
set treasury_movement_serial=public.sea_vibe_next_treasury_movement_serial(transaction_date)
where transaction_type='topup' and treasury_movement_serial is null;

create unique index if not exists sea_vibe_trips_treasury_movement_serial_uidx
  on public.sea_vibe_trips(treasury_movement_serial) where treasury_movement_serial is not null;
create index if not exists sea_vibe_expenses_movement_group_idx
  on public.sea_vibe_expenses(movement_group_id) where movement_group_id is not null;
create index if not exists sea_vibe_expenses_movement_serial_idx
  on public.sea_vibe_expenses(movement_serial) where movement_serial is not null;
create unique index if not exists sea_vibe_zawel_treasury_movement_serial_uidx
  on public.sea_vibe_zawel_transactions(treasury_movement_serial) where treasury_movement_serial is not null;

create or replace function public.sea_vibe_assign_trip_treasury_serial() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.treasury_movement_serial is null or btrim(new.treasury_movement_serial)='' then
    new.treasury_movement_serial:=public.sea_vibe_next_treasury_movement_serial(new.trip_date);
  end if;
  return new;
end; $$;
drop trigger if exists trg_sea_vibe_trip_treasury_serial on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_treasury_serial before insert on public.sea_vibe_trips
for each row execute function public.sea_vibe_assign_trip_treasury_serial();

create or replace function public.sea_vibe_assign_zawel_treasury_serial() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.transaction_type='topup' and (new.treasury_movement_serial is null or btrim(new.treasury_movement_serial)='') then
    new.treasury_movement_serial:=public.sea_vibe_next_treasury_movement_serial(coalesce(new.transaction_date,current_date));
  end if;
  return new;
end; $$;
drop trigger if exists trg_sea_vibe_zawel_treasury_serial on public.sea_vibe_zawel_transactions;
create trigger trg_sea_vibe_zawel_treasury_serial before insert on public.sea_vibe_zawel_transactions
for each row execute function public.sea_vibe_assign_zawel_treasury_serial();

create or replace function public.sea_vibe_add_expense_batch(
  p_scope text,
  p_trip_id uuid,
  p_asset_id uuid,
  p_lines jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_group uuid:=gen_random_uuid();
  v_serial text;
  v_status text;
  v_line jsonb;
  v_id uuid;
  v_ids jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('seaVibeExpenseNew','add') then raise exception 'permission_denied'; end if;
  if p_scope not in ('general','trip','asset') then raise exception 'invalid_scope'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'expense_lines_required'; end if;
  v_serial:=public.sea_vibe_next_treasury_movement_serial(coalesce(nullif(p_lines->0->>'date','')::date,current_date));
  if p_scope='trip' then
    select status into v_status from public.sea_vibe_trips where id=p_trip_id for update;
    if v_status is null then raise exception 'trip_not_found'; end if;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  elsif p_scope='asset' and not exists(select 1 from public.sea_vibe_assets where id=p_asset_id) then
    raise exception 'asset_not_found';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.sea_vibe_expenses(
      expense_scope,trip_id,asset_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
      movement_group_id,movement_serial,created_by,updated_by
    ) values(
      p_scope,
      case when p_scope='trip' then p_trip_id else null end,
      case when p_scope='asset' then p_asset_id else null end,
      nullif(v_line->>'catalog_id','')::uuid,
      nullif(v_line->>'date','')::date,
      coalesce((v_line->>'amount')::numeric,0),
      nullif(v_line->>'payment_method_id','')::uuid,
      nullif(btrim(v_line->>'notes'),''),
      v_group,v_serial,auth.uid(),auth.uid()
    ) returning id into v_id;
    v_ids:=v_ids||jsonb_build_array(v_id);
  end loop;
  return jsonb_build_object('movement_group_id',v_group,'movement_serial',v_serial,'expense_ids',v_ids);
end; $$;
grant execute on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) to authenticated;

create or replace function public.sea_vibe_update_expense_batch(
  p_group_id uuid,
  p_scope text,
  p_trip_id uuid,
  p_asset_id uuid,
  p_lines jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_serial text;
  v_status text;
  v_old_trip uuid;
  v_line jsonb;
  v_id uuid;
  v_ids jsonb:='[]'::jsonb;
  v_keep uuid[]:=array[]::uuid[];
begin
  if not public.has_screen_permission('seaVibeExpenseNew','edit') then raise exception 'permission_denied'; end if;
  if p_scope not in ('general','trip','asset') then raise exception 'invalid_scope'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'expense_lines_required'; end if;

  select movement_serial,trip_id into v_serial,v_old_trip
  from public.sea_vibe_expenses
  where movement_group_id=p_group_id and coalesce(is_system_generated,false)=false
  order by created_at,id
  limit 1;
  if v_serial is null then raise exception 'EXPENSE_MOVEMENT_NOT_FOUND'; end if;

  if v_old_trip is not null then
    select status into v_status from public.sea_vibe_trips where id=v_old_trip for update;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  end if;
  if p_scope='trip' then
    select status into v_status from public.sea_vibe_trips where id=p_trip_id for update;
    if v_status is null then raise exception 'trip_not_found'; end if;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  elsif p_scope='asset' and not exists(select 1 from public.sea_vibe_assets where id=p_asset_id) then
    raise exception 'asset_not_found';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_id:=nullif(v_line->>'id','')::uuid;
    if v_id is not null then
      if not exists(select 1 from public.sea_vibe_expenses where id=v_id and movement_group_id=p_group_id and coalesce(is_system_generated,false)=false) then
        raise exception 'EXPENSE_LINE_NOT_IN_MOVEMENT';
      end if;
      update public.sea_vibe_expenses set
        expense_scope=p_scope,
        trip_id=case when p_scope='trip' then p_trip_id else null end,
        asset_id=case when p_scope='asset' then p_asset_id else null end,
        expense_catalog_id=nullif(v_line->>'catalog_id','')::uuid,
        expense_date=nullif(v_line->>'date','')::date,
        amount=coalesce((v_line->>'amount')::numeric,0),
        payment_method_id=nullif(v_line->>'payment_method_id','')::uuid,
        notes=nullif(btrim(v_line->>'notes'),''),
        updated_by=auth.uid(),updated_at=now()
      where id=v_id;
    else
      insert into public.sea_vibe_expenses(
        expense_scope,trip_id,asset_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
        movement_group_id,movement_serial,created_by,updated_by
      ) values(
        p_scope,
        case when p_scope='trip' then p_trip_id else null end,
        case when p_scope='asset' then p_asset_id else null end,
        nullif(v_line->>'catalog_id','')::uuid,
        nullif(v_line->>'date','')::date,
        coalesce((v_line->>'amount')::numeric,0),
        nullif(v_line->>'payment_method_id','')::uuid,
        nullif(btrim(v_line->>'notes'),''),
        p_group_id,v_serial,auth.uid(),auth.uid()
      ) returning id into v_id;
    end if;
    v_keep:=array_append(v_keep,v_id);
    v_ids:=v_ids||jsonb_build_array(v_id);
  end loop;

  delete from public.sea_vibe_expenses
  where movement_group_id=p_group_id
    and coalesce(is_system_generated,false)=false
    and not (id=any(v_keep));

  return jsonb_build_object('movement_group_id',p_group_id,'movement_serial',v_serial,'expense_ids',v_ids);
end; $$;
grant execute on function public.sea_vibe_update_expense_batch(uuid,text,uuid,uuid,jsonb) to authenticated;

create or replace function public.sea_vibe_delete_expense_batch(p_group_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_trip uuid; v_status text;
begin
  if not public.has_screen_permission('seaVibeExpenseNew','delete') then raise exception 'permission_denied'; end if;
  select trip_id into v_trip from public.sea_vibe_expenses where movement_group_id=p_group_id and coalesce(is_system_generated,false)=false order by created_at,id limit 1;
  if not exists(select 1 from public.sea_vibe_expenses where movement_group_id=p_group_id and coalesce(is_system_generated,false)=false) then
    raise exception 'EXPENSE_MOVEMENT_NOT_FOUND';
  end if;
  if v_trip is not null then
    select status into v_status from public.sea_vibe_trips where id=v_trip for update;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
  end if;
  delete from public.sea_vibe_expenses where movement_group_id=p_group_id and coalesce(is_system_generated,false)=false;
  return p_group_id;
end; $$;
grant execute on function public.sea_vibe_delete_expense_batch(uuid) to authenticated;

create or replace view public.sea_vibe_treasury_movements with (security_invoker=true) as
select 'trip_revenue:'||t.id::text as movement_id,
       t.treasury_movement_serial as movement_serial,
       t.trip_date::timestamptz as movement_at,
       'trip_revenue'::text as movement_type,
       t.total_value::numeric(14,2) as amount,
       t.trip_serial as reference,
       coalesce(t.notes,'') as description,
       t.id as trip_id,
       null::uuid as asset_id,
       'trip'::text as source_kind,
       t.id as source_id,
       null::uuid as expense_group_id
from public.sea_vibe_trips t
union all
select 'expense:'||e.id::text,
       e.movement_serial,
       e.expense_date::timestamptz,
       case when e.expense_scope='asset' then 'asset_expense' else 'expense' end,
       (-e.amount)::numeric(14,2),
       coalesce(t.trip_serial,a.asset_code,''),
       coalesce(c.name_ar,'')||case when e.notes is null then '' else ' — '||e.notes end,
       e.trip_id,e.asset_id,
       'expense'::text,
       e.movement_group_id,
       e.movement_group_id
from public.sea_vibe_expenses e
left join public.sea_vibe_trips t on t.id=e.trip_id
left join public.sea_vibe_assets a on a.id=e.asset_id
left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
where coalesce(e.system_key,'')<>'sailing_permit'
union all
select 'zawel_topup:'||z.id::text,
       z.treasury_movement_serial,
       z.transaction_date::timestamptz + (z.created_at::time),
       'zawel_topup',
       (-z.cash_amount)::numeric(14,2),
       coalesce(z.reference,''),
       'شحن رصيد زاول',
       null::uuid,null::uuid,
       'zawel_topup'::text,
       z.id,
       null::uuid
from public.sea_vibe_zawel_transactions z
where z.transaction_type='topup';

grant select on public.sea_vibe_treasury_movements to authenticated;

commit;
