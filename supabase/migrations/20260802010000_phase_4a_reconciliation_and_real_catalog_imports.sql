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
  IF item ?| ARRAY['verified_at', 'last_checked_at', 'is_demo', 'archived', 'source'] THEN
    RAISE EXCEPTION 'Imports cannot set protected catalog control fields';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(item) field
    WHERE field.key = ANY (ARRAY[
      'name', 'brand', 'kind', 'category', 'color', 'currency', 'retailer', 'buy_url',
      'image_url', 'image_rights_basis', 'source_type', 'source_name', 'source_url',
      'verification_method', 'availability', 'external_id', 'affiliate_disclosure',
      'vibe', 'price_tier', 'accessory_subtype', 'fragrance_family', 'description',
      'material', 'fit', 'source_updated_at', 'formality', 'season', 'condition'
    ]) AND jsonb_typeof(field.value) NOT IN ('string', 'null')
  ) THEN RAISE EXCEPTION 'Imported text fields must be strings'; END IF;
  IF jsonb_typeof(item->'current_price') IS DISTINCT FROM 'number'
    OR (item ? 'original_price' AND jsonb_typeof(item->'original_price') NOT IN ('number', 'null'))
  THEN RAISE EXCEPTION 'Imported price fields must be numbers'; END IF;
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
  IF COALESCE(item->>'buy_url', '') !~ '^https://[^[:space:]]+$' THEN
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
  IF COALESCE(item->>'currency', '') NOT IN ('USD', 'CAD', 'EUR', 'GBP', 'AUD') THEN
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

