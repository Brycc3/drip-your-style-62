-- ============================================================================
-- Phase 4A: forward-only Pass 3 reconciliation + verified catalog ingestion
--
-- This migration intentionally does not edit either previously shipped
-- migration. It can be reviewed and applied after the weaker 20260730025301
-- migration. Codex does not apply it.
-- ============================================================================

-- Fail closed before changing catalog security unless all protected Phase 2
-- rows still have the reviewed identities and project-owned image paths.
DO $$
DECLARE
  protected_demo_count integer;
  invalid_demo_count integer;
BEGIN
  SELECT count(*) INTO protected_demo_count
  FROM public.shop_catalog
  WHERE source = 'phase_2_curated_demo';

  SELECT count(*) INTO invalid_demo_count
  FROM public.shop_catalog
  WHERE source = 'phase_2_curated_demo'
    AND (
      is_demo IS DISTINCT FROM true
      OR id::text !~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$'
      OR image_url !~ '^/catalog/phase-2/[a-z0-9-]+\.svg$'
    );

  IF protected_demo_count <> 51 OR invalid_demo_count <> 0 THEN
    RAISE EXCEPTION
      'Phase 4A preflight failed: expected exactly 51 intact protected Phase 2 demos';
  END IF;
END $$;

ALTER TABLE public.shop_catalog
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS available_sizes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

ALTER TABLE public.shop_catalog
  DROP CONSTRAINT IF EXISTS shop_catalog_currency_check;
ALTER TABLE public.shop_catalog
  ADD CONSTRAINT shop_catalog_currency_check
  CHECK (currency IN ('USD', 'CAD', 'EUR', 'GBP', 'AUD')) NOT VALID;

-- --------------------------------------------------------------------------
-- Strong Pass 3 catalog protections. These replace the weak live RPC behavior.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_demo_catalog_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_demo = true OR OLD.source = 'phase_2_curated_demo' THEN
    RAISE EXCEPTION 'Demo catalog rows are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_demo_catalog_rows() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_demo_catalog_rows ON public.shop_catalog;
CREATE TRIGGER protect_demo_catalog_rows
  BEFORE UPDATE OR DELETE ON public.shop_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_demo_catalog_rows();

DROP POLICY IF EXISTS "catalog admin insert" ON public.shop_catalog;
CREATE POLICY "catalog admin insert"
  ON public.shop_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND is_demo = false
    AND source IS DISTINCT FROM 'phase_2_curated_demo'
    AND verified_at IS NULL
    AND last_checked_at IS NULL
  );

DROP POLICY IF EXISTS "catalog admin update" ON public.shop_catalog;
CREATE POLICY "catalog admin update"
  ON public.shop_catalog FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND is_demo = false
    AND source IS DISTINCT FROM 'phase_2_curated_demo'
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND is_demo = false
    AND source IS DISTINCT FROM 'phase_2_curated_demo'
  );

-- Archive or change inventory state; browser roles cannot delete catalog rows.
DROP POLICY IF EXISTS "catalog admin delete" ON public.shop_catalog;

REVOKE INSERT, UPDATE ON public.shop_catalog FROM authenticated;
REVOKE INSERT (verified_at, last_checked_at),
  UPDATE (verified_at, last_checked_at)
ON public.shop_catalog FROM authenticated;
GRANT INSERT (
  name, brand, kind, category, color, material, fit, season, formality, price,
  condition, source, image_url, tags, description, current_price, original_price,
  currency, available_sizes, source_updated_at, availability, external_id,
  retailer, buy_url, is_demo, source_type, source_name, source_url,
  image_rights_basis, verification_method, affiliate, affiliate_disclosure,
  vibe, price_tier, accessory_subtype, fragrance_family, archived
) ON public.shop_catalog TO authenticated;
GRANT UPDATE (
  name, brand, kind, category, color, material, fit, season, formality, price,
  condition, source, image_url, tags, description, current_price, original_price,
  currency, available_sizes, source_updated_at, availability, external_id,
  retailer, buy_url, source_type, source_name, source_url, image_rights_basis,
  verification_method, affiliate, affiliate_disclosure, vibe, price_tier,
  accessory_subtype, fragrance_family, archived
) ON public.shop_catalog TO authenticated;

ALTER TABLE public.shop_catalog
  DROP CONSTRAINT IF EXISTS shop_catalog_category_kind_check;
