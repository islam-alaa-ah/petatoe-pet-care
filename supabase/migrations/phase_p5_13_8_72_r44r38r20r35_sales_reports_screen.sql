-- R44R38R20R35 — Sales Reports screen + scoped reporting read surface
-- HOTFIX R1: use the exposed `vehicle` alias from appointment_historical_sales_reporting.
-- Scope: sales reporting UI/data read only. No invoice creation/editing, pricing, VAT,
-- commission, appointment state, offline queue, sync/ACK, or existing sales-invoice logic changes.

begin;

insert into public.app_screens(
  screen_key,screen_name,group_name,display_order,is_active
)
values(
  'salesReports','تقارير المبيعات','التقارير والتحليلات',67,true
)
on conflict(screen_key) do update set
  screen_name=excluded.screen_name,
  group_name=excluded.group_name,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_screen_permissions(
  role,screen_key,can_view,can_add,can_edit,can_delete,can_export
)
values
  ('super_admin','salesReports',true,false,false,false,true),
  ('sales_manager','salesReports',true,false,false,false,true),
  ('sales_supervisor','salesReports',true,false,false,false,true),
  ('sales_representative','salesReports',false,false,false,false,false),
  ('customer_service','salesReports',false,false,false,false,false),
  ('viewer','salesReports',true,false,false,false,true)
on conflict(role,screen_key) do update set
  can_view=excluded.can_view,
  can_add=excluded.can_add,
  can_edit=excluded.can_edit,
  can_delete=excluded.can_delete,
  can_export=excluded.can_export;

