# A17.2.2 — Customer Activity and Retention (code delivery)

## Files / authoritative base
Overlay atop A17.2.1. New `assets/js/advanced-analytics-customers.js`; modified `assets/js/advanced-analytics.js`, `assets/css/advanced-analytics.css`, `assets/js/localization-center.js`, `index.html`. No SQL/RPC/RLS/permission registry changes.

## Implementation
- Requires `advancedAnalytics`, `salesReports`, `customerReports` permission checks; avoids unrestricted customer data exposure.
- Loads authorized customer records using `CustomersService.listCustomers({force:true})`; independently retrieves all RPC sales pages with strict unique row identifiers and validated invoice dates, rejecting partial snapshots.
- Counts distinct customer IDs with at least one attributed dated sales row in selected and reference periods, using the A17 selected previous / year-earlier period.
- Retention rate = intersection(current customer ids, reference customer ids) / reference customers. Suppressed for open current month or reference with no customers.
- Activity segmentation measures authorized customer set at end of selected period, by last recorded invoice date: <=30,31–60,61–90,>90 days, or no recorded sales; **descriptive only**, not predictive churn. Counts include customers with no attributed sales.
- Bar-style visual charts (no fake values), expandable subtables, localized bilingual copy, no inline unsafe HTML, numeric formatting en-US.

## Static validation
Node syntax: PASS. Index unique IDs: PASS. Loader links: PASS. ZIP integrity: PASS.

## Pending live tests
1. Deploy A17.2.1 first then overlay these files.
2. Confirm authenticated roles with all 3 view permissions can load full customer analytics; remove one permission and verify section blocks. Note: `advancedAnalytics` permission registration remains pending from A17.2.1.
3. Compare distinct active customer sets with A14 for matching filter boundaries. A14 has other selectors (neighborhood/customer), so only compare equivalent scope.
4. Test partial current month, previous and YoY modes, language toggle and mobile, expand details.
5. Source access/pagination must be tested in real user session; no production data modified and no claim of LIVE certification.
