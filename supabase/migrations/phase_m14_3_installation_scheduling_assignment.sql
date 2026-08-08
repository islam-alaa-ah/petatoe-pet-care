-- Phase M14.3 — Installation Scheduling Calendar & Assignment Foundation
begin;
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationSchedule','جدولة وتوزيع التركيبات','إدارة التركيبات',67,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'installationSchedule',true,true,true,true,true)
on conflict(role,screen_key) do update set can_view=true,can_add=true,can_edit=true,can_delete=true,can_export=true,updated_at=now();

create table if not exists public.installation_technicians(
 id uuid primary key default gen_random_uuid(), full_name text not null, phone text, specialty text, city text,
 status text not null default 'متاح' check(status in ('متاح','مشغول','إجازة','غير نشط')),
 created_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.installation_requests add column if not exists technician_id uuid references public.installation_technicians(id) on delete set null;
alter table public.installation_requests add column if not exists assignment_notes text;
alter table public.installation_requests add column if not exists assigned_at timestamptz;
alter table public.installation_requests add column if not exists assigned_by uuid references auth.users(id) on delete set null;
create index if not exists idx_installation_requests_technician_schedule on public.installation_requests(technician_id,scheduled_date);
create index if not exists idx_installation_technicians_status_city on public.installation_technicians(status,city);
drop trigger if exists trg_installation_technicians_updated_at on public.installation_technicians;
create trigger trg_installation_technicians_updated_at before update on public.installation_technicians for each row execute function public.set_updated_at();
create or replace function public.stamp_installation_assignment() returns trigger language plpgsql set search_path=public as $$
begin if new.technician_id is distinct from old.technician_id then new.assigned_at=case when new.technician_id is null then null else now() end;new.assigned_by=case when new.technician_id is null then null else auth.uid() end;if new.technician_id is not null and new.status in ('جديد','مجدول') then new.status='مسند';end if;end if;return new;end;$$;
drop trigger if exists trg_stamp_installation_assignment on public.installation_requests;
create trigger trg_stamp_installation_assignment before update of technician_id on public.installation_requests for each row execute function public.stamp_installation_assignment();
alter table public.installation_technicians enable row level security;
drop policy if exists "installation technicians view" on public.installation_technicians;
drop policy if exists "installation technicians add" on public.installation_technicians;
drop policy if exists "installation technicians edit" on public.installation_technicians;
drop policy if exists "installation technicians delete" on public.installation_technicians;
create policy "installation technicians view" on public.installation_technicians for select to authenticated using(public.has_screen_permission('installationSchedule','view'));
create policy "installation technicians add" on public.installation_technicians for insert to authenticated with check(public.has_screen_permission('installationSchedule','add'));
create policy "installation technicians edit" on public.installation_technicians for update to authenticated using(public.has_screen_permission('installationSchedule','edit')) with check(public.has_screen_permission('installationSchedule','edit'));
create policy "installation technicians delete" on public.installation_technicians for delete to authenticated using(public.has_screen_permission('installationSchedule','delete'));
grant select,insert,update,delete on public.installation_technicians to authenticated;
commit;
