# Phase M10.6 — Daily Suggested Customer Contact Report

## Scope
- Added a new report to Daily Operations for suggested customers to contact.
- Added Companies / Individuals tabs.
- Displays up to 10 customers per selected type.
- Displays customer name, company contact person, last contact, latest quotation, representative, and actions.
- Added Add Follow-up, Contacted, and WhatsApp actions.

## Selection behavior
- Selection is deterministic, not random.
- Customers are ordered by oldest last-contact date, with customer ID as a stable tie-breaker.
- Customers contacted today are excluded.
- After saving a contact/follow-up, the completed customer is removed and the next eligible customer appears.
- Existing Supabase RLS and loaded customer scope remain authoritative.

## Files modified
- index.html
- assets/js/app.js
- assets/css/style.css

## Verification
- `node --check assets/js/app.js`: passed.
- No SQL, schema, RLS, API, permission, routing, or release-version changes.
