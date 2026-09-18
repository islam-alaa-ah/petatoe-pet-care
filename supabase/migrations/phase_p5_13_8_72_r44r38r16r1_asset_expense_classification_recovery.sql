-- PETATOE P5.13.8.72 R44R38R16R1 — SEA VIBE Asset Expense Classification & Valuation Recovery
-- Scope:
--   1) Give each expense-catalog item explicit allowed scopes: General / Trip / Asset.
--   2) Classify asset expenses as Operating or Capitalized.
--   3) Only Capitalized asset expenses increase the asset current value.
--   4) Preserve historical asset expenses as Capitalized so existing asset values do not change.
--   5) Seed proper asset-expense catalog items and accounting accounts.
-- Safety:
--   No historical migration edits. No DELETE/DROP/TRUNCATE. No RLS/permission widening.
--   No Offline/Sync changes. No R44 pruning changes.
-- Recovery note:
--   R16 failed inside the transaction because CREATE OR REPLACE VIEW attempted to insert
--   operating_expenses before the existing current_value column. PostgreSQL requires all
--   existing view columns to keep their names/order; this recovery appends operating_expenses
--   after current_value and leaves the historical R16 file untouched.

begin;

-- ---------------------------------------------------------------------------
-- A. Expense catalog policy columns
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_expense_catalog
  add column if not exists allow_general boolean not null default true,
  add column if not exists allow_trip boolean not null default true,
  add column if not exists allow_asset boolean not null default false,
  add column if not exists asset_treatment text not null default 'operating';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expense_catalog'::regclass
      and conname='sea_vibe_expense_catalog_asset_treatment_check'
  ) then
    alter table public.sea_vibe_expense_catalog
      add constraint sea_vibe_expense_catalog_asset_treatment_check
      check (asset_treatment in ('operating','capitalized'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expense_catalog'::regclass
      and conname='sea_vibe_expense_catalog_scope_check'
  ) then
    alter table public.sea_vibe_expense_catalog
      add constraint sea_vibe_expense_catalog_scope_check
      check (allow_general or allow_trip or allow_asset);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expense_catalog'::regclass
      and conname='sea_vibe_expense_catalog_capitalized_scope_check'
  ) then
    alter table public.sea_vibe_expense_catalog
      add constraint sea_vibe_expense_catalog_capitalized_scope_check
      check (asset_treatment<>'capitalized' or (allow_asset and not allow_general and not allow_trip));
  end if;
end $$;

-- Preserve the old manual behavior for current non-system catalog items:
-- General + Trip remain allowed; Asset is no longer implicitly allowed.
update public.sea_vibe_expense_catalog
set allow_general=true,
    allow_trip=true,
    allow_asset=false,
    asset_treatment='operating'
where asset_treatment<>'capitalized';

-- System-calculated trip expenses must never be manually reused as general/asset expenses.
update public.sea_vibe_expense_catalog
set allow_general=false,
    allow_trip=true,
    allow_asset=false,
    asset_treatment='operating'
where coalesce(is_system,false)=true
   or system_key in ('sailing_permit','fuel_cost','automatic_commission');

-- Captain commission is trip-specific even when it is a legacy manual catalog row.
update public.sea_vibe_expense_catalog
set allow_general=false,
    allow_trip=true,
    allow_asset=false,
    asset_treatment='operating'
where lower(coalesce(name_en,''))='captain commission'
   or name_ar='عمولة كابتن الرحلة';

-- ---------------------------------------------------------------------------
-- B. Accounting accounts for asset expenditure
-- ---------------------------------------------------------------------------
insert into public.sea_vibe_chart_accounts(
  account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order
)
select '1201','أصول SEA VIBE','SEA VIBE Assets',p.id,1,true,false,true,1201
from public.sea_vibe_chart_accounts p
where p.account_code='12'
on conflict(account_code) do nothing;

insert into public.sea_vibe_chart_accounts(
  account_code,name_ar,name_en,parent_id,root_class,allow_posting,is_system,is_active,sort_order
)
select s.account_code,s.name_ar,s.name_en,p.id,5,true,false,true,s.sort_order
from (values
  ('5301','صيانة وإصلاح الأصول','Asset Maintenance & Repair',5301),
  ('5302','قطع غيار الأصول','Asset Spare Parts',5302)
) as s(account_code,name_ar,name_en,sort_order)
join public.sea_vibe_chart_accounts p on p.account_code='53'
on conflict(account_code) do nothing;

