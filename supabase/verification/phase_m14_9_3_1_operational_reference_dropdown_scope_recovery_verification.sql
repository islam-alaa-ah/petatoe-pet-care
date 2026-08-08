-- KYUM CRM Phase M14.9.3.1 verification

select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('interest_categories', 'no_sale_reasons')
  and cmd = 'SELECT'
order by tablename, policyname;

-- Must return exactly one SELECT policy for each table.
select tablename, count(*) as select_policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('interest_categories', 'no_sale_reasons')
  and cmd = 'SELECT'
group by tablename
having count(*) <> 1;

-- Must return 0 rows.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('interest_categories', 'no_sale_reasons')
  and cmd = 'SELECT'
  and policyname not in (
    'interest categories canonical operational select',
    'no sale reasons canonical operational select'
  );
