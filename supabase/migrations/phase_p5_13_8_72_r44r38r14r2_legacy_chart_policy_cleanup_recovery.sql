-- PETATOE P5.13.8.72 R44R38R14R2 — SEA VIBE Manual Journal Legacy Chart Policy Cleanup Recovery
-- Recovery for production state where the legacy journal-only SELECT policy already exists on sea_vibe_chart_accounts.
-- Historical R44R38R14 and R44R38R14R1 remain immutable. This migration is intentionally re-runnable.
-- Safety model: verify the exact legacy policy shape, remove only that named policy in an isolated short transaction,
-- then continue the R14R1 RPC-based recovery. No business data is deleted and no broader chart-table permission is granted.

-- ---------------------------------------------------------------------------
-- 0) Read-only policy-definition guard: refuse cleanup if the existing policy is not the exact expected legacy journal policy.
-- ---------------------------------------------------------------------------
do $$
declare
  v_cmd text;
  v_roles text;
  v_qual text;
begin
  select cmd, roles::text, qual
    into v_cmd, v_roles, v_qual
  from pg_policies
  where schemaname='public'
    and tablename='sea_vibe_chart_accounts'
    and policyname='sea vibe chart accounts journal read';

  if found then
    if upper(coalesce(v_cmd,'')) <> 'SELECT'
       or position('authenticated' in lower(coalesce(v_roles,''))) = 0
       or position('has_screen_permission' in lower(coalesce(v_qual,''))) = 0
       or position('seavibejournals' in lower(coalesce(v_qual,''))) = 0
       or position('view' in lower(coalesce(v_qual,''))) = 0 then
      raise exception 'R44R38R14R2_LEGACY_CHART_POLICY_DEFINITION_UNEXPECTED cmd=% roles=% qual=%', v_cmd, v_roles, v_qual;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0A) Remove only the verified legacy policy as the first and only lock in this transaction.
-- If the shared chart table is busy, lock_timeout aborts this tiny transaction safely; rerun the same migration later.
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '3s';
drop policy if exists "sea vibe chart accounts journal read" on public.sea_vibe_chart_accounts;
commit;

-- ---------------------------------------------------------------------------
-- A) VAT account + journal tables (short transaction)
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Chart of accounts: VAT payable under Current Liabilities (21)
-- ---------------------------------------------------------------------------
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
  updated_at=now();

-- ---------------------------------------------------------------------------
-- 2) Manual journal header / lines / attachments
-- ---------------------------------------------------------------------------
create table if not exists public.sea_vibe_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_no text not null unique,
  journal_date date not null default current_date,
  currency text not null default 'SAR' check (currency='SAR'),
  description text,
  status text not null default 'draft' check (status in ('draft','posted')),
  total_debit numeric(14,2) not null default 0,
  total_credit numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sea_vibe_journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.sea_vibe_journal_entries(id) on delete restrict,
  line_no integer not null check (line_no>0),
  account_id uuid not null references public.sea_vibe_chart_accounts(id) on delete restrict,
  description text,
  tax_code text not null default 'none' check (tax_code in ('none','vat15')),
  debit numeric(14,2) not null default 0 check (debit>=0),
  credit numeric(14,2) not null default 0 check (credit>=0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(journal_entry_id,line_no),
  check (not (debit>0 and credit>0))
);

