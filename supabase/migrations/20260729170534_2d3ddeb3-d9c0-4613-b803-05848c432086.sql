
ALTER TABLE public.shop_catalog
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS shop_catalog_archived_idx
  ON public.shop_catalog(archived) WHERE archived = false;

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS attachment_path text;

DROP POLICY IF EXISTS "reports owner upload" ON storage.objects;
CREATE POLICY "reports owner upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "reports owner read" ON storage.objects;
CREATE POLICY "reports owner read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "reports owner delete" ON storage.objects;
CREATE POLICY "reports owner delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
