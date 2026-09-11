-- R44R35 — Financial runtime localization (L4)
-- Non-destructive seed for canonical public.app_translations.
-- Existing customized translations are preserved; only blank values are filled.

begin;

with translation_seed(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at) as (
values
  ('shared.money.zeroSar','shared','core','label','0.00 ر.س','SAR 0.00','0.00 ر.س','SAR 0.00',true,now()),
  ('invoices.summary.aria','salesInvoices','crm','aria','ملخص فواتير المبيعات','Sales invoices summary','ملخص فواتير المبيعات','Sales invoices summary',true,now()),
  ('invoices.attachments.item','salesInvoices','crm','label','مرفق','Attachment','مرفق','Attachment',true,now()),
  ('invoices.attachments.loadingPreview','salesInvoices','crm','status','جاري تحميل المعاينة...','Loading preview...','جاري تحميل المعاينة...','Loading preview...',true,now()),
  ('invoices.attachments.previewError','salesInvoices','crm','error','تعذر تحميل معاينة المرفق.','Unable to load attachment preview.','تعذر تحميل معاينة المرفق.','Unable to load attachment preview.',true,now()),
  ('invoices.attachments.previewUnavailable','salesInvoices','crm','help','المعاينة المباشرة غير متاحة لهذا النوع من الملفات.','Live preview is unavailable for this file type.','المعاينة المباشرة غير متاحة لهذا النوع من الملفات.','Live preview is unavailable for this file type.',true,now()),
  ('invoices.error.supabaseNotReady','salesInvoices','crm','error','اتصال Supabase غير جاهز.','Supabase connection is not ready.','اتصال Supabase غير جاهز.','Supabase connection is not ready.',true,now()),
  ('invoices.error.permission','salesInvoices','crm','error','ليس لديك صلاحية تنفيذ هذا الإجراء على فواتير المبيعات.','You do not have permission to perform this action on sales invoices.','ليس لديك صلاحية تنفيذ هذا الإجراء على فواتير المبيعات.','You do not have permission to perform this action on sales invoices.',true,now()),
  ('invoices.error.loadListPrefix','salesInvoices','crm','error','تعذر تحميل فواتير المبيعات:','Unable to load sales invoices:','تعذر تحميل فواتير المبيعات:','Unable to load sales invoices:',true,now()),
  ('invoices.error.loadReferencesPrefix','salesInvoices','crm','error','تعذر تحميل مراجع الفواتير:','Unable to load invoice references:','تعذر تحميل مراجع الفواتير:','Unable to load invoice references:',true,now()),
  ('invoices.error.loadExecutionAttachmentsPrefix','salesInvoices','crm','error','تعذر تحميل مرفقات التنفيذ:','Unable to load execution attachments:','تعذر تحميل مرفقات التنفيذ:','Unable to load execution attachments:',true,now()),
  ('invoices.error.loadPaymentPrefix','salesInvoices','crm','error','تعذر تحميل طريقة دفع الفواتير:','Unable to load invoice payment method:','تعذر تحميل طريقة دفع الفواتير:','Unable to load invoice payment method:',true,now()),
  ('invoices.error.loadManualCatalogPrefix','salesInvoices','crm','error','تعذر تحميل بيانات الفاتورة اليدوية:','Unable to load manual invoice data:','تعذر تحميل بيانات الفاتورة اليدوية:','Unable to load manual invoice data:',true,now()),
  ('invoices.error.customerRequired','salesInvoices','crm','error','اختر العميل.','Select a customer.','اختر العميل.','Select a customer.',true,now()),
  ('invoices.error.numberOrWithout','salesInvoices','crm','error','رقم الفاتورة مطلوب أو اختر بدون فاتورة.','Invoice number is required, or select No invoice.','رقم الفاتورة مطلوب أو اختر بدون فاتورة.','Invoice number is required, or select No invoice.',true,now()),
  ('invoices.error.dateRequired','salesInvoices','crm','error','تاريخ الفاتورة مطلوب.','Invoice date is required.','تاريخ الفاتورة مطلوب.','Invoice date is required.',true,now()),
  ('invoices.error.paymentRequired','salesInvoices','crm','error','اختر طريقة الدفع.','Select a payment method.','اختر طريقة الدفع.','Select a payment method.',true,now()),
  ('invoices.error.serviceRequired','salesInvoices','crm','error','أضف خدمة واحدة على الأقل.','Add at least one service.','أضف خدمة واحدة على الأقل.','Add at least one service.',true,now()),
  ('invoices.error.servicesInvalid','salesInvoices','crm','error','راجع نوع الخدمة والعدد والسعر في جميع الخدمات.','Review the service type, quantity, and price for all services.','راجع نوع الخدمة والعدد والسعر في جميع الخدمات.','Review the service type, quantity, and price for all services.',true,now()),
  ('invoices.error.createManualPrefix','salesInvoices','crm','error','تعذر إنشاء الفاتورة اليدوية:','Unable to create manual invoice:','تعذر إنشاء الفاتورة اليدوية:','Unable to create manual invoice:',true,now()),
  ('invoices.error.numberRequired','salesInvoices','crm','error','رقم الفاتورة مطلوب.','Invoice number is required.','رقم الفاتورة مطلوب.','Invoice number is required.',true,now()),
  ('invoices.error.contractConvertPrefix','salesInvoices','crm','error','تعذر تحويل العقد إلى فاتورة:','Unable to convert the contract to an invoice:','تعذر تحويل العقد إلى فاتورة:','Unable to convert the contract to an invoice:',true,now()),
  ('invoices.error.visitDataIncomplete','salesInvoices','crm','error','بيانات زيارة التركيب غير مكتملة.','Appointment visit data is incomplete.','بيانات زيارة التركيب غير مكتملة.','Appointment visit data is incomplete.',true,now()),
  ('invoices.error.executionConvertPrefix','salesInvoices','crm','error','تعذر تحويل الكمية المنفذة إلى فاتورة:','Unable to convert the executed quantity to an invoice:','تعذر تحويل الكمية المنفذة إلى فاتورة:','Unable to convert the executed quantity to an invoice:',true,now()),
  ('invoices.error.loadEditPrefix','salesInvoices','crm','error','تعذر تحميل بيانات تعديل الفاتورة:','Unable to load invoice edit data:','تعذر تحميل بيانات تعديل الفاتورة:','Unable to load invoice edit data:',true,now()),
  ('invoices.error.idRequired','salesInvoices','crm','error','معرّف الفاتورة مطلوب.','Invoice ID is required.','معرّف الفاتورة مطلوب.','Invoice ID is required.',true,now()),
  ('invoices.error.imageUnsupported','salesInvoices','crm','error','صيغة الصورة غير مدعومة.','Unsupported image format.','صيغة الصورة غير مدعومة.','Unsupported image format.',true,now()),
  ('invoices.error.imageSize','salesInvoices','crm','error','حجم الصورة يجب أن يكون بين 1 بايت و10 ميجابايت.','Image size must be between 1 byte and 10 MB.','حجم الصورة يجب أن يكون بين 1 بايت و10 ميجابايت.','Image size must be between 1 byte and 10 MB.',true,now()),
  ('invoices.error.uploadAttachmentPrefix','salesInvoices','crm','error','تعذر رفع مرفق التحصيل:','Unable to upload collection attachment:','تعذر رفع مرفق التحصيل:','Unable to upload collection attachment:',true,now()),
  ('invoices.error.registerAttachmentPrefix','salesInvoices','crm','error','تعذر تسجيل مرفق التحصيل:','Unable to register collection attachment:','تعذر تسجيل مرفق التحصيل:','Unable to register collection attachment:',true,now()),
  ('invoices.error.saveEditPrefix','salesInvoices','crm','error','تعذر حفظ تعديل الفاتورة:','Unable to save invoice changes:','تعذر حفظ تعديل الفاتورة:','Unable to save invoice changes:',true,now()),
  ('invoices.error.installationPaymentRequired','salesInvoices','crm','error','طريقة الدفع مطلوبة لفاتورة الموعد.','A payment method is required for an appointment invoice.','طريقة الدفع مطلوبة لفاتورة الموعد.','A payment method is required for an appointment invoice.',true,now()),
  ('invoices.error.updatePrefix','salesInvoices','crm','error','تعذر تعديل بيانات الفاتورة:','Unable to update invoice data:','تعذر تعديل بيانات الفاتورة:','Unable to update invoice data:',true,now()),
  ('vehicleTreasury.filter.searchPlaceholder','vehicleTreasury','finance','placeholder','رقم الفاتورة أو البيان...','Invoice number or description...','رقم الفاتورة أو البيان...','Invoice number or description...',true,now()),
  ('vehicleTreasury.expense.dialogNote','vehicleTreasury','finance','help','سجل حركة صرف على السيارة / الفرقة المسموح بها.','Record an expense movement for an allowed vehicle / team.','سجل حركة صرف على السيارة / الفرقة المسموح بها.','Record an expense movement for an allowed vehicle / team.',true,now()),
  ('vehicleTreasury.expense.team','vehicleTreasury','finance','label','السيارة / الفرقة','Vehicle / Team','السيارة / الفرقة','Vehicle / Team',true,now()),
  ('vehicleTreasury.expense.date','vehicleTreasury','finance','label','التاريخ','Date','التاريخ','Date',true,now()),
  ('vehicleTreasury.expense.description','vehicleTreasury','finance','label','بيان المصروف','Expense Description','بيان المصروف','Expense Description',true,now()),
  ('vehicleTreasury.expense.amount','vehicleTreasury','finance','label','القيمة (ر.س)','Amount (SAR)','القيمة (ر.س)','Amount (SAR)',true,now()),
  ('vehicleTreasury.expense.notes','vehicleTreasury','finance','label','ملاحظات','Notes','ملاحظات','Notes',true,now()),
  ('vehicleTreasury.error.permission','vehicleTreasury','finance','error','لا توجد صلاحية لهذه العملية في خزينة السيارة.','You do not have permission for this Vehicle Treasury action.','لا توجد صلاحية لهذه العملية في خزينة السيارة.','You do not have permission for this Vehicle Treasury action.',true,now()),
  ('vehicleTreasury.error.userScope','vehicleTreasury','finance','error','تعذر تحديد المستخدم الحالي لعزل بيانات خزينة السيارة.','Unable to determine the current user for Vehicle Treasury data isolation.','تعذر تحديد المستخدم الحالي لعزل بيانات خزينة السيارة.','Unable to determine the current user for Vehicle Treasury data isolation.',true,now()),
  ('vehicleTreasury.error.versionCheckPrefix','vehicleTreasury','finance','error','تعذر التحقق من إصدارات حركات خزينة السيارة:','Unable to verify Vehicle Treasury movement versions:','تعذر التحقق من إصدارات حركات خزينة السيارة:','Unable to verify Vehicle Treasury movement versions:',true,now()),
  ('vehicleTreasury.error.offlineNoCache','vehicleTreasury','finance','error','لا توجد بيانات خزينة سيارة محفوظة لهذا المستخدم وهذا النطاق للعمل دون اتصال.','No cached Vehicle Treasury data is available for this user and scope while offline.','لا توجد بيانات خزينة سيارة محفوظة لهذا المستخدم وهذا النطاق للعمل دون اتصال.','No cached Vehicle Treasury data is available for this user and scope while offline.',true,now()),
  ('vehicleTreasury.error.savePrefix','vehicleTreasury','finance','error','تعذر تسجيل المصروف:','Unable to record the expense:','تعذر تسجيل المصروف:','Unable to record the expense:',true,now()),
  ('vehicleTreasury.error.conflict','vehicleTreasury','finance','error','تم تعديل حركة خزينة السيارة على الخادم بعد آخر مزامنة.','The Vehicle Treasury movement was changed on the server after the last sync.','تم تعديل حركة خزينة السيارة على الخادم بعد آخر مزامنة.','The Vehicle Treasury movement was changed on the server after the last sync.',true,now()),
  ('vehicleTreasury.error.editPrefix','vehicleTreasury','finance','error','تعذر تعديل المصروف:','Unable to update the expense:','تعذر تعديل المصروف:','Unable to update the expense:',true,now()),
  ('vehicleTreasury.error.syncNotReady','vehicleTreasury','finance','error','نظام المزامنة غير جاهز.','The sync system is not ready.','نظام المزامنة غير جاهز.','The sync system is not ready.',true,now()),
  ('vehicleTreasury.error.offlineParent','vehicleTreasury','finance','error','تعذر ربط تعديل المصروف المحلي بعملية الإنشاء الأصلية.','Unable to link the local expense update to its original create operation.','تعذر ربط تعديل المصروف المحلي بعملية الإنشاء الأصلية.','Unable to link the local expense update to its original create operation.',true,now()),
  ('vehicleTreasury.validation.team','vehicleTreasury','finance','error','اختر السيارة / الفرقة.','Select a vehicle / team.','اختر السيارة / الفرقة.','Select a vehicle / team.',true,now()),
  ('vehicleTreasury.validation.date','vehicleTreasury','finance','error','تاريخ الصرف مطلوب.','Expense date is required.','تاريخ الصرف مطلوب.','Expense date is required.',true,now()),
  ('vehicleTreasury.validation.description','vehicleTreasury','finance','error','بيان المصروف مطلوب.','Expense description is required.','بيان المصروف مطلوب.','Expense description is required.',true,now()),
  ('vehicleTreasury.validation.amount','vehicleTreasury','finance','error','قيمة المصروف يجب أن تكون أكبر من صفر.','Expense amount must be greater than zero.','قيمة المصروف يجب أن تكون أكبر من صفر.','Expense amount must be greater than zero.',true,now()),
  ('vehicleTreasury.error.offlineEditNeedsRefresh','vehicleTreasury','finance','error','يلزم تحديث بيانات حركة الصرف مرة واحدة أثناء الاتصال قبل تعديلها دون اتصال.','Refresh the expense movement once while online before editing it offline.','يلزم تحديث بيانات حركة الصرف مرة واحدة أثناء الاتصال قبل تعديلها دون اتصال.','Refresh the expense movement once while online before editing it offline.',true,now()),
  ('vehicleTreasury.error.staleEdit','vehicleTreasury','finance','error','نسخة حركة الصرف غير محدثة. حدّث خزينة السيارة ثم أعد التعديل.','The expense movement copy is stale. Refresh Vehicle Treasury and try editing again.','نسخة حركة الصرف غير محدثة. حدّث خزينة السيارة ثم أعد التعديل.','The expense movement copy is stale. Refresh Vehicle Treasury and try editing again.',true,now()),
  ('vehicleTreasury.error.idMissing','vehicleTreasury','finance','error','معرّف المصروف غير موجود.','Expense ID is missing.','معرّف المصروف غير موجود.','Expense ID is missing.',true,now()),
  ('vehicleTreasury.error.localDeletePending','vehicleTreasury','finance','error','لا يمكن حذف حركة محلية قبل اكتمال مزامنتها.','A local movement cannot be deleted before its sync completes.','لا يمكن حذف حركة محلية قبل اكتمال مزامنتها.','A local movement cannot be deleted before its sync completes.',true,now()),
  ('vehicleTreasury.error.deleteOnlineRequired','vehicleTreasury','finance','error','يلزم الاتصال بالإنترنت لحذف حركة من خزينة السيارة.','An internet connection is required to delete a Vehicle Treasury movement.','يلزم الاتصال بالإنترنت لحذف حركة من خزينة السيارة.','An internet connection is required to delete a Vehicle Treasury movement.',true,now()),
  ('vehicleTreasury.error.deletePrefix','vehicleTreasury','finance','error','تعذر حذف المصروف:','Unable to delete the expense:','تعذر حذف المصروف:','Unable to delete the expense:',true,now()),
  ('vehicleTreasury.error.serverId','vehicleTreasury','finance','error','تعذر تحديد معرّف حركة الصرف على الخادم.','Unable to determine the server ID for the expense movement.','تعذر تحديد معرّف حركة الصرف على الخادم.','Unable to determine the server ID for the expense movement.',true,now()),
  ('vehicleTreasury.error.syncUnsupported','vehicleTreasury','finance','error','عملية خزينة السيارة غير مدعومة في المزامنة.','This Vehicle Treasury operation is not supported by sync.','عملية خزينة السيارة غير مدعومة في المزامنة.','This Vehicle Treasury operation is not supported by sync.',true,now()),
  ('pwa.update.release.r44r35.title','aboutApp','system','title','استكمال ترجمة التشغيل المالي — R44R35','Financial Runtime Localization Completion — R44R35','استكمال ترجمة التشغيل المالي — R44R35','Financial Runtime Localization Completion — R44R35',true,now()),
  ('pwa.update.release.r44r35.note1','aboutApp','system','help','استكمال ترجمة العرض التشغيلي لخزينة السيارة والرواتب والعمولات وفواتير المبيعات دون تغيير أي حسابات مالية.','Completed runtime display localization for Vehicle Treasury, payroll, commissions, and sales invoices without changing financial calculations.','استكمال ترجمة العرض التشغيلي لخزينة السيارة والرواتب والعمولات وفواتير المبيعات دون تغيير أي حسابات مالية.','Completed runtime display localization for Vehicle Treasury, payroll, commissions, and sales invoices without changing financial calculations.',true,now()),
  ('pwa.update.release.r44r35.note2','aboutApp','system','help','ترجمة رسائل التحقق والأخطاء القادمة من الخدمات في طبقة العرض مع الحفاظ على خدمات المالية وعقود Offline/Sync دون تعديل.','Localized service validation and error messages in the display layer while keeping financial services and Offline/Sync contracts unchanged.','ترجمة رسائل التحقق والأخطاء القادمة من الخدمات في طبقة العرض مع الحفاظ على خدمات المالية وعقود Offline/Sync دون تعديل.','Localized service validation and error messages in the display layer while keeping financial services and Offline/Sync contracts unchanged.',true,now()),
  ('pwa.update.release.r44r35.note3','aboutApp','system','help','إبقاء SEA VIBE لمرحلة L5 ومحتوى PDF وCSV وWhatsApp المولد لمرحلة L6.','Kept SEA VIBE for L5 and generated PDF, CSV, and WhatsApp content for L6.','إبقاء SEA VIBE لمرحلة L5 ومحتوى PDF وCSV وWhatsApp المولد لمرحلة L6.','Kept SEA VIBE for L5 and generated PDF, CSV, and WhatsApp content for L6.',true,now())
)
insert into public.app_translations (translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at)
select translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
from translation_seed
on conflict (translation_key) do update set
  screen_key = excluded.screen_key,
  module_name = excluded.module_name,
  text_type = excluded.text_type,
  ar_text = case when nullif(btrim(public.app_translations.ar_text),'') is null then excluded.ar_text else public.app_translations.ar_text end,
  en_text = case when nullif(btrim(public.app_translations.en_text),'') is null then excluded.en_text else public.app_translations.en_text end,
  default_ar = excluded.default_ar,
  default_en = excluded.default_en,
  is_active = true,
  updated_at = now();

commit;
