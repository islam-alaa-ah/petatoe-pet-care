begin;

alter table public.installation_requests
  add column if not exists installation_team_id uuid null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='installation_requests_installation_team_id_fkey'
  ) then
    alter table public.installation_requests
      add constraint installation_requests_installation_team_id_fkey
      foreign key (installation_team_id) references public.installation_teams(id) on delete set null;
  end if;
end $$;
create index if not exists idx_installation_requests_team on public.installation_requests(installation_team_id);

-- Scheduler users need read access to the active teams used in assignment.
drop policy if exists "installation teams view" on public.installation_teams;
create policy "installation teams view" on public.installation_teams
for select to authenticated
using (
  public.has_screen_permission('installationSettings','view')
  or public.has_screen_permission('installationSchedule','view')
);

grant select on public.installation_teams to authenticated;

commit;
