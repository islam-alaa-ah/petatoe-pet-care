-- PETATOE P5.13.8.72 R44R38R13 — SEA VIBE Treasury Receipt / Payment Vouchers
-- Adds manual receipt/payment vouchers to SEA VIBE Treasury with automatic double-entry posting.
-- Treasury account is fixed to 1101; the user selects only the counterpart posting account.
-- Online-only write path. No Offline Queue / Sync Engine changes. No pruning/retention changes.

begin;

create sequence if not exists public.sea_vibe_receipt_voucher_seq;
create sequence if not exists public.sea_vibe_payment_voucher_seq;

create table if not exists public.sea_vibe_treasury_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text not null unique,
  voucher_type text not null check (voucher_type in ('receipt','payment')),
  voucher_date date not null,
  treasury_account_id uuid not null references public.sea_vibe_chart_accounts(id) on delete restrict,
  counterpart_account_id uuid not null references public.sea_vibe_chart_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  description text not null,
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sea_vibe_treasury_voucher_accounts_distinct check (treasury_account_id <> counterpart_account_id)
);

create index if not exists idx_sea_vibe_treasury_vouchers_date on public.sea_vibe_treasury_vouchers(voucher_date desc,created_at desc);
create index if not exists idx_sea_vibe_treasury_vouchers_counterpart on public.sea_vibe_treasury_vouchers(counterpart_account_id,voucher_date);

