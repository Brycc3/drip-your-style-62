\set ON_ERROR_STOP on

SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'reports'
      AND name LIKE 'f4000000-0000-4000-8000-000000000003/%'
  ),
  'the report screenshot must be removable through the Storage API before auth-user deletion'
);
SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'catalog-products'
      AND name LIKE 'drafts/f4000000-0000-4000-8000-000000000003/%'
      AND name NOT LIKE '%/f4200000-0000-4000-8000-000000000003.jpg'
  ),
  'the uncommitted catalog draft must be removable through the Storage API'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'catalog-products'
      AND name LIKE '%/f4200000-0000-4000-8000-000000000003.jpg'
  ),
  'the imported product image must remain while shop_catalog references it'
);

SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    UPDATE public.shop_catalog SET description = 'forbidden direct demo edit'
    WHERE id = '20000000-0000-4000-8000-000000000001'
  $sql$),
  'the demo immutability trigger must reject privileged direct updates'
);
SELECT public.phase4a_assert(
  public.phase4a_expect_failure($sql$
    DELETE FROM public.shop_catalog WHERE id = '20000000-0000-4000-8000-000000000001'
  $sql$),
  'the demo immutability trigger must reject privileged direct deletes'
);
DELETE FROM auth.users WHERE id = 'f4000000-0000-4000-8000-000000000003';

SELECT public.phase4a_assert(
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f4000000-0000-4000-8000-000000000003'),
  'auth user deletion must succeed after private object cleanup'
);
SELECT public.phase4a_assert(
  EXISTS (SELECT 1 FROM public.shop_catalog WHERE external_id = 'account-product'),
  'auth user deletion must not cascade to an imported catalog product'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'catalog-products'
      AND name LIKE '%/f4200000-0000-4000-8000-000000000003.jpg'
  ),
  'the imported product image must remain after auth user deletion'
);
SELECT public.phase4a_assert(
  (SELECT count(*) = 51 FROM public.shop_catalog WHERE source = 'phase_2_curated_demo'),
  'integration behavior must leave all 51 demos intact'
);
SELECT public.phase4a_assert(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('catalog product images admin update', 'catalog product images admin delete')
  ),
  'broad catalog image update/delete policies must be absent'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'catalog product images owner read'
      AND qual LIKE '%auth.uid()%'
      AND qual LIKE '%drafts%'
  ),
  'catalog image draft reads must be limited to an authenticated admin owner path'
);
SELECT public.phase4a_assert(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'catalog product images owner cleanup'
      AND qual LIKE '%shop_catalog%'
  ),
  'catalog image deletion must be reference-safe'
);

DROP FUNCTION public.phase4a_product(text, text, text, text);
DROP FUNCTION public.phase4a_expect_failure(text);
DROP FUNCTION public.phase4a_assert(boolean, text);
