-- PETATOE P5.13.8.72 R44R38R15R1 — SEA VIBE Account Statement Expense Link Recovery
-- Root cause:
--   R44R38R15 statement ledger reads posted manual journals + treasury voucher entries only.
--   Existing SEA VIBE expenses already carry a canonical account_id snapshot, including
--   sailing-permit expenses mapped to account 5103, but those rows were not surfaced.
-- Scope:
--   1) Replace only the account-statement read RPC (same signature/response contract).
--   2) Add sea_vibe_expenses as debit-side account movements using the persisted account_id snapshot.
--   3) Keep posted journals and treasury vouchers unchanged.
--   4) Add one centralized localization key for the new statement source label.
-- Safety:
--   No table/schema changes. No data backfill. No DELETE/DROP/TRUNCATE.
--   No RLS/permission changes. No write-path changes. No Offline/Sync/pruning changes.

begin;

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
  if not public.has_screen_permission('seaVibeAccountStatement','view') then
    raise exception 'permission_denied';
  end if;

  if p_account_id is null then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_ACCOUNT_REQUIRED'; end if;
  if p_from_date is null or p_to_date is null then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_DATE_REQUIRED'; end if;
  if p_from_date>p_to_date then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_DATE_RANGE_INVALID'; end if;

  select * into v_account
  from public.sea_vibe_chart_accounts
  where id=p_account_id;
  if not found then raise exception 'SEA_VIBE_ACCOUNT_STATEMENT_ACCOUNT_NOT_FOUND'; end if;

  v_normal_side:=case when v_account.root_class in (1,5) then 'debit' else 'credit' end;

  with recursive account_scope as (
    select a.id
    from public.sea_vibe_chart_accounts a
    where a.id=p_account_id
    union all
    select child.id
    from public.sea_vibe_chart_accounts child
    join account_scope parent on child.parent_id=parent.id
  ),
  ledger as (
    -- A) Posted manual-journal accounting lines.
    select
      j.journal_date as movement_date,
      coalesce(j.posted_at,j.created_at) as sort_at,
      'journal'::text as source_kind,
      j.id as source_id,
      j.journal_no as document_no,
      ''::text as reference,
      coalesce(nullif(l.description,''),nullif(j.description,''),'') as description,
      l.account_id,
      l.line_no::integer as line_no,
      l.debit::numeric(18,2) as debit,
      l.credit::numeric(18,2) as credit
    from public.sea_vibe_journal_entries j
    join public.sea_vibe_journal_entry_lines l on l.journal_entry_id=j.id
    where j.status='posted'
      and l.is_active=true
      and l.account_id in (select id from account_scope)

    union all

    -- B) Receipt/payment voucher accounting lines.
    select
      v.voucher_date as movement_date,
      v.created_at as sort_at,
      case when v.voucher_type='receipt' then 'receipt_voucher' else 'payment_voucher' end::text as source_kind,
      v.id as source_id,
      v.voucher_no as document_no,
      coalesce(v.reference,'') as reference,
      coalesce(v.description,'') as description,
      e.account_id,
      e.line_no::integer as line_no,
      e.debit_amount::numeric(18,2) as debit,
      e.credit_amount::numeric(18,2) as credit
    from public.sea_vibe_treasury_vouchers v
    join public.sea_vibe_treasury_voucher_entries e on e.voucher_id=v.id
    where e.account_id in (select id from account_scope)

    union all

    -- C) Operational expense movements.
    -- account_id is an immutable-at-transaction snapshot assigned from the expense
    -- catalog by trg_sea_vibe_snapshot_expense_account_r44r11. Expenses are debit
    -- movements on their mapped root-class-5 posting account. No treasury/cash
    -- counterpart is inferred here because this recovery only fixes the already
    -- explicit expense-account side.
    select
      e.expense_date as movement_date,
      e.created_at as sort_at,
      'expense'::text as source_kind,
      e.id as source_id,
      coalesce(
        nullif(e.movement_serial,''),
        nullif(t.treasury_movement_serial,''),
        'EXP-'||upper(substr(replace(e.id::text,'-',''),1,10))
      ) as document_no,
      coalesce(nullif(t.trip_serial,''),nullif(a.asset_code,''),'') as reference,
      coalesce(nullif(c.name_ar,''),nullif(c.name_en,''),'مصروف')
        ||case when nullif(btrim(coalesce(e.notes,'')),'') is null then '' else ' — '||btrim(e.notes) end as description,
      e.account_id,
      1::integer as line_no,
      e.amount::numeric(18,2) as debit,
      0::numeric(18,2) as credit
    from public.sea_vibe_expenses e
    left join public.sea_vibe_expense_catalog c on c.id=e.expense_catalog_id
    left join public.sea_vibe_trips t on t.id=e.trip_id
    left join public.sea_vibe_assets a on a.id=e.asset_id
    where e.account_id in (select id from account_scope)
      and e.amount>0
  ),
  opening as (
    select
      coalesce(sum(debit),0)::numeric(18,2) as debit,
      coalesce(sum(credit),0)::numeric(18,2) as credit
    from ledger
    where movement_date<p_from_date
  ),
  period as (
    select l.*,
      a.account_code as line_account_code,
      a.name_ar as line_account_name_ar,
      a.name_en as line_account_name_en
    from ledger l
    join public.sea_vibe_chart_accounts a on a.id=l.account_id
    where l.movement_date between p_from_date and p_to_date
  ),
  totals as (
    select
      coalesce(sum(debit),0)::numeric(18,2) as debit,
      coalesce(sum(credit),0)::numeric(18,2) as credit
    from period
  ),
  ordered as (
    select
      p.*,
      row_number() over(order by p.movement_date,p.sort_at,p.source_kind,p.document_no,p.line_no,p.source_id) as row_no,
      sum(case when v_normal_side='debit' then p.debit-p.credit else p.credit-p.debit end)
        over(order by p.movement_date,p.sort_at,p.source_kind,p.document_no,p.line_no,p.source_id rows between unbounded preceding and current row)::numeric(18,2) as period_running_delta
    from period p
  )
  select
    case when v_normal_side='debit' then o.debit-o.credit else o.credit-o.debit end,
    t.debit,
    t.credit,
    case when v_normal_side='debit' then (o.debit-o.credit)+(t.debit-t.credit) else (o.credit-o.debit)+(t.credit-t.debit) end,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rowNo',x.row_no,
          'date',x.movement_date,
          'sourceKind',x.source_kind,
          'sourceId',x.source_id,
          'documentNo',x.document_no,
          'reference',x.reference,
          'description',x.description,
          'accountId',x.account_id,
          'accountCode',x.line_account_code,
          'accountNameAr',x.line_account_name_ar,
          'accountNameEn',x.line_account_name_en,
          'debit',x.debit,
          'credit',x.credit,
          'runningBalance',
            (case when v_normal_side='debit' then o.debit-o.credit else o.credit-o.debit end)+x.period_running_delta
        ) order by x.row_no
      ) filter(where x.row_no is not null),
      '[]'::jsonb
    )
  into v_opening,v_period_debit,v_period_credit,v_closing,v_rows
  from opening o
  cross join totals t
  left join ordered x on true
  group by o.debit,o.credit,t.debit,t.credit;

  return jsonb_build_object(
    'account',jsonb_build_object(
      'id',v_account.id,
      'code',v_account.account_code,
      'nameAr',v_account.name_ar,
      'nameEn',v_account.name_en,
      'rootClass',v_account.root_class,
      'allowPosting',v_account.allow_posting,
      'isActive',v_account.is_active,
      'normalSide',v_normal_side
    ),
    'fromDate',p_from_date,
    'toDate',p_to_date,
    'openingBalance',coalesce(v_opening,0),
    'periodDebit',coalesce(v_period_debit,0),
    'periodCredit',coalesce(v_period_credit,0),
    'closingBalance',coalesce(v_closing,0),
    'rows',coalesce(v_rows,'[]'::jsonb)
  );
