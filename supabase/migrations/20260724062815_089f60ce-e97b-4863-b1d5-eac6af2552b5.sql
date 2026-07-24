
ALTER TABLE public.shop_catalog
  ADD COLUMN IF NOT EXISTS buy_url TEXT,
  ADD COLUMN IF NOT EXISTS retailer TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'in_stock',
  ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS current_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS custom_vibes TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Idempotent unique constraint so record_outfit_wear can be called twice safely per day.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='wear_history_unique_day') THEN
    CREATE UNIQUE INDEX wear_history_unique_day ON public.wear_history(user_id, outfit_id, worn_on);
  END IF;
END $$;

-- Update record_outfit_wear to be idempotent (ON CONFLICT DO NOTHING) so users can safely re-tap.
CREATE OR REPLACE FUNCTION public.record_outfit_wear(_outfit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_inserted boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO v_owner FROM public.saved_outfits WHERE id = _outfit_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'outfit not found'; END IF;
  IF v_owner <> v_user THEN RAISE EXCEPTION 'not your outfit'; END IF;

  INSERT INTO public.wear_history (user_id, outfit_id, worn_on)
  VALUES (v_user, _outfit_id, (now() AT TIME ZONE 'utc')::date)
  ON CONFLICT (user_id, outfit_id, worn_on) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.saved_outfits SET worn_at = now() WHERE id = _outfit_id;
    UPDATE public.closet_items c
      SET times_worn = c.times_worn + 1, last_worn_at = now()
      FROM public.outfit_items oi
      WHERE oi.outfit_id = _outfit_id
        AND oi.closet_item_id = c.id
        AND c.user_id = v_user;
  END IF;
END;
$function$;
