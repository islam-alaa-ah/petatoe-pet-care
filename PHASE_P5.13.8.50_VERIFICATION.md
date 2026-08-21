# P5.13.8.50 — Completion Workspace Request-Service Identity Recovery

## Root Cause
The completion workspace used `service_type_id` as the editable row identity. Legitimate requests can contain multiple `installation_request_services` rows with the same service type. Saving one line therefore updated every sibling line using that type, while delete/rebuild logic also matched by type. This caused the observed `1 + 1 -> merge to 2 -> confirm -> cancel -> 2 + 2` corruption.

## Canonical Fix
- Preserve `installation_request_services.id` as `request_service_id` in the completion workspace DOM and payload.
- Allow repeated `service_type_id` values when they belong to distinct request-service rows.
- Update/delete persisted rows only by `request_service_id`.
- New rows receive a new request-service ID even when their type duplicates another row.
- Snapshot and rebuild active visit allocations by `request_service_id`, never by `service_type_id`.
- Preserve confirmed/executed history and block removal/reduction/type mutation when executed quantities would be invalidated.

## Scope
No scheduling, execution-stage, collection-stage, invoice-generation, report, permissions, CSS, or responsive behavior was changed.

## Required Regression Scenarios
1. Existing duplicate service lines `1 + 1` -> Save -> remains `1 + 1` after reload.
2. `1 + 1` -> delete one line and make the survivor `2` -> Save -> exactly one line with quantity `2`.
3. Confirm -> cancel confirmation -> reload -> totals and row quantities remain canonical, with no `2 + 2` resurrection.
4. Split one quantity-2 line into two quantity-1 lines -> Save -> exactly `1 + 1`.
5. Multi-visit allocations remain tied to their request-service IDs and invoices still use the existing execution-group authority.

## Automated Verification
- P5.13.8.50 identity check: 10/10 PASS
- Runtime regression (`check:p5`): 10/10 PASS
- Completion group invoice authority: 10/10 PASS
- Migration manifest certification: 8/8 PASS (185 SQL migrations)
- Historical/current compatibility: 20/20 PASS
- Offline runtime reliability: PASS
- JS syntax checks: PASS

## SQL
Run `supabase/migrations/phase_p5_13_8_50_completion_workspace_request_service_identity.sql` once on the target database.
