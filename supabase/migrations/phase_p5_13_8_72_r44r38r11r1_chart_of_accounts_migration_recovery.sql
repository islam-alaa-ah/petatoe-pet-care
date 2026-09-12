-- PETATOE P5.13.8.72 R44R38R11R1 — SEA VIBE Chart of Accounts Migration Recovery
-- Idempotent recovery for a partially applied R44R38R11 deployment.
-- Re-establishes the exact R44R38R11 schema/functions/triggers/policies without modifying the historical R44R38R11 migration.
-- No DELETE/TRUNCATE, no permission widening, no pruning/retention changes.

begin;

create extension if not exists pgcrypto;

create table if not exists public.sea_vibe_chart_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  name_ar text not null,
  name_en text not null default '',
  parent_id uuid references public.sea_vibe_chart_accounts(id) on delete restrict,
  root_class smallint not null check (root_class between 1 and 5),
  allow_posting boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sea_vibe_chart_accounts_parent on public.sea_vibe_chart_accounts(parent_id,account_code);
create index if not exists idx_sea_vibe_chart_accounts_root on public.sea_vibe_chart_accounts(root_class,is_active,account_code);

alter table public.sea_vibe_expense_catalog
  add column if not exists account_id uuid references public.sea_vibe_chart_accounts(id) on delete restrict;

alter table public.sea_vibe_expenses
  add column if not exists account_id uuid references public.sea_vibe_chart_accounts(id) on delete restrict;

create index if not exists idx_sea_vibe_expense_catalog_account on public.sea_vibe_expense_catalog(account_id);
create index if not exists idx_sea_vibe_expenses_account on public.sea_vibe_expenses(account_id,expense_date);

-- Canonical fixed roots.
insert into public.sea_vibe_chart_accounts(account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order)
values
  ('1','الأصول','Assets',null,1,false,true,true,10),
  ('2','الالتزامات','Liabilities',null,2,false,true,true,20),
  ('3','حقوق الملكية','Equity',null,3,false,true,true,30),
  ('4','الإيرادات','Revenue',null,4,false,true,true,40),
  ('5','المصروفات','Expenses',null,5,false,true,true,50)
on conflict(account_code) do update set
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  root_class=excluded.root_class,
  allow_posting=false,
  is_system=true,
  is_active=true,
  updated_at=now();

-- Approved SEA VIBE starter hierarchy. These are editable business accounts; only the five roots are locked.
-- Seed one hierarchy level at a time so every parent exists before its children are inserted.
with seed(account_code,name_ar,name_en,parent_code,root_class,allow_posting,sort_order) as (values
  ('11','الأصول المتداولة','Current Assets','1',1,false,110),
  ('12','الأصول الثابتة','Fixed Assets','1',1,false,120),
  ('21','التزامات قصيرة الأجل','Current Liabilities','2',2,false,210),
  ('22','التزامات أخرى','Other Liabilities','2',2,false,220),
  ('31','رأس المال','Capital','3',3,true,310),
  ('32','جاري الشريك','Partner Current Account','3',3,true,320),
  ('33','مسحوبات الشريك','Partner Drawings','3',3,true,330),
  ('34','الأرباح المحتجزة','Retained Earnings','3',3,true,340),
  ('35','صافي نتيجة الفترة','Net Period Result','3',3,true,350),
  ('41','إيرادات الرحلات','Trip Revenue','4',4,false,410),
  ('42','إيرادات أخرى','Other Revenue','4',4,false,420),
  ('51','مصروفات الرحلات','Trip Expenses','5',5,false,510),
  ('52','المصروفات العامة','General Expenses','5',5,false,520),
  ('53','مصروفات الأصول','Asset Expenses','5',5,false,530)
)
insert into public.sea_vibe_chart_accounts(account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order)
select s.account_code,s.name_ar,s.name_en,p.id,s.root_class,s.allow_posting,false,true,s.sort_order
from seed s join public.sea_vibe_chart_accounts p on p.account_code=s.parent_code
on conflict(account_code) do nothing;