ALTER TABLE public.shop_catalog
  ADD CONSTRAINT shop_catalog_category_kind_check CHECK (
    (kind = 'clothing' AND category IN (
      'top', 'tee', 'hoodie', 'shirt', 'polo', 'bottom', 'trousers', 'cargos',
      'joggers', 'shorts', 'denim', 'outerwear', 'bomber', 'chore', 'jacket', 'coat'
    ))
    OR (kind = 'shoes' AND category IN (
      'shoes', 'sneaker', 'jordan', 'vomero', 'new_balance', 'loafer', 'boot', 'runner'
    ))
    OR (kind = 'fragrance' AND category IN ('fragrance', 'cologne', 'edp', 'edt', 'parfum'))
    OR (kind = 'accessory' AND category IN (
      'accessory', 'bag', 'bags', 'belt', 'belts', 'beanie', 'bracelet', 'bracelets',
      'cap', 'chain', 'chains', 'earring', 'earrings', 'glasses', 'grill', 'grills',
      'hat', 'hats', 'jewelry', 'necklace', 'necklaces', 'prescription_glasses',
      'ring', 'rings', 'scarf', 'scarves', 'sock', 'socks', 'sunglasses', 'watch',
      'watches', 'wallet', 'wallets'
    ))
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.protect_catalog_verification_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  verify_function_owner name;
  verification_write_allowed boolean;
  verification_critical_change boolean;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO verify_function_owner
  FROM pg_proc
  WHERE oid = 'public.verify_shop_catalog_item(uuid)'::regprocedure;

  verification_write_allowed :=
    current_setting('drip.catalog_verification_write', true) = 'allowed'
    AND current_user = verify_function_owner;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified_at IS NOT NULL OR NEW.last_checked_at IS NOT NULL THEN
      RAISE EXCEPTION 'New catalog products must be explicitly verified after creation';
    END IF;
    RETURN NEW;
  END IF;

  -- Description, material, and fit are the only intentionally noncritical
  -- product edits. Recommendation, rights, provenance, inventory, archive,
  -- price, source freshness, and available-size changes all invalidate.
  verification_critical_change := (
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.brand IS DISTINCT FROM NEW.brand
    OR OLD.category IS DISTINCT FROM NEW.category
    OR OLD.kind IS DISTINCT FROM NEW.kind
    OR OLD.color IS DISTINCT FROM NEW.color
    OR OLD.retailer IS DISTINCT FROM NEW.retailer
    OR OLD.buy_url IS DISTINCT FROM NEW.buy_url
    OR OLD.image_url IS DISTINCT FROM NEW.image_url
    OR OLD.price IS DISTINCT FROM NEW.price
    OR OLD.current_price IS DISTINCT FROM NEW.current_price
    OR OLD.original_price IS DISTINCT FROM NEW.original_price
    OR OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.available_sizes IS DISTINCT FROM NEW.available_sizes
    OR OLD.source_updated_at IS DISTINCT FROM NEW.source_updated_at
    OR OLD.availability IS DISTINCT FROM NEW.availability
    OR OLD.source IS DISTINCT FROM NEW.source
    OR OLD.source_type IS DISTINCT FROM NEW.source_type
    OR OLD.source_name IS DISTINCT FROM NEW.source_name
    OR OLD.source_url IS DISTINCT FROM NEW.source_url
    OR OLD.image_rights_basis IS DISTINCT FROM NEW.image_rights_basis
    OR OLD.verification_method IS DISTINCT FROM NEW.verification_method
    OR OLD.affiliate IS DISTINCT FROM NEW.affiliate
    OR OLD.affiliate_disclosure IS DISTINCT FROM NEW.affiliate_disclosure
    OR OLD.accessory_subtype IS DISTINCT FROM NEW.accessory_subtype
    OR OLD.fragrance_family IS DISTINCT FROM NEW.fragrance_family
    OR OLD.vibe IS DISTINCT FROM NEW.vibe
    OR OLD.price_tier IS DISTINCT FROM NEW.price_tier
    OR OLD.formality IS DISTINCT FROM NEW.formality
    OR OLD.season IS DISTINCT FROM NEW.season
    OR OLD.condition IS DISTINCT FROM NEW.condition
    OR OLD.tags IS DISTINCT FROM NEW.tags
    OR OLD.external_id IS DISTINCT FROM NEW.external_id
    OR OLD.archived IS DISTINCT FROM NEW.archived
  );

  IF verification_write_allowed THEN
    IF verification_critical_change THEN
      RAISE EXCEPTION 'Verification cannot be combined with a catalog edit';
    END IF;
    IF NEW.verified_at IS NULL
      OR NEW.last_checked_at IS NULL
      OR NEW.verified_at IS DISTINCT FROM NEW.last_checked_at
    THEN
      RAISE EXCEPTION 'Explicit verification must set both timestamps to one server time';
    END IF;
    RETURN NEW;
  END IF;

  IF
    OLD.verified_at IS DISTINCT FROM NEW.verified_at
    OR OLD.last_checked_at IS DISTINCT FROM NEW.last_checked_at
  THEN
    RAISE EXCEPTION 'Use the explicit catalog verification action to update verification timestamps';
  END IF;

  IF verification_critical_change THEN
    NEW.verified_at := NULL;
    NEW.last_checked_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_catalog_verification_timestamps() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reject_direct_catalog_verification_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  verify_function_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO verify_function_owner
  FROM pg_proc
  WHERE oid = 'public.verify_shop_catalog_item(uuid)'::regprocedure;

  IF current_setting('drip.catalog_verification_write', true) IS DISTINCT FROM 'allowed'
    OR current_user IS DISTINCT FROM verify_function_owner
  THEN
    RAISE EXCEPTION 'Use the explicit catalog verification action to update verification timestamps';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_direct_catalog_verification_writes() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_new_catalog_verification_timestamps ON public.shop_catalog;
CREATE TRIGGER protect_new_catalog_verification_timestamps
  BEFORE INSERT ON public.shop_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_catalog_verification_timestamps();

DROP TRIGGER IF EXISTS protect_catalog_verification_timestamps ON public.shop_catalog;
CREATE TRIGGER protect_catalog_verification_timestamps
  BEFORE UPDATE ON public.shop_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_catalog_verification_timestamps();

DROP TRIGGER IF EXISTS reject_direct_catalog_verification_writes ON public.shop_catalog;
CREATE TRIGGER reject_direct_catalog_verification_writes
  BEFORE UPDATE OF verified_at, last_checked_at ON public.shop_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_direct_catalog_verification_writes();

CREATE OR REPLACE FUNCTION public.verify_shop_catalog_item(_catalog_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.shop_catalog%ROWTYPE;
  verified_time timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO item
  FROM public.shop_catalog
  WHERE id = _catalog_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF item.is_demo OR item.source = 'phase_2_curated_demo' THEN
    RAISE EXCEPTION 'Demo products are read-only';
  END IF;
  IF item.archived THEN RAISE EXCEPTION 'Restore this product before verifying it'; END IF;

  IF btrim(item.name) = ''
    OR item.brand IS NULL OR btrim(item.brand) = ''
    OR btrim(item.category) = ''
    OR item.color IS NULL OR btrim(item.color) = ''
    OR item.retailer IS NULL OR btrim(item.retailer) = ''
    OR item.buy_url IS NULL OR item.buy_url !~ '^https://[^[:space:]]+$'
    OR item.image_url IS NULL
    OR NOT (
      item.image_url ~ '^https://[^[:space:]]+$'
      OR item.image_url ~ '^/catalog/([a-z0-9._-]+/)*[a-z0-9._-]+\.(jpg|jpeg|png|webp|avif|svg)$'
    )
    OR item.image_url LIKE '/catalog/phase-2/%'
    OR item.image_rights_basis IS NULL OR NOT (
      (item.image_url LIKE '/catalog/%' AND item.image_rights_basis = 'project_owned')
      OR (item.image_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/catalog-products/'
          AND item.image_rights_basis IN ('authorized', 'licensed', 'project_owned'))
      OR (item.image_url ~ '^https://' AND item.image_rights_basis IN ('authorized', 'licensed'))
    )
    OR item.current_price IS NULL OR item.current_price <= 0
    OR (item.original_price IS NOT NULL AND item.original_price < item.current_price)
    OR item.currency NOT IN ('USD', 'CAD', 'EUR', 'GBP', 'AUD')
    OR item.availability NOT IN ('in_stock', 'low_stock', 'preorder')
    OR item.source_type NOT IN ('manual', 'affiliate_feed', 'partner_api', 'verified')
    OR item.source_name IS NULL OR btrim(item.source_name) = ''
    OR item.verification_method NOT IN ('manual', 'feed', 'partner_api')
    OR item.vibe IS NULL OR btrim(item.vibe) = ''
    OR item.price_tier NOT IN ('entry', 'mid', 'premium', 'luxury')
    OR item.description IS NULL OR btrim(item.description) = ''
    OR (item.affiliate AND (item.affiliate_disclosure IS NULL OR btrim(item.affiliate_disclosure) = ''))
  THEN
    RAISE EXCEPTION 'Catalog product is incomplete or inconsistent';
  END IF;

  IF NOT (
    (item.kind = 'clothing' AND item.category IN (
      'top', 'tee', 'hoodie', 'shirt', 'polo', 'bottom', 'trousers', 'cargos',
      'joggers', 'shorts', 'denim', 'outerwear', 'bomber', 'chore', 'jacket', 'coat'
    ))
    OR (item.kind = 'shoes' AND item.category IN (
      'shoes', 'sneaker', 'jordan', 'vomero', 'new_balance', 'loafer', 'boot', 'runner'
    ))
    OR (item.kind = 'fragrance' AND item.category IN ('fragrance', 'cologne', 'edp', 'edt', 'parfum'))
    OR (item.kind = 'accessory' AND item.category IN (
      'accessory', 'bag', 'bags', 'belt', 'belts', 'beanie', 'bracelet', 'bracelets',
      'cap', 'chain', 'chains', 'earring', 'earrings', 'glasses', 'grill', 'grills',
      'hat', 'hats', 'jewelry', 'necklace', 'necklaces', 'prescription_glasses',
      'ring', 'rings', 'scarf', 'scarves', 'sock', 'socks', 'sunglasses', 'watch',
      'watches', 'wallet', 'wallets'
    ))
  ) THEN
    RAISE EXCEPTION 'Catalog category and kind do not agree';
  END IF;

  IF item.kind = 'accessory' AND (
    item.accessory_subtype IS NULL
    OR item.accessory_subtype NOT IN (
      'earrings', 'glasses', 'prescription_glasses', 'sunglasses', 'necklaces',
      'chains', 'bracelets', 'rings', 'watches', 'hat', 'cap', 'beanie', 'belts',
      'bags', 'socks', 'scarves', 'wallets', 'grills', 'jewelry'
    )
  ) THEN
    RAISE EXCEPTION 'Accessory subtype is required and unsupported';
  END IF;
  IF item.kind <> 'accessory' AND item.accessory_subtype IS NOT NULL THEN
    RAISE EXCEPTION 'Accessory subtype conflicts with product kind';
  END IF;
  IF item.kind = 'fragrance' AND (
    item.fragrance_family IS NULL
    OR item.fragrance_family NOT IN (
      'fresh', 'woody', 'warm', 'sweet', 'aquatic', 'floral', 'leather', 'other'
    )
  ) THEN
    RAISE EXCEPTION 'Fragrance family is required and unsupported';
  END IF;
  IF item.kind <> 'fragrance' AND item.fragrance_family IS NOT NULL THEN
    RAISE EXCEPTION 'Fragrance family conflicts with product kind';
  END IF;

  PERFORM set_config('drip.catalog_verification_write', 'allowed', true);
  UPDATE public.shop_catalog
  SET verified_at = verified_time, last_checked_at = verified_time
  WHERE id = _catalog_id;

  RETURN verified_time;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_shop_catalog_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_shop_catalog_item(uuid) TO authenticated;

-- --------------------------------------------------------------------------
-- Private problem-report screenshot reconciliation.
-- --------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports', 'reports', false, 5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "reports owner upload" ON storage.objects;
CREATE POLICY "reports owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[2] ~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND storage.filename(name) ~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|webp|gif)$'
    AND lower(storage.extension(name)) IN ('png', 'jpg', 'webp', 'gif')
    AND EXISTS (
      SELECT 1 FROM public.content_reports report
      WHERE report.id::text = (storage.foldername(name))[2]
        AND report.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reports owner read" ON storage.objects;
CREATE POLICY "reports owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "reports admin read" ON storage.objects;
CREATE POLICY "reports admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "reports owner delete" ON storage.objects;
CREATE POLICY "reports owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- The applied weak migration changed this function's return type to boolean.
-- PostgreSQL cannot change a return type with CREATE OR REPLACE, so replace
-- the exact function signature transactionally before installing the strong RPC.
DROP FUNCTION IF EXISTS public.attach_problem_report_screenshot(uuid, text);
CREATE FUNCTION public.attach_problem_report_screenshot(_report uuid, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp|gif)$'
    OR split_part(_path, '/', 1) <> caller::text
    OR split_part(_path, '/', 2) <> _report::text
  THEN
    RAISE EXCEPTION 'Invalid report attachment path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'reports' AND name = _path
  ) THEN
    RAISE EXCEPTION 'Report screenshot was not uploaded';
  END IF;

  UPDATE public.content_reports
  SET attachment_path = _path
  WHERE id = _report AND reporter_id = caller AND attachment_path IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found, not owned, or already has a screenshot';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_problem_report_screenshot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_problem_report_screenshot(uuid, text) TO authenticated;

-- --------------------------------------------------------------------------
-- Real-product import staging. Original raw input is retained and immutable;
-- normalized corrections live separately and never write directly to catalog.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalog_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (
    source_type IN ('manual_csv', 'manual_json', 'affiliate_feed', 'partner_api', 'authorized_shopify')
  ),
  source_name text NOT NULL CHECK (btrim(source_name) <> ''),
  source_url text,
  uploaded_file_name text NOT NULL CHECK (btrim(uploaded_file_name) <> ''),
  status text NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'validating', 'needs_review', 'approved', 'rejected', 'imported')
  ),
  total_row_count integer NOT NULL DEFAULT 0 CHECK (total_row_count >= 0),
  valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  invalid_row_count integer NOT NULL DEFAULT 0 CHECK (invalid_row_count >= 0),
  duplicate_row_count integer NOT NULL DEFAULT 0 CHECK (duplicate_row_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalog_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.catalog_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  raw_data jsonb NOT NULL,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_errors text[] NOT NULL DEFAULT '{}'::text[],
  warnings text[] NOT NULL DEFAULT '{}'::text[],
  duplicate_reason text,
  proposed_action text NOT NULL CHECK (
    proposed_action IN ('create', 'update', 'skip', 'manual_review')
  ),
  review_status text NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'imported')
  ),
  catalog_id uuid REFERENCES public.shop_catalog(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS catalog_import_batches_status_idx
  ON public.catalog_import_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_import_rows_batch_idx
  ON public.catalog_import_rows(batch_id, row_number);
CREATE INDEX IF NOT EXISTS catalog_import_rows_review_idx
  ON public.catalog_import_rows(batch_id, review_status, proposed_action);

ALTER TABLE public.catalog_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog imports admin read batches" ON public.catalog_import_batches;
CREATE POLICY "catalog imports admin read batches"
  ON public.catalog_import_batches FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "catalog imports admin insert batches" ON public.catalog_import_batches;
CREATE POLICY "catalog imports admin insert batches"
  ON public.catalog_import_batches FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND created_by = auth.uid());
