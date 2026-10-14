# A14.3B — Dedicated Customer Reports (controlled correction)

Baseline: petatoe-pet-care-main - 2026-10-14T232533.371.zip.
Previous A14.3B in reportsOverview was rejected. This package applies changes to the baseline, not an additive override of the rejected index.html. Existing reportsOverview section remains unchanged.

## Changed paths
- index.html: new nav item and separate customerReportsView; asset links; reportsOverview untouched.
- assets/js/app.js: register customerReports view for canonical navigation.
- assets/js/customer-reports-overview.js: reuse validated 8-KPI loader; refuse if customerReports OR salesReports permission missing.
- assets/css/customer-reports-overview.css: dedicated styles; no override of the existing reports center.

## Permissions activation gate
The production role permission registry is NOT edited. New `customerReports` screen remains unavailable to non-super-admin users until its own view permission is explicitly registered and granted by the existing permission management process, while `salesReports` view is also required. Super admin bypass is existing product behavior. No implicit fallback to `reportsOverview` has been added; no security bypass.

## Static tests and regression
- Check one customerReportsView and one reportsOverviewView, separate top-level sections.
- Ensure a14OverviewMetrics occurs only in customerReportsView.
- Existing reportsOverview markup between its original boundaries is byte-identical to baseline.
- No changes to sales-reports.js, existing SQL, business logic, cash aggregate, ABS discount calculation.
- Data source: RPC full pagination and CustomersService.listCustomers force true; blocks incomplete results and unknown customer IDs.

## Live checks required
Super-admin: open dedicated screen; validate eight metrics against previous overview and historical snapshot; open old center and verify no customer overview added. Other roles: screen hidden until permissions configured. Check desktop/light/dark/mobile and direct navigation denial. SQL role registry setup is a separate phase and requires database schema verification.

## Root cause/impact/scope/risk
Root cause: rejected A14.3B mounted child inside reportsOverview rather than own screen. Scope limited to location/nav/permissions guard, no finance changes. Risk medium: navigation, permissions and loading. Live verification pending.
