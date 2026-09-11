-- R44R37R1 — Localization runtime placeholder + page metadata hotfix
-- Non-destructive seed for canonical public.app_translations.
-- Existing customized translations are preserved; only blank values are filled.

begin;

with translation_seed(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at) as (
values
  ('appointments.overview.page.title','installationsOverview','appointments','title','إدارة المواعيد','Appointment Management','إدارة المواعيد','Appointment Management',true,now()),
  ('appointments.overview.page.subtitle','installationsOverview','appointments','subtitle','المواعيد والجدولة والتنفيذ الميداني','Appointments, scheduling, and field execution','المواعيد والجدولة والتنفيذ الميداني','Appointments, scheduling, and field execution',true,now()),
  ('appointments.requests.page.subtitle','installationRequests','appointments','subtitle','عرض ومتابعة وتعديل المواعيد','View, track, and edit appointments','عرض ومتابعة وتعديل المواعيد','View, track, and edit appointments',true,now()),
  ('appointments.schedule.page.subtitle','installationSchedule','appointments','subtitle','تقويم التشغيل وإسناد الطلبات إلى الفنيين','Operations calendar and appointment assignment to technicians','تقويم التشغيل وإسناد الطلبات إلى الفنيين','Operations calendar and appointment assignment to technicians',true,now()),
  ('appointments.schedule.completedCountOne','installationSchedule','appointments','format','{count} موعد مكتمل','{count} completed appointment','{count} موعد مكتمل','{count} completed appointment',true,now()),
  ('appointments.schedule.completedCountMany','installationSchedule','appointments','format','{count} مواعيد مكتملة','{count} completed appointments','{count} مواعيد مكتملة','{count} completed appointments',true,now()),
  ('appointments.schedule.openDayAria','installationSchedule','appointments','aria','فتح يوم {date}','Open {date}','فتح يوم {date}','Open {date}',true,now()),
  ('appointments.schedule.closeDayAria','installationSchedule','appointments','aria','إغلاق يوم {date}','Close {date}','إغلاق يوم {date}','Close {date}',true,now()),
  ('appointments.completion.page.subtitle','installationCompletion','appointments','subtitle','مراجعة واعتماد انتهاء الموعد وتحويله إلى فاتورة','Review and confirm appointment completion and convert it to an invoice','مراجعة واعتماد انتهاء الموعد وتحويله إلى فاتورة','Review and confirm appointment completion and convert it to an invoice',true,now()),
  ('appointments.exceptions.page.subtitle','installationExceptions','appointments','subtitle','متابعة التعثر وجدولة الزيارات اللاحقة','Track exceptions and schedule follow-up visits','متابعة التعثر وجدولة الزيارات اللاحقة','Track exceptions and schedule follow-up visits',true,now()),
  ('appointments.reports.page.subtitle','installationReports','appointments','subtitle','تحليل الإنتاجية والالتزام وأسباب التعثر','Analyze productivity, compliance, and failure reasons','تحليل الإنتاجية والالتزام وأسباب التعثر','Analyze productivity, compliance, and failure reasons',true,now()),
  ('appointmentSettings.page.subtitle','installationSettings','appointments','subtitle','إعدادات التشغيل والمهلة والقيم الافتراضية','Operating settings, lead times, and default values','إعدادات التشغيل والمهلة والقيم الافتراضية','Operating settings, lead times, and default values',true,now()),
  ('appointments.common.appointmentCountOne','appointmentsShared','appointments','format','{count} موعد','{count} appointment','{count} موعد','{count} appointment',true,now()),
  ('appointments.common.appointmentCountMany','appointmentsShared','appointments','format','{count} مواعيد','{count} appointments','{count} مواعيد','{count} appointments',true,now()),
  ('shared.notifications.center.pageSubtitle','shared','core','subtitle','إدارة الأحداث والمستلمين وقنوات الإشعار','Manage events, recipients, and notification channels','إدارة الأحداث والمستلمين وقنوات الإشعار','Manage events, recipients, and notification channels',true,now()),
  ('pwa.update.release.r44r37r1.title','aboutApp','system','title','إصلاح ترجمة الجدولة والعدادات الديناميكية — R44R37R1','Appointment scheduling localization runtime hotfix — R44R37R1','إصلاح ترجمة الجدولة والعدادات الديناميكية — R44R37R1','Appointment scheduling localization runtime hotfix — R44R37R1',true,now()),
  ('pwa.update.release.r44r37r1.note1','aboutApp','system','note','إصلاح عدادات تقويم المواعيد ومنع ظهور المتغيرات الخام مثل {count} و{date} في العربية والإنجليزية.','Fix appointment calendar counters and prevent raw placeholders such as {count} and {date} from appearing in Arabic or English.','إصلاح عدادات تقويم المواعيد ومنع ظهور المتغيرات الخام مثل {count} و{date} في العربية والإنجليزية.','Fix appointment calendar counters and prevent raw placeholders such as {count} and {date} from appearing in Arabic or English.',true,now()),
  ('pwa.update.release.r44r37r1.note2','aboutApp','system','note','استكمال ترجمة عناوين وأوصاف الهيدر للشاشات غير المغطاة وإعادة رسمها فور تغيير اللغة.','Complete localized page header titles and subtitles for uncovered screens and rerender them immediately when the language changes.','استكمال ترجمة عناوين وأوصاف الهيدر للشاشات غير المغطاة وإعادة رسمها فور تغيير اللغة.','Complete localized page header titles and subtitles for uncovered screens and rerender them immediately when the language changes.',true,now()),
  ('pwa.update.release.r44r37r1.note3','aboutApp','system','note','تحديث رسالة بيانات الكاش في شاشة الجدولة عند تغيير اللغة دون إعادة تحميل البيانات، مع الحفاظ على Business Logic وOffline/Sync/Permissions وCSS دون تعديل.','Refresh the scheduling cached-data status when the language changes without reloading data, while keeping business logic, Offline/Sync/Permissions, and CSS unchanged.','تحديث رسالة بيانات الكاش في شاشة الجدولة عند تغيير اللغة دون إعادة تحميل البيانات، مع الحفاظ على Business Logic وOffline/Sync/Permissions وCSS دون تعديل.','Refresh the scheduling cached-data status when the language changes without reloading data, while keeping business logic, Offline/Sync/Permissions, and CSS unchanged.',true,now())
), upserted as (
  insert into public.app_translations (
    translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
  )
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
    updated_at = now()
  returning translation_key
)
select count(*) from upserted;

commit;