with seed(account_code,name_ar,name_en,parent_code,root_class,allow_posting,sort_order) as (values
  ('1101','خزينة SEA VIBE','SEA VIBE Treasury','11',1,true,1101),
  ('1102','رصيد البنزين','Fuel Balance','11',1,true,1102),
  ('4101','إيرادات رحلات الخور','Khor Trip Revenue','41',4,true,4101),
  ('4102','إيرادات رحلات البياضة','Bayada Trip Revenue','41',4,true,4102),
  ('4103','إيرادات رحلات الصيد','Fishing Trip Revenue','41',4,true,4103),
  ('5101','البنزين','Fuel','51',5,true,5101),
  ('5102','رسوم المرسى','Marina Fees','51',5,true,5102),
  ('5103','رسوم تصريح الإبحار','Sailing Permit Fees','51',5,true,5103),
  ('5104','شراء الثلج','Ice Purchase','51',5,true,5104),
  ('5105','العمولات','Commissions','51',5,false,5105),
  ('5106','مياه الشرب','Drinking Water','51',5,true,5106),
  ('5299','مصروفات أخرى','Other Expenses','52',5,true,5299),
  ('5399','مصروفات أصول أخرى','Other Asset Expenses','53',5,true,5399)
)
insert into public.sea_vibe_chart_accounts(account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order)
select s.account_code,s.name_ar,s.name_en,p.id,s.root_class,s.allow_posting,false,true,s.sort_order
from seed s join public.sea_vibe_chart_accounts p on p.account_code=s.parent_code
on conflict(account_code) do nothing;

with seed(account_code,name_ar,name_en,parent_code,root_class,allow_posting,sort_order) as (values
  ('510501','عمولة الكابتن','Captain Commission','5105',5,true,510501),
  ('510599','عمولات أخرى','Other Commissions','5105',5,true,510599)
)
insert into public.sea_vibe_chart_accounts(account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order)
select s.account_code,s.name_ar,s.name_en,p.id,s.root_class,s.allow_posting,false,true,s.sort_order
from seed s join public.sea_vibe_chart_accounts p on p.account_code=s.parent_code
on conflict(account_code) do nothing;

-- Compatibility correction for an accidental parent-code literal if an earlier partial execution occurred.
update public.sea_vibe_chart_accounts child
set parent_id=parent.id,root_class=4,updated_at=now()
from public.sea_vibe_chart_accounts parent
where child.account_code='4102' and parent.account_code='41'
  and child.parent_id is distinct from parent.id;

-- Default / known mappings for the existing expense catalog.
update public.sea_vibe_expense_catalog c
set account_id=a.id
from public.sea_vibe_chart_accounts a
where a.account_code=(case
  when c.system_key='fuel_cost' or lower(coalesce(c.name_en,''))='fuel' or c.name_ar='بنزين' then '5101'
  when lower(coalesce(c.name_en,''))='marina fees' or c.name_ar='رسوم المرسى' then '5102'
  when c.system_key='sailing_permit' or lower(coalesce(c.name_en,''))='sailing permit fee' or c.name_ar='رسوم تصريح الإبحار' then '5103'
  when lower(coalesce(c.name_en,''))='ice purchase' or c.name_ar='شراء ثلج' then '5104'
  when lower(coalesce(c.name_en,''))='captain commission' or c.name_ar='عمولة كابتن الرحلة' then '510501'
  when c.system_key='automatic_commission' or lower(coalesce(c.name_en,''))='commissions' or c.name_ar='عمولات' then '510599'
  when lower(coalesce(c.name_en,'')) in ('drinking water','water') or c.name_ar in ('مياه شرب','مياه الشرب') then '5106'
  else '5299'
end)
  and c.account_id is null;

-- Snapshot the accounting account on all historical expense rows. Future catalog remapping will not rewrite history.
-- Existing SEA VIBE mutation guards/touch triggers are temporarily disabled only for this deterministic metadata backfill
-- so closed-trip protections and historical updated_at/updated_by values are preserved.
alter table public.sea_vibe_expenses disable trigger user;
update public.sea_vibe_expenses e
set account_id=c.account_id
from public.sea_vibe_expense_catalog c
where e.expense_catalog_id=c.id and e.account_id is null and c.account_id is not null;
alter table public.sea_vibe_expenses enable trigger user;

create or replace function public.sea_vibe_chart_account_validate_r44r11()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_parent public.sea_vibe_chart_accounts%rowtype;
  v_has_children boolean:=false;
  v_used boolean:=false;
  v_active_catalog boolean:=false;
