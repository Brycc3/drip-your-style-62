
-- 1. Remove public read on closet bucket (kept owner-only policies)
DROP POLICY IF EXISTS "closet read public" ON storage.objects;

-- 2. Tighten INSERT WITH CHECK on tables where user_id was implicit
DROP POLICY IF EXISTS "like own" ON public.outfit_likes;
CREATE POLICY "like own" ON public.outfit_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "save own" ON public.outfit_saves;
CREATE POLICY "save own" ON public.outfit_saves
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment own" ON public.outfit_comments;
CREATE POLICY "comment own" ON public.outfit_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "follow yourself out" ON public.follows;
CREATE POLICY "follow yourself out" ON public.follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- 3. Remove existing fragrance rows from closet_items (they belong in fragrances)
DELETE FROM public.closet_items WHERE kind = 'fragrance';
