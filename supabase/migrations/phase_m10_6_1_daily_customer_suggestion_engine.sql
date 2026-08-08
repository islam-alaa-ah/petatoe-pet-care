-- KYUM CRM Phase M10.6.1 — Daily Customer Suggestion Engine
-- Creates a persisted, per-user daily list: 10 companies + 10 individuals.
-- Re-running this migration is safe.

begin;

create table if not exists public.daily_customer_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggestion_date date not null,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_type text not null check (customer_type in ('شركة','فردي')),
  sequence_no integer not null check (sequence_no > 0),
  status text not null default 'active' check (status in ('active','completed')),
  generated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_followup_id uuid references public.customer_followups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (suggestion_date, user_id, customer_id),
  unique (suggestion_date, user_id, customer_type, sequence_no)
);

create index if not exists idx_daily_customer_suggestions_user_day_status
  on public.daily_customer_suggestions(user_id, suggestion_date desc, status, customer_type);

create index if not exists idx_daily_customer_suggestions_customer_day
  on public.daily_customer_suggestions(customer_id, suggestion_date desc);

create or replace function public.set_daily_customer_suggestions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_daily_customer_suggestions_updated_at
  on public.daily_customer_suggestions;
create trigger trg_daily_customer_suggestions_updated_at
before update on public.daily_customer_suggestions
for each row execute function public.set_daily_customer_suggestions_updated_at();

alter table public.daily_customer_suggestions enable row level security;

drop policy if exists "daily suggestions own or manager read" on public.daily_customer_suggestions;
create policy "daily suggestions own or manager read"
on public.daily_customer_suggestions
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() in ('super_admin','sales_manager')
);

drop policy if exists "daily suggestions own update" on public.daily_customer_suggestions;
create policy "daily suggestions own update"
on public.daily_customer_suggestions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Internal generator. It keeps each active category at 10 whenever enough eligible customers exist.
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
  v_type text;
  v_missing integer;
  v_next_sequence integer;
  v_inserted integer := 0;
  v_rows integer;
begin
  if p_user_id is null then
    raise exception 'User is required';
  end if;

  -- A user may generate only their own list. Managers can replenish another user's list.
  if auth.uid() is distinct from p_user_id
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
        and public.can_access_representative(c.representative_id)
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

-- Public entry point used on the first Daily Operations load of each business day.
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
  return public.replenish_daily_customer_suggestions(p_user_id, p_suggestion_date);
end;
$$;

-- Returns the stable active list, enriched with customer/representative/latest quotation data.
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

-- Called after a follow-up is saved as "تم التواصل". It completes the item and promotes the next candidate.
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

  if v_user_id is null then
    raise exception 'Suggestion not found';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'Only the suggestion owner can complete it';
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
      completed_followup_id = p_followup_id
  where id = p_suggestion_id
    and status = 'active';

  return public.replenish_daily_customer_suggestions(v_user_id, v_date);
end;
$$;

grant select on public.daily_customer_suggestions to authenticated;
grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated;
grant execute on function public.ensure_daily_customer_suggestions(date,uuid) to authenticated;
grant execute on function public.get_daily_customer_suggestions(date,uuid) to authenticated;
grant execute on function public.complete_daily_customer_suggestion(uuid,uuid) to authenticated;

commit;
