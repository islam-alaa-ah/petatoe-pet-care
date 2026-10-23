# A17.3.8.6 — A14 Customer Overview dynamic translation (partial remediation)

Source: latest locally staged merged reports code from prior audit, not confirmed against current production GitHub Pages.

- Replaced 78 exact Arabic UI strings and dynamic messages with centralized `customerReports.overviewDynamic.*` dictionary entries in `localization-center.js`.
- Added language-change re-render using verified cached customer/sales snapshot; does not issue new financial RPC calls.
- Keeps filters and existing detail pagination size while refreshing.
- No SQL/RPC/RLS or financial calculations changed.
- Remaining direct Arabic literals and dynamic text in A14 and other reports still require coverage; this patch is not full bilingual certification.
- Require merging with current production versions of both files, and browser regression AR/EN, permission validation.
