-- KYUM Phase 12 — Backup Center & System Settings
-- Run once in the Kyum Trading Company Supabase project.

begin;

create table if not exists public.system_settings (
  setting_key text primary key,
  setting_value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.backup_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type in ('export','restore')),
  file_name text,
  total_records integer not null default 0,
  status text not null default 'completed'
    check (status in ('started','completed','failed')),
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

insert into public.system_settings(setting_key,setting_value)
values
  ('company_name_ar','شركة كيوم للتجارة'),
  ('company_name_en','KYUM Company'),
  ('company_email',''),
  ('company_phone',''),
  ('company_address',''),
  ('currency','SAR'),
  ('timezone','Asia/Riyadh'),
  ('page_size','10'),
  ('session_timeout_minutes','480')
on conflict(setting_key) do nothing;

alter table public.system_settings enable row level security;
alter table public.backup_operations enable row level security;

drop policy if exists "authenticated read system settings" on public.system_settings;
create policy "authenticated read system settings"
on public.system_settings for select
to authenticated
using(true);

drop policy if exists "super admin manage system settings" on public.system_settings;
create policy "super admin manage system settings"
on public.system_settings for all
to authenticated
using(public.current_user_role() = 'super_admin')
with check(public.current_user_role() = 'super_admin');

drop policy if exists "super admin read backup operations" on public.backup_operations;
create policy "super admin read backup operations"
on public.backup_operations for select
to authenticated
using(public.current_user_role() = 'super_admin');

grant select on public.system_settings to authenticated;
grant insert,update,delete on public.system_settings to authenticated;
grant select on public.backup_operations to authenticated;

drop policy if exists "authenticated insert own audit logs" on public.audit_logs;
create policy "authenticated insert own audit logs"
on public.audit_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and action in ('insert','update','delete','login','logout','export','restore')
  and entity_type in (
    'sales_representatives',
    'interest_categories',
    'no_sale_reasons',
    'customers',
    'customer_followups',
    'quotations',
    'user_profiles',
    'role_screen_permissions',
    'system_settings',
    'backup_operations'
  )
);

commit;
