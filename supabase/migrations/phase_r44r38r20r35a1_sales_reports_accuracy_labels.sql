-- R44R38R20R35A1 — Sales Reports accuracy label completion
-- Scope: translation/fallback labels only. No sales data, invoice logic, RLS, permissions, or reporting RPC changes.

begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('salesReports.common.card','salesReports','crm','label','بطاقة / شبكة','Card / POS','بطاقة / شبكة','Card / POS',true,now()),
  ('salesReports.common.bankTransfer','salesReports','crm','label','تحويل بنكي','Bank Transfer','تحويل بنكي','Bank Transfer',true,now()),
  ('salesReports.report.vat.mismatch','salesReports','crm','status','يوجد فرق بين الإجمالي الفعلي وإعادة بناء الإجمالي من قبل الضريبة والضريبة','The actual total differs from the reconstructed total based on before-VAT plus VAT.','يوجد فرق بين الإجمالي الفعلي وإعادة بناء الإجمالي من قبل الضريبة والضريبة','The actual total differs from the reconstructed total based on before-VAT plus VAT.',true,now()),
  ('pwa.update.release.r44r38r20r35a1.title','aboutApp','system','title','دقة تقارير المبيعات وطرق السداد — R44R38R20R35A1','Sales Reports Accuracy and Payment Methods — R44R38R20R35A1','دقة تقارير المبيعات وطرق السداد — R44R38R20R35A1','Sales Reports Accuracy and Payment Methods — R44R38R20R35A1',true,now()),
  ('pwa.update.release.r44r38r20r35a1.note1','aboutApp','system','note','تصحيح عرض جميع طرق السداد الفعلية في تقرير المبيعات بدل تجميعها تحت غير محدد.','Shows all actual payment methods in Sales Reports instead of collapsing them into an undefined group.','تصحيح عرض جميع طرق السداد الفعلية في تقرير المبيعات بدل تجميعها تحت غير محدد.','Shows all actual payment methods in Sales Reports instead of collapsing them into an undefined group.',true,now()),
  ('pwa.update.release.r44r38r20r35a1.note2','aboutApp','system','note','تصحيح تحليل الضريبة ليعرض الإجمالي الفعلي شامل الضريبة مع إظهار فرق إعادة البناء عند وجوده.','VAT analysis now uses the actual inclusive total and surfaces a reconstruction difference when present.','تصحيح تحليل الضريبة ليعرض الإجمالي الفعلي شامل الضريبة مع إظهار فرق إعادة البناء عند وجوده.','VAT analysis now uses the actual inclusive total and surfaces a reconstruction difference when present.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;
