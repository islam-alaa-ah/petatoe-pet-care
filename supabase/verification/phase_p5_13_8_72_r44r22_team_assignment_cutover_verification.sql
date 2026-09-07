-- R44R22 read-only verification: appointment team assignment cutover at 2026-09-01.
-- Expected: no assignment segment crosses the cutover; each existing team has a frozen
-- pre-cutover segment ending 2026-08-31 and a post-cutover segment beginning 2026-09-01.

select
  date '2026-09-01' as cutover_date,
  count(*) filter (
    where effective_from < date '2026-09-01'
      and (effective_to is null or effective_to >= date '2026-09-01')
  ) as segments_still_crossing_cutover,
  count(*) filter (where effective_to = date '2026-08-31') as frozen_pre_cutover_segments,
  count(*) filter (where effective_from = date '2026-09-01') as cutover_segments,
  count(*) filter (where effective_to is null) as current_open_segments
from public.installation_team_assignment_history;

select
  installation_team_id,
  effective_from,
  effective_to,
  groomer_name_snapshot,
  driver_name_snapshot,
  car_name_snapshot,
  source
from public.installation_team_assignment_history
order by installation_team_id,effective_from;

select
  t.id as installation_team_id,
  t.name as current_team_name,
  h.effective_from as current_history_from,
  h.groomer_name_snapshot,
  h.driver_name_snapshot,
  h.car_name_snapshot,
  case when h.id is null then 'MISSING_HISTORY' else 'OK' end as history_status
from public.installation_teams t
left join public.installation_team_assignment_history h
  on h.installation_team_id=t.id
 and h.effective_to is null
order by t.name,t.id;