-- ---------------------------------------------------------------------------
-- C. Proper asset-expense catalog items
-- ---------------------------------------------------------------------------
insert into public.sea_vibe_expense_catalog(
  name_ar,name_en,system_key,is_system,is_active,account_id,
  allow_general,allow_trip,allow_asset,asset_treatment
)
select x.name_ar,x.name_en,null,false,true,a.id,false,false,true,x.asset_treatment
from (values
  ('صيانة وإصلاح الأصل','Asset Maintenance & Repair','5301','operating'),
  ('قطع غيار الأصل','Asset Spare Parts','5302','operating'),
  ('تحسينات رأسمالية للأصل','Capital Improvements','1201','capitalized')
) as x(name_ar,name_en,account_code,asset_treatment)
join public.sea_vibe_chart_accounts a on a.account_code=x.account_code
on conflict(name_ar) do update set
  name_en=excluded.name_en,
  account_id=excluded.account_id,
  allow_general=false,
  allow_trip=false,
  allow_asset=true,
  asset_treatment=excluded.asset_treatment,
  is_active=true,
  updated_at=now();

-- ---------------------------------------------------------------------------
-- D. Snapshot asset treatment on expense rows
-- ---------------------------------------------------------------------------
alter table public.sea_vibe_expenses
  add column if not exists asset_cost_treatment text not null default 'operating';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sea_vibe_expenses'::regclass
      and conname='sea_vibe_expenses_asset_cost_treatment_check'
  ) then
    alter table public.sea_vibe_expenses
      add constraint sea_vibe_expenses_asset_cost_treatment_check
      check (asset_cost_treatment in ('operating','capitalized'));
  end if;
end $$;

-- Historical preservation rule:
-- Before R16 every asset-scoped expense increased current_value, therefore every
-- pre-R16 asset row remains Capitalized. Do not rewrite its account snapshot.
alter table public.sea_vibe_expenses disable trigger user;
update public.sea_vibe_expenses
set asset_cost_treatment=case when expense_scope='asset' then 'capitalized' else 'operating' end
where asset_cost_treatment is distinct from case when expense_scope='asset' then 'capitalized' else 'operating' end;
alter table public.sea_vibe_expenses enable trigger user;

-- Canonical owner: extend the existing account-snapshot trigger function rather
-- than layering another overlapping trigger on sea_vibe_expenses.
create or replace function public.sea_vibe_snapshot_expense_account_r44r11()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_catalog public.sea_vibe_expense_catalog%rowtype;
  v_policy_changed boolean;
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
  end if;

  return new;
end;
$$;

