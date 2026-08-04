\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.phase4a_assert(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Phase 4A integration: %', message; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase4a_expect_failure(statement text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase4a_product(
  slug text,
  product_name text,
  external_identity text,
  product_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'name', product_name,
    'brand', 'Phase 4A Fixture Brand',
    'kind', 'clothing',
    'category', 'coat',
    'color', 'navy',
    'current_price', 180,
    'currency', 'USD',
    'retailer', 'Phase 4A Fixture Retailer',
    'buy_url', COALESCE(product_url, 'https://shop.example.test/products/' || slug),
    'image_url', 'https://images.example.test/authorized/' || slug || '.jpg',
    'image_rights_basis', 'authorized',
    'source_type', 'manual',
    'source_name', 'Phase 4A database integration fixture',
    'source_url', 'https://shop.example.test/source',
    'verification_method', 'manual',
    'availability', 'in_stock',
    'external_id', external_identity,
    'affiliate', false,
    'vibe', 'refined utility',
    'price_tier', 'mid',
    'accessory_subtype', '',
    'fragrance_family', '',
    'description', 'Authorized isolated integration fixture; never production inventory.',
    'material', 'cotton',
    'fit', 'regular',
    'available_sizes', jsonb_build_array('S', 'M', 'L'),
    'source_updated_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'formality', 'smart_casual',
    'season', 'fall',
    'condition', 'new'
  );
$$;

GRANT EXECUTE ON FUNCTION public.phase4a_assert(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4a_expect_failure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4a_product(text, text, text, text) TO authenticated;

SELECT public.phase4a_assert(
  (SELECT count(*) = 51 FROM public.shop_catalog WHERE source = 'phase_2_curated_demo'),
  'all migrations must preserve exactly 51 Phase 2 demo rows'
);
SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shop_catalog' AND cmd = 'DELETE'
  ),
  'the catalog must not expose a browser DELETE policy'
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    'f4000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'phase4a-admin@example.test', 'integration-only-not-a-login-hash', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    'f4000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'phase4a-user@example.test', 'integration-only-not-a-login-hash', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    'f4000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'phase4a-deletion@example.test', 'integration-only-not-a-login-hash', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

UPDATE public.profiles SET is_admin = true
WHERE id IN (
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000003'
);

INSERT INTO public.shop_catalog (
  id, name, brand, kind, category, color, material, fit, season, formality, condition,
  price, current_price, currency, available_sizes, source_updated_at, retailer, buy_url,
  image_url, availability, external_id, source, source_type, source_name, source_url,
  image_rights_basis, verification_method, affiliate, vibe, price_tier, description,
  is_demo, archived, verified_at, last_checked_at
) VALUES (
  'f4100000-0000-4000-8000-000000000001', 'Database Guard Coat',
  'Phase 4A Fixture Brand', 'clothing', 'coat', 'navy', 'cotton', 'regular',
  'fall', 'smart_casual', 'new', 180, 180, 'USD', ARRAY['S','M','L'], now(),
  'Phase 4A Fixture Retailer', 'https://shop.example.test/products/database-guard',
  'https://images.example.test/authorized/database-guard.jpg', 'in_stock',
  'database-guard', 'real_catalog_import', 'manual', 'Phase 4A database fixture',
  'https://shop.example.test/source', 'authorized', 'manual', false,
  'refined utility', 'mid', 'Authorized database trigger fixture.', false, false, NULL, NULL
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000002', false);

SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    INSERT INTO public.catalog_import_batches (
      created_by, source_type, source_name, uploaded_file_name
    ) VALUES (
      'f4000000-0000-4000-8000-000000000002', 'manual_json', 'forbidden', 'forbidden.json'
    )
  $sql$),
  'non-admin direct import-table insertion must fail'
);
SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    INSERT INTO public.shop_catalog (
      id, name, brand, kind, category, color, material, fit, season, formality, condition,
      price, current_price, currency, available_sizes, source_updated_at, retailer, buy_url,
      image_url, availability, external_id, source, source_type, source_name, source_url,
      image_rights_basis, verification_method, affiliate, vibe, price_tier, description,
      is_demo, archived, verified_at, last_checked_at
    )
    SELECT
      'f4100000-0000-4000-8000-000000000099', name, brand, kind, category, color,
      material, fit, season, formality, condition, price, current_price, currency,
      available_sizes, source_updated_at, retailer,
      'https://shop.example.test/products/forbidden-nonadmin-write',
      'https://images.example.test/authorized/forbidden-nonadmin-write.jpg',
      availability, 'forbidden-nonadmin-write', source, source_type, source_name, source_url,
      image_rights_basis, verification_method, affiliate, vibe, price_tier, description,
      false, false, NULL, NULL
    FROM public.shop_catalog WHERE id = 'f4100000-0000-4000-8000-000000000001'
  $sql$),
  'non-admin direct catalog insertion must fail'
);
SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    SELECT public.verify_shop_catalog_item('f4100000-0000-4000-8000-000000000001')
  $sql$),
  'non-admin Verify must fail'
);

SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000001', false);

DO $$
DECLARE
  first_verified timestamptz;
  after_edit timestamptz;
  checked timestamptz;
BEGIN
  first_verified := public.verify_shop_catalog_item('f4100000-0000-4000-8000-000000000001');
  SELECT verified_at, last_checked_at INTO after_edit, checked
  FROM public.shop_catalog WHERE id = 'f4100000-0000-4000-8000-000000000001';
  PERFORM public.phase4a_assert(after_edit = first_verified AND checked = first_verified,
    'Verify must write both timestamps from one server time');

  UPDATE public.shop_catalog SET
    description = 'Noncritical description correction.', material = 'wool', fit = 'relaxed'
  WHERE id = 'f4100000-0000-4000-8000-000000000001';
  SELECT verified_at, last_checked_at INTO after_edit, checked
  FROM public.shop_catalog WHERE id = 'f4100000-0000-4000-8000-000000000001';
  PERFORM public.phase4a_assert(after_edit = first_verified AND checked = first_verified,
    'description, material, and fit-only edits must preserve verification');

  UPDATE public.shop_catalog SET current_price = 181, price = 181
  WHERE id = 'f4100000-0000-4000-8000-000000000001';
  SELECT verified_at, last_checked_at INTO after_edit, checked
  FROM public.shop_catalog WHERE id = 'f4100000-0000-4000-8000-000000000001';
  PERFORM public.phase4a_assert(after_edit IS NULL AND checked IS NULL,
    'critical price edits must clear both timestamps atomically');

  PERFORM public.verify_shop_catalog_item('f4100000-0000-4000-8000-000000000001');
  UPDATE public.shop_catalog SET availability = 'out_of_stock'
  WHERE id = 'f4100000-0000-4000-8000-000000000001';
  UPDATE public.shop_catalog SET availability = 'in_stock'
  WHERE id = 'f4100000-0000-4000-8000-000000000001';
  SELECT verified_at, last_checked_at INTO after_edit, checked
  FROM public.shop_catalog WHERE id = 'f4100000-0000-4000-8000-000000000001';
  PERFORM public.phase4a_assert(after_edit IS NULL AND checked IS NULL,
    'restocking must require reverification');

  PERFORM public.verify_shop_catalog_item('f4100000-0000-4000-8000-000000000001');
  UPDATE public.shop_catalog SET archived = true
  WHERE id = 'f4100000-0000-4000-8000-000000000001';
  UPDATE public.shop_catalog SET archived = false
  WHERE id = 'f4100000-0000-4000-8000-000000000001';
  SELECT verified_at, last_checked_at INTO after_edit, checked
  FROM public.shop_catalog WHERE id = 'f4100000-0000-4000-8000-000000000001';
  PERFORM public.phase4a_assert(after_edit IS NULL AND checked IS NULL,
    'restoring an archived product must require reverification');
