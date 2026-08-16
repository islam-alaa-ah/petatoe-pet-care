-- Phase P5.13.8.1 — Completion Localization + Invoiced Row Recovery
-- Adds only the missing Appointment Completion UI keys. Existing non-empty translations are preserved.
begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  default_ar,default_en,ar_text,en_text,is_active
) values
  ('appointments.completion.confirmQty','appointments','appointments','button','تأكيد الكمية المنفذة','Confirm executed quantity','تأكيد الكمية المنفذة','Confirm executed quantity',true),
  ('appointments.completion.toInvoice','appointments','appointments','button','تحويل إلى فاتورة','Convert to invoice','تحويل إلى فاتورة','Convert to invoice',true),
  ('appointments.completion.noInvoicePermission','appointments','appointments','help','لا توجد صلاحية إضافة فاتورة','No permission to add an invoice','لا توجد صلاحية إضافة فاتورة','No permission to add an invoice',true),
  ('appointments.completion.noConfirmPermission','appointments','appointments','help','لا توجد صلاحية تأكيد','No permission to confirm','لا توجد صلاحية تأكيد','No permission to confirm',true),
  ('appointments.completion.empty','appointments','appointments','empty','لا توجد مواعيد مكتملة بانتظار التحويل إلى فاتورة.','No completed appointments are waiting to be converted to an invoice.','لا توجد مواعيد مكتملة بانتظار التحويل إلى فاتورة.','No completed appointments are waiting to be converted to an invoice.',true),
  ('appointments.completion.loading','appointments','appointments','status','جاري تحميل المواعيد المكتملة...','Loading completed appointments...','جاري تحميل المواعيد المكتملة...','Loading completed appointments...',true)
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