create table if not exists public.sea_vibe_treasury_voucher_entries (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.sea_vibe_treasury_vouchers(id) on delete restrict,
  line_no smallint not null check (line_no in (1,2)),
  account_id uuid not null references public.sea_vibe_chart_accounts(id) on delete restrict,
  debit_amount numeric(14,2) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(14,2) not null default 0 check (credit_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(voucher_id,line_no),
  constraint sea_vibe_treasury_voucher_entry_one_side check (
    (debit_amount > 0 and credit_amount = 0) or (credit_amount > 0 and debit_amount = 0)
  )
);
create index if not exists idx_sea_vibe_treasury_voucher_entries_account on public.sea_vibe_treasury_voucher_entries(account_id,voucher_id);

create table if not exists public.sea_vibe_treasury_voucher_attachments (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.sea_vibe_treasury_vouchers(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_sea_vibe_treasury_voucher_attachments_voucher on public.sea_vibe_treasury_voucher_attachments(voucher_id,created_at desc);

create or replace function public.sea_vibe_next_treasury_voucher_no_r44r13(p_type text,p_date date default current_date)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_no bigint;
  v_prefix text;
begin
  if p_type='receipt' then
    v_no:=nextval('public.sea_vibe_receipt_voucher_seq');
    v_prefix:='RCV';
  elsif p_type='payment' then
    v_no:=nextval('public.sea_vibe_payment_voucher_seq');
    v_prefix:='PAY';
  else
    raise exception 'SEA_VIBE_VOUCHER_TYPE_INVALID';
  end if;
  return v_prefix||'-'||extract(year from coalesce(p_date,current_date))::int||'-'||lpad(v_no::text,6,'0');
end;
$$;

create or replace function public.sea_vibe_save_treasury_voucher_r44r13(
  p_id uuid,
  p_voucher_type text,
  p_voucher_date date,
  p_counterpart_account_id uuid,
  p_amount numeric,
  p_reference text,
  p_description text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_no text;
  v_treasury uuid;
  v_counter public.sea_vibe_chart_accounts%rowtype;
  v_existing public.sea_vibe_treasury_vouchers%rowtype;
  v_amount numeric(14,2):=round(coalesce(p_amount,0)::numeric,2);
begin
  if p_voucher_type not in ('receipt','payment') then raise exception 'SEA_VIBE_VOUCHER_TYPE_INVALID'; end if;
  if p_voucher_date is null then raise exception 'SEA_VIBE_VOUCHER_DATE_REQUIRED'; end if;
  if v_amount<=0 then raise exception 'SEA_VIBE_VOUCHER_AMOUNT_REQUIRED'; end if;
  if btrim(coalesce(p_description,''))='' then raise exception 'SEA_VIBE_VOUCHER_DESCRIPTION_REQUIRED'; end if;

  select id into v_treasury
  from public.sea_vibe_chart_accounts
  where account_code='1101' and is_active=true and allow_posting=true
  limit 1;
  if v_treasury is null then raise exception 'SEA_VIBE_TREASURY_ACCOUNT_1101_MISSING'; end if;

  select * into v_counter
  from public.sea_vibe_chart_accounts
  where id=p_counterpart_account_id;
  if not found then raise exception 'SEA_VIBE_VOUCHER_COUNTERPART_REQUIRED'; end if;
  if not v_counter.is_active then raise exception 'SEA_VIBE_ACCOUNT_INACTIVE'; end if;
  if not v_counter.allow_posting then raise exception 'SEA_VIBE_ACCOUNT_POSTING_REQUIRED'; end if;
  if v_counter.id=v_treasury then raise exception 'SEA_VIBE_VOUCHER_COUNTERPART_TREASURY_NOT_ALLOWED'; end if;

  if p_id is null then
    if not public.has_screen_permission('seaVibeTreasury','add') then raise exception 'permission_denied'; end if;
    v_no:=public.sea_vibe_next_treasury_voucher_no_r44r13(p_voucher_type,p_voucher_date);
    insert into public.sea_vibe_treasury_vouchers(
      voucher_no,voucher_type,voucher_date,treasury_account_id,counterpart_account_id,amount,reference,description,notes,created_by,updated_by
    ) values(
      v_no,p_voucher_type,p_voucher_date,v_treasury,p_counterpart_account_id,v_amount,nullif(btrim(coalesce(p_reference,'')),''),btrim(p_description),nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    if not public.has_screen_permission('seaVibeTreasury','edit') then raise exception 'permission_denied'; end if;
    select * into v_existing from public.sea_vibe_treasury_vouchers where id=p_id;
    if not found then raise exception 'SEA_VIBE_VOUCHER_NOT_FOUND'; end if;
    if v_existing.voucher_type<>p_voucher_type then raise exception 'SEA_VIBE_VOUCHER_TYPE_LOCKED'; end if;
    update public.sea_vibe_treasury_vouchers set
      voucher_date=p_voucher_date,
      counterpart_account_id=p_counterpart_account_id,
      amount=v_amount,
      reference=nullif(btrim(coalesce(p_reference,'')),''),
      description=btrim(p_description),
      notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_by=auth.uid(),
      updated_at=now()
    where id=p_id
    returning id,voucher_no into v_id,v_no;
  end if;

  if p_voucher_type='receipt' then
    insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount,updated_at)
    values(v_id,1,v_treasury,v_amount,0,now())
    on conflict(voucher_id,line_no) do update set account_id=excluded.account_id,debit_amount=excluded.debit_amount,credit_amount=excluded.credit_amount,updated_at=now();
    insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount,updated_at)
    values(v_id,2,p_counterpart_account_id,0,v_amount,now())
    on conflict(voucher_id,line_no) do update set account_id=excluded.account_id,debit_amount=excluded.debit_amount,credit_amount=excluded.credit_amount,updated_at=now();
  else
    insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount,updated_at)
    values(v_id,1,p_counterpart_account_id,v_amount,0,now())
    on conflict(voucher_id,line_no) do update set account_id=excluded.account_id,debit_amount=excluded.debit_amount,credit_amount=excluded.credit_amount,updated_at=now();
    insert into public.sea_vibe_treasury_voucher_entries(voucher_id,line_no,account_id,debit_amount,credit_amount,updated_at)
    values(v_id,2,v_treasury,0,v_amount,now())
    on conflict(voucher_id,line_no) do update set account_id=excluded.account_id,debit_amount=excluded.debit_amount,credit_amount=excluded.credit_amount,updated_at=now();
  end if;

  return jsonb_build_object('id',v_id,'voucher_no',v_no,'voucher_type',p_voucher_type,'amount',v_amount);
end;
$$;

-- Canonical treasury view: preserve every existing movement and append manual vouchers.
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
       (-e.amount)::numeric(14,2),
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
       case when v.voucher_type='receipt' then v.amount else -v.amount end,
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

alter table public.sea_vibe_treasury_vouchers enable row level security;
alter table public.sea_vibe_treasury_voucher_entries enable row level security;
alter table public.sea_vibe_treasury_voucher_attachments enable row level security;

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_treasury_vouchers' and policyname='sea vibe treasury vouchers read') then
    create policy "sea vibe treasury vouchers read" on public.sea_vibe_treasury_vouchers
    for select to authenticated using(public.has_screen_permission('seaVibeTreasury','view'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_treasury_voucher_entries' and policyname='sea vibe treasury voucher entries read') then
    create policy "sea vibe treasury voucher entries read" on public.sea_vibe_treasury_voucher_entries
    for select to authenticated using(public.has_screen_permission('seaVibeTreasury','view'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_treasury_voucher_attachments' and policyname='sea vibe treasury voucher attachments read') then
    create policy "sea vibe treasury voucher attachments read" on public.sea_vibe_treasury_voucher_attachments
    for select to authenticated using(public.has_screen_permission('seaVibeTreasury','view'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sea_vibe_treasury_voucher_attachments' and policyname='sea vibe treasury voucher attachments add') then
    create policy "sea vibe treasury voucher attachments add" on public.sea_vibe_treasury_voucher_attachments
    for insert to authenticated with check(
      (public.has_screen_permission('seaVibeTreasury','add') or public.has_screen_permission('seaVibeTreasury','edit'))
      and created_by=auth.uid()
    );
  end if;
end $$;

revoke all on public.sea_vibe_treasury_vouchers,public.sea_vibe_treasury_voucher_entries,public.sea_vibe_treasury_voucher_attachments from public,anon;
grant select on public.sea_vibe_treasury_vouchers,public.sea_vibe_treasury_voucher_entries to authenticated;
grant select,insert on public.sea_vibe_treasury_voucher_attachments to authenticated;
revoke all on function public.sea_vibe_next_treasury_voucher_no_r44r13(text,date) from public,anon;
revoke all on function public.sea_vibe_save_treasury_voucher_r44r13(uuid,text,date,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.sea_vibe_save_treasury_voucher_r44r13(uuid,text,date,uuid,numeric,text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sea-vibe-treasury-vouchers','sea-vibe-treasury-vouchers',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sea vibe treasury voucher files read') then
    create policy "sea vibe treasury voucher files read" on storage.objects
    for select to authenticated using(bucket_id='sea-vibe-treasury-vouchers' and public.has_screen_permission('seaVibeTreasury','view'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sea vibe treasury voucher files add') then
    create policy "sea vibe treasury voucher files add" on storage.objects
    for insert to authenticated with check(
      bucket_id='sea-vibe-treasury-vouchers'
      and (public.has_screen_permission('seaVibeTreasury','add') or public.has_screen_permission('seaVibeTreasury','edit'))
    );
  end if;
end $$;

-- Translation Center entries.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,true
from (values
  ('seaVibe.treasury.receiptVoucher','seaVibeTreasury','seaVibe','button','سند قبض','Receipt Voucher'),
  ('seaVibe.treasury.paymentVoucher','seaVibeTreasury','seaVibe','button','سند صرف','Payment Voucher'),
  ('seaVibe.treasury.newReceiptVoucher','seaVibeTreasury','seaVibe','title','سند قبض جديد','New Receipt Voucher'),
  ('seaVibe.treasury.newPaymentVoucher','seaVibeTreasury','seaVibe','title','سند صرف جديد','New Payment Voucher'),
  ('seaVibe.treasury.editReceiptVoucher','seaVibeTreasury','seaVibe','title','تعديل سند قبض','Edit Receipt Voucher'),
  ('seaVibe.treasury.editPaymentVoucher','seaVibeTreasury','seaVibe','title','تعديل سند صرف','Edit Payment Voucher'),
  ('seaVibe.treasury.voucherNo','seaVibeTreasury','seaVibe','label','رقم السند','Voucher No.'),
  ('seaVibe.treasury.voucherNoAuto','seaVibeTreasury','seaVibe','placeholder','تلقائي عند الحفظ','Generated on save'),
  ('seaVibe.treasury.counterpartAccount','seaVibeTreasury','seaVibe','label','الحساب المقابل','Counterpart Account'),
  ('seaVibe.treasury.selectCounterpart','seaVibeTreasury','seaVibe','option','اختر الحساب المقابل','Select counterpart account'),
  ('seaVibe.treasury.treasuryAccount','seaVibeTreasury','seaVibe','label','الخزينة','Treasury'),
  ('seaVibe.treasury.fixedTreasury','seaVibeTreasury','seaVibe','help','خزينة SEA VIBE (1101) — ثابتة تلقائيًا','SEA VIBE Treasury (1101) — fixed automatically'),
  ('seaVibe.treasury.receiptEntryRule','seaVibeTreasury','seaVibe','help','القيد: الخزينة مدين / الحساب المقابل دائن','Entry: Treasury debit / counterpart credit'),
  ('seaVibe.treasury.paymentEntryRule','seaVibeTreasury','seaVibe','help','القيد: الحساب المقابل مدين / الخزينة دائن','Entry: Counterpart debit / Treasury credit'),
  ('seaVibe.treasury.entryPreview','seaVibeTreasury','seaVibe','title','معاينة القيد المحاسبي','Accounting Entry Preview'),
  ('seaVibe.treasury.debit','seaVibeTreasury','seaVibe','label','مدين','Debit'),
  ('seaVibe.treasury.credit','seaVibeTreasury','seaVibe','label','دائن','Credit'),
  ('seaVibe.treasury.attachment','seaVibeTreasury','seaVibe','label','مرفق','Attachment'),
  ('seaVibe.treasury.attachmentHint','seaVibeTreasury','seaVibe','help','PDF أو JPG أو PNG أو WEBP — الحد الأقصى 5 ميجابايت','PDF, JPG, PNG or WEBP — max 5 MB'),
  ('seaVibe.treasury.attachmentTypeInvalid','seaVibeTreasury','seaVibe','error','نوع المرفق غير مدعوم. استخدم PDF أو JPG أو PNG أو WEBP.','Unsupported attachment type. Use PDF, JPG, PNG, or WEBP.'),
  ('seaVibe.treasury.attachmentSaveWarning','seaVibeTreasury','seaVibe','status','تم حفظ السند والقيد المحاسبي، لكن تعذر حفظ المرفق. يمكنك تعديل السند وإرفاق الملف مرة أخرى.','Voucher and accounting entry were saved, but the attachment could not be saved. Edit the voucher to attach the file again.'),
  ('seaVibe.treasury.openAttachment','seaVibeTreasury','seaVibe','button','فتح المرفق الحالي','Open current attachment'),
  ('seaVibe.treasury.saveVoucher','seaVibeTreasury','seaVibe','button','حفظ السند','Save Voucher'),
  ('seaVibe.treasury.saveAndPrint','seaVibeTreasury','seaVibe','button','حفظ وطباعة','Save & Print'),
  ('seaVibe.treasury.voucherSaved','seaVibeTreasury','seaVibe','status','تم حفظ السند والقيد المحاسبي بنجاح.','Voucher and accounting entry saved successfully.'),
  ('seaVibe.treasury.voucherUpdated','seaVibeTreasury','seaVibe','status','تم تعديل السند وإعادة تحديث القيد المحاسبي.','Voucher updated and accounting entry refreshed.'),
  ('seaVibe.treasury.voucherOnlineRequired','seaVibeTreasury','seaVibe','error','يلزم الاتصال بالإنترنت لحفظ أو تعديل سندات الخزينة.','An internet connection is required to save or edit treasury vouchers.'),
  ('seaVibe.treasury.voucherRequired','seaVibeTreasury','seaVibe','error','أكمل التاريخ والحساب المقابل والمبلغ والبيان.','Complete the date, counterpart account, amount, and description.'),
  ('seaVibe.treasury.receiptMovement','seaVibeTreasury','seaVibe','status','سند قبض','Receipt Voucher'),
  ('seaVibe.treasury.paymentMovement','seaVibeTreasury','seaVibe','status','سند صرف','Payment Voucher'),
  ('seaVibe.treasury.editVoucher','seaVibeTreasury','seaVibe','button','تعديل السند','Edit Voucher'),
  ('seaVibe.treasury.printVoucher','seaVibeTreasury','seaVibe','button','طباعة السند','Print Voucher'),
  ('seaVibe.treasury.noPostingAccounts','seaVibeTreasury','seaVibe','empty','لا توجد حسابات حركة نشطة متاحة للاختيار.','No active posting accounts are available.'),
  ('seaVibe.treasury.referencePlaceholder','seaVibeTreasury','seaVibe','placeholder','رقم فاتورة أو مرجع اختياري','Optional invoice or reference number'),
  ('seaVibe.treasury.descriptionPlaceholder','seaVibeTreasury','seaVibe','placeholder','أدخل بيان السند','Enter voucher description'),
  ('seaVibe.treasury.notesPlaceholder','seaVibeTreasury','seaVibe','placeholder','أي ملاحظات إضافية','Any additional notes'),
  ('pwa.update.release.r44r38r13.title','systemSettings','pwa','title','إضافة سندات القبض والصرف لخزينة SEA VIBE — R44R38R13','Add SEA VIBE Treasury Receipt & Payment Vouchers — R44R38R13'),
  ('pwa.update.release.r44r38r13.note1','systemSettings','pwa','note','إضافة سند قبض وسند صرف يدويين داخل خزينة SEA VIBE مع رقم سند مستقل وحساب مقابل ومرفق اختياري.','Adds manual receipt and payment vouchers to SEA VIBE Treasury with independent voucher numbers, counterpart accounts, and optional attachments.'),
  ('pwa.update.release.r44r38r13.note2','systemSettings','pwa','note','إنشاء قيد محاسبي مزدوج تلقائيًا: سند القبض يجعل خزينة 1101 مدين والحساب المقابل دائن، وسند الصرف بالعكس.','Automatically posts double-entry accounting: receipt debits Treasury 1101 and credits the counterpart; payment does the reverse.'),
  ('pwa.update.release.r44r38r13.note3','systemSettings','pwa','note','حفظ سندات الخزينة Online-only لحماية البيانات المالية، بدون تعديل Offline Queue أو Sync Engine أو الحركات الأوتوماتيكية الحالية أو R44 Pruning.','Keeps treasury voucher writes online-only to protect financial data, without changing Offline Queue, Sync Engine, existing automatic movements, or R44 Pruning.')
) as v(translation_key,screen_key,module_name,text_type,default_ar,default_en)
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

-- Read-only verification row for Supabase SQL Editor.
select
  'R44R38R13_TREASURY_VOUCHERS_OK'::text as status,
  (select count(*)::integer from information_schema.tables where table_schema='public' and table_name in ('sea_vibe_treasury_vouchers','sea_vibe_treasury_voucher_entries','sea_vibe_treasury_voucher_attachments')) as voucher_tables,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename in ('sea_vibe_treasury_vouchers','sea_vibe_treasury_voucher_entries','sea_vibe_treasury_voucher_attachments')) as rls_policies,
  (select count(*)::integer from storage.buckets where id='sea-vibe-treasury-vouchers') as storage_bucket;
