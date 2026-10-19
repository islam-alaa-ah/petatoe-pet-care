# A16.6 — Services Details / Filters / Export

Baseline: A16.5.1 Execution Values.

Scope: detailed sales/execution rows, per-record type filter and reference/service search, initial 10 rows + load 10, full-data CSV, full-data browser print/PDF. Existing year/month/service filters apply.

Sales values originate from RPC amount_incl_tax; execution values are executed_quantity × requested unit_price. They are **never** combined into one financial total. Existing historical unknown service descriptions remain unclassified, and current invoices are not assigned to individual services without verified line-level mapping.

Files: index.html, assets/js/services-reports.js, assets/js/localization-center.js.

Remaining: live permission testing; verify data export under all filter combinations; performance with full data; browser print; localization; source financial reconciliation. No SQL/RPC/RLS changes.
