-- Phase P5.13.8.71 R2
-- Commission Statement visual redesign localization only.
-- No commission, payroll, invoice, permission, or workflow business logic changes.

begin;

insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,
  ar_text,en_text,default_ar,default_en,is_active,updated_at
) values
  ('commissionStatement.summaryTitle','commissionStatement','payroll','title','ملخص كشف العمولة','Commission Statement Summary','ملخص كشف العمولة','Commission Statement Summary',true,now()),
  ('commissionStatement.eligibleSales','commissionStatement','payroll','label','إجمالي المبيعات المؤهلة','Total Eligible Sales','إجمالي المبيعات المؤهلة','Total Eligible Sales',true,now()),
  ('commissionStatement.statusEligible','commissionStatement','payroll','status','مستحق','Eligible','مستحق','Eligible',true,now()),
  ('commissionStatement.calculationTitle','commissionStatement','payroll','title','طريقة الحساب','Calculation Method','طريقة الحساب','Calculation Method',true,now()),
  ('commissionStatement.finalInvoiceAfterDiscount','commissionStatement','payroll','label','قيمة الفواتير النهائية بعد الخصم','Final Invoice Value After Discount','قيمة الفواتير النهائية بعد الخصم','Final Invoice Value After Discount',true,now()),
  ('commissionStatement.reachedTier','commissionStatement','payroll','label','الشريحة المحققة','Reached Tier','الشريحة المحققة','Reached Tier',true,now()),
  ('commissionStatement.conditionsTitle','commissionStatement','payroll','title','شروط الاستحقاق','Eligibility Conditions','شروط الاستحقاق','Eligibility Conditions',true,now()),
  ('commissionStatement.condition.employeeEligible','commissionStatement','payroll','label','الموظف مفعل كمستحق عمولة','Employee is enabled for commission','الموظف مفعل كمستحق عمولة','Employee is enabled for commission',true,now()),
  ('commissionStatement.condition.roleLinked','commissionStatement','payroll','label','الدور مرتبط بالسيارة','Role is linked to the vehicle','الدور مرتبط بالسيارة','Role is linked to the vehicle',true,now()),
  ('commissionStatement.condition.salesAvailable','commissionStatement','payroll','label','توجد مبيعات مؤهلة','Eligible sales are available','توجد مبيعات مؤهلة','Eligible sales are available',true,now()),
  ('commissionStatement.condition.tierActive','commissionStatement','payroll','label','الشريحة المستخدمة مفعلة','Used tier is active','الشريحة المستخدمة مفعلة','Used tier is active',true,now()),
  ('commissionStatement.tierPart','commissionStatement','payroll','table','المبلغ الداخل في الشريحة','Sales in Tier','المبلغ الداخل في الشريحة','Sales in Tier',true,now()),
  ('commissionStatement.tierCommission','commissionStatement','payroll','table','العمولة الناتجة','Tier Commission','العمولة الناتجة','Tier Commission',true,now()),
  ('commissionStatement.tierStatus','commissionStatement','payroll','table','الحالة','Status','الحالة','Status',true,now()),
  ('commissionStatement.tierCalculated','commissionStatement','payroll','status','محتسبة','Calculated','محتسبة','Calculated',true,now()),
  ('commissionStatement.tierUnused','commissionStatement','payroll','status','غير مستخدمة','Unused','غير مستخدمة','Unused',true,now()),
  ('commissionStatement.tierInactive','commissionStatement','payroll','status','غير مفعلة','Inactive','غير مفعلة','Inactive',true,now()),
  ('commissionStatement.formulaNote','commissionStatement','payroll','help','يتم احتساب العمولة من قيمة الفواتير النهائية بعد الخصم ÷ 1.15 ثم توزيع المبيعات على الشرائح المفعلة.','Commission is calculated from the final invoice value after discount ÷ 1.15, then eligible sales are distributed across active tiers.','يتم احتساب العمولة من قيمة الفواتير النهائية بعد الخصم ÷ 1.15 ثم توزيع المبيعات على الشرائح المفعلة.','Commission is calculated from the final invoice value after discount ÷ 1.15, then eligible sales are distributed across active tiers.',true,now()),
  ('commissionStatement.vehicles','commissionStatement','payroll','label','سيارات','vehicles','سيارات','vehicles',true,now())
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  ar_text=excluded.ar_text,
  en_text=excluded.en_text,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

notify pgrst,'reload schema';
commit;
