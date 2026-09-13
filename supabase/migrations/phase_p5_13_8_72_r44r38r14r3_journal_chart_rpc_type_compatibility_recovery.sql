-- PETATOE P5.13.8.72 R44R38R14R3 — SEA VIBE Manual Journal Chart RPC Type Compatibility Recovery
-- Root cause: sea_vibe_chart_accounts.root_class is SMALLINT while the R14R1 RPC contract returns INTEGER.
-- PL/pgSQL RETURN QUERY requires the returned row structure to match the declared table result types.
-- Recovery: preserve the existing RPC contract and permission boundary; explicitly cast root_class to INTEGER.
-- No table/view/policy/RLS changes, no permission widening, no destructive data/schema DDL, no pruning changes.

begin;

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
    a.id::uuid,
    a.account_code::text,
    a.name_ar::text,
    a.name_en::text,
    a.parent_id::uuid,
    a.root_class::integer,
    a.allow_posting::boolean,
    a.is_system::boolean,
    a.is_active::boolean,
    a.sort_order::integer,
    a.created_at::timestamptz,
    a.updated_at::timestamptz
  from public.sea_vibe_chart_accounts a
  where a.is_active=true
  order by a.sort_order,a.account_code;
end;
$$;

revoke all on function public.sea_vibe_journal_chart_accounts_r44r14r1() from public,anon;
grant execute on function public.sea_vibe_journal_chart_accounts_r44r14r1() to authenticated;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('pwa.update.release.r44r38r14r3.title','aboutApp','system','title','استعادة توافق أنواع حسابات قيود اليومية — R44R38R14R3','Journal Account RPC Type Compatibility Recovery — R44R38R14R3','استعادة توافق أنواع حسابات قيود اليومية — R44R38R14R3','Journal Account RPC Type Compatibility Recovery — R44R38R14R3',true,now()),
  ('pwa.update.release.r44r38r14r3.note1','aboutApp','system','note','تصحيح عدم تطابق نوع root_class بين جدول شجرة الحسابات وعقد RPC الخاصة بقيود اليومية.','Fixes the root_class type mismatch between the chart-of-accounts table and the Journal Entries RPC contract.','تصحيح عدم تطابق نوع root_class بين جدول شجرة الحسابات وعقد RPC الخاصة بقيود اليومية.','Fixes the root_class type mismatch between the chart-of-accounts table and the Journal Entries RPC contract.',true,now()),
  ('pwa.update.release.r44r38r14r3.note2','aboutApp','system','note','الحفاظ على نفس RPC المحدودة بصلاحية seaVibeJournals:view بدون أي توسيع لـ RLS أو الصلاحيات.','Preserves the same seaVibeJournals:view-scoped RPC without any RLS or permission widening.','الحفاظ على نفس RPC المحدودة بصلاحية seaVibeJournals:view بدون أي توسيع لـ RLS أو الصلاحيات.','Preserves the same seaVibeJournals:view-scoped RPC without any RLS or permission widening.',true,now()),
  ('pwa.update.release.r44r38r14r3.note3','aboutApp','system','note','لا تغيير في منطق القيود أو الخزينة أو الحسابات أو Offline/Sync أو R44 Pruning.','No changes to journal accounting, treasury, chart logic, Offline/Sync, or R44 Pruning.','لا تغيير في منطق القيود أو الخزينة أو الحسابات أو Offline/Sync أو R44 Pruning.','No changes to journal accounting, treasury, chart logic, Offline/Sync, or R44 Pruning.',true,now())
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

-- Read-only verification. This does not execute the permission-scoped RPC from SQL Editor;
-- it verifies the production column type, preserved RPC result contract, and explicit compatibility cast.
select
  'R44R38R14R3_JOURNAL_RPC_TYPE_RECOVERY_OK'::text as status,
  (select data_type from information_schema.columns where table_schema='public' and table_name='sea_vibe_chart_accounts' and column_name='root_class') as source_root_class_type,
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_journal_chart_accounts_r44r14r1') as journal_account_rpc,
  (select case when pg_get_function_result(p.oid) ilike '%root_class integer%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_journal_chart_accounts_r44r14r1' limit 1) as rpc_integer_contract,
  (select case when pg_get_functiondef(p.oid) ilike '%a.root_class::integer%' then 1 else 0 end::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sea_vibe_journal_chart_accounts_r44r14r1' limit 1) as explicit_root_class_cast,
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='sea_vibe_chart_accounts' and policyname='sea vibe chart accounts journal read') as unsafe_chart_policy;
