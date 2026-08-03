CREATE OR REPLACE FUNCTION public.verify_shop_catalog_item(_catalog_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.shop_catalog
  SET verified_at = _now,
      last_checked_at = _now,
      verification_method = 'admin_manual'
  WHERE id = _catalog_id
    AND COALESCE(is_demo, false) = false
    AND COALESCE(archived, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found, is a demo row, or is archived';
  END IF;

  RETURN _now;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_shop_catalog_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_shop_catalog_item(uuid) TO authenticated;

-- Clean-replay compatibility: Pass 3 installed this signature with a void
-- return type, while this already-applied Lovable migration replaced it with
-- boolean. PostgreSQL requires an explicit drop when a return type changes.
-- Existing environments skip this historical migration and are reconciled by
-- the later Phase 4A migration; this keeps a fresh migration replay faithful.
DROP FUNCTION IF EXISTS public.attach_problem_report_screenshot(uuid, text);
CREATE OR REPLACE FUNCTION public.attach_problem_report_screenshot(_report uuid, _path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _path IS NULL OR _path NOT LIKE (auth.uid()::text || '/' || _report::text || '/%') THEN
    RAISE EXCEPTION 'Attachment must belong to this report';
  END IF;

  UPDATE public.content_reports
  SET attachment_path = _path
  WHERE id = _report
    AND reporter_id = auth.uid()
    AND attachment_path IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found or already has an attachment';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_problem_report_screenshot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_problem_report_screenshot(uuid, text) TO authenticated;
