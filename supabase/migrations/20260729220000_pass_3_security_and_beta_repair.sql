-- ============================================================================
-- Pass 3 security and beta repair
-- Review only: this migration is intentionally not applied by Codex.
-- Preserves all existing data and makes the 51 Phase 2 demos immutable.
-- ============================================================================

-- Fail closed if the curated catalog no longer has the exact expected identity
-- and project-owned image shape. This block reads only; it never rewrites demos.
DO $$
DECLARE
  curated_count integer;
  invalid_count integer;
BEGIN
  SELECT count(*) INTO curated_count
  FROM public.shop_catalog
  WHERE source = 'phase_2_curated_demo';

  SELECT count(*) INTO invalid_count
  FROM public.shop_catalog
  WHERE source = 'phase_2_curated_demo'
    AND (
      is_demo IS DISTINCT FROM true
      OR id::text !~ '^20000000-0000-4000-8000-0000000000(0[1-9]|[1-4][0-9]|5[01])$'
      OR image_url !~ '^/catalog/phase-2/[a-z0-9-]+\.svg$'
    );

  IF curated_count <> 51 OR invalid_count <> 0 THEN
    RAISE EXCEPTION
      'Phase 2 catalog integrity check failed (expected 51 immutable curated demos)';
  END IF;
END $$;

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

-- Catalog writes require both admin authorization and a non-demo row.
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

-- No browser role may delete catalog rows. Archive or update availability.
DROP POLICY IF EXISTS "catalog admin delete" ON public.shop_catalog;

-- New and updated catalog rows must keep category and kind aligned. NOT VALID
-- preserves any unrelated legacy data while still enforcing this on writes.
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.verified_at IS NOT NULL OR NEW.last_checked_at IS NOT NULL THEN
      RAISE EXCEPTION 'New catalog products must be explicitly verified after creation';
    END IF;
    RETURN NEW;
  END IF;

  IF (
    OLD.verified_at IS DISTINCT FROM NEW.verified_at
    OR OLD.last_checked_at IS DISTINCT FROM NEW.last_checked_at
  ) AND current_setting('drip.catalog_verification_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Use the explicit catalog verification action to update verification timestamps';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_catalog_verification_timestamps() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_new_catalog_verification_timestamps ON public.shop_catalog;
CREATE TRIGGER protect_new_catalog_verification_timestamps
  BEFORE INSERT ON public.shop_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_catalog_verification_timestamps();

DROP TRIGGER IF EXISTS protect_catalog_verification_timestamps ON public.shop_catalog;
CREATE TRIGGER protect_catalog_verification_timestamps
  BEFORE UPDATE OF verified_at, last_checked_at ON public.shop_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_catalog_verification_timestamps();

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
  IF NOT public.is_admin(auth.uid()) THEN
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
    OR item.image_rights_basis IS NULL OR NOT (
      (item.image_url LIKE '/catalog/%' AND item.image_rights_basis = 'project_owned')
      OR (item.image_url ~ '^https://' AND item.image_rights_basis IN ('authorized', 'licensed'))
    )
    OR item.current_price IS NULL OR item.current_price <= 0
    OR item.availability NOT IN ('in_stock', 'low_stock', 'preorder')
    OR item.source_type IS NULL
    OR item.source_type NOT IN ('manual', 'affiliate_feed', 'partner_api', 'verified')
    OR item.source_name IS NULL OR btrim(item.source_name) = ''
    OR item.verification_method IS NULL
    OR item.verification_method NOT IN ('manual', 'feed', 'partner_api')
    OR item.vibe IS NULL OR btrim(item.vibe) = ''
    OR item.price_tier IS NULL OR item.price_tier NOT IN ('entry', 'mid', 'premium', 'luxury')
    OR (item.affiliate AND (item.affiliate_disclosure IS NULL OR btrim(item.affiliate_disclosure) = ''))
  THEN
    RAISE EXCEPTION 'Catalog product is incomplete or inconsistent';
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

REVOKE ALL ON FUNCTION public.verify_shop_catalog_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_shop_catalog_item(uuid) TO authenticated;

-- Private problem-report attachment bucket.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'reports',
  'reports',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Object path contract:
--   <authenticated-user-uuid>/<report-uuid>/<attachment-uuid>.<extension>
DROP POLICY IF EXISTS "reports owner upload" ON storage.objects;
CREATE POLICY "reports owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
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
      SELECT 1
      FROM public.content_reports report
      WHERE report.id::text = (storage.foldername(name))[2]
        AND report.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reports owner read" ON storage.objects;
CREATE POLICY "reports owner read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "reports admin read" ON storage.objects;
CREATE POLICY "reports admin read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.is_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.attach_problem_report_screenshot(_report uuid, _path text)
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
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'reports' AND name = _path
  ) THEN
    RAISE EXCEPTION 'Report screenshot was not uploaded';
  END IF;

  UPDATE public.content_reports
  SET attachment_path = _path
  WHERE id = _report
    AND reporter_id = caller
    AND attachment_path IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found, not owned, or already has a screenshot';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_problem_report_screenshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_problem_report_screenshot(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "reports owner delete" ON storage.objects;
CREATE POLICY "reports owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
