begin;

create table if not exists public.appointment_pet_breeds (
  id uuid primary key default gen_random_uuid(),
  pet_type text not null check (pet_type in ('كلب','قط','أخرى')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pet_type, name)
);

insert into public.appointment_pet_breeds(pet_type,name,is_active)
select distinct btrim(pet_type), btrim(breed), true
from public.installation_request_animals
where nullif(btrim(coalesce(pet_type,'')),'') is not null
  and nullif(btrim(coalesce(breed,'')),'') is not null
  and btrim(pet_type) in ('كلب','قط','أخرى')
on conflict (pet_type,name) do nothing;

alter table public.appointment_pet_breeds enable row level security;
drop policy if exists "appointment pet breeds view" on public.appointment_pet_breeds;
drop policy if exists "appointment pet breeds manage" on public.appointment_pet_breeds;
create policy "appointment pet breeds view" on public.appointment_pet_breeds
for select to authenticated using (
  public.has_screen_permission(auth.uid(),'installationRequestNew','view')
  or public.has_screen_permission(auth.uid(),'installationRequests','view')
  or public.has_screen_permission(auth.uid(),'installationSettings','view')
);
create policy "appointment pet breeds manage" on public.appointment_pet_breeds
for all to authenticated
using (public.has_screen_permission(auth.uid(),'installationSettings','edit'))
with check (public.has_screen_permission(auth.uid(),'installationSettings','edit'));
grant select,insert,update,delete on public.appointment_pet_breeds to authenticated;

create or replace function public.get_customer_appointment_defaults(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_customer record;
  v_request record;
  v_resolved uuid;
  v_name text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select c.neighborhood_id,c.google_maps_url,c.address
  into v_customer
  from public.customers c where c.id=p_customer_id;

  select r.* into v_request
  from public.installation_requests r
  where r.customer_id=p_customer_id
  order by coalesce(r.scheduled_date,r.created_at::date) desc, r.created_at desc
  limit 1;

  v_resolved=coalesce(v_customer.neighborhood_id,v_request.neighborhood_id,public.resolve_petatoe_customer_neighborhood(p_customer_id));
  select n.name into v_name from public.installation_neighborhoods n where n.id=v_resolved;

  select jsonb_build_object(
    'neighborhood_id',v_resolved,
    'neighborhood_name',coalesce(v_name,''),
    'google_maps_url',coalesce(nullif(v_customer.google_maps_url,''),v_request.customer_map_url,''),
    'address',coalesce(v_customer.address,''),
    'last_request_id',v_request.id,
    'quotation_id',null,
    'notes',coalesce(v_request.notes,''),
    'discount_type',coalesce(v_request.discount_type,'amount'),
    'discount_value',coalesce(v_request.discount_value,v_request.discount_amount,0),
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_type_id',s.service_type_id,
        'service_name',t.name,
        'quantity',s.quantity,
        'unit_price',s.unit_price
      ) order by s.created_at,s.id)
      from public.installation_request_services s
      left join public.installation_service_types t on t.id=s.service_type_id
      where s.installation_request_id=v_request.id
    ),'[]'::jsonb),
    'animals',coalesce((
      select jsonb_agg(jsonb_build_object('pet_name',a.pet_name,'pet_type',a.pet_type,'breed',a.breed,'pet_size',a.pet_size,'quantity',a.quantity) order by a.display_order)
      from public.installation_request_animals a where a.installation_request_id=v_request.id
    ),'[]'::jsonb),
    'collection',coalesce((
      select jsonb_build_object('amount_collected',x.amount_collected,'collection_status',x.collection_status,'payment_method',x.payment_method,'appointment_status',x.appointment_status)
      from public.installation_request_collection x where x.installation_request_id=v_request.id
    ),'{}'::jsonb)
  ) into v_result;
  return coalesce(v_result,'{}'::jsonb);
end $$;

grant execute on function public.get_customer_appointment_defaults(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
