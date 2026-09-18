-- PETATOE P5.13.8.72 R44R38R19 — SEA VIBE Financial Statements
-- Screens:
--   1) Trial Balance / ميزان المراجعة
--   2) Income Statement / قائمة الدخل
--   3) Statement of Financial Position / قائمة المركز المالي
-- Architecture:
--   * One canonical read-only general-ledger function owns the accounting source union.
--   * Existing Account Statement is aligned to the same ledger owner without changing its response contract.
--   * No summary-card requirement: frontend will render filters + report tables directly.
-- Safety:
--   * No historical migration edits.
--   * No DELETE / DROP / TRUNCATE.
--   * No RLS widening and no write-path changes.
--   * New screens are read-only; non-super-admin roles receive no default view grant.
--   * Draft manual journals remain excluded.

begin;

-- ---------------------------------------------------------------------------
-- A. Register the three read-only screens between Account Statement and Reports.
-- ---------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values
  ('seaVibeTrialBalance','SEA VIBE - ميزان المراجعة','SEA VIBE',162,true),
  ('seaVibeIncomeStatement','SEA VIBE - قائمة الدخل','SEA VIBE',163,true),
  ('seaVibeBalanceSheet','SEA VIBE - قائمة المركز المالي','SEA VIBE',164,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

update public.app_screens
set display_order=165
where screen_key='seaVibeReports';

-- Seed missing role/screen rows as deny-by-default. Do not overwrite any existing
-- non-super-admin choice on re-run.
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select r.role_value,s.screen_key,false,false,false,false,false
from unnest(enum_range(null::public.app_role)) as r(role_value)
cross join (values('seaVibeTrialBalance'),('seaVibeIncomeStatement'),('seaVibeBalanceSheet')) as s(screen_key)
where r.role_value<>'super_admin'::public.app_role
on conflict(role,screen_key) do nothing;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,s.screen_key,true,false,false,false,false
from (values('seaVibeTrialBalance'),('seaVibeIncomeStatement'),('seaVibeBalanceSheet')) as s(screen_key)
on conflict(role,screen_key) do update set
  can_view=true,
  can_add=false,
  can_edit=false,
  can_delete=false,
  can_export=false,
  updated_at=now();

-- ---------------------------------------------------------------------------
-- B. Canonical read-only General Ledger owner.
--    This is the single source used by Account Statement + the three statements.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_general_ledger_rows_r44r38r19(
  p_from_date date default null,
  p_to_date date default null
)
returns table(
  movement_date date,
  sort_at timestamptz,
  source_kind text,
  source_id uuid,
  document_no text,
  reference text,
  description text,
  account_id uuid,
  line_no integer,
  debit numeric(18,2),
  credit numeric(18,2)
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_treasury_id uuid;
  v_fuel_balance_id uuid;
  v_zawel_balance_id uuid;
  v_vat_account_id uuid;
begin
  if p_from_date is not null and p_to_date is not null and p_from_date>p_to_date then
    raise exception 'SEA_VIBE_LEDGER_DATE_RANGE_INVALID';
  end if;

  select id into v_treasury_id from public.sea_vibe_chart_accounts where account_code='1101' limit 1;
  select id into v_fuel_balance_id from public.sea_vibe_chart_accounts where account_code='1102' limit 1;
  select id into v_zawel_balance_id from public.sea_vibe_chart_accounts where account_code='1103' limit 1;
  select id into v_vat_account_id from public.sea_vibe_chart_accounts where account_code='2101' and is_active=true and allow_posting=true limit 1;
  if v_treasury_id is null or v_fuel_balance_id is null or v_zawel_balance_id is null or v_vat_account_id is null then
    raise exception 'SEA_VIBE_LEDGER_SYSTEM_ACCOUNT_MISSING';
  end if;

  return query
  select x.movement_date,x.sort_at,x.source_kind,x.source_id,x.document_no,x.reference,x.description,x.account_id,x.line_no,x.debit,x.credit
  from (
    -- Posted manual journals only.
    select j.journal_date movement_date,coalesce(j.posted_at,j.created_at) sort_at,'journal'::text source_kind,j.id source_id,
      j.journal_no document_no,''::text reference,coalesce(nullif(l.description,''),nullif(j.description,''),'') description,
      l.account_id,l.line_no::integer line_no,l.debit::numeric(18,2) debit,l.credit::numeric(18,2) credit
    from public.sea_vibe_journal_entries j
    join public.sea_vibe_journal_entry_lines l on l.journal_entry_id=j.id
    where j.status='posted' and l.is_active=true

    union all
    -- Treasury receipt/payment vouchers.
    select v.voucher_date,v.created_at,case when v.voucher_type='receipt' then 'receipt_voucher' else 'payment_voucher' end,
      v.id,v.voucher_no,coalesce(v.reference,''),coalesce(v.description,''),e.account_id,e.line_no::integer,
      e.debit_amount::numeric(18,2),e.credit_amount::numeric(18,2)
    from public.sea_vibe_treasury_vouchers v
    join public.sea_vibe_treasury_voucher_entries e on e.voucher_id=v.id

    union all
    -- Operational expense NET debit. Capitalized asset expenses already snapshot
    -- an asset account (e.g. 1201), so they naturally stay out of P&L.
    select e.expense_date,e.created_at,'expense'::text,e.id,
      coalesce(nullif(e.movement_serial,''),nullif(t.treasury_movement_serial,''),'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))),
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),''),
      coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف')||case when nullif(btrim(coalesce(e.notes,'')),'') is null then '' else ' — '||btrim(e.notes) end,
      e.account_id,1,e.amount::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where e.amount>0 and e.account_id is not null

    union all
    -- VAT debit generated from tax-inclusive expense input.
    select e.expense_date,e.created_at,'expense'::text,e.id,
      coalesce(nullif(e.movement_serial,''),nullif(t.treasury_movement_serial,''),'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))),
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),''),
      'VAT 15% — '||coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف'),
      v_vat_account_id,2,e.tax_amount::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where e.tax_amount>0

    union all
    -- Gross credit to payment/source account. Historical nulls retain canonical
    -- system-account fallback.
    select e.expense_date,e.created_at,'expense'::text,e.id,
      coalesce(nullif(e.movement_serial,''),nullif(t.treasury_movement_serial,''),'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))),
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),''),
      coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف')||case when nullif(btrim(coalesce(e.notes,'')),'') is null then '' else ' — '||btrim(e.notes) end,
      coalesce(e.payment_account_id,case when e.system_key='fuel_cost' then v_fuel_balance_id when e.system_key='sailing_permit' then v_zawel_balance_id else v_treasury_id end),
      3,0::numeric(18,2),coalesce(e.amount_inclusive,e.amount)::numeric(18,2)
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where coalesce(e.amount_inclusive,e.amount)>0

    union all
    -- Trip revenue: treasury debit.
    select t.trip_date,t.created_at,'trip_revenue'::text,t.id,
      coalesce(nullif(t.treasury_movement_serial,''),t.trip_serial),t.trip_serial,
      coalesce(nullif(tt.name_ar,''),nullif(tt.name_en,''),'إيراد رحلة'),
      v_treasury_id,1,t.total_value::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_trips t
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where t.total_value>0

    union all
    -- Trip revenue: revenue-account credit.
    select t.trip_date,t.created_at,'trip_revenue'::text,t.id,
      coalesce(nullif(t.treasury_movement_serial,''),t.trip_serial),t.trip_serial,
      coalesce(nullif(tt.name_ar,''),nullif(tt.name_en,''),'إيراد رحلة'),
      t.revenue_account_id,2,0::numeric(18,2),t.total_value::numeric(18,2)
    from public.sea_vibe_trips t
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where t.total_value>0 and t.revenue_account_id is not null

    union all
    -- Fuel top-up: fuel balance debit / treasury credit.
    select f.transaction_date,f.created_at,'fuel_topup'::text,f.id,
      coalesce(nullif(f.treasury_movement_serial,''),nullif(f.reference,''),'FUEL-'||upper(substr(replace(f.id::text,'-',''),1,10))),
      coalesce(f.reference,''),coalesce(nullif(f.notes,''),'شحن رصيد البنزين'),
      v_fuel_balance_id,1,f.value_delta::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_fuel_transactions f
    where f.transaction_type='topup' and f.value_delta>0

    union all
    select f.transaction_date,f.created_at,'fuel_topup'::text,f.id,
      coalesce(nullif(f.treasury_movement_serial,''),nullif(f.reference,''),'FUEL-'||upper(substr(replace(f.id::text,'-',''),1,10))),
      coalesce(f.reference,''),coalesce(nullif(f.notes,''),'شحن رصيد البنزين'),
      v_treasury_id,2,0::numeric(18,2),f.value_delta::numeric(18,2)
    from public.sea_vibe_fuel_transactions f
    where f.transaction_type='topup' and f.value_delta>0

    union all
    -- Zawel top-up: Zawel balance debit / treasury credit.
    select z.transaction_date,z.created_at,'zawel_topup'::text,z.id,
      coalesce(nullif(z.treasury_movement_serial,''),nullif(z.reference,''),'ZAW-'||upper(substr(replace(z.id::text,'-',''),1,10))),
      coalesce(z.reference,''),coalesce(nullif(z.notes,''),'شحن رصيد زاول'),
      v_zawel_balance_id,1,z.cash_amount::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_zawel_transactions z
    where z.transaction_type='topup' and z.cash_amount>0

    union all
    select z.transaction_date,z.created_at,'zawel_topup'::text,z.id,
      coalesce(nullif(z.treasury_movement_serial,''),nullif(z.reference,''),'ZAW-'||upper(substr(replace(z.id::text,'-',''),1,10))),
      coalesce(z.reference,''),coalesce(nullif(z.notes,''),'شحن رصيد زاول'),
      v_treasury_id,2,0::numeric(18,2),z.cash_amount::numeric(18,2)
    from public.sea_vibe_zawel_transactions z
    where z.transaction_type='topup' and z.cash_amount>0
  ) x
  where (p_from_date is null or x.movement_date>=p_from_date)
    and (p_to_date is null or x.movement_date<=p_to_date);
