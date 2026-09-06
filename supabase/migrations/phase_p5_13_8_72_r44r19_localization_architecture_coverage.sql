-- R44R19 — Localization architecture routing & coverage foundation.
-- Non-destructive metadata alignment for the existing public.app_translations owner.
-- Translation text is preserved when customized; only missing bundled defaults are seeded.

begin;

insert into public.app_translations
(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at)
values
  ('translationCenter.page.title','translationCenter','system','title','مركز الترجمة','Translation Center','مركز الترجمة','Translation Center',true,now()),
  ('translationCenter.page.subtitle','translationCenter','system','subtitle','إدارة قاموس الترجمة المركزي ومراجعة تغطية الوحدات والشاشات من مصدر واحد.','Manage the centralized translation catalog and review module and screen coverage from one source.','إدارة قاموس الترجمة المركزي ومراجعة تغطية الوحدات والشاشات من مصدر واحد.','Manage the centralized translation catalog and review module and screen coverage from one source.',true,now()),
  ('translationCenter.language.group','translationCenter','system','aria','لغة واجهة البرنامج','Application interface language','لغة واجهة البرنامج','Application interface language',true,now()),
  ('translationCenter.language.ar','translationCenter','system','button','العربية','Arabic','العربية','Arabic',true,now()),
  ('translationCenter.language.en','translationCenter','system','button','English','English','English','English',true,now()),
  ('translationCenter.kpi.total','translationCenter','system','label','إجمالي مفاتيح الترجمة','Total translation keys','إجمالي مفاتيح الترجمة','Total translation keys',true,now()),
  ('translationCenter.kpi.complete','translationCenter','system','label','ترجمة مكتملة','Complete translations','ترجمة مكتملة','Complete translations',true,now()),
  ('translationCenter.kpi.custom','translationCenter','system','label','مفاتيح معدّلة','Customized keys','مفاتيح معدّلة','Customized keys',true,now()),
  ('translationCenter.kpi.missing','translationCenter','system','label','ترجمات ناقصة','Missing translations','ترجمات ناقصة','Missing translations',true,now()),
  ('translationCenter.filter.search','translationCenter','system','label','بحث','Search','بحث','Search',true,now()),
  ('translationCenter.filter.searchPlaceholder','translationCenter','system','placeholder','ابحث بالمفتاح أو النص العربي أو الإنجليزي','Search by key, Arabic text, or English text','ابحث بالمفتاح أو النص العربي أو الإنجليزي','Search by key, Arabic text, or English text',true,now()),
  ('translationCenter.filter.module','translationCenter','system','label','الوحدة','Module','الوحدة','Module',true,now()),
  ('translationCenter.filter.allModules','translationCenter','system','option','كل الوحدات','All modules','كل الوحدات','All modules',true,now()),
  ('translationCenter.filter.screen','translationCenter','system','label','الشاشة','Screen','الشاشة','Screen',true,now()),
  ('translationCenter.filter.allScreens','translationCenter','system','option','كل الشاشات','All screens','كل الشاشات','All screens',true,now()),
  ('translationCenter.filter.type','translationCenter','system','label','نوع النص','Text type','نوع النص','Text type',true,now()),
  ('translationCenter.filter.allTypes','translationCenter','system','option','كل الأنواع','All types','كل الأنواع','All types',true,now()),
  ('translationCenter.action.reload','translationCenter','system','button','إعادة تحميل','Reload','إعادة تحميل','Reload',true,now()),
  ('translationCenter.action.save','translationCenter','system','button','حفظ الترجمات','Save translations','حفظ الترجمات','Save translations',true,now()),
  ('translationCenter.column.key','translationCenter','system','label','المفتاح','Key','المفتاح','Key',true,now()),
  ('translationCenter.column.ar','translationCenter','system','label','العربية','Arabic','العربية','Arabic',true,now()),
  ('translationCenter.column.en','translationCenter','system','label','English','English','English','English',true,now()),
  ('translationCenter.column.status','translationCenter','system','label','الحالة','Status','الحالة','Status',true,now()),
  ('translationCenter.status.complete','translationCenter','system','status','مكتملة','Complete','مكتملة','Complete',true,now()),
  ('translationCenter.status.missing','translationCenter','system','status','ناقصة','Missing','ناقصة','Missing',true,now()),
  ('translationCenter.status.custom','translationCenter','system','status','معدّلة','Customized','معدّلة','Customized',true,now()),
  ('translationCenter.empty','translationCenter','system','empty','لا توجد نتائج مطابقة.','No matching results.','لا توجد نتائج مطابقة.','No matching results.',true,now()),
  ('translationCenter.loading','translationCenter','system','status','جاري التحميل...','Loading...','جاري التحميل...','Loading...',true,now()),
  ('translationCenter.save.saving','translationCenter','system','status','جاري حفظ الترجمات...','Saving translations...','جاري حفظ الترجمات...','Saving translations...',true,now()),
  ('translationCenter.save.success','translationCenter','system','status','تم حفظ الترجمات بنجاح.','Translations saved successfully.','تم حفظ الترجمات بنجاح.','Translations saved successfully.',true,now()),
  ('translationCenter.save.failed','translationCenter','system','error','تعذر حفظ الترجمات.','Failed to save translations.','تعذر حفظ الترجمات.','Failed to save translations.',true,now()),
  ('translationCenter.load.local','translationCenter','system','status','تم عرض القاموس المحلي — جاري تحديث البيانات من الخادم...','Local catalog loaded — refreshing data from the server...','تم عرض القاموس المحلي — جاري تحديث البيانات من الخادم...','Local catalog loaded — refreshing data from the server...',true,now()),
  ('translationCenter.load.partial','translationCenter','system','error','تم عرض القاموس المحلي — تعذر تحديث بعض البيانات من الخادم.','Local catalog loaded — some server data could not be refreshed.','تم عرض القاموس المحلي — تعذر تحديث بعض البيانات من الخادم.','Local catalog loaded — some server data could not be refreshed.',true,now()),
  ('translationCenter.language.changedAr','translationCenter','system','status','تم تحويل واجهة البرنامج إلى العربية.','The application interface has been switched to Arabic.','تم تحويل واجهة البرنامج إلى العربية.','The application interface has been switched to Arabic.',true,now()),
  ('translationCenter.language.changedEn','translationCenter','system','status','تم تحويل واجهة البرنامج إلى الإنجليزية.','The application interface has been switched to English.','تم تحويل واجهة البرنامج إلى الإنجليزية.','The application interface has been switched to English.',true,now()),
  ('translationCenter.toggle.toEnglish','translationCenter','system','aria','التبديل إلى الإنجليزية','Switch to English','التبديل إلى الإنجليزية','Switch to English',true,now()),
  ('translationCenter.toggle.toArabic','translationCenter','system','aria','التبديل إلى العربية','Switch to Arabic','التبديل إلى العربية','Switch to Arabic',true,now()),
  ('translationCenter.module.core','translationCenter','system','option','الأساس المشترك','Core','الأساس المشترك','Core',true,now()),
  ('translationCenter.module.navigation','translationCenter','system','option','التنقل','Navigation','التنقل','Navigation',true,now()),
  ('translationCenter.module.dashboard','translationCenter','system','option','لوحة التحكم','Dashboard','لوحة التحكم','Dashboard',true,now()),
  ('translationCenter.module.crm','translationCenter','system','option','إدارة العملاء','CRM','إدارة العملاء','CRM',true,now()),
  ('translationCenter.module.appointments','translationCenter','system','option','إدارة المواعيد','Appointments','إدارة المواعيد','Appointments',true,now()),
  ('translationCenter.module.payroll','translationCenter','system','option','الرواتب والعمولات','Payroll & Commissions','الرواتب والعمولات','Payroll & Commissions',true,now()),
  ('translationCenter.module.finance','translationCenter','system','option','العمليات المالية','Finance','العمليات المالية','Finance',true,now()),
  ('translationCenter.module.seaVibe','translationCenter','system','option','SEA VIBE','SEA VIBE','SEA VIBE','SEA VIBE',true,now()),
  ('translationCenter.module.system','translationCenter','system','option','النظام والإعدادات','System & Settings','النظام والإعدادات','System & Settings',true,now()),
  ('translationCenter.type.title','translationCenter','system','option','عنوان','Title','عنوان','Title',true,now()),
  ('translationCenter.type.label','translationCenter','system','option','Label','Label','Label','Label',true,now()),
  ('translationCenter.type.button','translationCenter','system','option','زر','Button','زر','Button',true,now()),
  ('translationCenter.type.option','translationCenter','system','option','خيار','Option','خيار','Option',true,now()),
  ('translationCenter.type.stage','translationCenter','system','option','مرحلة','Stage','مرحلة','Stage',true,now()),
  ('translationCenter.type.status','translationCenter','system','option','حالة','Status','حالة','Status',true,now()),
  ('translationCenter.type.help','translationCenter','system','option','مساعدة','Help','مساعدة','Help',true,now()),
  ('translationCenter.type.error','translationCenter','system','option','خطأ','Error','خطأ','Error',true,now()),
  ('translationCenter.type.empty','translationCenter','system','option','حالة فارغة','Empty state','حالة فارغة','Empty state',true,now()),
  ('translationCenter.type.placeholder','translationCenter','system','option','Placeholder','Placeholder','Placeholder','Placeholder',true,now()),
  ('translationCenter.type.dialog','translationCenter','system','option','رسالة تأكيد','Confirmation dialog','رسالة تأكيد','Confirmation dialog',true,now()),
  ('translationCenter.type.format','translationCenter','system','option','صيغة ديناميكية','Dynamic format','صيغة ديناميكية','Dynamic format',true,now()),
  ('translationCenter.type.noun','translationCenter','system','option','مصطلح','Term','مصطلح','Term',true,now()),
  ('translationCenter.type.tab','translationCenter','system','option','تبويب','Tab','تبويب','Tab',true,now()),
  ('translationCenter.type.subtitle','translationCenter','system','option','وصف','Subtitle','وصف','Subtitle',true,now()),
  ('translationCenter.type.navigation','translationCenter','system','option','القائمة الجانبية','Navigation','القائمة الجانبية','Navigation',true,now()),
  ('translationCenter.type.service','translationCenter','system','option','خدمة','Service','خدمة','Service',true,now()),
  ('translationCenter.type.neighborhood','translationCenter','system','option','حي','Neighborhood','حي','Neighborhood',true,now()),
  ('translationCenter.validation.englishArabic','translationCenter','system','error','لا يمكن الحفظ مع نص عربي داخل العمود الإنجليزي.','Arabic text cannot be saved in the English column.','لا يمكن الحفظ مع نص عربي داخل العمود الإنجليزي.','Arabic text cannot be saved in the English column.',true,now()),
  ('translationCenter.validation.required','translationCenter','system','error','لا يمكن حذف ترجمة مكتملة أو حفظ نص عربي فارغ.','A completed translation cannot be removed and Arabic text cannot be empty.','لا يمكن حذف ترجمة مكتملة أو حفظ نص عربي فارغ.','A completed translation cannot be removed and Arabic text cannot be empty.',true,now()),
  ('translationCenter.error.serviceNotReady','translationCenter','system','error','خدمة مركز الترجمة غير جاهزة.','Translation Center service is not ready.','خدمة مركز الترجمة غير جاهزة.','Translation Center service is not ready.',true,now()),
  ('translationCenter.error.dbNotReady','translationCenter','system','error','اتصال قاعدة البيانات غير جاهز.','Database connection is not ready.','اتصال قاعدة البيانات غير جاهز.','Database connection is not ready.',true,now()),
  ('translationCenter.error.load','translationCenter','system','error','تعذر تحميل الترجمات','Failed to load translations','تعذر تحميل الترجمات','Failed to load translations',true,now()),
  ('translationCenter.error.loadAll','translationCenter','system','error','تعذر تحميل الترجمات المركزية','Failed to load centralized translations','تعذر تحميل الترجمات المركزية','Failed to load centralized translations',true,now()),
  ('translationCenter.error.services','translationCenter','system','error','تعذر تحميل الخدمات لمركز الترجمة','Failed to load services for the Translation Center','تعذر تحميل الخدمات لمركز الترجمة','Failed to load services for the Translation Center',true,now()),
  ('translationCenter.error.neighborhoods','translationCenter','system','error','تعذر تحميل الأحياء لمركز الترجمة','Failed to load neighborhoods for the Translation Center','تعذر تحميل الأحياء لمركز الترجمة','Failed to load neighborhoods for the Translation Center',true,now()),
  ('translationCenter.error.permission','translationCenter','system','error','ليس لديك صلاحية تعديل مركز الترجمة.','You do not have permission to edit the Translation Center.','ليس لديك صلاحية تعديل مركز الترجمة.','You do not have permission to edit the Translation Center.',true,now()),
  ('translationCenter.error.save','translationCenter','system','error','تعذر حفظ مركز الترجمة','Failed to save the Translation Center','تعذر حفظ مركز الترجمة','Failed to save the Translation Center',true,now())
