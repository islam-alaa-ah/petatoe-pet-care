-- Read-only deployment gate: no changes to schema/data.
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sea_vibe_trips'
  AND column_name IN ('duration_hours','people_count');

SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid='public.sea_vibe_trips'::regclass
  AND pg_get_constraintdef(c.oid) ILIKE '%duration_hours%';

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS function_arguments,
  p.oid::regprocedure::text AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%sea_vibe%' OR pg_get_functiondef(p.oid) ILIKE '%sea_vibe_trips%')
ORDER BY p.proname;
