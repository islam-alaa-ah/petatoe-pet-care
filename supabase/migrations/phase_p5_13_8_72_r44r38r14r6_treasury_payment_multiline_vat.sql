-- PETATOE P5.13.8.72 R44R38R14R6 — SEA VIBE Treasury Payment Multi-Line VAT
-- Scope:
--   1) Allow multiple expense lines inside one payment voucher.
--   2) Allow VAT 15% or no tax independently per expense line.
--   3) Treat each payment-line amount as tax-inclusive (115 = 100 expense + 15 VAT).
-- Safety:
--   No historical migration edits, no destructive data cleanup, no RLS widening,
--   no Offline/Sync changes, no permission model changes, no pruning changes.

begin;

create table if not exists public.sea_vibe_treasury_voucher_payment_lines (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.sea_vibe_treasury_vouchers(id) on delete restrict,
  line_no smallint not null check (line_no > 0),
  expense_account_id uuid not null references public.sea_vibe_chart_accounts(id) on delete restrict,
  amount_inclusive numeric(14,2) not null check (amount_inclusive > 0),
  tax_code text not null default 'none' check (tax_code in ('none','vat15')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(voucher_id,line_no)
);
create index if not exists idx_sea_vibe_treasury_voucher_payment_lines_voucher on public.sea_vibe_treasury_voucher_payment_lines(voucher_id,line_no);
create index if not exists idx_sea_vibe_treasury_voucher_payment_lines_account on public.sea_vibe_treasury_voucher_payment_lines(expense_account_id,voucher_id);

alter table public.sea_vibe_treasury_voucher_payment_lines enable row level security;
alter table public.sea_vibe_treasury_voucher_entries drop constraint if exists sea_vibe_treasury_voucher_entries_line_no_check;
alter table public.sea_vibe_treasury_voucher_entries add constraint sea_vibe_treasury_voucher_entries_line_no_check check (line_no > 0);

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_treasury_voucher_payment_lines' and policyname='sea vibe treasury voucher payment lines read') then
    create policy "sea vibe treasury voucher payment lines read" on public.sea_vibe_treasury_voucher_payment_lines
    for select to authenticated using(public.has_screen_permission('seaVibeTreasury','view'));
  end if;
end $$;

revoke all on public.sea_vibe_treasury_voucher_payment_lines from public,anon;
grant select on public.sea_vibe_treasury_voucher_payment_lines to authenticated;

create or replace function public.sea_vibe_save_treasury_voucher_r44r38r14r6(
  p_id uuid default null,
  p_voucher_type text default 'receipt',
  p_voucher_date date default current_date,
  p_counterpart_account_id uuid default null,
  p_amount numeric default null,
  p_reference text default null,
  p_description text default null,
  p_notes text default null,
  p_payment_lines jsonb default '[]'::jsonb
)
returns table(id uuid,voucher_no text,voucher_type text,voucher_date date,treasury_account_id uuid,counterpart_account_id uuid,amount numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_kind text:=lower(btrim(coalesce(p_voucher_type,'')));
  v_id uuid;
  v_no text;
  v_existing public.sea_vibe_treasury_vouchers%rowtype;
  v_treasury_account public.sea_vibe_chart_accounts%rowtype;
  v_vat_account public.sea_vibe_chart_accounts%rowtype;
  v_account public.sea_vibe_chart_accounts%rowtype;
  v_user_id uuid:=auth.uid();
  v_line jsonb;
  v_normalized_lines jsonb:='[]'::jsonb;
  v_valid_lines integer:=0;
  v_line_no integer:=0;
  v_entry_line_no integer:=0;
  v_header_amount numeric(14,2):=0;
  v_amount_inclusive numeric(14,2);
  v_tax_code text;
  v_net_amount numeric(14,2);
  v_tax_amount numeric(14,2);
  v_line_account_id uuid;
  v_first_account_id uuid;
begin
  if p_id is null then
    if not public.has_screen_permission('seaVibeTreasury','add') then raise exception 'permission_denied'; end if;
  else
    if not public.has_screen_permission('seaVibeTreasury','edit') then raise exception 'permission_denied'; end if;
    select * into v_existing from public.sea_vibe_treasury_vouchers where sea_vibe_treasury_vouchers.id=p_id for update;
    if not found then raise exception 'SEA_VIBE_VOUCHER_NOT_FOUND'; end if;
  end if;

  if v_kind not in ('receipt','payment') then raise exception 'SEA_VIBE_VOUCHER_TYPE_INVALID'; end if;
  if p_voucher_date is null then raise exception 'SEA_VIBE_VOUCHER_DATE_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'SEA_VIBE_VOUCHER_DESCRIPTION_REQUIRED'; end if;

  select * into v_treasury_account
  from public.sea_vibe_chart_accounts
  where account_code='1101' and is_active=true and allow_posting=true
  order by created_at asc
  limit 1;
  if not found then raise exception 'SEA_VIBE_TREASURY_ACCOUNT_MISSING'; end if;

  select * into v_vat_account
  from public.sea_vibe_chart_accounts
  where account_code='2101' and is_active=true and allow_posting=true
  order by created_at asc
  limit 1;

  if v_kind='receipt' then
    if p_counterpart_account_id is null then raise exception 'SEA_VIBE_VOUCHER_COUNTERPART_REQUIRED'; end if;
    if coalesce(p_amount,0)<=0 then raise exception 'SEA_VIBE_VOUCHER_AMOUNT_REQUIRED'; end if;

    select * into v_account from public.sea_vibe_chart_accounts where id=p_counterpart_account_id;
    if not found or v_account.is_active is distinct from true or v_account.allow_posting is distinct from true then
      raise exception 'SEA_VIBE_ACCOUNT_POSTING_REQUIRED';
    end if;
    if v_account.id=v_treasury_account.id then raise exception 'SEA_VIBE_VOUCHER_COUNTERPART_TREASURY_NOT_ALLOWED'; end if;

    if p_id is null then
      v_no:=public.sea_vibe_next_treasury_voucher_no_r44r13(v_kind,p_voucher_date);
      insert into public.sea_vibe_treasury_vouchers(
        voucher_no,voucher_type,voucher_date,treasury_account_id,counterpart_account_id,amount,reference,description,notes,created_by,updated_by
      ) values(
        v_no,v_kind,p_voucher_date,v_treasury_account.id,v_account.id,round(p_amount,2),nullif(btrim(coalesce(p_reference,'')),''),btrim(p_description),nullif(btrim(coalesce(p_notes,'')),''),v_user_id,v_user_id
      ) returning id into v_id;
    else
      v_id:=v_existing.id;
      v_no:=v_existing.voucher_no;
      update public.sea_vibe_treasury_vouchers
      set voucher_date=p_voucher_date,
          treasury_account_id=v_treasury_account.id,
          counterpart_account_id=v_account.id,
          amount=round(p_amount,2),
          reference=nullif(btrim(coalesce(p_reference,'')),''),
          description=btrim(p_description),
          notes=nullif(btrim(coalesce(p_notes,'')),''),
          updated_by=v_user_id,
          updated_at=now()
      where id=v_id;
      delete from public.sea_vibe_treasury_voucher_payment_lines where voucher_id=v_id;
      delete from public.sea_vibe_treasury_voucher_entries where voucher_id=v_id;
    end if;

    insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount)
    values
      (v_id,1,v_treasury_account.id,round(p_amount,2),0),
      (v_id,2,v_account.id,0,round(p_amount,2));

    return query
    select v.id,v.voucher_no,v.voucher_type,v.voucher_date,v.treasury_account_id,v.counterpart_account_id,v.amount
    from public.sea_vibe_treasury_vouchers v
    where v.id=v_id;
    return;
  end if;

  if p_payment_lines is null or jsonb_typeof(p_payment_lines)<>'array' then
    p_payment_lines:='[]'::jsonb;
  end if;

  for v_line in select value from jsonb_array_elements(p_payment_lines)
  loop
    v_line_account_id:=nullif(v_line->>'accountId','')::uuid;
    v_amount_inclusive:=round(greatest(coalesce(nullif(v_line->>'amountInclusive','')::numeric,0),0),2);
    v_tax_code:=case when lower(coalesce(v_line->>'taxCode','none'))='vat15' then 'vat15' else 'none' end;
    if v_line_account_id is null and v_amount_inclusive=0 then continue; end if;
    if v_line_account_id is null or v_amount_inclusive<=0 then raise exception 'SEA_VIBE_VOUCHER_PAYMENT_LINES_REQUIRED'; end if;

    select * into v_account from public.sea_vibe_chart_accounts where id=v_line_account_id;
    if not found or v_account.is_active is distinct from true or v_account.allow_posting is distinct from true then
      raise exception 'SEA_VIBE_ACCOUNT_POSTING_REQUIRED';
    end if;
    if v_account.id=v_treasury_account.id then raise exception 'SEA_VIBE_VOUCHER_COUNTERPART_TREASURY_NOT_ALLOWED'; end if;
    if v_tax_code='vat15' and v_vat_account.id is null then raise exception 'SEA_VIBE_VAT_ACCOUNT_MISSING'; end if;

    v_valid_lines:=v_valid_lines+1;
    if v_first_account_id is null then v_first_account_id:=v_account.id; end if;
    v_header_amount:=round(v_header_amount+v_amount_inclusive,2);
    v_normalized_lines:=v_normalized_lines||jsonb_build_array(jsonb_build_object(
      'accountId',v_account.id,
      'amountInclusive',v_amount_inclusive,
      'taxCode',v_tax_code
    ));
  end loop;

  if v_valid_lines=0 then
    if p_counterpart_account_id is not null and coalesce(p_amount,0)>0 then
      v_first_account_id:=p_counterpart_account_id;
      v_header_amount:=round(p_amount,2);
      v_normalized_lines:=jsonb_build_array(jsonb_build_object('accountId',p_counterpart_account_id,'amountInclusive',round(p_amount,2),'taxCode','none'));
      v_valid_lines:=1;
    else
      raise exception 'SEA_VIBE_VOUCHER_PAYMENT_LINES_REQUIRED';
    end if;
  end if;

  if p_id is null then
    v_no:=public.sea_vibe_next_treasury_voucher_no_r44r13(v_kind,p_voucher_date);
    insert into public.sea_vibe_treasury_vouchers(
      voucher_no,voucher_type,voucher_date,treasury_account_id,counterpart_account_id,amount,reference,description,notes,created_by,updated_by
    ) values(
      v_no,v_kind,p_voucher_date,v_treasury_account.id,v_first_account_id,v_header_amount,nullif(btrim(coalesce(p_reference,'')),''),btrim(p_description),nullif(btrim(coalesce(p_notes,'')),''),v_user_id,v_user_id
    ) returning id into v_id;
  else
    v_id:=v_existing.id;
    v_no:=v_existing.voucher_no;
    update public.sea_vibe_treasury_vouchers
    set voucher_date=p_voucher_date,
        treasury_account_id=v_treasury_account.id,
        counterpart_account_id=v_first_account_id,
        amount=v_header_amount,
        reference=nullif(btrim(coalesce(p_reference,'')),''),
        description=btrim(p_description),
        notes=nullif(btrim(coalesce(p_notes,'')),''),
        updated_by=v_user_id,
        updated_at=now()
    where id=v_id;
    delete from public.sea_vibe_treasury_voucher_payment_lines where voucher_id=v_id;
    delete from public.sea_vibe_treasury_voucher_entries where voucher_id=v_id;
  end if;

  v_line_no:=0;
  v_entry_line_no:=0;
  for v_line in select value from jsonb_array_elements(v_normalized_lines)
  loop
    v_line_no:=v_line_no+1;
    v_line_account_id:=nullif(v_line->>'accountId','')::uuid;
    v_amount_inclusive:=round(greatest(coalesce(nullif(v_line->>'amountInclusive','')::numeric,0),0),2);
    v_tax_code:=case when lower(coalesce(v_line->>'taxCode','none'))='vat15' then 'vat15' else 'none' end;
    if v_tax_code='vat15' then
      v_net_amount:=round(v_amount_inclusive/1.15,2);
      v_tax_amount:=round(v_amount_inclusive-v_net_amount,2);
    else
      v_net_amount:=v_amount_inclusive;
      v_tax_amount:=0;
    end if;

    insert into public.sea_vibe_treasury_voucher_payment_lines(voucher_id,line_no,expense_account_id,amount_inclusive,tax_code)
    values(v_id,v_line_no,v_line_account_id,v_amount_inclusive,v_tax_code);

    v_entry_line_no:=v_entry_line_no+1;
    insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount)
    values(v_id,v_entry_line_no,v_line_account_id,v_net_amount,0);

    if v_tax_amount>0 then
      v_entry_line_no:=v_entry_line_no+1;
      insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount)
      values(v_id,v_entry_line_no,v_vat_account.id,v_tax_amount,0);
    end if;
  end loop;

  v_entry_line_no:=v_entry_line_no+1;
  insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount)
  values(v_id,v_entry_line_no,v_treasury_account.id,0,v_header_amount);

  return query
  select v.id,v.voucher_no,v.voucher_type,v.voucher_date,v.treasury_account_id,v.counterpart_account_id,v.amount
  from public.sea_vibe_treasury_vouchers v
  where v.id=v_id;