create table if not exists public.sea_vibe_journal_entry_attachments (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.sea_vibe_journal_entries(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_sea_vibe_journal_entries_date on public.sea_vibe_journal_entries(journal_date desc,created_at desc);
create index if not exists idx_sea_vibe_journal_lines_entry on public.sea_vibe_journal_entry_lines(journal_entry_id,line_no) where is_active=true;
create index if not exists idx_sea_vibe_journal_lines_account on public.sea_vibe_journal_entry_lines(account_id,journal_entry_id) where is_active=true;
create index if not exists idx_sea_vibe_journal_attachments_entry on public.sea_vibe_journal_entry_attachments(journal_entry_id,created_at desc);

create sequence if not exists public.sea_vibe_journal_no_seq start 1;
commit;

-- ---------------------------------------------------------------------------
-- B) Journal functions + minimal chart-account RPC (short transaction)
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

create or replace function public.sea_vibe_next_journal_no_r44r14(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_seq bigint;
  v_year text;
begin
  v_seq:=nextval('public.sea_vibe_journal_no_seq');
  v_year:=to_char(coalesce(p_date,current_date),'YYYY');
  return 'JE-'||v_year||'-'||lpad(v_seq::text,6,'0');
end;
$$;

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
  v_account_id uuid;
  v_account public.sea_vibe_chart_accounts%rowtype;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
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

  -- Validate active posting lines and calculate authoritative totals before touching the header.
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_account_id:=nullif(v_line->>'accountId','')::uuid;
    v_debit:=round(greatest(coalesce(nullif(v_line->>'debit','')::numeric,0),0),2);
    v_credit:=round(greatest(coalesce(nullif(v_line->>'credit','')::numeric,0),0),2);
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
    -- No DELETE: prior draft lines are retired and current lines are upserted below.
    update public.sea_vibe_journal_entry_lines set is_active=false,updated_at=now() where journal_entry_id=v_id and is_active=true;
  end if;

  v_line_no:=0;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_account_id:=nullif(v_line->>'accountId','')::uuid;
    v_debit:=round(greatest(coalesce(nullif(v_line->>'debit','')::numeric,0),0),2);
    v_credit:=round(greatest(coalesce(nullif(v_line->>'credit','')::numeric,0),0),2);
    if v_account_id is null and v_debit=0 and v_credit=0 then continue; end if;
    if v_account_id is null then continue; end if;
    if v_status='posted' and v_debit=0 and v_credit=0 then continue; end if;
    v_line_no:=v_line_no+1;
    insert into public.sea_vibe_journal_entry_lines(
      journal_entry_id,line_no,account_id,description,tax_code,debit,credit,is_active
    ) values(
      v_id,v_line_no,v_account_id,nullif(btrim(coalesce(v_line->>'description','')),''),
      case when lower(coalesce(v_line->>'taxCode','none'))='vat15' then 'vat15' else 'none' end,
      v_debit,v_credit,true
    )
    on conflict(journal_entry_id,line_no) do update set
      account_id=excluded.account_id,
      description=excluded.description,
      tax_code=excluded.tax_code,
      debit=excluded.debit,
      credit=excluded.credit,
      is_active=true,
      updated_at=now();
  end loop;

  return query select v_id,v_no,v_status,v_total_debit,v_total_credit;
end;
$$;

-- Read-only convenience view for future list/report screens.
create or replace view public.sea_vibe_manual_journal_entries_view with (security_invoker=true) as
select
  j.id,j.journal_no,j.journal_date,j.currency,j.description,j.status,
  j.total_debit::numeric(14,2) as total_debit,
  j.total_credit::numeric(14,2) as total_credit,
  j.created_by,j.updated_by,j.posted_by,j.posted_at,j.created_at,j.updated_at,
  coalesce((select count(*)::integer from public.sea_vibe_journal_entry_lines l where l.journal_entry_id=j.id and l.is_active),0) as line_count,
  coalesce((select count(*)::integer from public.sea_vibe_journal_entry_attachments a where a.journal_entry_id=j.id),0) as attachment_count
from public.sea_vibe_journal_entries j;


create or replace function public.sea_vibe_journal_chart_accounts_r44r14r1()
returns table(
  id uuid,
  account_code text,
  name_ar text,
  name_en text,
  parent_id uuid,
  root_class integer,
  allow_posting boolean,
  is_system boolean,
  is_active boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.has_screen_permission('seaVibeJournals','view') then
    raise exception 'permission_denied';
  end if;

  return query
  select
    a.id,
    a.account_code,
    a.name_ar,
    a.name_en,
    a.parent_id,
    a.root_class,
    a.allow_posting,
    a.is_system,
    a.is_active,
    a.sort_order,
    a.created_at,
    a.updated_at
  from public.sea_vibe_chart_accounts a
  where a.is_active=true
  order by a.sort_order,a.account_code;
end;
$$;

revoke all on function public.sea_vibe_journal_chart_accounts_r44r14r1() from public,anon;
grant execute on function public.sea_vibe_journal_chart_accounts_r44r14r1() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- C) Screen permission + RLS on journal-owned tables only
-- IMPORTANT: no CREATE POLICY / ALTER TABLE is executed against sea_vibe_chart_accounts.
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values('seaVibeJournals','SEA VIBE - قيود اليومية','SEA VIBE',157,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

update public.app_screens set display_order=158 where screen_key='seaVibeZawel';
update public.app_screens set display_order=159 where screen_key='seaVibeFuel';
update public.app_screens set display_order=160 where screen_key='seaVibeReference';
update public.app_screens set display_order=161 where screen_key='seaVibeReports';

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
select 'super_admin'::public.app_role,'seaVibeJournals',true,true,true,false,true
on conflict(role,screen_key) do update set
  can_view=true,can_add=true,can_edit=true,can_delete=false,can_export=true,updated_at=now();



alter table public.sea_vibe_journal_entries enable row level security;
alter table public.sea_vibe_journal_entry_lines enable row level security;
alter table public.sea_vibe_journal_entry_attachments enable row level security;

revoke all on table public.sea_vibe_journal_entries from anon,authenticated;
revoke all on table public.sea_vibe_journal_entry_lines from anon,authenticated;
revoke all on table public.sea_vibe_journal_entry_attachments from anon,authenticated;
grant select on table public.sea_vibe_journal_entries to authenticated;
grant select on table public.sea_vibe_journal_entry_lines to authenticated;
grant select,insert on table public.sea_vibe_journal_entry_attachments to authenticated;
grant select on public.sea_vibe_manual_journal_entries_view to authenticated;

-- Create this phase's policies only when absent. No DROP is used.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_journal_entries' and policyname='sea vibe journals read') then
    execute 'create policy "sea vibe journals read" on public.sea_vibe_journal_entries for select to authenticated using(public.has_screen_permission(''seaVibeJournals'',''view''))';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_journal_entry_lines' and policyname='sea vibe journal lines read') then
    execute 'create policy "sea vibe journal lines read" on public.sea_vibe_journal_entry_lines for select to authenticated using(public.has_screen_permission(''seaVibeJournals'',''view''))';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_journal_entry_attachments' and policyname='sea vibe journal attachments read') then
    execute 'create policy "sea vibe journal attachments read" on public.sea_vibe_journal_entry_attachments for select to authenticated using(public.has_screen_permission(''seaVibeJournals'',''view''))';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_journal_entry_attachments' and policyname='sea vibe journal attachments insert') then
    execute 'create policy "sea vibe journal attachments insert" on public.sea_vibe_journal_entry_attachments for insert to authenticated with check(public.has_screen_permission(''seaVibeJournals'',''add'') or public.has_screen_permission(''seaVibeJournals'',''edit''))';
  end if;
end;
$$;

revoke all on function public.sea_vibe_next_journal_no_r44r14(date) from public,anon;
grant execute on function public.sea_vibe_next_journal_no_r44r14(date) to authenticated;
revoke all on function public.sea_vibe_save_manual_journal_r44r14(uuid,date,text,text,jsonb) from public,anon;
grant execute on function public.sea_vibe_save_manual_journal_r44r14(uuid,date,text,text,jsonb) to authenticated;
commit;

-- ---------------------------------------------------------------------------
-- D) Private journal attachment bucket and storage policies
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sea-vibe-journal-entries','sea-vibe-journal-entries',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set
  public=false,
  file_size_limit=10485760,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sea vibe journal storage read') then
    execute 'create policy "sea vibe journal storage read" on storage.objects for select to authenticated using(bucket_id=''sea-vibe-journal-entries'' and public.has_screen_permission(''seaVibeJournals'',''view''))';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sea vibe journal storage insert') then
    execute 'create policy "sea vibe journal storage insert" on storage.objects for insert to authenticated with check(bucket_id=''sea-vibe-journal-entries'' and (public.has_screen_permission(''seaVibeJournals'',''add'') or public.has_screen_permission(''seaVibeJournals'',''edit'')))';
  end if;
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- E) Translation catalog (preserve custom translations)
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

