-- KYUM CRM Phase M10.6.1.1 — Explicit User Execution Fix
-- Fixes SQL Editor execution where auth.uid() is NULL while preserving authenticated access controls.
-- Run after Phase M10.6.1.

begin;

-- Evaluates the target user's configured representative scope instead of the caller's scope.
create or replace function public.can_user_access_representative(
  p_user_id uuid,
  p_representative_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target_user as (
    select
      up.id,
      up.role,
      up.representative_id,
      coalesce(
        dap.access_mode,
        case
          when up.role in ('super_admin','sales_manager','viewer') then 'all'
          when up.representative_id is not null then 'own'
          else 'selected'
        end
      ) as access_mode
    from public.user_profiles up
    left join public.user_data_access_profiles dap on dap.user_id = up.id
    where up.id = p_user_id
  )
  select coalesce((
    select case
      when tu.role = 'super_admin' then true
      when tu.access_mode = 'all' then true
      when p_representative_id is null then false
      when p_representative_id = tu.representative_id then true
      when tu.access_mode = 'selected' then exists (
        select 1
        from public.user_data_access_representatives ar
        where ar.user_id = tu.id
          and ar.representative_id = p_representative_id
      )
      else false
    end
    from target_user tu
  ), false);
$$;

-- Internal generator with explicit target user support.
create or replace function public.replenish_daily_customer_suggestions(
  p_user_id uuid,
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_type text;
  v_missing integer;
  v_next_sequence integer;
  v_inserted integer := 0;
  v_rows integer;
begin
  if p_user_id is null then
    raise exception 'User is required';
  end if;

  if not exists (select 1 from public.user_profiles up where up.id = p_user_id) then
    raise exception 'Target user was not found';
  end if;

  -- App calls: own list, or manager-authorized target list.
  -- SQL Editor/service execution: auth.uid() is NULL, so an explicit existing user is required.
  if v_actor_id is not null
     and v_actor_id is distinct from p_user_id
     and public.current_user_role() not in ('super_admin','sales_manager') then
    raise exception 'Not allowed to generate suggestions for this user';
  end if;

  foreach v_type in array array['شركة'::text, 'فردي'::text]
  loop
    select greatest(10 - count(*), 0)::integer
      into v_missing
    from public.daily_customer_suggestions s
    where s.user_id = p_user_id
      and s.suggestion_date = p_suggestion_date
      and s.customer_type = v_type
      and s.status = 'active';

    if v_missing = 0 then
      continue;
    end if;

    select coalesce(max(s.sequence_no), 0) + 1
      into v_next_sequence
    from public.daily_customer_suggestions s
    where s.user_id = p_user_id
      and s.suggestion_date = p_suggestion_date
      and s.customer_type = v_type;

    with eligible as (
      select
        c.id,
        row_number() over (
          order by
            case when c.last_contact_date is null then 0 else 1 end,
            c.last_contact_date asc nulls first,
            c.created_at asc,
            c.customer_number asc,
            c.id asc
        ) as rn
      from public.customers c
      where c.customer_type = v_type
        and public.can_user_access_representative(p_user_id, c.representative_id)
        and not exists (
          select 1
          from public.daily_customer_suggestions existing
          where existing.user_id = p_user_id
            and existing.suggestion_date = p_suggestion_date
            and existing.customer_id = c.id
        )
        and not exists (
          select 1
          from public.customer_followups f
          where f.customer_id = c.id
            and f.contact_date = p_suggestion_date
        )
      limit v_missing
    )
    insert into public.daily_customer_suggestions (
      suggestion_date, user_id, customer_id, customer_type, sequence_no, status
    )
    select
      p_suggestion_date,
      p_user_id,
      e.id,
      v_type,
      v_next_sequence + e.rn - 1,
      'active'
    from eligible e
    on conflict do nothing;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  return v_inserted;
end;
$$;

-- Explicit p_user_id can now be supplied from SQL Editor.
-- Existing application calls remain compatible because the defaults are unchanged.
create or replace function public.ensure_daily_customer_suggestions(
  p_suggestion_date date default ((now() at time zone 'Asia/Riyadh')::date),
  p_user_id uuid default auth.uid()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'User is required. Pass p_user_id explicitly when running from SQL Editor.';
  end if;

  return public.replenish_daily_customer_suggestions(p_user_id, p_suggestion_date);
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
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'User is required. Pass p_user_id explicitly when running from SQL Editor.';
  end if;

  perform public.replenish_daily_customer_suggestions(p_user_id, p_suggestion_date);

  return query
  select
    s.id,
    s.suggestion_date,
    s.customer_type,
    s.sequence_no,
    s.status,
    c.id,
    c.customer_number,
    c.customer_name,
    c.phone,
    c.contact_person_name,
    c.last_contact_date,
    c.representative_id,
    r.full_name,
    q.quotation_number,
    q.quotation_date
  from public.daily_customer_suggestions s
  join public.customers c on c.id = s.customer_id
  left join public.sales_representatives r on r.id = c.representative_id
  left join lateral (
    select qq.quotation_number, qq.quotation_date
    from public.quotations qq
    where qq.customer_id = c.id
    order by qq.quotation_date desc, qq.created_at desc, qq.id desc
    limit 1
  ) q on true
  where s.user_id = p_user_id
    and s.suggestion_date = p_suggestion_date
    and s.status = 'active'
  order by
    case when s.customer_type = 'شركة' then 1 else 2 end,
    s.sequence_no;
end;
$$;

grant execute on function public.can_user_access_representative(uuid,uuid) to authenticated;
grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated;
grant execute on function public.ensure_daily_customer_suggestions(date,uuid) to authenticated;
grant execute on function public.get_daily_customer_suggestions(date,uuid) to authenticated;

commit;
