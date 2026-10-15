# A15.2.4 — Operational monthly trend and appointment details

**Baseline:** 2026-10-16T011059.232 full project ZIP + A15.2.2 Operations/Localization + A15.2.3 first-load translation DOM fix. 

**Scope:** Added two full-width stacked operational report sections inside existing cars/teams reports screen: monthly appointments and services, detailed operational appointments (10 rows and Show More increments of 10). Reuses existing `InstallationsServiceSafe.operationalReport({})` result, existing A15 filters, and existing operational report permission. Adds four Arabic/English keys in the existing central localization dictionary; no parallel translation engine.

**Modified original paths:** `index.html`, `assets/js/cars-teams-reports.js`, `assets/js/localization-center.js`.

**Root cause / need:** A15.2.2 operational reports only grouped by car and team and lacked month-level operational trends or per-appointment drill-down.

**Impact:** Read-only presentation and filtered aggregation of existing appointment rows. Monthly counts based on scheduledDate. Details show raw status supplied by source (may remain in Arabic if source has no translated status mapping). Records with invalid scheduledDate are excluded from monthly trend only; operation KPI and details counts remain unchanged.

**Regression risk:** Medium. Verify source row shape, count completeness, status and date semantics, permission behavior, mobile overflow, localization switch, first-load, and filters in live browser. The current operational source's full pagination/completeness is not revalidated here.

**Safety:** No SQL/RPC, sales data math, financial totals, auth, permissions, or existing translation engine changes. First-load fix retained. Existing `operationAllowed` guard retained.

**Checks:** `node --check` both JS files PASS; unique IDs, matching JS references and dictionary registration PASS; `Show More` increments 10. **Live/browser correctness Pending**.
