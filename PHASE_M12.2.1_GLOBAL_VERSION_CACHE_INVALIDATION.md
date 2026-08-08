# Phase M12.2.1 — Global Version & Cache Invalidation

## Scope

رفع الإصدار الموحد إلى `18.3.6` وإجبار نسخ Android PWA وChrome/Edge على الكمبيوتر على اكتشاف النسخة الجديدة وتفريغ كاش الإصدار السابق.

## Files changed

- `package.json`
- `index.html`
- `version.json`
- `service-worker.js`
- `assets/js/pwa.js`

## Update behavior

- `version.json` يحمل الإصدار `18.3.6` والبناء `18306` مع `forceUpdate: true`.
- روابط CSS وJavaScript الرئيسية في `index.html` تستخدم `?v=18.3.6`.
- Service Worker يستخدم مساحة كاش جديدة: `kyum-crm-pwa-18-3-6-m12-2-1`.
- مرحلة `activate` تحذف كل مساحات كاش KYUM القديمة ثم تنفذ `clients.claim()`.
- مرحلة `install` تنفذ `skipWaiting()`.
- طلب `version.json` يعمل دائمًا بـ `no-store`.

## Permission safety verification

لم يتم تعديل أي ملف من ملفات الصلاحيات أو البيانات أو Supabase.

تمت مراجعة مسار إظهار الشاشات وتأكيد الآتي:

1. `auth-session.js` يحمّل ملف المستخدم أولًا.
2. يتم تحميل `role_screen_permissions` قبل إظهار التطبيق.
3. `CustomerPermissions.applyScreenVisibility()` يخفي ويعطل كل شاشة لا يملك المستخدم `can_view` لها.
4. `switchView()` يعيد فحص الصلاحية عند كل انتقال مباشر أو عبر الرابط، ويمنع فتح الشاشة غير المصرح بها حتى لو تم استدعاؤها برمجيًا.
5. شريط الموبايل ينسخ حالة الظهور من عناصر القائمة الأصلية المطبقة عليها الصلاحيات.

## Excluded

- لا تعديل على RLS أو SQL.
- لا تعديل على أدوار المستخدمين أو مصفوفة الصلاحيات.
- لا تعديل على نطاق بيانات العملاء أو المندوبين.
- لا تعديل على Business Logic أو التقارير أو الاستيراد.
