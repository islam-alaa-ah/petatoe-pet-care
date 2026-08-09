-- PETATOE P4 — Canonical Customer Master
-- Customer master is reduced to: code | name | address | mobile.
-- Legacy columns are retained physically only as NULL compatibility columns
-- so existing FK/views/triggers are not broken. Runtime writes are forcibly sanitized.
-- No operational follow-up/contract/appointment fields are removed from their own tables.

begin;

-- ============================================================
-- 1) Customer master contract
-- ============================================================

alter table public.customers
  alter column customer_type drop not null;

-- Remove legacy customer-master values. Operational history in followups,
-- quotations and appointments is NOT touched.
delete from public.customer_interests;

update public.customers
set
  customer_type = null,
  secondary_phone = null,
  email = null,
  region = null,
  city = null,
  district = null,
  contact_person_name = null,
  contact_person_title = null,
  representative_id = null,
  last_contact_date = null,
  quotation_number = null,
  no_sale_reason_id = null,
  notes = null;

create or replace function public.sanitize_customer_master_v2()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  -- Canonical customer master:
  -- customer_number = code
  -- customer_name   = name
  -- address         = address
  -- phone           = mobile
  new.customer_type := null;
  new.secondary_phone := null;
  new.email := null;
  new.region := null;
  new.city := null;
  new.district := null;
  new.contact_person_name := null;
  new.contact_person_title := null;
  new.representative_id := null;
  new.last_contact_date := null;
  new.quotation_number := null;
  new.no_sale_reason_id := null;
  new.notes := null;
  return new;
end;
$$;

drop trigger if exists trg_sanitize_customer_master_v2 on public.customers;
create trigger trg_sanitize_customer_master_v2
before insert or update on public.customers
for each row execute function public.sanitize_customer_master_v2();

-- ============================================================
-- 2) Customer access is no longer representative-owned
-- ============================================================

create or replace function public.can_read_customer_identity()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select auth.uid() is not null and (
    public.has_screen_permission('customers','view')
    or public.has_screen_permission('followups','view')
    or public.has_screen_permission('quotations','view')
    or public.has_screen_permission('installationRequestNew','view')
    or public.has_screen_permission('installationRequests','view')
    or public.has_screen_permission('installationSchedule','view')
    or public.has_screen_permission('installationExecution','view')
    or public.has_screen_permission('installationCompletion','view')
    or public.has_screen_permission('salesInvoices','view')
  )
$$;

revoke all on function public.can_read_customer_identity() from public,anon;
grant execute on function public.can_read_customer_identity() to authenticated,service_role;

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.can_read_customer_identity()
    and exists(select 1 from public.customers c where c.id=p_customer_id)
$$;

revoke all on function public.can_access_customer(uuid) from public,anon;
grant execute on function public.can_access_customer(uuid) to authenticated,service_role;

-- Remove every existing policy on customers so no legacy representative-based
-- policy can hide or broaden the canonical master unexpectedly.
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname='public' and tablename='customers'
  loop
    execute format('drop policy if exists %I on public.customers',p.policyname);
  end loop;
end $$;

create policy "customers canonical identity select"
on public.customers for select to authenticated
using(public.can_read_customer_identity());

create policy "customers canonical insert"
on public.customers for insert to authenticated
with check(public.has_screen_permission('customers','add'));

create policy "customers canonical update"
on public.customers for update to authenticated
using(public.has_screen_permission('customers','edit'))
with check(public.has_screen_permission('customers','edit'));

create policy "customers canonical delete"
on public.customers for delete to authenticated
using(public.has_screen_permission('customers','delete'));

-- Customer interests are retired from the customer master.
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname='public' and tablename='customer_interests'
  loop
    execute format('drop policy if exists %I on public.customer_interests',p.policyname);
  end loop;
end $$;

revoke insert,update,delete on public.customer_interests from authenticated;
grant select on public.customer_interests to authenticated;

create policy "customer interests retired empty read"
on public.customer_interests for select to authenticated
using(false);

-- ============================================================
-- 3) Phone uniqueness lookup: preserve RPC signature, remove legacy disclosure
-- ============================================================

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
set search_path=public
as $$
declare
  v_customer_id uuid;
  v_customer_name text;
  v_can_access boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if coalesce(p_normalized_phone,'') !~ '^05[0-9]{8}$' then
    return query select false,null::uuid,null::text,null::text,null::text,null::uuid,null::text,false;
    return;
  end if;

  select c.id,c.customer_name
  into v_customer_id,v_customer_name
  from public.customers c
  where c.normalized_phone=p_normalized_phone
    and (p_exclude_customer_id is null or c.id<>p_exclude_customer_id)
  order by c.created_at,c.id
  limit 1;

  if not found then
    return query select false,null::uuid,null::text,null::text,null::text,null::uuid,null::text,false;
    return;
  end if;

  v_can_access := public.can_read_customer_identity();

  return query select
    true,
    case when v_can_access then v_customer_id else null::uuid end,
    v_customer_name,
    null::text,
    null::text,
    null::uuid,
    null::text,
    v_can_access;
