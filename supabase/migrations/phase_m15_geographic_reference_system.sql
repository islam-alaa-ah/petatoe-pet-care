begin;
create table if not exists public.installation_regions(id uuid primary key default gen_random_uuid(),name text not null unique,is_active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.installation_cities(id uuid primary key default gen_random_uuid(),region_id uuid not null references public.installation_regions(id) on delete restrict,name text not null,is_active boolean not null default true,created_at timestamptz not null default now(),unique(region_id,name));
alter table public.installation_neighborhoods add column if not exists region_id uuid references public.installation_regions(id) on delete set null;
alter table public.installation_neighborhoods add column if not exists city_id uuid references public.installation_cities(id) on delete set null;
insert into public.installation_regions(name) values ('منطقة الرياض') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['الرياض','الخرج','الدوادمي','المجمعة','القويعية','وادي الدواسر','الزلفي','شقراء','عفيف','الغاط','حوطة بني تميم','الأفلاج','السليل','رماح','ثادق','حريملاء','ضرما','المزاحمية']) as u(city_name) where r.name='منطقة الرياض' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة مكة المكرمة') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['مكة المكرمة','جدة','الطائف','رابغ','القنفذة','الليث','الجموم','خليص','بحرة','الكامل','الخرمة','رنية','تربة','ميسان','أضم']) as u(city_name) where r.name='منطقة مكة المكرمة' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة المدينة المنورة') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['المدينة المنورة','ينبع','العلا','بدر','خيبر','الحناكية','المهد','وادي الفرع']) as u(city_name) where r.name='منطقة المدينة المنورة' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('المنطقة الشرقية') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['الدمام','الخبر','الظهران','الأحساء','الجبيل','القطيف','حفر الباطن','الخفجي','رأس تنورة','بقيق','النعيرية','قرية العليا']) as u(city_name) where r.name='المنطقة الشرقية' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة القصيم') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['بريدة','عنيزة','الرس','البكيرية','البدائع','المذنب','رياض الخبراء','عيون الجواء','الأسياح','النبهانية','عقلة الصقور','ضرية']) as u(city_name) where r.name='منطقة القصيم' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة عسير') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['أبها','خميس مشيط','بيشة','محايل عسير','أحد رفيدة','النماص','سراة عبيدة','ظهران الجنوب','تثليث','رجال ألمع','بلقرن','المجاردة','تنومة','البرك']) as u(city_name) where r.name='منطقة عسير' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة تبوك') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['تبوك','ضباء','الوجه','أملج','حقل','تيماء','البدع']) as u(city_name) where r.name='منطقة تبوك' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة حائل') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['حائل','بقعاء','الغزالة','الشنان','السليمي','الحائط','سميراء','موقق','الشملي']) as u(city_name) where r.name='منطقة حائل' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة الحدود الشمالية') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['عرعر','رفحاء','طريف','العويقيلة']) as u(city_name) where r.name='منطقة الحدود الشمالية' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة جازان') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['جازان','صبيا','أبو عريش','صامطة','الدرب','بيش','فرسان','العارضة','الطوال','ضمد','أحد المسارحة','الحرث','الدائر','الريث','فيفاء','هروب']) as u(city_name) where r.name='منطقة جازان' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة نجران') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['نجران','شرورة','حبونا','بدر الجنوب','يدمة','ثار','خباش']) as u(city_name) where r.name='منطقة نجران' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة الباحة') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['الباحة','بلجرشي','المندق','المخواة','قلوة','العقيق','القرى','غامد الزناد','الحجرة']) as u(city_name) where r.name='منطقة الباحة' on conflict (region_id,name) do nothing;
insert into public.installation_regions(name) values ('منطقة الجوف') on conflict (name) do nothing;
insert into public.installation_cities(region_id,name) select r.id,city_name from public.installation_regions r cross join unnest(array['سكاكا','القريات','دومة الجندل','طبرجل']) as u(city_name) where r.name='منطقة الجوف' on conflict (region_id,name) do nothing;
-- Preserve and link every existing neighborhood; create missing legacy region/city records rather than replacing them.
insert into public.installation_regions(name)
select distinct trim(region) from public.installation_neighborhoods where nullif(trim(region),'') is not null
on conflict(name) do nothing;
insert into public.installation_cities(region_id,name)
select distinct r.id,trim(n.city) from public.installation_neighborhoods n join public.installation_regions r on r.name=trim(n.region)
where nullif(trim(n.city),'') is not null on conflict(region_id,name) do nothing;
update public.installation_neighborhoods n set region_id=r.id from public.installation_regions r where n.region_id is null and r.name=trim(n.region);
update public.installation_neighborhoods n set city_id=c.id from public.installation_cities c where n.city_id is null and c.region_id=n.region_id and c.name=trim(n.city);
create index if not exists idx_installation_cities_region on public.installation_cities(region_id,name);
create index if not exists idx_installation_neighborhoods_city on public.installation_neighborhoods(city_id,name);
alter table public.installation_regions enable row level security;
alter table public.installation_cities enable row level security;
drop policy if exists installation_regions_read on public.installation_regions;
create policy installation_regions_read on public.installation_regions for select to authenticated using (is_active);
drop policy if exists installation_cities_read on public.installation_cities;
create policy installation_cities_read on public.installation_cities for select to authenticated using (is_active);
grant select on public.installation_regions,public.installation_cities to authenticated;
commit;
