PHASE: A9 — Sales comparison charts + payment legend visual cleanup
STATUS: LOCAL PASS

ROOT CAUSE:
1. Monthly comparison labels still overlapped because the A8 staggering used fixed vertical lanes only; in dense month charts, close values from adjacent groups could still collide.
2. Year comparison reused a large shared chart scale/layout intended for quarter/month views, making the single-group annual chart visually oversized.
3. Comparison change-column colors were not visibly applied in the table because the effective styling needed stronger, row-targeted selectors.
4. Payment-method legend rendered amount and percentage in one bold inline string, causing visual crowding.

IMPACT:
- Improves readability and visual consistency only.
- No change to SQL, business logic, totals, or filtering behavior.

SCOPE:
- assets/js/sales-reports.js
- assets/css/sales-reports.css

REGRESSION RISK:
- Low for data logic.
- Medium for rendering until verified in the browser across screen sizes.

CHANGES:
- Added chart-size tiers for year / quarter / month comparison charts.
- Increased month-chart width and headroom.
- Offset month labels horizontally with start/end anchoring to reduce overlap.
- Reduced and constrained the standalone year comparison chart size.
- Strengthened positive/negative/neutral colors in comparison tables.
- Split payment legend amount and percentage into separate lines for clarity.

TESTS:
- A9 static source audit: 14/14 PASS
- A8 prior source checks: superseded where expected by A9 sizing/layout changes

RESULT:
PASS (local static validation)

NEXT APPROVED PHASE:
- Live visual verification on Desktop/Mobile using the user's current baseline.
