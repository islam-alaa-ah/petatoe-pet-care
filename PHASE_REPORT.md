# Phase M15.5 — Installation Address Hierarchy Unification

## Root Cause
شاشة طلب تركيب جديد ونافذة تعديل بيانات الطلب من الجدولة كانتا تختاران الحي مباشرة من كتالوج موحد، لذلك لا يمكن تمييز الأحياء المتشابهة بالاسم بين مدن مختلفة.

## Implementation
- إضافة تسلسل المنطقة ← المدينة ← الحي في طلب تركيب جديد.
- إضافة نفس التسلسل في نافذة تعديل بيانات الطلب داخل جدولة وتوزيع التركيبات.
- القوائم قابلة للبحث وتستخدم نفس نمط الواجهة المعتمد في إضافة العميل.
- المدينة لا تُتاح قبل اختيار المنطقة، والحي لا يُتاح قبل اختيار المدينة.
- تغيير المنطقة يمسح المدينة والحي، وتغيير المدينة يمسح الحي.
- الحفظ يظل يعتمد على `neighborhood_id` المرجعي؛ المنطقة والمدينة تُستنتجان من علاقة الحي ولا توجد حاجة لتكرار مفاتيحها في طلب التركيب.
- تحميل المناطق والمدن والأحياء يتم كاملًا عبر pagination من Supabase.
- عند تعديل طلب موجود، تُستعاد المنطقة والمدينة والحي من `neighborhood_id` الحالي.

## Modified Files
- index.html
- assets/js/installations-module.js
- assets/js/installations-service.js
- assets/css/installation-requests.css
- assets/css/installation-request-inline-dialogs.css
- assets/js/pwa.js
- service-worker.js
- package.json
- version.json
- PHASE_REPORT.md

## Regression Scope
- إضافة طلب تركيب جديد.
- تعديل طلب تركيب من شاشة طلبات التركيبات.
- تعديل بيانات الطلب من شاشة جدولة وتوزيع التركيبات.
- إنشاء طلب من عرض سعر مقبول.
- حفظ الخدمات والأسعار ورقم طلب العميل وموقع Google Maps.
- شاشة إضافة العميل الجغرافية لم يتم تعديل منطقها.

## Version
- Version: 18.53.0
- Build: 185300
- Cache: `kyum-crm-pwa-18-53-0-installation-address-hierarchy-unification`
