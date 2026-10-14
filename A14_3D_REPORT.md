# A14.3D — Customer purchase activity & monthly retention

Baseline: 2026-10-14 project + cumulative A14.3C JavaScript/HTML and A14.3C full-width CSS. Changed only index.html and customer-reports-overview JS/CSS.

Three new **full-width, vertically stacked** reports: days since last verified purchase, consecutive-calendar-month buyer retention, top 10 longest-lapsed buyers. KPIs remain responsive grid. Reuses the previously validated paginated RPC/customers path and invoice identity dedupe. Never uses customers.created_at as first purchase.

**Reference date:** maximum dated purchase among eligible customer invoice records, NOT wall-clock date. For monthly retention use calendar month of that date and preceding calendar month; denominator previous month's distinct buyers. These measures are descriptive for source coverage only, not contractual churn. Customers without valid invoice dates excluded from inactivity denominator and disclosed. Customers without invoices shown separately.

**Root cause / scope:** missing purchase activity reports only. Existing financial totals, SQL/RPC, SEA VIBE, permission control untouched.

**Risk:** timezone/date values from source, interpretation of dataset end date; live read and date semantics require testing. Static syntax and DOM-integrity tested. No production write. Do not overwrite index.html from an older baseline if deployed source has changed since A14.3C.
