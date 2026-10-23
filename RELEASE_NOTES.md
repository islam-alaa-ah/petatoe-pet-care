# A17.3.3.6 — Sales year visibility

Base: A17.3.3.5 global YoY sales report.

Changed only assets/js/advanced-analytics.js.

- Dynamic graph title with current/reference calendar years.
- Legend matching green/gray line colors.
- Each SVG data point has a native tooltip containing period YYYY-MM, year, and sales amount.
- Dynamic table headings include both years and their difference.
- Localization follows existing language setting; no sales computation, query, or permissions changes.
- Year-specific labels are derived from the same year used for comparison (`shift(key,-12)`).

Verification: JS syntax and ZIP integrity. Production visual test remains pending.
