-- Phase M14.9.3 — Installation RLS Consolidation & Team Boundary Certification
begin;

create or replace function public.can_access_installation_request_scope(
  p_representative_id uuid,
  p_installation_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.can_access_installation_representative(p_representative_id)
    and (
      public.current_user_role()='super_admin'
      or public.can_access_installation_team(p_installation_team_id)
      or (
        p_installation_team_id is null
        and public.has_screen_permission('installationSchedule','edit')
      )
    )
$$;
grant execute on function public.can_access_installation_request_scope(uuid,uuid) to authenticated;

-- Canonical parent request policies. Team scope is now mandatory for every installation screen,
-- not only when the user owns installationExecution permission.
drop policy if exists "installation requests scoped select" on public.installation_requests;
drop policy if exists "installation requests scoped insert" on public.installation_requests;
drop policy if exists "installation requests scoped update" on public.installation_requests;
drop policy if exists "installation requests scoped delete" on public.installation_requests;

create policy "installation requests scoped select" on public.installation_requests
for select to authenticated using(
  (
    public.has_screen_permission('installationRequests','view')
    or public.has_screen_permission('installationSchedule','view')
    or public.has_screen_permission('installationExecution','view')
    or public.has_screen_permission('installationCompletion','view')
    or public.has_screen_permission('installationExceptions','view')
    or public.has_screen_permission('installationReports','view')
    or public.has_screen_permission('installationsOverview','view')
  )
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
);

create policy "installation requests scoped insert" on public.installation_requests
for insert to authenticated with check(
  public.has_screen_permission('installationRequestNew','add')
  and public.can_access_installation_representative(representative_id)
  and installation_team_id is null
);

create policy "installation requests scoped update" on public.installation_requests
for update to authenticated using(
  (
    public.has_screen_permission('installationRequests','edit')
    or public.has_screen_permission('installationSchedule','edit')
    or public.has_screen_permission('installationExecution','edit')
  )
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
) with check(
  (
    public.has_screen_permission('installationRequests','edit')
    or public.has_screen_permission('installationSchedule','edit')
    or public.has_screen_permission('installationExecution','edit')
  )
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
);

create policy "installation requests scoped delete" on public.installation_requests
for delete to authenticated using(
  public.has_screen_permission('installationRequests','delete')
  and public.can_access_installation_request_scope(representative_id,installation_team_id)
);

-- Request services inherit the canonical parent scope.
drop policy if exists "installation request services scoped select" on public.installation_request_services;
drop policy if exists "installation request services scoped insert" on public.installation_request_services;
drop policy if exists "installation request services scoped update" on public.installation_request_services;
drop policy if exists "installation request services scoped delete" on public.installation_request_services;

create policy "installation request services scoped select" on public.installation_request_services
for select to authenticated using(exists(
  select 1 from public.installation_requests r
  where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id)
));
create policy "installation request services scoped insert" on public.installation_request_services
for insert to authenticated with check(
  public.has_screen_permission('installationRequestNew','add')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy "installation request services scoped update" on public.installation_request_services
for update to authenticated using(
  public.has_screen_permission('installationRequests','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
) with check(
  public.has_screen_permission('installationRequests','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy "installation request services scoped delete" on public.installation_request_services
for delete to authenticated using(
  public.has_screen_permission('installationRequests','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

-- Execution files and history.
drop policy if exists "installation execution files view" on public.installation_execution_files;
drop policy if exists "installation execution files add" on public.installation_execution_files;
create policy "installation execution files view" on public.installation_execution_files
for select to authenticated using(
  public.has_screen_permission('installationExecution','view')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy "installation execution files add" on public.installation_execution_files
for insert to authenticated with check(
  public.has_screen_permission('installationExecution','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

drop policy if exists "installation execution history view" on public.installation_status_history;
create policy "installation execution history view" on public.installation_status_history
for select to authenticated using(
  public.has_screen_permission('installationExecution','view')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

-- Completion reports and files.
drop policy if exists "installation completion scoped select" on public.installation_completion_reports;
drop policy if exists "installation completion scoped insert" on public.installation_completion_reports;
drop policy if exists "installation completion scoped update" on public.installation_completion_reports;
create policy "installation completion scoped select" on public.installation_completion_reports
for select to authenticated using(
  public.has_screen_permission('installationCompletion','view')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy "installation completion scoped insert" on public.installation_completion_reports
for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل'
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy "installation completion scoped update" on public.installation_completion_reports
for update to authenticated using(
  public.has_screen_permission('installationCompletion','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
) with check(
  public.has_screen_permission('installationCompletion','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل'
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

drop policy if exists "installation files scoped select" on public.installation_completion_files;
drop policy if exists "installation files scoped insert" on public.installation_completion_files;
create policy "installation files scoped select" on public.installation_completion_files
for select to authenticated using(
  public.has_screen_permission('installationCompletion','view')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy "installation files scoped insert" on public.installation_completion_files
for insert to authenticated with check(
  public.has_screen_permission('installationCompletion','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id and r.status='مكتمل'
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

-- Exceptions / revisits.
drop policy if exists installation_revisits_select on public.installation_revisits;
drop policy if exists installation_revisits_write on public.installation_revisits;
create policy installation_revisits_select on public.installation_revisits
for select to authenticated using(
  public.has_screen_permission('installationExceptions','view')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);
create policy installation_revisits_write on public.installation_revisits
for all to authenticated using(
  public.has_screen_permission('installationExceptions','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
) with check(
  public.has_screen_permission('installationExceptions','edit')
  and exists(select 1 from public.installation_requests r where r.id=installation_request_id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

-- Related customer and quotation reads must inherit the same combined scope.
drop policy if exists "installation linked customers read" on public.customers;
create policy "installation linked customers read" on public.customers
for select to authenticated using(
  exists(select 1 from public.installation_requests r where r.customer_id=customers.id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
  and (
    public.has_screen_permission('installationRequests','view')
    or public.has_screen_permission('installationSchedule','view')
    or public.has_screen_permission('installationExecution','view')
    or public.has_screen_permission('installationCompletion','view')
    or public.has_screen_permission('installationExceptions','view')
  )
);

drop policy if exists "installation linked quotations read" on public.quotations;
create policy "installation linked quotations read" on public.quotations
for select to authenticated using(
  public.has_screen_permission('installationRequests','view')
  and exists(select 1 from public.installation_requests r where r.quotation_id=quotations.id
    and public.can_access_installation_request_scope(r.representative_id,r.installation_team_id))
);

commit;