insert into public.app_translations(translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at)
values
  ('sidebar.seaVibeJournals','seaVibeJournals','seaVibe','navigation','قيود اليومية','Journal Entries','قيود اليومية','Journal Entries',true,now()),
  ('seaVibe.page.journals.title','seaVibeJournals','seaVibe','title','SEA VIBE — قيود اليومية','SEA VIBE — Journal Entries','SEA VIBE — قيود اليومية','SEA VIBE — Journal Entries',true,now()),
  ('seaVibe.page.journals.subtitle','seaVibeJournals','seaVibe','subtitle','إضافة قيد يومية يدوي وربطه بشجرة حسابات SEA VIBE.','Create manual journal entries linked to the SEA VIBE chart of accounts.','إضافة قيد يومية يدوي وربطه بشجرة حسابات SEA VIBE.','Create manual journal entries linked to the SEA VIBE chart of accounts.',true,now()),
  ('seaVibe.journal.save','seaVibeJournals','seaVibe','button','حفظ وترحيل','Save & Post','حفظ وترحيل','Save & Post',true,now()),
  ('seaVibe.journal.saveDraft','seaVibeJournals','seaVibe','button','حفظ كمسودة','Save as Draft','حفظ كمسودة','Save as Draft',true,now()),
  ('seaVibe.journal.cancel','seaVibeJournals','seaVibe','button','إلغاء','Cancel','إلغاء','Cancel',true,now()),
  ('seaVibe.journal.date','seaVibeJournals','seaVibe','label','التاريخ','Date','التاريخ','Date',true,now()),
  ('seaVibe.journal.currency','seaVibeJournals','seaVibe','label','العملة','Currency','العملة','Currency',true,now()),
  ('seaVibe.journal.currencyValue','seaVibeJournals','seaVibe','value','SAR — ريال سعودي','SAR — Saudi Riyal','SAR — ريال سعودي','SAR — Saudi Riyal',true,now()),
  ('seaVibe.journal.number','seaVibeJournals','seaVibe','label','رقم القيد','Journal No.','رقم القيد','Journal No.',true,now()),
  ('seaVibe.journal.numberAuto','seaVibeJournals','seaVibe','placeholder','يحدد تلقائيًا عند أول حفظ','Generated on first save','يحدد تلقائيًا عند أول حفظ','Generated on first save',true,now()),
  ('seaVibe.journal.description','seaVibeJournals','seaVibe','label','الوصف','Description','الوصف','Description',true,now()),
  ('seaVibe.journal.descriptionPlaceholder','seaVibeJournals','seaVibe','placeholder','أدخل وصف القيد اليومي...','Enter journal description...','أدخل وصف القيد اليومي...','Enter journal description...',true,now()),
  ('seaVibe.journal.attachments','seaVibeJournals','seaVibe','label','المرفقات','Attachments','المرفقات','Attachments',true,now()),
  ('seaVibe.journal.attachmentHint','seaVibeJournals','seaVibe','help','PDF أو JPG أو PNG أو WEBP — بحد أقصى 10 ميجابايت.','PDF, JPG, PNG or WEBP — max 10 MB.','PDF أو JPG أو PNG أو WEBP — بحد أقصى 10 ميجابايت.','PDF, JPG, PNG or WEBP — max 10 MB.',true,now()),
  ('seaVibe.journal.account','seaVibeJournals','seaVibe','label','اسم الحساب','Account','اسم الحساب','Account',true,now()),
  ('seaVibe.journal.lineDescription','seaVibeJournals','seaVibe','label','الوصف','Description','الوصف','Description',true,now()),
  ('seaVibe.journal.removeLineAria','seaVibeJournals','seaVibe','aria','حذف السطر','Remove line','حذف السطر','Remove line',true,now()),
  ('seaVibe.journal.tax','seaVibeJournals','seaVibe','label','الضرائب','Tax','الضرائب','Tax',true,now()),
  ('seaVibe.journal.debit','seaVibeJournals','seaVibe','label','مدين','Debit','مدين','Debit',true,now()),
  ('seaVibe.journal.credit','seaVibeJournals','seaVibe','label','دائن','Credit','دائن','Credit',true,now()),
  ('seaVibe.journal.selectAccount','seaVibeJournals','seaVibe','option','اختر حساب حركة...','Select posting account...','اختر حساب حركة...','Select posting account...',true,now()),
  ('seaVibe.journal.noTax','seaVibeJournals','seaVibe','option','—','—','—','—',true,now()),
  ('seaVibe.journal.vat15','seaVibeJournals','seaVibe','option','VAT (15%)','VAT (15%)','VAT (15%)','VAT (15%)',true,now()),
  ('seaVibe.journal.addLine','seaVibeJournals','seaVibe','button','إضافة سطر','Add Line','إضافة سطر','Add Line',true,now()),
  ('seaVibe.journal.totalDebit','seaVibeJournals','seaVibe','label','إجمالي المدين','Total Debit','إجمالي المدين','Total Debit',true,now()),
  ('seaVibe.journal.totalCredit','seaVibeJournals','seaVibe','label','إجمالي الدائن','Total Credit','إجمالي الدائن','Total Credit',true,now()),
  ('seaVibe.journal.difference','seaVibeJournals','seaVibe','label','الفرق','Difference','الفرق','Difference',true,now()),
  ('seaVibe.journal.draftSaved','seaVibeJournals','seaVibe','status','تم حفظ القيد كمسودة.','Journal draft saved.','تم حفظ القيد كمسودة.','Journal draft saved.',true,now()),
  ('seaVibe.journal.posted','seaVibeJournals','seaVibe','status','تم حفظ وترحيل القيد بنجاح.','Journal saved and posted successfully.','تم حفظ وترحيل القيد بنجاح.','Journal saved and posted successfully.',true,now()),
  ('seaVibe.journal.unbalanced','seaVibeJournals','seaVibe','error','لا يمكن ترحيل القيد قبل تساوي إجمالي المدين والدائن.','The journal cannot be posted until total debit equals total credit.','لا يمكن ترحيل القيد قبل تساوي إجمالي المدين والدائن.','The journal cannot be posted until total debit equals total credit.',true,now()),
  ('seaVibe.journal.twoLines','seaVibeJournals','seaVibe','error','أضف سطرين محاسبيين على الأقل قبل الترحيل.','Add at least two accounting lines before posting.','أضف سطرين محاسبيين على الأقل قبل الترحيل.','Add at least two accounting lines before posting.',true,now()),
  ('seaVibe.journal.onlineRequired','seaVibeJournals','seaVibe','error','يلزم الاتصال بالإنترنت لحفظ قيود اليومية المالية.','An internet connection is required to save financial journal entries.','يلزم الاتصال بالإنترنت لحفظ قيود اليومية المالية.','An internet connection is required to save financial journal entries.',true,now()),
  ('seaVibe.journal.attachmentSavedWarning','seaVibeJournals','seaVibe','status','تم حفظ القيد، لكن تعذر حفظ أحد المرفقات.','The journal was saved, but an attachment could not be saved.','تم حفظ القيد، لكن تعذر حفظ أحد المرفقات.','The journal was saved, but an attachment could not be saved.',true,now()),
  ('seaVibe.journal.accountRequired','seaVibeJournals','seaVibe','error','اختر حساب حركة صالح لكل سطر.','Select a valid posting account for each line.','اختر حساب حركة صالح لكل سطر.','Select a valid posting account for each line.',true,now()),
  ('seaVibe.journal.oneSideOnly','seaVibeJournals','seaVibe','error','أدخل قيمة في المدين أو الدائن فقط لكل سطر.','Enter an amount on either debit or credit only for each line.','أدخل قيمة في المدين أو الدائن فقط لكل سطر.','Enter an amount on either debit or credit only for each line.',true,now()),
  ('seaVibe.journal.amountRequired','seaVibeJournals','seaVibe','error','أدخل قيمة مدين أو دائن لكل سطر قبل الترحيل.','Enter a debit or credit amount for each line before posting.','أدخل قيمة مدين أو دائن لكل سطر قبل الترحيل.','Enter a debit or credit amount for each line before posting.',true,now()),
  ('seaVibe.journal.postedLocked','seaVibeJournals','seaVibe','error','القيد المرحل مقفل ولا يمكن تعديله.','A posted journal is locked and cannot be edited.','القيد المرحل مقفل ولا يمكن تعديله.','A posted journal is locked and cannot be edited.',true,now()),
  ('seaVibe.journal.attachmentInvalid','seaVibeJournals','seaVibe','error','المرفق غير مدعوم أو يتجاوز 10 ميجابايت.','The attachment type is unsupported or exceeds 10 MB.','المرفق غير مدعوم أو يتجاوز 10 ميجابايت.','The attachment type is unsupported or exceeds 10 MB.',true,now()),
  ('seaVibe.accounts.vatPayable','seaVibeReference','seaVibe','account','ضريبة القيمة المضافة','VAT Payable','ضريبة القيمة المضافة','VAT Payable',true,now()),
  ('pwa.update.release.r44r38r14.title','systemSettings','pwa','title','إضافة قيود اليومية اليدوية لـ SEA VIBE — R44R38R14','Add SEA VIBE Manual Journal Entries — R44R38R14','إضافة قيود اليومية اليدوية لـ SEA VIBE — R44R38R14','Add SEA VIBE Manual Journal Entries — R44R38R14',true,now()),
  ('pwa.update.release.r44r38r14.note1','systemSettings','pwa','note','إضافة شاشة قيود اليومية داخل SEA VIBE لإدخال قيود يدوية متوازنة مرتبطة بشجرة الحسابات.','Adds a SEA VIBE Journal Entries screen for balanced manual entries linked to the chart of accounts.','إضافة شاشة قيود اليومية داخل SEA VIBE لإدخال قيود يدوية متوازنة مرتبطة بشجرة الحسابات.','Adds a SEA VIBE Journal Entries screen for balanced manual entries linked to the chart of accounts.',true,now()),
  ('pwa.update.release.r44r38r14.note2','systemSettings','pwa','note','إضافة حساب ضريبة القيمة المضافة تحت الالتزامات المتداولة مع دعم المسودة والترحيل والمرفقات.','Adds VAT Payable under Current Liabilities with draft, posting, and attachment support.','إضافة حساب ضريبة القيمة المضافة تحت الالتزامات المتداولة مع دعم المسودة والترحيل والمرفقات.','Adds VAT Payable under Current Liabilities with draft, posting, and attachment support.',true,now()),
  ('pwa.update.release.r44r38r14.note3','systemSettings','pwa','note','لا تغيير في الحركات الأوتوماتيكية أو Offline/Sync أو R44 Pruning.','No changes to automatic movements, Offline/Sync, or R44 Pruning.','لا تغيير في الحركات الأوتوماتيكية أو Offline/Sync أو R44 Pruning.','No changes to automatic movements, Offline/Sync, or R44 Pruning.',true,now()),
  ('pwa.update.release.r44r38r14r1.title','systemSettings','pwa','title','استعادة آمنة لقفل قيود اليومية — R44R38R14R1','Safe Journal Migration Lock Recovery — R44R38R14R1','استعادة آمنة لقفل قيود اليومية — R44R38R14R1','Safe Journal Migration Lock Recovery — R44R38R14R1',true,now()),
  ('pwa.update.release.r44r38r14r1.note1','systemSettings','pwa','note','استبدال قراءة شجرة الحسابات من Policy مباشرة بـ RPC محدودة تتحقق من صلاحية قيود اليومية.','Replaces direct chart-table policy access with a permission-checked journal account RPC.','استبدال قراءة شجرة الحسابات من Policy مباشرة بـ RPC محدودة تتحقق من صلاحية قيود اليومية.','Replaces direct chart-table policy access with a permission-checked journal account RPC.',true,now()),
  ('pwa.update.release.r44r38r14r1.note2','systemSettings','pwa','note','تقسيم Recovery Migration إلى معاملات قصيرة قابلة لإعادة التشغيل لتقليل Locks وDeadlocks على الإنتاج.','Splits recovery into short re-runnable transactions to reduce production locks and deadlocks.','تقسيم Recovery Migration إلى معاملات قصيرة قابلة لإعادة التشغيل لتقليل Locks وDeadlocks على الإنتاج.','Splits recovery into short re-runnable transactions to reduce production locks and deadlocks.',true,now()),
  ('pwa.update.release.r44r38r14r1.note3','systemSettings','pwa','note','لا تغيير في منطق القيود أو الحسابات أو Offline/Sync أو R44 Pruning.','No changes to journal accounting logic, Offline/Sync, or R44 Pruning.','لا تغيير في منطق القيود أو الحسابات أو Offline/Sync أو R44 Pruning.','No changes to journal accounting logic, Offline/Sync, or R44 Pruning.',true,now())
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
-- F) R14R2 release translations (short transaction; preserve custom values)
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