END;
$$;

SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    UPDATE public.shop_catalog SET verified_at = now(), last_checked_at = now()
    WHERE id = 'f4100000-0000-4000-8000-000000000001'
  $sql$),
  'direct verification timestamp writes must fail'
);
DO $$
DECLARE
  affected integer;
  original_description text;
BEGIN
  SELECT description INTO original_description FROM public.shop_catalog
  WHERE id = '20000000-0000-4000-8000-000000000001';
  UPDATE public.shop_catalog SET description = 'forbidden demo edit'
  WHERE id = '20000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM public.phase4a_assert(
    affected = 0 AND (SELECT description = original_description FROM public.shop_catalog
      WHERE id = '20000000-0000-4000-8000-000000000001'),
    'authenticated demo updates must be denied without changing the row'
  );
  PERFORM public.phase4a_assert(
    public.phase4a_expect_failure($sql$
      DELETE FROM public.shop_catalog
      WHERE id = '20000000-0000-4000-8000-000000000001'
    $sql$) AND EXISTS (SELECT 1 FROM public.shop_catalog
      WHERE id = '20000000-0000-4000-8000-000000000001'),
    'authenticated catalog deletion must be denied without deleting the demo row'
  );
END;
$$;

DO $$
DECLARE
  before_batches integer;
  after_batches integer;
BEGIN
  SELECT count(*) INTO before_batches FROM public.catalog_import_batches;
  BEGIN
    PERFORM public.stage_catalog_import_batch(
      jsonb_build_object(
        'source_type', 'manual_json', 'source_name', 'atomic failure fixture',
        'uploaded_file_name', 'atomic-failure.json'
      ),
      jsonb_build_array(jsonb_build_object(
        'row_number', 'not-an-integer', 'raw_data', public.phase4a_product('atomic', 'Atomic Coat', 'atomic'),
        'normalized_data', public.phase4a_product('atomic', 'Atomic Coat', 'atomic'),
        'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
      ))
    );
    RAISE EXCEPTION 'stage unexpectedly succeeded';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;
  SELECT count(*) INTO after_batches FROM public.catalog_import_batches;
  PERFORM public.phase4a_assert(before_batches = after_batches,
    'failed staging must roll back batch and row creation together');
END;
$$;

DO $$
DECLARE
  result jsonb;
  target_batch_id uuid;
  row_one uuid;
  row_two uuid;
  row_invalid uuid;
  row_later uuid;
