
-- Tighten public exposure of closet data
DROP POLICY IF EXISTS "closet items via public outfit" ON public.closet_items;
DROP POLICY IF EXISTS "outfit items follow parent" ON public.outfit_items;

-- Atomic wear recording: insert wear_history row + bump per-item counters
CREATE OR REPLACE FUNCTION public.record_outfit_wear(_outfit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO v_owner FROM public.saved_outfits WHERE id = _outfit_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'outfit not found'; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'not your outfit'; END IF;

  INSERT INTO public.wear_history (user_id, outfit_id, worn_on)
  VALUES (v_user, _outfit_id, (now() AT TIME ZONE 'utc')::date);

  UPDATE public.saved_outfits SET worn_at = now() WHERE id = _outfit_id;

  UPDATE public.closet_items c
    SET times_worn = c.times_worn + 1, last_worn_at = now()
    FROM public.outfit_items oi
    WHERE oi.outfit_id = _outfit_id
      AND oi.closet_item_id = c.id
      AND c.user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.record_outfit_wear(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_outfit_wear(uuid) TO authenticated;

-- Stable outfit signature helper so Mark Worn can dedupe saved outfits
CREATE OR REPLACE FUNCTION public.outfit_signature(_outfit_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT string_agg(closet_item_id::text, '|' ORDER BY closet_item_id::text)
  FROM public.outfit_items WHERE outfit_id = _outfit_id
$$;
