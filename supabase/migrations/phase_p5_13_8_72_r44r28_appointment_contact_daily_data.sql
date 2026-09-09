-- PETATOE P5.13.8.72 R44R28 — Appointment Contact Daily Data
-- Adds the approved daily contact-data screen without changing appointment business logic.

begin;

-- Permission screen registration and canonical ordering inside Appointment Management.
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationContactData','إضافة بيانات التواصل','إدارة المواعيد',66,true)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

update public.app_screens set display_order=65, group_name='إدارة المواعيد' where screen_key='installationsOverview';
update public.app_screens set display_order=67, group_name='إدارة المواعيد' where screen_key='installationRequestNew';
update public.app_screens set display_order=68, group_name='إدارة المواعيد' where screen_key='installationRequests';
update public.app_screens set display_order=69, group_name='إدارة المواعيد' where screen_key='installationSchedule';
update public.app_screens set display_order=70, group_name='إدارة المواعيد' where screen_key='installationExecution';
update public.app_screens set display_order=71, group_name='إدارة المواعيد' where screen_key='installationCompletion';
update public.app_screens set display_order=72, group_name='إدارة المواعيد' where screen_key='installationExceptions';
update public.app_screens set display_order=73, group_name='إدارة المواعيد' where screen_key='installationReports';
update public.app_screens set display_order=74, group_name='إدارة المواعيد' where screen_key='vehicleTreasury';
update public.app_screens set display_order=75, group_name='إدارة المواعيد' where screen_key='installationSettings';

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export,updated_at)
values ('super_admin'::public.app_role,'installationContactData',true,true,true,false,false,now())
on conflict(role,screen_key) do update set
  can_view=true,can_add=true,can_edit=true,can_delete=false,can_export=false,updated_at=now();

