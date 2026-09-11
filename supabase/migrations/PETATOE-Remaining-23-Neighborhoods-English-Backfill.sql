-- PETATOE — Complete the remaining 23 Jeddah neighborhood English names
-- Scope: exact production UUIDs returned by the audit query.
-- Safety:
--   * No fuzzy joins.
--   * No customer rows are changed.
--   * Existing non-empty custom English names are preserved.
--   * Only installation_neighborhoods.name_en and entity.neighborhood.<UUID> display translations are filled.
--   * Proper names are transliterated where no published English label is available; they are NOT literal semantic translations.

begin;

alter table public.installation_neighborhoods
  add column if not exists name_en text;

create temporary table tmp_petatoe_remaining_23_neighborhoods(
  id uuid primary key,
  name_ar text not null,
  name_en text not null,
  source_basis text not null
);

insert into tmp_petatoe_remaining_23_neighborhoods(id,name_ar,name_en,source_basis) values
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

-- Guard: stop if an expected UUID points at a different Arabic neighborhood.
do $$
declare
  mismatch_count integer;
begin
  select count(*)
    into mismatch_count
  from tmp_petatoe_remaining_23_neighborhoods m
  join public.installation_neighborhoods n on n.id=m.id
  where btrim(coalesce(n.name,'')) <> btrim(m.name_ar);

  if mismatch_count > 0 then
    raise exception 'PETATOE geography safety gate failed: % UUID/name mismatch(es). No changes committed.', mismatch_count;
  end if;
end $$;

-- Fill only missing / obviously invalid English metadata.
update public.installation_neighborhoods n
set name_en = m.name_en
from tmp_petatoe_remaining_23_neighborhoods m
where n.id=m.id
  and (
    nullif(btrim(n.name_en),'') is null
    or n.name_en ~ '[؀-ۿ]'
    or n.name_en ~ '^\[entity\.neighborhood\.'
  );

-- Upsert display translations, preserving any valid custom English translation.
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
  'entity.neighborhood.' || m.id::text,
  'installationExecutionNeighborhoods',
  'appointments',
  'neighborhood',
  m.name_ar,
  m.name_en,
  m.name_ar,
  m.name_en,
  true,
  now()
from tmp_petatoe_remaining_23_neighborhoods m
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

-- ======================================
-- VERIFY: should return 23/23 translated
-- ======================================
select
  count(*) as expected_rows,
  count(*) filter (where nullif(btrim(n.name_en),'') is not null) as translated_rows,
  count(*) filter (where nullif(btrim(n.name_en),'') is null) as missing_rows
from tmp_petatoe_remaining_23_neighborhoods m
left join public.installation_neighborhoods n on n.id=m.id;

-- Detail verification: no Arabic/raw-key should remain in the English column.
select
  m.id,
  m.name_ar as neighborhood_ar,
  n.name_en,
  t.en_text as translation_en,
  m.source_basis,
  case
    when n.id is null then 'UUID_NOT_FOUND'
    when nullif(btrim(n.name_en),'') is null then 'MISSING_NAME_EN'
    when n.name_en ~ '[؀-ۿ]' then 'ARABIC_IN_NAME_EN'
    when t.translation_key is null then 'MISSING_TRANSLATION_ROW'
    when nullif(btrim(t.en_text),'') is null then 'MISSING_TRANSLATION_EN'
    when t.en_text ~ '[؀-ۿ]' then 'ARABIC_IN_TRANSLATION_EN'
    when t.en_text ~ '^\[entity\.neighborhood\.' then 'RAW_KEY_IN_TRANSLATION_EN'
    else 'PASS'
  end as audit_status
from tmp_petatoe_remaining_23_neighborhoods m
left join public.installation_neighborhoods n on n.id=m.id
left join public.app_translations t
  on t.translation_key='entity.neighborhood.'||m.id::text
 and t.is_active=true
order by m.name_ar;
