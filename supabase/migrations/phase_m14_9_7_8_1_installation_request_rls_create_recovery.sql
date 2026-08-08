-- Phase M14.9.7.8.1 — Installation Request RLS Create Recovery
-- Restores authorized sales-representative creation without widening installation data visibility.
begin;

create or replace function public.resolve_installation_request_representative(
  p_customer_id uuid,
  p_requested_representative_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_representative_id uuid;
  v_current_representative_id uuid;
  v_resolved_representative_id uuid;
begin
  select c.representative_id
    into v_customer_representative_id
  from public.customers c
  where c.id = p_customer_id;

  if not found then
    raise exception 'Selected customer does not exist' using errcode = '23503';
  end if;

  select up.representative_id
    into v_current_representative_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active = true;

  -- The customer owner is authoritative. Only use the current sales representative
  -- as a safe fallback for legacy customers that have no representative assigned.
  v_resolved_representative_id := coalesce(
    v_customer_representative_id,
    p_requested_representative_id,
    v_current_representative_id
  );

  if v_resolved_representative_id is null then
    raise exception 'Customer has no sales representative and the current user is not linked to one'
      using errcode = '23514';
  end if;

  if p_requested_representative_id is not null
     and v_customer_representative_id is not null
     and p_requested_representative_id <> v_customer_representative_id then
    raise exception 'Requested representative does not own the selected customer'
      using errcode = '42501';
  end if;

  if not public.can_access_installation_representative(v_resolved_representative_id) then
    raise exception 'The selected customer is outside your installation representative scope'
      using errcode = '42501';
  end if;

  return v_resolved_representative_id;
end;
$$;

grant execute on function public.resolve_installation_request_representative(uuid, uuid) to authenticated;

-- Install one authoritative INSERT policy. BEFORE INSERT triggers run before the
-- WITH CHECK expression, but the RPC below resolves the representative explicitly
-- so both direct and RPC creation paths use the same ownership rule.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'installation_requests'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.installation_requests', p.policyname);
  end loop;
end $$;

create policy "installation requests canonical scoped insert"
on public.installation_requests
for insert
to authenticated
with check (
  public.has_screen_permission('installationRequestNew', 'add')
  and installation_team_id is null
  and representative_id is not null
  and representative_id = public.resolve_installation_request_representative(customer_id, representative_id)
);

-- Rebuild the transactional create RPC as SECURITY DEFINER. It performs explicit
-- action, customer, representative and quotation checks before writing the parent
-- and child rows. This prevents a child-row RLS dependency from failing merely
-- because the creator does not also own installationRequests.view.
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
returns table(id uuid, request_number text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_request_id uuid;
  v_request_number text;
  v_representative_id uuid;
  v_map_url text := nullif(btrim(coalesce(p_customer_map_url, '')), '');
  v_customer_order_number text := nullif(btrim(coalesce(p_customer_order_number, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.has_screen_permission('installationRequestNew', 'add') then
    raise exception 'You do not have permission to create installation requests'
      using errcode = '42501';
  end if;

  v_representative_id := public.resolve_installation_request_representative(
    p_customer_id,
    p_representative_id
  );

  if p_neighborhood_id is null
     or not exists (
       select 1
       from public.installation_neighborhoods n
       where n.id = p_neighborhood_id
         and coalesce(n.is_active, true) = true
     ) then
    raise exception 'Select an active installation neighborhood'
      using errcode = '23514';
  end if;

  if p_quotation_id is not null and not exists (
    select 1
    from public.quotations q
    where q.id = p_quotation_id
      and q.customer_id = p_customer_id
  ) then
    raise exception 'Quotation does not belong to the selected customer'
      using errcode = '23514';
  end if;

  if v_customer_order_number is not null
     and char_length(v_customer_order_number) > 120 then
    raise exception 'Customer order number is too long' using errcode = '23514';
  end if;

  if v_map_url is not null
     and v_map_url !~* '^https://(maps\.app\.goo\.gl/|maps\.google\.com/|((www\.)?google\.com)/maps/|goo\.gl/maps/)' then
    raise exception 'Invalid Google Maps URL' using errcode = '23514';
  end if;

  if p_services is null
     or jsonb_typeof(p_services) <> 'array'
     or jsonb_array_length(p_services) = 0 then
    raise exception 'At least one service is required' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_services)
      as x(service_type_id uuid, quantity integer, unit_price numeric)
    where x.service_type_id is null
       or x.quantity is null
       or x.quantity < 1
       or x.unit_price is null
       or x.unit_price < 0
       or not exists (
         select 1
         from public.installation_service_types st
         where st.id = x.service_type_id
           and coalesce(st.is_active, true) = true
       )
  ) then
    raise exception 'One or more installation service rows are invalid'
      using errcode = '23514';
  end if;

  insert into public.installation_requests (
    customer_id,
    quotation_id,
    representative_id,
    neighborhood_id,
    status,
    priority,
    installation_address,
    customer_order_number,
    customer_map_url,
    notes,
    scheduled_date,
    time_slot,
    installation_team_id,
    created_by
  ) values (
    p_customer_id,
    p_quotation_id,
    v_representative_id,
    p_neighborhood_id,
    'بانتظار المراجعة',
    coalesce(nullif(btrim(coalesce(p_priority, '')), ''), 'عادية'),
    nullif(btrim(coalesce(p_installation_address, '')), ''),
    v_customer_order_number,
    v_map_url,
    nullif(btrim(coalesce(p_notes, '')), ''),
    null,
    null,
    null,
    auth.uid()
  )
  returning installation_requests.id, installation_requests.request_number
    into v_request_id, v_request_number;

  insert into public.installation_request_services (
    installation_request_id,
    service_type_id,
    quantity,
    unit_price
  )
  select
    v_request_id,
    x.service_type_id,
    x.quantity,
    x.unit_price
  from jsonb_to_recordset(p_services)
    as x(service_type_id uuid, quantity integer, unit_price numeric);

  perform public.refresh_installation_request_totals(v_request_id);

  return query select v_request_id, v_request_number;
end;
$$;

revoke all on function public.create_installation_request_with_services(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb
) from public;

grant execute on function public.create_installation_request_with_services(
  uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb
) to authenticated;

commit;
