begin;

-- R44R14 — allow trip entry to resolve or create an independent SEA VIBE customer
-- without granting direct table writes or coupling to the CRM customer domain.
create or replace function public.ensure_sea_vibe_trip_customer_r44r14(
  p_customer_number text,
  p_full_name text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_number text:=btrim(coalesce(p_customer_number,''));
  v_name text:=btrim(coalesce(p_full_name,''));
  v_customer public.sea_vibe_customers%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not (
    public.has_screen_permission('seaVibeTripNew','add')
    or public.has_screen_permission('seaVibeTrips','add')
    or public.has_screen_permission('seaVibeTrips','edit')
    or public.has_screen_permission('seaVibeCustomers','add')
  ) then raise exception 'permission_denied'; end if;
  if v_number='' then raise exception 'SEA_VIBE_CUSTOMER_NUMBER_REQUIRED'; end if;
  if v_name='' then raise exception 'SEA_VIBE_CUSTOMER_NAME_REQUIRED'; end if;

  select * into v_customer
  from public.sea_vibe_customers
  where lower(btrim(customer_number))=lower(v_number)
  for update;

  if found then
    if lower(btrim(v_customer.full_name))<>lower(v_name) then
      raise exception 'SEA_VIBE_CUSTOMER_NUMBER_NAME_MISMATCH';
    end if;
    if not v_customer.is_active then
      raise exception 'SEA_VIBE_CUSTOMER_INACTIVE';
    end if;
    return jsonb_build_object('id',v_customer.id,'created',false,'customerNumber',v_customer.customer_number,'fullName',v_customer.full_name);
  end if;

  insert into public.sea_vibe_customers(customer_number,full_name,is_active,created_by,updated_by)
  values(v_number,v_name,true,auth.uid(),auth.uid())
  returning * into v_customer;

  return jsonb_build_object('id',v_customer.id,'created',true,'customerNumber',v_customer.customer_number,'fullName',v_customer.full_name);
exception
  when unique_violation then
    select * into v_customer
    from public.sea_vibe_customers
    where lower(btrim(customer_number))=lower(v_number);
    if not found then raise; end if;
    if lower(btrim(v_customer.full_name))<>lower(v_name) then
      raise exception 'SEA_VIBE_CUSTOMER_NUMBER_NAME_MISMATCH';
    end if;
    if not v_customer.is_active then
      raise exception 'SEA_VIBE_CUSTOMER_INACTIVE';
    end if;
    return jsonb_build_object('id',v_customer.id,'created',false,'customerNumber',v_customer.customer_number,'fullName',v_customer.full_name);
end;
$$;

revoke all on function public.ensure_sea_vibe_trip_customer_r44r14(text,text) from public,anon;
grant execute on function public.ensure_sea_vibe_trip_customer_r44r14(text,text) to authenticated;

comment on function public.ensure_sea_vibe_trip_customer_r44r14(text,text) is
'R44R14 trip-entry customer resolver. Reuses an active SEA VIBE customer by unique customer number or creates one for authorized trip entry. Fails closed on number/name mismatch or inactive customer.';

commit;
