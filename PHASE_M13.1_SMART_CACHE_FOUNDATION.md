# Phase M13.1 — Enterprise Smart Cache Foundation

## Scope

تمت إضافة طبقة تخزين محلي مبنية على IndexedDB للبيانات المرجعية فقط:

- مندوبي المبيعات
- تصنيفات الاهتمام
- أسباب عدم البيع

لم يتم تخزين العملاء أو المتابعات أو عروض الأسعار أو أي عمليات كتابة Offline في هذه المرحلة.

## Root Cause

كانت البيانات المرجعية تُحفظ داخل الذاكرة لمدة خمس دقائق فقط. عند إعادة فتح التطبيق أو ضعف الشبكة كان التطبيق ينتظر Supabase قبل عرض القوائم المرجعية.

## Architecture

- `assets/js/smart-cache.js`: مخزن IndexedDB بإصدار Schema مستقل، TTL، حد أقصى للبيانات القديمة، Hash سلامة، إحصاءات، وتنظيف حسب Prefix.
- التخزين مفصول حسب `auth.user.id` لمنع مشاركة Cache بين المستخدمين على الجهاز نفسه.
- `reference-data-service.js`: Cache-first ثم Background Refresh عند توفر الإنترنت، مع Network Fallback آمن.
- `app.js`: يستقبل تحديثات الخلفية ويحدث القوائم المرجعية فقط عند وصول بيانات مختلفة.

## Safety

لم يتم تعديل:

- SQL أو RLS أو Supabase Schema
- نظام الصلاحيات
- Business Logic
- عمليات إضافة أو تعديل أو حذف البيانات
- العملاء والمتابعات وعروض الأسعار والتقارير

## Version

- Version: 18.4.0
- Build: 18400
- Service Worker Cache: `kyum-crm-pwa-18-4-0-m13-1`
