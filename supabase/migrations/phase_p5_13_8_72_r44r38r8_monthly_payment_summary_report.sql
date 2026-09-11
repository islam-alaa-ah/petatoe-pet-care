-- PETATOE P5.13.8.72 R44R38R8 — Monthly Payment Summary Report
-- Translation catalog entries only. No schema/RLS/business-value changes.

begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,true
from (values
  ('appointments.reports.tab.monthlySummary','installationReports','appointments','button','ملخص الشهر','Monthly summary'),
  ('appointments.reports.monthly.note','installationReports','appointments','help','ملخص شهري لقيمة المبيعات شاملة الضريبة حسب اليوم والسيارة وطريقة الدفع.','Monthly VAT-inclusive sales summary by day, vehicle, and payment method.'),
  ('appointments.reports.monthly.day','installationReports','appointments','table','اليوم','Day'),
  ('appointments.reports.monthly.vehicle','installationReports','appointments','table','السيارة','Vehicle'),
  ('appointments.reports.monthly.total','installationReports','appointments','table','الإجمالي','Total'),
  ('appointments.reports.monthly.grandTotal','installationReports','appointments','table','إجمالي الشهر','Month total'),
  ('appointments.reports.monthly.period','installationReports','appointments','label','الفترة: {from} — {to}','Period: {from} — {to}'),
  ('appointments.reports.monthly.loading','installationReports','appointments','status','جاري تجهيز ملخص الشهر...','Preparing monthly summary...'),
  ('appointments.reports.monthly.loadError','installationReports','appointments','status','تعذر تجهيز ملخص الشهر.','Unable to prepare the monthly summary.'),
  ('pwa.update.release.r44r38r8.title','systemSettings','pwa','title','إضافة تقرير ملخص الشهر إلى تقارير المواعيد — R44R38R8','Add Monthly Summary Report to Appointment Reports — R44R38R8'),
  ('pwa.update.release.r44r38r8.note1','systemSettings','pwa','note','إضافة تبويب ملخص الشهر بجوار ملخص المواعيد لعرض كل يوم وسيارة مع قيم المبيعات حسب طرق الدفع والإجمالي.','Adds a Monthly Summary tab beside Appointment Summary showing each day and vehicle with sales values by payment method and total.'),
  ('pwa.update.release.r44r38r8.note2','systemSettings','pwa','note','التقرير يستخدم نفس مصدر ومعادلات ملخص طرق الدفع حسب الفريق ويجمع الشهر المحدد بالكامل دون إنشاء منطق مالي أو مصدر بيانات موازٍ.','The report reuses the same source and payment-summary calculations for the full selected month, without introducing parallel financial logic or data sources.'),
  ('pwa.update.release.r44r38r8.note3','systemSettings','pwa','note','لا تغيير على Offline/Sync أو الصلاحيات أو RLS أو حسابات المواعيد أو R44 Pruning، والتعديل محصور في عرض تقارير المواعيد والترجمة.','No changes to Offline/Sync, permissions, RLS, appointment calculations, or R44 Pruning; changes are limited to Appointment Reports display and localization.')
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