on conflict (translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  ar_text=case when nullif(trim(public.app_translations.ar_text),'') is null then excluded.ar_text else public.app_translations.ar_text end,
  en_text=case when nullif(trim(public.app_translations.en_text),'') is null then excluded.en_text else public.app_translations.en_text end,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

update public.app_translations
set screen_key=case
  when translation_key like 'entity.service.%' then 'installationExecutionServices'
  when translation_key like 'entity.neighborhood.%' then 'installationExecutionNeighborhoods'
  when translation_key like 'translationCenter.%' then 'translationCenter'
  when translation_key like 'sidebar.%' then 'sidebar'
  when translation_key like 'shared.%' or translation_key like 'common.%' then 'shared'
  when translation_key like 'dashboard.%' then 'dashboard'
  when translation_key like 'customers.%' then 'customers'
  when translation_key like 'followups.%' then 'followups'
  when translation_key like 'contracts.%' then 'quotations'
  when translation_key like 'invoices.%' then 'salesInvoices'
  when translation_key like 'users.%' then 'users'
  when translation_key like 'salaryStatement.%' then 'salaryStatement'
  when translation_key like 'commissionStatement.%' then 'commissionStatement'
  when translation_key like 'commission.%' then 'commissionManagement'
  when translation_key like 'payroll.page.salaryStatement.%' then 'salaryStatement'
  when translation_key like 'payroll.page.commissionManagement.%' then 'commissionManagement'
  when translation_key like 'payroll.page.commissionStatement.%' then 'commissionStatement'
  when translation_key like 'payroll.page.reference.%' or translation_key like 'payroll.reference.%' or translation_key like 'payroll.employee.%' then 'payrollReference'
  when translation_key like 'payroll.%' then 'payrollManagement'
  when translation_key like 'appointmentNew.%' then 'installationRequestNew'
  when translation_key like 'execution.%' then 'installationExecution'
  when translation_key like 'appointments.overview.%' then 'installationsOverview'
  when translation_key like 'appointments.requests.%' then 'installationRequests'
  when translation_key like 'appointments.schedule.%' then 'installationSchedule'
  when translation_key like 'appointments.completion.%' then 'installationCompletion'
  when translation_key like 'appointments.%' then 'appointmentsShared'
  when translation_key like 'vehicleTreasury.%' then 'vehicleTreasury'
  when translation_key like 'seaVibePayroll.page.salaryStatement.%' or translation_key like 'seaVibePayroll.salaryStatement.%' then 'seaVibeSalaryStatement'
  when translation_key like 'seaVibePayroll.page.commissionStatement.%' or translation_key like 'seaVibePayroll.commissionStatement.%' then 'seaVibeCommissionStatement'
  when translation_key like 'seaVibePayroll.page.commissionManagement.%' or translation_key like 'seaVibePayroll.commissionManagement.%' or translation_key like 'seaVibePayroll.commission.%' then 'seaVibeCommissionManagement'
  when translation_key like 'seaVibePayroll.page.reference.%' or translation_key like 'seaVibePayroll.reference.%' or translation_key like 'seaVibePayroll.employee.%' then 'seaVibePayrollReference'
  when translation_key like 'seaVibePayroll.page.management.%' or translation_key like 'seaVibePayroll.management.%' then 'seaVibePayrollManagement'
  when translation_key like 'seaVibePayroll.%' then 'seaVibePayroll'
  when translation_key like 'seaVibe.page.trips.%' or translation_key like 'seaVibe.trip.%' or translation_key like 'seaVibe.trips.%' then 'seaVibeTrips'
  when translation_key like 'seaVibe.page.customers.%' or translation_key like 'seaVibe.customer.%' or translation_key like 'seaVibe.customers.%' then 'seaVibeCustomers'
  when translation_key like 'seaVibe.page.tripNew.%' or translation_key like 'seaVibe.page.tripDetails.%' then 'seaVibeTrips'
  when translation_key like 'seaVibe.page.expenseNew.%' or translation_key like 'seaVibe.expense.%' or translation_key like 'seaVibe.validation.%' then 'seaVibeExpenseNew'
  when translation_key like 'seaVibe.page.general.%' or translation_key like 'seaVibe.general.%' then 'seaVibeGeneralExpenses'
  when translation_key like 'seaVibe.page.assets.%' or translation_key like 'seaVibe.asset.%' or translation_key like 'seaVibe.assets.%' then 'seaVibeAssets'
  when translation_key like 'seaVibe.page.reference.%' or translation_key like 'seaVibe.reference.%' then 'seaVibeReference'
  when translation_key like 'seaVibe.page.reports.%' or translation_key like 'seaVibe.reports.%' then 'seaVibeReports'
  when translation_key like 'seaVibe.page.treasury.%' or translation_key like 'seaVibe.treasury.%' then 'seaVibeTreasury'
  when translation_key like 'seaVibe.page.zawel.%' or translation_key like 'seaVibe.zawel.%' then 'seaVibeZawel'
  when translation_key like 'seaVibe.page.fuel.%' or translation_key like 'seaVibe.fuel.%' then 'seaVibeFuel'
  when translation_key like 'seaVibe.%' then 'seaVibeShared'
  else screen_key
end, module_name=case
  when translation_key like 'entity.service.%' or translation_key like 'entity.neighborhood.%' then 'appointments'
  when translation_key like 'translationCenter.%' then 'system'
  when translation_key like 'sidebar.%' then 'navigation'
  when translation_key like 'shared.%' or translation_key like 'common.%' then 'core'
  when translation_key like 'dashboard.%' then 'dashboard'
  when translation_key like 'customers.%' or translation_key like 'followups.%' or translation_key like 'contracts.%' or translation_key like 'invoices.%' then 'crm'
  when translation_key like 'users.%' then 'system'
  when translation_key like 'salaryStatement.%' or translation_key like 'commissionStatement.%' or translation_key like 'commission.%' or translation_key like 'payroll.%' then 'payroll'
  when translation_key like 'appointmentNew.%' or translation_key like 'execution.%' or translation_key like 'appointments.%' then 'appointments'
  when translation_key like 'vehicleTreasury.%' then 'finance'
  when translation_key like 'seaVibePayroll.%' or translation_key like 'seaVibe.%' then 'seaVibe'
  else module_name
end, updated_at=now()
where translation_key like 'entity.service.%' or translation_key like 'entity.neighborhood.%' or translation_key like 'translationCenter.%' or translation_key like 'sidebar.%' or translation_key like 'shared.%' or translation_key like 'common.%' or translation_key like 'dashboard.%' or translation_key like 'customers.%' or translation_key like 'followups.%' or translation_key like 'contracts.%' or translation_key like 'invoices.%' or translation_key like 'users.%' or translation_key like 'salaryStatement.%' or translation_key like 'commissionStatement.%' or translation_key like 'commission.%' or translation_key like 'payroll.%' or translation_key like 'appointmentNew.%' or translation_key like 'execution.%' or translation_key like 'appointments.%' or translation_key like 'vehicleTreasury.%' or translation_key like 'seaVibePayroll.%' or translation_key like 'seaVibe.%';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from public.app_translations
  where is_active=true and (
    (translation_key like 'appointmentNew.%' and (screen_key<>'installationRequestNew' or module_name<>'appointments')) or
    (translation_key like 'execution.%' and (screen_key<>'installationExecution' or module_name<>'appointments')) or
    (translation_key like 'vehicleTreasury.%' and (screen_key<>'vehicleTreasury' or module_name<>'finance')) or
    (translation_key like 'seaVibePayroll.%' and module_name<>'seaVibe') or
    (translation_key like 'seaVibe.%' and module_name<>'seaVibe') or
    (translation_key like 'translationCenter.%' and (screen_key<>'translationCenter' or module_name<>'system'))
  );
  if v_bad>0 then raise exception 'R44R19_LOCALIZATION_ROUTE_MISMATCH:%',v_bad; end if;
end $$;

comment on table public.app_translations is 'Canonical PETATOE translation owner. R44R19 aligns screen/module metadata to key namespaces without changing customized translation text.';
commit;
