-- Phase M14.9.2.1 verification
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='installation_completion_reports' and column_name in ('invoice_number','invoice_date') order by column_name;
select pg_get_constraintdef(oid) as file_kind_constraint from pg_constraint where conrelid='public.installation_completion_files'::regclass and conname='installation_completion_files_file_kind_check';
select proname from pg_proc where pronamespace='public'::regnamespace and proname='validate_installation_completion_report';