-- One read RPC keeps report filtering client-side after a single scoped load.
-- This intentionally is NOT registered in Sync/ACK lifecycle so opening the report
-- cannot create a new periodic watermark loop.
create or replace function public.sales_reports_rows_r44r38r20r35()
returns table(
  row_id uuid,
  invoice_number text,
  request_number text,
  customer_id uuid,
  customer_name_ar text,
  neighborhood_id uuid,
  neighborhood_name_ar text,
  neighborhood_name_en text,
  invoice_date date,
  status text,
  payment_method text,
  source_type text,
  amount_before_tax numeric(14,2),
  tax_amount numeric(14,2),
  discount_amount numeric(14,2),
  amount_incl_tax numeric(14,2),
  team_id uuid,
  team_name text,
  car_id uuid,
  car_name text,
  plate_number text,
  is_historical boolean,
  record_type text
)
language sql
stable
security definer
set search_path=public
as $$
  with current_rows as (
    select
      si.id as row_id,
      case when coalesce(si.is_without_invoice,false) then 'بدون فاتورة' else coalesce(si.invoice_number,'') end as invoice_number,
      coalesce(si.request_number,'') as request_number,
      si.customer_id,
      coalesce(c.customer_name,'—') as customer_name_ar,
      c.neighborhood_id,
      coalesce(n.name,'') as neighborhood_name_ar,
      coalesce(n.name_en,'') as neighborhood_name_en,
      si.invoice_date,
      coalesce(si.status,'صادرة') as status,
      btrim(coalesce(
        case when si.source_type='manual' then si.payment_method else col.payment_method end,
        si.payment_method,
        ''
      )) as payment_method,
      coalesce(si.source_type,'quotation') as source_type,
      round(greatest(coalesce(si.invoice_amount,0),0),2)::numeric(14,2) as amount_before_tax,
      round(
        greatest(
          case
            when si.final_amount is not null then coalesce(si.final_amount,0)
            else coalesce(si.invoice_amount,0) * (1 + greatest(coalesce(si.tax_rate,15),0) / 100.0)
          end
          - greatest(coalesce(si.invoice_amount,0),0),
          0
        ),2
      )::numeric(14,2) as tax_amount,
      round(
        case
          when si.discount_amount is not null then coalesce(si.discount_amount,0)
          when coalesce(r.discount_amount,0)>0
            and coalesce(r.total_services_amount,0)>coalesce(r.discount_amount,0)
          then coalesce(si.invoice_amount,0) * r.discount_amount
               / nullif(r.total_services_amount-r.discount_amount,0)
          else 0
        end,
        2
      )::numeric(14,2) as discount_amount,
      round(
        greatest(
          case
            when si.final_amount is not null then coalesce(si.final_amount,0)
            else coalesce(si.invoice_amount,0) * (1 + greatest(coalesce(si.tax_rate,15),0) / 100.0)
          end,
          0
        ),2
      )::numeric(14,2) as amount_incl_tax,
      coalesce(v.installation_team_id,r.installation_team_id) as team_id,
      coalesce(ah.team_name_snapshot,t.name,'') as team_name,
      coalesce(ah.appointment_car_id,t.appointment_car_id) as car_id,
      coalesce(ah.car_name_snapshot,car.name,t.car_name,'') as car_name,
      coalesce(ah.plate_number_snapshot,car.plate_number,'') as plate_number,
      false as is_historical,
      'invoice'::text as record_type
    from public.sales_invoices si
    left join public.customers c on c.id=si.customer_id
    left join public.installation_neighborhoods n on n.id=c.neighborhood_id
    left join public.sales_invoices ref_si on ref_si.id=si.reference_sales_invoice_id
    left join public.installation_execution_visits v
      on v.id=coalesce(si.installation_execution_visit_id,ref_si.installation_execution_visit_id)
    left join public.installation_requests r
      on r.id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    left join public.installation_request_collection col
      on col.installation_request_id=coalesce(si.installation_request_id,ref_si.installation_request_id)
    left join public.installation_teams t
      on t.id=coalesce(v.installation_team_id,r.installation_team_id)
    left join lateral (
      select h.team_name_snapshot,h.appointment_car_id,h.car_name_snapshot,h.plate_number_snapshot
      from public.installation_team_assignment_history h
      where h.installation_team_id=coalesce(v.installation_team_id,r.installation_team_id)
        and h.effective_from<=si.invoice_date
        and (h.effective_to is null or h.effective_to>=si.invoice_date)
      order by h.effective_from desc,h.created_at desc
      limit 1
    ) ah on true
    left join public.appointment_cars car
      on car.id=coalesce(ah.appointment_car_id,t.appointment_car_id)
    where public.has_screen_permission('salesReports','view')
      and (si.representative_id is null or public.can_access_representative(si.representative_id))
  ),
  historical_rows as (
    select
      h.id as row_id,
      coalesce(nullif(h.invoice_number,''),'بدون فاتورة') as invoice_number,
      ''::text as request_number,
      h.customer_id,
      coalesce(c.customer_name,h.customer_name_snapshot,h.customer_name,'—') as customer_name_ar,
      c.neighborhood_id,
      coalesce(n.name,'') as neighborhood_name_ar,
      coalesce(n.name_en,'') as neighborhood_name_en,
      h.sales_date as invoice_date,
      'صادرة'::text as status,
      btrim(coalesce(h.payment_method,'')) as payment_method,
      'historical'::text as source_type,
      round(coalesce(h.sales_before_tax,0),2)::numeric(14,2) as amount_before_tax,
      round(greatest(coalesce(h.sales_inclusive,0)-coalesce(h.sales_before_tax,0),0),2)::numeric(14,2) as tax_amount,
      round(coalesce(h.discount_amount,0),2)::numeric(14,2) as discount_amount,
      round(coalesce(h.sales_inclusive,0),2)::numeric(14,2) as amount_incl_tax,
      ha.installation_team_id as team_id,
      coalesce(ha.team_name_snapshot,'') as team_name,
      h.appointment_car_id as car_id,
      coalesce(ha.car_name_snapshot,hc.name,h.vehicle,'') as car_name,
      coalesce(ha.plate_number_snapshot,hc.plate_number,'') as plate_number,
      true as is_historical,
      coalesce(h.record_type,'invoice_line') as record_type
    from public.appointment_historical_sales_reporting h
    left join public.customers c on c.id=h.customer_id
    left join public.installation_neighborhoods n on n.id=c.neighborhood_id
    left join public.appointment_cars hc on hc.id=h.appointment_car_id
    left join lateral (
      select x.installation_team_id,x.team_name_snapshot,x.car_name_snapshot,x.plate_number_snapshot
      from public.installation_team_assignment_history x
      where h.appointment_car_id is not null
        and x.appointment_car_id=h.appointment_car_id
        and x.effective_from<=h.sales_date
        and (x.effective_to is null or x.effective_to>=h.sales_date)
      order by x.effective_from desc,x.created_at desc
      limit 1
    ) ha on true
    where public.has_screen_permission('salesReports','view')
      and (
        h.customer_id is null
        or c.representative_id is null
        or public.can_access_representative(c.representative_id)
      )
  )
  select * from current_rows
  union all
  select * from historical_rows
  order by invoice_date desc,row_id desc;
$$;

