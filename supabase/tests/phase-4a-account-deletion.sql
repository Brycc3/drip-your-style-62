\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000003', false);

DO $$
DECLARE
  cleanup_paths jsonb;
  imported_batch uuid;
  imported_row uuid;
  draft_batch uuid;
  draft_row uuid;
  report_id uuid;
  owner_id uuid := 'f4000000-0000-4000-8000-000000000003';
  report_path text;
  draft_path text;
  imported_path text;
  imported_product jsonb;
BEGIN
  SELECT id INTO imported_batch
  FROM public.catalog_import_batches WHERE source_name = 'account import';
  SELECT id, normalized_data INTO imported_row, imported_product
  FROM public.catalog_import_rows WHERE batch_id = imported_batch;
  SELECT id INTO draft_batch
  FROM public.catalog_import_batches WHERE source_name = 'account draft';
  SELECT id INTO draft_row FROM public.catalog_import_rows WHERE batch_id = draft_batch;
  SELECT id INTO report_id FROM public.content_reports
  WHERE details = 'account deletion screenshot fixture';

  report_path := owner_id::text || '/' || report_id::text ||
    '/f4200000-0000-4000-8000-000000000001.png';
  draft_path := 'drafts/' || owner_id::text || '/' || draft_batch::text || '/' ||
    draft_row::text || '/f4200000-0000-4000-8000-000000000002.jpg';
  imported_path := 'drafts/' || owner_id::text || '/' || imported_batch::text || '/' ||
    imported_row::text || '/f4200000-0000-4000-8000-000000000003.jpg';
  imported_product := jsonb_set(
    imported_product,
    '{image_url}',
    to_jsonb('https://phase4a-fixture.supabase.co/storage/v1/object/public/catalog-products/' ||
      imported_path)
  );

  PERFORM public.update_catalog_import_row_and_replan(
    imported_row, imported_product, ARRAY[]::text[], ARRAY[]::text[]
  );
  PERFORM public.review_catalog_import_row(imported_row, 'approved');
  PERFORM public.import_catalog_batch(imported_batch);
  PERFORM public.attach_problem_report_screenshot(report_id, report_path);

  PERFORM public.prepare_catalog_import_account_deletion();
  cleanup_paths := public.get_my_account_storage_cleanup_paths();
  PERFORM public.phase4a_assert(
    NOT EXISTS (SELECT 1 FROM public.catalog_import_batches WHERE id = draft_batch),
    'uncommitted account import batches must be deleted'
  );
  PERFORM public.phase4a_assert(
    (SELECT created_by IS NULL FROM public.catalog_import_batches WHERE id = imported_batch),
    'import audit batches must be anonymized rather than deleted'
  );
  PERFORM public.phase4a_assert(
    EXISTS (SELECT 1 FROM public.shop_catalog WHERE external_id = 'account-product'),
    'account deletion preparation must preserve imported products'
  );
  PERFORM public.phase4a_assert(
    EXISTS (SELECT 1 FROM public.content_reports
      WHERE id = report_id AND reporter_id IS NULL AND attachment_path IS NULL),
    'private report ownership and attachments must be unlinked'
  );
  PERFORM public.phase4a_assert(
    cleanup_paths->'reports' ? report_path
      AND cleanup_paths->'catalogProducts' ? draft_path,
    'cleanup paths must include the report screenshot and uncommitted product draft'
  );
  PERFORM public.phase4a_assert(
    NOT (cleanup_paths->'catalogProducts' ? imported_path),
    'cleanup paths must exclude an imported product image still referenced by shop_catalog'
  );
END;
$$;

RESET ROLE;
