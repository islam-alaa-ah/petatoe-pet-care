begin;
create table if not exists public.installation_settings (
  id smallint primary key default 1 check (id=1),
  morning_label text not null default 'صباحية',
  evening_label text not null default 'مسائية',
  sla_days integer not null default 1 check (sla_days between 0 and 365),
  default_priority text not null default 'عادية' check (default_priority in ('عادية','عاجلة','حرجة')),
  require_completion_report boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.installation_settings enable row level security;
drop policy if exists installation_settings_select on public.installation_settings;
create policy installation_settings_select on public.installation_settings for select using (public.has_screen_permission('installationSettings','view'));
drop policy if exists installation_settings_write on public.installation_settings;
create policy installation_settings_write on public.installation_settings for all using (public.has_screen_permission('installationSettings','edit')) with check (public.has_screen_permission('installationSettings','edit'));
insert into public.installation_settings(id) values(1) on conflict(id) do nothing;
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active) values('installationSettings','إعدادات التركيبات','إدارة التركيبات',75,true) on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export) values('super_admin'::public.app_role,'installationSettings',true,false,true,false,false) on conflict(role,screen_key) do update set can_view=excluded.can_view,can_edit=excluded.can_edit,updated_at=now();
grant select,insert,update on public.installation_settings to authenticated;
commit;