end;
$$;

revoke all on function public.sea_vibe_save_treasury_voucher_r44r38r14r6(uuid,text,date,uuid,numeric,text,text,text,jsonb) from public,anon;
grant execute on function public.sea_vibe_save_treasury_voucher_r44r38r14r6(uuid,text,date,uuid,numeric,text,text,text,jsonb) to authenticated;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en
)
values
  ('seaVibe.treasury.paymentLines','seaVibeTreasury','seaVibe','title','بنود المصروف','Expense Lines'),
  ('seaVibe.treasury.addExpenseLine','seaVibeTreasury','seaVibe','button','إضافة مصروف','Add Expense'),
  ('seaVibe.treasury.removeExpenseLine','seaVibeTreasury','seaVibe','button','حذف السطر','Remove Line'),
  ('seaVibe.treasury.paymentLineAccount','seaVibeTreasury','seaVibe','label','حساب المصروف','Expense Account'),
  ('seaVibe.treasury.paymentLineAmount','seaVibeTreasury','seaVibe','label','القيمة (شاملة الضريبة)','Amount (Tax Inclusive)'),
  ('seaVibe.treasury.paymentLineTax','seaVibeTreasury','seaVibe','label','الضريبة','Tax'),
  ('seaVibe.treasury.noTax','seaVibeTreasury','seaVibe','option','بدون ضريبة','No Tax'),
  ('seaVibe.treasury.vat15','seaVibeTreasury','seaVibe','option','ضريبة قيمة مضافة 15%','VAT 15%'),
  ('seaVibe.treasury.paymentLineTotal','seaVibeTreasury','seaVibe','label','إجمالي الصرف من الخزينة','Total Treasury Outflow'),
  ('seaVibe.treasury.paymentLinesHint','seaVibeTreasury','seaVibe','help','كل مبلغ يُكتب شامل الضريبة. VAT 15% تقسم 115 إلى 100 مصروف و15 ضريبة.','Each amount is tax-inclusive. VAT 15% splits 115 into 100 expense and 15 tax.'),
  ('seaVibe.treasury.voucherPaymentRequired','seaVibeTreasury','seaVibe','error','أكمل التاريخ وبنود المصروف والمبالغ والبيان.','Complete the date, expense lines, amounts, and description.'),
  ('pwa.update.release.r44r38r14r6.title','systemSettings','pwa','title','سند صرف متعدد البنود مع ضريبة مستقلة لكل مصروف — R44R38R14R6','Multi-Line Payment Voucher with Per-Expense Tax — R44R38R14R6'),
  ('pwa.update.release.r44r38r14r6.note1','systemSettings','pwa','note','إضافة أكثر من مصروف داخل سند الصرف الواحد، مع اختيار حساب مستقل لكل بند داخل السند.','Adds multiple expense lines to one payment voucher, with an independent account for each line.'),
  ('pwa.update.release.r44r38r14r6.note2','systemSettings','pwa','note','إتاحة تطبيق VAT 15% أو بدون ضريبة لكل بند على حدة، مع اعتبار المبلغ المُدخل شاملًا للضريبة مثل 115 = 100 مصروف + 15 ضريبة.','Lets each line apply VAT 15% or no tax independently, treating the entered amount as tax-inclusive so 115 = 100 expense + 15 tax.'),
  ('pwa.update.release.r44r38r14r6.note3','systemSettings','pwa','note','إنشاء قيود الصرف تلقائيًا كسطور متعددة على الحسابات المختارة وسطر ضريبة 2101 عند الحاجة، بدون تغيير Offline/Sync أو RLS أو الصلاحيات أو R44 Pruning.','Automatically posts payment vouchers as multi-line entries with account 2101 VAT lines when needed, without changing Offline/Sync, RLS, permissions, or R44 Pruning.')