end;
$$;

-- Internal-only canonical owner. Report functions run as the same owner.
revoke all on function public.sea_vibe_general_ledger_rows_r44r38r19(date,date) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- C. Align existing Account Statement to the canonical ledger owner.
--    Response contract remains unchanged.
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
  v_opening numeric(18,2):=0;
  v_period_debit numeric(18,2):=0;
  v_period_credit numeric(18,2):=0;
  v_closing numeric(18,2):=0;
  v_rows jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('seaVibeAccountStatement','view') then raise exception 'permission_denied'; end if;
  if p_account_id is null then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_ACCOUNT_REQUIRED'; end if;
  if p_from_date is null or p_to_date is null then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_DATE_REQUIRED'; end if;
  if p_from_date>p_to_date then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_DATE_RANGE_INVALID'; end if;

  select * into v_account from public.sea_vibe_chart_accounts where id=p_account_id;
  if not found then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_ACCOUNT_NOT_FOUND'; end if;
  v_normal_side:=case when v_account.root_class in (1,5) then 'debit' else 'credit' end;

  with recursive account_scope as (
    select a.id from public.sea_vibe_chart_accounts a where a.id=p_account_id
    union all
    select child.id from public.sea_vibe_chart_accounts child join account_scope parent on child.parent_id=parent.id
  ),
  ledger as (
    select * from public.sea_vibe_general_ledger_rows_r44r38r19(null,p_to_date)
    where account_id in (select id from account_scope)
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

-- ---------------------------------------------------------------------------
-- D. Trial Balance — posting accounts only, avoiding parent/child double count.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_trial_balance_r44r38r19(
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
  v_rows jsonb:='[]'::jsonb;
  v_opening_debit numeric(18,2):=0;
  v_opening_credit numeric(18,2):=0;
  v_period_debit numeric(18,2):=0;
  v_period_credit numeric(18,2):=0;
  v_closing_debit numeric(18,2):=0;
  v_closing_credit numeric(18,2):=0;
begin
  if not public.has_screen_permission('seaVibeTrialBalance','view') then raise exception 'permission_denied'; end if;
  if p_from_date is null or p_to_date is null then raise exception 'SEA_VIBE_TRIAL_BALANCE_DATE_REQUIRED'; end if;
  if p_from_date>p_to_date then raise exception 'SEA_VIBE_TRIAL_BALANCE_DATE_RANGE_INVALID'; end if;

  with ledger as (
    select * from public.sea_vibe_general_ledger_rows_r44r38r19(null,p_to_date)
  ),
  sums as (
    select a.id,a.account_code,a.name_ar,a.name_en,a.parent_id,a.root_class,a.sort_order,
      coalesce(sum(l.debit) filter(where l.movement_date<p_from_date),0)::numeric(18,2) opening_debit_raw,
      coalesce(sum(l.credit) filter(where l.movement_date<p_from_date),0)::numeric(18,2) opening_credit_raw,
      coalesce(sum(l.debit) filter(where l.movement_date between p_from_date and p_to_date),0)::numeric(18,2) period_debit,
      coalesce(sum(l.credit) filter(where l.movement_date between p_from_date and p_to_date),0)::numeric(18,2) period_credit
    from public.sea_vibe_chart_accounts a
    left join ledger l on l.account_id=a.id
    where a.allow_posting=true
    group by a.id,a.account_code,a.name_ar,a.name_en,a.parent_id,a.root_class,a.sort_order
  ),
  shaped as (
    select s.*,
      greatest(s.opening_debit_raw-s.opening_credit_raw,0)::numeric(18,2) opening_debit,
      greatest(s.opening_credit_raw-s.opening_debit_raw,0)::numeric(18,2) opening_credit,
      greatest((s.opening_debit_raw+s.period_debit)-(s.opening_credit_raw+s.period_credit),0)::numeric(18,2) closing_debit,
      greatest((s.opening_credit_raw+s.period_credit)-(s.opening_debit_raw+s.period_debit),0)::numeric(18,2) closing_credit
    from sums s
  ),
  visible as (
    select * from shaped
    where opening_debit<>0 or opening_credit<>0 or period_debit<>0 or period_credit<>0 or closing_debit<>0 or closing_credit<>0
  ),
  totals as (
    select
      coalesce(sum(opening_debit),0)::numeric(18,2) opening_debit,
      coalesce(sum(opening_credit),0)::numeric(18,2) opening_credit,
      coalesce(sum(period_debit),0)::numeric(18,2) period_debit,
      coalesce(sum(period_credit),0)::numeric(18,2) period_credit,
      coalesce(sum(closing_debit),0)::numeric(18,2) closing_debit,
      coalesce(sum(closing_credit),0)::numeric(18,2) closing_credit
    from visible
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'accountId',v.id,'accountCode',v.account_code,'nameAr',v.name_ar,'nameEn',v.name_en,'parentId',v.parent_id,'rootClass',v.root_class,
      'openingDebit',v.opening_debit,'openingCredit',v.opening_credit,
      'periodDebit',v.period_debit,'periodCredit',v.period_credit,
      'closingDebit',v.closing_debit,'closingCredit',v.closing_credit
    ) order by v.root_class,v.sort_order,v.account_code) filter(where v.id is not null),'[]'::jsonb),
    t.opening_debit,t.opening_credit,t.period_debit,t.period_credit,t.closing_debit,t.closing_credit
  into v_rows,v_opening_debit,v_opening_credit,v_period_debit,v_period_credit,v_closing_debit,v_closing_credit
  from totals t left join visible v on true
  group by t.opening_debit,t.opening_credit,t.period_debit,t.period_credit,t.closing_debit,t.closing_credit;

  return jsonb_build_object(
    'fromDate',p_from_date,'toDate',p_to_date,'rows',v_rows,
    'totals',jsonb_build_object(
      'openingDebit',v_opening_debit,'openingCredit',v_opening_credit,
      'periodDebit',v_period_debit,'periodCredit',v_period_credit,
      'closingDebit',v_closing_debit,'closingCredit',v_closing_credit,
      'openingDifference',round(v_opening_debit-v_opening_credit,2),
      'periodDifference',round(v_period_debit-v_period_credit,2),
      'closingDifference',round(v_closing_debit-v_closing_credit,2),
      'isBalanced',abs(round(v_closing_debit-v_closing_credit,2))<0.01
    )
  );
