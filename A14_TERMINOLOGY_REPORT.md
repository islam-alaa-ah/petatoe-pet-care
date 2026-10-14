# A14 — Customer Reports: Sales Terminology Fix

- Scope: exclusively Arabic user-visible text in the dedicated `customerReportsView` and its rendering messages.
- Business rule: company sales **to** customers, not customer purchases.
- No changes to arithmetic, SQL, RPC, roles, filters, DOM IDs or CSS.
- HTML outside the `customerReportsView` preserved byte-for-byte.
- Report source: A14.3F latest stage.
- JavaScript syntax checked with node --check.
- Browser visual verification pending.

## Original paths
`index.html` and `assets/js/customer-reports-overview.js`.
