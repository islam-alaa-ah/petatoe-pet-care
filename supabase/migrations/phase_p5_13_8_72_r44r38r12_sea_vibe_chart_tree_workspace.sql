begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,true
from (values
  ('seaVibe.accounts.search','seaVibeReference','seaVibe','label','بحث في شجرة الحسابات','Search chart of accounts'),
  ('seaVibe.accounts.searchPlaceholder','seaVibeReference','seaVibe','placeholder','ابحث بالكود أو اسم الحساب...','Search by code or account name...'),
  ('seaVibe.accounts.childAccounts','seaVibeReference','seaVibe','label','الحسابات التابعة','Child accounts'),
  ('seaVibe.accounts.addChild','seaVibeReference','seaVibe','button','إضافة حساب فرعي','Add child account'),
  ('seaVibe.accounts.noChildren','seaVibeReference','seaVibe','empty','لا توجد حسابات فرعية تحت هذا الحساب.','No child accounts are available under this account.'),
  ('seaVibe.accounts.noSearchResults','seaVibeReference','seaVibe','empty','لا توجد حسابات مطابقة للبحث.','No accounts match the search.'),
  ('seaVibe.accounts.expand','seaVibeReference','seaVibe','aria','فتح الفرع','Expand branch'),
  ('seaVibe.accounts.collapse','seaVibeReference','seaVibe','aria','إغلاق الفرع','Collapse branch'),
  ('pwa.update.release.r44r38r12.title','systemSettings','pwa','title','إعادة تصميم عرض شجرة حسابات SEA VIBE — R44R38R12','Redesign SEA VIBE Chart of Accounts View — R44R38R12'),
  ('pwa.update.release.r44r38r12.note1','systemSettings','pwa','note','استبدال الجدول المسطح لشجرة الحسابات بمستعرض شجري جانبي مع لوحة تفاصيل للحساب المحدد، بما يطابق أسلوب أنظمة الحسابات الاحترافية.','Replaces the flat chart-of-accounts table with a navigable side tree and selected-account detail pane, matching professional accounting navigation patterns.'),
  ('pwa.update.release.r44r38r12.note2','systemSettings','pwa','note','إضافة فتح وإغلاق الفروع والبحث بالكود أو الاسم وعرض الحسابات التابعة مع إمكانية إضافة حساب فرعي مباشرة من الحساب التجميعي.','Adds branch expand/collapse, code/name search, child-account browsing, and direct child-account creation from group accounts.'),
  ('pwa.update.release.r44r38r12.note3','systemSettings','pwa','note','التغيير خاص بطريقة العرض داخل SEA VIBE فقط؛ لا تغيير على شجرة البيانات أو الحسابات المالية أو ربط المصروفات أو الصلاحيات أو Offline/Sync أو R44 Pruning.','This change only affects the SEA VIBE chart presentation; no changes to account data, financial calculations, expense mappings, permissions, Offline/Sync, or R44 Pruning.')
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
