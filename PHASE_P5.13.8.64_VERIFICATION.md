# PETATOE — P5.13.8.64 Verification

## Release
- Version: `18.55.82`
- Build: `185582`
- Scope: Appointment overdue classification correction + completion workspace added-service SQL ambiguity hotfix.

## Root Cause
### 1) Appointment overdue KPI/filter
The canonical `isInstallationRequestOverdue()` predicate in `assets/js/installations-module.js` classified any non-closed scheduled request as overdue once its scheduled date/time deadline passed. That included requests already in execution states such as `في الطريق`, `وصل إلى العميل`, and `قيد التنفيذ`, which made the overdue KPI overlap heavily with in-progress requests.

The required business definition is narrower: overdue means a scheduled/assigned appointment whose **scheduled calendar date is before today and whose execution has not started**.

### 2) Added service during quantity confirmation
The canonical RPC `public.update_installation_completion_workspace(...)` returns a table with an output column named `id`. In the new-service insert path, the SQL used `RETURNING id INTO v_new_service_id`. Inside a `RETURNS TABLE(id ...)` PL/pgSQL function, `id` is also an output variable, making the unqualified reference ambiguous when a new service row is inserted.

## Canonical Owners
- Appointment request KPI/filter classification: `assets/js/installations-module.js`
- Completion services + collection save RPC: `public.update_installation_completion_workspace(...)`
- PWA/version runtime: existing `assets/js/pwa.js`, `service-worker.js`, `version.json`

No duplicate predicate, RPC, service subsystem, or workaround layer was added.

## What Changed
1. Replaced time-based overdue classification with date-only classification.
2. Overdue eligibility is now limited to parent statuses `مجدول` and `مسند`.
3. A request becomes overdue only when `scheduled_date < today`.
4. The same canonical predicate remains used by both the Overdue KPI and the `متأخر` filter.
5. Re-created `update_installation_completion_workspace(...)` from the existing P5.13.8.50 canonical body, changing only the added-service INSERT target to an explicit alias and returning `new_request_service.id`.
6. Bumped release/cache version to `18.55.82` / Build `185582`.

## Files Modified
- `assets/js/installations-module.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `index.html`
- `supabase/migrations/phase_p5_13_8_64_overdue_completion_service_hotfix.sql`

## SQL Required
Yes. Apply:
`supabase/migrations/phase_p5_13_8_64_overdue_completion_service_hotfix.sql`

This migration only replaces the existing canonical completion workspace function with the ambiguity fix and reloads the PostgREST schema cache. It does not add tables/columns or change RLS.

## Verification
Passed locally/static:
- `node --check assets/js/installations-module.js`
- `node --check assets/js/pwa.js`
- P5.13.8.50 completion request-service identity certification: `11/11 PASS`
- P5.13.4 localization lockdown: PASS
- Custom overdue predicate audit: PASS
  - not-started statuses only
  - date-only comparison
  - strictly prior calendar day
  - same predicate shared by filter and KPI
- Custom SQL ambiguity audit: PASS
  - canonical function replacement present
  - INSERT target explicitly aliased
  - `RETURNING new_request_service.id` present
  - ambiguous `RETURNING id` removed
  - PostgREST schema reload present
- Version/PWA/Service Worker parity: PASS
- UTF-8/Mojibake audit: PASS

`phase-p5-13-8-53-confirmation-direct-invoice-workflow-check.mjs` remains `7/8` only because its first assertion is a stale fixed-version gate (`18.55.71`); all seven workflow assertions pass.

Database runtime execution against production Supabase was not available in this environment; the new migration must be applied before testing the added-service scenario.

## Regression Scope / Not Touched
- No per-request data patch.
- No change to appointment scheduling SQL/state machine.
- No change to execution stage transitions.
- No change to existing completion service identity model from P5.13.8.50.
- No change to quantity confirmation/invoice handoff logic.
- No change to collection calculations, VAT, discounts, or invoice ownership.
- No RLS/permission changes.
- No UI/CSS changes.

## Manual Verification Required
1. Apply the P5.13.8.64 SQL migration.
2. Appointment Requests: verify a request dated yesterday with status `مجدول` or `مسند` is counted as overdue.
3. Verify a request dated today is not overdue even after its scheduled clock time passes.
4. Verify old requests in `في الطريق`, `وصل إلى العميل`, or `قيد التنفيذ` are not counted in Overdue.
5. Select the `متأخر` filter and confirm it shows the same population as the KPI definition.
6. Quantity Confirmation: open a request, add a new service, save services/collection, and confirm the previous `column reference "id" is ambiguous` error no longer appears.
7. Reopen the confirmation and verify the newly added service has its own request-service identity and quantities remain correct.
8. Complete quantity confirmation/invoice flow to ensure no regression in invoice handoff.

## GitHub Desktop Summary
`P5.13.8.64: correct overdue to prior-date not-started appointments and fix completion added-service ambiguous id`