begin
  new.account_code:=btrim(coalesce(new.account_code,''));
  new.name_ar:=btrim(coalesce(new.name_ar,''));
  new.name_en:=btrim(coalesce(new.name_en,''));
  if new.account_code='' or new.name_ar='' then raise exception 'SEA_VIBE_ACCOUNT_REQUIRED_FIELDS'; end if;
  if new.account_code !~ '^[0-9][0-9.-]{0,31}$' then raise exception 'SEA_VIBE_ACCOUNT_CODE_INVALID'; end if;

  if tg_op='INSERT' then
    new.created_by:=coalesce(new.created_by,auth.uid());
    new.updated_by:=coalesce(new.updated_by,auth.uid());
    if auth.uid() is not null then new.is_system:=false; end if;
  else
    new.updated_by:=coalesce(auth.uid(),new.updated_by);
    if auth.uid() is not null then new.is_system:=old.is_system; end if;
    if old.is_system and auth.uid() is not null then
      if new.account_code is distinct from old.account_code
         or new.parent_id is distinct from old.parent_id
         or new.root_class is distinct from old.root_class
         or new.allow_posting is distinct from old.allow_posting
         or new.is_active is distinct from old.is_active then
        raise exception 'SEA_VIBE_ACCOUNT_SYSTEM_LOCKED';
      end if;
    end if;
  end if;

  if new.parent_id is null then
    if not new.is_system then raise exception 'SEA_VIBE_ACCOUNT_ROOTS_FIXED'; end if;
    if new.root_class not between 1 and 5 then raise exception 'SEA_VIBE_ACCOUNT_ROOT_CLASS_INVALID'; end if;
  else
    if tg_op='UPDATE' and new.parent_id=new.id then raise exception 'SEA_VIBE_ACCOUNT_PARENT_SELF'; end if;
    select * into v_parent from public.sea_vibe_chart_accounts where id=new.parent_id;
    if not found then raise exception 'SEA_VIBE_ACCOUNT_PARENT_NOT_FOUND'; end if;
    if not v_parent.is_active then raise exception 'SEA_VIBE_ACCOUNT_PARENT_INACTIVE'; end if;
    if v_parent.allow_posting then raise exception 'SEA_VIBE_ACCOUNT_PARENT_MUST_BE_GROUP'; end if;
    new.root_class:=v_parent.root_class;
    if new.account_code not like v_parent.account_code||'%' then raise exception 'SEA_VIBE_ACCOUNT_CODE_PARENT_PREFIX'; end if;
    if tg_op='UPDATE' and exists(
      with recursive descendants as (
        select id from public.sea_vibe_chart_accounts where parent_id=old.id
        union all
        select c.id from public.sea_vibe_chart_accounts c join descendants d on c.parent_id=d.id
      ) select 1 from descendants where id=new.parent_id
    ) then raise exception 'SEA_VIBE_ACCOUNT_CYCLE'; end if;
  end if;

  if tg_op='UPDATE' then
    select exists(select 1 from public.sea_vibe_chart_accounts where parent_id=old.id) into v_has_children;
    select exists(select 1 from public.sea_vibe_expense_catalog where account_id=old.id)
        or exists(select 1 from public.sea_vibe_expenses where account_id=old.id) into v_used;
    select exists(select 1 from public.sea_vibe_expense_catalog where account_id=old.id and is_active) into v_active_catalog;

    if new.account_code is distinct from old.account_code and (v_has_children or v_used) then
      raise exception 'SEA_VIBE_ACCOUNT_CODE_LOCKED_AFTER_USE';
    end if;
    if new.parent_id is distinct from old.parent_id and v_used then
      raise exception 'SEA_VIBE_ACCOUNT_PARENT_LOCKED_AFTER_USE';
    end if;
    if old.allow_posting and not new.allow_posting and v_used then
      raise exception 'SEA_VIBE_ACCOUNT_TYPE_LOCKED_AFTER_USE';
    end if;
    if not old.allow_posting and new.allow_posting and v_has_children then
      raise exception 'SEA_VIBE_ACCOUNT_GROUP_HAS_CHILDREN';
    end if;
    if old.is_active and not new.is_active then
      if exists(select 1 from public.sea_vibe_chart_accounts where parent_id=old.id and is_active) then raise exception 'SEA_VIBE_ACCOUNT_ACTIVE_CHILDREN'; end if;
      if v_active_catalog then raise exception 'SEA_VIBE_ACCOUNT_ACTIVE_EXPENSE_LINK'; end if;
    end if;
  end if;

  if new.allow_posting and exists(select 1 from public.sea_vibe_chart_accounts where parent_id=new.id) then
    raise exception 'SEA_VIBE_ACCOUNT_GROUP_HAS_CHILDREN';
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists trg_sea_vibe_chart_account_validate_r44r11 on public.sea_vibe_chart_accounts;
create trigger trg_sea_vibe_chart_account_validate_r44r11
before insert or update on public.sea_vibe_chart_accounts
for each row execute function public.sea_vibe_chart_account_validate_r44r11();

