-- Phase M15.1 — Saudi Geographic Master Data Seed Verification

select
  (select count(*) from public.installation_regions where national_address_region_id is not null) as seeded_regions,
  (select count(*) from public.installation_cities where national_address_city_id is not null) as seeded_unique_cities,
  (select count(*) from public.installation_neighborhoods where national_address_district_id is not null) as seeded_unique_districts;

-- Must return 13.
select count(*) as region_count
from public.installation_regions
where national_address_region_id between 1 and 13;

-- Must return zero rows.
select c.id,c.name
from public.installation_cities c
left join public.installation_regions r on r.id=c.region_id
where r.id is null;

-- Must return zero rows for seeded districts.
select n.id,n.name
from public.installation_neighborhoods n
where n.national_address_district_id is not null
  and (n.region_id is null or n.city_id is null);

-- Must return zero rows.
select region_id,name,count(*)
from public.installation_cities
group by region_id,name
having count(*)>1;

-- Must return zero rows.
select city_id,name,count(*)
from public.installation_neighborhoods
where city_id is not null
group by city_id,name
having count(*)>1;

-- Legacy records still requiring manual mapping (informational only).
select id,name,region,city
from public.installation_neighborhoods
where city_id is null or region_id is null
order by name;
