-- PETATOE P5.12.8 — Daily Suggestions Runtime Definition Recovery
-- Reasserts the canonical unified suggestion pool at database runtime.
-- Customers are eligible regardless of representative assignment.
-- This migration intentionally changes only the daily-suggestions generator/read RPCs.

begin;

-- Compatibility for databases that did not fully receive P5.11.5.1.
alter table public.daily_customer_suggestions
  alter column customer_type drop not null;

alter table public.daily_customer_suggestions
  add column if not exists cycle_no integer not null default 1;

update public.daily_customer_suggestions
set cycle_no = 1
where cycle_no is null or cycle_no < 1;

create index if not exists idx_daily_customer_suggestions_user_cycle_customer
  on public.daily_customer_suggestions(user_id, cycle_no, customer_id);

create index if not exists idx_daily_customer_suggestions_user_day_sequence
  on public.daily_customer_suggestions(user_id, suggestion_date, sequence_no);

-- Canonical unified replenishment:
-- - One customer pool (no company/individual split).
-- - 20 active suggestions per user/day when enough eligible customers exist.
-- - No representative visibility/ownership gate.
-- - No repeat within the same cycle.
-- - Customers contacted on the requested day stay excluded for that day.
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
  v_active integer := 0;
  v_missing integer := 0;
  v_cycle integer := 1;
  v_total_customers integer := 0;
  v_shown_in_cycle integer := 0;
  v_next_sequence integer := 1;
  v_inserted integer := 0;
  v_rows integer := 0;
  v_attempt integer := 0;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  if v_actor_id is null then raise exception 'Authenticated user is required'; end if;

  if v_actor_id is distinct from p_user_id then
    raise exception 'Suggestions may only be generated for the current user';
  end if;

  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  if not exists(
    select 1 from public.user_profiles up
    where up.id = p_user_id and coalesce(up.is_active,true)
  ) then
    raise exception 'Target user was not found or is inactive';
  end if;

  select count(*)::integer into v_total_customers
  from public.customers;

  if v_total_customers = 0 then return 0; end if;

  select count(*)::integer into v_active
  from public.daily_customer_suggestions s
  where s.user_id = p_user_id
    and s.suggestion_date = p_suggestion_date
    and s.status = 'active';

  v_missing := greatest(20 - v_active, 0);
  if v_missing = 0 then return 0; end if;

  while v_missing > 0 and v_attempt < 4 loop
    v_attempt := v_attempt + 1;

    select coalesce(max(s.cycle_no), 1)::integer
      into v_cycle
    from public.daily_customer_suggestions s
    where s.user_id = p_user_id;

    select count(distinct s.customer_id)::integer
      into v_shown_in_cycle
    from public.daily_customer_suggestions s
    where s.user_id = p_user_id
      and s.cycle_no = v_cycle;

    if v_shown_in_cycle >= v_total_customers then
      v_cycle := v_cycle + 1;
    end if;

    select coalesce(max(s.sequence_no), 0) + 1
      into v_next_sequence
    from public.daily_customer_suggestions s
    where s.user_id = p_user_id
      and s.suggestion_date = p_suggestion_date;

    with eligible as (
      select
        c.id,
        row_number() over (
          order by
            case when last_followup.last_contact_date is null then 0 else 1 end,
            last_followup.last_contact_date asc nulls first,
            c.created_at asc,
            c.customer_number asc,
            c.id asc
        ) as rn
      from public.customers c
      left join lateral (
        select max(f.contact_date) as last_contact_date
        from public.customer_followups f
        where f.customer_id = c.id
      ) last_followup on true
      where not exists (
        select 1
        from public.daily_customer_suggestions history
        where history.user_id = p_user_id
          and history.cycle_no = v_cycle
          and history.customer_id = c.id
      )
      and not exists (
        select 1
        from public.daily_customer_suggestions same_day
        where same_day.user_id = p_user_id
          and same_day.suggestion_date = p_suggestion_date
          and same_day.customer_id = c.id
      )
      and not exists (
        select 1
        from public.customer_followups contacted_today
        where contacted_today.customer_id = c.id
          and contacted_today.contact_date = p_suggestion_date
      )
      limit v_missing
    )
    insert into public.daily_customer_suggestions(
      suggestion_date,
      user_id,
      customer_id,
      customer_type,
      sequence_no,
      status,
      cycle_no
    )
    select
      p_suggestion_date,
      p_user_id,
      e.id,
      null,
      v_next_sequence + e.rn - 1,
      'active',
      v_cycle
    from eligible e
    on conflict (suggestion_date, user_id, customer_id) do nothing;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
    v_missing := greatest(v_missing - v_rows, 0);

    if v_rows = 0 then
      exit;
    end if;
  end loop;

  return v_inserted;
end;
$$;

-- Preserve the existing public return signature. Representative information is
-- display metadata only and never participates in customer eligibility.
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
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception 'User is required';
  end if;
  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  perform public.replenish_daily_customer_suggestions(p_user_id,p_suggestion_date);

  return query
  select
    s.id,
    s.suggestion_date,
    null::text,
    s.sequence_no,
    s.status,
    c.id,
    c.customer_number,
    c.customer_name,
    c.phone,
    null::text,
    (
      select max(f.contact_date)
      from public.customer_followups f
      where f.customer_id = c.id
    ),
    coalesce(q.representative_id, f_last.representative_id),
    coalesce(q.representative_name, f_last.representative_name),
    q.quotation_number,
    q.quotation_date
  from public.daily_customer_suggestions s
  join public.customers c on c.id = s.customer_id
  left join lateral (
    select qq.representative_id, sr.full_name representative_name,
           qq.quotation_number, qq.quotation_date
    from public.quotations qq
    left join public.sales_representatives sr on sr.id = qq.representative_id
    where qq.customer_id = c.id
    order by qq.quotation_date desc, qq.created_at desc, qq.id desc
    limit 1
  ) q on true
  left join lateral (
    select f.representative_id, sr.full_name representative_name
    from public.customer_followups f
    left join public.sales_representatives sr on sr.id = f.representative_id
    where f.customer_id = c.id
    order by f.contact_date desc, f.created_at desc, f.id desc
    limit 1
  ) f_last on true
  where s.user_id = p_user_id
    and s.suggestion_date = p_suggestion_date
    and s.status = 'active'
  order by s.sequence_no;
end;
$$;

revoke all on function public.replenish_daily_customer_suggestions(uuid,date) from public,anon;
revoke all on function public.get_daily_customer_suggestions(date,uuid) from public,anon;
grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions(date,uuid) to authenticated,service_role;

-- Deployment guard: fail the migration if the runtime generator still contains
-- the legacy representative access gate after CREATE OR REPLACE.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.replenish_daily_customer_suggestions(uuid,date)'::regprocedure)
    into v_definition;

  if position('can_user_access_representative' in lower(v_definition)) > 0 then
    raise exception 'P5.12.8 verification failed: legacy representative gate is still present';
  end if;

  if position('from public.customers' in lower(v_definition)) = 0 then
    raise exception 'P5.12.8 verification failed: unified customers pool was not installed';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
