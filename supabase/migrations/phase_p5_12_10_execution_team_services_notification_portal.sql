-- P5.12.10 — Execution Team/Services Visibility + Notification Portal Support
begin;

-- Execution users who are explicitly granted a team must be able to read that team's
-- display metadata (team name, groomer, driver) without requiring Installation Settings.
drop policy if exists "installation teams view" on public.installation_teams;
create policy "installation teams view" on public.installation_teams
for select to authenticated using (
  public.has_screen_permission('installationSettings','view')
  or (
    public.has_screen_permission('installationExecution','view')
    and public.can_access_installation_team(id)
  )
  or (
    public.has_screen_permission('installationCompletion','view')
    and public.can_access_installation_team(id)
  )
);

-- Request services must remain visible in Today's Requests / Current Request whenever
-- the user can execute a visit for one of their allowed teams. This explicitly covers
-- multi-visit requests whose parent request team can differ from the active visit team.
drop policy if exists "installation request services scoped select" on public.installation_request_services;
create policy "installation request services scoped select" on public.installation_request_services
for select to authenticated using (
  exists (
    select 1
    from public.installation_requests r
    where r.id=installation_request_id
      and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
  )
  or (
    public.has_screen_permission('installationExecution','view')
    and exists (
      select 1
      from public.installation_execution_visits v
      where v.installation_request_id=installation_request_id
        and public.can_access_installation_team(v.installation_team_id)
    )
  )
);

notify pgrst, 'reload schema';
commit;