-- One company-level daily record per date. User columns preserve who created/last edited it.
create table if not exists public.appointment_contact_daily_data (
  work_date date primary key,
  social_media_count integer not null default 0 check(social_media_count >= 0),
  website_appointments_count integer not null default 0 check(website_appointments_count >= 0),
  new_customers_count integer not null default 0 check(new_customers_count >= 0),
  whatsapp_count integer not null default 0 check(whatsapp_count >= 0),
  call_count integer not null default 0 check(call_count >= 0),
  inventory_sales_count integer not null default 0 check(inventory_sales_count >= 0),
  appointments_created_count integer not null default 0 check(appointments_created_count >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appointment_contact_daily_updated_at
  on public.appointment_contact_daily_data(updated_at desc);

drop trigger if exists trg_appointment_contact_daily_updated_at on public.appointment_contact_daily_data;
create trigger trg_appointment_contact_daily_updated_at
before update on public.appointment_contact_daily_data
for each row execute function public.set_updated_at();

alter table public.appointment_contact_daily_data enable row level security;

drop policy if exists appointment_contact_daily_select on public.appointment_contact_daily_data;
create policy appointment_contact_daily_select
on public.appointment_contact_daily_data for select to authenticated
using (public.has_screen_permission('installationContactData','view'));

drop policy if exists appointment_contact_daily_insert on public.appointment_contact_daily_data;
create policy appointment_contact_daily_insert
on public.appointment_contact_daily_data for insert to authenticated
with check (
  public.has_screen_permission('installationContactData','add')
  and created_by=auth.uid()
  and updated_by=auth.uid()
);

drop policy if exists appointment_contact_daily_update on public.appointment_contact_daily_data;
create policy appointment_contact_daily_update
on public.appointment_contact_daily_data for update to authenticated
using (public.has_screen_permission('installationContactData','edit'))
with check (
  public.has_screen_permission('installationContactData','edit')
  and updated_by=auth.uid()
);

grant select,insert,update on public.appointment_contact_daily_data to authenticated;

-- Canonical localization entries; custom translations are preserved.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,is_active
from (values
  ('sidebar.appointmentContactData','sidebar','navigation','navigation','إضافة بيانات التواصل','Add Contact Data',true),
  ('appointments.contact.page.title','installationContactData','appointments','title','إضافة بيانات التواصل','Add Contact Data',true),
  ('appointments.contact.page.subtitle','installationContactData','appointments','subtitle','تسجيل ملخص التواصل ونتائج اليوم','Record the daily communication summary and results',true),
  ('appointments.contact.page.note','installationContactData','appointments','help','سجّل ملخص التواصل ونتائج اليوم في سجل واحد.','Record the daily communication summary and results in one record.',true),
  ('appointments.contact.context.user','installationContactData','appointments','label','المستخدم','User',true),
  ('appointments.contact.context.date','installationContactData','appointments','label','التاريخ','Date',true),
  ('appointments.contact.channels.title','installationContactData','appointments','title','قنوات التواصل','Communication Channels',true),
  ('appointments.contact.channels.note','installationContactData','appointments','help','أدخل عدد التفاعلات لكل قناة تواصل.','Enter the interaction count for each communication channel.',true),
  ('appointments.contact.social.title','installationContactData','appointments','label','سوشيال ميديا','Social Media',true),
  ('appointments.contact.social.note','installationContactData','appointments','help','عدد رسائل وتفاعلات السوشيال ميديا','Number of social media messages and interactions',true),
  ('appointments.contact.whatsapp.title','installationContactData','appointments','label','واتس','WhatsApp',true),
  ('appointments.contact.whatsapp.note','installationContactData','appointments','help','عدد رسائل واتس','Number of WhatsApp messages',true),
  ('appointments.contact.calls.title','installationContactData','appointments','label','اتصال','Calls',true),
  ('appointments.contact.calls.note','installationContactData','appointments','help','عدد المكالمات الهاتفية','Number of phone calls',true),
  ('appointments.contact.results.title','installationContactData','appointments','title','نتائج اليوم','Today''s Results',true),
  ('appointments.contact.results.note','installationContactData','appointments','help','سجّل أهم النتائج المحققة اليوم.','Record the key results achieved today.',true),
  ('appointments.contact.websiteAppointments.title','installationContactData','appointments','label','مواعيد من الموقع','Website Appointments',true),
  ('appointments.contact.websiteAppointments.note','installationContactData','appointments','help','عدد المواعيد القادمة من الموقع','Number of appointments received from the website',true),
  ('appointments.contact.newCustomers.title','installationContactData','appointments','label','عملاء جدد لليوم','New Customers Today',true),
  ('appointments.contact.newCustomers.note','installationContactData','appointments','help','عدد العملاء الجدد','Number of new customers',true),
  ('appointments.contact.inventorySales.title','installationContactData','appointments','label','مبيعات من المخزون','Inventory Sales',true),
  ('appointments.contact.inventorySales.note','installationContactData','appointments','help','عدد عمليات البيع من المخزون','Number of inventory sales',true),
  ('appointments.contact.appointmentsCreated.title','installationContactData','appointments','label','عدد المواعيد اللي انعملت اليوم','Appointments Created Today',true),
  ('appointments.contact.appointmentsCreated.note','installationContactData','appointments','help','عدد المواعيد التي تم إنشاؤها اليوم','Number of appointments created today',true),
  ('appointments.contact.summary.title','installationContactData','appointments','title','ملخص سريع','Quick Summary',true),
  ('appointments.contact.summary.formula','installationContactData','appointments','help','إجمالي التواصل = سوشيال ميديا + واتس + اتصال','Total contacts = Social Media + WhatsApp + Calls',true),
  ('appointments.contact.summary.note','installationContactData','appointments','help','إجمالي عدد التفاعلات اليوم','Total interactions today',true),
  ('appointments.contact.actions.save','installationContactData','appointments','button','حفظ بيانات اليوم','Save Today''s Data',true),
  ('appointments.contact.loading','installationContactData','appointments','status','جاري تحميل بيانات التواصل اليومية...','Loading daily communication data...',true),
  ('appointments.contact.ready','installationContactData','appointments','status','جاهز لتسجيل بيانات اليوم.','Ready to record today''s data.',true),
  ('appointments.contact.loadedExisting','installationContactData','appointments','status','تم تحميل بيانات اليوم المحفوظة.','Today''s saved data has been loaded.',true),
  ('appointments.contact.saving','installationContactData','appointments','status','جاري حفظ بيانات اليوم...','Saving today''s data...',true),
  ('appointments.contact.saved','installationContactData','appointments','status','تم حفظ بيانات اليوم بنجاح.','Today''s data was saved successfully.',true),
  ('appointments.contact.cancelledExisting','installationContactData','appointments','status','تم التراجع عن التعديلات غير المحفوظة.','Unsaved changes were reverted.',true),
  ('appointments.contact.cancelledNew','installationContactData','appointments','status','تم مسح القيم غير المحفوظة.','Unsaved values were cleared.',true),
  ('appointments.contact.validation.nonNegative','installationContactData','appointments','error','أدخل أرقامًا صحيحة غير سالبة في جميع الحقول.','Enter non-negative whole numbers in all fields.',true),
  ('appointments.contact.error.dbNotReady','installationContactData','appointments','error','خدمة قاعدة البيانات غير جاهزة.','Database service is not ready.',true),
  ('appointments.contact.error.permission','installationContactData','appointments','error','لا توجد صلاحية لهذه العملية في إضافة بيانات التواصل.','You do not have permission for this Contact Data action.',true),
  ('appointments.contact.error.onlineRequired','installationContactData','appointments','error','هذه الشاشة تحتاج اتصالًا بالإنترنت للحفظ والتحميل.','This screen requires an internet connection to load and save data.',true),
  ('appointments.contact.error.userMissing','installationContactData','appointments','error','تعذر تحديد المستخدم الحالي.','Unable to determine the current user.',true),
  ('appointments.contact.error.load','installationContactData','appointments','error','تعذر تحميل بيانات التواصل.','Unable to load communication data.',true),
  ('appointments.contact.error.save','installationContactData','appointments','error','تعذر حفظ بيانات اليوم.','Unable to save today''s data.',true),
  ('pwa.update.release.r44r28.title','systemSettings','pwa','title','إضافة شاشة بيانات التواصل اليومية','Daily Contact Data Screen',true),
  ('pwa.update.release.r44r28.note1','systemSettings','pwa','help','إضافة شاشة جديدة داخل إدارة المواعيد بالترتيب: لوحة المواعيد ثم إضافة بيانات التواصل ثم إضافة موعد جديد.','Adds a new Appointment Management screen ordered between Appointment Dashboard and Add New Appointment.',true),
  ('pwa.update.release.r44r28.note2','systemSettings','pwa','help','تسجيل سبعة مؤشرات يومية تشمل السوشيال وواتس والاتصال ومواعيد الموقع والعملاء الجدد ومبيعات المخزون والمواعيد المنشأة مع إجمالي تواصل تلقائي.','Records seven daily metrics for social, WhatsApp, calls, website appointments, new customers, inventory sales, and created appointments with an automatic contact total.',true),
  ('pwa.update.release.r44r28.note3','systemSettings','pwa','help','الشاشة تستخدم صلاحيات مستقلة وسجلًا يوميًا واحدًا مع دعم العربية والإنجليزية وLight/Dark وDesktop/Tablet/Mobile دون تغيير منطق المواعيد الحالي.','Uses independent permissions and one daily record with Arabic/English and Light/Dark Desktop/Tablet/Mobile support without changing existing appointment business logic.',true)
) as src(translation_key,screen_key,module_name,text_type,default_ar,default_en,is_active)
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case
    when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' or public.app_translations.ar_text=public.app_translations.default_ar then excluded.ar_text
    else public.app_translations.ar_text end,
  en_text=case
    when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' or public.app_translations.en_text=public.app_translations.default_en then excluded.en_text
    else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;

-- Verification only
select screen_key,screen_name,group_name,display_order,is_active
from public.app_screens
where screen_key in ('installationsOverview','installationContactData','installationRequestNew')
order by display_order;

select role,screen_key,can_view,can_add,can_edit,can_delete,can_export
from public.role_screen_permissions
where role='super_admin'::public.app_role and screen_key='installationContactData';

select count(*) as translation_key_count
from public.app_translations
where translation_key='sidebar.appointmentContactData'
   or translation_key like 'appointments.contact.%'
   or translation_key like 'pwa.update.release.r44r28.%';
