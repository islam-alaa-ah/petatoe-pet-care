# Phase 17.3-D Verification Compatibility Fix

## Root Cause

The read-only verification query used a dynamic PostgreSQL array slice:

`i.indkey::smallint[][0:cardinality(fk.fk_columns) - 1]`

PostgreSQL returned:

`ERROR 42601: syntax error at or near ":"`

The Phase 17.3-D index migration is not affected. The error exists only in the
foreign-key index check inside the verification script.

## Fix

The query now compares the foreign-key columns with the leading index columns
by ordinal position using `unnest(... with ordinality)`, without dynamic array
slicing.

## Execution

1. Do not rerun the Phase 17.3-D migration.
2. Open the corrected verification SQL.
3. Replace the previous verification query and run the full corrected file.
4. Confirm the final summary shows:
   - `missing_index_count = 0`
   - `overall_result = PASS`
