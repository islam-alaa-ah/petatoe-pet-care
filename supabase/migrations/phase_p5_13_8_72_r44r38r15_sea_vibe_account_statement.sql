-- PETATOE P5.13.8.72 R44R38R15 — SEA VIBE Account Statement
-- Scope:
--   1) Register a new read-only SEA VIBE screen: seaVibeAccountStatement.
--   2) Provide a permission-gated account picker from the canonical chart of accounts.
--   3) Provide an authoritative account statement RPC over posted manual journals + treasury vouchers.
--   4) Support parent-account statements by recursively including descendants.
--   5) Calculate opening balance before From Date and running/closing balance through To Date.
-- Safety:
--   No historical migration edits. No table/data deletion. No RLS widening.
--   No Offline/Sync changes. No journal/voucher write-path changes. No R44 pruning changes.
--   Draft manual journals are explicitly excluded from financial balances.

begin;

-- ---------------------------------------------------------------------------
-- 1) Screen registry + least-privilege default permission
-- ---------------------------------------------------------------------------
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values('seaVibeAccountStatement','SEA VIBE - كشف حساب','SEA VIBE',161,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

update public.app_screens
set display_order=162
where screen_key='seaVibeReports' and display_order<=161;

insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export
)
values(
  'super_admin'::public.app_role,'seaVibeAccountStatement',true,false,false,false,false
)
on conflict(role,screen_key) do update set
  can_view=true,
  can_add=false,
  can_edit=false,
  can_delete=false,
  can_export=false,
  updated_at=now();

-- ---------------------------------------------------------------------------
-- 2) Permission-gated account picker
--    Returns all chart accounts, including inactive accounts, so historical
--    statements remain accessible after an account is deactivated.
-- ---------------------------------------------------------------------------
create or replace function public.sea_vibe_account_statement_accounts_r44r38r15()
returns table(
  id uuid,
  account_code text,
  name_ar text,
  name_en text,
  parent_id uuid,
  root_class smallint,
  allow_posting boolean,
  is_active boolean,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.has_screen_permission('seaVibeAccountStatement','view') then
    raise exception 'permission_denied';
  end if;

  return query
  select
    a.id,a.account_code,a.name_ar,a.name_en,a.parent_id,a.root_class,
    a.allow_posting,a.is_active,a.sort_order
  from public.sea_vibe_chart_accounts a
  order by a.root_class,a.sort_order,a.account_code;
end;
$$;

revoke all on function public.sea_vibe_account_statement_accounts_r44r38r15() from public,anon;
grant execute on function public.sea_vibe_account_statement_accounts_r44r38r15() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Authoritative account statement
--    Sources deliberately limited to accounting postings with explicit debit/
--    credit lines:
--      A) POSTED manual journals only.
--      B) Treasury voucher entries (receipt/payment vouchers).
--    Operational expense/trip rows are not inferred into a ledger here because
--    the current architecture does not hold a complete double-entry counterpart
--    for every operational movement.
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
    select
      j.journal_date as movement_date,
      coalesce(j.posted_at,j.created_at) as sort_at,
      'journal'::text as source_kind,
      j.id as source_id,
      j.journal_no as document_no,
      ''::text as reference,
      coalesce(nullif(l.description,''),nullif(j.description,''),'') as description,
      l.account_id,
      l.line_no,
      l.debit::numeric(18,2) as debit,
      l.credit::numeric(18,2) as credit
    from public.sea_vibe_journal_entries j
    join public.sea_vibe_journal_entry_lines l on l.journal_entry_id=j.id
    where j.status='posted'
      and l.is_active=true
      and l.account_id in (select id from account_scope)

    union all

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

