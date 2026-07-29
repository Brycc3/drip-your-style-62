-- =========================================================================
-- Pass 1 foundation: admin flag, comments toggle, report moderation,
-- shop provenance, block-aware social RLS. Idempotent; preserves data.
-- =========================================================================

-- 1. profiles: is_admin + public_suspended
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_suspended boolean NOT NULL DEFAULT false;

-- 2. saved_outfits: comments_enabled
ALTER TABLE public.saved_outfits
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true;

-- 3. content_reports moderation columns
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_note text;

-- status already exists as text default 'open'; add CHECK if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_reports_status_check'
      AND conrelid = 'public.content_reports'::regclass
  ) THEN
    -- normalize any legacy values first
    UPDATE public.content_reports
      SET status = 'open'
      WHERE status IS NULL OR status NOT IN ('open','reviewed','dismissed','actioned');
    ALTER TABLE public.content_reports
      ADD CONSTRAINT content_reports_status_check
      CHECK (status IN ('open','reviewed','dismissed','actioned'));
  END IF;
END $$;

ALTER TABLE public.content_reports
  ALTER COLUMN status SET DEFAULT 'open';

-- 4. shop_catalog provenance
ALTER TABLE public.shop_catalog
  ADD COLUMN IF NOT EXISTS source_type text,           -- e.g. 'demo','manual','affiliate_feed','partner_api'
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_url  text,
  ADD COLUMN IF NOT EXISTS image_rights_basis text,    -- e.g. 'authorized','project_owned','demo_asset'
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_method text,   -- e.g. 'manual','feed','partner_api'
  ADD COLUMN IF NOT EXISTS affiliate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliate_disclosure text;

-- last_checked / availability / current_price already present per generated types; ensure defaults exist.
ALTER TABLE public.shop_catalog
  ALTER COLUMN availability SET DEFAULT 'unknown';

-- Backfill: existing demo rows carry an honest demo provenance tag.
UPDATE public.shop_catalog
   SET source_type = 'demo',
       image_rights_basis = COALESCE(image_rights_basis, 'demo_asset')
 WHERE is_demo = true
   AND source_type IS NULL;

-- =========================================================================
-- 5. Helpers (SECURITY DEFINER, locked search_path). Grants restrictive.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = _uid), false);
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- Symmetric block check: true if either has blocked the other.
CREATE OR REPLACE FUNCTION public.blocks_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

REVOKE ALL ON FUNCTION public.blocks_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blocks_between(uuid, uuid) TO authenticated;

-- =========================================================================
-- 6. RLS: saved_outfits public visibility respects public_suspended
-- =========================================================================
DROP POLICY IF EXISTS "public outfits readable" ON public.saved_outfits;
CREATE POLICY "public outfits readable"
  ON public.saved_outfits FOR SELECT
  TO anon, authenticated
  USING (
    visibility = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = saved_outfits.user_id AND p.public_suspended = true
    )
  );

-- =========================================================================
-- 7. RLS: outfit_comments — block + comments_enabled aware
-- =========================================================================
DROP POLICY IF EXISTS "comments readable on public" ON public.outfit_comments;
CREATE POLICY "comments readable on public"
  ON public.outfit_comments FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_outfits o
      WHERE o.id = outfit_comments.outfit_id
        AND o.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS "comment own" ON public.outfit_comments;
CREATE POLICY "comment own"
  ON public.outfit_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.saved_outfits o
      WHERE o.id = outfit_comments.outfit_id
        AND o.visibility = 'public'
        AND COALESCE(o.comments_enabled, true) = true
        AND NOT public.blocks_between(auth.uid(), o.user_id)
    )
  );

DROP POLICY IF EXISTS "delete own comment" ON public.outfit_comments;
CREATE POLICY "delete own comment"
  ON public.outfit_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "outfit owner deletes comment" ON public.outfit_comments;
CREATE POLICY "outfit owner deletes comment"
  ON public.outfit_comments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_outfits o
      WHERE o.id = outfit_comments.outfit_id AND o.user_id = auth.uid()
    )
  );

-- =========================================================================
-- 8. RLS: outfit_likes — no likes across a block; delete-own preserved
-- =========================================================================
DROP POLICY IF EXISTS "like own" ON public.outfit_likes;
CREATE POLICY "like own"
  ON public.outfit_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.saved_outfits o
      WHERE o.id = outfit_likes.outfit_id
        AND o.visibility = 'public'
        AND NOT public.blocks_between(auth.uid(), o.user_id)
    )
  );

DROP POLICY IF EXISTS "unlike own" ON public.outfit_likes;
CREATE POLICY "unlike own"
  ON public.outfit_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =========================================================================
-- 9. RLS: follows — no follow across a block; delete-own preserved
-- =========================================================================
DROP POLICY IF EXISTS "follow yourself out" ON public.follows;
CREATE POLICY "follow yourself out"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = follower_id
    AND follower_id <> followee_id
    AND NOT public.blocks_between(follower_id, followee_id)
  );

DROP POLICY IF EXISTS "unfollow yourself" ON public.follows;
CREATE POLICY "unfollow yourself"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- =========================================================================
-- 10. RLS: content_reports — reporter self-serve + admin full access
-- =========================================================================
DROP POLICY IF EXISTS "reporter inserts own" ON public.content_reports;
CREATE POLICY "reporter inserts own"
  ON public.content_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reporter reads own" ON public.content_reports;
CREATE POLICY "reporter reads own"
  ON public.content_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "admin reads all reports" ON public.content_reports;
CREATE POLICY "admin reads all reports"
  ON public.content_reports FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin updates reports" ON public.content_reports;
CREATE POLICY "admin updates reports"
  ON public.content_reports FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================================
-- 11. RLS: shop_catalog — read remains open to authenticated; only admins
--     may insert/update/delete. Existing rows (including 51 demos) untouched.
-- =========================================================================
DROP POLICY IF EXISTS "catalog admin insert" ON public.shop_catalog;
CREATE POLICY "catalog admin insert"
  ON public.shop_catalog FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "catalog admin update" ON public.shop_catalog;
CREATE POLICY "catalog admin update"
  ON public.shop_catalog FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "catalog admin delete" ON public.shop_catalog;
CREATE POLICY "catalog admin delete"
  ON public.shop_catalog FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));