-- Phase M10.9 verification. Run as postgres.

-- 1) Exactly one SELECT policy must remain on each core report-source table.
select tablename, count(*) as select_policy_count,
       string_agg(policyname, ', ' order by policyname) as policies
from pg_policies
where schemaname = 'public'
  and tablename in ('customers','customer_followups','quotations','customer_interests')
  and cmd = 'SELECT'
group by tablename
order by tablename;

-- 2) Verify indexes used by scoped queries.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_customers_scope_created',
    'idx_followups_scope_contact',
    'idx_quotations_scope_date',
    'idx_access_representatives_user_rep'
  )
order by tablename, indexname;

-- 3) Inspect user scope configuration. Replace UUID when testing a specific account.
select
  p.id,
  p.full_name,
  p.role::text as role,
  p.representative_id,
  coalesce(a.access_mode, 'own') as access_mode,
  coalesce(array_agg(ar.representative_id) filter (where ar.representative_id is not null), '{}') as selected_representatives
from public.user_profiles p
left join public.user_data_access_profiles a on a.user_id = p.id
left join public.user_data_access_representatives ar on ar.user_id = p.id
group by p.id, p.full_name, p.role, p.representative_id, a.access_mode
order by p.full_name;
