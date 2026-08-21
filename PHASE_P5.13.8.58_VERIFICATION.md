# PHASE P5.13.8.58 Verification

## Version
- Version: 18.55.76
- Build: 185576
- Scope: Sales invoice attachment modal preview only.

## Root Cause
The canonical sales invoice renderer opened the shared `appointmentAttachmentsDialog` at a fixed 680px width and rendered every attachment as metadata plus an `Open` button only. The existing attachment data already included `storagePath`, `mimeType`, and file name, and the canonical `InstallationsServiceSafe.signedFileUrl()` path already provided authorized access to the file. The missing behavior was therefore presentation/preview logic, not storage or attachment ownership.

## Canonical Owners
- Sales invoice attachment rendering/runtime: `assets/js/sales-invoices.js`
- Sales invoice attachment presentation: `assets/css/sales-invoices.css`
- Existing shared modal markup: `index.html` (`appointmentAttachmentsDialog`)
- Existing signed URL owner preserved: `InstallationsServiceSafe.signedFileUrl()`

## Changes
- The shared dialog is expanded only while opened from Sales Invoices by applying `sales-invoice-attachments-preview-dialog` at runtime.
- Image attachments are detected from MIME type/file extension and receive a direct signed-URL preview inside the modal.
- The existing Open action remains available as a secondary action.
- Non-image attachments retain a safe fallback message and Open action.
- The Sales Invoice-specific dialog class is removed on dialog close to avoid leaking the larger layout into other screens that reuse the same shared dialog.
- Desktop and mobile preview dimensions are handled in the existing canonical `sales-invoices.css` owner; no parallel stylesheet or `!important` override was added.

## Files Modified
- `index.html`
- `assets/js/sales-invoices.js`
- `assets/css/sales-invoices.css`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`

## SQL
- No SQL required.
- No Supabase schema, RLS, RPC, attachment table, storage bucket, or business workflow changed.

## Verification
- `node --check assets/js/sales-invoices.js`: PASS
- `node --check assets/js/pwa.js`: PASS
- UTF-8 / replacement-character scan: PASS
- Current invoice conversion certification: 8/8 PASS
- P5.13.4 localization lockdown check: PASS (229 catalog keys in scope)
- Version/cache references: 18.55.76 / build 185576 aligned in phase files.

## Regression Scope
Preserved without modification:
- invoice loading and P5.13.8.57 self-relationship hotfix
- manual invoice creation
- no-invoice checkbox behavior
- invoice reference filtering
- services, VAT, and discount logic
- execution/completion attachment storage and ownership
- scheduling/execution/completion/invoice workflow
- Supabase/RLS/SQL

## Manual Verification Required
1. Sales Invoices > open an invoice with one image attachment: modal should be visibly larger and image should render directly without pressing Open.
2. Verify Open still opens the same attachment externally.
3. Test invoice with multiple images: all previews should remain usable with internal scrolling.
4. Test Dark Mode and Light Mode.
5. Test Desktop and Mobile widths.
6. Close the Sales Invoice attachment modal, then open an attachment modal from another screen that shares `appointmentAttachmentsDialog`; confirm the Sales Invoice-specific expanded class did not remain active.

## GitHub Desktop Summary
`P5.13.8.58 — enlarge Sales Invoice attachments modal and add direct image previews using the existing signed-file path; no workflow or DB changes.`
