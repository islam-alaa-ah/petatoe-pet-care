-- Phase M10.8.5 verification
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'admin_import_overrides'
  and column_name in (
    'status', 'inserted_rows', 'updated_rows', 'request_rows',
    'skipped_rows', 'failed_rows', 'completed_at'
  )
order by column_name;

select id, user_id, file_name, status, total_rows, override_rows,
       inserted_rows, updated_rows, request_rows, skipped_rows, failed_rows,
       created_at, completed_at
from public.admin_import_overrides
order by created_at desc
limit 20;
