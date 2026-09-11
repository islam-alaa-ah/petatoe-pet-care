-- PETATOE R44R38R4 — Geography Translation Residual Closure
-- Purpose:
--   Close the final Translation Center neighborhood entity gaps using only
--   previously approved PETATOE geography sources.
-- Safety:
--   * New migration only; no historical migration is edited.
--   * No literal/free-form translation is generated at runtime.
--   * Existing valid custom name_en / app_translations.en_text values are preserved.
--   * Scope is active Jeddah legacy neighborhoods and the previously approved
--     exact-UUID residual set.
--   * No DELETE / DROP / TRUNCATE / permission changes.

begin;

alter table public.installation_neighborhoods
  add column if not exists name_en text;

create temporary table tmp_petatoe_r44r38r4_jeddah_source(
  name_ar text primary key,
  name_en text not null,
  source_basis text not null
) on commit drop;

insert into tmp_petatoe_r44r38r4_jeddah_source(name_ar,name_en,source_basis) values
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

create temporary table tmp_petatoe_r44r38r4_exact_source(
  id uuid primary key,
  name_ar text not null,
  name_en text not null,
  source_basis text not null
) on commit drop;

insert into tmp_petatoe_r44r38r4_exact_source(id,name_ar,name_en,source_basis) values
  ('1c0384aa-c5a3-4865-bee7-54573c462b65'::uuid, 'حي البغدادية', 'Al Baghdadiyah Dist.', 'published/regulated real-estate English usage'),
  ('f8e42bcf-5770-4ab4-b2ad-4e8a0e7121db'::uuid, 'حي البهجة', 'Al Bahjah Dist.', 'standardized proper-name transliteration; Arabic district existence confirmed'),
  ('97f7abc1-b5dd-4b9d-b09c-fd6a5047c0e8'::uuid, 'حي البوادر', 'Al Bawadir Dist.', 'licensed real-estate English usage'),
  ('15ed1824-2552-4670-a623-ac82f7265c96'::uuid, 'حي التوفيق', 'At Tawfiq Dist.', 'standardized proper-name transliteration; Arabic district existence confirmed'),
  ('197aba8f-d3cc-447d-b1b3-e069933d292e'::uuid, 'حي الرغامة', 'Al Rughamah Dist.', 'licensed real-estate English usage'),
  ('d9534c7f-6eee-4a69-a64c-643692566c54'::uuid, 'حي الرهناء', 'Ar Rahna Dist.', 'standardized proper-name transliteration'),
  ('836b1b2e-78ed-4fa4-a959-f3fa16f1e5c9'::uuid, 'حي الشرائع', 'Asharai Dist.', 'REGA-verified listing English district label'),
  ('4b9616df-eb77-4098-a340-6f6cf57b8888'::uuid, 'حي الشمائل', 'Ash Shamail Dist.', 'standardized proper-name transliteration'),
  ('87d3e71a-16ac-42a1-af7a-97f6138864c5'::uuid, 'حي الصناعية', 'Industrial Dist.', 'canonical English form already used in integrated PETATOE geographic seed'),
  ('2c3d063a-7e57-48e3-b10c-b20b1aff95d4'::uuid, 'حي العلاء', 'Al Alaa Dist.', 'standardized proper-name transliteration'),
  ('0c63a2f2-7af2-480d-aaf0-07f1bee10790'::uuid, 'حي المحمر', 'Al Muhammar Dist.', 'standardized proper-name transliteration'),
  ('420043bd-5fe8-4657-8271-a53293ad8dee'::uuid, 'حي المرج', 'Al Marj Dist.', 'standardized proper-name transliteration'),
  ('d063f52e-894b-4d80-8e0c-c742dc299436'::uuid, 'حي المعرفة', 'Al Marifah Dist.', 'standardized proper-name transliteration'),
  ('f0b66471-f5ec-421c-8db5-abcf732b970e'::uuid, 'حي المعيلية', 'Al Muayliyah Dist.', 'standardized proper-name transliteration'),
  ('d5501b31-4575-4a29-8c6b-1b770efa1219'::uuid, 'حي المودة', 'Al Mawaddah Dist.', 'standardized proper-name transliteration'),
  ('0e9fcf65-5c65-4526-8a51-92cc5f046213'::uuid, 'حي الميناء', 'Al Mina Dist.', 'standardized proper-name transliteration'),
  ('a92dc09f-9685-4b43-ae62-70a680e33799'::uuid, 'حي الندى', 'An Nada Dist.', 'canonical English form already used in integrated PETATOE geographic seed'),
  ('a19d8fa7-565d-4508-91eb-d59c0e01a61b'::uuid, 'حي الوداد', 'Al Widad Dist.', 'licensed real-estate English usage'),
  ('c8ec94aa-5fd1-40ad-86e5-d884a5fe07ef'::uuid, 'حي الوسامي', 'Al Wisami Dist.', 'standardized proper-name transliteration'),
  ('3033e4bf-de8a-47d9-af48-4aab3bbe6963'::uuid, 'حي جدة التاريخية', 'Historic Jeddah', 'official/common English place name'),
  ('ea06583c-555b-42da-a749-d9cf76111930'::uuid, 'حي جوهرة ثول', 'Jewel of Thuwal', 'licensed location English usage'),
  ('be8ab7db-2f80-47bb-8338-02594510b06b'::uuid, 'حي سليتة', 'Sulaytah Dist.', 'standardized proper-name transliteration'),
  ('7edb7c23-e54e-4154-9e44-3612570e8da7'::uuid, 'حي شعناء', 'Shaanaa Dist.', 'standardized proper-name transliteration');

