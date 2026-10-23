# A17.3.8.3 — Central language event integration fix

## Root cause
`localization-center.js` emits `window.dispatchEvent(new CustomEvent('petatoe-language-changed', ...))`, while seven dynamic reporting modules listened for `document` event `petatoe:language-changed` (wrong target and name). Therefore already-rendered Arabic dynamic content persisted after switching to English.

## Scope
Modified only the language switch event subscriptions in:
- `assets/js/advanced-analytics-customers.js`
- `assets/js/advanced-analytics-insights.js`
- `assets/js/advanced-analytics-operations.js`
- `assets/js/advanced-analytics-peaks.js`
- `assets/js/advanced-analytics-service-finance.js`
- `assets/js/advanced-analytics-services.js`
- `assets/js/advanced-analytics.js`

The render functions are reused with current in-memory snapshots; no database writes, financial calculations, RPC, RLS, central localization engine, or CSS changed.

## Verification
- JS syntax checked for all seven files (`node --check`): passed.
- All seven modules now listen to the actual central language event: passed static inspection.
- Browser switching, dynamic service names returned from the database, and permissions regression tests: pending live verification.

## Deployment
Overlay seven files on the running baseline containing A17.3.8.2 and A14 cohort fixes. Avoid overwriting unrelated newer changes. Hard refresh/PWA update once after deployment. Test both Arabic→English and English→Arabic with report details expanded and data loaded. Product/customer/service names originating in the database are not guaranteed to have English translations and must be audited separately from interface strings.
