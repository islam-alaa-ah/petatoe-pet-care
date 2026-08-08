-- KYUM CRM Phase M10.6.11 — Account-Linked Daily Suggestions
-- Restricts each user's daily suggestion list to customers assigned to the
-- sales representative explicitly linked to that user account.
-- Existing manager team monitoring remains unchanged.

begin;

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
  v_linked_representative_id uuid;
  v_type text;
  v_missing integer;
  v_next_sequence integer;
  v_inserted integer := 0;
  v_rows integer;
begin
  if p_user_id is null then
    raise exception 'User is required';
  end if;

  select up.representative_id
    into v_linked_representative_id
  from public.user_profiles up
  where up.id = p_user_id
    and coalesce(up.is_active, true) = true;

  if not found then
    raise exception 'Target user was not found or is inactive';
  end if;

  if v_actor_id is not null
     and v_actor_id is distinct from p_user_id
     and public.current_user_role() not in ('super_admin','sales_manager') then
    raise exception 'Not allowed to generate suggestions for this user';
  end if;

  -- A personal suggestion list must belong to one explicitly linked sales rep.
  -- Accounts without a representative link receive no personal suggestions.
  if v_linked_representative_id is null then
    return 0;
  end if;

  foreach v_type in array array['شركة'::text, 'فردي'::text]
  loop
    select greatest(10 - count(*), 0)::integer
      into v_missing
    from public.daily_customer_suggestions s
    join public.customers current_customer on current_customer.id = s.customer_id
    where s.user_id = p_user_id
      and s.suggestion_date = p_suggestion_date
      and s.customer_type = v_type
      and s.status = 'active'
      and current_customer.representative_id = v_linked_representative_id;

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
        and c.representative_id = v_linked_representative_id
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

-- Remove only active suggestions that no longer belong to their account's
-- linked representative. Completed history is preserved.
delete from public.daily_customer_suggestions s
using public.customers c, public.user_profiles up
where c.id = s.customer_id
  and up.id = s.user_id
  and s.status = 'active'
  and (
    up.representative_id is null
    or c.representative_id is distinct from up.representative_id
  );

grant execute on function public.replenish_daily_customer_suggestions(uuid,date) to authenticated;

commit;
