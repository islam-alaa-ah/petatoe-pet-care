# Phase M13.22.3 — Quotation Customer Searchable Select

## Baseline
`kyum.company-main (1)(2).zip`

## Root Cause
نافذة إضافة/تعديل عرض السعر كانت تستخدم عنصر `select` عاديًا لا يدعم البحث، ما يجعل اختيار العميل صعبًا عند وجود عدد كبير من العملاء.

## Changes
- استبدال العرض المرئي لقائمة العملاء داخل نافذة عرض السعر بمكوّن بحث واختيار.
- دعم البحث المحلي ضمن العملاء المسموح للمستخدم برؤيتهم بواسطة:
  - اسم العميل.
  - رقم الجوال كاملًا أو جزئيًا.
  - كود العميل.
- ترتيب النتائج: تطابق كامل، ثم بداية النص، ثم تطابق جزئي.
- عرض اسم العميل ورقم الجوال وكود العميل في النتيجة.
- الاحتفاظ بعنصر `quotationCustomer` وقيمة `customer_id` لضمان عدم تغيير منطق الحفظ.
- دعم إضافة وتعديل عرض السعر، والإغلاق، وإعادة التهيئة.
- دعم لوحة المفاتيح: سهم لأسفل/أعلى وEscape.
- تنسيق Responsive للموبايل والوضعين الفاتح والداكن.

## Files Modified
- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`

## Version
- Version: `18.18.3`
- Build: `181803`
- Cache: `kyum-crm-pwa-18-18-3-m13-22-3`

## Regression Boundaries
لم يتم تعديل:
- Supabase أو SQL أو RLS.
- صلاحيات المستخدمين.
- `quotations-service.js`.
- منطق إضافة أو تعديل عروض الأسعار.
- Offline Queue أو Smart Sync.
