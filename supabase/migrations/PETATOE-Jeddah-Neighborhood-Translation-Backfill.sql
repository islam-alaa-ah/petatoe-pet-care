-- PETATOE — Jeddah Neighborhood Translation Coverage Audit + Safe Backfill
-- Generated from the project's own geographic sources.
-- Source of authoritative labels:
--   Saudi-Arabia-Regions-Cities-and-Districts (National Address snapshot integrated in PETATOE)
-- Scope:
--   - Does NOT translate neighborhood names literally.
--   - Fills only source-backed English names.
--   - Preserves existing non-empty custom English names.
--   - Upserts entity.neighborhood.<UUID> translations without overwriting custom English text.
--   - Returns every remaining unresolved active Jeddah neighborhood at the end.
--
-- Project inventory:
--   Legacy Jeddah seed: 191 neighborhoods
--   Source-backed in this patch: 168
--   Legacy-only / requires authoritative review: 23

begin;

alter table public.installation_neighborhoods
  add column if not exists name_en text;

create temporary table tmp_petatoe_jeddah_neighborhood_translation(
  name_ar text primary key,
  name_en text not null,
  source_basis text not null
);

insert into tmp_petatoe_jeddah_neighborhood_translation(name_ar,name_en,source_basis) values
  ('المدينة الصناعية الثالثة', '3rd Industrial City', 'National Address - Jeddah district'),
  ('المنطقة الصناعية', 'Industrial Area', 'National Address - Jeddah district'),
  ('جامعة الملك عبدالعزيز', 'King Abdulaziz University', 'National Address - Jeddah district'),
  ('حكومي', 'Governmental', 'National Address - Jeddah district'),
  ('حي أبو جعالة', 'Abu Jaalah Dist.', 'National Address - Jeddah district'),
  ('حي أم حبلين الشرقية', 'Um Hableen Al Sharqiyyah Dist.', 'National Address - Jeddah district'),
  ('حي أم حبلين الغربية', 'Um Hableen Al Gharbiyyah Dist.', 'National Address - Jeddah district'),
  ('حي أم سدرة', 'Umm Sidrah Dist.', 'National Address place label: أم سدرة → Umm Sidrah'),
  ('حي ابحر الجنوبية', 'Abhur Al Janubiyah Dist.', 'National Address - Jeddah district'),
  ('حي ابحر الشمالية', 'Abhur Ash Shamaliyah Dist.', 'National Address - Jeddah district'),
  ('حي ابرق الرغامة', 'Abruq Ar Rughamah Dist.', 'National Address - Jeddah district'),
  ('حي الأثير', 'Al Athir Dist.', 'National Address - Jeddah district'),
  ('حي الاجاويد', 'Al Ajaweed Dist.', 'National Address - Jeddah district'),
  ('حي الاجواد', 'Al Ajwad Dist.', 'National Address - Jeddah district'),
  ('حي الاصالة', 'Al Asalah Dist.', 'National Address - Jeddah district'),
  ('حي الامواج', 'Al Amwaj Dist.', 'National Address - Jeddah district'),
  ('حي الامير عبدالمجيد', 'Prince Abdul Majeed Dist.', 'National Address - Jeddah district'),
  ('حي الامير فواز الجنوبى', 'Al Amir Fawaz Al Janouby Dist.', 'National Address - Jeddah district'),
  ('حي الامير فواز الشمالى', 'Al Amir Fawaz Ash Shamaly Dist.', 'National Address - Jeddah district'),
  ('حي الاندلس', 'Al Andalus Dist.', 'National Address - Jeddah district'),
  ('حي البحيرات', 'Al Buhayrat Dist.', 'National Address - Jeddah district'),
  ('حي البدور', 'Al Budur Dist.', 'National Address - Jeddah district'),
  ('حي البركة', 'Al Barakah Dist.', 'National Address - Jeddah district'),
  ('حي البساتين', 'Al Basatin Dist.', 'National Address - Jeddah district'),
  ('حي البشائر', 'Al Bashaer Dist.', 'National Address - Jeddah district'),
  ('حي البغدادية الشرقية', 'Al Baghdadiyah Ash Sharqiyah Dist.', 'National Address - Jeddah district'),
  ('حي البغدادية الغربية', 'Al Baghdadiyah Al Gharbiyah Dist.', 'National Address - Jeddah district'),
  ('حي البلد', 'Al Balad Dist.', 'National Address - Jeddah district'),
  ('حي البوادي', 'Al Bawadi Dist.', 'National Address - Jeddah district'),
  ('حي البيان', 'Al Bayan Dist.', 'Exact National Address district label'),
  ('حي التضامن', 'Al Tadamun Dist.', 'National Address - Jeddah district'),
  ('حي التعاون', 'At Taawun Dist.', 'National Address - Jeddah district'),
  ('حي التلال', 'Al Talal Dist.', 'National Address - Jeddah district'),
  ('حي الثعالبة', 'Ath Thaalibah Dist.', 'National Address - Jeddah district'),
  ('حي الثغر', 'Ath Thaghr Dist.', 'National Address - Jeddah district'),
  ('حي الجامعة', 'Al Jamiah Dist.', 'National Address - Jeddah district'),
  ('حي الجزيرة', 'Al Jazirah Dist.', 'National Address - Jeddah district'),
  ('حي الجوهرة', 'Al Jawharah Dist.', 'National Address - Jeddah district'),
  ('حي الحجاز', 'Al Hijaz Dist.', 'National Address - Jeddah district'),
  ('حي الحرازات', 'Al Harazat Dist.', 'National Address - Jeddah district'),
  ('حي الحرة', 'Al Harrah Dist.', 'National Address place label: الحرة → Al Harrah'),
  ('حي الحفنة', 'Al Hafnah Dist.', 'National Address - Jeddah district'),
  ('حي الحمدانية', 'Al Hamadaniyah Dist.', 'National Address - Jeddah district'),
  ('حي الحمراء', 'Al Hamra Dist.', 'National Address - Jeddah district'),
  ('حي الخالدية', 'Al Khalidiyah Dist.', 'National Address - Jeddah district'),
  ('حي الخليج', 'Al Khalij Dist.', 'National Address - Jeddah district'),
  ('حي الخمرة', 'Al Khomrah Dist.', 'National Address - Jeddah district'),
  ('حي الدرة', 'Ad Durrah Dist.', 'National Address - Jeddah district'),
  ('حي الرابية', 'Al Rabiyah Dist.', 'National Address - Jeddah district'),
  ('حي الربوة', 'Ar Rabwah Dist.', 'National Address - Jeddah district'),
  ('حي الربيع', 'Ar Rabie Dist.', 'National Address - Jeddah district'),
  ('حي الرحاب', 'Al Rehab Dist.', 'National Address - Jeddah district'),
  ('حي الرحمانية', 'Ar Rahmaniyah Dist.', 'National Address - Jeddah district'),
  ('حي الرحمة', 'Ar Rahmah Dist.', 'National Address - Jeddah district'),
  ('حي الرمال', 'Ar Rimal Dist.', 'National Address - Jeddah district'),
  ('حي الروابي', 'Ar Rawabi Dist.', 'National Address - Jeddah district'),
  ('حي الرواسي', 'Al Rawasee Dist.', 'National Address - Jeddah district'),
  ('حي الروضة', 'Ar Rawdah Dist.', 'National Address - Jeddah district'),
  ('حي الرويس', 'Ar Ruwais Dist.', 'National Address - Jeddah district'),
  ('حي الرياض', 'Ar Riyadh Dist.', 'National Address - Jeddah district'),
  ('حي الريان', 'Ar Rayaan Dist.', 'National Address - Jeddah district'),
  ('حي الزمرد', 'Az Zomorod Dist.', 'National Address - Jeddah district'),
  ('حي الزهراء', 'Az Zahra Dist.', 'National Address - Jeddah district'),
  ('حي الزهرة', 'Az Zahra Dist.', 'Jeddah alias to authoritative حي الزهراء → Az Zahra Dist.'),
  ('حي الزهور', 'Al Zahur Dist.', 'National Address - Jeddah district'),
  ('حي الساحل', 'As Sahil Dist.', 'National Address - Jeddah district'),
  ('حي السامر', 'As Samir Dist.', 'National Address - Jeddah district'),
  ('حي السبيل', 'As Sabil Dist.', 'National Address - Jeddah district'),
  ('حي السروات', 'As Sarawat Dist.', 'National Address - Jeddah district'),
  ('حي السرور', 'As Sarur Dist.', 'Exact National Address district label'),
  ('حي السرورية', 'As Sororyah Dist.', 'National Address - Jeddah district'),
  ('حي السلامة', 'As Salamah Dist.', 'National Address - Jeddah district'),
  ('حي السليمانية', 'As Sulaymaniyah Dist.', 'National Address - Jeddah district'),
  ('حي السنابل', 'As Sanabel Dist.', 'National Address - Jeddah district'),
  ('حي السهل', 'Al Sahl Dist.', 'National Address - Jeddah district'),
  ('حي الشاطئ', 'Ash Shati Dist.', 'National Address - Jeddah district'),
  ('حي الشراع', 'Ash Sheraa Dist.', 'National Address - Jeddah district'),
  ('حي الشرفية', 'Ash Sharafiyah Dist.', 'National Address - Jeddah district'),
  ('حي الشرقية', 'Al Sharqiyyah Dist.', 'National Address - Jeddah district'),
  ('حي الشروق', 'Ash Shrouk Dist.', 'National Address - Jeddah district'),
  ('حي الشفا', 'Ash Shefaa Dist.', 'National Address - Jeddah district'),
  ('حي الشفاء', 'Ash Shefaa Dist.', 'Jeddah alias to authoritative حي الشفا → Ash Shefaa Dist.'),
  ('حي الشويضي', 'Al Shuwaidhi Dist.', 'National Address - Jeddah district'),
  ('حي الصالحية', 'As Salhiyah Dist.', 'National Address - Jeddah district'),
  ('حي الصحيفة', 'As Sahifah Dist.', 'National Address - Jeddah district'),
  ('حي الصفا', 'As Safa Dist.', 'National Address - Jeddah district'),
  ('حي الصفحة', 'Al Safhah Dist.', 'National Address - Jeddah district'),
  ('حي الصفوة', 'Al Safwah Dist.', 'National Address - Jeddah district'),
  ('حي الصوارى', 'As Swaryee Dist.', 'National Address - Jeddah district'),
  ('حي الضاحية', 'Ad Dahiah Dist.', 'National Address - Jeddah district'),
  ('حي العبير', 'Al Abeer Dist.', 'National Address - Jeddah district'),
  ('حي العدل', 'Al Adel Dist.', 'National Address - Jeddah district'),
  ('حي العزيزية', 'Al Aziziyah Dist.', 'National Address - Jeddah district'),
  ('حي العسلاء', 'Al Asla Dist.', 'National Address - Jeddah district'),
  ('حي العسيلة', 'Al Usaylah Dist.', 'National Address exact Arabic label - Makkah Region'),
  ('حي العشيرية', 'Al Ushayriyyah Dist.', 'National Address - Jeddah district'),
  ('حي العقيق', 'Al Aqiq Dist.', 'National Address - Jeddah district'),
  ('حي العليا', 'Al ''Ulayya Dist.', 'National Address - Jeddah district'),
  ('حي العمارية', 'Al Ammariyah Dist.', 'National Address - Jeddah district'),
  ('حي العويجاء', 'Al ''Uwayja Dist.', 'National Address place label: العويجاء → Al ''Uwayja'),
  ('حي الغدير', 'Al Ghadir Dist.', 'National Address - Jeddah district'),
  ('حي الغربية', 'Al Gharbiyyah Dist.', 'National Address - Jeddah district'),
  ('حي الغولاء', 'Al Ghawla Dist.', 'National Address place label: الغولاء → Al Ghawla'),
  ('حي الفاروق', 'Al Farouk Dist.', 'National Address - Jeddah district'),
  ('حي الفردوس', 'Al Ferdous Dist.', 'National Address - Jeddah district'),
  ('حي الفرقان', 'Al Furqan Dist.', 'National Address - Jeddah district'),
  ('حي الفروسية', 'Al Frosyah Dist.', 'National Address - Jeddah district'),
  ('حي الفضل', 'Al Fadel Dist.', 'National Address - Jeddah district'),
  ('حي الفضيلة', 'Al Fadeylah Dist.', 'National Address - Jeddah district'),
  ('حي الفلاح', 'Al Falah Dist.', 'National Address - Jeddah district'),
  ('حي الفنار', 'Al Fanar Dist.', 'National Address - Jeddah district'),
  ('حي الفيحاء', 'Al Fayha Dist.', 'National Address - Jeddah district'),
  ('حي الفيصلية', 'Al Faisaliyah Dist.', 'National Address - Jeddah district'),
  ('حي القريات', 'Al Quraiyat Dist.', 'National Address - Jeddah district'),
  ('حي القرينية', 'Al Qryniah Dist.', 'National Address - Jeddah district'),
  ('حي القوزين', 'Al Qouzeen Dist.', 'National Address - Jeddah district'),
  ('حي القوس', 'Al Qus Dist.', 'National Address - Jeddah district'),
  ('حي الكرامة', 'Al Karamah Dist.', 'National Address - Jeddah district'),
  ('حي الكندرة', 'Al Kandarah Dist.', 'National Address - Jeddah district'),
  ('حي الكوثر', 'Al Kawthar Dist.', 'National Address - Jeddah district'),
  ('حي الكورنيش', 'Al Kurnaish Dist.', 'Exact National Address district label'),
  ('حي اللؤلؤ', 'Al Loaloa Dist.', 'National Address - Jeddah district'),
  ('حي المتنزهات', 'Al Mutanazahat Dist.', 'National Address - Jeddah district'),
  ('حي المجامع', 'Al Majami Dist.', 'National Address - Jeddah district'),
  ('حي المجد', 'Al Majd Dist.', 'Exact National Address district label'),
  ('حي المحاميد', 'Al Mahamid Dist.', 'National Address - Jeddah district'),
  ('حي المحجر', 'Al Mahjar Dist.', 'National Address - Jeddah district'),
  ('حي المحمدية', 'Al Muhammadiyah Dist.', 'National Address - Jeddah district'),
  ('حي المرجان', 'Al Murjan Dist.', 'National Address - Jeddah district'),
  ('حي المرسلات', 'Al Mursalat Dist.', 'National Address - Jeddah district'),
  ('حي المرسي', 'Al Mursi Dist.', 'National Address - Jeddah district'),
  ('حي المروة', 'Al Marwah Dist.', 'National Address - Jeddah district'),
  ('حي المروج', 'Al Muruj Dist.', 'National Address - Jeddah district'),
  ('حي المزيرعة', 'Al Muzairah Dist.', 'National Address - Jeddah district'),
  ('حي المستقبل', 'Al Mustaqbal Dist.', 'National Address - Jeddah district'),
  ('حي المسرة', 'Al Masarah Dist.', 'National Address - Jeddah district'),
  ('حي المليساء', 'Al Moulysaa Dist.', 'National Address - Jeddah district'),
  ('حي المنار', 'Al Manar Dist.', 'National Address - Jeddah district'),
  ('حي المنارات', 'Al Manarat Dist.', 'National Address - Jeddah district'),
  ('حي المنتزة', 'Al Montazah Dist.', 'National Address - Jeddah district'),
  ('حي المنتزهات', 'Al Mutanazahat Dist.', 'Jeddah alias to authoritative حي المتنزهات → Al Mutanazahat Dist.'),
  ('حي الموج', 'Al Mawj Dist.', 'National Address - Jeddah district'),
  ('حي النجمة', 'An Najmah Dist.', 'National Address - Jeddah district'),
  ('حي النخيل', 'Al Nakhil Dist.', 'National Address - Jeddah district'),
  ('حي النزلة الشرقية', 'An Nazlah Ash Sharqiyah Dist.', 'National Address - Jeddah district'),
  ('حي النزلة اليمانية', 'An Nazlah Al Yamaniyah Dist.', 'National Address - Jeddah district'),
  ('حي النزهة', 'An Nuzhah Dist.', 'National Address - Jeddah district'),
  ('حي النسيم', 'Al Naseem Dist.', 'National Address - Jeddah district'),
  ('حي النعيم', 'An Naim Dist.', 'National Address - Jeddah district'),
  ('حي النهضة', 'An Nahdah Dist.', 'National Address - Jeddah district'),
  ('حي النور', 'Al Nur Dist.', 'National Address - Jeddah district'),
  ('حي الهجرة', 'Al Hijrah Dist.', 'National Address exact Arabic label - Makkah Region'),
  ('حي الهدى', 'Al Hada Dist.', 'National Address - Jeddah district'),
  ('حي الهزاعية', 'Al Hazaiyah Dist.', 'National Address - Jeddah district'),
  ('حي الهنداوية', 'Al Hindawiyah Dist.', 'National Address - Jeddah district'),
  ('حي الوئام', 'Al Weaam Dist.', 'Exact National Address district label'),
  ('حي الواحة', 'Al Wahah Dist.', 'National Address - Jeddah district'),
  ('حي الوادي', 'Al Wadi Dist.', 'National Address - Jeddah district'),
  ('حي الودية', 'Al Wudiyah Dist.', 'National Address place label: الودية → Al Wudiyah'),
  ('حي الورود', 'Al Wurud Dist.', 'National Address - Jeddah district'),
  ('حي الوزيريه', 'Al Waziriyah Dist.', 'National Address - Jeddah district'),
  ('حي الوفاء', 'Al Wafa Dist.', 'National Address - Jeddah district'),
  ('حي الياقوت', 'Al Yaqoot Dist.', 'National Address - Jeddah district'),
  ('حي اليسر', 'Al Yusr Dist.', 'National Address - Jeddah district'),
  ('حي ام السلم', 'Um Asalam Dist.', 'National Address - Jeddah district'),
  ('حي بترومين', 'Petromin Dist.', 'National Address - Jeddah district'),
  ('حي بحرة', 'Bahrah Dist.', 'National Address - Jeddah district'),
  ('حي بريمان', 'Bryman Dist.', 'National Address - Jeddah district'),
  ('حي بلدة ذهبان', 'Dhahban Town Dist.', 'National Address - Jeddah district'),
  ('حي بنى مالك', 'Bani Malik Dist.', 'National Address - Jeddah district'),
  ('حي رضوى', 'Radwa Dist.', 'Exact National Address district label'),
  ('حي صناعي', 'Industrial Dist.', 'National Address - Jeddah district'),
  ('حي طابة', 'Tabah Dist.', 'National Address - Jeddah district'),
  ('حي طيبة', 'Taibah Dist.', 'National Address - Jeddah district'),
  ('حي غليل', 'Ghulail Dist.', 'National Address - Jeddah district'),
  ('حي قباء', 'Quba Dist.', 'National Address - Jeddah district'),
  ('حي كتانة', 'Katanah Dist.', 'National Address - Jeddah district'),
  ('حي مدائن الفهد', 'Madain Al Fahd Dist.', 'National Address - Jeddah district'),
  ('حي مريخ', 'Mraykh Dist.', 'National Address - Jeddah district'),
  ('حي مشرفة', 'Mishrifah Dist.', 'National Address - Jeddah district'),
  ('قاعدة الملك فيصل البحرية', 'King Faisal Naval Base', 'National Address - Jeddah district'),
  ('مطار الملك عبدالعزيز الدولي', 'King Abdulaziz International Airport', 'National Address - Jeddah district'),
  ('ميناء جدة الاسلامي', 'Jeddah Eslamic Seaport', 'National Address - Jeddah district');

