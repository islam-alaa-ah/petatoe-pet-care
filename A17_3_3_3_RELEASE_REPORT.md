# A17.3.3.3 — Service comparison visual integrity

## Changes
- Adds current/reference month-range labels to each service chart, explicitly labelling an open/provisional period.
- Financial trend: when classified service sales are zero but canonical invoice/historical sales exist, labels the month 'Sales not attributed' rather than implying no company sales.
- Sales growth ranking: no chart bars when reference service amount is zero or the selected period is open. Detail table retains actual numeric values and records the comparison as unavailable.
- Execution growth ranking: same rule; no visual bars when reference execution quantity is zero or the selected period is open.
- Does not alter invoice allocation, executed quantities, tax, RPC, SQL, RLS, or original A16 calculations.

## Verification
- `node --check` PASS for both changed JS files.
- Live browser and source reconciliation pending.

## Installation
Apply on top of A17.3.3.2 and A17.3.3, preserving any later changes. Files in paths: `assets/js/advanced-analytics-service-finance.js`, `assets/js/advanced-analytics-services.js`, and `assets/css/advanced-analytics.css`.
