-- Phase P5.10 — customer location master + appointment defaults
alter table public.customers add column if not exists google_maps_url text;
alter table public.customers add column if not exists neighborhood_id uuid references public.installation_neighborhoods(id) on delete set null;

-- Backfill an unambiguous neighborhood from the existing customer address only.
update public.customers c
set neighborhood_id = n.id
from public.installation_neighborhoods n
where c.neighborhood_id is null
  and nullif(btrim(c.address),'') is not null
  and btrim(c.address)=btrim(n.name)
  and n.is_active=true
  and 1=(select count(*) from public.installation_neighborhoods n2 where n2.is_active=true and btrim(n2.name)=btrim(c.address));

create index if not exists idx_customers_neighborhood_id on public.customers(neighborhood_id);

create or replace function public.save_customer_appointment_location_defaults(
  p_customer_id uuid,
  p_neighborhood_id uuid,
  p_google_maps_url text
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.customers
  set neighborhood_id = coalesce(neighborhood_id,p_neighborhood_id),
      address = case when nullif(btrim(coalesce(address,'')),'') is null then (select name from public.installation_neighborhoods where id=p_neighborhood_id) else address end,
      google_maps_url = case when nullif(btrim(coalesce(google_maps_url,'')),'') is null then nullif(btrim(coalesce(p_google_maps_url,'')),'') else google_maps_url end,
      updated_at = now()
  where id=p_customer_id;
end;
$$;
revoke all on function public.save_customer_appointment_location_defaults(uuid,uuid,text) from public,anon;
grant execute on function public.save_customer_appointment_location_defaults(uuid,uuid,text) to authenticated,service_role;

create or replace function public.get_customer_appointment_defaults(p_customer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v_customer record; v_request_id uuid; v_last_neighborhood_id uuid; v_last_map_url text; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.neighborhood_id,c.google_maps_url,c.address into v_customer from public.customers c where c.id=p_customer_id;
  select r.id,r.neighborhood_id,r.customer_map_url into v_request_id,v_last_neighborhood_id,v_last_map_url from public.installation_requests r where r.customer_id=p_customer_id order by coalesce(r.scheduled_date,r.created_at::date) desc,r.created_at desc limit 1;
  select jsonb_build_object(
    'neighborhood_id',coalesce(v_customer.neighborhood_id,v_last_neighborhood_id),
    'google_maps_url',coalesce(nullif(v_customer.google_maps_url,''),v_last_map_url,''),
    'address',coalesce(v_customer.address,''),
    'last_request_id',v_request_id,
    'animals',coalesce((select jsonb_agg(jsonb_build_object('pet_name',a.pet_name,'pet_type',a.pet_type,'breed',a.breed,'pet_size',a.pet_size,'quantity',a.quantity) order by a.display_order) from public.installation_request_animals a where a.installation_request_id=v_request_id),'[]'::jsonb),
    'collection',coalesce((select jsonb_build_object('amount_collected',x.amount_collected,'collection_status',x.collection_status,'payment_method',x.payment_method,'appointment_status',x.appointment_status) from public.installation_request_collection x where x.installation_request_id=v_request_id),'{}'::jsonb)
  ) into v_result;
  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.get_customer_appointment_defaults(uuid) from public,anon;
grant execute on function public.get_customer_appointment_defaults(uuid) to authenticated,service_role;