BEGIN
  result := public.stage_catalog_import_batch(
    jsonb_build_object(
      'source_type', 'manual_json', 'source_name', 'partial import fixture',
      'uploaded_file_name', 'partial-import.json'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'row_number', 1, 'raw_data', public.phase4a_product('partial-one', 'Partial Coat', 'partial-one'),
        'normalized_data', public.phase4a_product('partial-one', 'Partial Coat', 'partial-one'),
        'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
      ),
      jsonb_build_object(
        'row_number', 2,
        'raw_data', public.phase4a_product('partial-two', 'Partial Coat', 'partial-two'),
        'normalized_data', public.phase4a_product('partial-two', 'Partial Coat', 'partial-two'),
        'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
      ),
      jsonb_build_object(
        'row_number', 3, 'raw_data', '{}'::jsonb, 'normalized_data', '{}'::jsonb,
        'validation_errors', jsonb_build_array('name: Required'), 'warnings', '[]'::jsonb
      ),
      jsonb_build_object(
        'row_number', 4, 'raw_data', public.phase4a_product('partial-later', 'Later Coat', 'partial-later'),
        'normalized_data', public.phase4a_product('partial-later', 'Later Coat', 'partial-later'),
        'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
      )
    )
  );
  target_batch_id := (result->>'id')::uuid;
  PERFORM public.phase4a_assert((result->>'duplicates')::integer = 1,
    'only the actual descriptive duplicate should count');
  SELECT row.id INTO row_one FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id AND row.row_number = 1;
  SELECT row.id INTO row_two FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id AND row.row_number = 2;
  SELECT row.id INTO row_invalid FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id AND row.row_number = 3;
  SELECT row.id INTO row_later FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id AND row.row_number = 4;

  PERFORM public.phase4a_assert(
    public.phase4a_expect_failure(format(
      'SELECT public.review_catalog_import_row(%L::uuid, ''approved'')', row_two
    )), 'manual-review rows must not approve before resolution'
  );
  PERFORM public.phase4a_assert(
    public.phase4a_expect_failure(format(
      'SELECT public.resolve_catalog_import_row(%L::uuid, ''create'', NULL, false)', row_two
    )), 'manual create must require explicit confirmation'
  );
  PERFORM public.resolve_catalog_import_row(row_two, 'create', NULL, true);
  PERFORM public.review_catalog_import_row(row_one, 'approved');
  PERFORM public.review_catalog_import_row(row_two, 'approved');
  result := public.import_catalog_batch(target_batch_id);
  PERFORM public.phase4a_assert(
    result->>'status' = 'partially_imported' AND (result->>'created')::integer = 2
      AND (result->>'remaining')::integer = 2,
    'first import pass must create only approved rows and remain partial'
  );

  PERFORM public.review_catalog_import_row(row_later, 'approved');
  result := public.import_catalog_batch(target_batch_id);
  PERFORM public.phase4a_assert(
    (result->>'created')::integer = 1 AND (result->>'remaining')::integer = 1,
    'second import pass must import the newly approved row exactly once'
  );
  PERFORM public.review_catalog_import_row(row_invalid, 'rejected');
  PERFORM public.phase4a_assert(
    (SELECT status = 'imported' FROM public.catalog_import_batches WHERE id = target_batch_id),
    'the batch must become terminal after every row is terminal'
  );
  PERFORM public.phase4a_assert(
    (SELECT count(*) = 3 FROM public.shop_catalog
      WHERE external_id IN ('partial-one', 'partial-two', 'partial-later')),
    'repeat imports must create each product once'
  );
  PERFORM public.phase4a_assert(
    public.phase4a_expect_failure(format(
      'SELECT public.import_catalog_batch(%L::uuid)', target_batch_id
    )), 'a terminal batch with no approved rows must not import again'
  );
END;
$$;

DO $$
DECLARE
  result jsonb;
  target_batch_id uuid;
  row_id uuid;
  target_id uuid;
BEGIN
  SELECT id INTO target_id FROM public.shop_catalog WHERE external_id = 'partial-one';
  result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'manual update outcome',
      'uploaded_file_name', 'manual-update.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1,
      'raw_data', public.phase4a_product('manual-update', 'Partial Coat', 'partial-update'),
      'normalized_data', public.phase4a_product('manual-update', 'Partial Coat', 'partial-update'),
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  target_batch_id := (result->>'id')::uuid;
  SELECT row.id INTO row_id FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id;
  PERFORM public.phase4a_assert(
    (SELECT proposed_action = 'manual_review' FROM public.catalog_import_rows WHERE id = row_id),
    'descriptive live matches must require a manual outcome'
  );
  PERFORM public.resolve_catalog_import_row(row_id, 'update', target_id, false);
  PERFORM public.review_catalog_import_row(row_id, 'approved');
  result := public.import_catalog_batch(target_batch_id);
  PERFORM public.phase4a_assert(
    (result->>'updated')::integer = 1
      AND (SELECT external_id = 'partial-update' FROM public.shop_catalog WHERE id = target_id),
    'manual update must modify the selected existing non-demo product'
  );

  result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'manual skip outcome',
      'uploaded_file_name', 'manual-skip.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1,
      'raw_data', public.phase4a_product('manual-skip', 'Partial Coat', 'partial-skip'),
      'normalized_data', public.phase4a_product('manual-skip', 'Partial Coat', 'partial-skip'),
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  target_batch_id := (result->>'id')::uuid;
  SELECT row.id INTO row_id FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id;
  PERFORM public.resolve_catalog_import_row(row_id, 'skip', NULL, false);
  PERFORM public.review_catalog_import_row(row_id, 'approved');
  result := public.import_catalog_batch(target_batch_id);
  PERFORM public.phase4a_assert(
    (result->>'skipped')::integer = 1
      AND (SELECT review_status = 'skipped' FROM public.catalog_import_rows WHERE id = row_id)
      AND NOT EXISTS (SELECT 1 FROM public.shop_catalog WHERE external_id = 'partial-skip'),
    'manual skip must become terminal without a catalog write'
  );
