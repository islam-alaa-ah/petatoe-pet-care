-- Phase M10.8.4 verification
select to_regclass('public.admin_import_overrides') as override_table;
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'admin_import_overrides'
order by ordinal_position;
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'admin_import_overrides';
