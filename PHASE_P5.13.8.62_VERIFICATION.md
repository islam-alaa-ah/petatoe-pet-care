# P5.13.8.62 — Appointment Completion Descending Sort

## Root Cause
The Appointment Completion screen consumed `completionList()` in its source/runtime order. Although some underlying requests and visits were fetched by completion time, the canonical screen renderer did not own an explicit deterministic sort for the visible **Request Date** column. Grouping pending/confirmed visit rows could therefore leave the UI in an order that did not guarantee newest request date first, and there was no defined request-number tie-breaker for rows from the same request date.

## Fix
- Added a deterministic sort in the canonical screen owner `assets/js/installation-completion.js`.
- Primary sort: `requestCreatedAt` calendar date descending (newest day first).
- Tie-breaker for the same day: `requestNumber` descending with numeric comparison.
- Sorting is applied after the existing filters, so search/representative/date filters remain unchanged.
- No database ordering, completion workflow, invoice conversion, quantity confirmation, permissions, or SQL logic was changed.

## Modified Files
- `assets/js/installation-completion.js`
- `index.html` — cache-buster for the changed completion module and aligned PWA release.
- `assets/js/pwa.js`
- `version.json`
- `service-worker.js`

## Version
- Version: `18.55.80`
- Build: `185580`

## Verification
- `node --check assets/js/installation-completion.js` — PASS
- `node --check assets/js/pwa.js` — PASS
- `node --check service-worker.js` — PASS
- Custom completion sort test (date DESC + same-day request number DESC) — PASS
- Current invoice conversion certification — 8/8 PASS
- Completion group invoice authority — 10/10 PASS
- Localization lockdown — PASS
- Version alignment (`version.json` = PWA runtime = script cache-busters = Service Worker token) — PASS
- Historical Phase 53 direct-invoice check: functional assertions 7/7 PASS; its only reported failure is the old hard-coded version gate `18.55.71`, not a functional regression.

## SQL
None.

## Manual Verification
1. Open **تأكيد انتهاء المواعيد**.
2. Confirm rows with the newest **تاريخ الطلب** appear first.
3. For multiple rows on the same date, confirm the highest request number appears first.
4. Apply search, representative, and date filters and confirm the same descending order remains.
5. Confirm quantity confirmation and invoice-conversion actions still work normally.

## GitHub Desktop Summary
Sort Appointment Completion rows by request date descending, then request number descending within the same day.
