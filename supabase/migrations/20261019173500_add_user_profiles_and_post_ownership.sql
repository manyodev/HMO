CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (lower(username));

INSERT INTO public.profiles (id, display_name, username)
SELECT
  users.id,
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
      'User'
    ),
    80
  ),
  left(
    regexp_replace(
      lower(split_part(coalesce(users.email, 'user'), '@', 1)),
      '[^a-z0-9_]',
      '',
      'g'
    ),
    11
  ) || '_' || substr(replace(users.id::text, '-', ''), 1, 12)
FROM auth.users AS users
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are publicly readable"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.profiles TO anon, authenticated;

CREATE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username)
  VALUES (
    NEW.id,
    trim(NEW.raw_user_meta_data ->> 'display_name'),
    lower(trim(NEW.raw_user_meta_data ->> 'username'))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_for_new_user();

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE POLICY "Users can read their own posts"
  ON public.posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE FUNCTION public.set_authenticated_post_author()
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

CREATE TRIGGER set_authenticated_post_author_before_insert
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_authenticated_post_author();
