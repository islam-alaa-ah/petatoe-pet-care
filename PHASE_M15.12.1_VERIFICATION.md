# Phase M15.12.1 — Enterprise Notification Center & Dynamic Recipient Matrix

## Root Cause
The header had no persistent in-app notification data source, installation events had no central notification dispatcher, and recipient decisions were not configurable. Hardcoding roles would make later role renames and permission changes unsafe.

## Scope
- New Notification Center screen under Settings & Privacy.
- Dynamic recipient rules: request owner, selected roles, selected users.
- In-app notification bell shared by desktop/mobile header.
- Read/unread, mark-all-read, realtime insert subscription + polling fallback.
- Installation lifecycle event emitters.
- Notification Center permission integrated into the existing permission matrix.
- Push flag/schema reserved but external Web Push intentionally deferred to M15.12.2.

## Database
- notification_system_settings
- notification_event_settings
- notification_event_recipient_rules
- notifications
- emit_notification_event RPC
- RLS policies + realtime publication registration

## Regression
- M15.12.1 notification check: 14/14 PASS
- Permission visibility: 5/5 PASS
- Role agnostic permissions: 12/12 PASS
- Offline runtime reliability: PASS
- Cache-first connectivity: 15/15 PASS
- M15.11.2 functional regression: all functional assertions PASS; old version assertion expected to fail after release bump.
- S4.1 functional regression: 10/10 functional assertions PASS; old version/cache assertions expected to fail after release bump.