create temporary table tmp_petatoe_r44r38r4_targets on commit drop as
select
  n.id,
  n.name as name_ar,
  s.name_en,
  s.source_basis
from public.installation_neighborhoods n
join tmp_petatoe_r44r38r4_jeddah_source s
  on btrim(n.name)=btrim(s.name_ar)
left join public.installation_cities c
  on c.id=n.city_id
where n.is_active is true
  and (
    btrim(coalesce(c.name,''))='جدة'
    or btrim(coalesce(n.city,''))='جدة'
  )

union

select
  n.id,
  n.name as name_ar,
  s.name_en,
  s.source_basis
from public.installation_neighborhoods n
join tmp_petatoe_r44r38r4_exact_source s
  on s.id=n.id
where n.is_active is true
  and btrim(coalesce(n.name,''))=btrim(s.name_ar);

-- Fill only missing/invalid English metadata. Valid custom English stays untouched.
update public.installation_neighborhoods n
set name_en=t.name_en
from tmp_petatoe_r44r38r4_targets t
where n.id=t.id
  and (
    nullif(btrim(n.name_en),'') is null
    or n.name_en ~ '[؀-ۿ]'
    or n.name_en ~ '^\[entity\.neighborhood\.'
  );

-- Synchronize the centralized Translation Center display row without replacing
-- a valid custom English translation.
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
  'entity.neighborhood.' || t.id::text,
  'installationExecutionNeighborhoods',
  'appointments',
  'neighborhood',
  t.name_ar,
  t.name_en,
  t.name_ar,
  t.name_en,
  true,
  now()
from tmp_petatoe_r44r38r4_targets t
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
      or public.app_translations.en_text ~ '[؀-ۿ]'
      or public.app_translations.en_text ~ '^\[entity\.neighborhood\.'
    then excluded.en_text
    else public.app_translations.en_text
  end,
  default_ar=excluded.default_ar,
  default_en=excluded.default_en,
  is_active=true,
  updated_at=now();

commit;

-- Verification: these queries should return zero unresolved rows.
select
  n.id,
  n.name as neighborhood_ar,
  n.name_en,
  case
    when nullif(btrim(n.name_en),'') is null then 'MISSING_NAME_EN'
    when n.name_en ~ '[؀-ۿ]' then 'ARABIC_IN_NAME_EN'
    else 'PASS'
  end as audit_status
from public.installation_neighborhoods n
left join public.installation_cities c on c.id=n.city_id
where n.is_active is true
  and (
    btrim(coalesce(c.name,''))='جدة'
    or btrim(coalesce(n.city,''))='جدة'
  )
  and (
    nullif(btrim(n.name_en),'') is null
    or n.name_en ~ '[؀-ۿ]'
  )
order by n.name;

select
  t.translation_key,
  t.ar_text,
  t.en_text,
  case
    when nullif(btrim(t.en_text),'') is null then 'MISSING_TRANSLATION_EN'
    when t.en_text ~ '[؀-ۿ]' then 'ARABIC_IN_TRANSLATION_EN'
    when t.en_text ~ '^\[entity\.neighborhood\.' then 'RAW_KEY_IN_TRANSLATION_EN'
    else 'PASS'
  end as audit_status
from public.app_translations t
where t.is_active=true
  and t.translation_key like 'entity.neighborhood.%'
  and (
    nullif(btrim(t.en_text),'') is null
    or t.en_text ~ '[؀-ۿ]'
    or t.en_text ~ '^\[entity\.neighborhood\.'
  )
order by t.translation_key;
