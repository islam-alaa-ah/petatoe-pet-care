-- PETATOE P5.11.5.1 — Daily Suggestions Unified Cycle Recovery
-- One unified customer pool, 20 active suggestions, no company/individual split,
-- no representative visibility gate, and no repeat before every customer has
-- appeared once in the current suggestion cycle.

begin;

-- ---------------------------------------------------------------------------
-- 1) Schema compatibility: customer_type is legacy-only; cycle_no is canonical.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Unified replenishment.
--    - Keeps up to 20 active rows for the requested day.
--    - A customer is never repeated in the same cycle.
--    - A new cycle starts only when every current customer has appeared in the
--      previous cycle at least once.
--    - Customers contacted on the requested day never reappear that same day.
--    - representative_id and customer_type are not selection gates.
-- ---------------------------------------------------------------------------
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

  -- At most two cycle transitions can be useful in one call. The extra guard
  -- prevents accidental looping when the total customer population is < 20.
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

    -- If every current customer has appeared in this cycle, candidates now
    -- belong to the next cycle. New customers added mid-cycle automatically
    -- keep the current cycle open because they are not present in its history.
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

-- Keep the existing public signature for runtime compatibility. customer_type
-- remains in the result only as a legacy compatibility column and is NULL.
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

-- Preserve the historical return signature so existing runtime and reports do
-- not break. Company/individual fields are now compatibility zeros only.
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
  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  return query
  with eligible as (
    select up.id,up.full_name,up.email,up.role::text role_name,sr.full_name representative_name
    from public.user_profiles up
    left join public.sales_representatives sr on sr.id=up.representative_id
    left join public.role_screen_permissions rsp
      on rsp.role = up.role and rsp.screen_key = 'dailyOperations'
    where coalesce(up.is_active,true)
      and coalesce(rsp.can_view,false)
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
    coalesce(t.total_active,0),coalesce(t.total_completed,0),
    least(100,round((coalesce(t.total_completed,0)::numeric/20)*100)::integer),
    t.last_completed_at
  from eligible e
  left join totals t on t.user_id=e.id
  order by coalesce(t.total_completed,0) desc,e.full_name;
end;
$$;

-- Completion keeps the existing audited follow-up requirement, removes the
-- customer from the active list, then promotes the next unseen candidate.
create or replace function public.complete_daily_customer_suggestion(
  p_suggestion_id uuid,
  p_followup_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_date date;
  v_customer_id uuid;
  v_followup_customer_id uuid;
begin
  select s.user_id, s.suggestion_date, s.customer_id
    into v_user_id, v_date, v_customer_id
  from public.daily_customer_suggestions s
  where s.id = p_suggestion_id
  for update;

  if v_user_id is null then raise exception 'Suggestion not found'; end if;
  if v_user_id <> auth.uid() then raise exception 'Only the suggestion owner can complete it'; end if;
  if not public.has_screen_permission('dailyOperations','view') then
    raise exception 'Permission denied: dailyOperations.view';
  end if;

  select f.customer_id
    into v_followup_customer_id
  from public.customer_followups f
  where f.id = p_followup_id
    and f.created_by = auth.uid();

  if v_followup_customer_id is null or v_followup_customer_id <> v_customer_id then
    raise exception 'Follow-up does not belong to the suggested customer';
  end if;

  update public.daily_customer_suggestions
  set status = 'completed',
      completed_at = now(),
      completed_followup_id = p_followup_id,
      updated_at = now()
  where id = p_suggestion_id
    and status = 'active';

  return public.replenish_daily_customer_suggestions(v_user_id, v_date);
end;
$$;

revoke all on function public.replenish_daily_customer_suggestions(uuid,date) from public,anon;
revoke all on function public.get_daily_customer_suggestions(date,uuid) from public,anon;
revoke all on function public.get_daily_customer_suggestions_team_summary(date) from public,anon;
revoke all on function public.complete_daily_customer_suggestion(uuid,uuid) from public,anon;
grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions(date,uuid) to authenticated,service_role;
grant execute on function public.get_daily_customer_suggestions_team_summary(date) to authenticated,service_role;
grant execute on function public.complete_daily_customer_suggestion(uuid,uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
