-- Phase M15.2 — Geographic Catalog Completeness Verification
-- Run after M15 and M15.1 migrations.

select
  count(*) filter (where is_active) as active_regions,
  count(*) filter (where national_address_region_id is not null) as seeded_regions
from public.installation_regions;

select
  count(*) filter (where is_active) as active_cities,
  count(*) filter (where national_address_city_id is not null) as seeded_cities
from public.installation_cities;

select
  count(*) filter (where is_active) as active_districts,
  count(*) filter (where national_address_district_id is not null) as seeded_districts
from public.installation_neighborhoods;

-- Expected: 0 rows.
select c.id,c.name
from public.installation_cities c
left join public.installation_regions r on r.id=c.region_id
where r.id is null;

-- Expected: 0 rows for seeded active districts.
select n.id,n.name,n.city,n.region
from public.installation_neighborhoods n
left join public.installation_cities c on c.id=n.city_id
left join public.installation_regions r on r.id=n.region_id
where n.is_active
  and n.national_address_district_id is not null
  and (c.id is null or r.id is null);

-- Expected: 0 duplicate rows.
select region_id,trim(name) as city_name,count(*)
from public.installation_cities
group by region_id,trim(name)
having count(*)>1;

select city_id,trim(name) as district_name,count(*)
from public.installation_neighborhoods
where city_id is not null
group by city_id,trim(name)
having count(*)>1;

-- Coverage by region for manual review.
select r.name as region_name,
       count(distinct c.id) as cities,
       count(distinct n.id) as districts
from public.installation_regions r
left join public.installation_cities c on c.region_id=r.id and c.is_active
left join public.installation_neighborhoods n on n.region_id=r.id and n.is_active
group by r.id,r.name
order by r.name;
