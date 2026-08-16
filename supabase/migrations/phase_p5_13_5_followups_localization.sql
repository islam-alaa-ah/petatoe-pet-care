insert into public.app_translations
(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active)
values
('followups.loading.cached','followups','customers','status','جاري تحميل آخر بيانات المتابعات المحفوظة...','Loading the latest cached follow-up data...','جاري تحميل آخر بيانات المتابعات المحفوظة...','Loading the latest cached follow-up data...',true),
('followups.error.load','followups','customers','error','تعذر تحميل المتابعات.','Unable to load follow-ups.','تعذر تحميل المتابعات.','Unable to load follow-ups.',true),
('followups.error.chooseCustomer','followups','customers','error','اختر العميل.','Select a customer.','اختر العميل.','Select a customer.',true),
('followups.error.chooseRep','followups','customers','error','اختر المندوب المسؤول.','Select the responsible representative.','اختر المندوب المسؤول.','Select the responsible representative.',true),
('followups.error.save','followups','customers','error','تعذر حفظ المتابعة.','Unable to save the follow-up.','تعذر حفظ المتابعة.','Unable to save the follow-up.',true),
('followups.error.deletePermission','followups','customers','error','لا توجد صلاحية لحذف المتابعات.','You do not have permission to delete follow-ups.','لا توجد صلاحية لحذف المتابعات.','You do not have permission to delete follow-ups.',true),
('followups.confirm.delete','followups','customers','confirm','هل تريد حذف هذه المتابعة؟','Do you want to delete this follow-up?','هل تريد حذف هذه المتابعة؟','Do you want to delete this follow-up?',true),
('followups.dialog.saving','followups','customers','status','جاري الحفظ...','Saving...','جاري الحفظ...','Saving...',true),
('followups.mobile.communication','followups','customers','label','إدارة التواصل','Communication Management','إدارة التواصل','Communication Management',true),
('followups.mobile.filters','followups','customers','label','الفلاتر','Filters','الفلاتر','Filters',true),
('followups.mobile.all','followups','customers','label','الكل','All','الكل','All',true),
('followups.mobile.statusFilterAria','followups','customers','aria','فلترة المتابعات حسب الحالة','Filter follow-ups by status','فلترة المتابعات حسب الحالة','Filter follow-ups by status',true),
('followups.mobile.viewOptions','followups','customers','label','خيارات العرض','View Options','خيارات العرض','View Options',true),
('followups.mobile.filterTitle','followups','customers','label','فلترة المتابعات','Filter Follow-ups','فلترة المتابعات','Filter Follow-ups',true),
('followups.mobile.closeFilters','followups','customers','aria','إغلاق فلاتر المتابعات','Close follow-up filters','إغلاق فلاتر المتابعات','Close follow-up filters',true),
('shared.cache.local','shared','core','status','يتم عرض آخر بيانات محفوظة محليًا.','Showing the latest locally cached data.','يتم عرض آخر بيانات محفوظة محليًا.','Showing the latest locally cached data.',true),
('shared.cache.lessMinute','shared','core','status','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.','Showing locally cached data — last synced less than a minute ago.','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.','Showing locally cached data — last synced less than a minute ago.',true),
('shared.cache.minutes','shared','core','format','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ {count} دقيقة.','Showing locally cached data — last synced {count} minutes ago.','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ {count} دقيقة.','Showing locally cached data — last synced {count} minutes ago.',true),
('shared.cache.hours','shared','core','format','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ {count} ساعة.','Showing locally cached data — last synced {count} hours ago.','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ {count} ساعة.','Showing locally cached data — last synced {count} hours ago.',true),
('shared.cache.days','shared','core','format','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ {count} يوم.','Showing locally cached data — last synced {count} days ago.','يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ {count} يوم.','Showing locally cached data — last synced {count} days ago.',true)
on conflict (translation_key) do update set
screen_key=excluded.screen_key,module_name=excluded.module_name,text_type=excluded.text_type,
default_ar=excluded.default_ar,default_en=excluded.default_en,
ar_text=case when coalesce(public.app_translations.ar_text,'')='' then excluded.ar_text else public.app_translations.ar_text end,
en_text=case when coalesce(public.app_translations.en_text,'')='' then excluded.en_text else public.app_translations.en_text end,
is_active=true;
