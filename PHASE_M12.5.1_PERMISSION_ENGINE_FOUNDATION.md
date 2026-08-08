# Phase M12.5.1 — Unified Permission Engine Foundation

## Baseline
`kyum.company-main (7)(1).zip`

## Root Cause
صلاحيات التطبيق الحالية تعمل من خلال `window.CustomerPermissions`، لكن بقية مكونات الواجهة لا تملك عقدًا مركزيًا ثابتًا لاستخدام قرارات العرض والإجراءات ومجموعات التنقل. يؤدي توسيع النظام مباشرة داخل كل شاشة إلى تكرار منطق الصلاحيات واحتمال اختلاف الموبايل عن سطح المكتب.

## التنفيذ
- إضافة `assets/js/permission-engine.js` كطبقة قراءة موحدة فوق نظام الصلاحيات الحالي.
- لم يتم استبدال أو حذف `CustomerPermissions`.
- المحرك الجديد يفوض القرار النهائي إلى `CustomerPermissions.canScreen()`، لذلك لا يرفع أو يغير أي صلاحية.
- توفير API موحد: `canView`, `canAdd`, `canEdit`, `canDelete`, `canExport`, `canImport`, `authorize`, `firstAllowedScreen`.
- تعريف مجموعات التنقل الحالية وفحص `canShowGroup()`.
- إضافة Snapshot للتشخيص ووضع Debug لا يعمل إلا عند تفعيله بواسطة `super_admin`.
- إضافة المحرك إلى App Shell في Service Worker وتحديث الإصدار والكاش.

## خارج النطاق
- لا SQL أو RLS أو Schema.
- لا تغيير في جداول أو قيم الصلاحيات.
- لا تغيير في Business Logic أو نطاق بيانات المستخدمين.
- لا استبدال لتحققات القوائم والشاشات والأزرار في هذه المرحلة؛ الربط التدريجي يتم في M12.5.2 وما بعدها.

## الإصدار
- Version: 18.3.7
- Build: 18307
- Cache: `kyum-crm-pwa-18-3-7-m12-5-1`
