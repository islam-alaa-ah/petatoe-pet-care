-- PETATOE P5.13.8.72 R44R38R9 — Monthly Summary Vehicle Filter
-- Translation catalog entries only. No schema/RLS/business-value changes.

begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,true
from (values
  ('appointments.reports.monthly.allVehicles','installationReports','appointments','option','كل السيارات','All vehicles'),
  ('pwa.update.release.r44r38r9.title','systemSettings','pwa','title','إضافة فلتر السيارة إلى ملخص الشهر — R44R38R9','Add Vehicle Filter to Monthly Summary — R44R38R9'),
  ('pwa.update.release.r44r38r9.note1','systemSettings','pwa','note','إضافة فلتر السيارة داخل ملخص الشهر بقيمة افتراضية كل السيارات مع إمكانية اختيار سيارة واحدة لعرض التقرير الخاص بها.','Adds a Vehicle filter to Monthly Summary, defaulting to All vehicles, with the option to display one vehicle only.'),
  ('pwa.update.release.r44r38r9.note2','systemSettings','pwa','note','الفلتر يعمل على نفس بيانات ملخص الشهر بعد التحميل ويعيد حساب إجماليات طرق الدفع والإجمالي وفق السيارة المختارة دون تغيير المعادلات المالية.','The filter works on the already loaded Monthly Summary data and recalculates payment-method totals and the grand total for the selected vehicle without changing financial formulas.'),
  ('pwa.update.release.r44r38r9.note3','systemSettings','pwa','note','لا تغيير على قاعدة البيانات التشغيلية أو Offline/Sync أو الصلاحيات أو RLS أو R44 Pruning؛ التعديل محصور في عرض التقرير والترجمة.','No operational database, Offline/Sync, permissions, RLS, or R44 Pruning changes; the change is limited to report display and localization.')
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
