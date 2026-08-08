select column_name,is_nullable,data_type
from information_schema.columns
where table_schema='public' and table_name='installation_requests'
  and column_name='installation_team_id';

select conname
from pg_constraint
where conname='installation_requests_installation_team_id_fkey';

select policyname,cmd
from pg_policies
where schemaname='public' and tablename='installation_teams';