-- 1) Fill missing English metadata for active Jeddah rows only.
with mapped as (
  select
    n.id,
    m.name_en
  from public.installation_neighborhoods n
  join tmp_petatoe_jeddah_neighborhood_translation m
    on regexp_replace(translate(btrim(n.name),'أإآىة','ااايه'),'\s+','','g')
     = regexp_replace(translate(btrim(m.name_ar),'أإآىة','ااايه'),'\s+','','g')
  where coalesce(n.is_active,true) is true
    and btrim(coalesce(n.city,''))='جدة'
)
update public.installation_neighborhoods n
set name_en = m.name_en
from mapped m
where n.id=m.id
  and nullif(btrim(n.name_en),'') is null;

-- 2) Upsert UUID-safe runtime translations for every Jeddah neighborhood that now has a real English label.
insert into public.app_translations(
  translation_key,
  screen_key,
  module_name,
  text_type,
  ar_text,
  en_text,
  default_ar,
  default_en,
  is_active,
  updated_at
)
select
  'entity.neighborhood.' || n.id::text,
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
  and btrim(coalesce(n.city,''))='جدة'
  and nullif(btrim(n.name),'') is not null
  and nullif(btrim(n.name_en),'') is not null
on conflict(translation_key) do update set
  screen_key=excluded.screen_key,
  module_name=excluded.module_name,
  text_type=excluded.text_type,
  ar_text=case
    when nullif(btrim(public.app_translations.ar_text),'') is null
    then excluded.ar_text
    else public.app_translations.ar_text
  end,
  en_text=case
    when nullif(btrim(public.app_translations.en_text),'') is null
      or public.app_translations.en_text ~ '^\[entity\.neighborhood\.'
      or public.app_translations.en_text ~ '[؀-ۿ]'
    then excluded.en_text
    else public.app_translations.en_text
  end,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

