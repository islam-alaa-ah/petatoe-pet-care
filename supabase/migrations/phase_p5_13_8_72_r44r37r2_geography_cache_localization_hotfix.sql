-- R44R37R2 — Geographic source + cached-status localization hotfix
-- Scope: localization/display only. Uses authoritative National Address name_en already stored on installation_neighborhoods.
-- Non-destructive. Existing customized translations are preserved.

begin;

with translation_seed(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at) as (
values
  ('customers.loading.cached','customers','crm','status','جاري تحميل آخر بيانات العملاء المحفوظة...','Loading the latest cached customer data...','جاري تحميل آخر بيانات العملاء المحفوظة...','Loading the latest cached customer data...',true,now()),
  ('contracts.loading.cached','quotations','crm','status','جاري تحميل آخر بيانات عقود العملاء المحفوظة...','Loading the latest cached customer contracts...','جاري تحميل آخر بيانات عقود العملاء المحفوظة...','Loading the latest cached customer contracts...',true,now()),
  ('referenceData.loading','settings','crm','status','جاري تحميل البيانات المرجعية...','Loading reference data...','جاري تحميل البيانات المرجعية...','Loading reference data...',true,now()),
  ('representatives.loading','representatives','crm','status','جاري تحميل المندوبين...','Loading sales representatives...','جاري تحميل المندوبين...','Loading sales representatives...',true,now()),
  ('geography.search.noResults','shared','core','empty','لا توجد نتائج مطابقة.','No matching results.','لا توجد نتائج مطابقة.','No matching results.',true,now()),
  ('geography.placeholder.citySearch','shared','core','placeholder','ابحث واختر المدينة','Search and select a city','ابحث واختر المدينة','Search and select a city',true,now()),
  ('geography.placeholder.districtSearch','shared','core','placeholder','ابحث واختر الحي','Search and select a district','ابحث واختر الحي','Search and select a district',true,now()),
  ('geography.placeholder.regionFirst','shared','core','placeholder','اختر المنطقة أولًا','Select a region first','اختر المنطقة أولًا','Select a region first',true,now()),
  ('geography.placeholder.cityFirst','shared','core','placeholder','اختر المدينة أولًا','Select a city first','اختر المدينة أولًا','Select a city first',true,now()),
  ('pwa.update.release.r44r37r2.title','aboutApp','system','title','إصلاح ترجمة الأحياء ورسائل البيانات المحفوظة — R44R37R2','Neighborhood and cached-data localization hotfix — R44R37R2','إصلاح ترجمة الأحياء ورسائل البيانات المحفوظة — R44R37R2','Neighborhood and cached-data localization hotfix — R44R37R2',true,now()),
  ('pwa.update.release.r44r37r2.note1','aboutApp','system','note','اعتماد الاسم الإنجليزي الفعلي للأحياء والمناطق والمدن من مصدر العنوان الوطني بدل إظهار مفتاح الترجمة الخام أو ترجمة حرفية.','Use the authoritative English names for districts, regions, and cities from the National Address source instead of raw translation keys or literal translation.','اعتماد الاسم الإنجليزي الفعلي للأحياء والمناطق والمدن من مصدر العنوان الوطني بدل إظهار مفتاح الترجمة الخام أو ترجمة حرفية.','Use the authoritative English names for districts, regions, and cities from the National Address source instead of raw translation keys or literal translation.',true,now()),
  ('pwa.update.release.r44r37r2.note2','aboutApp','system','note','إعادة ترجمة رسائل البيانات المحفوظة وحالات التحميل فور تغيير اللغة في شاشات العملاء والعقود والبيانات المرجعية.','Rerender cached-data and loading status messages immediately when the language changes on Customers, Contracts, and Reference Data screens.','إعادة ترجمة رسائل البيانات المحفوظة وحالات التحميل فور تغيير اللغة في شاشات العملاء والعقود والبيانات المرجعية.','Rerender cached-data and loading status messages immediately when the language changes on Customers, Contracts, and Reference Data screens.',true,now()),
  ('pwa.update.release.r44r37r2.note3','aboutApp','system','note','تحديث مسار الجغرافيا والترجمة فقط مع الحفاظ على Business Logic وOffline/Sync/Permissions وCSS دون تعديل.','Update only geographic/localization display paths while keeping Business Logic, Offline/Sync/Permissions, and CSS unchanged.','تحديث مسار الجغرافيا والترجمة فقط مع الحفاظ على Business Logic وOffline/Sync/Permissions وCSS دون تعديل.','Update only geographic/localization display paths while keeping Business Logic, Offline/Sync/Permissions, and CSS unchanged.',true,now())
), upserted as (
  insert into public.app_translations(
    translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
  )
  select translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
  from translation_seed
  on conflict(translation_key) do update set
    screen_key=excluded.screen_key,
    module_name=excluded.module_name,
    text_type=excluded.text_type,
    ar_text=case when nullif(btrim(public.app_translations.ar_text),'') is null then excluded.ar_text else public.app_translations.ar_text end,
    en_text=case when nullif(btrim(public.app_translations.en_text),'') is null then excluded.en_text else public.app_translations.en_text end,
    default_ar=excluded.default_ar,
    default_en=excluded.default_en,
    is_active=true,
    updated_at=now()
  returning translation_key
)
select count(*) from upserted;

-- Current UUID-safe neighborhood coverage from the authoritative external source.
-- installation_neighborhoods.name_en is populated by the Saudi National Address master-data migration;
-- this avoids literal/transliteration fallback and repairs rows created or remapped after older translation seeds.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
)
select
  'entity.neighborhood.'||n.id::text,
  'installationExecutionNeighborhoods',
  'appointments',
  'neighborhood',
  btrim(n.name),
  btrim(n.name_en),
  btrim(n.name),
  btrim(n.name_en),
  true,
  now()
from public.installation_neighborhoods n
where coalesce(n.is_active,true) is true
  and nullif(btrim(n.name),'') is not null
  and nullif(btrim(n.name_en),'') is not null
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  ar_text=case
    when nullif(btrim(public.app_translations.ar_text),'') is null then excluded.ar_text
    else public.app_translations.ar_text
  end,
  en_text=case
    when nullif(btrim(public.app_translations.en_text),'') is null then excluded.en_text
    when public.app_translations.en_text=public.app_translations.default_en then excluded.en_text
    when public.app_translations.en_text ~ '^\[entity\.neighborhood\.' then excluded.en_text
    when nullif(btrim(public.app_translations.default_en),'') is null and public.app_translations.en_text ~ '[؀-ۿ]' then excluded.en_text
    else public.app_translations.en_text
  end,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

commit;