revoke all on function public.sales_reports_rows_r44r38r20r35() from public,anon;
grant execute on function public.sales_reports_rows_r44r38r20r35() to authenticated,service_role;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,default_ar,default_en,ar_text,en_text,is_active,updated_at
)
values
  ('sidebar.salesReports','salesReports','crm','navigation','تقارير المبيعات','Sales Reports','تقارير المبيعات','Sales Reports',true,now()),
  ('salesReports.page.title','salesReports','crm','title','تقارير المبيعات','Sales Reports','تقارير المبيعات','Sales Reports',true,now()),
  ('salesReports.page.subtitle','salesReports','crm','subtitle','تحليل المبيعات والفواتير والتحصيل خلال السنة والشهر المحددين.','Analyze sales, invoices, and collections for the selected year and month.','تحليل المبيعات والفواتير والتحصيل خلال السنة والشهر المحددين.','Analyze sales, invoices, and collections for the selected year and month.',true,now()),
  ('salesReports.filter.title','salesReports','crm','title','فلاتر البحث والتصفية','Search & Filter Controls','فلاتر البحث والتصفية','Search & Filter Controls',true,now()),
  ('salesReports.filter.year','salesReports','crm','label','السنة','Year','السنة','Year',true,now()),
  ('salesReports.filter.month','salesReports','crm','label','الشهر','Month','الشهر','Month',true,now()),
  ('salesReports.filter.vehicle','salesReports','crm','label','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('salesReports.filter.customer','salesReports','crm','label','العميل','Customer','العميل','Customer',true,now()),
  ('salesReports.filter.team','salesReports','crm','label','الفريق','Team','الفريق','Team',true,now()),
  ('salesReports.filter.payment','salesReports','crm','label','طريقة السداد','Payment Method','طريقة السداد','Payment Method',true,now()),
  ('salesReports.filter.status','salesReports','crm','label','حالة الفاتورة','Invoice Status','حالة الفاتورة','Invoice Status',true,now()),
  ('salesReports.filter.all','salesReports','crm','option','الكل','All','الكل','All',true,now()),
  ('salesReports.filter.allMonths','salesReports','crm','option','كل الشهور المتاحة','All available months','كل الشهور المتاحة','All available months',true,now()),
  ('salesReports.action.apply','salesReports','crm','button','تطبيق الفلاتر','Apply Filters','تطبيق الفلاتر','Apply Filters',true,now()),
  ('salesReports.action.reset','salesReports','crm','button','إعادة تعيين','Reset','إعادة تعيين','Reset',true,now()),
  ('salesReports.action.refresh','salesReports','crm','button','تحديث البيانات','Refresh Data','تحديث البيانات','Refresh Data',true,now()),
  ('salesReports.status.loading','salesReports','crm','status','جاري تحميل بيانات المبيعات...','Loading sales data...','جاري تحميل بيانات المبيعات...','Loading sales data...',true,now()),
  ('salesReports.status.ready','salesReports','crm','status','تم تحديث تقرير المبيعات.','Sales report updated.','تم تحديث تقرير المبيعات.','Sales report updated.',true,now()),
  ('salesReports.status.empty','salesReports','crm','empty','لا توجد بيانات مبيعات للفلاتر المحددة.','No sales data matches the selected filters.','لا توجد بيانات مبيعات للفلاتر المحددة.','No sales data matches the selected filters.',true,now()),
  ('salesReports.error.load','salesReports','crm','error','تعذر تحميل بيانات تقارير المبيعات.','Unable to load sales report data.','تعذر تحميل بيانات تقارير المبيعات.','Unable to load sales report data.',true,now()),
  ('salesReports.common.undefined','salesReports','crm','status','غير محدد','Not specified','غير محدد','Not specified',true,now()),
  ('salesReports.common.cash','salesReports','crm','label','نقدي','Cash','نقدي','Cash',true,now()),
  ('salesReports.common.credit','salesReports','crm','label','آجل','Credit','آجل','Credit',true,now()),
  ('salesReports.common.issued','salesReports','crm','label','صادرة','Issued','صادرة','Issued',true,now()),
  ('salesReports.common.cancelled','salesReports','crm','label','ملغاة','Cancelled','ملغاة','Cancelled',true,now()),
  ('salesReports.common.historical','salesReports','crm','label','تاريخية','Historical','تاريخية','Historical',true,now()),
  ('salesReports.kpi.title','salesReports','crm','title','المؤشرات الرئيسية للمبيعات','Sales KPIs','المؤشرات الرئيسية للمبيعات','Sales KPIs',true,now()),
  ('salesReports.kpi.totalSales','salesReports','crm','label','إجمالي المبيعات','Total Sales','إجمالي المبيعات','Total Sales',true,now()),
  ('salesReports.kpi.invoiceCount','salesReports','crm','label','عدد الفواتير','Invoice Count','عدد الفواتير','Invoice Count',true,now()),
  ('salesReports.kpi.beforeTax','salesReports','crm','label','إجمالي قبل الضريبة','Total Before VAT','إجمالي قبل الضريبة','Total Before VAT',true,now()),
  ('salesReports.kpi.tax','salesReports','crm','label','إجمالي الضريبة','Total VAT','إجمالي الضريبة','Total VAT',true,now()),
  ('salesReports.kpi.discount','salesReports','crm','label','إجمالي الخصومات','Total Discounts','إجمالي الخصومات','Total Discounts',true,now()),
  ('salesReports.kpi.averageInvoice','salesReports','crm','label','متوسط الفاتورة','Average Invoice','متوسط الفاتورة','Average Invoice',true,now()),
  ('salesReports.kpi.cashSales','salesReports','crm','label','مبيعات نقدية','Cash Sales','مبيعات نقدية','Cash Sales',true,now()),
  ('salesReports.kpi.creditSales','salesReports','crm','label','مبيعات آجلة','Credit Sales','مبيعات آجلة','Credit Sales',true,now()),
  ('salesReports.kpi.issuedShare','salesReports','crm','label','نسبة الفواتير الصادرة','Issued Invoice Share','نسبة الفواتير الصادرة','Issued Invoice Share',true,now()),
  ('salesReports.report.daily.title','salesReports','crm','title','المبيعات عبر أيام الشهر','Sales Across the Month','المبيعات عبر أيام الشهر','Sales Across the Month',true,now()),
  ('salesReports.report.daily.note','salesReports','crm','help','حركة المبيعات يوميًا خلال الشهر المحدد.','Daily sales movement for the selected month.','حركة المبيعات يوميًا خلال الشهر المحدد.','Daily sales movement for the selected month.',true,now()),
  ('salesReports.report.payment.title','salesReports','crm','title','المبيعات حسب طريقة السداد','Sales by Payment Method','المبيعات حسب طريقة السداد','Sales by Payment Method',true,now()),
  ('salesReports.report.status.title','salesReports','crm','title','المبيعات حسب حالة الفاتورة','Sales by Invoice Status','المبيعات حسب حالة الفاتورة','Sales by Invoice Status',true,now()),
  ('salesReports.report.monthly.title','salesReports','crm','title','المبيعات الشهرية خلال السنة المختارة','Monthly Sales in Selected Year','المبيعات الشهرية خلال السنة المختارة','Monthly Sales in Selected Year',true,now()),
  ('salesReports.report.neighborhood.title','salesReports','crm','title','المبيعات حسب الحي','Sales by Neighborhood','المبيعات حسب الحي','Sales by Neighborhood',true,now()),
  ('salesReports.report.neighborhood.note','salesReports','crm','help','يعتمد الحي على بيانات العميل الحالية، لذلك تظهر أي إضافة لاحقة للحي في التقرير بعد تحديث البيانات.','The neighborhood comes from the current customer master, so later neighborhood updates appear in the report after data refresh.','يعتمد الحي على بيانات العميل الحالية، لذلك تظهر أي إضافة لاحقة للحي في التقرير بعد تحديث البيانات.','The neighborhood comes from the current customer master, so later neighborhood updates appear in the report after data refresh.',true,now()),
  ('salesReports.report.comparison.title','salesReports','crm','title','مقارنة المبيعات بالفترة السابقة','Sales vs Previous Period','مقارنة المبيعات بالفترة السابقة','Sales vs Previous Period',true,now()),
  ('salesReports.report.weekday.title','salesReports','crm','title','المبيعات حسب أيام الأسبوع','Sales by Weekday','المبيعات حسب أيام الأسبوع','Sales by Weekday',true,now()),
  ('salesReports.report.discount.title','salesReports','crm','title','تحليل الخصومات','Discount Analysis','تحليل الخصومات','Discount Analysis',true,now()),
  ('salesReports.report.vat.title','salesReports','crm','title','تحليل الضريبة','VAT Analysis','تحليل الضريبة','VAT Analysis',true,now()),
  ('salesReports.table.title','salesReports','crm','title','جدول تفاصيل المبيعات','Sales Detail Table','جدول تفاصيل المبيعات','Sales Detail Table',true,now()),
  ('salesReports.table.date','salesReports','crm','table','التاريخ','Date','التاريخ','Date',true,now()),
  ('salesReports.table.invoice','salesReports','crm','table','رقم الفاتورة','Invoice Number','رقم الفاتورة','Invoice Number',true,now()),
  ('salesReports.table.customer','salesReports','crm','table','العميل','Customer','العميل','Customer',true,now()),
  ('salesReports.table.neighborhood','salesReports','crm','table','الحي','Neighborhood','الحي','Neighborhood',true,now()),
  ('salesReports.table.team','salesReports','crm','table','الفريق','Team','الفريق','Team',true,now()),
  ('salesReports.table.vehicle','salesReports','crm','table','السيارة','Vehicle','السيارة','Vehicle',true,now()),
  ('salesReports.table.payment','salesReports','crm','table','طريقة السداد','Payment Method','طريقة السداد','Payment Method',true,now()),
  ('salesReports.table.status','salesReports','crm','table','الحالة','Status','الحالة','Status',true,now()),
  ('salesReports.table.beforeTax','salesReports','crm','table','قبل الضريبة','Before VAT','قبل الضريبة','Before VAT',true,now()),
  ('salesReports.table.tax','salesReports','crm','table','الضريبة','VAT','الضريبة','VAT',true,now()),
  ('salesReports.table.discount','salesReports','crm','table','الخصم','Discount','الخصم','Discount',true,now()),
  ('salesReports.table.total','salesReports','crm','table','شامل الضريبة','Total incl. VAT','شامل الضريبة','Total incl. VAT',true,now()),
  ('salesReports.table.more','salesReports','crm','button','عرض المزيد','Show More','عرض المزيد','Show More',true,now()),
  ('salesReports.month.1','salesReports','crm','option','يناير','January','يناير','January',true,now()),
  ('salesReports.month.2','salesReports','crm','option','فبراير','February','فبراير','February',true,now()),
  ('salesReports.month.3','salesReports','crm','option','مارس','March','مارس','March',true,now()),
  ('salesReports.month.4','salesReports','crm','option','أبريل','April','أبريل','April',true,now()),
  ('salesReports.month.5','salesReports','crm','option','مايو','May','مايو','May',true,now()),
  ('salesReports.month.6','salesReports','crm','option','يونيو','June','يونيو','June',true,now()),
  ('salesReports.month.7','salesReports','crm','option','يوليو','July','يوليو','July',true,now()),
  ('salesReports.month.8','salesReports','crm','option','أغسطس','August','أغسطس','August',true,now()),
  ('salesReports.month.9','salesReports','crm','option','سبتمبر','September','سبتمبر','September',true,now()),
  ('salesReports.month.10','salesReports','crm','option','أكتوبر','October','أكتوبر','October',true,now()),
  ('salesReports.month.11','salesReports','crm','option','نوفمبر','November','نوفمبر','November',true,now()),
  ('salesReports.month.12','salesReports','crm','option','ديسمبر','December','ديسمبر','December',true,now()),
  ('pwa.update.release.r44r38r20r35.title','aboutApp','system','title','تقارير المبيعات — R44R38R20R35','Sales Reports — R44R38R20R35','تقارير المبيعات — R44R38R20R35','Sales Reports — R44R38R20R35',true,now()),
  ('pwa.update.release.r44r38r20r35.note1','aboutApp','system','note','إضافة شاشة تقارير المبيعات بفلاتر السنة والشهر والتقارير التحليلية المتخصصة بالمبيعات.','Adds the Sales Reports screen with year/month filters and sales-focused analytics.','إضافة شاشة تقارير المبيعات بفلاتر السنة والشهر والتقارير التحليلية المتخصصة بالمبيعات.','Adds the Sales Reports screen with year/month filters and sales-focused analytics.',true,now()),
  ('pwa.update.release.r44r38r20r35.note2','aboutApp','system','note','المبيعات حسب الحي تعتمد على الحي الحالي في سجل العميل لتنعكس التحديثات اللاحقة تلقائيًا بعد تحديث البيانات.','Sales by neighborhood uses the current customer neighborhood so later customer updates are reflected after data refresh.','المبيعات حسب الحي تعتمد على الحي الحالي في سجل العميل لتنعكس التحديثات اللاحقة تلقائيًا بعد تحديث البيانات.','Sales by neighborhood uses the current customer neighborhood so later customer updates are reflected after data refresh.',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;

-- Read-only verification surface for the phase.
select
  'R44R38R20R35_SALES_REPORTS_INSTALL_OK'::text as status,
  (select count(*)::integer from public.app_screens where screen_key='salesReports' and group_name='التقارير والتحليلات' and is_active=true) as screen_registered,
  (select count(*)::integer from public.role_screen_permissions where screen_key='salesReports' and can_view=true) as view_roles,
  (select count(*)::integer from public.role_screen_permissions where screen_key='salesReports' and can_add) as write_roles,
  (select count(*)::integer from information_schema.routines where routine_schema='public' and routine_name='sales_reports_rows_r44r38r20r35') as rpc_registered,
  (select count(*)::integer from public.app_translations where screen_key='salesReports' and is_active=true) as translation_rows;
