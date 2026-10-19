# A16.3 — Classified service sales ranking
Baseline: A16.2 output, containing A15.2.9 overlay.

## Change
- New full-width Top 10 classified historical service revenue visualization.
- Contribution percentage in existing service table, calculated against classified revenue in filtered scope.
- Totals remain full filtered dataset, not first 10 displayed.
- Central Arabic/English translation keys; no translation engine changes.

## Accounting and scope
- No assignment of unclassified historical/current/cash revenue to services.
- No changes to sales RPC, SQL, RLS or permissions.
- Zero classified-sales denominator displays dash, no fabricated percent.
- Monetary accumulation remains integer halala.

## Validation
- JS syntax passes. Static DOM selectors verified. Browser/live and permissions check pending.
- Regression risk low-medium: classification source data access remains a pre-existing A16.2 gate.

## Next
- Verify current invoice service-level amounts before adding current sales into per-service ranking.