end;
$$;

revoke all on function public.check_customer_phone_ownership(text,uuid) from public,anon;
grant execute on function public.check_customer_phone_ownership(text,uuid) to authenticated,service_role;

-- ============================================================
-- 4) Appointments no longer inherit a sales representative from customer master
-- ============================================================

create or replace function public.installation_request_effective_representative(
  p_customer_id uuid,
  p_request_representative_id uuid
)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select p_request_representative_id
$$;

revoke all on function public.installation_request_effective_representative(uuid,uuid) from public,anon;
grant execute on function public.installation_request_effective_representative(uuid,uuid) to authenticated,service_role;

create or replace function public.validate_installation_request_links()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.quotation_id is not null then
    if not exists(
      select 1 from public.quotations q
      where q.id=new.quotation_id and q.customer_id=new.customer_id
    ) then
      raise exception 'Contract does not belong to the selected customer' using errcode='23514';
    end if;

    if new.representative_id is null then
      select q.representative_id
      into new.representative_id
      from public.quotations q
      where q.id=new.quotation_id;
    end if;
  end if;

  if new.representative_id is null then
    new.representative_id := public.current_representative_id();
  end if;

  return new;
end;
$$;

create or replace function public.sync_installation_request_representative()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.representative_id is null and new.quotation_id is not null then
    select q.representative_id into new.representative_id
    from public.quotations q where q.id=new.quotation_id;
  end if;
  if new.representative_id is null then
    new.representative_id := public.current_representative_id();
  end if;
  return new;
end;
$$;

-- ============================================================
-- 5) Daily customer suggestions: generic customers, no company/individual logic
-- ============================================================

alter table public.daily_customer_suggestions
  alter column customer_type drop not null;

update public.daily_customer_suggestions
set customer_type=null
where customer_type is not null;

create or replace function public.replenish_daily_customer_suggestions(
  p_user_id uuid,
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date)
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor_id uuid:=auth.uid();
  v_rep_id uuid;
  v_missing integer;
  v_next_sequence integer;
  v_inserted integer:=0;
begin
  if p_user_id is null then raise exception 'User is required'; end if;

  select up.representative_id into v_rep_id
  from public.user_profiles up
  where up.id=p_user_id and coalesce(up.is_active,true);

  if not found then raise exception 'Target user was not found or is inactive'; end if;

  if v_actor_id is not null
     and v_actor_id is distinct from p_user_id
     and public.current_user_role() not in('super_admin','sales_manager') then
    raise exception 'Not allowed to generate suggestions for this user';
  end if;

  if v_rep_id is null then return 0; end if;

  select greatest(20-count(*),0)::integer into v_missing
  from public.daily_customer_suggestions s
  where s.user_id=p_user_id
    and s.suggestion_date=p_suggestion_date
    and s.status='active';

  if v_missing=0 then return 0; end if;

  select coalesce(max(sequence_no),0)+1 into v_next_sequence
  from public.daily_customer_suggestions
  where user_id=p_user_id and suggestion_date=p_suggestion_date;

  with eligible as (
    select c.id,
           row_number() over(
             order by
               coalesce((
                 select max(f.contact_date)
                 from public.customer_followups f
                 where f.customer_id=c.id and f.representative_id=v_rep_id
               ),date '1900-01-01') asc,
               c.created_at asc,c.customer_number asc,c.id asc
           ) rn
    from public.customers c
    where (
      exists(
        select 1 from public.customer_followups f
        where f.customer_id=c.id and f.representative_id=v_rep_id
      )
      or exists(
        select 1 from public.quotations q
        where q.customer_id=c.id and q.representative_id=v_rep_id
      )
    )
    and not exists(
      select 1 from public.daily_customer_suggestions s
      where s.user_id=p_user_id
        and s.suggestion_date=p_suggestion_date
        and s.customer_id=c.id
    )
    and not exists(
      select 1 from public.customer_followups f
      where f.customer_id=c.id
        and f.representative_id=v_rep_id
        and f.contact_date=p_suggestion_date
    )
    limit v_missing
  )
  insert into public.daily_customer_suggestions(
    suggestion_date,user_id,customer_id,customer_type,sequence_no,status
  )
  select p_suggestion_date,p_user_id,e.id,null,v_next_sequence+e.rn-1,'active'
  from eligible e
  on conflict do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$$;

