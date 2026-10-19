# A16.2 — Services Reports Screen / Baseline Delivery

## Baseline
- Full uploaded baseline `petatoe-pet-care-main - 2026-10-16T011059.232.zip`.
- Overlay `A15_2_9_Verified_Appointment_Sales.zip` applied before editing; A15 remains untouched by the change.

## Scope
- `index.html`: standalone `servicesReportsView`, sidebar and asset registration.
- `assets/js/app.js`: view registry, page meta and lifecycle.
- `assets/js/services-reports.js`: read-only paginated sales RPC and historical line detail with explicit cross-source reconciliation, KPI/table rendering and filters.
- `assets/css/services-reports.css`: canonical owner of A16 styles.
- `assets/js/localization-center.js`: central AR/EN strings.
- `assets/js/translation-center.js`: screen label for central Translation Center.

## Financial definitions
- `amount_incl_tax` from `sales_reports_rows_r44r38r20r35()` is authoritative for monetary totals.
- Historical detail must be fully readable, exactly match all RPC historical row IDs, and each inclusive amount must match by integer halala.
- Historical invoice lines with a valid `service_type_id` in current service catalog are classified; missing IDs never guessed.
- `cash_aggregate` historical, unspecified historical, and all current invoices remain explicit unclassified cohorts.
- Current invoice revenue is not allocated to services; line-level reconciliation is still pending.
- Service filter narrows to **identified classified historical service lines only**, not whole-company gross.
- No SQL, RPC, RLS, financial source values or logic modifications.

## Gate / limitations
- Requires `PermissionEngine.canView('servicesReports')` AND `canView('salesReports')`; new screen key must be registered and assigned by existing permission system. This package intentionally does NOT auto-grant rights.
- Client direct select from historical source and service catalog must be authorized for the user; on any partial/denied read, screen fails closed. This is a frontend gate, not a claim of secure new database access.
- New navigation and localization need browser regression and live totals checks, not yet done.
- Historic data service attribution previously audited: 1,497 classified lines SAR 420,935.63; 1,608 unspecified SAR 615,137.00; 36 cash aggregates SAR 115,052.47. Actual data may change.
- Next phase: verified current-invoice service line value mapping and operational service statistics.

## Static validation
- `node --check` passed for changed JS files.
- HTML has exactly one new view and navigation entry, matching report DOM element IDs.
- Not yet verified in production; don't label LIVE PASS.