DROP POLICY IF EXISTS "catalog imports admin update batches" ON public.catalog_import_batches;
CREATE POLICY "catalog imports admin update batches"
  ON public.catalog_import_batches FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "catalog imports admin read rows" ON public.catalog_import_rows;
CREATE POLICY "catalog imports admin read rows"
  ON public.catalog_import_rows FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "catalog imports admin insert rows" ON public.catalog_import_rows;
CREATE POLICY "catalog imports admin insert rows"
  ON public.catalog_import_rows FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND NOT (normalized_data ? 'verified_at')
    AND NOT (normalized_data ? 'last_checked_at')
  );
DROP POLICY IF EXISTS "catalog imports admin update rows" ON public.catalog_import_rows;
CREATE POLICY "catalog imports admin update rows"
  ON public.catalog_import_rows FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (
    public.is_admin(auth.uid())
    AND NOT (normalized_data ? 'verified_at')
    AND NOT (normalized_data ? 'last_checked_at')
  );

GRANT SELECT, INSERT, UPDATE ON public.catalog_import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.catalog_import_rows TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_catalog_import_raw_data()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.raw_data IS DISTINCT FROM NEW.raw_data
    OR OLD.batch_id IS DISTINCT FROM NEW.batch_id
    OR OLD.row_number IS DISTINCT FROM NEW.row_number
  THEN
    RAISE EXCEPTION 'Original catalog import input is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_catalog_import_raw_data() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_catalog_import_raw_data ON public.catalog_import_rows;
