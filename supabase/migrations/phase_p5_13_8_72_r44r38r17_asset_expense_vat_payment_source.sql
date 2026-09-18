-- PETATOE P5.13.8.72 R44R38R17 — SEA VIBE Asset Expense VAT & Payment Source
-- Scope:
--   1) Add per-expense VAT selection using tax-inclusive input semantics.
--   2) Store the selected payment/source account per expense, defaulting to SEA VIBE Treasury 1101.
--   3) Keep expense.amount as the accounting NET amount; store gross amount separately.
--   4) Post VAT to account 2101 and credit the selected payment account with the gross amount.
--   5) Keep asset valuation based on NET amount only; VAT never increases asset value.
-- Safety:
--   No historical migration edits. No DELETE/DROP/TRUNCATE. No RLS/permission widening.
--   No Offline Queue / Sync Engine / pruning changes in this DB phase.

begin;

-- ---------------------------------------------------------------------------
-- A. Authoritative expense financial snapshots
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_expenses
  add column if not exists amount_inclusive numeric(14,2),
  add column if not exists tax_code text not null default 'none',
  add column if not exists tax_amount numeric(14,2) not null default 0,
  add column if not exists payment_account_id uuid;

update public.sea_vibe_expenses
set amount_inclusive=amount
where amount_inclusive is null;