create or replace function public.sea_vibe_default_expense_catalog_account_r44r11()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.account_id is null then
    select id into new.account_id from public.sea_vibe_chart_accounts where account_code='5299' and is_active limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sea_vibe_default_expense_catalog_account_r44r11 on public.sea_vibe_expense_catalog;
create trigger trg_sea_vibe_default_expense_catalog_account_r44r11
before insert on public.sea_vibe_expense_catalog
for each row execute function public.sea_vibe_default_expense_catalog_account_r44r11();

create or replace function public.sea_vibe_snapshot_expense_account_r44r11()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT' or new.expense_catalog_id is distinct from old.expense_catalog_id or new.account_id is null then
    select account_id into new.account_id from public.sea_vibe_expense_catalog where id=new.expense_catalog_id;
    if new.account_id is null then
      select id into new.account_id from public.sea_vibe_chart_accounts where account_code='5299' and is_active limit 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sea_vibe_snapshot_expense_account_r44r11 on public.sea_vibe_expenses;
create trigger trg_sea_vibe_snapshot_expense_account_r44r11
before insert or update of expense_catalog_id on public.sea_vibe_expenses
for each row execute function public.sea_vibe_snapshot_expense_account_r44r11();

create or replace view public.sea_vibe_chart_accounts_view with (security_invoker=true) as
select a.*,
  coalesce(p.account_code,'') as parent_code,
  coalesce(p.name_ar,'') as parent_name_ar,
  coalesce(p.name_en,'') as parent_name_en,
  (select count(*)::integer from public.sea_vibe_chart_accounts c where c.parent_id=a.id) as child_count,
  (select count(*)::integer from public.sea_vibe_expense_catalog c where c.account_id=a.id) as expense_catalog_count,
  (select count(*)::integer from public.sea_vibe_expenses e where e.account_id=a.id) as transaction_count
from public.sea_vibe_chart_accounts a
left join public.sea_vibe_chart_accounts p on p.id=a.parent_id;