-- Declared before helper compilation; the final constraints and lifecycle
-- definitions are installed in the review-blocker section below.
ALTER TABLE public.catalog_import_rows
  ADD COLUMN IF NOT EXISTS resolution_action text,
  ADD COLUMN IF NOT EXISTS resolution_catalog_id uuid REFERENCES public.shop_catalog(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE OR REPLACE FUNCTION public.import_catalog_batch_review_blocker_impl(_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_row public.catalog_import_batches%ROWTYPE;
  staged public.catalog_import_rows%ROWTYPE;
  earlier public.catalog_import_rows%ROWTYPE;
  live_match public.shop_catalog%ROWTYPE;
  item jsonb;
  effective_action text;
  target_catalog_id uuid;
  imported_catalog_id uuid;
  external_key text;
  canonical_url text;
  descriptive_key text;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  remaining_count integer;
  lifecycle text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- One transaction-wide import lock closes the cross-batch race where two
  -- independently reviewed batches both planned the same new identity.
  PERFORM pg_advisory_xact_lock(hashtextextended('shop_catalog_import_identity', 0));
  SELECT * INTO batch_row FROM public.catalog_import_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_import_rows
    WHERE batch_id = _batch AND review_status = 'approved'
  ) THEN RAISE EXCEPTION 'Approve at least one valid row before importing'; END IF;

  -- Preflight every approved row before the first product write. Any bad row
  -- aborts the call; any identity that changed since review is returned to
  -- manual resolution without partially mutating the catalog.
  FOR staged IN
    SELECT * FROM public.catalog_import_rows
    WHERE batch_id = _batch AND review_status = 'approved'
    ORDER BY row_number
    FOR UPDATE
  LOOP
    item := staged.normalized_data;
    IF staged.raw_data->>'id' ~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$' THEN
      RAISE EXCEPTION 'Row % references a protected Phase 2 demo identity', staged.row_number;
    END IF;
    PERFORM public.assert_valid_catalog_import_product(item);
    IF staged.proposed_action = 'manual_review' AND staged.resolution_action IS NULL THEN
      RAISE EXCEPTION 'Approved row % has no explicit duplicate resolution', staged.row_number;
    END IF;
    effective_action := COALESCE(staged.resolution_action, staged.proposed_action);
    IF effective_action NOT IN ('create', 'update', 'skip') THEN
      RAISE EXCEPTION 'Approved row % has an invalid action', staged.row_number;
    END IF;
    IF effective_action = 'skip' THEN CONTINUE; END IF;

    target_catalog_id := CASE
      WHEN staged.resolution_action = 'update' THEN staged.resolution_catalog_id
      WHEN effective_action = 'update' THEN staged.catalog_id
      ELSE NULL
    END;
    IF effective_action = 'update' AND NOT EXISTS (
      SELECT 1 FROM public.shop_catalog product
      WHERE product.id = target_catalog_id AND product.is_demo = false
        AND product.source IS DISTINCT FROM 'phase_2_curated_demo'
    ) THEN RAISE EXCEPTION 'Update row % has no valid non-demo target', staged.row_number; END IF;

    external_key := CASE
      WHEN btrim(COALESCE(item->>'external_id', '')) = '' THEN ''
      ELSE public.catalog_identity_part(item->>'retailer') || '|' ||
        public.catalog_identity_part(item->>'external_id')
    END;
    canonical_url := public.catalog_canonical_product_url(item->>'buy_url');
    descriptive_key := concat_ws('|',
      public.catalog_identity_part(item->>'brand'), public.catalog_identity_part(item->>'name'),
      public.catalog_identity_part(item->>'color'), public.catalog_identity_part(item->>'retailer')
    );

    SELECT prior.* INTO earlier
    FROM public.catalog_import_rows prior
    WHERE prior.batch_id = _batch
      AND prior.row_number < staged.row_number
      AND prior.review_status = 'approved'
      AND COALESCE(prior.resolution_action, prior.proposed_action) <> 'skip'
      AND (
        (external_key <> '' AND
          public.catalog_identity_part(prior.normalized_data->>'retailer') || '|' ||
            public.catalog_identity_part(prior.normalized_data->>'external_id') = external_key)
        OR (canonical_url <> '' AND
          public.catalog_canonical_product_url(prior.normalized_data->>'buy_url') = canonical_url)
        OR concat_ws('|',
          public.catalog_identity_part(prior.normalized_data->>'brand'),
          public.catalog_identity_part(prior.normalized_data->>'name'),
          public.catalog_identity_part(prior.normalized_data->>'color'),
          public.catalog_identity_part(prior.normalized_data->>'retailer')
        ) = descriptive_key
      )
    ORDER BY prior.row_number
    LIMIT 1;

    IF FOUND AND NOT (
      staged.resolution_action = 'create'
      AND NOT (
        (external_key <> '' AND
          public.catalog_identity_part(earlier.normalized_data->>'retailer') || '|' ||
            public.catalog_identity_part(earlier.normalized_data->>'external_id') = external_key)
        OR (canonical_url <> '' AND
          public.catalog_canonical_product_url(earlier.normalized_data->>'buy_url') = canonical_url)
      )
    ) THEN
      UPDATE public.catalog_import_rows
      SET review_status = 'pending', proposed_action = 'manual_review',
          duplicate_reason = format('Import-time identity conflict with batch row %s', earlier.row_number),
          resolution_action = NULL, resolution_catalog_id = NULL,
          resolution_confirmed = false, resolution_note = NULL,
          resolved_by = NULL, resolved_at = NULL, reviewed_by = NULL, reviewed_at = NULL,
          updated_at = now()
      WHERE id = staged.id;
      PERFORM public.refresh_catalog_import_batch_lifecycle(_batch);
      RETURN jsonb_build_object(
        'blocked', true, 'row', staged.row_number,
        'reason', format('Row %s now conflicts with another approved row', staged.row_number),
        'created', 0, 'updated', 0, 'skipped', 0
      );
    END IF;

    SELECT product.* INTO live_match
    FROM public.shop_catalog product
    WHERE
      (external_key <> '' AND public.catalog_identity_part(product.retailer) || '|' ||
        public.catalog_identity_part(product.external_id) = external_key)
      OR (canonical_url <> '' AND public.catalog_canonical_product_url(product.buy_url) = canonical_url)
      OR concat_ws('|', public.catalog_identity_part(product.brand),
        public.catalog_identity_part(product.name), public.catalog_identity_part(product.color),
        public.catalog_identity_part(product.retailer)) = descriptive_key
    ORDER BY CASE
      WHEN external_key <> '' AND public.catalog_identity_part(product.retailer) || '|' ||
        public.catalog_identity_part(product.external_id) = external_key THEN 0
      WHEN canonical_url <> '' AND public.catalog_canonical_product_url(product.buy_url) = canonical_url THEN 1
      ELSE 2
    END
    LIMIT 1
    FOR UPDATE;

    IF FOUND AND NOT (
      effective_action = 'update' AND live_match.id = target_catalog_id
      OR staged.resolution_action = 'create' AND NOT (
        (external_key <> '' AND public.catalog_identity_part(live_match.retailer) || '|' ||
          public.catalog_identity_part(live_match.external_id) = external_key)
        OR (canonical_url <> '' AND
          public.catalog_canonical_product_url(live_match.buy_url) = canonical_url)
        OR live_match.is_demo OR live_match.source = 'phase_2_curated_demo'
      )
    ) THEN
      UPDATE public.catalog_import_rows
      SET review_status = 'pending', proposed_action = 'manual_review', catalog_id = live_match.id,
          duplicate_reason = 'Import-time identity conflict with the live catalog',
          resolution_action = NULL, resolution_catalog_id = NULL,
          resolution_confirmed = false, resolution_note = NULL,
          resolved_by = NULL, resolved_at = NULL, reviewed_by = NULL, reviewed_at = NULL,
          updated_at = now()
      WHERE id = staged.id;
      PERFORM public.refresh_catalog_import_batch_lifecycle(_batch);
      RETURN jsonb_build_object(
        'blocked', true, 'row', staged.row_number,
        'reason', format('Row %s changed to manual review after a live-catalog recheck', staged.row_number),
        'created', 0, 'updated', 0, 'skipped', 0
      );
    END IF;
  END LOOP;

  FOR staged IN
    SELECT * FROM public.catalog_import_rows
    WHERE batch_id = _batch AND review_status = 'approved'
    ORDER BY row_number
    FOR UPDATE
  LOOP
    item := staged.normalized_data;
    effective_action := COALESCE(staged.resolution_action, staged.proposed_action);
    IF effective_action = 'skip' THEN
      skipped_count := skipped_count + 1;
      UPDATE public.catalog_import_rows SET review_status = 'skipped', updated_at = now()
      WHERE id = staged.id;
      CONTINUE;
    END IF;

    target_catalog_id := CASE
      WHEN staged.resolution_action = 'update' THEN staged.resolution_catalog_id
      ELSE staged.catalog_id
    END;
    imported_catalog_id := NULL;
    IF effective_action = 'update' THEN
      UPDATE public.shop_catalog
      SET name = item->>'name', brand = item->>'brand', kind = (item->>'kind')::public.item_kind,
          category = item->>'category', color = item->>'color',
          material = NULLIF(item->>'material', ''), fit = NULLIF(item->>'fit', ''),
          season = (item->>'season')::public.season,
          formality = (item->>'formality')::public.formality,
          condition = (item->>'condition')::public.item_condition,
          price = (item->>'current_price')::numeric,
          current_price = (item->>'current_price')::numeric,
          original_price = NULLIF(item->>'original_price', '')::numeric,
          currency = item->>'currency',
          available_sizes = ARRAY(SELECT jsonb_array_elements_text(item->'available_sizes')),
          source_updated_at = NULLIF(item->>'source_updated_at', '')::timestamptz,
          retailer = item->>'retailer', buy_url = item->>'buy_url', image_url = item->>'image_url',
          availability = item->>'availability', external_id = NULLIF(item->>'external_id', ''),
          source = 'real_catalog_import', source_type = item->>'source_type',
          source_name = item->>'source_name', source_url = NULLIF(item->>'source_url', ''),
          image_rights_basis = item->>'image_rights_basis',
          verification_method = item->>'verification_method',
          affiliate = (item->>'affiliate')::boolean,
          affiliate_disclosure = NULLIF(item->>'affiliate_disclosure', ''),
          vibe = item->>'vibe', price_tier = item->>'price_tier',
          accessory_subtype = NULLIF(item->>'accessory_subtype', ''),
          fragrance_family = NULLIF(item->>'fragrance_family', ''),
          description = item->>'description', archived = false
      WHERE id = target_catalog_id AND is_demo = false
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
        NULLIF(item->>'fit', ''), (item->>'season')::public.season,
        (item->>'formality')::public.formality, (item->>'condition')::public.item_condition,
        (item->>'current_price')::numeric, (item->>'current_price')::numeric,
        NULLIF(item->>'original_price', '')::numeric, item->>'currency',
        ARRAY(SELECT jsonb_array_elements_text(item->'available_sizes')),
        NULLIF(item->>'source_updated_at', '')::timestamptz,
        item->>'retailer', item->>'buy_url', item->>'image_url', item->>'availability',
        NULLIF(item->>'external_id', ''), 'real_catalog_import', item->>'source_type',
        item->>'source_name', NULLIF(item->>'source_url', ''), item->>'image_rights_basis',
        item->>'verification_method', (item->>'affiliate')::boolean,
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

  lifecycle := public.refresh_catalog_import_batch_lifecycle(_batch);
  SELECT count(*)::integer INTO remaining_count
  FROM public.catalog_import_rows
  WHERE batch_id = _batch AND review_status NOT IN ('imported', 'rejected', 'skipped');
  RETURN jsonb_build_object(
    'blocked', false, 'created', created_count, 'updated', updated_count,
    'skipped', skipped_count, 'remaining', remaining_count, 'status', lifecycle,
    'verified', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_catalog_batch_review_blocker_impl(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_catalog_batch(_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  staged public.catalog_import_rows%ROWTYPE;
  other_row public.catalog_import_rows%ROWTYPE;
  live_match public.shop_catalog%ROWTYPE;
  item jsonb;
  effective_action text;
  effective_target uuid;
  external_key text;
  canonical_url text;
  descriptive_key text;
  live_external_exact boolean;
  live_url_exact boolean;
  conflict_reason text;
  imported_catalog_id uuid;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  ready_count integer;
  remaining_count integer;
  batch_status text;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;

  -- Serialize catalog ingestion so two batches cannot pass duplicate checks
  -- against the same live snapshot and then create the same product.
  PERFORM pg_advisory_xact_lock(hashtextextended('drip.catalog-import', 0));
  PERFORM 1 FROM public.catalog_import_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch not found'; END IF;

  SELECT count(*)::integer INTO ready_count
  FROM public.catalog_import_rows
  WHERE batch_id = _batch AND review_status = 'approved';
  IF ready_count = 0 THEN RAISE EXCEPTION 'No approved rows are ready to import'; END IF;

  -- Complete conflict preflight before the first catalog write. Unexpected
  -- matches return the row to explicit manual review without a partial import.
  FOR staged IN
    SELECT * FROM public.catalog_import_rows
    WHERE batch_id = _batch AND review_status = 'approved'
    ORDER BY row_number FOR UPDATE
  LOOP
    item := staged.normalized_data;
    effective_action := COALESCE(staged.resolution_action, staged.proposed_action);
    effective_target := COALESCE(staged.resolution_catalog_id, staged.catalog_id);
    IF staged.proposed_action = 'manual_review' AND staged.resolution_action IS NULL THEN
      RAISE EXCEPTION 'Approved row % has no duplicate resolution', staged.row_number;
    END IF;
    IF cardinality(staged.validation_errors) > 0 THEN
      RAISE EXCEPTION 'Approved row % still has validation errors', staged.row_number;
    END IF;
    IF staged.raw_data->>'id' ~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$' THEN
      RAISE EXCEPTION 'Row % references a protected Phase 2 demo identity', staged.row_number;
    END IF;
    PERFORM public.assert_valid_catalog_import_product(item);

    external_key := CASE
      WHEN btrim(COALESCE(item->>'external_id', '')) = '' THEN ''
      ELSE public.catalog_identity_part(item->>'retailer') || '|' ||
        public.catalog_identity_part(item->>'external_id')
    END;
    canonical_url := public.catalog_canonical_product_url(item->>'buy_url');
    descriptive_key := concat_ws('|',
      public.catalog_identity_part(item->>'brand'),
      public.catalog_identity_part(item->>'name'),
      public.catalog_identity_part(item->>'color'),
      public.catalog_identity_part(item->>'retailer')
    );
    conflict_reason := NULL;

    IF effective_action <> 'skip' THEN
      SELECT candidate.* INTO other_row
      FROM public.catalog_import_rows candidate
      WHERE candidate.batch_id = _batch
        AND candidate.id <> staged.id
        AND candidate.review_status = 'approved'
        AND candidate.row_number < staged.row_number
        AND COALESCE(candidate.resolution_action, candidate.proposed_action) <> 'skip'
        AND (
          (external_key <> '' AND
            public.catalog_identity_part(candidate.normalized_data->>'retailer') || '|' ||
              public.catalog_identity_part(candidate.normalized_data->>'external_id') = external_key)
          OR (canonical_url <> '' AND
            public.catalog_canonical_product_url(candidate.normalized_data->>'buy_url') = canonical_url)
          OR concat_ws('|',
            public.catalog_identity_part(candidate.normalized_data->>'brand'),
            public.catalog_identity_part(candidate.normalized_data->>'name'),
            public.catalog_identity_part(candidate.normalized_data->>'color'),
            public.catalog_identity_part(candidate.normalized_data->>'retailer')
          ) = descriptive_key
        )
      ORDER BY candidate.row_number LIMIT 1;
      IF FOUND THEN
        conflict_reason := format(
          'Transaction-time identity conflicts with approved batch row %s', other_row.row_number
        );
      END IF;
    END IF;

    IF conflict_reason IS NULL AND effective_action <> 'skip' THEN
      SELECT catalog.* INTO live_match
      FROM public.shop_catalog catalog
      WHERE
        (external_key <> '' AND
          public.catalog_identity_part(catalog.retailer) || '|' ||
            public.catalog_identity_part(catalog.external_id) = external_key)
        OR (canonical_url <> '' AND
          public.catalog_canonical_product_url(catalog.buy_url) = canonical_url)
        OR concat_ws('|',
          public.catalog_identity_part(catalog.brand),
          public.catalog_identity_part(catalog.name),
          public.catalog_identity_part(catalog.color),
          public.catalog_identity_part(catalog.retailer)
        ) = descriptive_key
      ORDER BY CASE
        WHEN external_key <> '' AND
          public.catalog_identity_part(catalog.retailer) || '|' ||
            public.catalog_identity_part(catalog.external_id) = external_key THEN 0
        WHEN canonical_url <> '' AND
          public.catalog_canonical_product_url(catalog.buy_url) = canonical_url THEN 1
        ELSE 2
      END
      LIMIT 1 FOR UPDATE;

      IF FOUND THEN
        live_external_exact := external_key <> '' AND
          public.catalog_identity_part(live_match.retailer) || '|' ||
            public.catalog_identity_part(live_match.external_id) = external_key;
        live_url_exact := canonical_url <> '' AND
          public.catalog_canonical_product_url(live_match.buy_url) = canonical_url;
        IF effective_action = 'update' THEN
          IF effective_target IS NULL OR live_match.id <> effective_target THEN
            conflict_reason := 'Transaction-time identity matched an unexpected catalog product';
          END IF;
        ELSIF live_external_exact OR live_url_exact THEN
          conflict_reason := 'Transaction-time source identity already exists in the catalog';
        ELSIF NOT (
          staged.proposed_action = 'manual_review'
          AND staged.resolution_action = 'create'
          AND staged.resolution_confirmed = true
        ) THEN
          conflict_reason := 'Transaction-time descriptive identity requires manual review';
        END IF;
      ELSIF effective_action = 'update' AND (
        effective_target IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.shop_catalog
          WHERE id = effective_target AND is_demo = false
            AND source IS DISTINCT FROM 'phase_2_curated_demo'
        )
      ) THEN
        conflict_reason := 'The selected update target is missing or protected';
      END IF;
    END IF;

    IF conflict_reason IS NOT NULL THEN
      UPDATE public.catalog_import_rows
      SET proposed_action = 'manual_review', duplicate_reason = conflict_reason,
          review_status = 'pending', reviewed_by = NULL, reviewed_at = NULL,
          resolution_action = NULL, resolution_catalog_id = NULL,
          resolution_confirmed = false, resolution_note = NULL,
          resolved_by = NULL, resolved_at = NULL, updated_at = now()
      WHERE id = staged.id;
      PERFORM public.refresh_catalog_import_batch_lifecycle(_batch);
      RETURN jsonb_build_object(
        'created', 0, 'updated', 0, 'skipped', 0, 'verified', false,
        'blockedRow', staged.row_number, 'blockedReason', conflict_reason,
        'remaining', ready_count
      );
    END IF;
  END LOOP;

  FOR staged IN
    SELECT * FROM public.catalog_import_rows
    WHERE batch_id = _batch AND review_status = 'approved'
    ORDER BY row_number FOR UPDATE
  LOOP
    item := staged.normalized_data;
    effective_action := COALESCE(staged.resolution_action, staged.proposed_action);
    effective_target := COALESCE(staged.resolution_catalog_id, staged.catalog_id);

    IF effective_action = 'skip' THEN
      UPDATE public.catalog_import_rows
      SET review_status = 'skipped', updated_at = now() WHERE id = staged.id;
      skipped_count := skipped_count + 1;
      CONTINUE;
    ELSIF effective_action = 'update' THEN
      imported_catalog_id := NULL;
      UPDATE public.shop_catalog
      SET name = item->>'name', brand = item->>'brand', kind = (item->>'kind')::public.item_kind,
          category = item->>'category', color = item->>'color',
          material = NULLIF(item->>'material', ''), fit = NULLIF(item->>'fit', ''),
          season = (item->>'season')::public.season,
          formality = (item->>'formality')::public.formality,
          condition = (item->>'condition')::public.item_condition,
          price = (item->>'current_price')::numeric,
          current_price = (item->>'current_price')::numeric,
          original_price = NULLIF(item->>'original_price', '')::numeric,
          currency = item->>'currency',
          available_sizes = ARRAY(SELECT jsonb_array_elements_text(item->'available_sizes')),
          source_updated_at = NULLIF(item->>'source_updated_at', '')::timestamptz,
          retailer = item->>'retailer', buy_url = item->>'buy_url', image_url = item->>'image_url',
          availability = item->>'availability', external_id = NULLIF(item->>'external_id', ''),
          source = 'real_catalog_import', source_type = item->>'source_type',
          source_name = item->>'source_name', source_url = NULLIF(item->>'source_url', ''),
          image_rights_basis = item->>'image_rights_basis',
          verification_method = item->>'verification_method',
          affiliate = (item->>'affiliate')::boolean,
          affiliate_disclosure = NULLIF(item->>'affiliate_disclosure', ''),
          vibe = item->>'vibe', price_tier = item->>'price_tier',
          accessory_subtype = NULLIF(item->>'accessory_subtype', ''),
          fragrance_family = NULLIF(item->>'fragrance_family', ''),
          description = item->>'description'
      WHERE id = effective_target AND is_demo = false
        AND source IS DISTINCT FROM 'phase_2_curated_demo'
      RETURNING id INTO imported_catalog_id;
      IF imported_catalog_id IS NULL THEN
        RAISE EXCEPTION 'Update target changed during import for row %', staged.row_number;
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
        NULLIF(item->>'fit', ''), (item->>'season')::public.season,
        (item->>'formality')::public.formality, (item->>'condition')::public.item_condition,
        (item->>'current_price')::numeric, (item->>'current_price')::numeric,
        NULLIF(item->>'original_price', '')::numeric, item->>'currency',
        ARRAY(SELECT jsonb_array_elements_text(item->'available_sizes')),
        NULLIF(item->>'source_updated_at', '')::timestamptz,
        item->>'retailer', item->>'buy_url', item->>'image_url', item->>'availability',
        NULLIF(item->>'external_id', ''), 'real_catalog_import', item->>'source_type',
        item->>'source_name', NULLIF(item->>'source_url', ''), item->>'image_rights_basis',
        item->>'verification_method', (item->>'affiliate')::boolean,
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

  batch_status := public.refresh_catalog_import_batch_lifecycle(_batch);
  SELECT count(*)::integer INTO remaining_count
  FROM public.catalog_import_rows
  WHERE batch_id = _batch AND review_status NOT IN ('imported', 'rejected', 'skipped');

  RETURN jsonb_build_object(
    'created', created_count, 'updated', updated_count, 'skipped', skipped_count,
    'verified', false, 'status', batch_status, 'remaining', remaining_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_catalog_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_catalog_batch(uuid) TO authenticated;

-- All import mutations now flow through authenticated administrator RPCs.
DROP POLICY IF EXISTS "catalog imports admin insert batches" ON public.catalog_import_batches;
DROP POLICY IF EXISTS "catalog imports admin update batches" ON public.catalog_import_batches;
DROP POLICY IF EXISTS "catalog imports admin insert rows" ON public.catalog_import_rows;
DROP POLICY IF EXISTS "catalog imports admin update rows" ON public.catalog_import_rows;
REVOKE INSERT, UPDATE, DELETE ON public.catalog_import_batches FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.catalog_import_rows FROM authenticated;
GRANT SELECT ON public.catalog_import_batches TO authenticated;
GRANT SELECT ON public.catalog_import_rows TO authenticated;

-- Product draft paths are owner- and row-bound. Direct replacement is not
-- allowed, and deletion fails closed if either staging or catalog references it.
DROP POLICY IF EXISTS "catalog product images admin upload" ON storage.objects;
CREATE POLICY "catalog product images admin upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'catalog-products'
    AND public.is_admin(auth.uid())
    AND array_length(storage.foldername(name), 1) = 4
    AND (storage.foldername(name))[1] = 'drafts'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.catalog_import_rows row
      JOIN public.catalog_import_batches batch ON batch.id = row.batch_id
      WHERE row.id::text = (storage.foldername(name))[4]
        AND batch.id::text = (storage.foldername(name))[3]
        AND batch.created_by = auth.uid()
        AND row.review_status NOT IN ('imported', 'rejected', 'skipped')
    )
    AND storage.filename(name) ~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|webp|avif)$'
    AND lower(storage.extension(name)) IN ('png', 'jpg', 'webp', 'avif')
  );

DROP POLICY IF EXISTS "catalog product images admin update" ON storage.objects;
DROP POLICY IF EXISTS "catalog product images admin delete" ON storage.objects;
CREATE POLICY "catalog product images owner cleanup"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'catalog-products'
    AND public.is_admin(auth.uid())
    AND (storage.foldername(name))[1] = 'drafts'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1 FROM public.catalog_import_rows row
      WHERE row.normalized_data->>'image_url' LIKE '%/catalog-products/' || name
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.shop_catalog product
      WHERE product.image_url LIKE '%/catalog-products/' || name
    )
  );

