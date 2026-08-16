-- P5.13.2.2 — Authoritative Neighborhood & Full Service Translation Coverage
-- Scope: appointment-execution entity translations only.
-- Neighborhood English names are seeded from the National Address dataset already integrated in PETATOE.
-- Service rows are sourced from Appointment Settings / Services (installation_service_types).
-- app_translations remains the single runtime translation owner; business/master-data names are not changed.

begin;

-- 1) Authoritative Makkah/Jeddah district mapping from the existing National Address snapshot.
with authoritative(city_source_id,district_source_id,name_ar,name_en) as (
  values
(6,10200006001,'حي العدل','Al Adl Dist.'),
(6,10200006002,'حي الروضة','Ar Rawdah Dist.'),
(6,10200006003,'حي المعابدة','Al Maabdah Dist.'),
(6,10200006004,'حي الخنساء','Al Khansa Dist.'),
(6,10200006005,'حي السليمانية','As Sulimaniyah Dist.'),
(6,10200006006,'حي الجميزة','Al Jummayzah Dist.'),
(6,10200006007,'حي جبل النور','Jabal An Nur Dist.'),
(6,10200006008,'حي الهنداوية','Al Hindawiyah Dist.'),
(6,10200006009,'حي الرصيفة','Ar Rusayfah Dist.'),
(6,10200006010,'حي جرهم','Jarham Dist.'),
(6,10200006011,'حي الخالدية','Al Khalidiyah Dist.'),
(6,10200006012,'حي المسفلة','Al Misfalah Dist.'),
(6,10200006013,'حي التقوى','At Taqwa Dist.'),
(6,10200006014,'حي كدي','Kudy Dist.'),
(6,10200006015,'حي القرارة والنقا','Al Qararah And An Naqa Dist.'),
(6,10200006016,'حي الحرم','Al Haram Dist.'),
(6,10200006017,'حي حارة الباب والشامية','Harat Al Bab And Ash Shamiyah Dist.'),
(6,10200006018,'حي التيسير','At Taysir Dist.'),
(6,10200006019,'حي جرول','Jarwal Dist.'),
(6,10200006020,'حي المشاعر','Al Mashair Dist.'),
(6,10200006021,'حي المرسلات','Al Mursalat Dist.'),
(6,10200006022,'حي العزيزية','Al Aziziyah Dist.'),
(6,10200006023,'حي الجامعة','Al Jamiah Dist.'),
(6,10200006024,'حي النسيم','Al Naseem Dist.'),
(6,10200006025,'حي الزهراء','Az Zahra Dist.'),
(6,10200006026,'حي الضيافة','Ad Diyafah Dist.'),
(6,10200006027,'حي البيبان','Al Bibyan Dist.'),
(6,10200006028,'حي الحجون','Al Hujun Dist.'),
(6,10200006029,'حي الطندباوي','At Tandabawi Dist.'),
(6,10200006030,'حي الشبيكة','Ash Shubaikah Dist.'),
(6,10200006031,'حي الهجلة','Al Hajlah Dist.'),
(6,10200006032,'حي المنصور','Al Mansur Dist.'),
(6,10200006033,'حي الكعكية','Al Kakiyah Dist.'),
(6,10200006034,'حي الشوقية','Ash Shawqiyah Dist.'),
(6,10200006035,'حي الهجرة','Al Hijrah Dist.'),
(6,10200006036,'حي بطحاء قريش','Batha Quraysh Dist.'),
(6,10200006037,'حي شرائع المجاهدين','Sharai Al Mujahidin Dist.'),
(6,10200006038,'حي العوالي','Al Awali Dist.'),
(6,10200006039,'حي الشرائع','Asharai  Dist.'),
(6,10200006040,'حي الراشدية','Ar Rashidiyah Dist.'),
(6,10200006041,'حي الخضراء','Al Khadra Dist.'),
(6,10200006042,'حي الملك فهد','King Fahd Dist.'),
(6,10200006043,'حي العكيشية','Al Ukayshiyah Dist.'),
(6,10200006044,'حي ولي العهد','Waly Al Ahd Dist.'),
(6,10200006045,'حي الاندلس','Al Andalus Dist.'),
(6,10200006046,'حي ريع زاخر','Ray Zakhir Dist.'),
(6,10200006047,'حي التنعيم','At Tanim Dist.'),
(6,10200006048,'حي الزاهر','Az Zahir Dist.'),
(6,10200006049,'حي شعب عامر وشعب علي','Shaib Amir And Shaib Ali Dist.'),
(6,10200006050,'حي اجياد','Ajyad Dist.'),
(6,10200006051,'حي الحمراء وام الجود','Al Hamra Umm Al Jud Dist.'),
(6,10200006052,'حي النزهة','An Nuzhah Dist.'),
(6,10200006053,'حي العتيبية','Al Utaybiyah Dist.'),
(6,10200006054,'حي الروابي','Ar Rawabi Dist.'),
(6,10200006055,'حي العمرة الجديدة','Al Umrah Al Jadidah Dist.'),
(6,10200006056,'حي السلامة','As Salamah Dist.'),
(6,10200006057,'حي البحيرات','Al Buhayrat Dist.'),
(6,10200006058,'حي النوارية','An Nawwariyah Dist.'),
(6,10200006059,'حي الشهداء','Ash Shuhada Dist.'),
(6,10200006060,'حي وادي جليل','Wadi Jalil Dist.'),
(6,10200006061,'حي العسيلة','Al Usaylah Dist.'),
(6,10200006062,'حي جعرانة','Jaranah Dist.'),
(6,10200006063,'حي البيعة','Al Biyah Dist.'),
(6,10200006064,'حي المغمس','Al Mughams Dist.'),
(6,10200006065,'حي التروية','At Tarwiyah Dist.'),
(6,10200006066,'حي الشرائع','Ash Sharia Dist.'),
(6,10200006067,'حي السلام','As Salam Dist.'),
(6,10200006068,'حي الكوثر','Al Kawthar Dist.'),
(18,10200018001,'حي الزمرد','Az Zomorod Dist.'),
(18,10200018002,'حي اللؤلؤ','Al Loaloa Dist.'),
(18,10200018003,'حي الياقوت','Al Yaqoot Dist.'),
(18,10200018004,'حي الصوارى','As Swaryee Dist.'),
(18,10200018005,'حي الامواج','Al Amwaj Dist.'),
(18,10200018006,'حي الشراع','Ash Sheraa Dist.'),
(18,10200018007,'حي الفردوس','Al Ferdous Dist.'),
(18,10200018008,'حي الفلاح','Al Falah Dist.'),
(18,10200018009,'حي الاصالة','Al Asalah Dist.'),
(18,10200018010,'حي مريخ','Mraykh Dist.'),
(18,10200018011,'حي الشروق','Ash Shrouk Dist.'),
(18,10200018012,'حي الامير فواز الشمالى','Al Amir Fawaz Ash Shamaly Dist.'),
(18,10200018013,'حي الرياض','Ar Riyadh Dist.'),
(18,10200018014,'حي الفروسية','Al Frosyah Dist.'),
(18,10200018015,'حي الرحمانية','Ar Rahmaniyah Dist.'),
(18,10200018016,'حي الصالحية','As Salhiyah Dist.'),
(18,10200018017,'حي الحمدانية','Al Hamadaniyah Dist.'),
(18,10200018018,'حي الريان','Ar Rayaan Dist.'),
(18,10200018019,'حي أم حبلين الغربية','Um Hableen Al Gharbiyyah Dist.'),
(18,10200018020,'حي بريمان','Bryman Dist.'),
(18,10200018021,'حي المنتزة','Al Montazah Dist.'),
(18,10200018022,'حي الثعالبة','Ath Thaalibah Dist.'),
(18,10200018023,'حي البلد','Al Balad Dist.'),
(18,10200018024,'حي الفاروق','Al Farouk Dist.'),
(18,10200018025,'حي العدل','Al Adel Dist.'),
(18,10200018026,'حي الهنداوية','Al Hindawiyah Dist.'),
(18,10200018027,'حي المحجر','Al Mahjar Dist.'),
(18,10200018028,'حي النهضة','An Nahdah Dist.'),
(18,10200018029,'حي الخالدية','Al Khalidiyah Dist.'),
(18,10200018030,'جامعة الملك عبدالعزيز','King Abdulaziz University'),
(18,10200018031,'حي النخيل','Al Nakhil Dist.'),
(18,10200018032,'حي البغدادية الشرقية','Al Baghdadiyah Ash Sharqiyah Dist.'),
(18,10200018033,'حي النزلة الشرقية','An Nazlah Ash Sharqiyah Dist.'),
(18,10200018034,'حي البوادي','Al Bawadi Dist.'),
(18,10200018035,'حي السلامة','As Salamah Dist.'),
(18,10200018036,'حي الثغر','Ath Thaghr Dist.'),
(18,10200018037,'حي الشرفية','Ash Sharafiyah Dist.'),
(18,10200018038,'قاعدة الملك فيصل البحرية','King Faisal Naval Base'),
(18,10200018039,'حي الشفا','Ash Shefaa Dist.'),
(18,10200018040,'حي السنابل','As Sanabel Dist.'),
(18,10200018041,'حي الهدى','Al Hada Dist.'),
(18,10200018042,'حي التضامن','Al Tadamun Dist.'),
(18,10200018043,'حي الكرامة','Al Karamah Dist.'),
(18,10200018044,'حي الرحمة','Ar Rahmah Dist.'),
(18,10200018045,'حي البركة','Al Barakah Dist.'),
(18,10200018046,'حي المسرة','Al Masarah Dist.'),
(18,10200018047,'حي المليساء','Al Moulysaa Dist.'),
(18,10200018048,'حي القوزين','Al Qouzeen Dist.'),
(18,10200018049,'حي الوادي','Al Wadi Dist.'),
(18,10200018050,'حي الفضيلة','Al Fadeylah Dist.'),
(18,10200018051,'حي التعاون','At Taawun Dist.'),
(18,10200018052,'حي السروات','As Sarawat Dist.'),
(18,10200018053,'حي الخمرة','Al Khomrah Dist.'),
(18,10200018054,'حي الضاحية','Ad Dahiah Dist.'),
(18,10200018055,'حي القرينية','Al Qryniah Dist.'),
(18,10200018056,'حي النزلة اليمانية','An Nazlah Al Yamaniyah Dist.'),
(18,10200018057,'حي النسيم','Al Naseem Dist.'),
(18,10200018058,'حي القريات','Al Quraiyat Dist.'),
(18,10200018059,'حي غليل','Ghulail Dist.'),
(18,10200018060,'حي الكندرة','Al Kandarah Dist.'),
(18,10200018061,'حي العمارية','Al Ammariyah Dist.'),
(18,10200018062,'حي الصحيفة','As Sahifah Dist.'),
(18,10200018063,'حي السبيل','As Sabil Dist.'),
(18,10200018064,'حي الروضة','Ar Rawdah Dist.'),
(18,10200018065,'حي بنى مالك','Bani Malik Dist.'),
(18,10200018066,'حي الفيصلية','Al Faisaliyah Dist.'),
(18,10200018067,'حي الرحاب','Al Rehab Dist.'),
(18,10200018068,'حي العزيزية','Al Aziziyah Dist.'),
(18,10200018069,'حي مشرفة','Mishrifah Dist.'),
(18,10200018070,'حي الورود','Al Wurud Dist.'),
(18,10200018071,'حي الواحة','Al Wahah Dist.'),
(18,10200018072,'حي ابرق الرغامة','Abruq Ar Rughamah Dist.'),
(18,10200018073,'حي السليمانية','As Sulaymaniyah Dist.'),
(18,10200018074,'حي الساحل','As Sahil Dist.'),
(18,10200018075,'حي البشائر','Al Bashaer Dist.'),
(18,10200018076,'حي المحمدية','Al Muhammadiyah Dist.'),
(18,10200018077,'حي الكوثر','Al Kawthar Dist.'),
(18,10200018078,'حي طيبة','Taibah Dist.'),
(18,10200018079,'حي النعيم','An Naim Dist.'),
(18,10200018080,'حي البساتين','Al Basatin Dist.'),
(18,10200018081,'حي الربوة','Ar Rabwah Dist.'),
(18,10200018082,'حي النزهة','An Nuzhah Dist.'),
(18,10200018083,'حي الصفا','As Safa Dist.'),
(18,10200018084,'حي المروة','Al Marwah Dist.'),
(18,10200018085,'حي السامر','As Samir Dist.'),
(18,10200018086,'حي الاجواد','Al Ajwad Dist.'),
(18,10200018087,'مطار الملك عبدالعزيز الدولي','King Abdulaziz International Airport'),
(18,10200018088,'حي المنار','Al Manar Dist.'),
(18,10200018089,'المنطقة الصناعية','Industrial Area'),
(18,10200018090,'حي الامير عبدالمجيد','Prince Abdul Majeed Dist.'),
(18,10200018091,'حي الوزيريه','Al Waziriyah Dist.'),
(18,10200018092,'حي الجوهرة','Al Jawharah Dist.'),
(18,10200018093,'حي الامير فواز الجنوبى','Al Amir Fawaz Al Janouby Dist.'),
(18,10200018094,'حي المتنزهات','Al Mutanazahat Dist.'),
(18,10200018095,'حي الجامعة','Al Jamiah Dist.'),
(18,10200018096,'حي الروابي','Ar Rawabi Dist.'),
(18,10200018097,'حي الفضل','Al Fadel Dist.'),
(18,10200018098,'حي ام السلم','Um Asalam Dist.'),
(18,10200018100,'حي البغدادية الغربية','Al Baghdadiyah Al Gharbiyah Dist.'),
(18,10200018101,'حي ابحر الشمالية','Abhur Ash Shamaliyah Dist.'),
(18,10200018102,'حي الرويس','Ar Ruwais Dist.'),
(18,10200018103,'حي بترومين','Petromin Dist.'),
(18,10200018104,'حي الاندلس','Al Andalus Dist.'),
(18,10200018105,'حي ابحر الجنوبية','Abhur Al Janubiyah Dist.'),
(18,10200018106,'حي المرجان','Al Murjan Dist.'),
(18,10200018107,'حي السرورية','As Sororyah Dist.'),
(18,10200018108,'حي الاجاويد','Al Ajaweed Dist.'),
(18,10200018109,'حي الشاطئ','Ash Shati Dist.'),
(18,10200018110,'حي مدائن الفهد','Madain Al Fahd Dist.'),
(18,10200018111,'حي الزهراء','Az Zahra Dist.'),
(18,10200018112,'حي الحمراء','Al Hamra Dist.'),
(18,10200018113,'حي الفيحاء','Al Fayha Dist.'),
(18,10200018114,'حي بحرة','Bahrah Dist.'),
(18,10200018115,'ميناء جدة الاسلامي','Jeddah Eslamic Seaport'),
(18,10200018116,'حي الوفاء','Al Wafa Dist.'),
(18,10200018117,'حي الحرازات','Al Harazat Dist.'),
(18,10200018118,'حي المحاميد','Al Mahamid Dist.'),
(18,10200018119,'المدينة الصناعية الثالثة','3rd Industrial City'),
(18,10200018120,'حي الفنار','Al Fanar Dist.'),
(18,10200018121,'حي السهل','Al Sahl Dist.'),
(18,10200018122,'حي الدرة','Ad Durrah Dist.'),
(18,10200018123,'حي المنارات','Al Manarat Dist.'),
(18,10200018124,'حي الربيع','Ar Rabie Dist.'),
(18,10200018125,'حي الحجاز','Al Hijaz Dist.'),
(18,10200018126,'حي المزيرعة','Al Muzairah Dist.'),
(18,10200018127,'حي الصفوة','Al Safwah Dist.'),
(18,10200018128,'حي المستقبل','Al Mustaqbal Dist.'),
(18,10200018129,'حي النجمة','An Najmah Dist.'),
(18,10200018130,'حي القوس','Al Qus Dist.'),
(18,10200018131,'حي الحفنة','Al Hafnah Dist.'),
(18,10200018132,'حي الجزيرة','Al Jazirah Dist.'),
(18,10200018133,'حي الشويضي','Al Shuwaidhi Dist.'),
(18,10200018134,'حي الشرقية','Al Sharqiyyah Dist.'),
(18,10200018135,'حي العشيرية','Al Ushayriyyah Dist.'),
(18,10200018136,'حي أبو جعالة','Abu Jaalah Dist.'),
(18,10200018137,'حي كتانة','Katanah Dist.'),
(18,10200018138,'حي التلال','Al Talal Dist.'),
(18,10200018139,'حي الرمال','Ar Rimal Dist.'),
(18,10200018140,'حي المرسي','Al Mursi Dist.'),
(18,10200018141,'حي المروج','Al Muruj Dist.'),
(18,10200018142,'حي الخليج','Al Khalij Dist.'),
(18,10200018143,'حي البحيرات','Al Buhayrat Dist.'),
(18,10200018144,'حي الموج','Al Mawj Dist.'),
(18,10200018145,'حي الغربية','Al Gharbiyyah Dist.'),
(18,10200018146,'حي الزهور','Al Zahur Dist.'),
(18,10200018147,'حي الهزاعية','Al Hazaiyah Dist.'),
(18,10200018148,'حي العسلاء','Al Asla Dist.'),
(18,10200018149,'حي العسلاء','Al Asla Dist.'),
(18,10200018150,'حي بلدة ذهبان','Dhahban Town Dist.'),
(18,10200018151,'حكومي','Governmental'),
(18,10200018152,'حي العقيق','Al Aqiq Dist.'),
(18,10200018153,'حي النور','Al Nur Dist.'),
(18,10200018154,'حي صناعي','Industrial Dist.'),
(18,10200018155,'حكومي','Governmental'),
(18,10200018156,'حي الغدير','Al Ghadir Dist.'),
(18,10200018157,'حي الفرقان','Al Furqan Dist.'),
(18,10200018158,'حي طابة','Tabah Dist.'),
(18,10200018159,'حي الرواسي','Al Rawasee Dist.'),
(18,10200018160,'حي أم حبلين الشرقية','Um Hableen Al Sharqiyyah Dist.'),
(18,10200018161,'حي قباء','Quba Dist.'),
(18,10200018162,'حي الرابية','Al Rabiyah Dist.'),
(18,10200018163,'حي العليا','Al ''Ulayya Dist.'),
(18,10200018164,'حي البدور','Al Budur Dist.'),
(18,10200018165,'حي المجامع','Al Majami Dist.'),
(18,10200018166,'حي المرسلات','Al Mursalat Dist.'),
(18,10200018167,'حي الأثير','Al Athir Dist.'),
(18,10200018168,'حي صناعي','Industrial Dist.'),
(18,10200018169,'حي الصفحة','Al Safhah Dist.'),
(18,10200018170,'حي اليسر','Al Yusr Dist.'),
(18,10200018171,'حي العبير','Al Abeer Dist.')
), normalized as (
  select a.*,
         regexp_replace(translate(trim(a.name_ar),'أإآىة','ااايه'),'\s+','','g') as norm_ar
  from authoritative a
), matched as (
  select n.id,
         trim(n.name) as ar_text,
         a.name_en as en_text,
         row_number() over (
           partition by n.id
           order by
             case
               when a.city_source_id=18 and coalesce(n.city,'') like '%جدة%' then 0
               when a.city_source_id=6 and coalesce(n.city,'') like '%مكة%' then 0
               else 1
             end,
             a.city_source_id desc
         ) as rn
  from public.installation_neighborhoods n
  join normalized a
    on regexp_replace(translate(trim(n.name),'أإآىة','ااايه'),'\s+','','g')=a.norm_ar
  where coalesce(n.is_active,true) is true
    and nullif(trim(n.name),'') is not null
), source as (
  select id,ar_text,en_text from matched where rn=1 and nullif(trim(en_text),'') is not null
)
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
)
select
  'entity.neighborhood.'||s.id::text,
  'installationExecutionNeighborhoods',
  'appointments',
  'neighborhood',
  s.ar_text,
  s.en_text,
  s.ar_text,
  s.en_text,
  true,
  now()
