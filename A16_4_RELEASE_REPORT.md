# A16.4 — Confirmed service execution reports
Baseline: A16.3.

## Scope
- Adds three full-width, vertically stacked operational quantity tables: by service, car, team.
- Units are executed quantities from confirmed `installation_execution_visits` only, joined to `installation_execution_visit_services`, `installation_request_services`, and the original service catalog.
- Count unique execution visits per grouping and de-duplicate the overall total visit count; never sum grouped unique-visit counts.
- Team attribution reads the actual execution visit team. Car attribution is shown only when the operational report's effective team matches the execution visit; otherwise unassigned.
- Read-only, permission gates require servicesReports, salesReports and installationReports; no SQL/RPC/RLS edits.
- Keeps previous sales reports and central translation engine. New strings added through the existing central dictionary.

## Limits / blockers
- Source RLS completeness is not independently proven. Existing operationalReport's rows are used as a scope consistency check; live browser check required.
- Page-level filter `a16Service` is populated from historical classified sales; operational-only services may not appear in the filter until subsequent filter unification.
- Service quantity lines with zero executed quantity are omitted from the quantity grouping; canceled/unconfirmed visits excluded.
- Historical car attribution may be unavailable. It is shown as unassigned rather than guessed.
- No current-invoice service revenue attribution or invented financial allocation.

## Tests
- `node --check` for modified JS and central localization JS.
- Static element-key and ID verification.
- LIVE test required with installationReports permission. Refresh original financial data, then use Load Execution Data. Filters should update execution and financial blocks independently.

Regression risk: Medium — read permissions for execution tables and canonical per-request attribution may constrain observed coverage.
