begin;

-- R44R11 — SEA VIBE commission historical backfill.
-- Purpose:
--   * Keep the existing R44R7 automatic trigger as the canonical owner for NEW trips.
--   * Add an explicit, idempotent, audited server-side action to apply ONE selected
--     commission rule to already-existing matching trips.
-- Safety:
--   * No rule is selected by name or hard-coded production id.
--   * Existing commission expenses are never duplicated or rewritten.
--   * Historical backfill is super_admin-only because it changes closed-trip financial history.
--   * Employee-beneficiary backfill fails closed if an existing SEA VIBE salary statement
--     covers any missing source trip, preventing silent payroll snapshot divergence.

create table if not exists public.sea_vibe_commission_backfill_runs_r44r11 (
  id uuid primary key default gen_random_uuid(),
  commission_rule_id uuid not null references public.sea_vibe_commission_rules(id) on delete restrict,
  eligible_trip_count integer not null default 0 check(eligible_trip_count >= 0),
  already_applied_count integer not null default 0 check(already_applied_count >= 0),
  inserted_trip_count integer not null default 0 check(inserted_trip_count >= 0),
  total_inserted_amount numeric(14,2) not null default 0,
  rule_snapshot jsonb not null default '{}'::jsonb,
  executed_by uuid references auth.users(id) on delete set null default auth.uid(),
  executed_at timestamptz not null default now()
);

create index if not exists idx_sea_vibe_commission_backfill_runs_r44r11_rule
  on public.sea_vibe_commission_backfill_runs_r44r11(commission_rule_id,executed_at desc);

alter table public.sea_vibe_commission_backfill_runs_r44r11 enable row level security;
drop policy if exists "sea vibe commission backfill read r44r11" on public.sea_vibe_commission_backfill_runs_r44r11;
create policy "sea vibe commission backfill read r44r11"
on public.sea_vibe_commission_backfill_runs_r44r11
for select to authenticated
using(public.has_screen_permission('seaVibeReference','view'));

revoke insert,update,delete on public.sea_vibe_commission_backfill_runs_r44r11 from authenticated;
grant select on public.sea_vibe_commission_backfill_runs_r44r11 to authenticated;