revoke all on function public.sea_vibe_account_statement_r44r38r15(uuid,date,date) from public,anon;
grant execute on function public.sea_vibe_account_statement_r44r38r15(uuid,date,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Central localization rows (no parallel dictionary)
-- ---------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('sidebar.seaVibeAccountStatement','seaVibeAccountStatement','seaVibe','navigation','كشف حساب','Account Statement','كشف حساب','Account Statement',true,now()),
  ('seaVibe.page.accountStatement.title','seaVibeAccountStatement','seaVibe','title','SEA VIBE — كشف حساب','SEA VIBE — Account Statement','SEA VIBE — كشف حساب','SEA VIBE — Account Statement',true,now()),
  ('seaVibe.page.accountStatement.subtitle','seaVibeAccountStatement','seaVibe','subtitle','استعراض حركة ورصيد أي حساب محاسبي خلال فترة محددة.','Review movements and balances for any accounting account over a selected period.','استعراض حركة ورصيد أي حساب محاسبي خلال فترة محددة.','Review movements and balances for any accounting account over a selected period.',true,now()),
  ('seaVibe.accountStatement.account','seaVibeAccountStatement','seaVibe','label','الحساب','Account','الحساب','Account',true,now()),
  ('seaVibe.accountStatement.searchAccount','seaVibeAccountStatement','seaVibe','placeholder','ابحث بالكود أو اسم الحساب...','Search by account code or name...','ابحث بالكود أو اسم الحساب...','Search by account code or name...',true,now()),
  ('seaVibe.accountStatement.fromDate','seaVibeAccountStatement','seaVibe','label','من تاريخ','From Date','من تاريخ','From Date',true,now()),
  ('seaVibe.accountStatement.toDate','seaVibeAccountStatement','seaVibe','label','إلى تاريخ','To Date','إلى تاريخ','To Date',true,now()),
  ('seaVibe.accountStatement.show','seaVibeAccountStatement','seaVibe','button','عرض كشف الحساب','Show Statement','عرض كشف الحساب','Show Statement',true,now()),
  ('seaVibe.accountStatement.openingBalance','seaVibeAccountStatement','seaVibe','label','الرصيد الافتتاحي','Opening Balance','الرصيد الافتتاحي','Opening Balance',true,now()),
  ('seaVibe.accountStatement.totalDebit','seaVibeAccountStatement','seaVibe','label','إجمالي المدين','Total Debit','إجمالي المدين','Total Debit',true,now()),
  ('seaVibe.accountStatement.totalCredit','seaVibeAccountStatement','seaVibe','label','إجمالي الدائن','Total Credit','إجمالي الدائن','Total Credit',true,now()),
  ('seaVibe.accountStatement.closingBalance','seaVibeAccountStatement','seaVibe','label','الرصيد الختامي','Closing Balance','الرصيد الختامي','Closing Balance',true,now()),
  ('seaVibe.accountStatement.date','seaVibeAccountStatement','seaVibe','table','التاريخ','Date','التاريخ','Date',true,now()),
  ('seaVibe.accountStatement.documentNo','seaVibeAccountStatement','seaVibe','table','رقم المستند','Document No.','رقم المستند','Document No.',true,now()),
  ('seaVibe.accountStatement.source','seaVibeAccountStatement','seaVibe','table','نوع الحركة','Source','نوع الحركة','Source',true,now()),
  ('seaVibe.accountStatement.lineAccount','seaVibeAccountStatement','seaVibe','table','الحساب الفرعي','Line Account','الحساب الفرعي','Line Account',true,now()),
  ('seaVibe.accountStatement.description','seaVibeAccountStatement','seaVibe','table','البيان','Description','البيان','Description',true,now()),
  ('seaVibe.accountStatement.reference','seaVibeAccountStatement','seaVibe','table','المرجع','Reference','المرجع','Reference',true,now()),
  ('seaVibe.accountStatement.debit','seaVibeAccountStatement','seaVibe','table','مدين','Debit','مدين','Debit',true,now()),
  ('seaVibe.accountStatement.credit','seaVibeAccountStatement','seaVibe','table','دائن','Credit','دائن','Credit',true,now()),
  ('seaVibe.accountStatement.runningBalance','seaVibeAccountStatement','seaVibe','table','الرصيد','Balance','الرصيد','Balance',true,now()),
  ('seaVibe.accountStatement.sourceJournal','seaVibeAccountStatement','seaVibe','status','قيد يومية','Journal Entry','قيد يومية','Journal Entry',true,now()),
  ('seaVibe.accountStatement.sourceReceipt','seaVibeAccountStatement','seaVibe','status','سند قبض','Receipt Voucher','سند قبض','Receipt Voucher',true,now()),
  ('seaVibe.accountStatement.sourcePayment','seaVibeAccountStatement','seaVibe','status','سند صرف','Payment Voucher','سند صرف','Payment Voucher',true,now()),
  ('seaVibe.accountStatement.empty','seaVibeAccountStatement','seaVibe','empty','لا توجد حركات على الحساب خلال الفترة المحددة.','No account movements were found in the selected period.','لا توجد حركات على الحساب خلال الفترة المحددة.','No account movements were found in the selected period.',true,now()),
  ('seaVibe.accountStatement.selectAccount','seaVibeAccountStatement','seaVibe','error','اختر الحساب المطلوب أولًا.','Select an account first.','اختر الحساب المطلوب أولًا.','Select an account first.',true,now()),
  ('seaVibe.accountStatement.invalidRange','seaVibeAccountStatement','seaVibe','error','تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.','From Date cannot be after To Date.','تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.','From Date cannot be after To Date.',true,now()),
  ('seaVibe.accountStatement.loadFailed','seaVibeAccountStatement','seaVibe','error','تعذر تحميل كشف الحساب.','Unable to load the account statement.','تعذر تحميل كشف الحساب.','Unable to load the account statement.',true,now())
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
  'R44R38R15_SEA_VIBE_ACCOUNT_STATEMENT_OK'::text as status,
  (select count(*)::integer from public.app_screens where screen_key='seaVibeAccountStatement' and is_active=true) as screen_registered,
  (select count(*)::integer from public.role_screen_permissions where role='super_admin'::public.app_role and screen_key='seaVibeAccountStatement' and can_view=true) as super_admin_view,
  (select count(*)::integer from public.role_screen_permissions where screen_key='seaVibeAccountStatement' and (can_add=true or can_edit=true or can_delete=true or can_export=true)) as unsafe_default_actions,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name='sea_vibe_account_statement_accounts_r44r38r15') as account_picker_rpc,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name='sea_vibe_account_statement_r44r38r15') as statement_rpc,
  (select case when pg_get_functiondef(p.oid) ilike '%j.status=''posted''%' and pg_get_functiondef(p.oid) ilike '%sea_vibe_journal_entry_lines%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as posted_journal_source,
  (select case when pg_get_functiondef(p.oid) ilike '%sea_vibe_treasury_voucher_entries%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as voucher_source,
  (select case when pg_get_functiondef(p.oid) not ilike '%status=''draft''%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_account_statement_r44r38r15' limit 1) as draft_excluded,
  (select count(*)::integer from public.app_translations where translation_key like 'seaVibe.accountStatement.%' or translation_key in ('sidebar.seaVibeAccountStatement','seaVibe.page.accountStatement.title','seaVibe.page.accountStatement.subtitle')) as translation_rows;