CREATE TRIGGER protect_catalog_import_raw_data
  BEFORE UPDATE ON public.catalog_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_import_raw_data();

CREATE OR REPLACE FUNCTION public.refresh_catalog_import_batch_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_batch uuid := COALESCE(NEW.batch_id, OLD.batch_id);
BEGIN
  UPDATE public.catalog_import_batches batch
  SET total_row_count = counts.total_count,
      valid_row_count = counts.valid_count,
      invalid_row_count = counts.invalid_count,
      duplicate_row_count = counts.duplicate_count,
      updated_at = now()
  FROM (
    SELECT count(*)::integer AS total_count,
      count(*) FILTER (WHERE cardinality(validation_errors) = 0)::integer AS valid_count,
      count(*) FILTER (WHERE cardinality(validation_errors) > 0)::integer AS invalid_count,
      count(*) FILTER (WHERE proposed_action IN ('update', 'skip', 'manual_review'))::integer
        AS duplicate_count
    FROM public.catalog_import_rows WHERE batch_id = target_batch
  ) counts
  WHERE batch.id = target_batch;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_catalog_import_batch_counts() FROM PUBLIC;

DROP TRIGGER IF EXISTS refresh_catalog_import_batch_counts ON public.catalog_import_rows;
CREATE TRIGGER refresh_catalog_import_batch_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.catalog_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.refresh_catalog_import_batch_counts();

