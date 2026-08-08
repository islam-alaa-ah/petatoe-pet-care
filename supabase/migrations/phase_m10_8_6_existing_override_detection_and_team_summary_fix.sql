-- Phase M10.8.6 — Previously imported override detection + team summary RPC type fix
begin;

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
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated user is required';
  end if;

  if public.current_user_role() not in ('super_admin','sales_manager') then
    raise exception 'Manager access is required';
  end if;

  return query
  with eligible_users as (
    select
      up.id::uuid as id,
      up.full_name::text as full_name,
      up.email::text as email,
      up.role::text as role,
      sr.full_name::text as representative_name
    from public.user_profiles up
    left join public.sales_representatives sr on sr.id = up.representative_id
    where coalesce(up.is_active, true) = true
      and up.role::text in ('super_admin','sales_manager','sales_representative')
  ), suggestion_totals as (
    select
      s.user_id::uuid as user_id,
      count(*) filter (where s.customer_type = 'شركة' and s.status = 'active')::integer as company_active,
      count(*) filter (where s.customer_type = 'شركة' and s.status = 'completed')::integer as company_completed,
      count(*) filter (where s.customer_type = 'فردي' and s.status = 'active')::integer as individual_active,
      count(*) filter (where s.customer_type = 'فردي' and s.status = 'completed')::integer as individual_completed,
      max(s.completed_at)::timestamptz as last_completed_at
    from public.daily_customer_suggestions s
    where s.suggestion_date = p_suggestion_date
    group by s.user_id
  )
  select
    eu.id::uuid,
    eu.full_name::text,
    eu.email::text,
    eu.role::text,
    eu.representative_name::text,
    coalesce(st.company_active, 0)::integer,
    coalesce(st.company_completed, 0)::integer,
    coalesce(st.individual_active, 0)::integer,
    coalesce(st.individual_completed, 0)::integer,
    (coalesce(st.company_active, 0) + coalesce(st.individual_active, 0))::integer,
    (coalesce(st.company_completed, 0) + coalesce(st.individual_completed, 0))::integer,
    least(100, round(
      ((coalesce(st.company_completed, 0) + coalesce(st.individual_completed, 0))::numeric / 20) * 100
    )::integer)::integer,
    st.last_completed_at::timestamptz
  from eligible_users eu
  left join suggestion_totals st on st.user_id = eu.id
  order by
    coalesce(st.company_completed, 0) + coalesce(st.individual_completed, 0) desc,
    eu.full_name asc;
end;
$$;

grant execute on function public.get_daily_customer_suggestions_team_summary(date) to authenticated;

commit;