on conflict (translation_key) do update set
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

select
  'R44R38R14R6_TREASURY_PAYMENT_MULTILINE_VAT_OK'::text as status,
  (select count(*)::integer from information_schema.tables where table_schema='public' and table_name='sea_vibe_treasury_voucher_payment_lines') as payment_line_table,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='sea_vibe_treasury_voucher_payment_lines' and policyname='sea vibe treasury voucher payment lines read') as payment_line_read_policy,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name='sea_vibe_save_treasury_voucher_r44r38r14r6') as save_function_installed,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_treasury_voucher_payment_lines' and column_name in ('voucher_id','expense_account_id','amount_inclusive','tax_code')) as payment_line_columns,
  (select case when pg_get_functiondef(p.oid) ilike '%v_net_amount:=round(v_amount_inclusive/1.15,2)%' and pg_get_functiondef(p.oid) ilike '%v_tax_amount:=round(v_amount_inclusive-v_net_amount,2)%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_save_treasury_voucher_r44r38r14r6' limit 1) as inclusive_vat_formula,
  (select case when pg_get_functiondef(p.oid) ilike '%insert into public.sea_vibe_treasury_voucher_payment_lines%' and pg_get_functiondef(p.oid) ilike '%insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount)%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_save_treasury_voucher_r44r38r14r6' limit 1) as multilines_and_entries,
  (select count(*)::integer from public.app_translations where translation_key in ('seaVibe.treasury.paymentLines','seaVibe.treasury.voucherPaymentRequired','pwa.update.release.r44r38r14r6.title')) as translation_rows;