create or replace function public.sea_vibe_save_chart_account_r44r11(
  p_id uuid,
  p_account_code text,
  p_name_ar text,
  p_name_en text,
  p_parent_id uuid,
  p_allow_posting boolean default true,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_parent_root smallint;
begin
  if p_id is null then
    if not public.has_screen_permission('seaVibeReference','add') then raise exception 'permission_denied'; end if;
    if p_parent_id is null then raise exception 'SEA_VIBE_ACCOUNT_PARENT_REQUIRED'; end if;
    select root_class into v_parent_root from public.sea_vibe_chart_accounts where id=p_parent_id;
    if v_parent_root is null then raise exception 'SEA_VIBE_ACCOUNT_PARENT_NOT_FOUND'; end if;
    insert into public.sea_vibe_chart_accounts(account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,created_by,updated_by)
    values(btrim(coalesce(p_account_code,'')),btrim(coalesce(p_name_ar,'')),btrim(coalesce(p_name_en,'')),p_parent_id,v_parent_root,coalesce(p_allow_posting,true),false,coalesce(p_is_active,true),auth.uid(),auth.uid())
    returning id into v_id;
  else
    if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
    update public.sea_vibe_chart_accounts set
      account_code=btrim(coalesce(p_account_code,'')),
      name_ar=btrim(coalesce(p_name_ar,'')),
      name_en=btrim(coalesce(p_name_en,'')),
      parent_id=p_parent_id,
      allow_posting=coalesce(p_allow_posting,true),
      is_active=coalesce(p_is_active,true),
      updated_by=auth.uid()
    where id=p_id
    returning id into v_id;
    if v_id is null then raise exception 'SEA_VIBE_ACCOUNT_NOT_FOUND'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.sea_vibe_set_expense_catalog_account_r44r11(p_catalog_id uuid,p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_account public.sea_vibe_chart_accounts%rowtype;
begin
  if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
  select * into v_account from public.sea_vibe_chart_accounts where id=p_account_id;
  if not found then raise exception 'SEA_VIBE_ACCOUNT_NOT_FOUND'; end if;
  if not v_account.is_active then raise exception 'SEA_VIBE_ACCOUNT_INACTIVE'; end if;
  if not v_account.allow_posting then raise exception 'SEA_VIBE_ACCOUNT_POSTING_REQUIRED'; end if;
  if v_account.root_class<>5 then raise exception 'SEA_VIBE_EXPENSE_ACCOUNT_REQUIRED'; end if;
  update public.sea_vibe_expense_catalog set account_id=p_account_id,updated_at=now() where id=p_catalog_id;
  if not found then raise exception 'SEA_VIBE_EXPENSE_CATALOG_NOT_FOUND'; end if;
  -- Historical sea_vibe_expenses.account_id is intentionally not rewritten here.
  return true;
end;
$$;

alter table public.sea_vibe_chart_accounts enable row level security;

drop policy if exists "sea vibe chart accounts read" on public.sea_vibe_chart_accounts;
create policy "sea vibe chart accounts read" on public.sea_vibe_chart_accounts
for select to authenticated using(public.sea_vibe_can_view());

drop policy if exists "sea vibe chart accounts insert" on public.sea_vibe_chart_accounts;
create policy "sea vibe chart accounts insert" on public.sea_vibe_chart_accounts
for insert to authenticated with check(public.has_screen_permission('seaVibeReference','add') and is_system=false);

drop policy if exists "sea vibe chart accounts update" on public.sea_vibe_chart_accounts;
create policy "sea vibe chart accounts update" on public.sea_vibe_chart_accounts
for update to authenticated using(public.has_screen_permission('seaVibeReference','edit'))
with check(public.has_screen_permission('seaVibeReference','edit'));

grant select,insert,update on public.sea_vibe_chart_accounts to authenticated;
grant select on public.sea_vibe_chart_accounts_view to authenticated;
revoke all on function public.sea_vibe_save_chart_account_r44r11(uuid,text,text,text,uuid,boolean,boolean) from public,anon;
grant execute on function public.sea_vibe_save_chart_account_r44r11(uuid,text,text,text,uuid,boolean,boolean) to authenticated;
revoke all on function public.sea_vibe_set_expense_catalog_account_r44r11(uuid,uuid) from public,anon;
grant execute on function public.sea_vibe_set_expense_catalog_account_r44r11(uuid,uuid) to authenticated;

-- Recovery verification gate: fail the transaction rather than leave another partial state.
do $$
declare
  v_count integer;
begin
  if to_regclass('public.sea_vibe_chart_accounts') is null then
    raise exception 'R44R38R11R1_VERIFY_TABLE_MISSING';
  end if;

  select count(*) into v_count
  from public.sea_vibe_chart_accounts
  where account_code in ('1','2','3','4','5')
    and parent_id is null
    and is_system=true
    and is_active=true;
  if v_count<>5 then
    raise exception 'R44R38R11R1_VERIFY_ROOTS_%',v_count;
  end if;

  select count(*) into v_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and t.tgisinternal=false
    and t.tgname in (
      'trg_sea_vibe_chart_account_validate_r44r11',
      'trg_sea_vibe_default_expense_catalog_account_r44r11',
      'trg_sea_vibe_snapshot_expense_account_r44r11'
    );
  if v_count<>3 then
    raise exception 'R44R38R11R1_VERIFY_TRIGGERS_%',v_count;
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname='public'
    and tablename='sea_vibe_chart_accounts'
    and policyname in (
      'sea vibe chart accounts read',
      'sea vibe chart accounts insert',
      'sea vibe chart accounts update'
    );
  if v_count<>3 then
    raise exception 'R44R38R11R1_VERIFY_POLICIES_%',v_count;
  end if;

  if to_regprocedure('public.sea_vibe_save_chart_account_r44r11(uuid,text,text,text,uuid,boolean,boolean)') is null then
    raise exception 'R44R38R11R1_VERIFY_SAVE_FUNCTION_MISSING';
  end if;
  if to_regprocedure('public.sea_vibe_set_expense_catalog_account_r44r11(uuid,uuid)') is null then
    raise exception 'R44R38R11R1_VERIFY_MAPPING_FUNCTION_MISSING';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sea_vibe_expense_catalog' and column_name='account_id'
  ) then raise exception 'R44R38R11R1_VERIFY_CATALOG_ACCOUNT_COLUMN_MISSING'; end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sea_vibe_expenses' and column_name='account_id'
  ) then raise exception 'R44R38R11R1_VERIFY_EXPENSE_ACCOUNT_COLUMN_MISSING'; end if;
