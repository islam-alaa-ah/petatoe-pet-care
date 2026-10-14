# A14 — Invoice labels only

Baseline: A14_3F_Sales_Terminology_Fix.zip.

Root Cause: The label "الفواتير المميزة" is ambiguous even though the calculation deduplicates invoices.

Impact: HTML labels for monthly and annual invoice counts, overview description, and JavaScript status/KPI wording.

Scope: index.html and assets/js/customer-reports-overview.js; no business logic, SQL, RPC, permissions or CSS changes.

Regression Risk: Low. JavaScript syntax checked; live UI pending.

Monthly table: عدد الفواتير خلال الشهر. Annual table: عدد الفواتير خلال السنة. Other labels: عدد الفواتير (contextual).
