-- PETATOE P5.13.8.72 R44R38R14R4 — SEA VIBE Journal VAT Auto-Link + Searchable Account Picker
-- Scope:
--   1) Ensure VAT account 2101 stays under Current Liabilities (21).
--   2) Mark system-generated journal lines explicitly.
--   3) Authoritatively auto-post VAT (15%) to account 2101 on the same side as the taxable base line.
-- No RLS widening, no destructive DDL, no historical migration edits, no pruning changes.

begin;

-- Keep VAT Control / VAT Payable in the approved chart location.
insert into public.sea_vibe_chart_accounts(
  account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order
)
select '2101','ضريبة القيمة المضافة','VAT Payable',p.id,2,true,false,true,2101
from public.sea_vibe_chart_accounts p
where p.account_code='21'
on conflict(account_code) do update set
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  parent_id=excluded.parent_id,
  root_class=2,
  allow_posting=true,
  is_active=true,
  sort_order=2101,
  updated_at=now();

alter table public.sea_vibe_journal_entry_lines
  add column if not exists is_system_generated boolean not null default false,
  add column if not exists source_line_no integer;

create or replace function public.sea_vibe_save_manual_journal_r44r14(
  p_id uuid default null,
  p_journal_date date default current_date,
  p_description text default null,
  p_status text default 'draft',
  p_lines jsonb default '[]'::jsonb
)
returns table(id uuid,journal_no text,status text,total_debit numeric,total_credit numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_no text;
  v_existing public.sea_vibe_journal_entries%rowtype;
  v_line jsonb;
  v_line_no integer:=0;
  v_source_line_no integer;
  v_account_id uuid;
  v_account public.sea_vibe_chart_accounts%rowtype;
  v_vat_account_id uuid;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  v_tax_amount numeric(14,2);
  v_tax_code text;
  v_total_debit numeric(14,2):=0;
  v_total_credit numeric(14,2):=0;
  v_valid_lines integer:=0;
  v_status text:=lower(btrim(coalesce(p_status,'draft')));
begin
  if p_id is null then
    if not public.has_screen_permission('seaVibeJournals','add') then raise exception 'permission_denied'; end if;
  else
    if not public.has_screen_permission('seaVibeJournals','edit') then raise exception 'permission_denied'; end if;
    select * into v_existing from public.sea_vibe_journal_entries where sea_vibe_journal_entries.id=p_id for update;
    if not found then raise exception 'SEA_VIBE_JOURNAL_NOT_FOUND'; end if;
    if v_existing.status='posted' then raise exception 'SEA_VIBE_JOURNAL_POSTED_LOCKED'; end if;
  end if;

  if v_status not in ('draft','posted') then raise exception 'SEA_VIBE_JOURNAL_STATUS_INVALID'; end if;
  if p_journal_date is null then raise exception 'SEA_VIBE_JOURNAL_DATE_REQUIRED'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'SEA_VIBE_JOURNAL_LINES_INVALID'; end if;

  select a.id into v_vat_account_id
  from public.sea_vibe_chart_accounts a
  join public.sea_vibe_chart_accounts p on p.id=a.parent_id
  where a.account_code='2101'
    and p.account_code='21'
    and a.is_active=true
    and a.allow_posting=true
  limit 1;

  -- Validate manual lines and calculate authoritative totals INCLUDING generated VAT.
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_account_id:=nullif(v_line->>'accountId','')::uuid;
    v_debit:=round(greatest(coalesce(nullif(v_line->>'debit','')::numeric,0),0),2);
    v_credit:=round(greatest(coalesce(nullif(v_line->>'credit','')::numeric,0),0),2);
    v_tax_code:=case when lower(coalesce(v_line->>'taxCode','none'))='vat15' then 'vat15' else 'none' end;

    if v_account_id is null and v_debit=0 and v_credit=0 then continue; end if;
    if v_account_id is null then raise exception 'SEA_VIBE_JOURNAL_ACCOUNT_REQUIRED'; end if;
    if v_debit>0 and v_credit>0 then raise exception 'SEA_VIBE_JOURNAL_ONE_SIDE_ONLY'; end if;

    select * into v_account from public.sea_vibe_chart_accounts where sea_vibe_chart_accounts.id=v_account_id;
    if not found or not v_account.is_active or not v_account.allow_posting then raise exception 'SEA_VIBE_JOURNAL_POSTING_ACCOUNT_REQUIRED'; end if;

    if v_debit=0 and v_credit=0 then
      if v_status='posted' then raise exception 'SEA_VIBE_JOURNAL_AMOUNT_REQUIRED'; else continue; end if;
    end if;

    v_valid_lines:=v_valid_lines+1;
    v_total_debit:=v_total_debit+v_debit;
    v_total_credit:=v_total_credit+v_credit;

    if v_tax_code='vat15' and (v_debit>0 or v_credit>0) then
      if v_vat_account_id is null then raise exception 'SEA_VIBE_JOURNAL_VAT_ACCOUNT_REQUIRED'; end if;
      if v_account_id<>v_vat_account_id then
        v_tax_amount:=round(greatest(v_debit,v_credit)*0.15,2);
        if v_tax_amount>0 then
          v_valid_lines:=v_valid_lines+1;
          if v_debit>0 then v_total_debit:=v_total_debit+v_tax_amount;
          else v_total_credit:=v_total_credit+v_tax_amount;
          end if;
        end if;
      end if;
    end if;
  end loop;

  if v_status='posted' then
    if v_valid_lines<2 then raise exception 'SEA_VIBE_JOURNAL_TWO_LINES_REQUIRED'; end if;
    if v_total_debit<=0 or v_total_credit<=0 or v_total_debit<>v_total_credit then raise exception 'SEA_VIBE_JOURNAL_UNBALANCED'; end if;
  end if;

  if p_id is null then
    v_no:=public.sea_vibe_next_journal_no_r44r14(p_journal_date);
    insert into public.sea_vibe_journal_entries(
      journal_no,journal_date,currency,description,status,total_debit,total_credit,
      created_by,updated_by,posted_by,posted_at
    ) values(
      v_no,p_journal_date,'SAR',nullif(btrim(coalesce(p_description,'')),''),v_status,v_total_debit,v_total_credit,
      auth.uid(),auth.uid(),case when v_status='posted' then auth.uid() else null end,case when v_status='posted' then now() else null end
    ) returning sea_vibe_journal_entries.id into v_id;
  else
    v_id:=p_id;
    v_no:=v_existing.journal_no;
    update public.sea_vibe_journal_entries set
      journal_date=p_journal_date,
      description=nullif(btrim(coalesce(p_description,'')),''),
      status=v_status,
      total_debit=v_total_debit,
      total_credit=v_total_credit,
      updated_by=auth.uid(),
      posted_by=case when v_status='posted' then auth.uid() else posted_by end,
      posted_at=case when v_status='posted' then now() else posted_at end,
      updated_at=now()
    where sea_vibe_journal_entries.id=v_id;
    update public.sea_vibe_journal_entry_lines set is_active=false,updated_at=now() where journal_entry_id=v_id and is_active=true;
  end if;

  v_line_no:=0;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_account_id:=nullif(v_line->>'accountId','')::uuid;
    v_debit:=round(greatest(coalesce(nullif(v_line->>'debit','')::numeric,0),0),2);
    v_credit:=round(greatest(coalesce(nullif(v_line->>'credit','')::numeric,0),0),2);
    v_tax_code:=case when lower(coalesce(v_line->>'taxCode','none'))='vat15' then 'vat15' else 'none' end;

    if v_account_id is null and v_debit=0 and v_credit=0 then continue; end if;
    if v_account_id is null then continue; end if;
    if v_status='posted' and v_debit=0 and v_credit=0 then continue; end if;

    v_line_no:=v_line_no+1;
    v_source_line_no:=v_line_no;
    insert into public.sea_vibe_journal_entry_lines(
      journal_entry_id,line_no,account_id,description,tax_code,debit,credit,is_active,is_system_generated,source_line_no
    ) values(
      v_id,v_line_no,v_account_id,nullif(btrim(coalesce(v_line->>'description','')),''),
      v_tax_code,v_debit,v_credit,true,false,null
    )
    on conflict(journal_entry_id,line_no) do update set
      account_id=excluded.account_id,
      description=excluded.description,
      tax_code=excluded.tax_code,
      debit=excluded.debit,
      credit=excluded.credit,
      is_active=true,
      is_system_generated=false,
      source_line_no=null,
      updated_at=now();

    if v_tax_code='vat15' and v_account_id<>v_vat_account_id and (v_debit>0 or v_credit>0) then
      if v_vat_account_id is null then raise exception 'SEA_VIBE_JOURNAL_VAT_ACCOUNT_REQUIRED'; end if;
      v_tax_amount:=round(greatest(v_debit,v_credit)*0.15,2);
      if v_tax_amount>0 then
        v_line_no:=v_line_no+1;
        insert into public.sea_vibe_journal_entry_lines(
          journal_entry_id,line_no,account_id,description,tax_code,debit,credit,is_active,is_system_generated,source_line_no
        ) values(
          v_id,v_line_no,v_vat_account_id,'VAT (15%)','none',
          case when v_debit>0 then v_tax_amount else 0 end,
          case when v_credit>0 then v_tax_amount else 0 end,
          true,true,v_source_line_no
        )
        on conflict(journal_entry_id,line_no) do update set
          account_id=excluded.account_id,
          description=excluded.description,
          tax_code='none',
          debit=excluded.debit,
          credit=excluded.credit,
          is_active=true,
          is_system_generated=true,
          source_line_no=excluded.source_line_no,
          updated_at=now();
      end if;
    end if;
  end loop;

  return query select v_id,v_no,v_status,v_total_debit,v_total_credit;
end;
$$;

revoke all on function public.sea_vibe_save_manual_journal_r44r14(uuid,date,text,text,jsonb) from public,anon;
grant execute on function public.sea_vibe_save_manual_journal_r44r14(uuid,date,text,text,jsonb) to authenticated;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('seaVibe.journal.searchAccount','seaVibeJournals','seaVibe','placeholder','ابحث بالكود أو اسم الحساب...','Search by code or account name...','ابحث بالكود أو اسم الحساب...','Search by code or account name...',true,now()),
  ('seaVibe.journal.noAccountResults','seaVibeJournals','seaVibe','empty','لا توجد حسابات مطابقة.','No matching accounts.','لا توجد حسابات مطابقة.','No matching accounts.',true,now()),
  ('seaVibe.journal.autoVatLine','seaVibeJournals','seaVibe','value','ضريبة القيمة المضافة (15%) — تلقائي','VAT (15%) — Auto','ضريبة القيمة المضافة (15%) — تلقائي','VAT (15%) — Auto',true,now()),
  ('seaVibe.journal.autoGenerated','seaVibeJournals','seaVibe','badge','تلقائي','Auto','تلقائي','Auto',true,now()),
  ('seaVibe.journal.vatAccountMissing','seaVibeJournals','seaVibe','error','حساب ضريبة القيمة المضافة 2101 غير متاح تحت الالتزامات المتداولة.','VAT account 2101 is unavailable under Current Liabilities.','حساب ضريبة القيمة المضافة 2101 غير متاح تحت الالتزامات المتداولة.','VAT account 2101 is unavailable under Current Liabilities.',true,now()),
  ('pwa.update.release.r44r38r14r4.title','aboutApp','system','title','ربط ضريبة قيود اليومية والبحث في الحسابات — R44R38R14R4','Journal VAT Auto-Link & Account Search — R44R38R14R4','ربط ضريبة قيود اليومية والبحث في الحسابات — R44R38R14R4','Journal VAT Auto-Link & Account Search — R44R38R14R4',true,now()),
  ('pwa.update.release.r44r38r14r4.note1','aboutApp','system','note','ربط VAT (15%) تلقائيًا بالحساب 2101 ضريبة القيمة المضافة تحت الالتزامات المتداولة مع إنشاء سطر ضريبة نظامي.','Automatically links VAT (15%) to account 2101 under Current Liabilities and creates a system VAT line.','ربط VAT (15%) تلقائيًا بالحساب 2101 ضريبة القيمة المضافة تحت الالتزامات المتداولة مع إنشاء سطر ضريبة نظامي.','Automatically links VAT (15%) to account 2101 under Current Liabilities and creates a system VAT line.',true,now()),
  ('pwa.update.release.r44r38r14r4.note2','aboutApp','system','note','إضافة بحث بالكود أو الاسم داخل قائمة حسابات قيد اليومية مع الحفاظ على شجرة الحسابات الحالية.','Adds code/name search inside the Journal Entries account picker while preserving the existing chart of accounts.','إضافة بحث بالكود أو الاسم داخل قائمة حسابات قيد اليومية مع الحفاظ على شجرة الحسابات الحالية.','Adds code/name search inside the Journal Entries account picker while preserving the existing chart of accounts.',true,now()),
  ('pwa.update.release.r44r38r14r4.note3','aboutApp','system','note','لا تغيير في RLS أو Offline/Sync أو الحركات الأوتوماتيكية أو R44 Pruning.','No changes to RLS, Offline/Sync, automatic movements, or R44 Pruning.','لا تغيير في RLS أو Offline/Sync أو الحركات الأوتوماتيكية أو R44 Pruning.','No changes to RLS, Offline/Sync, automatic movements, or R44 Pruning.',true,now())
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
  'R44R38R14R4_JOURNAL_VAT_AUTO_LINK_OK'::text as status,
  (select count(*)::integer
   from public.sea_vibe_chart_accounts a
   join public.sea_vibe_chart_accounts p on p.id=a.parent_id
   where a.account_code='2101' and p.account_code='21' and a.root_class=2 and a.allow_posting=true and a.is_active=true) as vat_account_linked,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_journal_entry_lines' and column_name in ('is_system_generated','source_line_no')) as generated_line_columns,
  (select case when pg_get_functiondef(p.oid) ilike '%greatest(v_debit,v_credit)*0.15%' and pg_get_functiondef(p.oid) ilike '%v_vat_account_id%' then 1 else 0 end::integer
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='sea_vibe_save_manual_journal_r44r14' limit 1) as vat_auto_posting,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='sea_vibe_chart_accounts' and policyname='sea vibe chart accounts journal read') as unsafe_chart_policy;
