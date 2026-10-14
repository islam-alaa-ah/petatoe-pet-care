# A14.3B — Header and Visual Identity Fix

Baseline: A14_3B_Dedicated_Customer_Reports.zip (applied after 2026-10-14 baseline).

## Root cause
`customerReports` missing in pageMeta -> fallback to dashboard title/subtitle. New cards used isolated generic CSS rather than canonical brand tokens and KPI card treatments.

## Impact and scope
Change only `assets/js/app.js` metadata, `assets/css/customer-reports-overview.css` canonical owner, and `index.html` CSS version for normal reload. No calculations, RPC, permissions, or layout of other views changed.

## Static verification
JS syntax PASS. Header key added exactly once; screen DOM unchanged, data loader byte-identical, no changes to Sales Reports or Reports Center. Responsive breakpoints 1100/780/600. Uses existing --surface/--border/--text/--muted/--primary/--success/--warning/--shadow tokens; no stacked override layer.

## Live pending
Navigate Dashboard->Customer Reports->Dashboard: check title and subtitle each time. Verify 8 cards in light/dark and desktop/tablet/mobile; verify amounts still 825/811/471/340/2581 where snapshot still applies. Verify Reports Center and Sales Reports unaffected.
