select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='installation_requests'
  and column_name in ('scheduled_time','assigned_technician_name')
order by column_name;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name='installation_technician_name_suggestions';

select conname,pg_get_constraintdef(oid)
from pg_constraint
where conrelid='public.installation_requests'::regclass
  and conname='installation_requests_scheduled_time_range_check';

select policyname,cmd
from pg_policies
where schemaname='public'
  and tablename='installation_technician_name_suggestions'
order by policyname;

select count(*) as saved_technician_names
from public.installation_technician_name_suggestions;
