# A14.3C — Customer Purchase Analysis (static release)

Baseline: 2026-10-14 ZIP + approved A14.3B dedicated screen and Header/Visual Fix.

Changed: index.html, assets/js/customer-reports-overview.js, assets/css/customer-reports-overview.css.

Includes frequency bands, repeat purchase ratio, average invoices, top 10 customers by inclusive actual sales and last recorded purchase.

Uses same complete paginated RPC + listCustomers result already verified for overview. Does not create new independent fetch, change SQL, permissions, financial amounts, customer identities or SEA VIBE. Cash aggregates remain excluded from customer purchases, no synthetic customers. Invoices grouped using prior established historical (customer/date/number) and current row_id identity.

Guard: none of overview/analysis KPIs are shown if pagination, dedup, numeric validation or customer scope check fails.

Static: Node --check PASS; HTML required IDs PASS. Live UI, CSS Light/Dark and cross-role validation PENDING.

Regression risk: Medium — customer grouping/rank calculations. Test baseline 825 customers/811 buyers/471 repeat/340 once/2581 invoices from previous snapshot (may change), check top 10 and frequency groups.
