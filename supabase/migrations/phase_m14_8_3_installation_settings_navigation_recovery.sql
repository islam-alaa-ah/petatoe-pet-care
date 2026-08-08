-- Phase M14.8.3 — Installation Settings Screen & Sidebar Navigation Recovery
begin;

alter table public.installation_service_types
  add column if not exists default_cost numeric(14,2) not null default 0 check(default_cost >= 0);

alter table public.installation_neighborhoods
  add column if not exists city text,
  add column if not exists region text;

create table if not exists public.installation_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  leader_name text,
  phone text,
  city text,
  status text not null default 'متاحة' check(status in ('متاحة','مشغولة','إجازة','غير نشطة')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_installation_teams_updated_at on public.installation_teams;
create trigger trg_installation_teams_updated_at before update on public.installation_teams for each row execute function public.set_updated_at();

alter table public.installation_teams enable row level security;
drop policy if exists "installation teams view" on public.installation_teams;
drop policy if exists "installation teams add" on public.installation_teams;
drop policy if exists "installation teams edit" on public.installation_teams;
drop policy if exists "installation teams delete" on public.installation_teams;
create policy "installation teams view" on public.installation_teams for select to authenticated using(public.has_screen_permission('installationSettings','view'));
create policy "installation teams add" on public.installation_teams for insert to authenticated with check(public.has_screen_permission('installationSettings','add'));
create policy "installation teams edit" on public.installation_teams for update to authenticated using(public.has_screen_permission('installationSettings','edit')) with check(public.has_screen_permission('installationSettings','edit'));
create policy "installation teams delete" on public.installation_teams for delete to authenticated using(public.has_screen_permission('installationSettings','delete'));

-- Upgrade reference-table policies from read-only to settings-controlled CRUD.
drop policy if exists "installation service types settings add" on public.installation_service_types;
drop policy if exists "installation service types settings edit" on public.installation_service_types;
drop policy if exists "installation service types settings delete" on public.installation_service_types;
create policy "installation service types settings add" on public.installation_service_types for insert to authenticated with check(public.has_screen_permission('installationSettings','add'));
create policy "installation service types settings edit" on public.installation_service_types for update to authenticated using(public.has_screen_permission('installationSettings','edit')) with check(public.has_screen_permission('installationSettings','edit'));
create policy "installation service types settings delete" on public.installation_service_types for delete to authenticated using(public.has_screen_permission('installationSettings','delete'));

drop policy if exists "installation neighborhoods settings add" on public.installation_neighborhoods;
drop policy if exists "installation neighborhoods settings edit" on public.installation_neighborhoods;
drop policy if exists "installation neighborhoods settings delete" on public.installation_neighborhoods;
create policy "installation neighborhoods settings add" on public.installation_neighborhoods for insert to authenticated with check(public.has_screen_permission('installationSettings','add'));
create policy "installation neighborhoods settings edit" on public.installation_neighborhoods for update to authenticated using(public.has_screen_permission('installationSettings','edit')) with check(public.has_screen_permission('installationSettings','edit'));
create policy "installation neighborhoods settings delete" on public.installation_neighborhoods for delete to authenticated using(public.has_screen_permission('installationSettings','delete'));

grant select,insert,update,delete on public.installation_teams, public.installation_service_types, public.installation_neighborhoods to authenticated;

insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationSettings','إعدادات التركيبات','إدارة التركيبات',72,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;

insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'installationSettings',true,true,true,true,false)
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,updated_at=now();

commit;
