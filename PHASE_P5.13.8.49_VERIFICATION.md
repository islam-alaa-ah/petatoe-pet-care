# P5.13.8.49 — Stale Certification Tests Cleanup

## Scope
Test/certification maintenance only. No runtime application JavaScript, CSS, SQL, Supabase policy, workflow, UI, or business logic was changed.

## Root cause
Historical checks encoded implementation details and release numbers from superseded phases. Later certified changes intentionally moved ownership (for example invoice-group authority to DB RPCs), localized timeline labels, removed the obsolete 9-digit invoice rule, simplified current geographic UI ownership, and replaced earlier header sizing contracts with the currently approved header identity.

## Remediation
- Historical geography checks now delegate to a single current geography authority check.
- Historical header/navigation checks now delegate to a single current approved-header authority check.
- Historical invoice-conversion check now validates the current completion/invoice contract, including free-form invoice numbers and execution-group invoice authority.
- Timeline, mobile ownership, schedule-detail, daily-suggestion, service-analytics, and version-only assertions were updated to validate current canonical behavior instead of obsolete release literals or hardcoded labels.
- Added `check:p5.13.8.49` to run the complete known stale/current compatibility set.

## Verification
- P5.13.8.49 compatibility suite: 20/20 PASS.
- All package scripts whose names contain `check` or `certification`: 43/43 PASS.
- No runtime source file changed.
- SQL required: No.

## Regression position
This phase does not restore old implementations merely to satisfy historical tests. Superseded tests are compatibility aliases to current authoritative certification checks, so a current runtime regression still fails the authoritative test instead of being masked by a legacy expectation.
