-- PETATOE P5.13.8.72 R44R38R15R2 — SEA VIBE Full Operational Ledger Link Recovery
-- Root cause:
--   R15/R15R1 linked posted journals, treasury vouchers, and the debit side of expenses,
--   but SEA VIBE trip revenues had no explicit revenue-account mapping/snapshot and
--   operational counterpart accounts were not represented in the account statement.
-- Scope:
--   1) Add canonical revenue-account mapping to trip types and immutable-at-trip snapshot.
--   2) Add system posting accounts 1103 Zawel Balance and 4201 Other Trip Revenue.
--   3) Backfill historical mappings/snapshots deterministically without rewriting amounts.
--   4) Extend the existing account-statement RPC to a balanced operational ledger:
--      trips, expenses, fuel topups/consumption, Zawel topups/consumption,
--      plus existing posted journals and treasury vouchers.
-- Safety:
--   New migration only. No DELETE/DROP/TRUNCATE. No RLS/permission widening.
--   No Offline/Sync changes. No historical migration edits. No R44 pruning changes.

begin;

-- ---------------------------------------------------------------------------
-- 1) Required system accounts for complete operational counterparts.
-- ---------------------------------------------------------------------------
insert into public.sea_vibe_chart_accounts(
  account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order
)
select '1103','رصيد زاول','Zawel Balance',p.id,1,true,true,true,1103
from public.sea_vibe_chart_accounts p
where p.account_code='11'
on conflict(account_code) do nothing;

insert into public.sea_vibe_chart_accounts(
  account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order
)
select '4201','إيرادات رحلات أخرى','Other Trip Revenue',p.id,4,true,true,true,4201
from public.sea_vibe_chart_accounts p
where p.account_code='42'
on conflict(account_code) do nothing;

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.sea_vibe_chart_accounts a
  left join public.sea_vibe_chart_accounts p on p.id=a.parent_id
  where (a.account_code='1103' and not (p.account_code='11' and a.root_class=1 and a.allow_posting=true and a.is_active=true))
     or (a.account_code='4201' and not (p.account_code='42' and a.root_class=4 and a.allow_posting=true and a.is_active=true));
  if v_bad>0 then raise exception 'R15R2_SYSTEM_ACCOUNT_CONFLICT'; end if;

  select count(*) into v_bad
  from public.sea_vibe_chart_accounts
  where account_code in ('1101','1102','4101','4102','4103')
    and (allow_posting is distinct from true or is_active is distinct from true);
  if v_bad>0 then raise exception 'R15R2_REQUIRED_POSTING_ACCOUNT_INACTIVE'; end if;

  if (select count(*) from public.sea_vibe_chart_accounts where account_code in ('1101','1102','1103','4101','4102','4103','4201'))<>7 then
    raise exception 'R15R2_REQUIRED_ACCOUNT_MISSING';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Explicit revenue mapping + historical trip snapshot.
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_trip_types
  add column if not exists revenue_account_id uuid references public.sea_vibe_chart_accounts(id) on delete restrict;

alter table public.sea_vibe_trips
  add column if not exists revenue_account_id uuid references public.sea_vibe_chart_accounts(id) on delete restrict;

