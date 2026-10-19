# A17.2.3 — Cars / teams operational analytics

## Scope
- New interactive chart panel for car/team operational appointment counts, current and comparison periods.
- Reuses `InstallationsServiceSafe.operationalReport({})`, the A15 source, without changing the service, RPC, schema or permissions.
- Requires `advancedAnalytics`, `salesReports` and `installationReports` view permissions.
- Grouped chart per period, KPIs, collapsible table (10 rows + show more, full totals).
- Actual inclusive UTC date-key arithmetic for previous-period and prior-year comparison, no future scheduled days.
- Completed: request status `مكتمل` or `isInvoiced`, except cancelled requests always take precedence. Cancelled statuses: `ملغي` / `ملغاة`.
- No sales amounts are mixed into operational metrics.

## Important limitations and pending verification
- `operationalReport()` is a request-level A15 report, not the number of individual execution visits. Counts must be described as *requests / operational appointments* and reconciled against A15 request-level report.
- The underlying service uses a non-paged Supabase request query; a 1,000-row default response cap on large production datasets may truncate results. Verify against authoritative DB counts before live signoff; fix in the shared service separately when confirmed, not by inventing totals in A17.
- Validates unique request IDs and scheduled dates on rows it receives. Does not assert that backend returned a complete population.
- Current month or year displays provisional counts, and a final difference is withheld until completion.
- Current global filter year/month/compare applies to the panel. A17 has no car/team global filters yet; group toggle selects vehicle or team.
- Chart lists top 20 groups; detail table includes all groups with 10-page increment.
- No live browser / permissions / source pagination regression executed.

## Changed paths
- `index.html`
- `assets/js/advanced-analytics-operations.js` (new)
- `assets/js/localization-center.js`
- `assets/css/advanced-analytics.css`

## Static checks
- Node JS syntax: pass.
- Unique targeted DOM identifiers: pass.
- Zip CRC check: pass.
