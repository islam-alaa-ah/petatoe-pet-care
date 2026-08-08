# Phase M13.22.5 — Sales Representative Create Action Runtime Recovery

## Root Cause
أزرار الإضافة ظلت مرتبطة بالكامل بصفوف الصلاحيات المحملة أو المخزنة محليًا. أي صف ناقص أو كاش قديم كان يخفي الأزرار رغم أن دور مندوب المبيعات معتمد له الإنشاء.

## Fix
- إضافة Role Baseline محدود لـ `sales_representative` على `customers.add` و`quotations.add`.
- الإبقاء على RLS كحد أمان نهائي.
- إضافة Migration لإصلاح الصفوف على الخادم.
- الحفاظ على محرك البحث داخل اختيار العميل في عرض السعر.

## Required step
تشغيل migration ثم تسجيل خروج ودخول.