end;
$$;

-- Translation Center entries for the new reference-data section.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,true
from (values
  ('seaVibe.reference.chartOfAccounts','seaVibeReference','seaVibe','option','شجرة الحسابات','Chart of Accounts'),
  ('seaVibe.accounts.code','seaVibeReference','seaVibe','label','كود الحساب','Account code'),
  ('seaVibe.accounts.name','seaVibeReference','seaVibe','label','اسم الحساب','Account name'),
  ('seaVibe.accounts.parent','seaVibeReference','seaVibe','label','الحساب الأب','Parent account'),
  ('seaVibe.accounts.type','seaVibeReference','seaVibe','label','نوع الحساب','Account type'),
  ('seaVibe.accounts.group','seaVibeReference','seaVibe','option','تجميعي','Group'),
  ('seaVibe.accounts.posting','seaVibeReference','seaVibe','option','حركة','Posting'),
  ('seaVibe.accounts.rootClass','seaVibeReference','seaVibe','label','التصنيف الرئيسي','Root class'),
  ('seaVibe.accounts.expenseLinks','seaVibeReference','seaVibe','label','أنواع المصروفات المرتبطة','Linked expense types'),
  ('seaVibe.accounts.transactions','seaVibeReference','seaVibe','label','الحركات','Transactions'),
  ('seaVibe.accounts.add','seaVibeReference','seaVibe','button','إضافة حساب','Add account'),
  ('seaVibe.accounts.selectParent','seaVibeReference','seaVibe','option','اختر الحساب الأب','Select parent account'),
  ('seaVibe.accounts.noAccounts','seaVibeReference','seaVibe','empty','لا توجد حسابات في شجرة الحسابات.','No accounts are available in the chart of accounts.'),
  ('seaVibe.accounts.onlineRequired','seaVibeReference','seaVibe','message','يلزم الاتصال بالإنترنت لإدارة شجرة الحسابات.','An internet connection is required to manage the chart of accounts.'),
  ('seaVibe.accounts.hint','seaVibeReference','seaVibe','help','يمكن إضافة حسابات فرعية جديدة في أي وقت. الحسابات التجميعية تستقبل حسابات فرعية، وحسابات الحركة فقط هي التي يمكن ربطها بالمصروفات.','New child accounts can be added at any time. Group accounts accept child accounts, while only posting accounts can be linked to expenses.'),
  ('seaVibe.accounts.parentRequired','seaVibeReference','seaVibe','error','اختر الحساب الأب.','Select a parent account.'),
  ('seaVibe.accounts.required','seaVibeReference','seaVibe','error','أدخل كود الحساب والاسم بالعربية.','Enter the account code and Arabic name.'),
  ('seaVibe.reference.account','seaVibeReference','seaVibe','label','الحساب المحاسبي','Accounting account'),
  ('seaVibe.reference.selectExpenseAccount','seaVibeReference','seaVibe','option','اختر حساب المصروف','Select expense account'),
  ('seaVibe.reference.editAccountLink','seaVibeReference','seaVibe','button','تعديل ربط الحساب','Edit account mapping'),
  ('seaVibe.reference.accountUnlinked','seaVibeReference','seaVibe','status','غير مربوط','Unlinked'),
  ('seaVibe.reference.expenseAccountRequired','seaVibeReference','seaVibe','error','اختر الحساب المحاسبي للمصروف.','Select the accounting account for this expense.'),
  ('seaVibe.reference.accountLinkFailed','seaVibeReference','seaVibe','error','تعذر ربط المصروف بالحساب المحاسبي.','Failed to link the expense to the accounting account.'),
  ('seaVibe.accounts.validationFailed','seaVibeReference','seaVibe','error','تعذر حفظ الحساب. راجع الكود والحساب الأب ونوع الحساب والحالة.','Failed to save the account. Review the code, parent account, account type, and status.'),
  ('pwa.update.release.r44r38r11.title','systemSettings','pwa','title','إضافة شجرة حسابات SEA VIBE — R44R38R11','Add SEA VIBE Chart of Accounts — R44R38R11'),
  ('pwa.update.release.r44r38r11.note1','systemSettings','pwa','note','إضافة شجرة حسابات ديناميكية لـSEA VIBE بالجذور: الأصول والالتزامات وحقوق الملكية والإيرادات والمصروفات، مع جاري الشريك ومسحوبات الشريك.','Adds a dynamic SEA VIBE chart of accounts with Assets, Liabilities, Equity, Revenue, and Expenses roots, including Partner Current and Partner Drawings.'),
  ('pwa.update.release.r44r38r11.note2','systemSettings','pwa','note','ربط أنواع المصروفات الحالية بحسابات حركة تحت مجموعة المصروفات وحفظ الحساب المحاسبي كنسخة تاريخية داخل كل حركة مصروف جديدة أو معدلة.','Links existing expense types to posting accounts under Expenses and snapshots the accounting account on each new or edited expense movement.'),
  ('pwa.update.release.r44r38r11.note3','systemSettings','pwa','note','يمكن إضافة حسابات فرعية جديدة في أي وقت من البيانات المرجعية مع منع التغييرات الهيكلية أو الإيقاف غير الآمن للحسابات المستخدمة، بدون تغيير حسابات SEA VIBE الحالية أو R44 Pruning.','Allows new child accounts to be added at any time from Reference Data while blocking unsafe structural changes or deactivation of used accounts, without changing current SEA VIBE calculations or R44 Pruning.'),
  ('pwa.update.release.r44r38r11r1.title','systemSettings','pwa','title','استعادة Migration شجرة حسابات SEA VIBE — R44R38R11R1','Recover SEA VIBE Chart of Accounts Migration — R44R38R11R1'),
  ('pwa.update.release.r44r38r11r1.note1','systemSettings','pwa','note','إضافة Recovery Migration قابلة لإعادة التشغيل لمعالجة حالة التنفيذ الجزئي لـR44R38R11 بدون تعديل ملف Migration التاريخي.','Adds an idempotent recovery migration for partially applied R44R38R11 deployments without modifying the historical migration file.'),
  ('pwa.update.release.r44r38r11r1.note2','systemSettings','pwa','note','إعادة تثبيت نفس Triggers وسياسات RLS الخاصة بشجرة الحسابات بأمان داخل Transaction واحدة مع الحفاظ على نفس الصلاحيات والمنطق.','Safely re-establishes the same chart-of-accounts triggers and RLS policies in one transaction while preserving the same permissions and logic.'),
  ('pwa.update.release.r44r38r11r1.note3','systemSettings','pwa','note','لا تغيير على الحسابات المالية أو بيانات SEA VIBE أو Offline/Sync أو R44 Pruning؛ الإصلاح خاص بقابلية تنفيذ Migration فقط.','No changes to financial calculations, SEA VIBE business data, Offline/Sync, or R44 Pruning; this recovery only fixes migration replay safety.')
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

-- Supabase SQL Editor confirmation row (read-only).
select
  'R44R38R11R1_RECOVERY_OK'::text as recovery_status,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code in ('1','2','3','4','5') and parent_id is null and is_system=true) as root_accounts,
  (select count(*)::integer from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgisinternal=false and t.tgname in ('trg_sea_vibe_chart_account_validate_r44r11','trg_sea_vibe_default_expense_catalog_account_r44r11','trg_sea_vibe_snapshot_expense_account_r44r11')) as recovery_triggers,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='sea_vibe_chart_accounts' and policyname in ('sea vibe chart accounts read','sea vibe chart accounts insert','sea vibe chart accounts update')) as rls_policies;
