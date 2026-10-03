# R44R38R20R34A4 — Queue ACK Stability & Runtime Cache Alignment

## Root Cause
- `sync-retention.js` acknowledged the same Queue summary again whenever lifecycle events scheduled an ACK after the time throttle expired.
- `offline-queue.js` emits `kyum-offline-queue-changed` for queue processing metadata, which can trigger the retention ACK scheduler even when the queue summary did not change.
- The deployed R44R38R20R34A3 package advanced the application release to 18.56.138 but did not include a new `sync-retention.js`; the complete baseline still contained the older 18.56.136 retention implementation. The service-worker App Shell can therefore serve the older runtime file under the new release token.

## Impact
- Repeated `ack_sync_queue_watermark_v2` calls from background lifecycle activity.
- Unnecessary Supabase RPC/log-ingestion traffic.
- Runtime/cache version skew can make debugging misleading by loading mixed JavaScript versions.

## Scope
- Queue watermark ACK deduplication in `assets/js/sync-retention.js`.
- Release/cache alignment for 18.56.139.
- No database schema/RPC/RLS/business-logic changes.

## Implementation
- Added a deterministic Queue summary signature per user/domain.
- A successful identical summary is not ACKed again, including forced lifecycle ACKs.
- Existing 60-second safety throttle and in-flight protection remain.
- Release 18.56.139 aligns `index.html`, `pwa.js`, `service-worker.js`, `version.json`, and `package.json`.
- Added canonical localized release notes and a focused static/behavioral certification script.
