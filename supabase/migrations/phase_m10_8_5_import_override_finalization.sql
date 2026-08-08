-- Phase M10.8.5 — Import override finalization and persisted result evidence
alter table public.admin_import_overrides
  add column if not exists status text not null default 'authorized',
  add column if not exists inserted_rows integer not null default 0 check (inserted_rows >= 0),
  add column if not exists updated_rows integer not null default 0 check (updated_rows >= 0),
  add column if not exists request_rows integer not null default 0 check (request_rows >= 0),
  add column if not exists skipped_rows integer not null default 0 check (skipped_rows >= 0),
  add column if not exists failed_rows integer not null default 0 check (failed_rows >= 0),
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_import_overrides_status_check'
      and conrelid = 'public.admin_import_overrides'::regclass
  ) then
    alter table public.admin_import_overrides
      add constraint admin_import_overrides_status_check
      check (status in ('authorized', 'completed', 'completed_with_errors', 'failed'));
  end if;
end $$;

create index if not exists admin_import_overrides_status_created_idx
  on public.admin_import_overrides (status, created_at desc);
