# Phase M15.12.2 — Web Push Setup

## Required Supabase steps

1. Run:
   - `supabase/migrations/phase_m15_12_2_web_push_external_notifications.sql`
   - then `supabase/verification/phase_m15_12_2_web_push_verification.sql`
2. Deploy the Edge Function:
   - `supabase functions deploy notification-push-dispatch`
3. Generate one VAPID key pair and configure these Edge Function secrets:
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT` (for example `mailto:admin@your-domain.com`)
4. The standard Supabase secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must be available to the function.
5. Open KYUM → Settings & Privacy → Notification Center, enable Push for desired events, save, then each receiving user must click **Enable Push on this device** once.

## Delivery model

- The dynamic matrix continues to resolve recipients by request owner, selected roles, and selected users.
- `emit_notification_event()` creates the durable notification and a push outbox row when Push is enabled for that event.
- The initiating app invokes `notification-push-dispatch` after the business event succeeds. Pending outbox rows are retried opportunistically on later notification activity.
- Expired browser subscriptions (404/410) are disabled automatically.

## iPhone/iPad

Web Push requires a supported iOS/iPadOS version and the web app installed to the Home Screen. The user must then grant notification permission from the installed PWA.