from source s
on conflict(translation_key) do update
set ar_text=excluded.ar_text,
    default_ar=excluded.default_ar,
    default_en=excluded.default_en,
    en_text=case
      when nullif(trim(public.app_translations.en_text),'') is null
        or public.app_translations.en_text=public.app_translations.default_en
      then excluded.en_text
      else public.app_translations.en_text
    end,
    is_active=true,
    updated_at=now();

-- 2) Translate every known PETATOE service pattern directly from Appointment Settings / Services.
-- All service records, including inactive settings rows, remain visible in Translation Center through runtime catalog registration.
with source as (
  select s.id,trim(s.name) as ar_text,s.service_code,
    case
      when trim(s.name) in ('أكياس قمامة للحيوانات','اكياس قمامة للحيوانات') then 'Pet Waste Bags'
      when trim(s.name) in ('اكرامية','إكرامية') then 'Tip'
      when trim(s.name) in ('تقليم الاظافر','تقليم الأظافر') then 'Nail Trimming'
      when trim(s.name)='تشذيب المخالب' then 'Claw Trimming'
      when trim(s.name) in ('تنظيف الاذنين','تنظيف الأذنين','تنظيف الاذن','تنظيف الأذن') then 'Ear Cleaning'
      when trim(s.name) in ('حلاقة للاعضاء التناسلية','حلاقة للأعضاء التناسلية','حلاقة الأعضاء التناسلية') then 'Sanitary Trim'
      when trim(s.name)='تنظيف عميق للفراء' then 'Deep Coat Cleaning'
      when trim(s.name) in ('تنظيف الاسنان','تنظيف الأسنان') then 'Teeth Cleaning'
      when trim(s.name) in ('حمام','استحمام') then 'Bath'
      when trim(s.name)='قص الشعر' then 'Haircut'
      when trim(s.name) in ('قص الشعر وسط','قص الشعر متوسط','قص شعر وسط','قص شعر متوسط') then 'Medium Haircut'
      when trim(s.name) in ('قص الشعر قصير','قص شعر قصير') then 'Short Haircut'
      when trim(s.name) in ('قص الشعر طويل','قص شعر طويل') then 'Long Haircut'
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
    end as en_text
  from public.installation_service_types s
  where nullif(trim(s.name),'') is not null
), translated as (
  select * from source where nullif(trim(en_text),'') is not null
)
insert into public.app_translations(
  translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active,updated_at
)
select
  'entity.service.'||s.id::text,
  'installationExecutionServices',
  'appointments',
  'service',
  s.ar_text,
  s.en_text,
  s.ar_text,
  s.en_text,
  true,
  now()
