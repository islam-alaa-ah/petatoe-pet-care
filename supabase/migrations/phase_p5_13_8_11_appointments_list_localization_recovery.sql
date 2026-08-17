-- P5.13.8.11 Appointments list localization recovery
insert into public.app_translations
(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active)
values
  ('appointments.common.view','appointments','appointments','button','عرض','View','عرض','View',true),
  ('appointments.common.editServices','appointments','appointments','button','تعديل الخدمات','Edit services','تعديل الخدمات','Edit services',true),
  ('appointments.common.delete','appointments','appointments','button','حذف','Delete','حذف','Delete',true),
  ('appointments.common.noServices','appointments','appointments','empty','لا توجد خدمات','No services','لا توجد خدمات','No services',true),
  ('appointments.common.notSpecified','appointments','appointments','label','غير محدد','Not specified','غير محدد','Not specified',true),
  ('appointments.common.service','appointments','appointments','label','خدمة','Service','خدمة','Service',true),
  ('appointments.requests.appointmentNumber','appointments','appointments','label','رقم الموعد','Appointment number','رقم الموعد','Appointment number',true),
  ('appointments.requests.contract','appointments','appointments','label','العقد','Contract','العقد','Contract',true),
  ('appointments.requests.appointment','appointments','appointments','label','الموعد','Appointment','الموعد','Appointment',true),
  ('appointments.requests.totalVat','appointments','appointments','label','الإجمالي شامل الضريبة','Total incl. VAT','الإجمالي شامل الضريبة','Total incl. VAT',true),
  ('appointments.requests.empty','appointments','appointments','empty','لا توجد مواعيد مطابقة.','No matching appointments.','لا توجد مواعيد مطابقة.','No matching appointments.',true),
  ('appointments.status.new','appointments','appointments','status','جديد','New','جديد','New',true),
  ('appointments.status.assigned','appointments','appointments','status','مسند','Assigned','مسند','Assigned',true),
  ('appointments.status.scheduled','appointments','appointments','status','مجدول','Scheduled','مجدول','Scheduled',true),
  ('appointments.status.onRoute','appointments','appointments','status','في الطريق','On route','في الطريق','On route',true),
  ('appointments.status.arrived','appointments','appointments','status','وصل إلى العميل','Arrived','وصل إلى العميل','Arrived',true),
  ('appointments.status.inProgress','appointments','appointments','status','قيد التنفيذ','In progress','قيد التنفيذ','In progress',true),
  ('appointments.status.completed','appointments','appointments','status','مكتمل','Completed','مكتمل','Completed',true),
  ('appointments.status.cancelled','appointments','appointments','status','ملغي','Cancelled','ملغي','Cancelled',true),
  ('appointments.status.pendingReview','appointments','appointments','status','بانتظار المراجعة','Pending review','بانتظار المراجعة','Pending review',true)
on conflict (translation_key) do update set
  ar_text=excluded.ar_text,en_text=excluded.en_text,default_ar=excluded.default_ar,default_en=excluded.default_en,text_type=excluded.text_type,is_active=true;
