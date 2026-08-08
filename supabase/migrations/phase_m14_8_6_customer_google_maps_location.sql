begin;

alter table public.installation_requests
  add column if not exists customer_map_url text;

alter table public.installation_requests
  drop constraint if exists installation_requests_customer_map_url_check;

alter table public.installation_requests
  add constraint installation_requests_customer_map_url_check
  check (
    customer_map_url is null
    or customer_map_url ~* '^https://(maps\.app\.goo\.gl/|maps\.google\.com/|((www\.)?google\.com)/maps/|goo\.gl/maps/)'
  );

comment on column public.installation_requests.customer_map_url is
  'Optional Google Maps share URL for the customer installation location.';

create or replace function public.create_installation_request_with_services(
  p_customer_id uuid,
  p_quotation_id uuid,
  p_representative_id uuid,
  p_neighborhood_id uuid,
  p_priority text,
  p_installation_address text,
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
begin
  if not public.has_screen_permission('installationRequestNew','add') then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_map_url is not null and v_map_url !~* '^https://(maps\.app\.goo\.gl/|maps\.google\.com/|((www\.)?google\.com)/maps/|goo\.gl/maps/)' then
    raise exception 'Invalid Google Maps URL' using errcode='23514';
  end if;

  if p_services is null or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 then
    raise exception 'At least one service is required' using errcode='23514';
  end if;

  insert into public.installation_requests(
    customer_id,quotation_id,representative_id,neighborhood_id,status,priority,
    installation_address,customer_map_url,notes,scheduled_date,time_slot
  ) values (
    p_customer_id,p_quotation_id,p_representative_id,p_neighborhood_id,
    'بانتظار المراجعة',p_priority,p_installation_address,v_map_url,p_notes,null,null
  ) returning installation_requests.id,installation_requests.request_number
    into v_request_id,v_request_number;

  insert into public.installation_request_services(
    installation_request_id,service_type_id,quantity,unit_price
  )
  select v_request_id,x.service_type_id,x.quantity,x.unit_price
  from jsonb_to_recordset(p_services)
    as x(service_type_id uuid,quantity integer,unit_price numeric);

  if not exists(
    select 1 from public.installation_request_services
    where installation_request_id=v_request_id
  ) then
    raise exception 'At least one valid service is required' using errcode='23514';
  end if;

  return query select v_request_id,v_request_number;
end;
$$;

grant execute on function public.create_installation_request_with_services(
  uuid,uuid,uuid,uuid,text,text,text,text,jsonb
) to authenticated;

commit;