create or replace function public.sea_vibe_default_trip_revenue_account_r44r38r15r2(
  p_name_ar text,
  p_name_en text,
  p_serial_series_key text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_code text;
  v_id uuid;
begin
  v_code:=case
    when lower(coalesce(p_serial_series_key,''))='khawr'
      or coalesce(p_name_ar,'') ilike '%خور%'
      or lower(coalesce(p_name_en,'')) like '%khawr%'
      or lower(coalesce(p_name_en,'')) like '%khor%'
      then '4101'
    when coalesce(p_name_ar,'') ilike '%بياض%'
      or lower(coalesce(p_name_en,'')) like '%bayad%'
      then '4102'
    when coalesce(p_name_ar,'') ilike '%صيد%'
      or lower(coalesce(p_name_en,'')) like '%fishing%'
      then '4103'
    else '4201'
  end;

  select id into v_id
  from public.sea_vibe_chart_accounts
  where account_code=v_code and root_class=4 and allow_posting=true and is_active=true
  limit 1;
  if v_id is null then raise exception 'SEA_VIBE_REVENUE_ACCOUNT_MAPPING_MISSING: %',v_code; end if;
  return v_id;
end;
$$;

alter table public.sea_vibe_trip_types disable trigger user;
update public.sea_vibe_trip_types tt
set revenue_account_id=public.sea_vibe_default_trip_revenue_account_r44r38r15r2(tt.name_ar,tt.name_en,tt.serial_series_key)
where tt.revenue_account_id is null;
alter table public.sea_vibe_trip_types enable trigger user;

alter table public.sea_vibe_trips disable trigger user;
update public.sea_vibe_trips t
set revenue_account_id=tt.revenue_account_id
from public.sea_vibe_trip_types tt
where tt.id=t.trip_type_id
  and t.revenue_account_id is null;
alter table public.sea_vibe_trips enable trigger user;

create or replace function public.sea_vibe_trip_type_revenue_guard_r44r38r15r2()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_root smallint;
  v_posting boolean;
  v_active boolean;
begin
  if new.revenue_account_id is null then
    new.revenue_account_id:=public.sea_vibe_default_trip_revenue_account_r44r38r15r2(new.name_ar,new.name_en,new.serial_series_key);
  end if;
  select root_class,allow_posting,is_active into v_root,v_posting,v_active
  from public.sea_vibe_chart_accounts where id=new.revenue_account_id;
  if v_root is distinct from 4 or v_posting is distinct from true or v_active is distinct from true then
    raise exception 'SEA_VIBE_TRIP_REVENUE_ACCOUNT_INVALID';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists(
    select 1 from pg_trigger
    where tgname='trg_sea_vibe_trip_type_revenue_guard_r44r38r15r2'
      and tgrelid='public.sea_vibe_trip_types'::regclass
      and not tgisinternal
  ) then
    create trigger trg_sea_vibe_trip_type_revenue_guard_r44r38r15r2
    before insert or update of revenue_account_id
    on public.sea_vibe_trip_types
    for each row execute function public.sea_vibe_trip_type_revenue_guard_r44r38r15r2();
  end if;
end $$;

create or replace function public.sea_vibe_trip_revenue_snapshot_r44r38r15r2()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_account uuid;
begin
  if tg_op='INSERT' then
    select revenue_account_id into v_account
    from public.sea_vibe_trip_types
    where id=new.trip_type_id;
    if v_account is null then raise exception 'SEA_VIBE_TRIP_REVENUE_ACCOUNT_MISSING'; end if;
    new.revenue_account_id:=v_account;
  elsif new.trip_type_id is distinct from old.trip_type_id or new.revenue_account_id is null then
    select revenue_account_id into v_account
    from public.sea_vibe_trip_types
    where id=new.trip_type_id;
    if v_account is null then raise exception 'SEA_VIBE_TRIP_REVENUE_ACCOUNT_MISSING'; end if;
    new.revenue_account_id:=v_account;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists(
    select 1 from pg_trigger
    where tgname='trg_sea_vibe_trip_revenue_snapshot_r44r38r15r2'
      and tgrelid='public.sea_vibe_trips'::regclass
      and not tgisinternal
  ) then
    create trigger trg_sea_vibe_trip_revenue_snapshot_r44r38r15r2
    before insert or update of trip_type_id
    on public.sea_vibe_trips
    for each row execute function public.sea_vibe_trip_revenue_snapshot_r44r38r15r2();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Full account statement ledger.
--    Operational sources are represented once as balanced double-entry pairs.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_account_statement_r44r38r15(
  p_account_id uuid,
  p_from_date date,
  p_to_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_account public.sea_vibe_chart_accounts%rowtype;
  v_normal_side text;
  v_treasury_id uuid;
  v_fuel_balance_id uuid;
  v_zawel_balance_id uuid;
  v_opening numeric(18,2):=0;
  v_period_debit numeric(18,2):=0;
  v_period_credit numeric(18,2):=0;
  v_closing numeric(18,2):=0;
  v_rows jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('seaVibeAccountStatement','view') then
    raise exception 'permission_denied';
  end if;
  if p_account_id is null then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_ACCOUNT_REQUIRED'; end if;
  if p_from_date is null or p_to_date is null then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_DATE_REQUIRED'; end if;
  if p_from_date>p_to_date then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_DATE_RANGE_INVALID'; end if;

  select * into v_account from public.sea_vibe_chart_accounts where id=p_account_id;
  if not found then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_ACCOUNT_NOT_FOUND'; end if;
  v_normal_side:=case when v_account.root_class in (1,5) then 'debit' else 'credit' end;

  select id into v_treasury_id from public.sea_vibe_chart_accounts where account_code='1101' limit 1;
  select id into v_fuel_balance_id from public.sea_vibe_chart_accounts where account_code='1102' limit 1;
  select id into v_zawel_balance_id from public.sea_vibe_chart_accounts where account_code='1103' limit 1;
  if v_treasury_id is null or v_fuel_balance_id is null or v_zawel_balance_id is null then
    raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_SYSTEM_ACCOUNT_MISSING';
  end if;

  with recursive account_scope as (
    select a.id from public.sea_vibe_chart_accounts a where a.id=p_account_id
    union all
    select child.id from public.sea_vibe_chart_accounts child join account_scope parent on child.parent_id=parent.id
  ),
  ledger as (
    -- A) Posted manual journals.
    select j.journal_date movement_date,coalesce(j.posted_at,j.created_at) sort_at,'journal'::text source_kind,j.id source_id,
      j.journal_no document_no,''::text reference,coalesce(nullif(l.description,''),nullif(j.description,''),'') description,
      l.account_id,l.line_no::integer line_no,l.debit::numeric(18,2) debit,l.credit::numeric(18,2) credit
    from public.sea_vibe_journal_entries j
    join public.sea_vibe_journal_entry_lines l on l.journal_entry_id=j.id
    where j.status='posted' and l.is_active=true and l.account_id in (select id from account_scope)

    union all
    -- B) Treasury vouchers.
    select v.voucher_date,v.created_at,case when v.voucher_type='receipt' then 'receipt_voucher' else 'payment_voucher' end,
      v.id,v.voucher_no,coalesce(v.reference,''),coalesce(v.description,''),e.account_id,e.line_no::integer,
      e.debit_amount::numeric(18,2),e.credit_amount::numeric(18,2)
    from public.sea_vibe_treasury_vouchers v
    join public.sea_vibe_treasury_voucher_entries e on e.voucher_id=v.id
    where e.account_id in (select id from account_scope)

    union all
    -- C1) Operational expense debit side.
    select e.expense_date,e.created_at,'expense'::text,e.id,
      coalesce(nullif(e.movement_serial,''),nullif(t.treasury_movement_serial,''),'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))),
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),''),
      coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف')||case when nullif(btrim(coalesce(e.notes,'')),'') is null then '' else ' — '||btrim(e.notes) end,
      e.account_id,1,e.amount::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where e.amount>0 and e.account_id in (select id from account_scope)

    union all
    -- C2) Operational expense counterpart: Treasury / Fuel Balance / Zawel Balance.
    select e.expense_date,e.created_at,'expense'::text,e.id,
      coalesce(nullif(e.movement_serial,''),nullif(t.treasury_movement_serial,''),'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))),
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),''),
      coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف')||case when nullif(btrim(coalesce(e.notes,'')),'') is null then '' else ' — '||btrim(e.notes) end,
      case when e.system_key='fuel_cost' then v_fuel_balance_id when e.system_key='sailing_permit' then v_zawel_balance_id else v_treasury_id end,
      2,0::numeric(18,2),e.amount::numeric(18,2)
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where e.amount>0
      and (case when e.system_key='fuel_cost' then v_fuel_balance_id when e.system_key='sailing_permit' then v_zawel_balance_id else v_treasury_id end) in (select id from account_scope)

    union all
    -- D1) Trip revenue: Treasury debit.
    select t.trip_date,t.created_at,'trip_revenue'::text,t.id,
      coalesce(nullif(t.treasury_movement_serial,''),t.trip_serial),t.trip_serial,
      coalesce(nullif(tt.name_ar,''),nullif(tt.name_en,''),'إيراد رحلة'),
      v_treasury_id,1,t.total_value::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_trips t
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where t.total_value>0 and v_treasury_id in (select id from account_scope)

    union all
    -- D2) Trip revenue: mapped revenue account credit.
    select t.trip_date,t.created_at,'trip_revenue'::text,t.id,
      coalesce(nullif(t.treasury_movement_serial,''),t.trip_serial),t.trip_serial,
      coalesce(nullif(tt.name_ar,''),nullif(tt.name_en,''),'إيراد رحلة'),
      t.revenue_account_id,2,0::numeric(18,2),t.total_value::numeric(18,2)
    from public.sea_vibe_trips t
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where t.total_value>0 and t.revenue_account_id in (select id from account_scope)

    union all
    -- E1) Fuel topup: Fuel Balance debit.
    select f.transaction_date,f.created_at,'fuel_topup'::text,f.id,
      coalesce(nullif(f.treasury_movement_serial,''),nullif(f.reference,''),'FUEL-'||upper(substr(replace(f.id::text,'-',''),1,10))),
      coalesce(f.reference,''),coalesce(nullif(f.notes,''),'شحن رصيد البنزين'),
      v_fuel_balance_id,1,f.value_delta::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_fuel_transactions f
    where f.transaction_type='topup' and f.value_delta>0 and v_fuel_balance_id in (select id from account_scope)

    union all
    -- E2) Fuel topup: Treasury credit.
    select f.transaction_date,f.created_at,'fuel_topup'::text,f.id,
      coalesce(nullif(f.treasury_movement_serial,''),nullif(f.reference,''),'FUEL-'||upper(substr(replace(f.id::text,'-',''),1,10))),
      coalesce(f.reference,''),coalesce(nullif(f.notes,''),'شحن رصيد البنزين'),
      v_treasury_id,2,0::numeric(18,2),f.value_delta::numeric(18,2)
    from public.sea_vibe_fuel_transactions f
    where f.transaction_type='topup' and f.value_delta>0 and v_treasury_id in (select id from account_scope)

    union all
    -- F1) Zawel topup: Zawel Balance debit.
    select z.transaction_date,z.created_at,'zawel_topup'::text,z.id,
      coalesce(nullif(z.treasury_movement_serial,''),nullif(z.reference,''),'ZAW-'||upper(substr(replace(z.id::text,'-',''),1,10))),
      coalesce(z.reference,''),coalesce(nullif(z.notes,''),'شحن رصيد زاول'),
      v_zawel_balance_id,1,z.cash_amount::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_zawel_transactions z
    where z.transaction_type='topup' and z.cash_amount>0 and v_zawel_balance_id in (select id from account_scope)

    union all
    -- F2) Zawel topup: Treasury credit.
    select z.transaction_date,z.created_at,'zawel_topup'::text,z.id,
      coalesce(nullif(z.treasury_movement_serial,''),nullif(z.reference,''),'ZAW-'||upper(substr(replace(z.id::text,'-',''),1,10))),
      coalesce(z.reference,''),coalesce(nullif(z.notes,''),'شحن رصيد زاول'),
      v_treasury_id,2,0::numeric(18,2),z.cash_amount::numeric(18,2)
    from public.sea_vibe_zawel_transactions z
    where z.transaction_type='topup' and z.cash_amount>0 and v_treasury_id in (select id from account_scope)
  ),
  opening as (
    select coalesce(sum(debit),0)::numeric(18,2) debit,coalesce(sum(credit),0)::numeric(18,2) credit
    from ledger where movement_date<p_from_date
  ),
  period as (
    select l.*,a.account_code line_account_code,a.name_ar line_account_name_ar,a.name_en line_account_name_en
    from ledger l join public.sea_vibe_chart_accounts a on a.id=l.account_id
    where l.movement_date between p_from_date and p_to_date
  ),
  totals as (
    select coalesce(sum(debit),0)::numeric(18,2) debit,coalesce(sum(credit),0)::numeric(18,2) credit from period
  ),
  ordered as (
    select p.*,
      row_number() over(order by p.movement_date,p.sort_at,p.source_kind,p.document_no,p.line_no,p.source_id) row_no,
      sum(case when v_normal_side='debit' then p.debit-p.credit else p.credit-p.debit end)
        over(order by p.movement_date,p.sort_at,p.source_kind,p.document_no,p.line_no,p.source_id rows between unbounded preceding and current row)::numeric(18,2) period_running_delta
    from period p
  )
  select
    case when v_normal_side='debit' then o.debit-o.credit else o.credit-o.debit end,
    t.debit,t.credit,
    case when v_normal_side='debit' then (o.debit-o.credit)+(t.debit-t.credit) else (o.credit-o.debit)+(t.credit-t.debit) end,
    coalesce(jsonb_agg(jsonb_build_object(
      'rowNo',x.row_no,'date',x.movement_date,'sourceKind',x.source_kind,'sourceId',x.source_id,
      'documentNo',x.document_no,'reference',x.reference,'description',x.description,
      'accountId',x.account_id,'accountCode',x.line_account_code,'accountNameAr',x.line_account_name_ar,'accountNameEn',x.line_account_name_en,
      'debit',x.debit,'credit',x.credit,
      'runningBalance',(case when v_normal_side='debit' then o.debit-o.credit else o.credit-o.debit end)+x.period_running_delta
    ) order by x.row_no) filter(where x.row_no is not null),'[]'::jsonb)
  into v_opening,v_period_debit,v_period_credit,v_closing,v_rows
  from opening o cross join totals t left join ordered x on true
  group by o.debit,o.credit,t.debit,t.credit;

  return jsonb_build_object(
    'account',jsonb_build_object('id',v_account.id,'code',v_account.account_code,'nameAr',v_account.name_ar,'nameEn',v_account.name_en,
      'rootClass',v_account.root_class,'allowPosting',v_account.allow_posting,'isActive',v_account.is_active,'normalSide',v_normal_side),
    'fromDate',p_from_date,'toDate',p_to_date,
    'openingBalance',coalesce(v_opening,0),'periodDebit',coalesce(v_period_debit,0),'periodCredit',coalesce(v_period_credit,0),
    'closingBalance',coalesce(v_closing,0),'rows',coalesce(v_rows,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.sea_vibe_account_statement_r44r38r15(uuid,date,date) from public,anon;
grant execute on function public.sea_vibe_account_statement_r44r38r15(uuid,date,date) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Production verification gate.
-- ---------------------------------------------------------------------------
select
  'R44R38R15R2_FULL_LEDGER_LINK_OK'::text as status,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_trip_types' and column_name='revenue_account_id') as trip_type_revenue_column,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_trips' and column_name='revenue_account_id') as trip_revenue_snapshot_column,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code='1103' and root_class=1 and allow_posting=true and is_active=true) as zawel_balance_1103,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code='4201' and root_class=4 and allow_posting=true and is_active=true) as other_revenue_4201,
  (select count(*)::integer from public.sea_vibe_trip_types where revenue_account_id is null) as unmapped_trip_types,
  (select count(*)::integer from public.sea_vibe_trips where total_value>0 and revenue_account_id is null) as unmapped_trip_rows,
  (select count(*)::integer from public.sea_vibe_trips t join public.sea_vibe_chart_accounts a on a.id=t.revenue_account_id where a.account_code='4102' and t.total_value>0) as account_4102_revenue_rows,
  (select coalesce(sum(t.total_value),0)::numeric(18,2) from public.sea_vibe_trips t join public.sea_vibe_chart_accounts a on a.id=t.revenue_account_id where a.account_code='4102' and t.total_value>0) as account_4102_revenue_total,
  (select case when pg_get_functiondef(p.oid) ilike '%''trip_revenue''::text%'
                    and pg_get_functiondef(p.oid) ilike '%t.revenue_account_id%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as trip_revenue_source,
  (select case when pg_get_functiondef(p.oid) ilike '%v_treasury_id%'
                    and pg_get_functiondef(p.oid) ilike '%v_fuel_balance_id%'
                    and pg_get_functiondef(p.oid) ilike '%v_zawel_balance_id%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as operational_counterparts,
  (select case when pg_get_functiondef(p.oid) ilike '%from public.sea_vibe_expenses e%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as expense_source,
  (select case when pg_get_functiondef(p.oid) ilike '%j.status=''posted''%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as posted_journal_source,
  (select case when pg_get_functiondef(p.oid) ilike '%sea_vibe_treasury_voucher_entries%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as voucher_source;
