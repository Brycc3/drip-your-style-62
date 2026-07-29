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

DROP POLICY IF EXISTS "reports owner delete" ON storage.objects;
CREATE POLICY "reports owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
