
-- 1. is_following EXECUTE grants (tracked)
REVOKE ALL ON FUNCTION public.is_following(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_following(uuid, uuid) TO authenticated, service_role;

-- 2. New columns
ALTER TABLE public.closet_items ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.saved_outfits ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.saved_outfits ADD COLUMN IF NOT EXISTS planned_for date;
ALTER TABLE public.saved_outfits ADD COLUMN IF NOT EXISTS is_shopping_idea boolean NOT NULL DEFAULT false;
ALTER TABLE public.saved_outfits ADD COLUMN IF NOT EXISTS shop_catalog_id uuid REFERENCES public.shop_catalog(id) ON DELETE SET NULL;

-- 3. item_wears table (item-only wear log)
CREATE TABLE IF NOT EXISTS public.item_wears (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  closet_item_id uuid NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  worn_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, closet_item_id, worn_on)
);
CREATE INDEX IF NOT EXISTS item_wears_user_idx ON public.item_wears(user_id);
CREATE INDEX IF NOT EXISTS item_wears_item_idx ON public.item_wears(closet_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_wears TO authenticated;
GRANT ALL ON public.item_wears TO service_role;

ALTER TABLE public.item_wears ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own item_wears all" ON public.item_wears FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. record_item_wear: idempotent + counter update, returns wear id
CREATE OR REPLACE FUNCTION public.record_item_wear(_item_id uuid, _worn_on date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_date date := COALESCE(_worn_on, (now() AT TIME ZONE 'utc')::date);
  v_wear_id uuid;
  v_inserted boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT user_id INTO v_owner FROM public.closet_items WHERE id = _item_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'not your item'; END IF;

  INSERT INTO public.item_wears (user_id, closet_item_id, worn_on)
  VALUES (v_user, _item_id, v_date)
  ON CONFLICT (user_id, closet_item_id, worn_on) DO NOTHING
  RETURNING id INTO v_wear_id;

  IF v_wear_id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT id INTO v_wear_id FROM public.item_wears
      WHERE user_id = v_user AND closet_item_id = _item_id AND worn_on = v_date;
  END IF;

  IF v_inserted THEN
    UPDATE public.closet_items
      SET times_worn = times_worn + 1,
          last_worn_at = GREATEST(COALESCE(last_worn_at, 'epoch'::timestamptz), now())
      WHERE id = _item_id;
  END IF;

  RETURN v_wear_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.record_item_wear(uuid, date) TO authenticated;

-- 5. remove_item_wear
CREATE OR REPLACE FUNCTION public.remove_item_wear(_wear_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_item uuid;
  v_new_last timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT user_id, closet_item_id INTO v_owner, v_item FROM public.item_wears WHERE id = _wear_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'not your wear'; END IF;

  DELETE FROM public.item_wears WHERE id = _wear_id;

  SELECT MAX(created_at) INTO v_new_last FROM public.item_wears WHERE closet_item_id = v_item;

  UPDATE public.closet_items
    SET times_worn = GREATEST(0, times_worn - 1),
        last_worn_at = v_new_last
    WHERE id = v_item;
END; $$;

GRANT EXECUTE ON FUNCTION public.remove_item_wear(uuid) TO authenticated;

-- 6. remove_outfit_wear: decrements each piece; recomputes last_worn_at from remaining outfit + item wears
CREATE OR REPLACE FUNCTION public.remove_outfit_wear(_wear_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_outfit uuid;
  v_new_worn timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT user_id, outfit_id INTO v_owner, v_outfit FROM public.wear_history WHERE id = _wear_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'not your wear'; END IF;

  DELETE FROM public.wear_history WHERE id = _wear_id;

  IF v_outfit IS NOT NULL THEN
    -- decrement each item in the outfit
    UPDATE public.closet_items c
      SET times_worn = GREATEST(0, c.times_worn - 1)
      FROM public.outfit_items oi
      WHERE oi.outfit_id = v_outfit AND oi.closet_item_id = c.id AND c.user_id = v_user;

    -- refresh each item's last_worn_at from remaining wears
    UPDATE public.closet_items c
      SET last_worn_at = sub.mx
      FROM (
        SELECT oi.closet_item_id AS iid,
               GREATEST(
                 (SELECT MAX(wh.created_at) FROM public.wear_history wh
                    JOIN public.outfit_items oi2 ON oi2.outfit_id = wh.outfit_id
                    WHERE oi2.closet_item_id = oi.closet_item_id),
                 (SELECT MAX(iw.created_at) FROM public.item_wears iw
                    WHERE iw.closet_item_id = oi.closet_item_id)
               ) AS mx
          FROM public.outfit_items oi
          WHERE oi.outfit_id = v_outfit
      ) sub
      WHERE c.id = sub.iid AND c.user_id = v_user;

    -- refresh saved_outfits.worn_at
    SELECT MAX(created_at) INTO v_new_worn FROM public.wear_history WHERE outfit_id = v_outfit;
    UPDATE public.saved_outfits SET worn_at = v_new_worn WHERE id = v_outfit AND user_id = v_user;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.remove_outfit_wear(uuid) TO authenticated;
