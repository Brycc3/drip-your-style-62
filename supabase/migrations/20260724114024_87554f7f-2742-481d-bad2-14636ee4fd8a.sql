
UPDATE public.shop_catalog SET image_url = '/catalog/beanie-black.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('beanie','hat','cap');
UPDATE public.shop_catalog SET image_url = '/catalog/bag-sling-black.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('bag','wallet','belt');
UPDATE public.shop_catalog SET image_url = '/catalog/sneaker-runner-black.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('sneaker','vomero','new_balance','jordan','runner','boot','loafer','shoes');
UPDATE public.shop_catalog SET image_url = '/catalog/trousers-charcoal.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('bottom','trousers','joggers','cargos');
UPDATE public.shop_catalog SET image_url = '/catalog/tee-heavyweight-black.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('top','tee','shirt','polo','hoodie');
UPDATE public.shop_catalog SET image_url = '/catalog/bomber-black.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('outerwear','bomber','chore','jacket','coat');
UPDATE public.shop_catalog SET image_url = '/catalog/fragrance-fresh.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('fragrance','edt','decant');
UPDATE public.shop_catalog SET image_url = '/catalog/fragrance-amber.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('edp');
UPDATE public.shop_catalog SET image_url = '/catalog/bag-sling-black.jpg'
  WHERE (image_url IS NULL OR image_url = '') AND category IN ('watch','chain','ring','bracelet','sunglasses','scarf','socks','tie','jewelry');

INSERT INTO public.shop_catalog (kind, name, brand, category, color, price, current_price, condition, image_url, formality, season, retailer, buy_url, is_demo) VALUES
  ('accessory','Wide Brim Wool Hat','Stetson','hat','black',95,95,'new','/catalog/beanie-black.jpg','smart_casual','fall','DRIP Demo',NULL,true),
  ('accessory','Trucker Cap — Cream','DRIP','cap','cream',32,32,'new','/catalog/beanie-black.jpg','casual','all','DRIP Demo',NULL,true),
  ('accessory','Ribbed Fisherman Beanie','Carhartt','beanie','olive',28,28,'new','/catalog/beanie-black.jpg','casual','winter','DRIP Demo',NULL,true),
  ('accessory','Woven Leather Belt','Anderson''s','belt','brown',140,140,'new','/catalog/bag-sling-black.jpg','smart_casual','all','DRIP Demo',NULL,true),
  ('accessory','Canvas Tote — Bone','DRIP','bag','cream',55,55,'new','/catalog/bag-sling-black.jpg','casual','all','DRIP Demo',NULL,true),
  ('accessory','Crossbody Nylon Pouch','Prada','bag','black',890,890,'new','/catalog/bag-sling-black.jpg','smart_casual','all','DRIP Demo',NULL,true),
  ('accessory','G-Shock GA-2100 — Black','Casio','watch','black',110,110,'new','/catalog/bag-sling-black.jpg','casual','all','DRIP Demo',NULL,true),
  ('accessory','Field Watch — Silver','Timex','watch','silver',179,179,'new','/catalog/bag-sling-black.jpg','smart_casual','all','DRIP Demo',NULL,true),
  ('accessory','Cuban Chain — Silver','Miansai','chain','silver',220,220,'new','/catalog/bag-sling-black.jpg','casual','all','DRIP Demo',NULL,true),
  ('accessory','Signet Ring — Gold','Mejuri','ring','gold',195,195,'new','/catalog/bag-sling-black.jpg','smart_casual','all','DRIP Demo',NULL,true),
  ('accessory','Aviator Sunglasses','Ray-Ban','sunglasses','black',175,175,'new','/catalog/bag-sling-black.jpg','casual','summer','DRIP Demo',NULL,true),
  ('accessory','Wayfarer Sunglasses — Tortoise','Ray-Ban','sunglasses','brown',175,175,'new','/catalog/bag-sling-black.jpg','casual','summer','DRIP Demo',NULL,true),
  ('accessory','Ribbed Crew Socks 3-Pack','Uniqlo','socks','white',15,15,'new','/catalog/bag-sling-black.jpg','casual','all','DRIP Demo',NULL,true),
  ('accessory','Wool Blanket Scarf','Acne Studios','scarf','grey',260,260,'new','/catalog/bag-sling-black.jpg','smart_casual','winter','DRIP Demo',NULL,true),
  ('accessory','Bifold Cardholder','Bellroy','wallet','black',79,79,'new','/catalog/bag-sling-black.jpg','casual','all','DRIP Demo',NULL,true),
  ('fragrance','Bergamot Neroli Cologne EDT','Le Labo','edt','yellow',210,210,'new','/catalog/fragrance-fresh.jpg','smart_casual','summer','DRIP Demo',NULL,true),
  ('fragrance','Sea Salt & Vetiver EDT','Byredo','edt','blue',195,195,'new','/catalog/fragrance-fresh.jpg','casual','summer','DRIP Demo',NULL,true),
  ('fragrance','Cedarwood Iso E EDP','Escentric','edp','brown',145,145,'new','/catalog/fragrance-amber.jpg','smart_casual','fall','DRIP Demo',NULL,true),
  ('fragrance','Oud Ambre EDP','Maison Margiela','edp','amber',180,180,'new','/catalog/fragrance-amber.jpg','business','winter','DRIP Demo',NULL,true),
  ('fragrance','Vanilla Tobacco EDP','Tom Ford','edp','brown',320,320,'new','/catalog/fragrance-amber.jpg','business','fall','DRIP Demo',NULL,true),
  ('fragrance','Marine Cypress EDT','Creed','edt','aqua',260,260,'new','/catalog/fragrance-fresh.jpg','smart_casual','summer','DRIP Demo',NULL,true),
  ('fragrance','Rose Leather EDP','Byredo','edp','rose',220,220,'new','/catalog/fragrance-amber.jpg','smart_casual','all','DRIP Demo',NULL,true),
  ('fragrance','Green Fig Cologne','Diptyque','edt','green',155,155,'new','/catalog/fragrance-fresh.jpg','casual','spring','DRIP Demo',NULL,true),
  ('fragrance','Warm Amber Decant 10ml','DRIP','decant','amber',22,22,'new','/catalog/fragrance-amber.jpg','casual','all','DRIP Demo',NULL,true);
