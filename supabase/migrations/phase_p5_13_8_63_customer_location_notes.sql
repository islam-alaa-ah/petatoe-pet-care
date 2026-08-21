-- P5.13.8.63 — canonical customer location notes
-- Single source of truth: public.customers.location_notes.

begin;

alter table public.customers
  add column if not exists location_notes text;

comment on column public.customers.location_notes is
  'Persistent customer location/access notes reused by appointment creation, scheduling, and execution.';

create or replace function public.save_customer_appointment_location_notes(
  p_customer_id uuid,
  p_location_notes text
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;

  update public.customers
  set location_notes = nullif(btrim(coalesce(p_location_notes,'')),''),
      updated_at = now()
  where id = p_customer_id;

  if not found then
    raise exception 'Customer not found';
  end if;
end;
$$;

revoke all on function public.save_customer_appointment_location_notes(uuid,text) from public,anon;
grant execute on function public.save_customer_appointment_location_notes(uuid,text) to authenticated,service_role;

-- Keep the existing appointment-defaults RPC as the canonical read path and extend it
-- with the customer-master location notes. Existing keys and fallback behavior are preserved.
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

  select c.neighborhood_id,c.google_maps_url,c.address,c.location_notes
  into v_customer
  from public.customers c
  where c.id=p_customer_id;

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
    'location_notes',coalesce(v_customer.location_notes,''),
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
      select jsonb_agg(jsonb_build_object(
        'pet_name',a.pet_name,
        'pet_type',a.pet_type,
        'breed',a.breed,
        'pet_size',a.pet_size,
        'quantity',a.quantity
      ) order by a.display_order)
      from public.installation_request_animals a
      where a.installation_request_id=v_request.id
    ),'[]'::jsonb),
    'collection',coalesce((
      select jsonb_build_object(
        'amount_collected',x.amount_collected,
        'collection_status',x.collection_status,
        'payment_method',x.payment_method,
        'appointment_status',x.appointment_status
      )
      from public.installation_request_collection x
      where x.installation_request_id=v_request.id
    ),'{}'::jsonb)
  ) into v_result;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.get_customer_appointment_defaults(uuid) from public,anon;
grant execute on function public.get_customer_appointment_defaults(uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