create or replace function public.preview_sea_vibe_commission_rule_backfill_r44r11(p_rule_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.sea_vibe_commission_rules%rowtype;
  v_eligible integer:=0;
  v_existing integer:=0;
  v_missing integer:=0;
  v_open integer:=0;
  v_closed integer:=0;
  v_total numeric(14,2):=0;
  v_payroll_conflicts integer:=0;
begin
  if not public.has_screen_permission('seaVibeReference','view') then
    raise exception 'SEA_VIBE_COMMISSION_BACKFILL_VIEW_PERMISSION_REQUIRED';
  end if;

  select * into v_rule
  from public.sea_vibe_commission_rules
  where id=p_rule_id;
  if not found then raise exception 'SEA_VIBE_COMMISSION_RULE_NOT_FOUND'; end if;

  select
    count(*)::integer,
    count(*) filter(where e.id is not null)::integer,
    count(*) filter(where e.id is null)::integer,
    count(*) filter(where e.id is null and t.status='open')::integer,
    count(*) filter(where e.id is null and t.status='closed')::integer,
    coalesce(sum(
      case when e.id is null then
        case when v_rule.calculation_type='percentage'
          then round((t.total_value*v_rule.calculation_value/100.0)::numeric,2)
          else round(v_rule.calculation_value::numeric,2)
        end
      else 0 end
    ),0)::numeric(14,2)
  into v_eligible,v_existing,v_missing,v_open,v_closed,v_total
  from public.sea_vibe_trips t
  left join public.sea_vibe_expenses e
    on e.trip_id=t.id
   and e.is_system_generated=true
   and e.system_key=('commission:'||v_rule.id::text)
  where exists(
    select 1
    from public.sea_vibe_commission_rule_trip_types l
    where l.commission_rule_id=v_rule.id
      and l.trip_type_id=t.trip_type_id
  );

  if v_rule.beneficiary_type='employee' and v_rule.employee_id is not null then
    select count(distinct s.id)::integer into v_payroll_conflicts
    from public.sea_vibe_payroll_salary_statements s
    where s.employee_id=v_rule.employee_id
      and exists(
        select 1
        from public.sea_vibe_trips t
        where t.trip_date between s.commission_period_from and s.commission_period_to
          and exists(
            select 1 from public.sea_vibe_commission_rule_trip_types l
            where l.commission_rule_id=v_rule.id and l.trip_type_id=t.trip_type_id
          )
          and not exists(
            select 1 from public.sea_vibe_expenses e
            where e.trip_id=t.id
              and e.is_system_generated=true
              and e.system_key=('commission:'||v_rule.id::text)
          )
      );
  end if;

  return jsonb_build_object(
    'phase','R44R11',
    'ruleId',v_rule.id,
    'ruleName',v_rule.name_ar,
    'beneficiaryType',v_rule.beneficiary_type,
    'beneficiaryName',v_rule.beneficiary_name,
    'calculationType',v_rule.calculation_type,
    'calculationValue',v_rule.calculation_value,
    'active',v_rule.is_active,
    'eligibleTripCount',v_eligible,
    'alreadyAppliedCount',v_existing,
    'missingTripCount',v_missing,
    'missingOpenTripCount',v_open,
    'missingClosedTripCount',v_closed,
    'totalBackfillAmount',v_total,
    'payrollStatementConflictCount',v_payroll_conflicts,
    'newTripsAutomatic',true
  );
end;
$$;

revoke all on function public.preview_sea_vibe_commission_rule_backfill_r44r11(uuid) from public,anon;
grant execute on function public.preview_sea_vibe_commission_rule_backfill_r44r11(uuid) to authenticated,service_role;

create or replace function public.sea_vibe_backfill_commission_rule_r44r11(p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.sea_vibe_commission_rules%rowtype;
  v_catalog uuid;
  v_preview jsonb;
  v_run_id uuid;
  v_inserted integer:=0;
  v_total numeric(14,2):=0;
  v_eligible integer:=0;
  v_existing integer:=0;
begin
  if public.current_user_role() is distinct from 'super_admin'::public.app_role then
    raise exception 'SEA_VIBE_COMMISSION_BACKFILL_SUPER_ADMIN_REQUIRED';
  end if;
  if not public.has_screen_permission('seaVibeReference','edit') then
    raise exception 'SEA_VIBE_COMMISSION_BACKFILL_EDIT_PERMISSION_REQUIRED';
  end if;

  select * into v_rule
  from public.sea_vibe_commission_rules
  where id=p_rule_id
  for update;
  if not found then raise exception 'SEA_VIBE_COMMISSION_RULE_NOT_FOUND'; end if;
  if v_rule.is_active is not true then
    raise exception 'SEA_VIBE_COMMISSION_BACKFILL_ACTIVE_RULE_REQUIRED';
  end if;

  v_preview:=public.preview_sea_vibe_commission_rule_backfill_r44r11(p_rule_id);
  v_eligible:=coalesce((v_preview->>'eligibleTripCount')::integer,0);
  v_existing:=coalesce((v_preview->>'alreadyAppliedCount')::integer,0);

  if coalesce((v_preview->>'payrollStatementConflictCount')::integer,0)>0 then
    raise exception 'SEA_VIBE_COMMISSION_BACKFILL_PAYROLL_STATEMENT_CONFLICT';
  end if;

  select id into v_catalog
  from public.sea_vibe_expense_catalog
  where system_key='automatic_commission'
  limit 1;
  if v_catalog is null then raise exception 'SEA_VIBE_COMMISSION_EXPENSE_CATALOG_MISSING'; end if;

  with inserted as (
    insert into public.sea_vibe_expenses(
      expense_scope,trip_id,expense_catalog_id,expense_date,amount,payment_method_id,notes,
      is_system_generated,system_key,created_by,updated_by,
      commission_rule_id,commission_name_ar_snapshot,commission_name_en_snapshot,
      commission_beneficiary_type_snapshot,commission_beneficiary_name_snapshot,
      commission_calculation_type_snapshot,commission_calculation_value_snapshot,commission_trip_value_snapshot,
      commission_employee_id_snapshot
    )
    select
      'trip',t.id,v_catalog,t.trip_date,
      case when v_rule.calculation_type='percentage'
        then round((t.total_value*v_rule.calculation_value/100.0)::numeric,2)
        else round(v_rule.calculation_value::numeric,2)
      end,
      null,
      'Historical commission backfill R44R11 — المستفيد: '||v_rule.beneficiary_name,
      true,'commission:'||v_rule.id::text,coalesce(t.created_by,auth.uid()),auth.uid(),
      v_rule.id,v_rule.name_ar,v_rule.name_en,v_rule.beneficiary_type,v_rule.beneficiary_name,
      v_rule.calculation_type,v_rule.calculation_value,t.total_value,
      case when v_rule.beneficiary_type='employee' then v_rule.employee_id else null end
    from public.sea_vibe_trips t
    where exists(
      select 1
      from public.sea_vibe_commission_rule_trip_types l
      where l.commission_rule_id=v_rule.id
        and l.trip_type_id=t.trip_type_id
    )
      and not exists(
        select 1
        from public.sea_vibe_expenses e
        where e.trip_id=t.id
          and e.is_system_generated=true
          and e.system_key=('commission:'||v_rule.id::text)
      )
    on conflict(trip_id,system_key) where trip_id is not null and system_key is not null do nothing
    returning trip_id,amount
  )
  select count(*)::integer,coalesce(sum(amount),0)::numeric(14,2)
  into v_inserted,v_total
  from inserted;

  insert into public.sea_vibe_commission_rule_usage_r44r10(commission_rule_id,trip_id,first_used_at)
  select v_rule.id,e.trip_id,coalesce(e.created_at,now())
  from public.sea_vibe_expenses e
  where e.commission_rule_id=v_rule.id
    and e.trip_id is not null
    and e.is_system_generated=true
    and e.system_key=('commission:'||v_rule.id::text)
  on conflict(commission_rule_id,trip_id) do nothing;

  insert into public.sea_vibe_commission_backfill_runs_r44r11(
    commission_rule_id,eligible_trip_count,already_applied_count,inserted_trip_count,
    total_inserted_amount,rule_snapshot,executed_by
  ) values(
    v_rule.id,v_eligible,v_existing,v_inserted,v_total,
    jsonb_build_object(
      'nameAr',v_rule.name_ar,
      'nameEn',v_rule.name_en,
      'beneficiaryType',v_rule.beneficiary_type,
      'beneficiaryName',v_rule.beneficiary_name,
      'employeeId',v_rule.employee_id,
      'calculationType',v_rule.calculation_type,
      'calculationValue',v_rule.calculation_value,
      'tripTypeIds',coalesce((
        select jsonb_agg(l.trip_type_id order by l.trip_type_id)
        from public.sea_vibe_commission_rule_trip_types l
        where l.commission_rule_id=v_rule.id
      ),'[]'::jsonb)
    ),
    auth.uid()
  ) returning id into v_run_id;

  return jsonb_build_object(
    'ok',true,
    'phase','R44R11',
    'runId',v_run_id,
    'ruleId',v_rule.id,
    'ruleName',v_rule.name_ar,
    'eligibleTripCount',v_eligible,
    'alreadyAppliedCount',v_existing,
    'insertedTripCount',v_inserted,
    'totalInsertedAmount',v_total,
    'newTripsAutomatic',true
  );
end;
$$;

revoke all on function public.sea_vibe_backfill_commission_rule_r44r11(uuid) from public,anon;
grant execute on function public.sea_vibe_backfill_commission_rule_r44r11(uuid) to authenticated,service_role;

comment on function public.sea_vibe_backfill_commission_rule_r44r11(uuid) is
'R44R11 explicit idempotent historical backfill for one selected SEA VIBE commission rule. New trips remain owned by trg_sea_vibe_trip_commissions_r44r7.';

commit;
