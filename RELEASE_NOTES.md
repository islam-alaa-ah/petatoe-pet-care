# A17.3.8.8 — A14/A15 translation gaps (source patch)

Files:
- index.html — localize standalone A14 title and description.
- assets/js/app.js — A14 header meta key mapping in original router, preserving A15 navigation repair.
- assets/js/localization-center.js — three explicit A14 central keys, no secondary dictionary.
- assets/js/advanced-analytics-customers.js — refresh month option labels with selected value preserved on language switch.
- assets/js/customer-reports-overview.js — display neighborhoods using central entity translation by stable geographic IDs and EN name when available.
- assets/js/cars-teams-reports.js — localize displayed raw appointment statuses through canonical statusLabel, and no-invoice placeholder without modifying analytics conditions.

Safety: no SQL, no permission changes, no financial amount/date aggregation changes. Static JS syntax passed; live production verification pending. Translate unmatched English neighborhoods as Translation pending, not fabricated text. Merge with newer deployed files if present.