create or replace function public.get_daily_customer_suggestions(
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date),
  p_user_id uuid default auth.uid()
)
returns table (
  suggestion_id uuid,
  suggestion_date date,
  customer_type text,
  sequence_no integer,
  status text,
  customer_id uuid,
  customer_number text,
  customer_name text,
  phone text,
  contact_person_name text,
  last_contact_date date,
  representative_id uuid,
  representative_name text,
  latest_quotation_number text,
  latest_quotation_date date
)
language plpgsql
security definer
set search_path=public
as $$
declare v_rep_id uuid;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  perform public.replenish_daily_customer_suggestions(p_user_id,p_suggestion_date);
  select up.representative_id into v_rep_id from public.user_profiles up where up.id=p_user_id;

  return query
  select
    s.id,s.suggestion_date,null::text,s.sequence_no,s.status,
    c.id,c.customer_number,c.customer_name,c.phone,
    null::text,
    (
      select max(f.contact_date)
      from public.customer_followups f
      where f.customer_id=c.id and (v_rep_id is null or f.representative_id=v_rep_id)
    ),
    v_rep_id,
    sr.full_name,
    q.quotation_number,
    q.quotation_date
  from public.daily_customer_suggestions s
  join public.customers c on c.id=s.customer_id
  left join public.sales_representatives sr on sr.id=v_rep_id
  left join lateral(
    select qq.quotation_number,qq.quotation_date
    from public.quotations qq
    where qq.customer_id=c.id
      and (v_rep_id is null or qq.representative_id=v_rep_id)
    order by qq.quotation_date desc,qq.created_at desc,qq.id desc
    limit 1
  ) q on true
  where s.user_id=p_user_id
    and s.suggestion_date=p_suggestion_date
    and s.status='active'
  order by s.sequence_no;
end;
$$;

create or replace function public.get_daily_customer_suggestions_team_summary(
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date)
)
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  user_role text,
  representative_name text,
  company_active integer,
  company_completed integer,
  individual_active integer,
  individual_completed integer,
  total_active integer,
  total_completed integer,
  completion_percent integer,
  last_completed_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authenticated user is required'; end if;
  if public.current_user_role() not in('super_admin','sales_manager') then
    raise exception 'Manager access is required';
  end if;

  return query
  with eligible as (
    select up.id,up.full_name,up.email,up.role::text role_name,sr.full_name representative_name
    from public.user_profiles up
    left join public.sales_representatives sr on sr.id=up.representative_id
    where coalesce(up.is_active,true)
      and up.role::text in('super_admin','sales_manager','sales_representative')
  ), totals as (
    select s.user_id,
      count(*) filter(where s.status='active')::integer total_active,
      count(*) filter(where s.status='completed')::integer total_completed,
      max(s.completed_at) last_completed_at
    from public.daily_customer_suggestions s
    where s.suggestion_date=p_suggestion_date
    group by s.user_id
  )
  select
    e.id,e.full_name,e.email,e.role_name,e.representative_name,
    0::integer,0::integer,0::integer,0::integer,
    coalesce(t.total_active,0),
    coalesce(t.total_completed,0),
    least(100,round((coalesce(t.total_completed,0)::numeric/20)*100)::integer),
    t.last_completed_at
  from eligible e
  left join totals t on t.user_id=e.id
  order by coalesce(t.total_completed,0) desc,e.full_name;
end;
$$;

revoke all on function public.replenish_daily_customer_suggestions(uuid,date) from public,anon;
revoke all on function public.get_daily_customer_suggestions(date,uuid) from public,anon;
revoke all on function public.get_daily_customer_suggestions_team_summary(date) from public,anon;
grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions(date,uuid) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions_team_summary(date) to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- ============================================================
-- Verification
-- ============================================================

select
  count(*)::bigint as customer_count,
  count(*) filter(where customer_type is not null)::bigint as legacy_type_rows,
  count(*) filter(where representative_id is not null)::bigint as legacy_customer_rep_rows,
  count(*) filter(where region is not null or city is not null or district is not null)::bigint as legacy_geo_rows,
  count(*) filter(where contact_person_name is not null or last_contact_date is not null or quotation_number is not null or no_sale_reason_id is not null or notes is not null)::bigint as legacy_metadata_rows
from public.customers;

select count(*)::bigint as customer_interest_rows from public.customer_interests;

select
  p.proname as function_name,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in(
    'can_read_customer_identity',
    'can_access_customer',
    'check_customer_phone_ownership',
    'replenish_daily_customer_suggestions',
    'get_daily_customer_suggestions',
    'get_daily_customer_suggestions_team_summary'
  )
order by p.proname;
