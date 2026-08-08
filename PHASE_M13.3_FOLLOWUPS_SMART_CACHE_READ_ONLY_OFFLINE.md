# Phase M13.3 — Follow-ups Smart Cache & Read-Only Offline

## Root Cause

كانت شاشة المتابعات تنتظر استعلام Supabase الكامل عند كل تشغيل جديد، ولم يكن كاش الذاكرة صالحًا بعد إعادة تحميل التطبيق أو إغلاقه.

## Implementation

- تخزين المتابعات داخل IndexedDB باستخدام KYUMSmartCache.
- فصل الكاش حسب المستخدم ونطاق المندوبين المسموح.
- stale-while-revalidate: عرض الكاش أولًا ثم التحقق من Supabase في الخلفية.
- إعادة الرسم فقط عند اختلاف Hash البيانات.
- إبطال كاش المتابعات بعد الإضافة أو التعديل أو الحذف.
- وضع القراءة فقط عند انقطاع الاتصال؛ لا توجد Offline Write Queue في هذه المرحلة.

## Unchanged

لم يتم تعديل SQL أو RLS أو Supabase Schema أو منطق الصلاحيات أو Business Logic.

## Version

- Application: 18.4.2
- Build: 18402
- Service Worker cache: kyum-crm-pwa-18-4-2-m13-3
