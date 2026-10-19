# A15.2.9 — Verified invoiced appointment sales per car/team

## Baseline / scope
Built on A15.2.7 UI including A15.2.3 DOM translation fix, A15.2.5 totals, A15.2.6 service productivity. Files changed: `index.html`, `assets/js/cars-teams-reports.js`, `assets/js/localization-center.js`. No SQL, RPC, RLS, permission changes, financial source edits or CSS overrides.

## Root cause
Sales RPC rows did not expose `installation_request_id`. Previously dividing all sales rows (including historical) by operational appointments would be invalid. The A15.2.8G live audit confirmed 415 current invoice rows, 414 linked invoices, 411 unique requests, 680.00 SAR unlinked, linked invoice sales 182,635.63 SAR; avg 444.37 SAR **at the snapshot tested**, not a permanent UI constant.

## Implementation
New full-width reports by vehicle and by team plus KPI and total rows. Only current RPC invoices enter the appointment calculation. In the authenticated session, reads every page of invoice IDs and links, and execution visit request mapping with existing Supabase RLS. Invoice monetary values are taken **only** from the exact corresponding sales RPC row `amount_incl_tax`, converted to integer cents. Single-hop reference invoice inheritance follows deployed RPC; if a visit exists without request, obtains the request ID from the visit. Any missing link needed to resolve a request, inconsistent visit/request, or disagreement between RPC and invoice table count/IDs blocks results instead of estimating. Unlinked invoices remain in overall sales but not the appointment metric. Historical sales excluded.

Each table groups linked current invoices by the car/team attribution already provided by the sales RPC. Distinct `installation_request_id` is counted separately in each group; total row uses distinct requests globally, so when a request appears in multiple groups, grouped request counts are not mathematically additive. Sales cents must reconcile exactly across groups; per-group average is group sales / group unique requests, total average is total linked sales / global unique requests. Current screen year/month/car/team filters are applied using the RPC invoice dates/attribution; historical record charts and operations remain unchanged. No new CSS layer.

## Limitations & regression risk
- User must click **Load Appointment Sales Averages**, because this is an additional authenticated table/visit read; changing or refreshing overall sales invalidates the audited linkage until reloaded.
- A report requiring direct table access may be unavailable for some roles; it fails closed without increasing privileges.
- SQL snapshot can change between network requests; nonmatching sets block rather than claiming reconciliation.
- Car/team attribution is from RPC, not inferred from live reassignment. Separate car/team unique request totals can be nonadditive if a request has invoices attributed across multiple entities.
- No live execution of this new UI in production; require browser check with full filters, representative scope, and translation.

## Checks
JavaScript syntax `node --check` passed for both changed scripts, unique new DOM IDs, localization keys present. Original report sections preserved. Live browser test pending.