end;
$$;

-- Preserve the exact R15 execution boundary; no permission widening.
revoke all on function public.sea_vibe_account_statement_r44r38r15(uuid,date,date) from public,anon;
grant execute on function public.sea_vibe_account_statement_r44r38r15(uuid,date,date) to authenticated;

-- Central localization only; the frontend mapping is applied after the DB gate.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values(
  'seaVibe.accountStatement.sourceExpense',
  'seaVibeAccountStatement','seaVibe','status',
  'مصروف','Expense','مصروف','Expense',true,now()
)
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

-- Production verification gate.
select
  'R44R38R15R1_ACCOUNT_STATEMENT_EXPENSE_LINK_OK'::text as status,
  (select case when pg_get_functiondef(p.oid) ilike '%from public.sea_vibe_expenses e%'
                    and pg_get_functiondef(p.oid) ilike '%e.account_id in (select id from account_scope)%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as expense_source,
  (select case when pg_get_functiondef(p.oid) ilike '%j.status=''posted''%'
                    and pg_get_functiondef(p.oid) ilike '%sea_vibe_journal_entry_lines%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as posted_journal_source,
  (select case when pg_get_functiondef(p.oid) ilike '%sea_vibe_treasury_voucher_entries%'
               then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as voucher_source,
  (select count(*)::integer
   from information_schema.columns
   where table_schema='public' and table_name='sea_vibe_expenses' and column_name='account_id') as expense_account_snapshot_column,
  (select count(*)::integer
   from pg_trigger tg
   join pg_class c on c.oid=tg.tgrelid
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='sea_vibe_expenses'
     and tg.tgname='trg_sea_vibe_snapshot_expense_account_r44r11'
     and not tg.tgisinternal) as expense_snapshot_trigger,
  (select count(*)::integer
   from public.sea_vibe_expense_catalog c
   join public.sea_vibe_chart_accounts a on a.id=c.account_id
   where c.system_key='sailing_permit' and a.account_code='5103') as sailing_permit_catalog_5103,
  (select count(*)::integer
   from public.sea_vibe_expenses e
   join public.sea_vibe_chart_accounts a on a.id=e.account_id
   where a.account_code='5103' and e.amount>0) as account_5103_expense_rows,
  (select coalesce(sum(e.amount),0)::numeric(18,2)
   from public.sea_vibe_expenses e
   join public.sea_vibe_chart_accounts a on a.id=e.account_id
   where a.account_code='5103' and e.amount>0) as account_5103_expense_total,
  (select count(*)::integer from public.sea_vibe_expenses where amount>0 and account_id is null) as unmapped_expense_rows,
  (select count(*)::integer from public.app_translations where translation_key='seaVibe.accountStatement.sourceExpense' and ar_text is not null and en_text is not null) as source_translation;
