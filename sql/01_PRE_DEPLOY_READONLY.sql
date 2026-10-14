-- SEA VIBE R1 / production read-only gate
SELECT 'trip_count' AS check_name, count(*)::text AS result FROM public.sea_vibe_trips
UNION ALL SELECT 'trip_duration_type', data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sea_vibe_trips' AND column_name='duration_hours'
UNION ALL SELECT 'financial_view_exists', count(*)::text FROM pg_class WHERE oid=to_regclass('public.sea_vibe_trip_financials') AND relkind='v';

-- All direct database view dependencies on the duration column
SELECT dep_view.oid::regclass::text AS referencing_view
FROM pg_depend d
JOIN pg_rewrite rewrite ON rewrite.oid=d.objid
JOIN pg_class dep_view ON dep_view.oid=rewrite.ev_class
WHERE d.refobjid='public.sea_vibe_trips'::regclass
  AND d.refobjsubid=(SELECT attnum FROM pg_attribute WHERE attrelid='public.sea_vibe_trips'::regclass AND attname='duration_hours')
  AND dep_view.oid <> 'public.sea_vibe_trips'::regclass;

-- Historical financial invariant snapshot for independent reference (run before and after)
SELECT count(*) AS trip_rows,coalesce(sum(total_value),0) AS gross,
       coalesce(sum(trip_expenses),0) AS expenses,coalesce(sum(net_profit),0) AS profit
FROM public.sea_vibe_trip_financials;
SELECT count(*) AS permit_expenses,coalesce(sum(amount),0) AS permit_total
FROM public.sea_vibe_expenses WHERE system_key='sailing_permit';
SELECT count(*) AS permit_ledger_entries,coalesce(sum(points_delta),0) AS permit_points_delta
FROM public.sea_vibe_zawel_transactions WHERE transaction_type IN ('permit','permit_adjustment');
