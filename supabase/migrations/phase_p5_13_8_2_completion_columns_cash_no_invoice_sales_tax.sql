-- Phase P5.13.8.2 — Completion Columns + Cash No-Invoice + Sales Invoice VAT Column
-- Adds only the new UI translation keys; existing non-empty translations are preserved.
begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active
) values
  ('appointments.completion.requestDate','appointments','appointments','label','تاريخ الطلب','Request date','تاريخ الطلب','Request date',true),
  ('appointments.completion.collectionInvoiceNumber','appointments','appointments','label','رقم الفاتورة','Invoice number','رقم الفاتورة','Invoice number',true),
  ('appointments.completion.collectionInvoicePlaceholder','appointments','appointments','placeholder','اكتب رقم أو رمز الفاتورة','Enter invoice number or code','اكتب رقم أو رمز الفاتورة','Enter invoice number or code',true),
  ('appointments.completion.noInvoice','appointments','appointments','label','بدون فاتورة','No invoice','بدون فاتورة','No invoice',true),
  ('invoices.col.amountInclTax','salesInvoices','sales','label','القيمة شاملة الضريبة','Value including VAT','القيمة شاملة الضريبة','Value including VAT',true)
on conflict (translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case when coalesce(trim(public.app_translations.ar_text),'')='' then excluded.ar_text else public.app_translations.ar_text end,
  en_text=case when coalesce(trim(public.app_translations.en_text),'')='' then excluded.en_text else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

commit;
notify pgrst,'reload schema';
