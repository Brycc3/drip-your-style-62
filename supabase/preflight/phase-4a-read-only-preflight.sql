-- Phase 4A read-only production preflight.
-- Safe to run before reviewing the forward-only reconciliation migration.
-- Every statement is SELECT-only and does not change database or storage state.

SELECT
  count(*) FILTER (WHERE source = 'phase_2_curated_demo') AS protected_demo_count,
  count(*) FILTER (
    WHERE source = 'phase_2_curated_demo'
      AND (
        is_demo IS DISTINCT FROM true
        OR id::text !~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$'
        OR image_url !~ '^/catalog/phase-2/[a-z0-9-]+\.svg$'
      )
  ) AS invalid_demo_count,
  count(*) FILTER (WHERE is_demo = true) AS all_demo_count,
  count(DISTINCT image_url) FILTER (WHERE source = 'phase_2_curated_demo')
    AS distinct_protected_demo_images
FROM public.shop_catalog;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN (
  'shop_catalog', 'catalog_import_batches', 'catalog_import_rows'
)
ORDER BY tablename, policyname;

SELECT
  event_object_schema,
  event_object_table,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('shop_catalog', 'catalog_import_rows')
ORDER BY event_object_table, trigger_name, event_manipulation;

SELECT
  routine_name,
  routine_type,
  security_type,
  data_type,
  pg_get_functiondef(to_regprocedure(
    CASE routine_name
      WHEN 'verify_shop_catalog_item' THEN 'public.verify_shop_catalog_item(uuid)'
      WHEN 'attach_problem_report_screenshot'
        THEN 'public.attach_problem_report_screenshot(uuid,text)'
      WHEN 'protect_demo_catalog_rows' THEN 'public.protect_demo_catalog_rows()'
      WHEN 'protect_catalog_verification_timestamps'
        THEN 'public.protect_catalog_verification_timestamps()'
      WHEN 'reject_direct_catalog_verification_writes'
        THEN 'public.reject_direct_catalog_verification_writes()'
      WHEN 'import_catalog_batch' THEN 'public.import_catalog_batch(uuid)'
    END
  )) AS definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'verify_shop_catalog_item',
    'attach_problem_report_screenshot',
    'protect_demo_catalog_rows',
    'protect_catalog_verification_timestamps',
    'reject_direct_catalog_verification_writes',
    'import_catalog_batch'
  )
ORDER BY routine_name;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname LIKE 'reports %'
    OR policyname LIKE 'catalog product images %'
  )
ORDER BY policyname;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('reports', 'catalog-products')
ORDER BY id;

SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;