end;
$$;

revoke all on function public.sea_vibe_trial_balance_r44r38r19(date,date) from public,anon;
grant execute on function public.sea_vibe_trial_balance_r44r38r19(date,date) to authenticated;

-- ---------------------------------------------------------------------------
-- E. Income Statement — period revenue (4) and expenses (5), hierarchical.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_income_statement_r44r38r19(
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
  v_rows jsonb:='[]'::jsonb;
  v_revenue numeric(18,2):=0;
  v_expenses numeric(18,2):=0;
  v_net numeric(18,2):=0;
begin
  if not public.has_screen_permission('seaVibeIncomeStatement','view') then raise exception 'permission_denied'; end if;
  if p_from_date is null or p_to_date is null then raise exception 'SEA_VIBE_INCOME_STATEMENT_DATE_REQUIRED'; end if;
  if p_from_date>p_to_date then raise exception 'SEA_VIBE_INCOME_STATEMENT_DATE_RANGE_INVALID'; end if;

  with recursive nodes as (
    select a.id,a.account_code,a.name_ar,a.name_en,a.parent_id,a.root_class,a.allow_posting,a.sort_order,0::integer depth,
      lpad(a.sort_order::text,10,'0')||':'||a.account_code sort_path
    from public.sea_vibe_chart_accounts a
    where a.parent_id is null and a.root_class in (4,5)
    union all
    select c.id,c.account_code,c.name_ar,c.name_en,c.parent_id,c.root_class,c.allow_posting,c.sort_order,n.depth+1,
      n.sort_path||'/'||lpad(c.sort_order::text,10,'0')||':'||c.account_code
    from public.sea_vibe_chart_accounts c join nodes n on c.parent_id=n.id
    where c.root_class in (4,5)
  ),
  hierarchy as (
    select n.id ancestor_id,n.id descendant_id from nodes n
    union all
    select h.ancestor_id,c.id from hierarchy h join public.sea_vibe_chart_accounts c on c.parent_id=h.descendant_id
    where c.root_class in (4,5)
  ),
  ledger as (
    select l.* from public.sea_vibe_general_ledger_rows_r44r38r19(p_from_date,p_to_date) l
    join public.sea_vibe_chart_accounts a on a.id=l.account_id
    where a.root_class in (4,5)
  ),
  direct as (
    select account_id,coalesce(sum(debit),0)::numeric(18,2) debit,coalesce(sum(credit),0)::numeric(18,2) credit
    from ledger group by account_id
  ),
  rollup as (
    select n.id,
      coalesce(sum(d.debit),0)::numeric(18,2) debit,
      coalesce(sum(d.credit),0)::numeric(18,2) credit
    from nodes n
    left join hierarchy h on h.ancestor_id=n.id
    left join direct d on d.account_id=h.descendant_id
    group by n.id
  ),
  shaped as (
    select n.*,
      case when n.root_class=4 then r.credit-r.debit else r.debit-r.credit end::numeric(18,2) amount
    from nodes n join rollup r on r.id=n.id
  ),
  visible as (
    select * from shaped where depth=0 or amount<>0
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'accountId',v.id,'accountCode',v.account_code,'nameAr',v.name_ar,'nameEn',v.name_en,'parentId',v.parent_id,
      'rootClass',v.root_class,'depth',v.depth,'allowPosting',v.allow_posting,'amount',v.amount
    ) order by v.sort_path) filter(where v.id is not null),'[]'::jsonb),
    coalesce(max(v.amount) filter(where v.account_code='4'),0)::numeric(18,2),
    coalesce(max(v.amount) filter(where v.account_code='5'),0)::numeric(18,2)
  into v_rows,v_revenue,v_expenses
  from visible v;

  v_net:=round(v_revenue-v_expenses,2);
  return jsonb_build_object(
    'fromDate',p_from_date,'toDate',p_to_date,'rows',v_rows,
    'totalRevenue',v_revenue,'totalExpenses',v_expenses,'netResult',v_net,
    'resultType',case when v_net>0 then 'profit' when v_net<0 then 'loss' else 'break_even' end
  );