CREATE OR REPLACE FUNCTION public.prepare_catalog_import_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  deleted_batches integer;
  anonymized_batches integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  DELETE FROM public.catalog_import_batches batch
  WHERE batch.created_by = caller
    AND NOT EXISTS (
      SELECT 1 FROM public.catalog_import_rows row
      WHERE row.batch_id = batch.id AND row.review_status = 'imported'
    );
  GET DIAGNOSTICS deleted_batches = ROW_COUNT;

  UPDATE public.catalog_import_batches SET created_by = NULL, updated_at = now()
  WHERE created_by = caller;
  GET DIAGNOSTICS anonymized_batches = ROW_COUNT;
  UPDATE public.catalog_import_rows
  SET reviewed_by = NULL, resolved_by = NULL, updated_at = now()
  WHERE reviewed_by = caller OR resolved_by = caller;
  UPDATE public.content_reports
  SET reporter_id = NULL, attachment_path = NULL, updated_at = now()
  WHERE reporter_id = caller;

  RETURN jsonb_build_object(
    'deletedDraftBatches', deleted_batches,
    'anonymizedAuditBatches', anonymized_batches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_catalog_import_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_catalog_import_account_deletion() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_account_storage_cleanup_paths()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN jsonb_build_object(
    'reports', COALESCE((
      SELECT jsonb_agg(name ORDER BY name) FROM storage.objects
      WHERE bucket_id = 'reports' AND name LIKE caller::text || '/%'
    ), '[]'::jsonb),
    'catalogProducts', COALESCE((
      SELECT jsonb_agg(object.name ORDER BY object.name)
      FROM storage.objects object
      WHERE object.bucket_id = 'catalog-products'
        AND object.name LIKE 'drafts/' || caller::text || '/%'
        AND NOT EXISTS (
          SELECT 1 FROM public.catalog_import_rows row
          WHERE row.normalized_data->>'image_url' LIKE '%/catalog-products/' || object.name
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.shop_catalog product
          WHERE product.image_url LIKE '%/catalog-products/' || object.name
        )
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_account_storage_cleanup_paths() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_storage_cleanup_paths() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_catalog_import_export()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN jsonb_build_object(
    'batches', COALESCE((
      SELECT jsonb_agg(to_jsonb(batch) ORDER BY batch.created_at)
      FROM public.catalog_import_batches batch
      WHERE batch.created_by = caller
    ), '[]'::jsonb),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(row) ORDER BY row.created_at)
      FROM public.catalog_import_rows row
      LEFT JOIN public.catalog_import_batches batch ON batch.id = row.batch_id
      WHERE batch.created_by = caller OR row.reviewed_by = caller OR row.resolved_by = caller
    ), '[]'::jsonb),
    'reports', COALESCE((
      SELECT jsonb_agg(to_jsonb(report) ORDER BY report.created_at)
      FROM public.content_reports report
      WHERE report.reporter_id = caller
    ), '[]'::jsonb),
    'catalogProductImagePaths', COALESCE((
      SELECT jsonb_agg(object.name ORDER BY object.name)
      FROM storage.objects object
      WHERE object.bucket_id = 'catalog-products'
        AND object.name LIKE 'drafts/' || caller::text || '/%'
    ), '[]'::jsonb),
    'reportScreenshotPaths', COALESCE((
      SELECT jsonb_agg(object.name ORDER BY object.name)
      FROM storage.objects object
      WHERE object.bucket_id = 'reports' AND object.name LIKE caller::text || '/%'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_catalog_import_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_catalog_import_export() TO authenticated;

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

-- --------------------------------------------------------------------------
-- Phase 4A review-blocker reconciliation. The migration is still unshipped,
-- so these final definitions keep the entire reviewed change forward-only
-- after the weak Lovable migration without creating an intermediate release.
-- --------------------------------------------------------------------------

ALTER TABLE public.catalog_import_batches
  DROP CONSTRAINT IF EXISTS catalog_import_batches_status_check;
ALTER TABLE public.catalog_import_batches
  ADD CONSTRAINT catalog_import_batches_status_check CHECK (
    status IN (
      'uploaded', 'validating', 'needs_review', 'approved', 'partially_imported',
      'rejected', 'imported'
    )
  );

ALTER TABLE public.catalog_import_batches
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.catalog_import_batches
  DROP CONSTRAINT IF EXISTS catalog_import_batches_created_by_fkey;
ALTER TABLE public.catalog_import_batches
  ADD CONSTRAINT catalog_import_batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.catalog_import_rows
  DROP CONSTRAINT IF EXISTS catalog_import_rows_review_status_check;
ALTER TABLE public.catalog_import_rows
  ADD CONSTRAINT catalog_import_rows_review_status_check CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'imported', 'skipped')
  );

ALTER TABLE public.catalog_import_rows
  ADD COLUMN IF NOT EXISTS resolution_action text,
  ADD COLUMN IF NOT EXISTS resolution_catalog_id uuid REFERENCES public.shop_catalog(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.catalog_import_rows
  DROP CONSTRAINT IF EXISTS catalog_import_rows_resolution_action_check;
ALTER TABLE public.catalog_import_rows
  ADD CONSTRAINT catalog_import_rows_resolution_action_check CHECK (
    resolution_action IS NULL OR resolution_action IN ('create', 'update', 'skip')
  );

CREATE OR REPLACE FUNCTION public.catalog_identity_part(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(COALESCE(value, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.catalog_canonical_product_url(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    regexp_replace(split_part(lower(btrim(COALESCE(value, ''))), '#', 1), '\?.*$', ''),
    '/+$',
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_identity_part(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_canonical_product_url(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.refresh_catalog_import_batch_lifecycle(_batch uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  terminal_count integer;
  remaining_count integer;
  approved_count integer;
  imported_count integer;
  rejected_count integer;
  next_status text;
BEGIN
  SELECT
    count(*) FILTER (WHERE review_status IN ('imported', 'rejected', 'skipped')),
    count(*) FILTER (WHERE review_status NOT IN ('imported', 'rejected', 'skipped')),
    count(*) FILTER (WHERE review_status = 'approved'),
    count(*) FILTER (WHERE review_status = 'imported'),
    count(*) FILTER (WHERE review_status = 'rejected')
  INTO terminal_count, remaining_count, approved_count, imported_count, rejected_count
  FROM public.catalog_import_rows
  WHERE batch_id = _batch;

  next_status := CASE
    WHEN remaining_count = 0 AND imported_count = 0 AND rejected_count > 0 THEN 'rejected'
    WHEN remaining_count = 0 THEN 'imported'
    WHEN terminal_count > 0 THEN 'partially_imported'
    WHEN approved_count > 0 AND NOT EXISTS (
      SELECT 1 FROM public.catalog_import_rows
      WHERE batch_id = _batch AND review_status = 'pending'
    ) THEN 'approved'
    ELSE 'needs_review'
  END;

  UPDATE public.catalog_import_batches
  SET status = next_status, updated_at = now()
  WHERE id = _batch;

  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_import_batch_lifecycle(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.replan_catalog_import_batch(_batch uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  staged public.catalog_import_rows%ROWTYPE;
  earlier public.catalog_import_rows%ROWTYPE;
  live_match public.shop_catalog%ROWTYPE;
  item jsonb;
  external_key text;
  canonical_url text;
  descriptive_key text;
  planned_action text;
  planned_catalog_id uuid;
  planned_reason text;
  duplicate_count integer;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM 1 FROM public.catalog_import_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch not found'; END IF;

  FOR staged IN
    SELECT * FROM public.catalog_import_rows
    WHERE batch_id = _batch
      AND review_status NOT IN ('imported', 'rejected', 'skipped')
    ORDER BY row_number
    FOR UPDATE
  LOOP
    item := staged.normalized_data;
    planned_action := 'create';
    planned_catalog_id := NULL;
    planned_reason := NULL;

    IF cardinality(staged.validation_errors) > 0 THEN
      planned_action := 'manual_review';
    ELSE
      external_key := CASE
        WHEN btrim(COALESCE(item->>'external_id', '')) = '' THEN ''
        ELSE public.catalog_identity_part(item->>'retailer') || '|' ||
          public.catalog_identity_part(item->>'external_id')
      END;
      canonical_url := public.catalog_canonical_product_url(item->>'buy_url');
      descriptive_key := concat_ws('|',
        public.catalog_identity_part(item->>'brand'),
        public.catalog_identity_part(item->>'name'),
        public.catalog_identity_part(item->>'color'),
        public.catalog_identity_part(item->>'retailer')
      );

      SELECT prior.* INTO earlier
      FROM public.catalog_import_rows prior
      WHERE prior.batch_id = _batch
        AND prior.row_number < staged.row_number
        AND cardinality(prior.validation_errors) = 0
        AND prior.review_status NOT IN ('rejected')
        AND (
          (external_key <> '' AND
            public.catalog_identity_part(prior.normalized_data->>'retailer') || '|' ||
              public.catalog_identity_part(prior.normalized_data->>'external_id') = external_key)
          OR (canonical_url <> '' AND
            public.catalog_canonical_product_url(prior.normalized_data->>'buy_url') = canonical_url)
          OR concat_ws('|',
            public.catalog_identity_part(prior.normalized_data->>'brand'),
            public.catalog_identity_part(prior.normalized_data->>'name'),
            public.catalog_identity_part(prior.normalized_data->>'color'),
            public.catalog_identity_part(prior.normalized_data->>'retailer')
          ) = descriptive_key
        )
      ORDER BY prior.row_number
      LIMIT 1;

      IF FOUND THEN
        IF (external_key <> '' AND
            public.catalog_identity_part(earlier.normalized_data->>'retailer') || '|' ||
              public.catalog_identity_part(earlier.normalized_data->>'external_id') = external_key)
          OR (canonical_url <> '' AND
            public.catalog_canonical_product_url(earlier.normalized_data->>'buy_url') = canonical_url)
        THEN
          planned_action := 'skip';
          planned_reason := format('Exact identity matches batch row %s', earlier.row_number);
        ELSE
          planned_action := 'manual_review';
          planned_reason := format(
            'Brand, name, color, and retailer match batch row %s', earlier.row_number
          );
        END IF;
      ELSE
        SELECT catalog.* INTO live_match
        FROM public.shop_catalog catalog
        WHERE
          (external_key <> '' AND
            public.catalog_identity_part(catalog.retailer) || '|' ||
              public.catalog_identity_part(catalog.external_id) = external_key)
          OR (canonical_url <> '' AND
            public.catalog_canonical_product_url(catalog.buy_url) = canonical_url)
          OR concat_ws('|',
            public.catalog_identity_part(catalog.brand),
            public.catalog_identity_part(catalog.name),
            public.catalog_identity_part(catalog.color),
            public.catalog_identity_part(catalog.retailer)
          ) = descriptive_key
        ORDER BY CASE
          WHEN external_key <> '' AND
            public.catalog_identity_part(catalog.retailer) || '|' ||
              public.catalog_identity_part(catalog.external_id) = external_key THEN 0
          WHEN canonical_url <> '' AND
            public.catalog_canonical_product_url(catalog.buy_url) = canonical_url THEN 1
          ELSE 2
        END
        LIMIT 1;

        IF FOUND THEN
          IF live_match.is_demo OR live_match.source = 'phase_2_curated_demo' THEN
            planned_action := 'manual_review';
            planned_reason := 'The source identity conflicts with a protected demo row';
          ELSIF (external_key <> '' AND
              public.catalog_identity_part(live_match.retailer) || '|' ||
                public.catalog_identity_part(live_match.external_id) = external_key)
            OR (canonical_url <> '' AND
              public.catalog_canonical_product_url(live_match.buy_url) = canonical_url)
          THEN
            planned_action := 'update';
            planned_catalog_id := live_match.id;
            planned_reason := 'Matches an existing retailer identity or canonical product URL';
          ELSE
            planned_action := 'manual_review';
            planned_catalog_id := live_match.id;
            planned_reason := 'Brand, name, color, and retailer match an existing product';
          END IF;
        END IF;
      END IF;
    END IF;

    UPDATE public.catalog_import_rows
    SET proposed_action = planned_action,
        catalog_id = planned_catalog_id,
        duplicate_reason = planned_reason,
        review_status = 'pending',
        reviewed_by = NULL,
        reviewed_at = NULL,
        resolution_action = NULL,
        resolution_catalog_id = NULL,
        resolution_confirmed = false,
        resolution_note = NULL,
        resolved_by = NULL,
        resolved_at = NULL,
        updated_at = now()
    WHERE id = staged.id;
  END LOOP;

  SELECT count(*)::integer INTO duplicate_count
  FROM public.catalog_import_rows
  WHERE batch_id = _batch AND duplicate_reason IS NOT NULL;

  UPDATE public.catalog_import_batches batch
  SET total_row_count = counts.total_count,
      valid_row_count = counts.valid_count,
      invalid_row_count = counts.invalid_count,
      duplicate_row_count = duplicate_count,
      status = 'needs_review',
      updated_at = now()
  FROM (
    SELECT count(*)::integer AS total_count,
      count(*) FILTER (WHERE cardinality(validation_errors) = 0)::integer AS valid_count,
      count(*) FILTER (WHERE cardinality(validation_errors) > 0)::integer AS invalid_count
    FROM public.catalog_import_rows WHERE batch_id = _batch
  ) counts
  WHERE batch.id = _batch;

  RETURN duplicate_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replan_catalog_import_batch(uuid) FROM PUBLIC;

-- Duplicate counts represent actual candidates, never every invalid/manual row.
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
      count(*) FILTER (WHERE duplicate_reason IS NOT NULL)::integer AS duplicate_count
    FROM public.catalog_import_rows WHERE batch_id = target_batch
  ) counts
  WHERE batch.id = target_batch;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_catalog_import_batch(_batch jsonb, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  batch_id uuid;
  staged jsonb;
  result public.catalog_import_batches%ROWTYPE;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0
    OR jsonb_array_length(_rows) > 500
  THEN RAISE EXCEPTION 'Import batch must contain between 1 and 500 rows'; END IF;
  IF btrim(COALESCE(_batch->>'source_name', '')) = ''
    OR btrim(COALESCE(_batch->>'uploaded_file_name', '')) = ''
    OR _batch->>'source_type' NOT IN ('manual_csv', 'manual_json', 'affiliate_feed', 'partner_api', 'authorized_shopify')
    OR (NULLIF(_batch->>'source_url', '') IS NOT NULL
      AND _batch->>'source_url' !~ '^https://[^[:space:]]+$')
  THEN RAISE EXCEPTION 'Invalid import batch metadata'; END IF;

  INSERT INTO public.catalog_import_batches (
    created_by, source_type, source_name, source_url, uploaded_file_name, status
  ) VALUES (
    caller, _batch->>'source_type', btrim(_batch->>'source_name'),
    NULLIF(_batch->>'source_url', ''), btrim(_batch->>'uploaded_file_name'), 'validating'
  ) RETURNING id INTO batch_id;

  FOR staged IN SELECT value FROM jsonb_array_elements(_rows)
  LOOP
    IF jsonb_typeof(staged->'raw_data') <> 'object'
      OR jsonb_typeof(staged->'normalized_data') <> 'object'
      OR staged->'normalized_data' ? 'verified_at'
      OR staged->'normalized_data' ? 'last_checked_at'
    THEN RAISE EXCEPTION 'Invalid staged import row'; END IF;

    INSERT INTO public.catalog_import_rows (
      batch_id, row_number, raw_data, normalized_data, validation_errors, warnings,
      duplicate_reason, proposed_action, review_status, catalog_id
    ) VALUES (
      batch_id, (staged->>'row_number')::integer, staged->'raw_data',
      staged->'normalized_data',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(staged->'validation_errors', '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(staged->'warnings', '[]'::jsonb))),
      NULL, 'create', 'pending', NULL
    );
  END LOOP;

  PERFORM public.replan_catalog_import_batch(batch_id);
  SELECT * INTO result FROM public.catalog_import_batches WHERE id = batch_id;
  RETURN jsonb_build_object(
    'id', result.id, 'total', result.total_row_count, 'valid', result.valid_row_count,
    'invalid', result.invalid_row_count, 'duplicates', result.duplicate_row_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_import_batch(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_catalog_import_batch(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_catalog_import_row_and_replan(
  _row uuid,
  _normalized jsonb,
  _validation_errors text[],
  _warnings text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  batch_id uuid;
  result public.catalog_import_rows%ROWTYPE;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF jsonb_typeof(_normalized) <> 'object'
    OR _normalized ? 'verified_at' OR _normalized ? 'last_checked_at'
  THEN RAISE EXCEPTION 'Invalid normalized import data'; END IF;

  SELECT row.batch_id INTO batch_id
  FROM public.catalog_import_rows row
  WHERE row.id = _row AND row.review_status NOT IN ('imported', 'rejected', 'skipped')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import row is terminal or missing'; END IF;

  UPDATE public.catalog_import_rows
  SET normalized_data = _normalized,
      validation_errors = COALESCE(_validation_errors, '{}'::text[]),
      warnings = COALESCE(_warnings, '{}'::text[]),
      updated_at = now()
  WHERE id = _row;

  -- Replanning every open row prevents a correction from leaving stale or
  -- contradictory duplicate decisions elsewhere in the batch.
  PERFORM public.replan_catalog_import_batch(batch_id);
  SELECT * INTO result FROM public.catalog_import_rows WHERE id = _row;
  RETURN jsonb_build_object(
    'action', result.proposed_action,
    'catalogId', result.catalog_id,
    'errors', result.validation_errors,
    'warnings', result.warnings,
    'duplicateReason', result.duplicate_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_catalog_import_row_and_replan(uuid, jsonb, text[], text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_catalog_import_row_and_replan(uuid, jsonb, text[], text[])
  TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_catalog_import_row(
  _row uuid,
  _action text,
  _catalog_target uuid DEFAULT NULL,
  _confirm_create boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  staged public.catalog_import_rows%ROWTYPE;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO staged FROM public.catalog_import_rows
  WHERE id = _row FOR UPDATE;
  IF NOT FOUND OR staged.review_status <> 'pending' THEN
    RAISE EXCEPTION 'Only unresolved pending rows can be resolved';
  END IF;
  IF staged.proposed_action <> 'manual_review' OR cardinality(staged.validation_errors) > 0 THEN
    RAISE EXCEPTION 'This row does not have a resolvable duplicate decision';
  END IF;
  IF _action NOT IN ('create', 'update', 'skip') THEN RAISE EXCEPTION 'Invalid resolution'; END IF;
  IF _action = 'create' AND _confirm_create IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Creating a possible duplicate requires explicit confirmation';
  END IF;
  IF _action = 'update' THEN
    IF _catalog_target IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.shop_catalog
      WHERE id = _catalog_target AND is_demo = false
        AND source IS DISTINCT FROM 'phase_2_curated_demo'
    ) THEN
      RAISE EXCEPTION 'Update resolution requires a valid non-demo catalog target';
    END IF;
  ELSIF _catalog_target IS NOT NULL THEN
    RAISE EXCEPTION 'Only update resolutions may select a catalog target';
  END IF;

  UPDATE public.catalog_import_rows
  SET resolution_action = _action,
      resolution_catalog_id = CASE WHEN _action = 'update' THEN _catalog_target ELSE NULL END,
      resolution_confirmed = CASE WHEN _action = 'create' THEN true ELSE false END,
      resolution_note = CASE
        WHEN _action = 'create' THEN 'Administrator confirmed create despite possible duplicate'
        WHEN _action = 'update' THEN 'Administrator selected an existing non-demo target'
        ELSE 'Administrator resolved duplicate as skip'
      END,
      resolved_by = caller,
      resolved_at = now(),
      updated_at = now()
  WHERE id = _row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_catalog_import_row(uuid, text, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_catalog_import_row(uuid, text, uuid, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.review_catalog_import_row(_row uuid, _decision text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  staged public.catalog_import_rows%ROWTYPE;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  SELECT * INTO staged FROM public.catalog_import_rows WHERE id = _row FOR UPDATE;
  IF NOT FOUND OR staged.review_status IN ('imported', 'rejected', 'skipped') THEN
    RAISE EXCEPTION 'Import row is terminal or missing';
  END IF;
  IF _decision = 'approved' AND (
    cardinality(staged.validation_errors) > 0
    OR (staged.proposed_action = 'manual_review' AND staged.resolution_action IS NULL)
  ) THEN
    RAISE EXCEPTION 'Resolve validation and duplicate-review issues before approval';
  END IF;

  UPDATE public.catalog_import_rows
  SET review_status = _decision, reviewed_by = caller, reviewed_at = now(), updated_at = now()
  WHERE id = _row;
  PERFORM public.refresh_catalog_import_batch_lifecycle(staged.batch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_catalog_import_row(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_catalog_import_row(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_valid_catalog_import_rows(_batch uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  approved_count integer;
BEGIN
  IF caller IS NULL OR NOT public.is_admin(caller) THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM 1 FROM public.catalog_import_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch not found'; END IF;

  UPDATE public.catalog_import_rows
  SET review_status = 'approved', reviewed_by = caller, reviewed_at = now(), updated_at = now()
  WHERE batch_id = _batch
    AND review_status = 'pending'
    AND cardinality(validation_errors) = 0
    AND (proposed_action <> 'manual_review' OR resolution_action IS NOT NULL);
  GET DIAGNOSTICS approved_count = ROW_COUNT;
  IF approved_count = 0 THEN RAISE EXCEPTION 'This batch has no rows ready for approval'; END IF;
  PERFORM public.refresh_catalog_import_batch_lifecycle(_batch);
  RETURN approved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_valid_catalog_import_rows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_valid_catalog_import_rows(uuid) TO authenticated;

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
  IF jsonb_typeof(item) <> 'object' THEN RAISE EXCEPTION 'Imported product must be an object'; END IF;
  IF item ?| ARRAY['verified_at', 'last_checked_at', 'is_demo', 'archived', 'source'] THEN
    RAISE EXCEPTION 'Imports cannot set protected catalog control fields';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(item) field
    WHERE field.key = ANY (ARRAY[
      'name', 'brand', 'kind', 'category', 'color', 'currency', 'retailer', 'buy_url',
      'image_url', 'image_rights_basis', 'source_type', 'source_name', 'source_url',
      'verification_method', 'availability', 'external_id', 'affiliate_disclosure',
      'vibe', 'price_tier', 'accessory_subtype', 'fragrance_family', 'description',
      'material', 'fit', 'source_updated_at', 'formality', 'season', 'condition'
    ]) AND jsonb_typeof(field.value) NOT IN ('string', 'null')
  ) THEN RAISE EXCEPTION 'Imported text fields must be strings'; END IF;
  IF jsonb_typeof(item->'current_price') IS DISTINCT FROM 'number'
    OR (item ? 'original_price' AND jsonb_typeof(item->'original_price') NOT IN ('number', 'null'))
  THEN RAISE EXCEPTION 'Imported price fields must be numbers'; END IF;
  IF item->>'id' ~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$'
    OR image_reference LIKE '/catalog/phase-2/%'
  THEN RAISE EXCEPTION 'Imports cannot reference protected Phase 2 demo identities or images'; END IF;
  IF btrim(COALESCE(item->>'name', '')) = ''
    OR btrim(COALESCE(item->>'brand', '')) = ''
    OR btrim(COALESCE(item_category, '')) = ''
    OR btrim(COALESCE(item->>'color', '')) = ''
    OR btrim(COALESCE(item->>'retailer', '')) = ''
    OR btrim(COALESCE(item->>'source_name', '')) = ''
    OR btrim(COALESCE(item->>'vibe', '')) = ''
    OR btrim(COALESCE(item->>'description', '')) = ''
  THEN RAISE EXCEPTION 'Imported product is missing required text'; END IF;
  IF char_length(btrim(item->>'name')) NOT BETWEEN 2 AND 160
    OR char_length(btrim(item->>'brand')) > 80
    OR char_length(btrim(item->>'color')) > 60
    OR char_length(btrim(item->>'retailer')) > 80
    OR char_length(btrim(item->>'source_name')) > 120
    OR char_length(btrim(item->>'vibe')) > 80
    OR char_length(btrim(item->>'description')) > 400
    OR char_length(COALESCE(item->>'material', '')) > 80
    OR char_length(COALESCE(item->>'fit', '')) > 40
    OR char_length(COALESCE(item->>'external_id', '')) > 160
    OR char_length(COALESCE(item->>'affiliate_disclosure', '')) > 200
  THEN RAISE EXCEPTION 'Imported product text exceeds supported limits'; END IF;
  IF COALESCE(item->>'buy_url', '') !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Imported product URL must use HTTPS';
  END IF;
  IF NULLIF(item->>'source_url', '') IS NOT NULL
    AND item->>'source_url' !~ '^https://[^[:space:]]+$'
  THEN RAISE EXCEPTION 'Imported source URL must use HTTPS'; END IF;
  IF NULLIF(item->>'source_updated_at', '') IS NOT NULL THEN
    BEGIN
      PERFORM (item->>'source_updated_at')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Imported source update timestamp is invalid';
    END;
  END IF;
  IF jsonb_typeof(item->'available_sizes') IS DISTINCT FROM 'array'
    OR jsonb_array_length(item->'available_sizes') > 40
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(item->'available_sizes') size_value
      WHERE jsonb_typeof(size_value) <> 'string'
        OR btrim(size_value #>> '{}') = '' OR char_length(btrim(size_value #>> '{}')) > 40
    )
  THEN RAISE EXCEPTION 'Imported available sizes must be valid nonblank strings'; END IF;
  IF COALESCE(item->>'season', '') NOT IN ('all', 'spring', 'summer', 'fall', 'winter')
    OR COALESCE(item->>'formality', '') NOT IN ('loungewear', 'casual', 'smart_casual', 'business', 'formal')
    OR COALESCE(item->>'condition', '') NOT IN ('new', 'vintage', 'thrift', 'resale')
  THEN RAISE EXCEPTION 'Imported season, formality, or condition is unsupported'; END IF;
  IF jsonb_typeof(item->'affiliate') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Imported affiliate value must be boolean';
  END IF;
  IF COALESCE(item->>'current_price', '') !~ '^[0-9]+(\.[0-9]+)?$'
    OR (item->>'current_price')::numeric <= 0 OR (item->>'current_price')::numeric > 100000
  THEN RAISE EXCEPTION 'Imported current price must be positive'; END IF;
  IF NULLIF(item->>'original_price', '') IS NOT NULL AND (
    item->>'original_price' !~ '^[0-9]+(\.[0-9]+)?$'
    OR (item->>'original_price')::numeric <= 0 OR (item->>'original_price')::numeric > 100000
    OR (item->>'original_price')::numeric < (item->>'current_price')::numeric
  ) THEN RAISE EXCEPTION 'Imported original price is invalid'; END IF;
  IF COALESCE(item->>'currency', '') NOT IN ('USD', 'CAD', 'EUR', 'GBP', 'AUD') THEN
    RAISE EXCEPTION 'Imported currency is unsupported';
  END IF;
  IF NOT (
    COALESCE(image_reference, '') ~ '^https://[^[:space:]]+$'
    OR COALESCE(image_reference, '') ~ '^/catalog/([a-z0-9._-]+/)*[a-z0-9._-]+\.(jpg|jpeg|png|webp|avif|svg)$'
  ) THEN RAISE EXCEPTION 'Imported product image must use HTTPS or an approved catalog path'; END IF;
  IF NOT COALESCE((
    (image_reference LIKE '/catalog/%' AND rights_basis = 'project_owned')
    OR (image_reference ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/catalog-products/'
      AND rights_basis IN ('authorized', 'licensed', 'project_owned'))
    OR (image_reference ~ '^https://' AND rights_basis IN ('authorized', 'licensed'))
  ), false) THEN RAISE EXCEPTION 'Imported product image rights do not match its source'; END IF;
  IF COALESCE(item->>'availability', '') NOT IN ('in_stock', 'low_stock', 'preorder', 'out_of_stock', 'discontinued')
    OR COALESCE(item->>'source_type', '') NOT IN ('manual', 'affiliate_feed', 'partner_api')
    OR COALESCE(item->>'verification_method', '') NOT IN ('manual', 'feed', 'partner_api')
    OR COALESCE(item->>'price_tier', '') NOT IN ('entry', 'mid', 'premium', 'luxury')
  THEN RAISE EXCEPTION 'Imported product contains unsupported catalog values'; END IF;
  IF NOT COALESCE((
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
  ), false) THEN RAISE EXCEPTION 'Imported category and kind do not agree'; END IF;
  IF item_kind = 'accessory' AND COALESCE(item->>'accessory_subtype', '') NOT IN (
    'earrings', 'glasses', 'prescription_glasses', 'sunglasses', 'necklaces',
    'chains', 'bracelets', 'rings', 'watches', 'hat', 'cap', 'beanie', 'belts',
    'bags', 'socks', 'scarves', 'wallets', 'grills', 'jewelry'
  ) THEN RAISE EXCEPTION 'Imported accessory subtype is required and unsupported'; END IF;
  IF item_kind <> 'accessory' AND NULLIF(item->>'accessory_subtype', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Imported accessory subtype conflicts with kind';
  END IF;
  IF item_kind = 'fragrance' AND COALESCE(item->>'fragrance_family', '') NOT IN (
    'fresh', 'woody', 'warm', 'sweet', 'aquatic', 'floral', 'leather', 'other'
  ) THEN RAISE EXCEPTION 'Imported fragrance family is required and unsupported'; END IF;
  IF item_kind <> 'fragrance' AND NULLIF(item->>'fragrance_family', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Imported fragrance family conflicts with kind';
  END IF;
  IF (item->>'affiliate')::boolean
    AND btrim(COALESCE(item->>'affiliate_disclosure', '')) = ''
  THEN RAISE EXCEPTION 'Affiliate imports require a disclosure'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_valid_catalog_import_product(jsonb) FROM PUBLIC;

-- Effective final importer: all review-blocker columns and validation rules now
-- exist, and the delegated implementation keeps the full operation atomic.
CREATE OR REPLACE FUNCTION public.import_catalog_batch(_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.import_catalog_batch_review_blocker_impl(_batch);
END;
$$;

REVOKE ALL ON FUNCTION public.import_catalog_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_catalog_batch(uuid) TO authenticated;
