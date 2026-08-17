-- Phase P5.13.8.3 — Schedule Empty Localization & Completion Actions
-- Adds the missing canonical translation used by the scheduling calendar empty-day cells.

insert into public.app_translations
  (translation_key, screen_key, module_name, text_type, ar_text, en_text, default_ar, default_en)
values
  ('appointments.schedule.noAppointments', 'installationScheduling', 'appointments', 'empty', 'لا توجد مواعيد', 'No appointments', 'لا توجد مواعيد', 'No appointments')
on conflict (translation_key) do update set
  ar_text = coalesce(nullif(public.app_translations.ar_text, ''), excluded.ar_text),
  en_text = coalesce(nullif(public.app_translations.en_text, ''), excluded.en_text),
  default_ar = coalesce(nullif(public.app_translations.default_ar, ''), excluded.default_ar),
  default_en = coalesce(nullif(public.app_translations.default_en, ''), excluded.default_en),
  screen_key = excluded.screen_key,
  module_name = excluded.module_name,
  text_type = excluded.text_type;
