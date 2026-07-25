
-- Follows: signed-in users only
DROP POLICY IF EXISTS "follows readable" ON public.follows;
CREATE POLICY "follows readable to authenticated"
  ON public.follows FOR SELECT TO authenticated
  USING (true);

-- Outfit likes: only visible for likes on public outfits, or your own likes
DROP POLICY IF EXISTS "likes readable" ON public.outfit_likes;
CREATE POLICY "likes readable on public outfits"
  ON public.outfit_likes FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saved_outfits o
      WHERE o.id = outfit_likes.outfit_id
        AND o.visibility = 'public'::outfit_visibility
    )
    OR auth.uid() = user_id
  );

-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_following(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_following(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_outfit_wear(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_outfit_wear(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_item_wear(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_item_wear(uuid, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_item_wear(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_item_wear(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_outfit_wear(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_outfit_wear(uuid) TO authenticated;