insert into public.app_translations(translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at)
values
  ('pwa.update.release.r44r38r14r2.title','systemSettings','pwa','title','استعادة سياسة شجرة الحسابات لقيود اليومية — R44R38R14R2','Journal Chart Policy Cleanup Recovery — R44R38R14R2','استعادة سياسة شجرة الحسابات لقيود اليومية — R44R38R14R2','Journal Chart Policy Cleanup Recovery — R44R38R14R2',true,now()),
  ('pwa.update.release.r44r38r14r2.note1','systemSettings','pwa','note','إزالة Policy قديمة خاصة بقيود اليومية من جدول شجرة الحسابات بعد التحقق من تعريفها المتوقع فقط.','Removes the legacy journal-only chart policy only after verifying its expected definition.','إزالة Policy قديمة خاصة بقيود اليومية من جدول شجرة الحسابات بعد التحقق من تعريفها المتوقع فقط.','Removes the legacy journal-only chart policy only after verifying its expected definition.',true,now()),
  ('pwa.update.release.r44r38r14r2.note2','systemSettings','pwa','note','تنفيذ إزالة الـ Policy كأول قفل منفرد قصير قبل أي DDL آخر لتفادي دائرة Deadlock على الإنتاج.','Runs the policy removal as the first isolated short lock before any other DDL to avoid a production deadlock cycle.','تنفيذ إزالة الـ Policy كأول قفل منفرد قصير قبل أي DDL آخر لتفادي دائرة Deadlock على الإنتاج.','Runs the policy removal as the first isolated short lock before any other DDL to avoid a production deadlock cycle.',true,now()),
  ('pwa.update.release.r44r38r14r2.note3','systemSettings','pwa','note','تستمر شاشة قيود اليومية باستخدام RPC محدودة بالصلاحية؛ لا توسيع لـ RLS ولا تغيير في القيود المحاسبية أو Offline/Sync أو R44 Pruning.','Journal Entries continue using the permission-scoped RPC; no RLS widening or changes to accounting, Offline/Sync, or R44 Pruning.','تستمر شاشة قيود اليومية باستخدام RPC محدودة بالصلاحية؛ لا توسيع لـ RLS ولا تغيير في القيود المحاسبية أو Offline/Sync أو R44 Pruning.','Journal Entries continue using the permission-scoped RPC; no RLS widening or changes to accounting, Offline/Sync, or R44 Pruning.',true,now())
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
-- Final read-only recovery gate
-- ---------------------------------------------------------------------------
do $$
declare
  v_vat integer;
  v_tables integer;
  v_screen integer;
  v_rpc integer;
  v_unsafe_chart_policy integer;
  v_journal_policies integer;
  v_storage_policies integer;
  v_bucket integer;
