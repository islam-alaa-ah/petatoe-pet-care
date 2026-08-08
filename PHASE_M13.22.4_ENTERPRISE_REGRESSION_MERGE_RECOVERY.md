# Phase M13.22.4 — Enterprise Regression Merge Recovery

## Baseline
`kyum.company-main (2)(3).zip`

## هدف المرحلة
استعادة واعتماد الوظائف الثلاث معًا داخل نسخة تراكمية واحدة:

1. إضافة عميل لدور مندوب المبيعات.
2. إضافة عرض سعر لدور مندوب المبيعات.
3. البحث عن العميل بالاسم ورقم الجوال وكود العميل داخل عرض السعر.

## Root Cause
آخر الحزم الجزئية لم تكن ضمانًا كافيًا للحالة التراكمية بين ملفات الواجهة، صلاحيات الدور، سياسات RLS، وكاش الصلاحيات على الجهاز. وجود كود البحث وحده لا يضمن استمرار صلاحيات الإنشاء، ووجود SQL قديم دون إعادة تشغيله لا يضمن أن قاعدة البيانات الحالية تحمل `can_add=true`.

## التنفيذ
- تثبيت فحوص `customers.add` و`quotations.add` داخل النسخة التراكمية من `app.js`.
- الإبقاء على Searchable Select الحالي داخل عرض السعر.
- Migration idempotent تستعيد `can_view/can_add` لدور `sales_representative`.
- إعادة إنشاء سياسات INSERT للعملاء والعروض بالمفاتيح نفسها.
- Verification SQL وفحص Regression آلي.

## خطوة Supabase إلزامية
شغّل:
`supabase/migrations/phase_m13_22_4_enterprise_regression_merge_recovery.sql`

ثم نفّذ تسجيل خروج ودخول لحساب المندوب لإعادة تحميل الصلاحيات من الخادم.
