# A16.5 — Monthly execution trends and annual comparisons

Baseline: A16.4. Adds two full-width vertically stacked reports: confirmed execution quantities by scheduled visit month, and yearly classified/unclassified/all sales alongside independently sourced confirmed execution quantities and unique visits. No financial allocation to unknown services. Each table has a full-data total. Partial years are explicitly identified as not directly comparable to complete periods. Annual operational values display Not loaded before execution data is loaded; they never silently display zero. Existing filters and central localization apply.

**Scope**: index.html, assets/js/services-reports.js, assets/js/localization-center.js. No database, RPC, RLS, financial amount formulas or translation engine changes.

**Tests**: JS syntax pass, DOM ID references present. Live monthly/yearly totals and multi-language responsive review pending.

**Known limitations**: execution dates are the scheduled dates as A16.4; confirmation is determined by visit status. Historical service-classified sales and current unclassified sales must not be interpreted as equivalent service-level detail. Operational scope depends on existing permission/read access.
