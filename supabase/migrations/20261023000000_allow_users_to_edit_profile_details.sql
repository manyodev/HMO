ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

GRANT SELECT (id, display_name, username, avatar_url, created_at)
  ON public.profiles
  TO anon, authenticated;

GRANT UPDATE (display_name, avatar_url)
  ON public.profiles
  TO authenticated;

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