END;
$$;

DO $$
DECLARE
  result jsonb;
  first_batch uuid;
  second_batch uuid;
  first_row uuid;
  second_row uuid;
BEGIN
  result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'stale plan A',
      'uploaded_file_name', 'stale-a.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1, 'raw_data', public.phase4a_product('stale-a', 'Stale Plan Coat', 'stale-plan'),
      'normalized_data', public.phase4a_product('stale-a', 'Stale Plan Coat', 'stale-plan'),
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  first_batch := (result->>'id')::uuid;
  result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'stale plan B',
      'uploaded_file_name', 'stale-b.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1, 'raw_data', public.phase4a_product('stale-b', 'Stale Plan Coat', 'stale-plan'),
      'normalized_data', public.phase4a_product('stale-b', 'Stale Plan Coat', 'stale-plan'),
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  second_batch := (result->>'id')::uuid;
  SELECT id INTO first_row FROM public.catalog_import_rows WHERE batch_id = first_batch;
  SELECT id INTO second_row FROM public.catalog_import_rows WHERE batch_id = second_batch;
  PERFORM public.review_catalog_import_row(first_row, 'approved');
  PERFORM public.review_catalog_import_row(second_row, 'approved');
  PERFORM public.import_catalog_batch(first_batch);
  result := public.import_catalog_batch(second_batch);
  PERFORM public.phase4a_assert(
    (result->>'blocked')::boolean AND (SELECT review_status = 'pending'
      AND proposed_action = 'manual_review' FROM public.catalog_import_rows WHERE id = second_row),
    'an unexpected live identity must return the row to manual review without catalog writes'
  );
  PERFORM public.phase4a_assert(
    (SELECT count(*) = 1 FROM public.shop_catalog WHERE external_id = 'stale-plan'),
    'stale cross-batch plans must not create a duplicate product'
  );
END;
$$;

DO $$
DECLARE
  result jsonb;
  target_batch_id uuid;
  row_id uuid;
  before_products integer;
BEGIN
  SELECT count(*) INTO before_products FROM public.shop_catalog;
  result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'bypass assertion',
      'uploaded_file_name', 'bypass.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1,
      'raw_data', public.phase4a_product('bypass', 'Bypass Coat', 'bypass'),
      'normalized_data', public.phase4a_product('bypass', 'Bypass Coat', 'bypass') - 'name',
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  target_batch_id := (result->>'id')::uuid;
  SELECT row.id INTO row_id FROM public.catalog_import_rows row
  WHERE row.batch_id = target_batch_id;
  PERFORM public.review_catalog_import_row(row_id, 'approved');
  PERFORM public.phase4a_assert(
    public.phase4a_expect_failure(format(
      'SELECT public.import_catalog_batch(%L::uuid)', target_batch_id
    )),
    'database validation must reject normalized payloads that bypass application validation'
  );
  PERFORM public.phase4a_assert(
    (SELECT count(*) = before_products FROM public.shop_catalog),
    'database assertion failure must not partially mutate the catalog'
  );
END;
$$;

SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000003', false);

CREATE TEMP TABLE phase4a_account_fixture (
  fixture_name text PRIMARY KEY,
  fixture_id uuid NOT NULL
);

