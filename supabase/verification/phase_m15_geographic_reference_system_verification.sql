select count(*) as regions_count from public.installation_regions where is_active;
select r.name,count(c.id) cities from public.installation_regions r left join public.installation_cities c on c.region_id=r.id and c.is_active group by r.name order by r.name;
select * from public.installation_neighborhoods where region_id is null or city_id is null;
select region_id,name,count(*) from public.installation_cities group by region_id,name having count(*)>1;
select city_id,name,count(*) from public.installation_neighborhoods where city_id is not null group by city_id,name having count(*)>1;