alter table public.sea_vibe_expenses
  alter column amount_inclusive set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expenses'::regclass
      and conname='sea_vibe_expenses_tax_code_check'
  ) then
    alter table public.sea_vibe_expenses
      add constraint sea_vibe_expenses_tax_code_check
      check (tax_code in ('none','vat15'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expenses'::regclass
      and conname='sea_vibe_expenses_tax_amount_check'
  ) then
    alter table public.sea_vibe_expenses
      add constraint sea_vibe_expenses_tax_amount_check
      check (tax_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expenses'::regclass
      and conname='sea_vibe_expenses_amount_inclusive_check'
  ) then
    alter table public.sea_vibe_expenses
      add constraint sea_vibe_expenses_amount_inclusive_check
      check (amount_inclusive >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expenses'::regclass
      and conname='sea_vibe_expenses_tax_math_check'
  ) then
    alter table public.sea_vibe_expenses
      add constraint sea_vibe_expenses_tax_math_check
      check (
        round(amount + tax_amount,2)=round(amount_inclusive,2)
        and (
          (tax_code='none' and tax_amount=0 and round(amount,2)=round(amount_inclusive,2))
          or
          (tax_code='vat15'
            and round(amount,2)=round(amount_inclusive/1.15,2)
            and round(tax_amount,2)=round(amount_inclusive-round(amount_inclusive/1.15,2),2)
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expenses'::regclass
      and conname='sea_vibe_expenses_payment_account_fk'
  ) then
    alter table public.sea_vibe_expenses
      add constraint sea_vibe_expenses_payment_account_fk
      foreign key (payment_account_id) references public.sea_vibe_chart_accounts(id);
  end if;
end $$;

create index if not exists idx_sea_vibe_expenses_payment_account
  on public.sea_vibe_expenses(payment_account_id,expense_date)
  where payment_account_id is not null;

-- ---------------------------------------------------------------------------
-- B. Canonical expense trigger owner: scope/account/treatment + VAT/payment
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_snapshot_expense_account_r44r11()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_catalog public.sea_vibe_expense_catalog%rowtype;
  v_policy_changed boolean;
  v_payment public.sea_vibe_chart_accounts%rowtype;
  v_default_payment_id uuid;
  v_vat_account_id uuid;
  v_inclusive numeric(14,2);
  v_net numeric(14,2);
  v_tax numeric(14,2);
begin
  if tg_op='INSERT' then
    v_policy_changed:=true;
  else
    v_policy_changed:=new.expense_catalog_id is distinct from old.expense_catalog_id
      or new.expense_scope is distinct from old.expense_scope;
  end if;

  if v_policy_changed or new.account_id is null then
    select * into v_catalog
    from public.sea_vibe_expense_catalog
    where id=new.expense_catalog_id;
    if not found then raise exception 'SEA_VIBE_EXPENSE_CATALOG_NOT_FOUND'; end if;

    if v_policy_changed then
      if new.expense_scope='general' and not v_catalog.allow_general then raise exception 'SEA_VIBE_EXPENSE_SCOPE_NOT_ALLOWED'; end if;
      if new.expense_scope='trip' and not v_catalog.allow_trip then raise exception 'SEA_VIBE_EXPENSE_SCOPE_NOT_ALLOWED'; end if;
      if new.expense_scope='asset' and not v_catalog.allow_asset then raise exception 'SEA_VIBE_EXPENSE_SCOPE_NOT_ALLOWED'; end if;
      if coalesce(new.is_system_generated,false)=false and coalesce(v_catalog.is_system,false)=true then
        raise exception 'SEA_VIBE_SYSTEM_EXPENSE_MANUAL_NOT_ALLOWED';
      end if;

      new.asset_cost_treatment:=case
        when new.expense_scope='asset' then v_catalog.asset_treatment
        else 'operating'
      end;
    end if;

    if new.account_id is null or v_policy_changed then
      new.account_id:=v_catalog.account_id;
      if new.account_id is null then
        select id into new.account_id
        from public.sea_vibe_chart_accounts
        where account_code='5299' and is_active
        limit 1;
      end if;
    end if;
  else
    select * into v_catalog
    from public.sea_vibe_expense_catalog
    where id=new.expense_catalog_id;
  end if;

  -- Normalize tax selection and calculate from the tax-inclusive user amount.
  new.tax_code:=case when lower(coalesce(new.tax_code,'none'))='vat15' then 'vat15' else 'none' end;

  if tg_op='INSERT' then
    v_inclusive:=round(greatest(coalesce(new.amount_inclusive,new.amount,0),0),2);
  else
    if new.amount_inclusive is distinct from old.amount_inclusive then
      v_inclusive:=round(greatest(coalesce(new.amount_inclusive,0),0),2);
    elsif new.amount is distinct from old.amount then
      -- Legacy/direct writers still write the user-entered total into amount.
      v_inclusive:=round(greatest(coalesce(new.amount,0),0),2);
    else
      v_inclusive:=round(greatest(coalesce(old.amount_inclusive,new.amount,0),0),2);
    end if;
  end if;

  if new.tax_code='vat15' then
    select id into v_vat_account_id
    from public.sea_vibe_chart_accounts
    where account_code='2101' and is_active=true and allow_posting=true
    limit 1;
    if v_vat_account_id is null then raise exception 'SEA_VIBE_VAT_ACCOUNT_2101_MISSING'; end if;
    v_net:=round(v_inclusive/1.15,2);
    v_tax:=round(v_inclusive-v_net,2);
  else
    v_net:=v_inclusive;
    v_tax:=0;
  end if;

  new.amount_inclusive:=v_inclusive;
  new.amount:=v_net;
  new.tax_amount:=v_tax;

  -- Payment source: system wallets keep their dedicated balance account;
  -- every normal manual expense defaults to SEA VIBE Treasury 1101.
  if new.payment_account_id is null then
    select id into v_default_payment_id
    from public.sea_vibe_chart_accounts
    where account_code=case
      when coalesce(new.system_key,'')='fuel_cost' then '1102'
      when coalesce(new.system_key,'')='sailing_permit' then '1103'
      else '1101'
    end
      and is_active=true and allow_posting=true
    limit 1;
    if v_default_payment_id is null then raise exception 'SEA_VIBE_EXPENSE_PAYMENT_ACCOUNT_DEFAULT_MISSING'; end if;
    new.payment_account_id:=v_default_payment_id;
  end if;

  select * into v_payment
  from public.sea_vibe_chart_accounts
  where id=new.payment_account_id;
  if not found then raise exception 'SEA_VIBE_EXPENSE_PAYMENT_ACCOUNT_NOT_FOUND'; end if;
  if not v_payment.is_active then raise exception 'SEA_VIBE_EXPENSE_PAYMENT_ACCOUNT_INACTIVE'; end if;
  if not v_payment.allow_posting then raise exception 'SEA_VIBE_EXPENSE_PAYMENT_ACCOUNT_POSTING_REQUIRED'; end if;
  if v_payment.root_class not in (1,2,3) then raise exception 'SEA_VIBE_EXPENSE_PAYMENT_ACCOUNT_BALANCE_SHEET_REQUIRED'; end if;

  return new;
end;
$$;

-- Replace the canonical trigger itself; do not layer a second financial trigger.
create or replace trigger trg_sea_vibe_snapshot_expense_account_r44r11
before insert or update on public.sea_vibe_expenses
for each row execute function public.sea_vibe_snapshot_expense_account_r44r11();

-- ---------------------------------------------------------------------------
-- C. Canonical create path: accept tax/payment snapshots in existing line JSON
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_add_expense_batch(
  p_scope text,
  p_trip_id uuid,
  p_asset_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_group uuid:=gen_random_uuid();
  v_serial text;
  v_status text;
  v_trip_date date;
  v_line jsonb;
  v_id uuid;
  v_ids jsonb:='[]'::jsonb;
begin
  if not public.has_screen_permission('seaVibeExpenseNew','add') then
    raise exception 'permission_denied';
  end if;
  if p_scope not in ('general','trip','asset') then
    raise exception 'invalid_scope';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'expense_lines_required';
  end if;

  if p_scope='trip' then
    select status,trip_date into v_status,v_trip_date
    from public.sea_vibe_trips
    where id=p_trip_id
    for update;
    if v_status is null then raise exception 'trip_not_found'; end if;
    if v_status<>'open' then raise exception 'trip_closed'; end if;
    v_serial:=public.sea_vibe_next_treasury_movement_serial(v_trip_date);
  else
    v_serial:=public.sea_vibe_next_treasury_movement_serial(coalesce(nullif(p_lines->0->>'date','')::date,current_date));
    if p_scope='asset' and not exists(select 1 from public.sea_vibe_assets where id=p_asset_id) then
      raise exception 'asset_not_found';
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if nullif(v_line->>'catalog_id','') is null then raise exception 'expense_catalog_required'; end if;
    insert into public.sea_vibe_expenses(
      expense_scope,trip_id,asset_id,expense_catalog_id,expense_date,
      amount,amount_inclusive,tax_code,payment_account_id,
      payment_method_id,notes,movement_group_id,movement_serial,created_by,updated_by
    ) values(
      p_scope,
      case when p_scope='trip' then p_trip_id else null end,
      case when p_scope='asset' then p_asset_id else null end,
      nullif(v_line->>'catalog_id','')::uuid,
      case when p_scope='trip' then v_trip_date else nullif(v_line->>'date','')::date end,
      coalesce((v_line->>'amount')::numeric,0),
      coalesce((v_line->>'amount')::numeric,0),
      case when lower(coalesce(v_line->>'tax_code','none'))='vat15' then 'vat15' else 'none' end,
      nullif(v_line->>'payment_account_id','')::uuid,
      nullif(v_line->>'payment_method_id','')::uuid,
      nullif(btrim(v_line->>'notes'),''),
      v_group,v_serial,auth.uid(),auth.uid()
    ) returning id into v_id;
    v_ids:=v_ids||jsonb_build_array(v_id);
  end loop;

  return jsonb_build_object('movement_group_id',v_group,'movement_serial',v_serial,'expense_ids',v_ids);
end;
$$;

revoke all on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) to authenticated;
comment on function public.sea_vibe_add_expense_batch(text,uuid,uuid,jsonb) is
'R44R38R17 canonical expense-batch create. Line amount is tax-inclusive user input; trigger snapshots net/tax/payment account. Trip expenses inherit trip date.';

-- Asset edit wrapper: keep the existing movement-update semantics and patch the
-- financial snapshots atomically in the same database call.
create or replace function public.sea_vibe_update_asset_expense_batch_r44r38r17(
  p_group_id uuid,
  p_asset_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
  v_ids jsonb;
  v_idx integer:=0;
  v_line jsonb;
  v_id uuid;
begin
  if not public.has_screen_permission('seaVibeExpenseNew','edit') then raise exception 'permission_denied'; end if;
  if p_group_id is null then raise exception 'EXPENSE_MOVEMENT_NOT_FOUND'; end if;
  if p_asset_id is null then raise exception 'asset_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'expense_lines_required'; end if;

  v_result:=public.sea_vibe_update_expense_batch(p_group_id,'asset',null,p_asset_id,p_lines);
  v_ids:=coalesce(v_result->'expense_ids','[]'::jsonb);

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_id:=nullif(v_ids->>v_idx,'')::uuid;
    if v_id is null then raise exception 'EXPENSE_LINE_NOT_IN_MOVEMENT'; end if;

    update public.sea_vibe_expenses
    set amount=coalesce((v_line->>'amount')::numeric,0),
        amount_inclusive=coalesce((v_line->>'amount')::numeric,0),
        tax_code=case when lower(coalesce(v_line->>'tax_code','none'))='vat15' then 'vat15' else 'none' end,
        payment_account_id=nullif(v_line->>'payment_account_id','')::uuid,
        updated_by=auth.uid(),
        updated_at=now()
    where id=v_id
      and movement_group_id=p_group_id
      and expense_scope='asset'
      and coalesce(is_system_generated,false)=false;

    if not found then raise exception 'EXPENSE_LINE_NOT_IN_MOVEMENT'; end if;
    v_idx:=v_idx+1;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.sea_vibe_update_asset_expense_batch_r44r38r17(uuid,uuid,jsonb) from public,anon;
grant execute on function public.sea_vibe_update_asset_expense_batch_r44r38r17(uuid,uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- D. Treasury view: only expenses actually paid from 1101 reduce treasury
-- ---------------------------------------------------------------------------
create or replace view public.sea_vibe_treasury_movements with (security_invoker=true) as
select 'trip_revenue:'||t.id::text as movement_id,
       t.created_at as movement_at,
       'trip_revenue'::text as movement_type,
       t.total_value::numeric(14,2) as amount,
       t.trip_serial as reference,
       coalesce(t.notes,'') as description,
       t.id as trip_id,
       null::uuid as asset_id,
       t.treasury_movement_serial as movement_serial,
       'trip'::text as source_kind,
       t.id as source_id,
       null::uuid as expense_group_id,
       t.trip_date as movement_date
from public.sea_vibe_trips t
union all
select 'expense:'||e.id::text,
       e.created_at,
       case when e.expense_scope='asset' then 'asset_expense' else 'expense' end,
       (-e.amount_inclusive)::numeric(14,2),
       coalesce(t.trip_serial,a.asset_code,''),
       coalesce(c.name_ar,'')||case when e.notes is null then '' else ' — '||e.notes end,
       e.trip_id,
       e.asset_id,
       e.movement_serial,
       'expense'::text,
       e.movement_group_id,
       e.movement_group_id,
       e.expense_date
from public.sea_vibe_expenses e
left join public.sea_vibe_trips t on t.id=e.trip_id
left join public.sea_vibe_assets a on a.id=e.asset_id
left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
where coalesce(e.system_key,'') not in ('sailing_permit','fuel_cost')
  and (
    e.payment_account_id is null
    or exists(
      select 1 from public.sea_vibe_chart_accounts pa
      where pa.id=e.payment_account_id and pa.account_code='1101'
    )
  )
union all
select 'zawel_topup:'||z.id::text,
       z.created_at,
       'zawel_topup'::text,
       (-z.cash_amount)::numeric(14,2),
       coalesce(z.reference,''),
       'شحن رصيد زاول',
       null::uuid,
       null::uuid,
       z.treasury_movement_serial,
       'zawel_topup'::text,
       z.id,
       null::uuid,
       z.transaction_date
from public.sea_vibe_zawel_transactions z
where z.transaction_type='topup'
union all
select 'fuel_topup:'||f.id::text,
       f.created_at,
       'fuel_topup'::text,
       (-f.value_delta)::numeric(14,2),
       coalesce(f.reference,''),
       'شحن رصيد البنزين',
       null::uuid,
       null::uuid,
       f.treasury_movement_serial,
       'fuel_topup'::text,
       f.id,
       null::uuid,
       f.transaction_date
from public.sea_vibe_fuel_transactions f
where f.transaction_type='topup'
union all
select 'treasury_voucher:'||v.id::text,
       v.created_at,
       case when v.voucher_type='receipt' then 'cash_receipt' else 'cash_payment' end,
       (case when v.voucher_type='receipt' then v.amount else -v.amount end)::numeric(14,2),
       coalesce(nullif(v.reference,''),v.voucher_no),
       v.description,
       null::uuid,
       null::uuid,
       v.voucher_no,
       'treasury_voucher'::text,
       v.id,
       null::uuid,
       v.voucher_date
from public.sea_vibe_treasury_vouchers v;

grant select on public.sea_vibe_treasury_movements to authenticated;

-- ---------------------------------------------------------------------------
-- E. Account statement: NET expense + VAT debit + gross payment credit
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
  v_vat_account_id uuid;
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

  select id into v_treasury_id from public.sea_vibe_chart_accounts where account_code='1101' limit 1;
  select id into v_fuel_balance_id from public.sea_vibe_chart_accounts where account_code='1102' limit 1;
  select id into v_zawel_balance_id from public.sea_vibe_chart_accounts where account_code='1103' limit 1;
  select id into v_vat_account_id from public.sea_vibe_chart_accounts where account_code='2101' and is_active=true and allow_posting=true limit 1;
  if v_treasury_id is null or v_fuel_balance_id is null or v_zawel_balance_id is null or v_vat_account_id is null then
    raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_SYSTEM_ACCOUNT_MISSING';
  end if;

  with recursive account_scope as (
    select a.id from public.sea_vibe_chart_accounts a where a.id=p_account_id
    union all
    select child.id from public.sea_vibe_chart_accounts child join account_scope parent on child.parent_id=parent.id
  ),
  ledger as (
    select j.journal_date movement_date,coalesce(j.posted_at,j.created_at) sort_at,'journal'::text source_kind,j.id source_id,
      j.journal_no document_no,''::text reference,coalesce(nullif(l.description,''),nullif(j.description,''),'') description,
      l.account_id,l.line_no::integer line_no,l.debit::numeric(18,2) debit,l.credit::numeric(18,2) credit
    from public.sea_vibe_journal_entries j
    join public.sea_vibe_journal_entry_lines l on l.journal_entry_id=j.id
    where j.status='posted' and l.is_active=true and l.account_id in (select id from account_scope)

    union all
    select v.voucher_date,v.created_at,case when v.voucher_type='receipt' then 'receipt_voucher' else 'payment_voucher' end,
      v.id,v.voucher_no,coalesce(v.reference,''),coalesce(v.description,''),e.account_id,e.line_no::integer,
      e.debit_amount::numeric(18,2),e.credit_amount::numeric(18,2)
    from public.sea_vibe_treasury_vouchers v
    join public.sea_vibe_treasury_voucher_entries e on e.voucher_id=v.id
    where e.account_id in (select id from account_scope)

    union all
    -- Operational expense NET debit.
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
    where e.tax_amount>0 and v_vat_account_id in (select id from account_scope)

    union all
    -- Gross credit to the selected payment/source account; historical nulls keep legacy fallback.
    select e.expense_date,e.created_at,'expense'::text,e.id,
      coalesce(nullif(e.movement_serial,''),nullif(t.treasury_movement_serial,''),'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))),
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),''),
      coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف')||case when nullif(btrim(coalesce(e.notes,'')),'') is null then '' else ' — '||btrim(e.notes) end,
      coalesce(e.payment_account_id,case when e.system_key='fuel_cost' then v_fuel_balance_id when e.system_key='sailing_permit' then v_zawel_balance_id else v_treasury_id end),
      3,0::numeric(18,2),e.amount_inclusive::numeric(18,2)
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where e.amount_inclusive>0
      and coalesce(e.payment_account_id,case when e.system_key='fuel_cost' then v_fuel_balance_id when e.system_key='sailing_permit' then v_zawel_balance_id else v_treasury_id end) in (select id from account_scope)

    union all
    select t.trip_date,t.created_at,'trip_revenue'::text,t.id,
      coalesce(nullif(t.treasury_movement_serial,''),t.trip_serial),t.trip_serial,
      coalesce(nullif(tt.name_ar,''),nullif(tt.name_en,''),'إيراد رحلة'),
      v_treasury_id,1,t.total_value::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_trips t
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where t.total_value>0 and v_treasury_id in (select id from account_scope)

    union all
    select t.trip_date,t.created_at,'trip_revenue'::text,t.id,
      coalesce(nullif(t.treasury_movement_serial,''),t.trip_serial),t.trip_serial,
      coalesce(nullif(tt.name_ar,''),nullif(tt.name_en,''),'إيراد رحلة'),
      t.revenue_account_id,2,0::numeric(18,2),t.total_value::numeric(18,2)
    from public.sea_vibe_trips t
    left join public.sea_vibe_trip_types tt on tt.id=t.trip_type_id
    where t.total_value>0 and t.revenue_account_id in (select id from account_scope)

    union all
    select f.transaction_date,f.created_at,'fuel_topup'::text,f.id,
      coalesce(nullif(f.treasury_movement_serial,''),nullif(f.reference,''),'FUEL-'||upper(substr(replace(f.id::text,'-',''),1,10))),
      coalesce(f.reference,''),coalesce(nullif(f.notes,''),'شحن رصيد البنزين'),
      v_fuel_balance_id,1,f.value_delta::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_fuel_transactions f
    where f.transaction_type='topup' and f.value_delta>0 and v_fuel_balance_id in (select id from account_scope)

    union all
    select f.transaction_date,f.created_at,'fuel_topup'::text,f.id,
      coalesce(nullif(f.treasury_movement_serial,''),nullif(f.reference,''),'FUEL-'||upper(substr(replace(f.id::text,'-',''),1,10))),
      coalesce(f.reference,''),coalesce(nullif(f.notes,''),'شحن رصيد البنزين'),
      v_treasury_id,2,0::numeric(18,2),f.value_delta::numeric(18,2)
    from public.sea_vibe_fuel_transactions f
    where f.transaction_type='topup' and f.value_delta>0 and v_treasury_id in (select id from account_scope)

    union all
    select z.transaction_date,z.created_at,'zawel_topup'::text,z.id,
      coalesce(nullif(z.treasury_movement_serial,''),nullif(z.reference,''),'ZAW-'||upper(substr(replace(z.id::text,'-',''),1,10))),
      coalesce(z.reference,''),coalesce(nullif(z.notes,''),'شحن رصيد زاول'),
      v_zawel_balance_id,1,z.cash_amount::numeric(18,2),0::numeric(18,2)
    from public.sea_vibe_zawel_transactions z
    where z.transaction_type='topup' and z.cash_amount>0 and v_zawel_balance_id in (select id from account_scope)

    union all
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

-- ---------------------------------------------------------------------------
-- F. Localization keys for the upcoming frontend gate
-- ---------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('seaVibe.expense.tax','seaVibeExpenseNew','seaVibe','label','الضريبة','Tax','الضريبة','Tax',true,now()),
  ('seaVibe.expense.taxNone','seaVibeExpenseNew','seaVibe','option','بدون ضريبة','No Tax','بدون ضريبة','No Tax',true,now()),
  ('seaVibe.expense.taxVat15','seaVibeExpenseNew','seaVibe','option','ضريبة قيمة مضافة 15%','VAT 15%','ضريبة قيمة مضافة 15%','VAT 15%',true,now()),
  ('seaVibe.expense.taxInclusiveHint','seaVibeExpenseNew','seaVibe','help','القيمة المدخلة شاملة الضريبة؛ 115 = 100 صافي + 15 ضريبة.','Entered amount is tax-inclusive; 115 = 100 net + 15 VAT.','القيمة المدخلة شاملة الضريبة؛ 115 = 100 صافي + 15 ضريبة.','Entered amount is tax-inclusive; 115 = 100 net + 15 VAT.',true,now()),
  ('seaVibe.expense.paymentAccount','seaVibeExpenseNew','seaVibe','label','مصدر الدفع','Payment Source','مصدر الدفع','Payment Source',true,now()),
  ('seaVibe.expense.paymentAccountDefaultTreasury','seaVibeExpenseNew','seaVibe','help','الافتراضي خزينة SEA VIBE (1101).','Defaults to SEA VIBE Treasury (1101).','الافتراضي خزينة SEA VIBE (1101).','Defaults to SEA VIBE Treasury (1101).',true,now()),
  ('pwa.update.release.r44r38r17.title','systemSettings','pwa','title','ضريبة مصروف الأصل ومصدر الدفع — R44R38R17','Asset Expense VAT & Payment Source — R44R38R17','ضريبة مصروف الأصل ومصدر الدفع — R44R38R17','Asset Expense VAT & Payment Source — R44R38R17',true,now()),
  ('pwa.update.release.r44r38r17.note1','systemSettings','pwa','note','إضافة VAT 15% أو بدون ضريبة لكل بند مصروف أصل مع اعتبار القيمة المدخلة شاملة الضريبة.','Adds VAT 15% or no-tax selection per asset-expense line using tax-inclusive entered amounts.','إضافة VAT 15% أو بدون ضريبة لكل بند مصروف أصل مع اعتبار القيمة المدخلة شاملة الضريبة.','Adds VAT 15% or no-tax selection per asset-expense line using tax-inclusive entered amounts.',true,now()),
  ('pwa.update.release.r44r38r17.note2','systemSettings','pwa','note','إضافة مصدر دفع لكل مصروف، والافتراضي خزينة SEA VIBE 1101 مع إمكانية اختيار حساب ميزانية آخر.','Adds a payment-source account per expense, defaulting to SEA VIBE Treasury 1101 with another balance-sheet account selectable when needed.','إضافة مصدر دفع لكل مصروف، والافتراضي خزينة SEA VIBE 1101 مع إمكانية اختيار حساب ميزانية آخر.','Adds a payment-source account per expense, defaulting to SEA VIBE Treasury 1101 with another balance-sheet account selectable when needed.',true,now()),
  ('pwa.update.release.r44r38r17.note3','systemSettings','pwa','note','يبقى صافي المصروف فقط في الربحية وقيمة الأصل، وتذهب الضريبة إلى 2101 بينما يخرج الإجمالي من مصدر الدفع المحدد.','Keeps only net expense in profitability and asset value, posts VAT to 2101, and credits the selected payment source with the gross amount.','يبقى صافي المصروف فقط في الربحية وقيمة الأصل، وتذهب الضريبة إلى 2101 بينما يخرج الإجمالي من مصدر الدفع المحدد.','Keeps only net expense in profitability and asset value, posts VAT to 2101, and credits the selected payment source with the gross amount.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' then excluded.ar_text else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' then excluded.en_text else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

commit;

-- ---------------------------------------------------------------------------
-- Production verification gate
-- ---------------------------------------------------------------------------
select
  'R44R38R17_ASSET_EXPENSE_VAT_PAYMENT_SOURCE_OK'::text as status,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_expenses' and column_name in ('amount_inclusive','tax_code','tax_amount','payment_account_id')) as financial_columns,
  (select count(*)::integer from pg_constraint where conrelid='public.sea_vibe_expenses'::regclass and conname in ('sea_vibe_expenses_tax_code_check','sea_vibe_expenses_tax_amount_check','sea_vibe_expenses_amount_inclusive_check','sea_vibe_expenses_tax_math_check','sea_vibe_expenses_payment_account_fk')) as financial_constraints,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code='1101' and root_class=1 and allow_posting=true and is_active=true) as default_treasury_1101,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code='2101' and allow_posting=true and is_active=true) as vat_account_2101,
  (select case when pg_get_functiondef(p.oid) ilike '%v_net:=round(v_inclusive/1.15,2)%' and pg_get_functiondef(p.oid) ilike '%v_tax:=round(v_inclusive-v_net,2)%' and pg_get_functiondef(p.oid) ilike '%account_code=case%''1101''%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_snapshot_expense_account_r44r11' limit 1) as inclusive_vat_and_default_payment,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name='sea_vibe_update_asset_expense_batch_r44r38r17') as asset_update_rpc,
  (select case when pg_get_functiondef(p.oid) ilike '%tax_code%' and pg_get_functiondef(p.oid) ilike '%payment_account_id%' and pg_get_functiondef(p.oid) ilike '%amount_inclusive%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_add_expense_batch' limit 1) as create_path_financials,
  (select case when pg_get_functiondef(p.oid) ilike '%e.tax_amount%' and pg_get_functiondef(p.oid) ilike '%e.payment_account_id%' and pg_get_functiondef(p.oid) ilike '%e.amount_inclusive%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as statement_vat_payment_link,
  (select case when pg_get_viewdef('public.sea_vibe_treasury_movements'::regclass,true) ilike '%amount_inclusive%' and pg_get_viewdef('public.sea_vibe_treasury_movements'::regclass,true) ilike '%payment_account_id%' and pg_get_viewdef('public.sea_vibe_treasury_movements'::regclass,true) ilike '%1101%' then 1 else 0 end::integer) as treasury_payment_source_aware,
  (select count(*)::integer from public.sea_vibe_expenses where round(amount+tax_amount,2)<>round(amount_inclusive,2)) as invalid_financial_math_rows,
  (select count(*)::integer from public.app_translations where translation_key in ('seaVibe.expense.tax','seaVibe.expense.paymentAccount','seaVibe.expense.taxInclusiveHint','pwa.update.release.r44r38r17.title')) as translation_rows;
