-- Phase M10.4 — Global customer phone ownership lookup with scope-safe disclosure.
-- Safe to re-run. This function deliberately returns only minimal ownership data
-- for customers outside the current user's allowed data scope.

begin;

create or replace function public.check_customer_phone_ownership(
  p_normalized_phone text,
  p_exclude_customer_id uuid default null
)
returns table (
  phone_exists boolean,
  customer_id uuid,
  customer_name text,
  customer_type text,
  contact_person_name text,
  representative_id uuid,
  representative_name text,
  can_access boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_representative_name text;
  v_can_access boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if coalesce(p_normalized_phone, '') !~ '^05[0-9]{8}$' then
    return query select false, null::uuid, null::text, null::text, null::text,
      null::uuid, null::text, false;
    return;
  end if;

  select c.*
    into v_customer
  from public.customers c
  where c.normalized_phone = p_normalized_phone
    and (p_exclude_customer_id is null or c.id <> p_exclude_customer_id)
  order by c.created_at asc
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::text, null::text,
      null::uuid, null::text, false;
    return;
  end if;

  select sr.full_name
    into v_representative_name
  from public.sales_representatives sr
  where sr.id = v_customer.representative_id;

  v_can_access := public.has_screen_permission('customers', 'view')
    and public.can_access_representative(v_customer.representative_id);

  return query
  select
    true,
    case when v_can_access then v_customer.id else null::uuid end,
    v_customer.customer_name::text,
    case when v_can_access then v_customer.customer_type else null::text end,
    case when v_can_access then v_customer.contact_person_name else null::text end,
    case when v_can_access then v_customer.representative_id else null::uuid end,
    coalesce(v_representative_name, '')::text,
    v_can_access;
end;
$$;

revoke all on function public.check_customer_phone_ownership(text, uuid) from public;
grant execute on function public.check_customer_phone_ownership(text, uuid) to authenticated;

comment on function public.check_customer_phone_ownership(text, uuid) is
'Checks normalized customer phone ownership globally while exposing full record identity only when the authenticated user can access that representative scope.';

commit;
