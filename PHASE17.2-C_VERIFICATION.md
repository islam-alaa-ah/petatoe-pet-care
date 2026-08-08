# Phase 17.2-C — Enterprise Action Permissions

Modified files only:

- assets/js/permissions.js
- assets/js/app.js
- assets/js/customers-service.js
- assets/js/followups-service.js
- assets/js/quotations-service.js
- assets/js/reference-data-service.js
- assets/js/users-service.js
- assets/js/backup-service.js

Implemented:
- Central action permission API:
  - view
  - add
  - edit
  - delete
  - export
- Permission-denied event: `kyum-permission-denied`.
- Action-level guards before opening dialogs.
- Action-level guards before form submissions.
- Action-level guards before delete operations.
- Service-layer permission enforcement to block direct JavaScript/Console calls.
- Separate quotation add/edit/delete button visibility.
- User create/edit/password-reset enforcement.
- Permissions matrix save enforcement.
- Backup export/restore enforcement.

Verification:
- `node --check` passed for all modified JavaScript files.
- No SQL migration is required for Phase 17.2-C.

Important:
- Database RLS alignment is scheduled for Phase 17.2-D.
- This phase protects both UI entry points and browser service calls.
