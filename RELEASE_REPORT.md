# SEA VIBE — Trip Duration & Khor People / STAGED (NOT DEPLOYABLE YET)

Baseline: petatoe-pet-care-main - 2026-10-14T232533.371.zip.

## Scope
- UI: duration option `0.5` hour for Khor; 11 and 12 hours for fishing and Bayada; display Khor people field hidden and force 1 before preview/save.
- Updated display of 0.5 h in trips table.
- Only `assets/js/sea-vibe.js` changed. No CSS override, no SQL changes, no alteration to old trips.

## Blocker: database contract
- Original migration defines `public.sea_vibe_trips.duration_hours INTEGER CHECK (between 1 and 10)`.
- Sync RPC migration uses `(p_payload->>'durationHours')::integer`, so values 0.5/11/12 cannot reliably save.
- Permit matrix is keyed to 1..10 and 5+ bracket; new durations require approved tariffs/points and validation.
- Need to inspect live schema/functions before producing and deploying a narrowly scoped migration; DO NOT deploy this frontend staging ZIP into production alone.

## Required verification after DB changes
- Khor 0.5h / 1 person, end-time +30min, preview cost and save, read-back, edit, offline queue replay.
- Fishing/Bayada 11h and 12h, correct end-time including day wrap; permit fee/points/fuel settlement.
- Other type unchanged; existing trips unchanged; light/dark and responsive regression.
