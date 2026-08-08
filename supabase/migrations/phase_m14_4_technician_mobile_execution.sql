-- Phase M14.4 — Technician Mobile Execution & Installation Status Workflow
begin;
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values ('installationExecution','تنفيذ التركيبات','إدارة التركيبات',68,true)
on conflict(screen_key) do update set screen_name=excluded.screen_name,group_name=excluded.group_name,display_order=excluded.display_order,is_active=true;
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values ('super_admin'::public.app_role,'installationExecution',true,false,true,false,false)
on conflict(role,screen_key) do update set can_view=true,can_edit=true,updated_at=now();

alter table public.installation_requests add column if not exists execution_notes text;
alter table public.installation_requests add column if not exists execution_failure_reason text;
alter table public.installation_requests add column if not exists on_route_at timestamptz;
alter table public.installation_requests add column if not exists started_at timestamptz;
alter table public.installation_requests add column if not exists completed_at timestamptz;
alter table public.installation_requests add column if not exists last_status_changed_at timestamptz;
alter table public.installation_requests add column if not exists last_status_changed_by uuid references auth.users(id) on delete set null;

create table if not exists public.installation_status_history(
 id uuid primary key default gen_random_uuid(),
 installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
 old_status text,
 new_status text not null,
 notes text,
 failure_reason text,
 changed_by uuid references auth.users(id) on delete set null default auth.uid(),
 changed_at timestamptz not null default now()
);
create index if not exists idx_installation_status_history_request on public.installation_status_history(installation_request_id,changed_at desc);

create or replace function public.track_installation_execution_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status then
  new.last_status_changed_at=now(); new.last_status_changed_by=auth.uid();
  if new.status='في الطريق' and new.on_route_at is null then new.on_route_at=now(); end if;
  if new.status='قيد التنفيذ' and new.started_at is null then new.started_at=now(); end if;
  if new.status='مكتمل' and new.completed_at is null then new.completed_at=now(); end if;
  insert into public.installation_status_history(installation_request_id,old_status,new_status,notes,failure_reason,changed_by)
  values(new.id,old.status,new.status,new.execution_notes,new.execution_failure_reason,auth.uid());
 end if;
 return new;
end;$$;
drop trigger if exists trg_track_installation_execution_status on public.installation_requests;
create trigger trg_track_installation_execution_status before update of status on public.installation_requests for each row execute function public.track_installation_execution_status();

alter table public.installation_status_history enable row level security;
drop policy if exists "installation execution history view" on public.installation_status_history;
create policy "installation execution history view" on public.installation_status_history for select to authenticated using(public.has_screen_permission('installationExecution','view'));
grant select on public.installation_status_history to authenticated;
commit;
