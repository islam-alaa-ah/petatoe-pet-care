-- Phase M10.8.4 — Super Admin password-protected import override
create table if not exists public.admin_import_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  file_name text,
  total_rows integer not null default 0 check (total_rows >= 0),
  override_rows integer not null default 0 check (override_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_import_overrides enable row level security;

drop policy if exists "admin_import_overrides_super_admin_read" on public.admin_import_overrides;
create policy "admin_import_overrides_super_admin_read"
on public.admin_import_overrides
for select
to authenticated
using (
  exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role = 'super_admin'
  )
);

revoke insert, update, delete on public.admin_import_overrides from anon, authenticated;
grant select on public.admin_import_overrides to authenticated;

create index if not exists admin_import_overrides_user_created_idx
  on public.admin_import_overrides (user_id, created_at desc);
