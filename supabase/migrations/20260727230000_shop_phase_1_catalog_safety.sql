-- Phase 1 Shop safety: demo rows must never depend on random remote imagery
-- or expose unverified purchase metadata.
UPDATE public.shop_catalog
SET image_url = CASE
  WHEN lower(category) = 'hoodie' THEN '/catalog/hoodie-black.jpg'
  WHEN lower(category) IN ('tee', 'top', 'shirt', 'polo') THEN '/catalog/tee-heavyweight-black.jpg'
  WHEN lower(category) = 'cargos' THEN '/catalog/cargos-olive.jpg'
  WHEN lower(category) = 'joggers' THEN '/catalog/joggers-black.jpg'
  WHEN lower(category) IN ('bottom', 'trousers', 'pants', 'denim', 'shorts')
    THEN '/catalog/trousers-charcoal.jpg'
  WHEN lower(category) IN ('outerwear', 'bomber', 'chore', 'jacket', 'coat')
    THEN '/catalog/bomber-black.jpg'
  WHEN lower(category) = 'jordan' THEN '/catalog/sneaker-jordan-black.jpg'
  WHEN lower(category) = 'new_balance' THEN '/catalog/sneaker-nb-grey.jpg'
  WHEN lower(category) = 'loafer' THEN '/catalog/loafer-brown.jpg'
  WHEN lower(category) IN ('shoes', 'sneaker', 'vomero', 'runner', 'boot')
    THEN '/catalog/sneaker-runner-black.jpg'
  WHEN lower(category) IN ('bag', 'bags', 'tote', 'crossbody') THEN '/catalog/bag-sling-black.jpg'
  WHEN lower(category) = 'beanie' THEN '/catalog/beanie-black.jpg'
  WHEN lower(category) IN ('fragrance', 'scent', 'perfume', 'cologne', 'edt', 'decant')
    THEN '/catalog/fragrance-fresh.jpg'
  WHEN lower(category) IN ('edp', 'parfum') THEN '/catalog/fragrance-amber.jpg'
  ELSE NULL
END
WHERE is_demo IS TRUE
  AND (
    image_url IS NULL
    OR btrim(image_url) = ''
    OR image_url ILIKE '%loremflickr.com%'
    OR (
      image_url ~* '^https?://'
      AND image_url NOT ILIKE '%supabase.co/storage/v1/object/%'
    )
  );

UPDATE public.shop_catalog
SET retailer = NULL,
    buy_url = NULL,
    availability = 'sample_only',
    last_checked_at = NULL
WHERE is_demo IS TRUE;
