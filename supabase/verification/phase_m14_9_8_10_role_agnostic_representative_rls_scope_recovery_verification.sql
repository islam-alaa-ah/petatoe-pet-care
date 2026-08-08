-- KYUM CRM Phase M14.9.8.10 Verification
-- Run after the migration as postgres.

-- 1) The function definition must no longer reject non-sales roles.
-- Expected: contains no role_name <> 'sales_representative' condition.
select pg_get_functiondef('public.can_access_representative(uuid)'::regprocedure)
  as can_access_representative_definition;

-- 2) Review every active user's effective data scope and linked representative.
-- Informational: customer-service/custom roles with a linked representative and
-- access_mode=own should now receive that representative's rows.
select
  p.id as user_id,
  p.full_name,
  p.role,
  p.representative_id,
  sr.full_name as linked_representative_name,
  coalesce(
    a.access_mode,
    case
      when p.role::text = 'super_admin' then 'all'
      when p.representative_id is not null then 'own'
      else 'selected'
    end
  ) as effective_access_mode,
  coalesce(sel.selected_count, 0) as selected_representatives
from public.user_profiles p
left join public.sales_representatives sr on sr.id = p.representative_id
left join public.user_data_access_profiles a on a.user_id = p.id
left join lateral (
  select count(*)::int as selected_count
  from public.user_data_access_representatives x
  where x.user_id = p.id
) sel on true
where coalesce(p.is_active, true)
order by p.role, p.full_name;

-- 3) Detect own-scope users whose linked representative is missing.
-- Expected: 0 rows for users who must see "their" customers.
select
  p.id as user_id,
  p.full_name,
  p.role,
  a.access_mode
from public.user_profiles p
join public.user_data_access_profiles a on a.user_id = p.id
where coalesce(p.is_active, true)
  and a.access_mode = 'own'
  and p.representative_id is null;

-- 4) Detect invalid selected representative references.
-- Expected: 0 rows.
select ar.user_id, ar.representative_id
from public.user_data_access_representatives ar
left join public.user_profiles p on p.id = ar.user_id
left join public.sales_representatives sr on sr.id = ar.representative_id
where p.id is null or sr.id is null;

-- 5) Compare customer ownership counts for each linked representative.
-- Informational: use this to confirm that the affected customer-service user is
-- linked to a representative that actually owns customer rows.
select
  p.id as user_id,
  p.full_name as user_name,
  p.role,
  sr.id as representative_id,
  sr.full_name as representative_name,
  count(c.id)::int as customer_count
from public.user_profiles p
left join public.sales_representatives sr on sr.id = p.representative_id
left join public.customers c on c.representative_id = p.representative_id
where coalesce(p.is_active, true)
group by p.id, p.full_name, p.role, sr.id, sr.full_name
order by customer_count desc, p.full_name;

-- 6) Policies that currently consume the canonical function.
-- Informational: verifies the impact surface across sections.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (qual ilike '%can_access_representative%'
       or with_check ilike '%can_access_representative%')
order by tablename, cmd, policyname;
