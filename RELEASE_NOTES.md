# A17.3.9.3 — Q5.2 A13 English runtime translation fix

Live test: A13 English visible elements 445; Arabic candidates 4: `salesReportsPeriodLabel` = `كل السنوات`, and three invoice-number cells = `بدون فاتورة`.

Changes:
- Add existing missing central key `salesReports.filter.allYears` (All years).
- Add `salesReports.common.withoutInvoice` (No invoice).
- Translate the invoice *display* within the table only. Preserve original RPC invoice number, historical invoice identifiers, export and grouping logic.
- The report already re-renders after `petatoe-language-changed`; no new listener or translation engine.

Modified files: `assets/js/sales-reports.js`, `assets/js/localization-center.js`.

The localization-center.js is based on A17.3.8.9.5 delivery. If production has newer modifications, merge these two new rows instead of overwriting.

Validation: `node --check` PASS for both modified JavaScript files; live browser retest PENDING. No financial, SQL, permission, route, or database changes.
