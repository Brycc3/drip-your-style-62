
-- ============================================================
-- FIX GRANTS on existing public tables (RLS is on but grants were missing)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closet_items TO authenticated;
GRANT ALL ON public.closet_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fragrances TO authenticated;
GRANT ALL ON public.fragrances TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_feedback TO authenticated;
GRANT ALL ON public.outfit_feedback TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_items TO authenticated;
GRANT ALL ON public.outfit_items TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_outfits TO authenticated;
GRANT SELECT ON public.saved_outfits TO anon;
GRANT ALL ON public.saved_outfits TO service_role;

GRANT SELECT ON public.shop_catalog TO authenticated;
GRANT SELECT ON public.shop_catalog TO anon;
GRANT ALL ON public.shop_catalog TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_feedback TO authenticated;
GRANT ALL ON public.shop_feedback TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wear_history TO authenticated;
GRANT ALL ON public.wear_history TO service_role;

-- ============================================================
-- EXTEND profiles for public presence
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handle text UNIQUE,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_handle_idx ON public.profiles (handle) WHERE handle IS NOT NULL;

-- Open a public read path for public profiles only (existing "own profile read" still covers self)
DROP POLICY IF EXISTS "public profiles readable" ON public.profiles;
CREATE POLICY "public profiles readable" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (is_public = true);

-- ============================================================
-- EXTEND saved_outfits with visibility + cover + share slug
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.outfit_visibility AS ENUM ('private','friends','public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.saved_outfits
  ADD COLUMN IF NOT EXISTS visibility public.outfit_visibility NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS share_slug text UNIQUE DEFAULT substr(replace(gen_random_uuid()::text,'-',''),1,10),
  ADD COLUMN IF NOT EXISTS worn_at timestamptz;

CREATE INDEX IF NOT EXISTS saved_outfits_public_idx ON public.saved_outfits (created_at DESC) WHERE visibility='public';
CREATE INDEX IF NOT EXISTS saved_outfits_user_idx ON public.saved_outfits (user_id, created_at DESC);

-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows readable" ON public.follows
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "follow yourself out" ON public.follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "unfollow yourself" ON public.follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows (followee_id);

-- Helper: is A following B?
CREATE OR REPLACE FUNCTION public.is_following(_follower uuid, _followee uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id=_follower AND followee_id=_followee)
$$;

-- ============================================================
-- Extend saved_outfits SELECT policy for public + friends
-- ============================================================
DROP POLICY IF EXISTS "public outfits readable" ON public.saved_outfits;
CREATE POLICY "public outfits readable" ON public.saved_outfits
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS "friends outfits readable" ON public.saved_outfits;
CREATE POLICY "friends outfits readable" ON public.saved_outfits
  FOR SELECT TO authenticated
  USING (visibility = 'friends' AND public.is_following(auth.uid(), user_id));

-- outfit_items visible when parent outfit visible
DROP POLICY IF EXISTS "outfit items follow parent" ON public.outfit_items;
CREATE POLICY "outfit items follow parent" ON public.outfit_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.saved_outfits o
    WHERE o.id = outfit_items.outfit_id
      AND (o.visibility = 'public'
           OR (o.visibility = 'friends' AND public.is_following(auth.uid(), o.user_id)))
  ));

-- closet_items visible when part of a public/friends outfit (read-only projection)
DROP POLICY IF EXISTS "closet items via public outfit" ON public.closet_items;
CREATE POLICY "closet items via public outfit" ON public.closet_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.outfit_items oi
    JOIN public.saved_outfits o ON o.id = oi.outfit_id
    WHERE oi.closet_item_id = closet_items.id
      AND (o.visibility = 'public'
           OR (o.visibility = 'friends' AND public.is_following(auth.uid(), o.user_id)))
  ));

-- ============================================================
-- LIKES / SAVES / COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outfit_likes (
  outfit_id uuid NOT NULL REFERENCES public.saved_outfits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outfit_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.outfit_likes TO authenticated;
GRANT SELECT ON public.outfit_likes TO anon;
GRANT ALL ON public.outfit_likes TO service_role;
ALTER TABLE public.outfit_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes readable" ON public.outfit_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "like own" ON public.outfit_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS(SELECT 1 FROM public.saved_outfits o WHERE o.id=outfit_id AND o.visibility='public'));
CREATE POLICY "unlike own" ON public.outfit_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS outfit_likes_outfit_idx ON public.outfit_likes (outfit_id);
CREATE INDEX IF NOT EXISTS outfit_likes_recent_idx ON public.outfit_likes (created_at DESC);

CREATE TABLE IF NOT EXISTS public.outfit_saves (
  outfit_id uuid NOT NULL REFERENCES public.saved_outfits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outfit_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.outfit_saves TO authenticated;
GRANT ALL ON public.outfit_saves TO service_role;
ALTER TABLE public.outfit_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saves own read" ON public.outfit_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "save own" ON public.outfit_saves FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS(SELECT 1 FROM public.saved_outfits o WHERE o.id=outfit_id AND o.visibility='public'));
CREATE POLICY "unsave own" ON public.outfit_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.outfit_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id uuid NOT NULL REFERENCES public.saved_outfits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.outfit_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.outfit_comments TO authenticated;
GRANT SELECT ON public.outfit_comments TO anon;
GRANT ALL ON public.outfit_comments TO service_role;
ALTER TABLE public.outfit_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments readable on public" ON public.outfit_comments FOR SELECT TO anon, authenticated
  USING (EXISTS(SELECT 1 FROM public.saved_outfits o WHERE o.id=outfit_id AND o.visibility='public'));
CREATE POLICY "comment own" ON public.outfit_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS(SELECT 1 FROM public.saved_outfits o WHERE o.id=outfit_id AND o.visibility='public'));
CREATE POLICY "delete own comment" ON public.outfit_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS outfit_comments_outfit_idx ON public.outfit_comments (outfit_id, created_at);

-- ============================================================
-- Trending leaderboard view (public outfits, decayed likes)
-- ============================================================
CREATE OR REPLACE VIEW public.outfit_leaderboard
WITH (security_invoker=on) AS
  SELECT
    o.id,
    o.user_id,
    o.name,
    o.cover_image_url,
    o.occasion,
    o.vibe,
    o.share_slug,
    o.created_at,
    COALESCE((SELECT count(*) FROM public.outfit_likes l WHERE l.outfit_id=o.id), 0) AS like_count,
    COALESCE((SELECT count(*) FROM public.outfit_comments c WHERE c.outfit_id=o.id), 0) AS comment_count,
    COALESCE((
      SELECT sum(exp(-extract(epoch from (now() - l.created_at))/259200.0))
      FROM public.outfit_likes l WHERE l.outfit_id=o.id
    ), 0)::float8 AS trending_score
  FROM public.saved_outfits o
  WHERE o.visibility = 'public';

GRANT SELECT ON public.outfit_leaderboard TO anon, authenticated;
