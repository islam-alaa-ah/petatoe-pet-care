-- PETATOE R44R38R18 — Role Label: Boat Captain + New Chairman Role
-- Scope:
--   1) Preserve stable role key sales_supervisor and rename DISPLAY LABEL only to Boat Captain.
--   2) Add a new stable app_role enum value: chairman (رئيس مجلس الإدارة).
--   3) Seed chairman role permissions as deny-by-default for every active/inactive app screen.
-- Safety:
--   No user role rewrites, no permission widening, no RLS changes, no destructive DDL/DML.
--   Re-running does NOT reset chairman permissions after an administrator configures them.

-- Enum values must be committed before they can be used by later statements.
alter type public.app_role add value if not exists 'chairman';

commit;

begin;

-- Deny-by-default: make the role visible/configurable in the permission matrix without
-- granting any screen/action implicitly. ON CONFLICT DO NOTHING protects later admin choices.
insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export,updated_at
)
select
  'chairman'::public.app_role,
  s.screen_key,
  false,false,false,false,false,
  now()
from public.app_screens s
on conflict(role,screen_key) do nothing;

-- Canonical localization rows. This is an explicit rename request, so the visible ar/en text
-- is updated intentionally while the stable sales_supervisor key remains unchanged.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('permissions.role.sales_supervisor','permissions','system','label',
   'كابتن القارب','Boat Captain','كابتن القارب','Boat Captain',true,now()),
  ('permissions.role.chairman','permissions','system','label',
   'رئيس مجلس الإدارة','Chairman of the Board','رئيس مجلس الإدارة','Chairman of the Board',true,now()),
  ('pwa.update.release.r44r38r18.title','systemSettings','pwa','title',
   'تحديث الأدوار: كابتن القارب ورئيس مجلس الإدارة — R44R38R18',
   'Role Update: Boat Captain & Chairman — R44R38R18',
   'تحديث الأدوار: كابتن القارب ورئيس مجلس الإدارة — R44R38R18',
   'Role Update: Boat Captain & Chairman — R44R38R18',true,now()),
  ('pwa.update.release.r44r38r18.note1','systemSettings','pwa','note',
   'تغيير الاسم المعروض لدور مشرف المبيعات إلى كابتن القارب مع الحفاظ على المفتاح والصلاحيات والمستخدمين الحاليين.',
   'Renames the Sales Supervisor display label to Boat Captain while preserving the stable role key, permissions, and existing users.',
   'تغيير الاسم المعروض لدور مشرف المبيعات إلى كابتن القارب مع الحفاظ على المفتاح والصلاحيات والمستخدمين الحاليين.',
   'Renames the Sales Supervisor display label to Boat Captain while preserving the stable role key, permissions, and existing users.',true,now()),
  ('pwa.update.release.r44r38r18.note2','systemSettings','pwa','note',
   'إضافة دور رئيس مجلس الإدارة كدور مستقل بدون أي صلاحيات افتراضية حتى يتم ضبطها من شاشة إدارة الصلاحيات.',
   'Adds Chairman of the Board as an independent role with no default permissions until configured in Permission Management.',
   'إضافة دور رئيس مجلس الإدارة كدور مستقل بدون أي صلاحيات افتراضية حتى يتم ضبطها من شاشة إدارة الصلاحيات.',
   'Adds Chairman of the Board as an independent role with no default permissions until configured in Permission Management.',true,now()),
  ('pwa.update.release.r44r38r18.note3','systemSettings','pwa','note',
   'لا تغيير في RLS أو نطاقات البيانات أو صلاحيات الأدوار الحالية أو Offline/Sync أو R44 Pruning.',
   'No changes to RLS, data scopes, existing-role permissions, Offline/Sync, or R44 Pruning.',
   'لا تغيير في RLS أو نطاقات البيانات أو صلاحيات الأدوار الحالية أو Offline/Sync أو R44 Pruning.',
   'No changes to RLS, data scopes, existing-role permissions, Offline/Sync, or R44 Pruning.',true,now())
on conflict (translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  is_active=true,
  updated_at=now();

commit;

select
  'R44R38R18_ROLES_CAPTAIN_CHAIRMAN_OK'::text as status,
  (select count(*)::integer
   from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
   where n.nspname='public' and t.typname='app_role' and e.enumlabel='sales_supervisor') as sales_supervisor_key_preserved,
  (select count(*)::integer
   from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
   where n.nspname='public' and t.typname='app_role' and e.enumlabel='chairman') as chairman_enum,
  (select case when count(*)=(select count(*) from public.app_screens) then 1 else 0 end::integer
   from public.role_screen_permissions where role='chairman'::public.app_role) as chairman_permission_coverage,
  (select count(*)::integer
   from public.role_screen_permissions
   where role='chairman'::public.app_role
     and (can_view or can_add or can_edit or can_delete or can_export)) as chairman_default_grants,
  (select count(*)::integer from public.user_profiles where role='sales_supervisor'::public.app_role) as existing_captain_users,
  (select count(*)::integer from public.user_profiles where role='chairman'::public.app_role) as existing_chairman_users,
  (select count(*)::integer from public.app_translations
   where translation_key='permissions.role.sales_supervisor'
     and ar_text='كابتن القارب' and en_text='Boat Captain') as captain_translation,
  (select count(*)::integer from public.app_translations
   where translation_key='permissions.role.chairman'
     and ar_text='رئيس مجلس الإدارة' and en_text='Chairman of the Board') as chairman_translation,
  (select count(*)::integer from public.app_translations
   where translation_key in (
     'pwa.update.release.r44r38r18.title',
     'pwa.update.release.r44r38r18.note1',
     'pwa.update.release.r44r38r18.note2',
     'pwa.update.release.r44r38r18.note3'
   )) as release_translation_rows;
