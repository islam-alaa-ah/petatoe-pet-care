# Phase M13.5 — Enterprise Delta Sync Engine

## Root Cause
طبقات الكاش في M13.1–M13.4 كانت تعرض البيانات محليًا بسرعة، لكنها تعيد تحميل القائمة كاملة من Supabase عند كل تحديث خلفي. هذا يلغي جزءًا كبيرًا من فائدة الكاش عند وجود عدد كبير من السجلات.

## Implementation
- إضافة `assets/js/sync-engine.js` كمحرك مركزي للمزامنة.
- حفظ Cursor مستقل لكل مستخدم وكيان ونطاق صلاحيات.
- استخدام `updated_at >= cursor` مع نافذة تداخل زمنية 5 ثوانٍ لمنع فقدان تحديثات متزامنة.
- دمج Delta بالسجلات الموجودة حسب `id`.
- مزامنة كاملة آلية كل 6 ساعات لتسوية الحذف الصلب، لأن الجداول الحالية لا تعرض سجل حذف أو Tombstone.
- منع تشغيل أكثر من مزامنة لنفس الكيان والنطاق.
- تشغيل تحديث عند استعادة الاتصال وعند عودة التطبيق إلى الواجهة.
- Retry تدريجي عند فشل مهمة المزامنة.

## Entities
- Customers
- Follow-ups
- Quotations

## Safety Boundaries
- لا تعديل على SQL أو RLS أو Supabase Schema.
- لا تعديل على Business Logic أو Permission Engine.
- لا Offline Write Queue.
- الحفظ والتعديل والحذف ما زالت Online Only.
- التحديث اليدوي `force=true` ينفذ Full Reconciliation لضمان الدقة.

## Version
- Version: 18.4.4
- Build: 18404
- Service Worker Cache: `kyum-crm-pwa-18-4-4-m13-5`

## Runtime Validation
التحقق الحالي ساكن: Syntax، ترتيب التحميل، App Shell، واتساق الإصدار. يلزم Smoke Test على نشر فعلي للتحقق من استعلامات Supabase والأجهزة الحقيقية.
