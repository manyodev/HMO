CREATE POLICY "Users can update their own post content and topics"
  ON public.posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = submitted_by)
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Users can delete their own posts"
  ON public.posts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = submitted_by);

REVOKE UPDATE ON public.posts FROM authenticated;
GRANT UPDATE (content, topic) ON public.posts TO authenticated;
GRANT DELETE ON public.posts TO authenticated;
