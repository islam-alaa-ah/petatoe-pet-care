-- PETATOE P5.13.8.72 R44R38R7 — Contact Summary Report
-- Adds a least-privilege aggregate RPC for Appointment Reports.
-- Source remains appointment_contact_daily_data; no user/representative data is returned.

begin;

create or replace function public.appointment_contact_summary_report(p_work_date date)
returns table (
  work_date date,
  month_start date,
  social_media_today bigint,
  social_media_month bigint,
  whatsapp_today bigint,
  whatsapp_month bigint,
  calls_today bigint,
  calls_month bigint,
  website_appointments_today bigint,
  website_appointments_month bigint,
  new_customers_today bigint,
  new_customers_month bigint,
  appointments_created_today bigint,
  appointments_created_month bigint,
  inventory_sales_today bigint,
  inventory_sales_month bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_work_date date := coalesce(p_work_date, current_date);
  v_month_start date := date_trunc('month', coalesce(p_work_date, current_date))::date;
begin
  if auth.uid() is null or not public.has_screen_permission('installationReports','view') then
    raise exception 'permission denied for appointment contact summary report' using errcode = '42501';
  end if;

  return query
  select
    v_work_date,
    v_month_start,
    coalesce(sum(d.social_media_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.social_media_count),0)::bigint,
    coalesce(sum(d.whatsapp_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.whatsapp_count),0)::bigint,
    coalesce(sum(d.call_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.call_count),0)::bigint,
    coalesce(sum(d.website_appointments_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.website_appointments_count),0)::bigint,
    coalesce(sum(d.new_customers_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.new_customers_count),0)::bigint,
    coalesce(sum(d.appointments_created_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.appointments_created_count),0)::bigint,
    coalesce(sum(d.inventory_sales_count) filter (where d.work_date = v_work_date),0)::bigint,
    coalesce(sum(d.inventory_sales_count),0)::bigint
  from public.appointment_contact_daily_data d
  where d.work_date between v_month_start and v_work_date;
end;
$$;

revoke all on function public.appointment_contact_summary_report(date) from public;
grant execute on function public.appointment_contact_summary_report(date) to authenticated;

-- Translation Center entries. Existing custom translations are preserved.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active
)
select translation_key,screen_key,module_name,text_type,default_ar,default_en,default_ar,default_en,true
from (values
  ('appointments.reports.summary.contactTitle','installationReports','appointments','title','ملخص بيانات التواصل','Contact Data Summary'),
  ('appointments.reports.summary.contactNote','installationReports','appointments','help','ملخص اليوم والملخص التراكمي من بداية الشهر لبيانات التواصل والنتائج اليومية.','Today and month-to-date summary of communication and daily result data.'),
  ('appointments.reports.summary.contactMetric','installationReports','appointments','table','البند','Metric'),
  ('appointments.reports.summary.contactToday','installationReports','appointments','table','اليوم','Today'),
  ('appointments.reports.summary.contactMonthToDate','installationReports','appointments','table','من بداية الشهر','Month to date'),
  ('appointments.reports.summary.contactSocial','installationReports','appointments','table','رسائل وتفاعلات السوشيال ميديا','Social media messages & interactions'),
  ('appointments.reports.summary.contactWhatsapp','installationReports','appointments','table','رسائل واتساب','WhatsApp messages'),
  ('appointments.reports.summary.contactCalls','installationReports','appointments','table','المكالمات الهاتفية','Phone calls'),
  ('appointments.reports.summary.contactTotal','installationReports','appointments','table','إجمالي التواصل','Total communication'),
  ('appointments.reports.summary.contactWebsite','installationReports','appointments','table','مواعيد من الموقع','Website appointments'),
  ('appointments.reports.summary.contactNewCustomers','installationReports','appointments','table','عملاء جدد','New customers'),
  ('appointments.reports.summary.contactAppointmentsCreated','installationReports','appointments','table','المواعيد التي تم إنشاؤها','Appointments created'),
  ('appointments.reports.summary.contactInventorySales','installationReports','appointments','table','مبيعات من المخزون','Inventory sales'),
  ('appointments.reports.summary.contactUnavailable','installationReports','appointments','status','تعذر تحميل ملخص بيانات التواصل.','Unable to load the contact data summary.'),
  ('appointments.reports.export.contactSummaryTitle','installationReports','appointments','title','ملخص بيانات التواصل','Contact data summary'),
  ('appointments.reports.export.contactSummarySubtitle','installationReports','appointments','title','ملخص اليوم ومن بداية الشهر حتى {date}','Today and month-to-date through {date}'),
  ('pwa.update.release.r44r38r7.title','systemSettings','pwa','title','إضافة ملخص بيانات التواصل إلى تقارير المواعيد — R44R38R7','Add Contact Data Summary to Appointment Reports — R44R38R7'),
  ('pwa.update.release.r44r38r7.note1','systemSettings','pwa','note','إضافة تقرير تجميعي بعد ملخص طرق الدفع يعرض اليوم ومن بداية الشهر لثمانية مؤشرات بدون مستخدم أو مندوب.','Adds an aggregate report after the payment-method summary with today and month-to-date values for eight metrics, without user or representative breakdown.'),
  ('pwa.update.release.r44r38r7.note2','systemSettings','pwa','note','التقرير يستخدم نفس جدول بيانات التواصل اليومي عبر RPC محدودة تتحقق من صلاحية تقارير المواعيد ولا تعرض بيانات المستخدمين.','The report uses the existing daily contact-data table through a least-privilege RPC that checks Appointment Reports permission and returns no user data.'),
  ('pwa.update.release.r44r38r7.note3','systemSettings','pwa','note','لا تغيير على منطق المواعيد أو Offline/Sync أو الحسابات أو R44 Pruning، وتمت إضافة التقرير إلى الشاشة وPDF في نفس الترتيب.','No changes to appointment logic, Offline/Sync, calculations, or R44 Pruning; the report is added to both screen and PDF in the same order.')
) as v(translation_key,screen_key,module_name,text_type,default_ar,default_en)
on conflict (translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=case when public.app_translations.ar_text is null or btrim(public.app_translations.ar_text)='' then excluded.default_ar else public.app_translations.ar_text end,
  en_text=case when public.app_translations.en_text is null or btrim(public.app_translations.en_text)='' then excluded.default_en else public.app_translations.en_text end,
  is_active=true,
  updated_at=now();

commit;
