
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Storage: private bucket, owner-only read/write via user-id folder prefix
CREATE POLICY "closet own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'closet' AND (storage.foldername(name))[1] = auth.uid()::text);