DO $$
DECLARE
  imported_result jsonb;
  imported_batch uuid;
  draft_result jsonb;
  draft_batch uuid;
  imported_row uuid;
  draft_row uuid;
  report_id uuid;
BEGIN
  imported_result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'account import',
      'uploaded_file_name', 'account-import.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1, 'raw_data', public.phase4a_product('account-product', 'Account Coat', 'account-product'),
      'normalized_data', public.phase4a_product('account-product', 'Account Coat', 'account-product'),
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  imported_batch := (imported_result->>'id')::uuid;
  SELECT id INTO imported_row FROM public.catalog_import_rows WHERE batch_id = imported_batch;
  PERFORM public.review_catalog_import_row(imported_row, 'approved');
  PERFORM public.import_catalog_batch(imported_batch);

  draft_result := public.stage_catalog_import_batch(
    jsonb_build_object('source_type', 'manual_json', 'source_name', 'account draft',
      'uploaded_file_name', 'account-draft.json'),
    jsonb_build_array(jsonb_build_object(
      'row_number', 1, 'raw_data', public.phase4a_product('account-draft', 'Account Draft Coat', 'account-draft'),
      'normalized_data', public.phase4a_product('account-draft', 'Account Draft Coat', 'account-draft'),
      'validation_errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ))
  );
  draft_batch := (draft_result->>'id')::uuid;
  SELECT id INTO draft_row FROM public.catalog_import_rows WHERE batch_id = draft_batch;
  INSERT INTO public.content_reports (reporter_id, target_type, reason, details)
  VALUES (
    'f4000000-0000-4000-8000-000000000003', 'other', 'integration',
    'account deletion screenshot fixture'
  )
  RETURNING id INTO report_id;

  INSERT INTO phase4a_account_fixture (fixture_name, fixture_id) VALUES
    ('imported_batch', imported_batch),
    ('imported_row', imported_row),
    ('draft_batch', draft_batch),
    ('draft_row', draft_row),
    ('report', report_id);
END;
$$;

RESET ROLE;

DO $$
DECLARE
  owner_id uuid := 'f4000000-0000-4000-8000-000000000003';
  imported_batch uuid;
  imported_row uuid;
  draft_batch uuid;
  draft_row uuid;
  report_id uuid;
  report_path text;
  draft_path text;
  imported_path text;
BEGIN
  SELECT fixture_id INTO imported_batch FROM phase4a_account_fixture WHERE fixture_name = 'imported_batch';
  SELECT fixture_id INTO imported_row FROM phase4a_account_fixture WHERE fixture_name = 'imported_row';
  SELECT fixture_id INTO draft_batch FROM phase4a_account_fixture WHERE fixture_name = 'draft_batch';
  SELECT fixture_id INTO draft_row FROM phase4a_account_fixture WHERE fixture_name = 'draft_row';
  SELECT fixture_id INTO report_id FROM phase4a_account_fixture WHERE fixture_name = 'report';
  report_path := owner_id::text || '/' || report_id::text ||
    '/f4200000-0000-4000-8000-000000000001.png';
  draft_path := 'drafts/' || owner_id::text || '/' || draft_batch::text || '/' ||
    draft_row::text || '/f4200000-0000-4000-8000-000000000002.jpg';
  imported_path := 'drafts/' || owner_id::text || '/' || imported_batch::text || '/' ||
    imported_row::text || '/f4200000-0000-4000-8000-000000000003.jpg';

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES
    ('reports', report_path, owner_id::text, '{"mimetype":"image/png"}'::jsonb),
    ('catalog-products', draft_path, owner_id::text, '{"mimetype":"image/jpeg"}'::jsonb),
    ('catalog-products', imported_path, owner_id::text, '{"mimetype":"image/jpeg"}'::jsonb);
  UPDATE public.content_reports SET attachment_path = report_path WHERE id = report_id;
  UPDATE public.shop_catalog
  SET image_url = 'https://phase4a-fixture.supabase.co/storage/v1/object/public/catalog-products/' ||
    imported_path
  WHERE external_id = 'account-product';
END;
$$;

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
BEGIN
  SELECT fixture_id INTO imported_batch FROM phase4a_account_fixture WHERE fixture_name = 'imported_batch';
  SELECT fixture_id INTO imported_row FROM phase4a_account_fixture WHERE fixture_name = 'imported_row';
  SELECT fixture_id INTO draft_batch FROM phase4a_account_fixture WHERE fixture_name = 'draft_batch';
  SELECT fixture_id INTO draft_row FROM phase4a_account_fixture WHERE fixture_name = 'draft_row';
  SELECT fixture_id INTO report_id FROM phase4a_account_fixture WHERE fixture_name = 'report';
  report_path := owner_id::text || '/' || report_id::text ||
    '/f4200000-0000-4000-8000-000000000001.png';
  draft_path := 'drafts/' || owner_id::text || '/' || draft_batch::text || '/' ||
    draft_row::text || '/f4200000-0000-4000-8000-000000000002.jpg';
  imported_path := 'drafts/' || owner_id::text || '/' || imported_batch::text || '/' ||
    imported_row::text || '/f4200000-0000-4000-8000-000000000003.jpg';

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

  DELETE FROM storage.objects
  WHERE bucket_id = 'reports'
    AND name IN (SELECT jsonb_array_elements_text(cleanup_paths->'reports'));
  DELETE FROM storage.objects
  WHERE bucket_id = 'catalog-products'
    AND name IN (SELECT jsonb_array_elements_text(cleanup_paths->'catalogProducts'));
END;
$$;

RESET ROLE;

SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'reports'
      AND name LIKE 'f4000000-0000-4000-8000-000000000003/%'
  ),
  'the report screenshot must be removable before auth-user deletion'
);
SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'catalog-products'
      AND name LIKE 'drafts/f4000000-0000-4000-8000-000000000003/%'
      AND name NOT LIKE '%/f4200000-0000-4000-8000-000000000003.jpg'
  ),
  'the uncommitted catalog draft must be removable before auth-user deletion'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'catalog-products'
      AND name LIKE '%/f4200000-0000-4000-8000-000000000003.jpg'
  ),
  'the imported product image must remain while shop_catalog references it'
);

SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    UPDATE public.shop_catalog SET description = 'forbidden direct demo edit'
    WHERE id = '20000000-0000-4000-8000-000000000001'
  $sql$),
  'the demo immutability trigger must reject privileged direct updates'
);
SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    DELETE FROM public.shop_catalog WHERE id = '20000000-0000-4000-8000-000000000001'
  $sql$),
  'the demo immutability trigger must reject privileged direct deletes'
);
DELETE FROM auth.users WHERE id = 'f4000000-0000-4000-8000-000000000003';

SELECT public.phase4a_assert(
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f4000000-0000-4000-8000-000000000003'),
  'auth user deletion must succeed after private object cleanup'
);
SELECT public.phase4a_assert(
  EXISTS (SELECT 1 FROM public.shop_catalog WHERE external_id = 'account-product'),
  'auth user deletion must not cascade to an imported catalog product'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'catalog-products'
      AND name LIKE '%/f4200000-0000-4000-8000-000000000003.jpg'
  ),
  'the imported product image must remain after auth user deletion'
);
SELECT public.phase4a_assert(
  (SELECT count(*) = 51 FROM public.shop_catalog WHERE source = 'phase_2_curated_demo'),
  'integration behavior must leave all 51 demos intact'
);
SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('catalog product images admin update', 'catalog product images admin delete')
  ),
  'broad catalog image update/delete policies must be absent'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'catalog product images owner cleanup'
      AND qual LIKE '%shop_catalog%'
  ),
  'catalog image deletion must be reference-safe'
);

DROP FUNCTION public.phase4a_product(text, text, text, text);
DROP FUNCTION public.phase4a_expect_failure(text);
DROP FUNCTION public.phase4a_assert(boolean, text);
