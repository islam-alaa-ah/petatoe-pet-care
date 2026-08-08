# Phase M10.8.8 — Import Root Cause Fix & Completion Report

## Confirmed Root Causes

### 1. Edge Function 401 Unauthorized
The import override calls relied on the implicit session header added by `functions.invoke`. During the observed request, the Edge Function gateway received no valid bearer session and rejected the call before password verification.

Fix: read/refresh the active Supabase session immediately before every verify/finalize call and pass the current access token explicitly in the Authorization header.

### 2. Customer INSERT 409 Conflict
The preview was generated from a client-side customer snapshot. A record could already exist in Supabase while being classified as new because the snapshot was stale or because another operation inserted it after preview. The import worker then executed an INSERT against the unique normalized-phone constraint and received 409/23505.

Fix: re-check each distinct phone through the ownership RPC immediately before INSERT. If it already exists, reuse the accessible customer ID or safely skip it when outside the current account scope. A second conflict recovery check covers the small race window between the pre-check and INSERT.

### 3. Completion Feedback
The result panel existed but could be outside the visible scroll area and did not provide a blocking confirmation.

Fix: show a final completion summary, scroll it into view, and display an explicit completion message containing successful customers, saved requests/quotations, skipped/existing rows, and failed rows.

## Modified Files

- `assets/js/app.js`
- `assets/js/customers-service.js`

## Verification

- `node --check assets/js/app.js`
- `node --check assets/js/customers-service.js`
- No SQL, RLS, schema, or import validation rules were changed.
