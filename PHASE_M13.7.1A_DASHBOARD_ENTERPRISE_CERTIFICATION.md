# Phase M13.7.1A — Dashboard Enterprise Offline Certification

## Root Cause

The dashboard rendering functions already derived every KPI, chart, recent-customer card, and attention follow-up list from the in-memory `customers`, `followups`, and `quotations` domain arrays. They did not query Supabase directly.

However, the authenticated startup path called all three domain loaders with `force=true`. In each service this bypassed the IndexedDB read. During a cold launch without connectivity, no cached fallback object had been loaded, so the request could fail before the dashboard received its persisted data.

## Correction

The authenticated startup path is now cache-first:

- Customer, follow-up, quotation, and reference loaders run concurrently.
- Each loader is called with `force=false`.
- Cached data is returned immediately.
- When online, each service performs its registered Delta Sync in the background.
- Cache update events rerender the affected screens and dashboard.
- Daily Operations also starts without forced network reconciliation.

## Dashboard Coverage

| Dashboard component | Source | Offline status | Delta refresh |
|---|---|---:|---:|
| Customer KPIs | Customers Smart Cache | Certified | Yes |
| Follow-up KPIs | Followups Smart Cache | Certified | Yes |
| Quotation KPIs and values | Quotations Smart Cache | Certified | Yes |
| Representative performance | The three cached domains + cached reference records | Certified | Yes |
| Interest analytics | Customers Smart Cache | Certified | Yes |
| Quotation status analytics | Quotations Smart Cache | Certified | Yes |
| No-sale analysis | Customers + quotations caches | Certified | Yes |
| Activity trend | The three cached domains | Certified | Yes |
| Recent customers | Customers Smart Cache | Certified | Yes |
| Attention follow-ups | Followups + customers caches | Certified | Yes |

## Enforcement

Run:

```bash
npm run dashboard:offline:check
```

The check fails if the dashboard gains direct data access, loses its cache event listeners, or authenticated startup begins forcing network-only loading again.

## Version

- Version: 18.5.2
- Build: 18502
- Service Worker cache: `kyum-crm-pwa-18-5-2-m13-7-1a`
