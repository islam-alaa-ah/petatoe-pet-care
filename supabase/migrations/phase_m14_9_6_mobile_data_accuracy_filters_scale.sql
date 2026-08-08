begin;

alter table public.installation_requests
  add column if not exists customer_order_number text;

alter table public.installation_requests
  drop constraint if exists installation_requests_customer_order_number_length;

alter table public.installation_requests
  add constraint installation_requests_customer_order_number_length
  check (customer_order_number is null or char_length(btrim(customer_order_number)) between 1 and 120);

comment on column public.installation_requests.customer_order_number is
  'Optional customer-issued purchase order/request reference. Distinct from the internal installation request_number.';

create or replace function public.create_installation_request_with_services(
  p_customer_id uuid,
  p_quotation_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_priority text,
  p_installation_address text,
  p_customer_order_number text,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_request_id uuid;
  v_request_number text;
  v_map_url text := nullif(btrim(coalesce(p_customer_map_url,'')), '');
  v_customer_order_number text := nullif(btrim(coalesce(p_customer_order_number,'')), '');
begin
  if not public.has_screen_permission('installationRequestNew','add') then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_customer_order_number is not null and char_length(v_customer_order_number) > 120 then
    raise exception 'Customer order number is too long' using errcode='23514';
  end if;

  if v_map_url is not null and v_map_url !~* '^https://(maps\.app\.goo\.gl/|maps\.google\.com/|((www\.)?google\.com)/maps/|goo\.gl/maps/)' then
    raise exception 'Invalid Google Maps URL' using errcode='23514';
  end if;

  if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 then
    raise exception 'At least one service is required' using errcode='23514';
  end if;

  insert into public.installation_requests(
    customer_id,quotation_id,representative_id,neighborhood_id,status,priority,
    installation_address,customer_order_number,customer_map_url,notes,scheduled_date,time_slot
  ) values (
    p_customer_id,p_quotation_id,p_representative_id,p_neighborhood_id,
    'بانتظار المراجعة',p_priority,p_installation_address,v_customer_order_number,v_map_url,p_notes,null,null
  ) returning installation_requests.id,installation_requests.request_number
    into v_request_id,v_request_number;

  insert into public.installation_request_services(
    installation_request_id,service_type_id,quantity,unit_price
  )
  select v_request_id,x.service_type_id,x.quantity,x.unit_price
  from jsonb_to_recordset(p_services)
    as x(service_type_id uuid,quantity integer,unit_price numeric)
  where x.service_type_id is not null and x.quantity >= 1 and x.unit_price >= 0;

  if not exists(select 1 from public.installation_request_services where installation_request_id=v_request_id) then
    raise exception 'At least one valid service is required' using errcode='23514';
  end if;

  return query select v_request_id,v_request_number;
end;
$$;

grant execute on function public.create_installation_request_with_services(
  uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb
) to authenticated;

create or replace function public.update_installation_request_with_services(
  p_request_id uuid,
  p_customer_id uuid,
  p_quotation_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_priority text,
  p_installation_address text,
  p_customer_order_number text,
  p_customer_map_url text,
  p_notes text,
  p_services jsonb
)
returns table(id uuid,request_number text)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_request_number text;
  v_map_url text := nullif(btrim(coalesce(p_customer_map_url,'')), '');
  v_customer_order_number text := nullif(btrim(coalesce(p_customer_order_number,'')), '');
begin
  if not public.has_screen_permission('installationRequests','edit') then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 then
    raise exception 'At least one service is required' using errcode='23514';
  end if;

  if v_customer_order_number is not null and char_length(v_customer_order_number) > 120 then
    raise exception 'Customer order number is too long' using errcode='23514';
  end if;

  if v_map_url is not null and v_map_url !~* '^https://(maps\.app\.goo\.gl/|maps\.google\.com/|((www\.)?google\.com)/maps/|goo\.gl/maps/)' then
    raise exception 'Invalid Google Maps URL' using errcode='23514';
  end if;

  if p_quotation_id is not null and not exists(
    select 1 from public.quotations q where q.id=p_quotation_id and q.customer_id=p_customer_id
  ) then
    raise exception 'Quotation does not belong to selected customer' using errcode='23514';
  end if;

  update public.installation_requests
  set customer_id=p_customer_id,
      quotation_id=p_quotation_id,
      representative_id=p_representative_id,
      neighborhood_id=p_neighborhood_id,
      priority=p_priority,
      installation_address=nullif(btrim(coalesce(p_installation_address,'')),''),
      customer_order_number=v_customer_order_number,
      customer_map_url=v_map_url,
      notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where installation_requests.id=p_request_id
  returning installation_requests.request_number into v_request_number;

  if v_request_number is null then
    raise exception 'Installation request not found or not accessible' using errcode='P0002';
  end if;

  delete from public.installation_request_services where installation_request_id=p_request_id;

  insert into public.installation_request_services(
    installation_request_id,service_type_id,quantity,unit_price
  )
  select p_request_id,x.service_type_id,x.quantity,x.unit_price
  from jsonb_to_recordset(p_services)
    as x(service_type_id uuid,quantity integer,unit_price numeric)
  where x.service_type_id is not null and x.quantity >= 1 and x.unit_price >= 0;

  if not exists(select 1 from public.installation_request_services where installation_request_id=p_request_id) then
    raise exception 'At least one valid service is required' using errcode='23514';
  end if;

  perform public.refresh_installation_request_totals(p_request_id);
  return query select p_request_id,v_request_number;
end;
$$;

grant execute on function public.update_installation_request_with_services(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb
) to authenticated;

commit;
