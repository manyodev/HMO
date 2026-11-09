ALTER TABLE public.profiles
  ADD COLUMN is_og boolean NOT NULL DEFAULT false;

UPDATE public.profiles AS profiles
SET is_og = true
FROM auth.users AS users
WHERE users.id = profiles.id
  AND users.created_at >= timestamptz '2026-01-01 00:00:00+00'
  AND users.created_at < timestamptz '2027-01-01 00:00:00+00';

GRANT SELECT (is_og)
  ON public.profiles
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, is_og)
  VALUES (
    NEW.id,
    trim(NEW.raw_user_meta_data ->> 'display_name'),
    lower(trim(NEW.raw_user_meta_data ->> 'username')),
    NEW.created_at >= timestamptz '2026-01-01 00:00:00+00'
      AND NEW.created_at < timestamptz '2027-01-01 00:00:00+00'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_authenticated_post_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_display_name text;
  profile_is_og boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.submitted_by := auth.uid();
    SELECT display_name, is_og
      INTO STRICT profile_display_name, profile_is_og
      FROM public.profiles
      WHERE id = auth.uid();
    NEW.username := profile_display_name;
    NEW.is_approved := profile_is_og;
  END IF;
  RETURN NEW;
END;
$$;
