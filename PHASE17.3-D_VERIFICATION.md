# Phase 17.3-D — Database Performance & Index Alignment

## Root Cause

The application uses repeated filters and ordered lists such as:

- customers ordered by `created_at`
- followups filtered by `customer_id` and ordered by `contact_date`
- quotations filtered by customer, representative or status and ordered by date
- active screens ordered by `display_order`
- active users/reference data ordered by name
- backup history ordered by `created_at`
- daily operations filtered by work date, user, status and task

The existing database had mostly single-column indexes. Several common
multi-column query patterns and foreign-key lookup paths were not covered.

## Implemented

- Composite indexes aligned with verified frontend query patterns.
- Partial indexes for nullable foreign keys and open operational records.
- Foreign-key lookup indexes for customer, quotation, backup and daily modules.
- Planner statistics refresh using `ANALYZE`.
- Read-only verification for:
  - required Phase 17.3-D indexes
  - unindexed foreign keys
  - duplicate index definitions
  - table/index usage statistics
  - planner statistics freshness

## Modified Files Only

- `supabase/migrations/phase17_3_d_database_performance.sql`
- `supabase/verification/phase17_3_d_database_performance_verification.sql`
- `PHASE17.3-D_VERIFICATION.md`

## Execution

1. Run the migration file in Supabase SQL Editor.
2. Confirm the immediate index inventory returns rows without errors.
3. Run the verification file.
4. Confirm the final summary shows:
   - `missing_index_count = 0`
   - `overall_result = PASS`

## Notes

- No records are inserted, updated or deleted.
- New index usage counters may remain zero until normal application traffic runs.
- `ANALYZE` updates planner statistics only.
