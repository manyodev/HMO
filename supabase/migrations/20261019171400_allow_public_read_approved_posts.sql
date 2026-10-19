CREATE POLICY "Public can read approved posts"
ON public.posts
FOR SELECT
TO anon, authenticated
USING (is_approved IS TRUE);
