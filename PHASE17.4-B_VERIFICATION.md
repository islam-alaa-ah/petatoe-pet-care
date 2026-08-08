# Phase 17.4-B — Reference Data Request Optimization

## Confirmed Root Cause

Reference data was requested from three Supabase tables together:

- `sales_representatives`
- `interest_categories`
- `no_sale_reasons`

The application had only boolean loading flags. Concurrent callers returned
without sharing the active promise, while the service had no cache or in-flight
deduplication. Navigation, reports, settings and post-save refreshes could
therefore produce repeated identical requests.

## Implemented

- Shared application-level load promise.
- Five-minute reference-data freshness window.
- Service-level five-minute cache per table/filter.
- In-flight request deduplication per table/filter.
- Explicit cache invalidation after reference-data mutations.
- Forced refresh invalidates service cache before loading.
- Existing UI and data formats remain unchanged.

## Modified Files Only

- `assets/js/app.js`
- `assets/js/reference-data-service.js`
- `PHASE17.4-B_VERIFICATION.md`

## Verification

1. Open DevTools → Network → Fetch/XHR.
2. Hard refresh the application.
3. Navigate repeatedly between:
   - Dashboard
   - Representatives
   - Reference Data
   - Reports
4. Filter by:
   - `sales_representatives`
   - `interest_categories`
   - `no_sale_reasons`
5. Expected:
   - one initial request per table
   - no duplicate requests during repeated navigation within five minutes
   - saving/deleting reference data intentionally causes one fresh reload
