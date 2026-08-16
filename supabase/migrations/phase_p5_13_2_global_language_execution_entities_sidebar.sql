-- P5.13.2 — Global language toggle + Execution entity/sidebar localization.
-- Extends the existing app_translations canonical owner; no parallel translation table is introduced.

-- Canonical English neighborhood names already exist in installation_neighborhoods.name_en.
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
)
select
  'entity.neighborhood.'||n.id::text,
  'installationExecutionNeighborhoods',
  'appointments',
  'neighborhood',
  trim(n.name),
  trim(n.name_en),
  trim(n.name),
  trim(n.name_en),
  true,
  now()
from public.installation_neighborhoods n
where n.is_active is true
  and nullif(trim(n.name),'') is not null
  and nullif(trim(n.name_en),'') is not null
on conflict(translation_key) do nothing;

-- Seed known service translations. Any future/unmatched service remains editable from مركز الترجمه;
-- runtime never falls back to Arabic while English is active.
with source as (
  select s.*,
    case
      when trim(s.name) in ('أكياس قمامة للحيوانات','اكياس قمامة للحيوانات') then 'Pet Waste Bags'
      when trim(s.name) in ('اكرامية','إكرامية') then 'Tip'
      when trim(s.name) in ('تقليم الاظافر','تقليم الأظافر') then 'Nail Trimming'
      when trim(s.name)='تشذيب المخالب' then 'Claw Trimming'
      when trim(s.name) in ('تنظيف الاذنين','تنظيف الأذنين') then 'Ear Cleaning'
      when trim(s.name) in ('حلاقة للاعضاء التناسلية','حلاقة للأعضاء التناسلية','حلاقة الأعضاء التناسلية') then 'Sanitary Trim'
      when trim(s.name)='تنظيف عميق للفراء' then 'Deep Coat Cleaning'
      when trim(s.name) in ('الاساسية - قط كبير','الأساسية - قط كبير') then 'Basic Package - Large Cat'
      when trim(s.name) in ('الاساسية - قط متوسط','الأساسية - قط متوسط') then 'Basic Package - Medium Cat'
      when trim(s.name) in ('الاساسية - قط صغير','الأساسية - قط صغير') then 'Basic Package - Small Cat'
      when trim(s.name) in ('الاساسية - كلب كبير','الأساسية - كلب كبير') then 'Basic Package - Large Dog'
      when trim(s.name) in ('الاساسية - كلب متوسط','الأساسية - كلب متوسط') then 'Basic Package - Medium Dog'
      when trim(s.name) in ('الاساسية - كلب صغير','الأساسية - كلب صغير') then 'Basic Package - Small Dog'
      when trim(s.name)='الشاملة - قط كبير' then 'Full Package - Large Cat'
      when trim(s.name)='الشاملة - قط متوسط' then 'Full Package - Medium Cat'
      when trim(s.name)='الشاملة - قط صغير' then 'Full Package - Small Cat'
      when trim(s.name)='الشاملة - كلب كبير' then 'Full Package - Large Dog'
      when trim(s.name)='الشاملة - كلب متوسط' then 'Full Package - Medium Dog'
      when trim(s.name)='الشاملة - كلب صغير' then 'Full Package - Small Dog'
      when trim(s.name)='السعيدة - قط كبير' then 'Happy Package - Large Cat'
      when trim(s.name)='السعيدة - قط متوسط' then 'Happy Package - Medium Cat'
      when trim(s.name)='السعيدة - قط صغير' then 'Happy Package - Small Cat'
      when trim(s.name)='السعيدة - كلب كبير' then 'Happy Package - Large Dog'
      when trim(s.name)='السعيدة - كلب متوسط' then 'Happy Package - Medium Dog'
      when trim(s.name)='السعيدة - كلب صغير' then 'Happy Package - Small Dog'
      else null
    end as translated_name
  from public.installation_service_types s
  where s.is_active is true
)
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
)
select
  'entity.service.'||s.id::text,
  'installationExecutionServices',
  'appointments',
  'service',
  trim(s.name),
  s.translated_name,
  trim(s.name),
  s.translated_name,
  true,
  now()
from source s
where nullif(trim(s.name),'') is not null and s.translated_name is not null
on conflict(translation_key) do nothing;
