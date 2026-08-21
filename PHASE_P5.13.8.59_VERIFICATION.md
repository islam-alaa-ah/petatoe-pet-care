# PHASE P5.13.8.59 — Execution Dark Action Contrast + Scheduled Date

## Baseline
- Cumulative baseline reconstructed from the latest complete uploaded project plus approved phases P5.13.8.55 through P5.13.8.58.
- Previous runtime version: 18.55.76 / Build 185576.
- New runtime version: 18.55.77 / Build 185577.

## Root Cause
1. `execution-return-schedule-btn` owned fixed light-theme colors (`#fff4f4` / `#a62828`) and had no canonical dark-theme tokens, so in Dark Mode the action lost contrast against the execution card surface.
2. The current-request summary rendered only `scheduledTime`; `scheduledDate` was already present on the canonical execution row but was not rendered in the time summary.

## Canonical Owners
- Runtime current-request renderer: `assets/js/installation-execution.js` → `currentHtml()`.
- Execution visual owner: `assets/css/installation-execution.css`.
- Localization catalog: `assets/js/localization-center.js`.

## Changes
- Added execution-scoped danger tokens to `.installation-execution-view` and their Dark Mode values in the existing theme variable owner.
- Updated `.execution-return-schedule-btn` to consume those tokens instead of fixed light-only colors. No new override layer and no `!important` was added.
- Added `executionScheduleDateLabel()` reading the existing `scheduledDate` field and formatting it as Gregorian with Latin digits.
- Rendered the appointment date immediately under the scheduled time in the same summary item.
- Added canonical localization key `execution.summary.date` (`التاريخ` / `Date`).
- Updated version/cache identifiers to 18.55.77.

## Files Modified
- `assets/js/installation-execution.js`
- `assets/css/installation-execution.css`
- `assets/js/localization-center.js`
- `assets/js/pwa.js`
- `index.html`
- `version.json`
- `service-worker.js`

## Not Touched
- Scheduling/execution business rules.
- Return-to-scheduling RPC/action behavior or permissions.
- Execution group / visit ownership.
- Supabase schema, RLS, SQL, invoices, collection, completion.
- Mobile navigation or unrelated visual owners.

## Verification
- `node --check assets/js/installation-execution.js` — PASS.
- `node --check assets/js/localization-center.js` — PASS.
- `node --check assets/js/pwa.js` — PASS.
- `scripts/p5-13-4-localization-lockdown-check.mjs` — PASS (229 catalog keys in scope).
- `scripts/phase-m15-11-1-execution-visit-canonicalization-check.mjs` — PASS 13/13.
- `scripts/phase-p5-11-4-10-2-same-day-execution-group-check.mjs` — PASS 12/12.
- `scripts/phase-m15-11-multi-day-execution-visit-isolation-check.mjs` — 11/12 with pre-existing `execution workspace reads visit timeline` failure. Confirmed the same failure on the untouched 18.55.76 pre-phase baseline, therefore not introduced by this phase.
- No SQL required.

## Manual Regression Checklist
1. Desktop Dark Mode → تنفيذ المواعيد → الطلب الحالي: verify `إلغاء وإعادة إلى شاشة الجدولة` is clearly readable and visually consistent.
2. Light Mode: verify the same button remains readable and unchanged functionally.
3. Verify the date appears directly under `الوقت المحدد` and matches the scheduled appointment date.
4. Switch Arabic/English and confirm `التاريخ / Date` rerenders correctly with Latin digits.
5. Verify clicking return-to-scheduling still follows the existing confirmation/reason workflow.
6. Check Tablet/Mobile current request card for wrapping or overflow.

## GitHub Desktop Summary
Fix execution Dark Mode return-to-schedule contrast and show scheduled date under time using canonical execution/localization owners.