begin
  select count(*) into v_vat
  from public.sea_vibe_chart_accounts
  where account_code='2101'
    and parent_id=(select id from public.sea_vibe_chart_accounts where account_code='21');

  select count(*) into v_tables
  from information_schema.tables
  where table_schema='public'
    and table_name in ('sea_vibe_journal_entries','sea_vibe_journal_entry_lines','sea_vibe_journal_entry_attachments');

  select count(*) into v_screen
  from public.app_screens
  where screen_key='seaVibeJournals' and is_active=true;

  select count(*) into v_rpc
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='sea_vibe_journal_chart_accounts_r44r14r1';

  select count(*) into v_unsafe_chart_policy
  from pg_policies
  where schemaname='public' and tablename='sea_vibe_chart_accounts'
    and policyname='sea vibe chart accounts journal read';

  select count(*) into v_journal_policies
  from pg_policies
  where schemaname='public'
    and (
      (tablename='sea_vibe_journal_entries' and policyname='sea vibe journals read') or
      (tablename='sea_vibe_journal_entry_lines' and policyname='sea vibe journal lines read') or
      (tablename='sea_vibe_journal_entry_attachments' and policyname in ('sea vibe journal attachments read','sea vibe journal attachments insert'))
    );

  select count(*) into v_storage_policies
  from pg_policies
  where schemaname='storage' and tablename='objects'
    and policyname in ('sea vibe journal storage read','sea vibe journal storage insert');

  select count(*) into v_bucket
  from storage.buckets where id='sea-vibe-journal-entries';

  if v_vat<>1 or v_tables<>3 or v_screen<>1 or v_rpc<>1 or v_unsafe_chart_policy<>0
     or v_journal_policies<>4 or v_storage_policies<>2 or v_bucket<>1 then
    raise exception 'R44R38R14R2_VERIFICATION_FAILED vat=% tables=% screen=% rpc=% unsafe_chart_policy=% journal_policies=% storage_policies=% bucket=%',
      v_vat,v_tables,v_screen,v_rpc,v_unsafe_chart_policy,v_journal_policies,v_storage_policies,v_bucket;
  end if;
