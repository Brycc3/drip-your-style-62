
-- ============ ENUMS ============
CREATE TYPE public.item_kind AS ENUM ('clothing','shoes','accessory','fragrance');
CREATE TYPE public.season AS ENUM ('spring','summer','fall','winter','all');
CREATE TYPE public.formality AS ENUM ('loungewear','casual','smart_casual','business','formal');
CREATE TYPE public.item_condition AS ENUM ('new','vintage','thrift','resale');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============ PREFERENCES ============
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  style_vibes TEXT[] NOT NULL DEFAULT '{}',
  favorite_colors TEXT[] NOT NULL DEFAULT '{}',
  disliked_colors TEXT[] NOT NULL DEFAULT '{}',
  sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_range TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs all" ON public.user_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ CLOSET ============
CREATE TABLE public.closet_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.item_kind NOT NULL,
  category TEXT NOT NULL,           -- e.g. tee, hoodie, cargos, jordan, loafer
  subcategory TEXT,                 -- e.g. heavyweight, graphic
  name TEXT NOT NULL,
  brand TEXT,
  color TEXT,
  secondary_colors TEXT[] NOT NULL DEFAULT '{}',
  material TEXT,
  fit TEXT,                         -- slim, relaxed, oversized, tapered, wide
  season public.season NOT NULL DEFAULT 'all',
  formality public.formality NOT NULL DEFAULT 'casual',
  size TEXT,
  price NUMERIC(10,2),
  notes TEXT,
  image_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  times_worn INT NOT NULL DEFAULT 0,
  last_worn_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX closet_items_user_idx ON public.closet_items(user_id);
CREATE INDEX closet_items_user_kind_idx ON public.closet_items(user_id, kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closet_items TO authenticated;
GRANT ALL ON public.closet_items TO service_role;
ALTER TABLE public.closet_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own closet all" ON public.closet_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ SAVED OUTFITS ============
CREATE TABLE public.saved_outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  occasion TEXT,
  vibe TEXT,
  weather TEXT,
  temperature_f INT,
  dress_code public.formality,
  explanation TEXT,
  score NUMERIC(6,2),
  fragrance_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_outfits_user_idx ON public.saved_outfits(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_outfits TO authenticated;
GRANT ALL ON public.saved_outfits TO service_role;
ALTER TABLE public.saved_outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own outfits all" ON public.saved_outfits FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.outfit_items (
  outfit_id UUID NOT NULL REFERENCES public.saved_outfits(id) ON DELETE CASCADE,
  closet_item_id UUID NOT NULL REFERENCES public.closet_items(id) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY (outfit_id, closet_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_items TO authenticated;
GRANT ALL ON public.outfit_items TO service_role;
ALTER TABLE public.outfit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own outfit_items all" ON public.outfit_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.saved_outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.saved_outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid()));

-- ============ FEEDBACK & WEAR ============
CREATE TABLE public.outfit_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_id UUID REFERENCES public.saved_outfits(id) ON DELETE SET NULL,
  signature TEXT NOT NULL,   -- sorted item ids joined, so unsaved outfits still get feedback
  liked BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outfit_feedback_user_idx ON public.outfit_feedback(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_feedback TO authenticated;
GRANT ALL ON public.outfit_feedback TO service_role;
ALTER TABLE public.outfit_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback all" ON public.outfit_feedback FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.wear_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_id UUID REFERENCES public.saved_outfits(id) ON DELETE SET NULL,
  worn_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wear_history_user_idx ON public.wear_history(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wear_history TO authenticated;
GRANT ALL ON public.wear_history TO service_role;
ALTER TABLE public.wear_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wear all" ON public.wear_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ FRAGRANCES ============
CREATE TABLE public.fragrances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  family TEXT,                       -- woody, oriental, fresh, floral, gourmand
  top_notes TEXT[] NOT NULL DEFAULT '{}',
  heart_notes TEXT[] NOT NULL DEFAULT '{}',
  base_notes TEXT[] NOT NULL DEFAULT '{}',
  projection TEXT,                   -- intimate, moderate, strong, beast
  longevity TEXT,                    -- <4h, 4-6h, 6-8h, 8h+
  season public.season NOT NULL DEFAULT 'all',
  occasions TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fragrances_user_idx ON public.fragrances(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fragrances TO authenticated;
GRANT ALL ON public.fragrances TO service_role;
ALTER TABLE public.fragrances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own frags all" ON public.fragrances FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ SHOP CATALOG (shared seed) ============
CREATE TABLE public.shop_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT,
  name TEXT NOT NULL,
  kind public.item_kind NOT NULL,
  category TEXT NOT NULL,
  color TEXT,
  material TEXT,
  fit TEXT,
  season public.season NOT NULL DEFAULT 'all',
  formality public.formality NOT NULL DEFAULT 'casual',
  price NUMERIC(10,2),
  condition public.item_condition NOT NULL DEFAULT 'new',
  source TEXT,
  image_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_catalog TO authenticated;
GRANT ALL ON public.shop_catalog TO service_role;
ALTER TABLE public.shop_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog read all authed" ON public.shop_catalog FOR SELECT TO authenticated USING (true);

CREATE TABLE public.shop_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES public.shop_catalog(id) ON DELETE CASCADE,
  liked BOOLEAN NOT NULL,
  saved BOOLEAN NOT NULL DEFAULT false,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, catalog_id)
);
CREATE INDEX shop_feedback_user_idx ON public.shop_feedback(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_feedback TO authenticated;
GRANT ALL ON public.shop_feedback TO service_role;
ALTER TABLE public.shop_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shop_feedback all" ON public.shop_feedback FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER touch_prefs BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER touch_closet BEFORE UPDATE ON public.closet_items FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage policies for closet bucket (public bucket, but only owner can write to own folder)
CREATE POLICY "closet read public" ON storage.objects FOR SELECT USING (bucket_id = 'closet');
CREATE POLICY "closet own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'closet' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "closet own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'closet' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "closet own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'closet' AND (storage.foldername(name))[1] = auth.uid()::text);
