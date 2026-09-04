-- P5.13.8.72 R44R10 — SEA VIBE commission employee refresh + safe rule delete
-- Scope:
--   * Persist irreversible commission-rule usage so a rule can never be deleted after being used by a trip.
--   * Add a fail-closed server-side delete RPC for never-used rules only.
--   * Keep the canonical R44R7 seed function name while recording usage for future trips.
-- No global payroll, pruning, sync engine, or unrelated SEA VIBE financial contract is changed.

begin;

create table if not exists public.sea_vibe_commission_rule_usage_r44r10 (
  id uuid primary key default gen_random_uuid(),
  commission_rule_id uuid not null references public.sea_vibe_commission_rules(id) on delete restrict,
  trip_id uuid not null,
  first_used_at timestamptz not null default now(),
  constraint sea_vibe_commission_rule_usage_r44r10_uq unique(commission_rule_id,trip_id)
);

create index if not exists idx_sea_vibe_commission_rule_usage_r44r10_rule
  on public.sea_vibe_commission_rule_usage_r44r10(commission_rule_id,first_used_at);

-- Backfill every currently provable historical use. The usage ledger is deliberately
-- independent from the generated expense row so a later trip-type adjustment cannot
-- make an already-used commission definition deletable again.
insert into public.sea_vibe_commission_rule_usage_r44r10(commission_rule_id,trip_id,first_used_at)
select e.commission_rule_id,e.trip_id,min(coalesce(e.created_at,now()))
from public.sea_vibe_expenses e
where e.commission_rule_id is not null
  and e.trip_id is not null
  and e.is_system_generated=true
  and e.system_key like 'commission:%'
group by e.commission_rule_id,e.trip_id
on conflict(commission_rule_id,trip_id) do nothing;

insert into public.sea_vibe_commission_rule_usage_r44r10(commission_rule_id,trip_id,first_used_at)
select ci.commission_rule_id,ci.trip_id,min(coalesce(ci.created_at,now()))
from public.sea_vibe_payroll_salary_commission_items ci
where ci.commission_rule_id is not null
  and ci.trip_id is not null
group by ci.commission_rule_id,ci.trip_id
on conflict(commission_rule_id,trip_id) do nothing;

alter table public.sea_vibe_commission_rule_usage_r44r10 enable row level security;
drop policy if exists "sea vibe commission usage read r44r10" on public.sea_vibe_commission_rule_usage_r44r10;
create policy "sea vibe commission usage read r44r10"
on public.sea_vibe_commission_rule_usage_r44r10
for select to authenticated
using(public.sea_vibe_can_view());

revoke insert,update,delete on public.sea_vibe_commission_rule_usage_r44r10 from authenticated;
grant select on public.sea_vibe_commission_rule_usage_r44r10 to authenticated;

-- Preserve all existing view columns in their existing order and append the usage flag.
create or replace view public.sea_vibe_commission_rules_view
with (security_invoker=true) as
select
  r.id,r.name_ar,r.name_en,r.beneficiary_type,r.employee_id,r.broker_name,r.beneficiary_name,
  r.calculation_type,r.calculation_value,r.is_active,r.created_at,r.updated_at,
  coalesce(array_agg(l.trip_type_id order by l.trip_type_id) filter(where l.trip_type_id is not null),'{}'::uuid[]) as trip_type_ids,
  exists(
    select 1
    from public.sea_vibe_commission_rule_usage_r44r10 u
    where u.commission_rule_id=r.id
  ) as has_been_used
from public.sea_vibe_commission_rules r
left join public.sea_vibe_commission_rule_trip_types l on l.commission_rule_id=r.id
group by r.id;

grant select on public.sea_vibe_commission_rules_view to authenticated;

-- Keep the latest R44R9 canonical seed contract and add only immutable usage capture.
create or replace function public.sea_vibe_seed_trip_commissions_r44r7(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.sea_vibe_trips%rowtype;
  v_catalog uuid;
  v_rule record;
  v_amount numeric(14,2);
begin
  select * into v_trip from public.sea_vibe_trips where id=p_trip_id;
  if not found then return; end if;

  select id into v_catalog
  from public.sea_vibe_expense_catalog
  where system_key='automatic_commission'
  limit 1;
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
      commission_calculation_type_snapshot,commission_calculation_value_snapshot,commission_trip_value_snapshot,
      commission_employee_id_snapshot
    ) values(
      'trip',v_trip.id,v_catalog,v_trip.trip_date,v_amount,null,
      'المستفيد: '||v_rule.beneficiary_name,
      true,'commission:'||v_rule.id::text,coalesce(v_trip.created_by,auth.uid()),auth.uid(),
      v_rule.id,v_rule.name_ar,v_rule.name_en,v_rule.beneficiary_type,v_rule.beneficiary_name,
      v_rule.calculation_type,v_rule.calculation_value,v_trip.total_value,
      case when v_rule.beneficiary_type='employee' then v_rule.employee_id else null end
    )
    on conflict(trip_id,system_key) where trip_id is not null and system_key is not null do nothing;

    insert into public.sea_vibe_commission_rule_usage_r44r10(commission_rule_id,trip_id,first_used_at)
    values(v_rule.id,v_trip.id,now())
    on conflict(commission_rule_id,trip_id) do nothing;
  end loop;
end;
$$;
revoke all on function public.sea_vibe_seed_trip_commissions_r44r7(uuid) from public,anon,authenticated;

create or replace function public.sea_vibe_delete_commission_rule_r44r10(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.sea_vibe_commission_rules%rowtype;
  v_usage_count integer:=0;
begin
  if not public.has_screen_permission('seaVibeReference','delete') then
    raise exception 'SEA_VIBE_REFERENCE_DELETE_PERMISSION_REQUIRED';
  end if;
  if p_id is null then raise exception 'SEA_VIBE_COMMISSION_RULE_REQUIRED'; end if;

  select * into v_rule
  from public.sea_vibe_commission_rules
  where id=p_id
  for update;
  if not found then raise exception 'SEA_VIBE_COMMISSION_RULE_NOT_FOUND'; end if;

  select count(*) into v_usage_count
  from public.sea_vibe_commission_rule_usage_r44r10 u
  where u.commission_rule_id=p_id;

  if v_usage_count>0
     or exists(
       select 1 from public.sea_vibe_expenses e
       where e.commission_rule_id=p_id
          or (e.is_system_generated=true and e.system_key=('commission:'||p_id::text))
     )
     or exists(
       select 1 from public.sea_vibe_payroll_salary_commission_items ci
       where ci.commission_rule_id=p_id
     ) then
    raise exception 'SEA_VIBE_COMMISSION_RULE_USED_DELETE_BLOCKED';
  end if;

  delete from public.sea_vibe_commission_rules where id=p_id;

  return jsonb_build_object('ok',true,'deletedId',p_id,'used',false);
end;
$$;
revoke all on function public.sea_vibe_delete_commission_rule_r44r10(uuid) from public,anon;
grant execute on function public.sea_vibe_delete_commission_rule_r44r10(uuid) to authenticated;

comment on table public.sea_vibe_commission_rule_usage_r44r10 is
'R44R10 immutable SEA VIBE commission-rule usage ledger. Once a rule has been used by a trip it remains non-deletable even if generated expenses later change.';
comment on function public.sea_vibe_delete_commission_rule_r44r10(uuid) is
'R44R10 fail-closed delete: only never-used SEA VIBE commission rules can be deleted; used rules must be disabled instead.';

commit;
