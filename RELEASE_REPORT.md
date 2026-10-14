# SEA VIBE — R1.1 guarded migration (R1 HOLD correction)

## Result of supplied diagnostics
- `exact_guard_position = 0` confirms R1's literal formatting anchor did not match.
- Core markers for duration, permit matrix, Zawel ledger and upsert all true, but these are **presence probes**, not proof of complete semantic equivalence.
- Supabase function MD5 observed by user: `166a8e949bc7fb00deabe8eacb373ec0`.
- R1 failed inside a transaction at a preflight gate; verify live state before proceeding.

## Scope of R1.1 vs R1
- Replace indentation-sensitive injection location with one guarded regex anchor, and verify one and only one match.
- Strict MD5 gate on deployed permit function, so formatting tolerant anchor does **not** allow a changed function body.
- Zawel preview insertion anchor accepts whitespace differences but must match exactly one occurrence; verify safeguard after migration.
- All other migration logic, frontend files, existing trip/fee constraints and historical safeguards are unchanged from R1.

## WARNING / prerequisites
1. DO NOT execute directly in production. Take backup and rehearse on matching staging database.
2. Run `sql/01_PRE_DEPLOY_READONLY.sql`, compare with prior 20 trips and Zawel 20 permit ledger entries / -9150 points.
3. Execute `sql/02_GUARDED_MIGRATION.sql` as **one script** on staging. No separate pasting of sub-blocks.
4. Run `sql/03_POST_DEPLOY_READONLY.sql`, verify 20 historic trips and financial ledger unchanged.
5. Exercise create/edit Khor 0.5/1/2, fishing/Bayadah 11/12, permit exemptions, Zawel preview, offline queue, idempotency and conflicts. Frontend JS only after SQL verified.
6. STOP on every HOLD/ERROR; do not bypass checks.

## Limits
- No direct execution against Supabase was possible here; no LIVE PASS claimed.
- R1.1 keeps the R1 implementation and constraints; staging might expose further mismatches.
- `get_sea_vibe_zawel_reconciliation_preview_r44r1` excludes Khor from matching, which is appropriate only while there are no legacy Khor transactions (checked by preflight). No historical ledger deletion.
- The preflight still expects 20 original trips and zero historical Khor trips.