CREATE OR REPLACE FUNCTION public.assert_valid_catalog_import_product(item jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item_kind text := item->>'kind';
  item_category text := item->>'category';
  image_reference text := item->>'image_url';
  rights_basis text := item->>'image_rights_basis';
BEGIN
  IF item ? 'verified_at' OR item ? 'last_checked_at' THEN
    RAISE EXCEPTION 'Imports cannot set verification timestamps';
  END IF;
  IF item->>'id' ~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$'
    OR image_reference LIKE '/catalog/phase-2/%'
  THEN
    RAISE EXCEPTION 'Imports cannot reference protected Phase 2 demo identities or images';
  END IF;
  IF btrim(COALESCE(item->>'name', '')) = ''
    OR btrim(COALESCE(item->>'brand', '')) = ''
    OR btrim(COALESCE(item_category, '')) = ''
    OR btrim(COALESCE(item->>'color', '')) = ''
    OR btrim(COALESCE(item->>'retailer', '')) = ''
    OR btrim(COALESCE(item->>'source_name', '')) = ''
    OR btrim(COALESCE(item->>'vibe', '')) = ''
    OR btrim(COALESCE(item->>'description', '')) = ''
  THEN
    RAISE EXCEPTION 'Imported product is missing required text';
  END IF;
  IF item->>'buy_url' !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Imported product URL must use HTTPS';
  END IF;
  IF NOT (
    image_reference ~ '^https://[^[:space:]]+$'
    OR image_reference ~ '^/catalog/([a-z0-9._-]+/)*[a-z0-9._-]+\.(jpg|jpeg|png|webp|avif|svg)$'
  ) THEN
    RAISE EXCEPTION 'Imported product image must use HTTPS or an approved catalog path';
  END IF;
  IF NOT (
    (image_reference LIKE '/catalog/%' AND rights_basis = 'project_owned')
    OR (image_reference ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/catalog-products/'
        AND rights_basis IN ('authorized', 'licensed', 'project_owned'))
    OR (image_reference ~ '^https://' AND rights_basis IN ('authorized', 'licensed'))
  ) THEN
    RAISE EXCEPTION 'Imported product image rights do not match its source';
  END IF;
  IF COALESCE(item->>'current_price', '') !~ '^[0-9]+(\.[0-9]+)?$'
    OR (item->>'current_price')::numeric <= 0
  THEN
    RAISE EXCEPTION 'Imported current price must be positive';
  END IF;
  IF NULLIF(item->>'original_price', '') IS NOT NULL
    AND (item->>'original_price')::numeric < (item->>'current_price')::numeric
  THEN
    RAISE EXCEPTION 'Imported original price cannot be lower than current price';
  END IF;
  IF item->>'currency' NOT IN ('USD', 'CAD', 'EUR', 'GBP', 'AUD') THEN
    RAISE EXCEPTION 'Imported currency is unsupported';
  END IF;
  IF item->>'availability' NOT IN ('in_stock', 'low_stock', 'preorder', 'out_of_stock', 'discontinued')
    OR item->>'source_type' NOT IN ('manual', 'affiliate_feed', 'partner_api')
    OR item->>'verification_method' NOT IN ('manual', 'feed', 'partner_api')
    OR item->>'price_tier' NOT IN ('entry', 'mid', 'premium', 'luxury')
  THEN
    RAISE EXCEPTION 'Imported product contains unsupported catalog values';
  END IF;
  IF NOT (
    (item_kind = 'clothing' AND item_category IN (
      'top', 'tee', 'hoodie', 'shirt', 'polo', 'bottom', 'trousers', 'cargos',
      'joggers', 'shorts', 'denim', 'outerwear', 'bomber', 'chore', 'jacket', 'coat'
    ))
    OR (item_kind = 'shoes' AND item_category IN (
      'shoes', 'sneaker', 'jordan', 'vomero', 'new_balance', 'loafer', 'boot', 'runner'
    ))
    OR (item_kind = 'fragrance' AND item_category IN ('fragrance', 'cologne', 'edp', 'edt', 'parfum'))
    OR (item_kind = 'accessory' AND item_category IN (
      'accessory', 'bag', 'bags', 'belt', 'belts', 'beanie', 'bracelet', 'bracelets',
      'cap', 'chain', 'chains', 'earring', 'earrings', 'glasses', 'grill', 'grills',
      'hat', 'hats', 'jewelry', 'necklace', 'necklaces', 'prescription_glasses',
      'ring', 'rings', 'scarf', 'scarves', 'sock', 'socks', 'sunglasses', 'watch',
      'watches', 'wallet', 'wallets'
    ))
  ) THEN
    RAISE EXCEPTION 'Imported category and kind do not agree';
  END IF;
  IF item_kind = 'accessory' AND COALESCE(item->>'accessory_subtype', '') NOT IN (
    'earrings', 'glasses', 'prescription_glasses', 'sunglasses', 'necklaces',
    'chains', 'bracelets', 'rings', 'watches', 'hat', 'cap', 'beanie', 'belts',
    'bags', 'socks', 'scarves', 'wallets', 'grills', 'jewelry'
  ) THEN
    RAISE EXCEPTION 'Imported accessory subtype is required and unsupported';
  END IF;
  IF item_kind <> 'accessory' AND NULLIF(item->>'accessory_subtype', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Imported accessory subtype conflicts with kind';
  END IF;
  IF item_kind = 'fragrance' AND COALESCE(item->>'fragrance_family', '') NOT IN (
    'fresh', 'woody', 'warm', 'sweet', 'aquatic', 'floral', 'leather', 'other'
  ) THEN
    RAISE EXCEPTION 'Imported fragrance family is required and unsupported';
  END IF;
  IF item_kind <> 'fragrance' AND NULLIF(item->>'fragrance_family', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Imported fragrance family conflicts with kind';
  END IF;
  IF COALESCE((item->>'affiliate')::boolean, false)
    AND btrim(COALESCE(item->>'affiliate_disclosure', '')) = ''
  THEN
    RAISE EXCEPTION 'Affiliate imports require a disclosure';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_valid_catalog_import_product(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.import_catalog_batch(_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_row public.catalog_import_batches%ROWTYPE;
  staged public.catalog_import_rows%ROWTYPE;
  item jsonb;
  imported_catalog_id uuid;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO batch_row FROM public.catalog_import_batches
  WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch not found'; END IF;
  IF batch_row.status = 'imported' THEN RAISE EXCEPTION 'Import batch was already imported'; END IF;

  FOR staged IN
    SELECT * FROM public.catalog_import_rows
    WHERE batch_id = _batch AND review_status = 'approved'
    ORDER BY row_number FOR UPDATE
  LOOP
    IF cardinality(staged.validation_errors) > 0 OR staged.proposed_action = 'manual_review' THEN
      RAISE EXCEPTION 'Approved row % still requires review', staged.row_number;
    END IF;
    item := staged.normalized_data;
    PERFORM public.assert_valid_catalog_import_product(item);

    IF staged.proposed_action = 'skip' THEN
      skipped_count := skipped_count + 1;
      UPDATE public.catalog_import_rows SET review_status = 'imported', updated_at = now()
      WHERE id = staged.id;
      CONTINUE;
    END IF;

    IF staged.proposed_action = 'update' THEN
      IF staged.catalog_id IS NULL THEN
        RAISE EXCEPTION 'Update row % has no catalog target', staged.row_number;
      END IF;
      UPDATE public.shop_catalog
      SET name = item->>'name', brand = item->>'brand', kind = (item->>'kind')::public.item_kind,
          category = item->>'category', color = item->>'color',
          material = NULLIF(item->>'material', ''), fit = NULLIF(item->>'fit', ''),
          season = COALESCE(NULLIF(item->>'season', ''), 'all')::public.season,
          formality = COALESCE(NULLIF(item->>'formality', ''), 'casual')::public.formality,
          condition = COALESCE(NULLIF(item->>'condition', ''), 'new')::public.item_condition,
          price = (item->>'current_price')::numeric,
          current_price = (item->>'current_price')::numeric,
          original_price = NULLIF(item->>'original_price', '')::numeric,
          currency = item->>'currency',
          available_sizes = ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'available_sizes', '[]'::jsonb))),
          source_updated_at = NULLIF(item->>'source_updated_at', '')::timestamptz,
          retailer = item->>'retailer', buy_url = item->>'buy_url', image_url = item->>'image_url',
          availability = item->>'availability', external_id = NULLIF(item->>'external_id', ''),
          source = 'real_catalog_import', source_type = item->>'source_type',
          source_name = item->>'source_name', source_url = NULLIF(item->>'source_url', ''),
          image_rights_basis = item->>'image_rights_basis',
          verification_method = item->>'verification_method',
          affiliate = COALESCE((item->>'affiliate')::boolean, false),
          affiliate_disclosure = NULLIF(item->>'affiliate_disclosure', ''),
          vibe = item->>'vibe', price_tier = item->>'price_tier',
          accessory_subtype = NULLIF(item->>'accessory_subtype', ''),
          fragrance_family = NULLIF(item->>'fragrance_family', ''),
          description = item->>'description'
      WHERE id = staged.catalog_id AND is_demo = false
        AND source IS DISTINCT FROM 'phase_2_curated_demo'
      RETURNING id INTO imported_catalog_id;
      IF imported_catalog_id IS NULL THEN
        RAISE EXCEPTION 'Update target is missing or protected for row %', staged.row_number;
      END IF;
      updated_count := updated_count + 1;
    ELSE
      INSERT INTO public.shop_catalog (
        name, brand, kind, category, color, material, fit, season, formality, condition,
        price, current_price, original_price, currency, available_sizes, source_updated_at,
        retailer, buy_url, image_url, availability, external_id, source, source_type,
        source_name, source_url, image_rights_basis, verification_method, affiliate,
        affiliate_disclosure, vibe, price_tier, accessory_subtype, fragrance_family,
        description, is_demo, archived, verified_at, last_checked_at
      ) VALUES (
        item->>'name', item->>'brand', (item->>'kind')::public.item_kind,
        item->>'category', item->>'color', NULLIF(item->>'material', ''),
        NULLIF(item->>'fit', ''), COALESCE(NULLIF(item->>'season', ''), 'all')::public.season,
        COALESCE(NULLIF(item->>'formality', ''), 'casual')::public.formality,
        COALESCE(NULLIF(item->>'condition', ''), 'new')::public.item_condition,
        (item->>'current_price')::numeric, (item->>'current_price')::numeric,
        NULLIF(item->>'original_price', '')::numeric, item->>'currency',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'available_sizes', '[]'::jsonb))),
        NULLIF(item->>'source_updated_at', '')::timestamptz,
        item->>'retailer', item->>'buy_url', item->>'image_url', item->>'availability',
        NULLIF(item->>'external_id', ''), 'real_catalog_import', item->>'source_type',
        item->>'source_name', NULLIF(item->>'source_url', ''), item->>'image_rights_basis',
        item->>'verification_method', COALESCE((item->>'affiliate')::boolean, false),
        NULLIF(item->>'affiliate_disclosure', ''), item->>'vibe', item->>'price_tier',
        NULLIF(item->>'accessory_subtype', ''), NULLIF(item->>'fragrance_family', ''),
        item->>'description', false, false, NULL, NULL
      ) RETURNING id INTO imported_catalog_id;
      created_count := created_count + 1;
    END IF;

    UPDATE public.catalog_import_rows
    SET review_status = 'imported', catalog_id = imported_catalog_id, updated_at = now()
    WHERE id = staged.id;
  END LOOP;

  UPDATE public.catalog_import_batches SET status = 'imported', updated_at = now()
  WHERE id = _batch;

  RETURN jsonb_build_object(
    'created', created_count, 'updated', updated_count, 'skipped', skipped_count,
    'verified', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_catalog_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_catalog_batch(uuid) TO authenticated;

-- Authorized product images are publicly readable for Shop rendering, but only
-- authenticated administrators may upload, replace, or delete objects.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-products', 'catalog-products', true, 10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "catalog product images admin upload" ON storage.objects;
CREATE POLICY "catalog product images admin upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'catalog-products'
    AND public.is_admin(auth.uid())
    AND storage.filename(name) ~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|webp|avif)$'
    AND lower(storage.extension(name)) IN ('png', 'jpg', 'webp', 'avif')
  );

DROP POLICY IF EXISTS "catalog product images admin update" ON storage.objects;
CREATE POLICY "catalog product images admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'catalog-products' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'catalog-products' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "catalog product images admin delete" ON storage.objects;
CREATE POLICY "catalog product images admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-products' AND public.is_admin(auth.uid()));
