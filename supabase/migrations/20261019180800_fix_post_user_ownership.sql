ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Users can read their own posts" ON public.posts;

CREATE POLICY "Users can read their own posts"
  ON public.posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_authenticated_post_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_username text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
    SELECT username
      INTO STRICT profile_username
      FROM public.profiles
      WHERE id = auth.uid();
    NEW.username := profile_username;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_authenticated_post_author_before_insert ON public.posts;

CREATE TRIGGER set_authenticated_post_author_before_insert
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_authenticated_post_author();