end;
$$;

revoke all on function public.sea_vibe_income_statement_r44r38r19(date,date) from public,anon;
grant execute on function public.sea_vibe_income_statement_r44r38r19(date,date) to authenticated;

-- ---------------------------------------------------------------------------
-- F. Statement of Financial Position — as-of date.
--    Net P&L still open in classes 4/5 is presented through account 35 so the
--    accounting equation remains Assets = Liabilities + Equity.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_balance_sheet_r44r38r19(
  p_as_of_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_rows jsonb:='[]'::jsonb;
  v_assets numeric(18,2):=0;
  v_liabilities numeric(18,2):=0;
  v_equity numeric(18,2):=0;
  v_current_result numeric(18,2):=0;
  v_difference numeric(18,2):=0;
begin
  if not public.has_screen_permission('seaVibeBalanceSheet','view') then raise exception 'permission_denied'; end if;
  if p_as_of_date is null then raise exception 'SEA_VIBE_BALANCE_SHEET_DATE_REQUIRED'; end if;

  with recursive nodes as (
    select a.id,a.account_code,a.name_ar,a.name_en,a.parent_id,a.root_class,a.allow_posting,a.sort_order,0::integer depth,
      lpad(a.sort_order::text,10,'0')||':'||a.account_code sort_path
    from public.sea_vibe_chart_accounts a
    where a.parent_id is null and a.root_class in (1,2,3)
    union all
    select c.id,c.account_code,c.name_ar,c.name_en,c.parent_id,c.root_class,c.allow_posting,c.sort_order,n.depth+1,
      n.sort_path||'/'||lpad(c.sort_order::text,10,'0')||':'||c.account_code
    from public.sea_vibe_chart_accounts c join nodes n on c.parent_id=n.id
    where c.root_class in (1,2,3)
  ),
  hierarchy as (
    select n.id ancestor_id,n.id descendant_id from nodes n
    union all
    select h.ancestor_id,c.id from hierarchy h join public.sea_vibe_chart_accounts c on c.parent_id=h.descendant_id
    where c.root_class in (1,2,3)
  ),
  ledger as (
    select l.*,a.root_class line_root_class,a.account_code line_account_code
    from public.sea_vibe_general_ledger_rows_r44r38r19(null,p_as_of_date) l
    join public.sea_vibe_chart_accounts a on a.id=l.account_id
  ),
  pnl as (
    select
      coalesce(sum(case when line_root_class=4 then credit-debit else 0 end),0)::numeric(18,2) revenue,
      coalesce(sum(case when line_root_class=5 then debit-credit else 0 end),0)::numeric(18,2) expenses
    from ledger
  ),
  direct as (
    select account_id,coalesce(sum(debit),0)::numeric(18,2) debit,coalesce(sum(credit),0)::numeric(18,2) credit
    from ledger where line_root_class in (1,2,3) group by account_id
  ),
  result_account as (
    select id from public.sea_vibe_chart_accounts where account_code='35' and root_class=3 limit 1
  ),
  rollup as (
    select n.id,
      coalesce(sum(d.debit),0)::numeric(18,2) debit,
      coalesce(sum(d.credit),0)::numeric(18,2) credit,
      coalesce(bool_or(h.descendant_id=(select id from result_account)),false) contains_result
    from nodes n
    left join hierarchy h on h.ancestor_id=n.id
    left join direct d on d.account_id=h.descendant_id
    group by n.id
  ),
  shaped as (
    select n.*,
      (case when n.root_class=1 then r.debit-r.credit else r.credit-r.debit end
       + case when r.contains_result then (select revenue-expenses from pnl) else 0 end)::numeric(18,2) amount,
      r.contains_result
    from nodes n join rollup r on r.id=n.id
  ),
  visible as (
    select * from shaped where depth=0 or amount<>0 or account_code='35'
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'accountId',v.id,'accountCode',v.account_code,'nameAr',v.name_ar,'nameEn',v.name_en,'parentId',v.parent_id,
      'rootClass',v.root_class,'depth',v.depth,'allowPosting',v.allow_posting,'amount',v.amount,
      'includesCurrentResult',v.contains_result
    ) order by v.sort_path) filter(where v.id is not null),'[]'::jsonb),
    coalesce(max(v.amount) filter(where v.account_code='1'),0)::numeric(18,2),
    coalesce(max(v.amount) filter(where v.account_code='2'),0)::numeric(18,2),
    coalesce(max(v.amount) filter(where v.account_code='3'),0)::numeric(18,2),
    coalesce((select revenue-expenses from pnl),0)::numeric(18,2)
  into v_rows,v_assets,v_liabilities,v_equity,v_current_result
  from visible v;

  v_difference:=round(v_assets-(v_liabilities+v_equity),2);
  return jsonb_build_object(
    'asOfDate',p_as_of_date,'rows',v_rows,
    'totalAssets',v_assets,'totalLiabilities',v_liabilities,'totalEquity',v_equity,
    'currentPeriodResult',v_current_result,
    'equationDifference',v_difference,'isBalanced',abs(v_difference)<0.01
  );
