begin;

-- P5.13.8.72 R24
-- Canonical rename for the payroll reference screen title.
-- Keep the central localization source aligned with the bundled defaults so
-- the previous remote translation cannot restore the old title after load.
insert into public.app_translations(
  translation_key, screen_key, module_name, text_type,
  ar_text, en_text, default_ar, default_en, is_active, updated_at
) values
  ('sidebar.payrollReference','navigation','payroll','navigation','البيانات المرجعية للرواتب','Payroll Reference Data','البيانات المرجعية للرواتب','Payroll Reference Data',true,now()),
  ('payroll.page.reference.title','payrollReference','payroll','title','البيانات المرجعية للرواتب','Payroll Reference Data','البيانات المرجعية للرواتب','Payroll Reference Data',true,now()),
  ('payroll.reference.title','payrollReference','payroll','title','البيانات المرجعية للرواتب','Payroll Reference Data','البيانات المرجعية للرواتب','Payroll Reference Data',true,now())
on conflict (translation_key) do update set
  screen_key = excluded.screen_key,
  module_name = excluded.module_name,
  text_type = excluded.text_type,
  ar_text = excluded.ar_text,
  en_text = excluded.en_text,
  default_ar = excluded.default_ar,
  default_en = excluded.default_en,
  is_active = true,
  updated_at = now();

commit;