from translated s
on conflict(translation_key) do update
set ar_text=excluded.ar_text,
    default_ar=excluded.default_ar,
    default_en=excluded.default_en,
    en_text=case
      when nullif(trim(public.app_translations.en_text),'') is null
        or public.app_translations.en_text=public.app_translations.default_en
        or public.app_translations.en_text ~ '^Service[[:space:]]+[A-Za-z0-9_-]+$'
      then excluded.en_text
      else public.app_translations.en_text
    end,
    is_active=true,
    updated_at=now();

commit;

-- Verification helpers (read-only):
-- A) Active neighborhoods still missing an approved English translation.
select n.id,n.name,n.city
from public.installation_neighborhoods n
left join public.app_translations t on t.translation_key='entity.neighborhood.'||n.id::text and t.is_active=true
where coalesce(n.is_active,true)=true
  and (t.translation_key is null or nullif(trim(t.en_text),'') is null)
order by n.city,n.name;

-- B) Services from Appointment Settings still missing an approved English translation.
select s.id,s.service_code,s.name,s.is_active
from public.installation_service_types s
left join public.app_translations t on t.translation_key='entity.service.'||s.id::text and t.is_active=true
where t.translation_key is null or nullif(trim(t.en_text),'') is null
order by s.is_active desc,s.name;
