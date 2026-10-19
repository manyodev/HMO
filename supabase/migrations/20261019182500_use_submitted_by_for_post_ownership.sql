ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS submitted_by uuid;

UPDATE public.posts AS posts
SET submitted_by = posts.user_id
WHERE posts.submitted_by IS NULL
  AND posts.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS profiles
    WHERE profiles.id = posts.user_id
  );

UPDATE public.posts AS posts
SET submitted_by = NULL
WHERE posts.submitted_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profiles
    WHERE profiles.id = posts.submitted_by
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_submitted_by_profiles_fkey'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_submitted_by_profiles_fkey
      FOREIGN KEY (submitted_by)
      REFERENCES public.profiles (id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Users can read their own posts" ON public.posts;

CREATE POLICY "Users can read their own posts"
  ON public.posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = submitted_by);

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
    NEW.submitted_by := auth.uid();
    SELECT username
      INTO STRICT profile_username
      FROM public.profiles
      WHERE id = auth.uid();
    NEW.username := profile_username;
  END IF;
  RETURN NEW;
END;
$$;
