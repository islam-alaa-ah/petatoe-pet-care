-- PETATOE P5.13.8.72R44R7 — SEA VIBE trip commissions
-- Scope:
--   * Reference-defined commission rules linked to one or many trip types.
--   * Beneficiary is either a payroll employee or a named broker.
--   * Percentage commissions follow later trip-value edits using the saved percentage snapshot.
--   * Fixed commissions remain fixed after trip creation.
--   * Existing manual "عمولة كابتن الرحلة" expense remains untouched and available for extra manual commission costs.
-- No pruning / retention / shared sync-engine changes.
begin;

create table if not exists public.sea_vibe_commission_rules (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check(nullif(btrim(name_ar),'') is not null),
  name_en text not null default '' check(name_en is not null),
  beneficiary_type text not null check(beneficiary_type in ('employee','broker')),
  employee_id uuid references public.payroll_employees(id) on delete restrict,
  broker_name text,
  beneficiary_name text not null check(nullif(btrim(beneficiary_name),'') is not null),
  calculation_type text not null check(calculation_type in ('percentage','fixed')),
  calculation_value numeric(14,4) not null check(calculation_value>=0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sea_vibe_commission_beneficiary_ck check(
    (beneficiary_type='employee' and employee_id is not null and broker_name is null)
    or (beneficiary_type='broker' and employee_id is null and nullif(btrim(broker_name),'') is not null)
  ),
  constraint sea_vibe_commission_percentage_ck check(
    calculation_type<>'percentage' or calculation_value<=100
  )
);

create table if not exists public.sea_vibe_commission_rule_trip_types (
  commission_rule_id uuid not null references public.sea_vibe_commission_rules(id) on delete cascade,
  trip_type_id uuid not null references public.sea_vibe_trip_types(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(commission_rule_id,trip_type_id)
);
create index if not exists idx_sea_vibe_commission_rule_trip_type
  on public.sea_vibe_commission_rule_trip_types(trip_type_id,commission_rule_id);
create index if not exists idx_sea_vibe_commission_rules_active
  on public.sea_vibe_commission_rules(is_active,name_ar);

alter table public.sea_vibe_expenses
  add column if not exists commission_rule_id uuid references public.sea_vibe_commission_rules(id) on delete set null,
  add column if not exists commission_name_ar_snapshot text,
  add column if not exists commission_name_en_snapshot text,
  add column if not exists commission_beneficiary_type_snapshot text,
  add column if not exists commission_beneficiary_name_snapshot text,
  add column if not exists commission_calculation_type_snapshot text,
  add column if not exists commission_calculation_value_snapshot numeric(14,4),
  add column if not exists commission_trip_value_snapshot numeric(14,2);

insert into public.sea_vibe_expense_catalog(name_ar,name_en,system_key,is_system,is_active)
values('عمولات','Commissions','automatic_commission',true,true)
on conflict(system_key) do update set
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  is_system=true,
  is_active=true,
  updated_at=now();

create or replace function public.sea_vibe_touch_commission_rule_r44r7()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at:=now();
  new.updated_by:=auth.uid();
  return new;
end;
$$;
drop trigger if exists trg_sea_vibe_commission_rule_touch_r44r7 on public.sea_vibe_commission_rules;
create trigger trg_sea_vibe_commission_rule_touch_r44r7
before update on public.sea_vibe_commission_rules
for each row execute function public.sea_vibe_touch_commission_rule_r44r7();

create or replace view public.sea_vibe_commission_rules_view
with (security_invoker=true) as
select
  r.id,r.name_ar,r.name_en,r.beneficiary_type,r.employee_id,r.broker_name,r.beneficiary_name,
  r.calculation_type,r.calculation_value,r.is_active,r.created_at,r.updated_at,
  coalesce(array_agg(l.trip_type_id order by l.trip_type_id) filter(where l.trip_type_id is not null),'{}'::uuid[]) as trip_type_ids
from public.sea_vibe_commission_rules r
left join public.sea_vibe_commission_rule_trip_types l on l.commission_rule_id=r.id
group by r.id;

create or replace function public.sea_vibe_commission_employee_options_r44r7()
returns table(id uuid,full_name text)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.has_screen_permission('seaVibeReference','view') then
    raise exception 'SEA_VIBE_REFERENCE_VIEW_PERMISSION_REQUIRED';
  end if;
  return query
    select e.id,e.full_name
    from public.payroll_employees e
    where e.is_active=true
    order by e.full_name;
end;
$$;
revoke all on function public.sea_vibe_commission_employee_options_r44r7() from public,anon;
grant execute on function public.sea_vibe_commission_employee_options_r44r7() to authenticated;

create or replace function public.sea_vibe_save_commission_rule_r44r7(
  p_id uuid,
  p_name_ar text,
  p_name_en text,
  p_beneficiary_type text,
  p_employee_id uuid,
  p_broker_name text,
  p_calculation_type text,
  p_calculation_value numeric,
  p_trip_type_ids uuid[],
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=p_id;
  v_name_ar text:=btrim(coalesce(p_name_ar,''));
  v_name_en text:=btrim(coalesce(p_name_en,''));
  v_beneficiary_type text:=lower(btrim(coalesce(p_beneficiary_type,'')));
  v_calculation_type text:=lower(btrim(coalesce(p_calculation_type,'')));
  v_beneficiary_name text;
  v_broker_name text:=nullif(btrim(coalesce(p_broker_name,'')),'');
  v_trip_type_ids uuid[]:=coalesce(p_trip_type_ids,'{}'::uuid[]);
  v_distinct_count integer;
begin
  if v_id is null then
    if not public.has_screen_permission('seaVibeReference','add') then raise exception 'SEA_VIBE_REFERENCE_ADD_PERMISSION_REQUIRED'; end if;
  else
    if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'SEA_VIBE_REFERENCE_EDIT_PERMISSION_REQUIRED'; end if;
    if not exists(select 1 from public.sea_vibe_commission_rules where id=v_id) then raise exception 'SEA_VIBE_COMMISSION_RULE_NOT_FOUND'; end if;
  end if;
  if v_name_ar='' then raise exception 'SEA_VIBE_COMMISSION_NAME_REQUIRED'; end if;
  if v_beneficiary_type not in ('employee','broker') then raise exception 'SEA_VIBE_COMMISSION_BENEFICIARY_TYPE_INVALID'; end if;
  if v_calculation_type not in ('percentage','fixed') then raise exception 'SEA_VIBE_COMMISSION_CALCULATION_TYPE_INVALID'; end if;
  if coalesce(p_calculation_value,-1)<0 then raise exception 'SEA_VIBE_COMMISSION_VALUE_INVALID'; end if;
  if v_calculation_type='percentage' and p_calculation_value>100 then raise exception 'SEA_VIBE_COMMISSION_PERCENTAGE_INVALID'; end if;

  select count(distinct trip_type_id) into v_distinct_count
  from unnest(v_trip_type_ids) as u(trip_type_id);
  if coalesce(v_distinct_count,0)=0 then raise exception 'SEA_VIBE_COMMISSION_TRIP_TYPE_REQUIRED'; end if;
  if exists(
    select 1 from unnest(v_trip_type_ids) as u(trip_type_id)
    left join public.sea_vibe_trip_types t on t.id=u.trip_type_id
    where t.id is null
  ) then raise exception 'SEA_VIBE_COMMISSION_TRIP_TYPE_INVALID'; end if;

  if v_beneficiary_type='employee' then
    if p_employee_id is null then raise exception 'SEA_VIBE_COMMISSION_EMPLOYEE_REQUIRED'; end if;
    select full_name into v_beneficiary_name from public.payroll_employees where id=p_employee_id;
    if v_beneficiary_name is null then raise exception 'SEA_VIBE_COMMISSION_EMPLOYEE_INVALID'; end if;
    v_broker_name:=null;
  else
    if v_broker_name is null then raise exception 'SEA_VIBE_COMMISSION_BROKER_REQUIRED'; end if;
    v_beneficiary_name:=v_broker_name;
  end if;

  if v_id is null then
    insert into public.sea_vibe_commission_rules(
      name_ar,name_en,beneficiary_type,employee_id,broker_name,beneficiary_name,
      calculation_type,calculation_value,is_active,created_by,updated_by
    ) values(
      v_name_ar,v_name_en,v_beneficiary_type,case when v_beneficiary_type='employee' then p_employee_id else null end,
      v_broker_name,v_beneficiary_name,v_calculation_type,round(p_calculation_value::numeric,4),coalesce(p_is_active,true),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.sea_vibe_commission_rules set
      name_ar=v_name_ar,
      name_en=v_name_en,
      beneficiary_type=v_beneficiary_type,
      employee_id=case when v_beneficiary_type='employee' then p_employee_id else null end,
      broker_name=v_broker_name,
      beneficiary_name=v_beneficiary_name,
      calculation_type=v_calculation_type,
      calculation_value=round(p_calculation_value::numeric,4),
      is_active=coalesce(p_is_active,true),
      updated_by=auth.uid(),updated_at=now()
    where id=v_id;
    delete from public.sea_vibe_commission_rule_trip_types where commission_rule_id=v_id;
  end if;

  insert into public.sea_vibe_commission_rule_trip_types(commission_rule_id,trip_type_id)
  select v_id,trip_type_id
  from (select distinct trip_type_id from unnest(v_trip_type_ids) as u(trip_type_id)) q;
  return v_id;
end;
$$;
revoke all on function public.sea_vibe_save_commission_rule_r44r7(uuid,text,text,text,uuid,text,text,numeric,uuid[],boolean) from public,anon;
grant execute on function public.sea_vibe_save_commission_rule_r44r7(uuid,text,text,text,uuid,text,text,numeric,uuid[],boolean) to authenticated;

create or replace function public.sea_vibe_seed_trip_commissions_r44r7(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_trip public.sea_vibe_trips%rowtype;
  v_catalog uuid;
  v_rule record;
  v_amount numeric(14,2);
begin
  select * into v_trip from public.sea_vibe_trips where id=p_trip_id;
  if not found then return; end if;
  select id into v_catalog from public.sea_vibe_expense_catalog where system_key='automatic_commission' limit 1;
  if v_catalog is null then raise exception 'SEA_VIBE_COMMISSION_EXPENSE_CATALOG_MISSING'; end if;

  for v_rule in
    select r.*
    from public.sea_vibe_commission_rules r
    join public.sea_vibe_commission_rule_trip_types l on l.commission_rule_id=r.id
    where r.is_active=true and l.trip_type_id=v_trip.trip_type_id
    order by r.created_at,r.id
  loop
    v_amount:=case when v_rule.calculation_type='percentage'
      then round((v_trip.total_value*v_rule.calculation_value/100.0)::numeric,2)
      else round(v_rule.calculation_value::numeric,2) end;

    insert into public.sea_vibe_expenses(
      expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
      is_system_generated,system_key,created_by,updated_by,
      commission_rule_id,commission_name_ar_snapshot,commission_name_en_snapshot,
      commission_beneficiary_type_snapshot,commission_beneficiary_name_snapshot,
      commission_calculation_type_snapshot,commission_calculation_value_snapshot,commission_trip_value_snapshot
    ) values(
      'trip',v_trip.id,v_catalog,v_trip.trip_date,v_amount,null,
      'المستفيد: '||v_rule.beneficiary_name,
      true,'commission:'||v_rule.id::text,coalesce(v_trip.created_by,auth.uid()),auth.uid(),
      v_rule.id,v_rule.name_ar,v_rule.name_en,v_rule.beneficiary_type,v_rule.beneficiary_name,
      v_rule.calculation_type,v_rule.calculation_value,v_trip.total_value
    )
    on conflict(trip_id,system_key) where trip_id is not null and system_key is not null do nothing;
  end loop;
end;
$$;
revoke all on function public.sea_vibe_seed_trip_commissions_r44r7(uuid) from public,anon,authenticated;

create or replace function public.sea_vibe_sync_trip_commissions_r44r7()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    perform public.sea_vibe_seed_trip_commissions_r44r7(new.id);
    return new;
  end if;

  if new.trip_type_id is distinct from old.trip_type_id then
    delete from public.sea_vibe_expenses
    where trip_id=new.id and is_system_generated=true and system_key like 'commission:%';
    perform public.sea_vibe_seed_trip_commissions_r44r7(new.id);
    return new;
  end if;

  if new.trip_date is distinct from old.trip_date then
    update public.sea_vibe_expenses set expense_date=new.trip_date,updated_by=auth.uid(),updated_at=now()
    where trip_id=new.id and is_system_generated=true and system_key like 'commission:%';
  end if;

  if new.total_value is distinct from old.total_value then
    update public.sea_vibe_expenses
    set amount=round((new.total_value*commission_calculation_value_snapshot/100.0)::numeric,2),
        commission_trip_value_snapshot=new.total_value,
        updated_by=auth.uid(),updated_at=now()
    where trip_id=new.id and is_system_generated=true and system_key like 'commission:%'
      and commission_calculation_type_snapshot='percentage';
  end if;
  return new;
end;
$$;
revoke all on function public.sea_vibe_sync_trip_commissions_r44r7() from public,anon,authenticated;
drop trigger if exists trg_sea_vibe_trip_commissions_r44r7 on public.sea_vibe_trips;
create trigger trg_sea_vibe_trip_commissions_r44r7
after insert or update of trip_date,trip_type_id,total_value on public.sea_vibe_trips
for each row execute function public.sea_vibe_sync_trip_commissions_r44r7();

alter table public.sea_vibe_commission_rules enable row level security;
alter table public.sea_vibe_commission_rule_trip_types enable row level security;

drop policy if exists "sea vibe commission rules read" on public.sea_vibe_commission_rules;
create policy "sea vibe commission rules read" on public.sea_vibe_commission_rules
for select to authenticated using(public.sea_vibe_can_view());
drop policy if exists "sea vibe commission links read" on public.sea_vibe_commission_rule_trip_types;
create policy "sea vibe commission links read" on public.sea_vibe_commission_rule_trip_types
for select to authenticated using(public.sea_vibe_can_view());

revoke insert,update,delete on public.sea_vibe_commission_rules from authenticated;
revoke insert,update,delete on public.sea_vibe_commission_rule_trip_types from authenticated;
grant select on public.sea_vibe_commission_rules to authenticated;
grant select on public.sea_vibe_commission_rule_trip_types to authenticated;
grant select on public.sea_vibe_commission_rules_view to authenticated;

comment on table public.sea_vibe_commission_rules is
'R44R7 SEA VIBE commission definitions. Each rule targets one or more trip types and snapshots beneficiary/calculation details into generated trip expenses.';
comment on column public.sea_vibe_expenses.commission_calculation_value_snapshot is
'Percentage rate or fixed SAR value snapshotted when the automatic commission expense is created.';

commit;
