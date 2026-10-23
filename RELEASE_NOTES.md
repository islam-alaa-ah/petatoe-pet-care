# A17.3.8.9.5 — A15 Runtime Translation Gate (partial)

## Source
A15 report module reconstructed through staged A17.3.8.8; localization-center.js from A17.3.8.9.4 (thus retains five previous A17 service keys). These are source-level repairs, not production-browser verification.

## Changes
1. Replace three hardcoded English pagination validation messages with central `carsTeamsReports.*` translations. Error detection, pagination, reconciliation and identifiers remain unchanged.
2. On live AR↔EN language change, refresh A15 loading labels while sales, operational, or billed requests are in flight. Do not refetch or reset filters; existing completed-report rerender behavior retained.

## Safety / acceptance
- No SQL, RPC, permission checks, financial arithmetic, grouping, status comparisons, routes, or invoices altered.
- JS syntax checks and ZIP CRC verified.
- Live production browser tests (EN→AR→EN, failed pagination reason in correct language, date filters, totals, export, restricted permissions) NOT performed.
- Earlier A17.3.8.9.3 neighborhood patch is NOT included. Merge onto the current source, do not replace newer code.
- This is a partial runtime fix, not a certification that A13–A17 translations are complete.
