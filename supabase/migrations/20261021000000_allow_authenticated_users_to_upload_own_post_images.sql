CREATE POLICY "Authenticated users can upload their own post images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