-- Keep the existing public RPC name, but make its validation treatment-aware.
create or replace function public.sea_vibe_set_expense_catalog_account_r44r11(p_catalog_id uuid,p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_account public.sea_vibe_chart_accounts%rowtype;
  v_catalog public.sea_vibe_expense_catalog%rowtype;
begin
  if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;

  select * into v_catalog from public.sea_vibe_expense_catalog where id=p_catalog_id;
  if not found then raise exception 'SEA_VIBE_EXPENSE_CATALOG_NOT_FOUND'; end if;

  select * into v_account from public.sea_vibe_chart_accounts where id=p_account_id;
  if not found then raise exception 'SEA_VIBE_ACCOUNT_NOT_FOUND'; end if;
  if not v_account.is_active then raise exception 'SEA_VIBE_ACCOUNT_INACTIVE'; end if;
  if not v_account.allow_posting then raise exception 'SEA_VIBE_ACCOUNT_POSTING_REQUIRED'; end if;

  if v_catalog.asset_treatment='capitalized' then
    if not v_catalog.allow_asset or v_catalog.allow_general or v_catalog.allow_trip then
      raise exception 'SEA_VIBE_CAPITALIZED_EXPENSE_ASSET_ONLY_REQUIRED';
    end if;
    if v_account.root_class<>1 then raise exception 'SEA_VIBE_ASSET_ACCOUNT_REQUIRED'; end if;
  else
    if v_account.root_class<>5 then raise exception 'SEA_VIBE_EXPENSE_ACCOUNT_REQUIRED'; end if;
  end if;

  update public.sea_vibe_expense_catalog
  set account_id=p_account_id,updated_at=now()
  where id=p_catalog_id;

  return true;
end;
$$;

-- Asset valuation now includes Capitalized rows only. Operating maintenance stays
-- visible as an asset operating expense but never increases carrying value.
create or replace view public.sea_vibe_assets_with_value with (security_invoker=true) as
select a.*,
       coalesce(sum(e.amount) filter(
         where e.expense_scope='asset' and e.asset_cost_treatment='capitalized'
       ),0)::numeric(14,2) as capitalized_expenses,
       (a.initial_value+coalesce(sum(e.amount) filter(
         where e.expense_scope='asset' and e.asset_cost_treatment='capitalized'
       ),0))::numeric(14,2) as current_value,
       coalesce(sum(e.amount) filter(
         where e.expense_scope='asset' and e.asset_cost_treatment='operating'
       ),0)::numeric(14,2) as operating_expenses
from public.sea_vibe_assets a
left join public.sea_vibe_expenses e on e.asset_id=a.id
group by a.id;

grant select on public.sea_vibe_assets_with_value to authenticated;
revoke all on function public.sea_vibe_set_expense_catalog_account_r44r11(uuid,uuid) from public,anon;
grant execute on function public.sea_vibe_set_expense_catalog_account_r44r11(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- E. Localization keys for the upcoming canonical frontend gate
-- ---------------------------------------------------------------------------
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
) values
  ('seaVibe.asset.operatingExpenses','seaVibeAssets','seaVibe','label','مصروفات تشغيلية','Operating Expenses','مصروفات تشغيلية','Operating Expenses',true,now()),
  ('seaVibe.asset.capitalizedExpenses','seaVibeAssets','seaVibe','label','مصروفات رأسمالية','Capitalized Expenses','مصروفات رأسمالية','Capitalized Expenses',true,now()),
  ('seaVibe.expense.assetTreatment','seaVibeExpenseNew','seaVibe','label','المعالجة المحاسبية','Accounting Treatment','المعالجة المحاسبية','Accounting Treatment',true,now()),
  ('seaVibe.expense.assetTreatmentOperating','seaVibeExpenseNew','seaVibe','status','تشغيلي — لا يضاف لقيمة الأصل','Operating — does not increase asset value','تشغيلي — لا يضاف لقيمة الأصل','Operating — does not increase asset value',true,now()),
  ('seaVibe.expense.assetTreatmentCapitalized','seaVibeExpenseNew','seaVibe','status','رأسمالي — يضاف لقيمة الأصل','Capitalized — increases asset value','رأسمالي — يضاف لقيمة الأصل','Capitalized — increases asset value',true,now()),
  ('seaVibe.expense.noItemsForScope','seaVibeExpenseNew','seaVibe','empty','لا توجد بنود مصروف متاحة لهذا النوع.','No expense items are available for this scope.','لا توجد بنود مصروف متاحة لهذا النوع.','No expense items are available for this scope.',true,now()),
  ('pwa.update.release.r44r38r16.title','systemSettings','pwa','title','تصنيف مصروفات الأصول والمعالجة الرأسمالية — R44R38R16','Asset Expense Classification & Capitalization — R44R38R16','تصنيف مصروفات الأصول والمعالجة الرأسمالية — R44R38R16','Asset Expense Classification & Capitalization — R44R38R16',true,now()),
  ('pwa.update.release.r44r38r16.note1','systemSettings','pwa','note','فصل بنود المصروفات العامة والرحلات والأصول بحيث تعرض شاشة مصروف الأصل البنود المخصصة للأصول فقط.','Separates general, trip, and asset expense items so asset-expense entry shows only asset-eligible items.','فصل بنود المصروفات العامة والرحلات والأصول بحيث تعرض شاشة مصروف الأصل البنود المخصصة للأصول فقط.','Separates general, trip, and asset expense items so asset-expense entry shows only asset-eligible items.',true,now()),
  ('pwa.update.release.r44r38r16.note2','systemSettings','pwa','note','التفريق بين مصروف الأصل التشغيلي والمصروف الرأسمالي، ولا يرفع قيمة الأصل إلا المصروف الرأسمالي.','Distinguishes operating asset expense from capitalized expenditure; only capitalized expenditure increases asset value.','التفريق بين مصروف الأصل التشغيلي والمصروف الرأسمالي، ولا يرفع قيمة الأصل إلا المصروف الرأسمالي.','Distinguishes operating asset expense from capitalized expenditure; only capitalized expenditure increases asset value.',true,now()),
  ('pwa.update.release.r44r38r16.note3','systemSettings','pwa','note','الحفاظ على مصروفات الأصول التاريخية كرأسمالية بدون تغيير قيم الأصول الحالية أو Offline/Sync أو RLS أو الصلاحيات.','Preserves historical asset expenses as capitalized without changing current asset values, Offline/Sync, RLS, or permissions.','الحفاظ على مصروفات الأصول التاريخية كرأسمالية بدون تغيير قيم الأصول الحالية أو Offline/Sync أو RLS أو الصلاحيات.','Preserves historical asset expenses as capitalized without changing current asset values, Offline/Sync, RLS, or permissions.',true,now())
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
-- Verification
-- ---------------------------------------------------------------------------
select
  'R44R38R16R1_ASSET_EXPENSE_CLASSIFICATION_RECOVERY_OK'::text as status,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_expense_catalog' and column_name in ('allow_general','allow_trip','allow_asset','asset_treatment')) as catalog_policy_columns,
  (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='sea_vibe_expenses' and column_name='asset_cost_treatment') as treatment_snapshot_column,
  (select count(*)::integer from public.sea_vibe_chart_accounts where account_code in ('1201','5301','5302') and is_active=true and allow_posting=true) as asset_accounts,
  (select count(*)::integer from public.sea_vibe_expense_catalog where name_ar in ('صيانة وإصلاح الأصل','قطع غيار الأصل','تحسينات رأسمالية للأصل') and is_active=true and allow_asset=true and allow_general=false and allow_trip=false) as asset_catalog_rows,
  (select count(*)::integer from public.sea_vibe_expense_catalog where name_ar in ('صيانة وإصلاح الأصل','قطع غيار الأصل') and asset_treatment='operating') as operating_asset_catalog_rows,
  (select count(*)::integer from public.sea_vibe_expense_catalog where name_ar='تحسينات رأسمالية للأصل' and asset_treatment='capitalized') as capitalized_asset_catalog_rows,
  (select count(*)::integer from public.sea_vibe_expenses where expense_scope='asset' and asset_cost_treatment='capitalized') as historical_and_capitalized_asset_rows,
  (select count(*)::integer from public.sea_vibe_expenses where expense_scope<>'asset' and asset_cost_treatment<>'operating') as invalid_non_asset_treatment_rows,
  (select case when pg_get_functiondef(p.oid) ilike '%SEA_VIBE_EXPENSE_SCOPE_NOT_ALLOWED%' and pg_get_functiondef(p.oid) ilike '%SEA_VIBE_SYSTEM_EXPENSE_MANUAL_NOT_ALLOWED%' and pg_get_functiondef(p.oid) ilike '%asset_cost_treatment%' then 1 else 0 end::integer
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='sea_vibe_snapshot_expense_account_r44r11' limit 1) as canonical_scope_guard,
  (select case when pg_get_viewdef('public.sea_vibe_assets_with_value'::regclass,true) ilike '%asset_cost_treatment%capitalized%' and pg_get_viewdef('public.sea_vibe_assets_with_value'::regclass,true) ilike '%operating_expenses%' then 1 else 0 end::integer) as treatment_aware_asset_view,
  (select count(*)::integer from public.app_translations where translation_key in ('seaVibe.asset.operatingExpenses','seaVibe.expense.assetTreatmentOperating','seaVibe.expense.assetTreatmentCapitalized','pwa.update.release.r44r38r16.title')) as translation_rows;
