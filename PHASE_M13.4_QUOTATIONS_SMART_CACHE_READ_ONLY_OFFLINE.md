# Phase M13.4 — Quotations Smart Cache & Read-Only Offline

## Root Cause

كانت شاشة عروض الأسعار تعتمد على استعلام Supabase كامل عند بداية التشغيل أو عند فتح الشاشة، ولا توجد نسخة دائمة بعد إغلاق التطبيق. لذلك كانت الشاشة تنتظر الشبكة قبل عرض البيانات، حتى عندما لم تتغير عروض الأسعار.

## Scope

- إضافة Smart Cache لعروض الأسعار داخل IndexedDB.
- فصل الكاش حسب المستخدم ونطاق المندوبين المسموح.
- عرض الكاش أولًا ثم التحقق من Supabase في الخلفية.
- إعادة تحديث الواجهة فقط عند اختلاف Hash البيانات.
- إبطال الكاش بعد الإضافة أو التعديل أو الحذف.
- الإبقاء على جميع عمليات الكتابة Online Only.

## Modified Files

- `assets/js/quotations-service.js`
- `assets/js/app.js`
- `assets/js/pwa.js`
- `index.html`
- `package.json`
- `version.json`
- `service-worker.js`

## Safety Boundaries

لم يتم تعديل SQL أو RLS أو Supabase Schema أو Business Logic أو Permission Engine أو الاستيراد والتصدير. لا توجد Offline Write Queue في هذه المرحلة.

## Version

- Version: `18.4.3`
- Build: `18403`
- Service Worker Cache: `kyum-crm-pwa-18-4-3-m13-4`