end;
$$;

revoke all on function public.sea_vibe_balance_sheet_r44r38r19(date) from public,anon;
grant execute on function public.sea_vibe_balance_sheet_r44r38r19(date) to authenticated;

-- ---------------------------------------------------------------------------
-- G. Localization — existing PetatoeLocalization/app_translations only.
-- ---------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('sidebar.seaVibeTrialBalance','seaVibeTrialBalance','seaVibe','menu','ميزان المراجعة','Trial Balance','ميزان المراجعة','Trial Balance',true,now()),
  ('sidebar.seaVibeIncomeStatement','seaVibeIncomeStatement','seaVibe','menu','قائمة الدخل','Income Statement','قائمة الدخل','Income Statement',true,now()),
  ('sidebar.seaVibeBalanceSheet','seaVibeBalanceSheet','seaVibe','menu','قائمة المركز المالي','Statement of Financial Position','قائمة المركز المالي','Statement of Financial Position',true,now()),
  ('seaVibe.page.trialBalance.title','seaVibeTrialBalance','seaVibe','title','SEA VIBE — ميزان المراجعة','SEA VIBE — Trial Balance','SEA VIBE — ميزان المراجعة','SEA VIBE — Trial Balance',true,now()),
  ('seaVibe.page.trialBalance.subtitle','seaVibeTrialBalance','seaVibe','subtitle','مراجعة أرصدة وحركات الحسابات خلال فترة محددة.','Review account balances and movements for a selected period.','مراجعة أرصدة وحركات الحسابات خلال فترة محددة.','Review account balances and movements for a selected period.',true,now()),
  ('seaVibe.page.incomeStatement.title','seaVibeIncomeStatement','seaVibe','title','SEA VIBE — قائمة الدخل','SEA VIBE — Income Statement','SEA VIBE — قائمة الدخل','SEA VIBE — Income Statement',true,now()),
  ('seaVibe.page.incomeStatement.subtitle','seaVibeIncomeStatement','seaVibe','subtitle','الإيرادات والمصروفات وصافي نتيجة الفترة.','Revenue, expenses, and net result for the selected period.','الإيرادات والمصروفات وصافي نتيجة الفترة.','Revenue, expenses, and net result for the selected period.',true,now()),
  ('seaVibe.page.balanceSheet.title','seaVibeBalanceSheet','seaVibe','title','SEA VIBE — قائمة المركز المالي','SEA VIBE — Statement of Financial Position','SEA VIBE — قائمة المركز المالي','SEA VIBE — Statement of Financial Position',true,now()),
  ('seaVibe.page.balanceSheet.subtitle','seaVibeBalanceSheet','seaVibe','subtitle','الأصول والالتزامات وحقوق الملكية حتى تاريخ محدد.','Assets, liabilities, and equity as of a selected date.','الأصول والالتزامات وحقوق الملكية حتى تاريخ محدد.','Assets, liabilities, and equity as of a selected date.',true,now()),
  ('seaVibe.financial.fromDate','seaVibeTrialBalance','seaVibe','label','من تاريخ','From Date','من تاريخ','From Date',true,now()),
  ('seaVibe.financial.toDate','seaVibeTrialBalance','seaVibe','label','إلى تاريخ','To Date','إلى تاريخ','To Date',true,now()),
  ('seaVibe.financial.asOfDate','seaVibeBalanceSheet','seaVibe','label','حتى تاريخ','As of Date','حتى تاريخ','As of Date',true,now()),
  ('seaVibe.financial.showReport','seaVibeTrialBalance','seaVibe','button','عرض التقرير','Show Report','عرض التقرير','Show Report',true,now()),
  ('seaVibe.financial.accountCode','seaVibeTrialBalance','seaVibe','table','كود الحساب','Account Code','كود الحساب','Account Code',true,now()),
  ('seaVibe.financial.accountName','seaVibeTrialBalance','seaVibe','table','اسم الحساب','Account Name','اسم الحساب','Account Name',true,now()),
  ('seaVibe.financial.openingDebit','seaVibeTrialBalance','seaVibe','table','افتتاحي مدين','Opening Debit','افتتاحي مدين','Opening Debit',true,now()),
  ('seaVibe.financial.openingCredit','seaVibeTrialBalance','seaVibe','table','افتتاحي دائن','Opening Credit','افتتاحي دائن','Opening Credit',true,now()),
  ('seaVibe.financial.periodDebit','seaVibeTrialBalance','seaVibe','table','حركة مدين','Debit Movement','حركة مدين','Debit Movement',true,now()),
  ('seaVibe.financial.periodCredit','seaVibeTrialBalance','seaVibe','table','حركة دائن','Credit Movement','حركة دائن','Credit Movement',true,now()),
  ('seaVibe.financial.closingDebit','seaVibeTrialBalance','seaVibe','table','ختامي مدين','Closing Debit','ختامي مدين','Closing Debit',true,now()),
  ('seaVibe.financial.closingCredit','seaVibeTrialBalance','seaVibe','table','ختامي دائن','Closing Credit','ختامي دائن','Closing Credit',true,now()),
  ('seaVibe.financial.revenue','seaVibeIncomeStatement','seaVibe','label','الإيرادات','Revenue','الإيرادات','Revenue',true,now()),
  ('seaVibe.financial.expenses','seaVibeIncomeStatement','seaVibe','label','المصروفات','Expenses','المصروفات','Expenses',true,now()),
  ('seaVibe.financial.netResult','seaVibeIncomeStatement','seaVibe','label','صافي نتيجة الفترة','Net Result','صافي نتيجة الفترة','Net Result',true,now()),
  ('seaVibe.financial.profit','seaVibeIncomeStatement','seaVibe','status','ربح','Profit','ربح','Profit',true,now()),
  ('seaVibe.financial.loss','seaVibeIncomeStatement','seaVibe','status','خسارة','Loss','خسارة','Loss',true,now()),
  ('seaVibe.financial.assets','seaVibeBalanceSheet','seaVibe','label','الأصول','Assets','الأصول','Assets',true,now()),
  ('seaVibe.financial.liabilities','seaVibeBalanceSheet','seaVibe','label','الالتزامات','Liabilities','الالتزامات','Liabilities',true,now()),
  ('seaVibe.financial.equity','seaVibeBalanceSheet','seaVibe','label','حقوق الملكية','Equity','حقوق الملكية','Equity',true,now()),
  ('seaVibe.financial.total','seaVibeTrialBalance','seaVibe','label','الإجمالي','Total','الإجمالي','Total',true,now()),
  ('seaVibe.financial.balanced','seaVibeTrialBalance','seaVibe','status','متوازن','Balanced','متوازن','Balanced',true,now()),
  ('seaVibe.financial.notBalanced','seaVibeTrialBalance','seaVibe','status','غير متوازن','Not Balanced','غير متوازن','Not Balanced',true,now()),
  ('seaVibe.financial.empty','seaVibeTrialBalance','seaVibe','empty','لا توجد بيانات محاسبية للفترة المحددة.','No accounting data exists for the selected period.','لا توجد بيانات محاسبية للفترة المحددة.','No accounting data exists for the selected period.',true,now()),
  ('pwa.update.release.r44r38r19.title','systemSettings','pwa','title','القوائم المالية لـ SEA VIBE — R44R38R19','SEA VIBE Financial Statements — R44R38R19','القوائم المالية لـ SEA VIBE — R44R38R19','SEA VIBE Financial Statements — R44R38R19',true,now()),
  ('pwa.update.release.r44r38r19.note1','systemSettings','pwa','note','إضافة ميزان المراجعة وقائمة الدخل وقائمة المركز المالي كمخرجات محاسبية مستقلة بدون كروت ملخص أعلى الشاشات.','Adds Trial Balance, Income Statement, and Statement of Financial Position as separate accounting reports without summary cards.','إضافة ميزان المراجعة وقائمة الدخل وقائمة المركز المالي كمخرجات محاسبية مستقلة بدون كروت ملخص أعلى الشاشات.','Adds Trial Balance, Income Statement, and Statement of Financial Position as separate accounting reports without summary cards.',true,now()),
  ('pwa.update.release.r44r38r19.note2','systemSettings','pwa','note','توحيد مصدر كشف الحساب والقوائم المالية على General Ledger واحد للحركات المرحلة والتشغيلية بدون Double Count.','Aligns Account Statement and financial statements on one canonical General Ledger for posted and operational movements without double counting.','توحيد مصدر كشف الحساب والقوائم المالية على General Ledger واحد للحركات المرحلة والتشغيلية بدون Double Count.','Aligns Account Statement and financial statements on one canonical General Ledger for posted and operational movements without double counting.',true,now()),
  ('pwa.update.release.r44r38r19.note3','systemSettings','pwa','note','الشاشات الجديدة قراءة فقط بصلاحيات مستقلة، بدون تغيير Offline/Sync أو RLS أو مسارات الحفظ المالية.','New screens are read-only with independent permissions and no changes to Offline/Sync, RLS, or financial write paths.','الشاشات الجديدة قراءة فقط بصلاحيات مستقلة، بدون تغيير Offline/Sync أو RLS أو مسارات الحفظ المالية.','New screens are read-only with independent permissions and no changes to Offline/Sync, RLS, or financial write paths.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' then excluded.default_ar else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' then excluded.default_en else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

commit;

-- ---------------------------------------------------------------------------
-- Verification (read-only)
-- ---------------------------------------------------------------------------
with ledger_totals as (
  select coalesce(sum(debit),0)::numeric(18,2) debit,coalesce(sum(credit),0)::numeric(18,2) credit
  from public.sea_vibe_general_ledger_rows_r44r38r19(null,current_date)
)
select
  'R44R38R19_FINANCIAL_STATEMENTS_OK'::text as status,
  (select count(*)::integer from public.app_screens where screen_key in ('seaVibeTrialBalance','seaVibeIncomeStatement','seaVibeBalanceSheet') and is_active=true) as screens_registered,
  (select count(*)::integer from public.role_screen_permissions where role='super_admin'::public.app_role and screen_key in ('seaVibeTrialBalance','seaVibeIncomeStatement','seaVibeBalanceSheet') and can_view=true) as super_admin_view_grants,
  (select count(*)::integer from public.role_screen_permissions where screen_key in ('seaVibeTrialBalance','seaVibeIncomeStatement','seaVibeBalanceSheet') and (can_add or can_edit or can_delete or can_export)) as unsafe_write_grants,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name='sea_vibe_general_ledger_rows_r44r38r19') as canonical_ledger_rpc,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name in ('sea_vibe_trial_balance_r44r38r19','sea_vibe_income_statement_r44r38r19','sea_vibe_balance_sheet_r44r38r19')) as report_rpcs,
  (select case when pg_get_functiondef(p.oid) ilike '%sea_vibe_general_ledger_rows_r44r38r19%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as account_statement_aligned,
  (select case when pg_get_functiondef(p.oid) ilike '%j.status=''posted''%' and pg_get_functiondef(p.oid) ilike '%sea_vibe_expenses%' and pg_get_functiondef(p.oid) ilike '%trip_revenue%' and pg_get_functiondef(p.oid) ilike '%fuel_topup%' and pg_get_functiondef(p.oid) ilike '%zawel_topup%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_general_ledger_rows_r44r38r19' limit 1) as full_ledger_sources,
  (select case when pg_get_functiondef(p.oid) ilike '%allow_posting=true%' and pg_get_functiondef(p.oid) ilike '%opening_debit%' and pg_get_functiondef(p.oid) ilike '%closing_credit%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_trial_balance_r44r38r19' limit 1) as trial_balance_logic,
  (select case when pg_get_functiondef(p.oid) ilike '%root_class in (4,5)%' and pg_get_functiondef(p.oid) ilike '%v_revenue-v_expenses%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_income_statement_r44r38r19' limit 1) as income_statement_logic,
  (select case when pg_get_functiondef(p.oid) ilike '%root_class in (1,2,3)%' and pg_get_functiondef(p.oid) ilike '%account_code=''35''%' and pg_get_functiondef(p.oid) ilike '%v_assets-(v_liabilities+v_equity)%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_balance_sheet_r44r38r19' limit 1) as balance_sheet_logic,
  (select round(abs(debit-credit),2) from ledger_totals) as ledger_difference,
  (select count(*)::integer from public.app_translations where translation_key in ('sidebar.seaVibeTrialBalance','sidebar.seaVibeIncomeStatement','sidebar.seaVibeBalanceSheet','pwa.update.release.r44r38r19.title')) as translation_rows;