commit;

-- =========================
-- VERIFICATION / INVENTORY
-- =========================

-- A) Production totals.
select
  count(*) filter (where coalesce(n.is_active,true) is true and btrim(coalesce(n.city,''))='جدة') as active_jeddah_neighborhoods,
  count(*) filter (
    where coalesce(n.is_active,true) is true
      and btrim(coalesce(n.city,''))='جدة'
      and nullif(btrim(n.name_en),'') is not null
  ) as with_english_name,
  count(*) filter (
    where coalesce(n.is_active,true) is true
      and btrim(coalesce(n.city,''))='جدة'
      and nullif(btrim(n.name_en),'') is null
  ) as still_missing_english_name
from public.installation_neighborhoods n;

-- B) Exact rows still missing a source-backed English name.
select
  n.id,
  n.name as neighborhood_ar,
  n.city,
  n.name_en,
  case
    when m.name_ar is null then 'NOT_IN_APPROVED_SOURCE_MAP'
    else 'MAPPED_BUT_NOT_FILLED'
  end as audit_status
from public.installation_neighborhoods n
left join tmp_petatoe_jeddah_neighborhood_translation m
  on regexp_replace(translate(btrim(n.name),'أإآىة','ااايه'),'\s+','','g')
   = regexp_replace(translate(btrim(m.name_ar),'أإآىة','ااايه'),'\s+','','g')
where coalesce(n.is_active,true) is true
  and btrim(coalesce(n.city,''))='جدة'
  and nullif(btrim(n.name_en),'') is null
order by n.name;

-- C) Any translation row still missing/Arabic/raw-key despite a source-backed name.
select
  n.id,
  n.name as neighborhood_ar,
  n.name_en as approved_english_name,
  t.translation_key,
  t.en_text
from public.installation_neighborhoods n
left join public.app_translations t
  on t.translation_key='entity.neighborhood.'||n.id::text
 and t.is_active=true
where coalesce(n.is_active,true) is true
  and btrim(coalesce(n.city,''))='جدة'
  and nullif(btrim(n.name_en),'') is not null
  and (
    t.translation_key is null
    or nullif(btrim(t.en_text),'') is null
    or t.en_text ~ '^\[entity\.neighborhood\.'
    or t.en_text ~ '[؀-ۿ]'
  )
order by n.name;