end;
$$;

select
  'R44R38R14R2_LEGACY_POLICY_CLEANUP_OK'::text as status,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code='2101') as vat_accounts,
  (select count(*)::integer from information_schema.tables where table_schema='public' and table_name in ('sea_vibe_journal_entries','sea_vibe_journal_entry_lines','sea_vibe_journal_entry_attachments')) as journal_tables,
  (select count(*)::integer from public.app_screens where screen_key='seaVibeJournals' and is_active=true) as journal_screens,
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_journal_chart_accounts_r44r14r1') as journal_account_rpc,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='sea_vibe_chart_accounts' and policyname='sea vibe chart accounts journal read') as unsafe_chart_policy,
  (select count(*)::integer from pg_policies where schemaname='public' and ((tablename='sea_vibe_journal_entries' and policyname='sea vibe journals read') or (tablename='sea_vibe_journal_entry_lines' and policyname='sea vibe journal lines read') or (tablename='sea_vibe_journal_entry_attachments' and policyname in ('sea vibe journal attachments read','sea vibe journal attachments insert')))) as journal_policies,
  (select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('sea vibe journal storage read','sea vibe journal storage insert')) as storage_policies,
  (select count(*)::integer from storage.buckets where id='sea-vibe-journal-entries') as storage_bucket;
