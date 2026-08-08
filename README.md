# Customer Management v1.0 — Phase 1

نسخة تأسيسية لنظام إدارة ومتابعة بيانات العملاء.

## الوظائف المنفذة

- شاشة تسجيل دخول تجريبية.
- لوحة تحكم بإحصائيات العملاء.
- إضافة وتعديل وحذف العملاء.
- رقم الجوال هو رقم العميل والمرجع الظاهر للمستخدم.
- منع تسجيل رقم الجوال نفسه لأكثر من عميل، مع توحيد صيغ 05 / 966 / 00966.
- رقم داخلي متسلسل مخفي يستخدم للربط التقني فقط.
- تصنيف العميل: شركة أو فردي.
- اختيار أكثر من مجال اهتمام.
- ربط العميل بالمندوب.
- تاريخ التواصل.
- رقم عرض السعر.
- سبب عدم البيع.
- الملاحظات.
- البحث والتصفية.
- شاشة المندوبين.
- شاشة إعدادات مرجعية.
- تصميم متجاوب للكمبيوتر والموبايل.
- مخطط قاعدة بيانات Supabase.

## التشغيل المحلي

افتح ملف `index.html` مباشرة في المتصفح.

بيانات الدخول التجريبية:

- البريد: `admin@company.com`
- كلمة المرور: `admin123`

> في المرحلة الأولى، البيانات تحفظ داخل LocalStorage في المتصفح لتجربة الواجهة قبل ربط Supabase فعليًا.

## إعداد Supabase

نفّذ الملفات التالية بالترتيب داخل SQL Editor:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/policies.sql`

## المرحلة التالية

- ربط الواجهة فعليًا بـ Supabase.
- تسجيل دخول حقيقي.
- إدارة المستخدمين والصلاحيات.
- سجل متابعات متعدد لكل عميل.


## Phase 2 — Customer Follow-ups

تمت إضافة:

- سجل متابعات متعدد لكل عميل.
- طرق التواصل: اتصال، واتساب، زيارة، بريد إلكتروني، اجتماع.
- نتيجة كل تواصل.
- تاريخ المتابعة القادمة.
- حالة المتابعة: مفتوحة أو مكتملة.
- متابعات اليوم والمتابعات المتأخرة والقادمة.
- ملف عميل يعرض الخط الزمني الكامل.
- تحديث آخر تواصل وعرض السعر داخل سجل العميل تلقائيًا.
- حذف متابعات العميل تلقائيًا عند حذف العميل.
- ملف SQL مستقل للمرحلة الثانية:
  `supabase/phase2_customer_followups.sql`


## Phase 3 — Quotations Management

تمت إضافة:

- شاشة مستقلة لإدارة عروض الأسعار.
- ربط كل عرض سعر بعميل ومندوب.
- منع تكرار رقم عرض السعر.
- تسجيل قيمة العرض وحالته.
- حالات العرض: تحت التجهيز، تم الإرسال، تحت المراجعة، مقبول، مرفوض، ملغي.
- تسجيل تاريخ العرض وتاريخ الانتهاء.
- تسجيل سبب الرفض عند رفض العرض.
- تحديث رقم آخر عرض سعر داخل سجل العميل.
- عرض عروض الأسعار داخل ملف العميل.
- إحصائيات إجمالي العروض والقيمة والعروض المقبولة والمرفوضة.
- ملف SQL مستقل:
  `supabase/phase3_quotations.sql`

## ZIP Packaging Standard

ابتداءً من هذه المرحلة، كل ملف ZIP يحتوي على مجلد رئيسي مستقل باسم المرحلة.


## Phase 4 — Dashboard & Reports

تمت إضافة:

- لوحة تحكم تحليلية موحدة.
- فلاتر حسب المندوب، نوع العميل، مجال الاهتمام، والفترة.
- إجمالي العملاء والمتابعات وعروض الأسعار.
- قيمة عروض الأسعار وقيمة العروض المقبولة.
- نسبة التحويل من عروض الأسعار إلى عروض مقبولة.
- تحليل أداء كل مندوب.
- تحليل مجالات الاهتمام الأكثر طلبًا.
- تحليل حالات عروض الأسعار.
- تحليل أسباب عدم البيع.
- اتجاه النشاط خلال آخر 14 يومًا متاحًا.
- أحدث العملاء والمتابعات التي تحتاج انتباهًا.
- ملف SQL مستقل للتقارير:
  `supabase/phase4_reporting_views.sql`

## Package Folder

عند فك ضغط هذه المرحلة يظهر المجلد:

`customer-management-v1.0-phase4-dashboard-reports`


## Phase 5A — Enterprise Database & Auth Foundation

- Added dedicated Supabase configuration and client bootstrap.
- Added enterprise roles and user profiles.
- Added secure role-aware RLS policies.
- Added audit log foundation.
- Added future-ready CRM entities for contacts, tasks, orders, invoices, projects, contracts, installed assets, services, complaints and collections.
- Added verification SQL.
- Live CRUD activation is deferred to Phase 5B until the complete Publishable Key is configured.


## Phase 5B.1 — Supabase Auth Integration

- Real Supabase login and persistent sessions.
- User profile and role loading.
- Secure logout and auth guard.
- Organized docs structure.
