UPDATE public.posts AS posts
SET username = profiles.display_name,
    submitted_by = profiles.id
FROM public.profiles AS profiles
WHERE posts.submitted_by = profiles.id
   OR (
     posts.submitted_by IS NULL
     AND lower(posts.username) = lower(profiles.username)
   );

CREATE OR REPLACE FUNCTION public.set_authenticated_post_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_display_name text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.submitted_by := auth.uid();
    SELECT display_name
      INTO STRICT profile_display_name
      FROM public.profiles
      WHERE id = auth.uid();
    NEW.username := profile_display_name;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.sync_profile_display_name_to_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.posts
  SET username = NEW.display_name,
      submitted_by = NEW.id
  WHERE submitted_by = NEW.id
     OR (
       submitted_by IS NULL
       AND lower(username) = lower(OLD.username)
     );

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_profile_display_name_to_posts
  AFTER UPDATE OF display_name ON public.profiles
  FOR EACH ROW
  WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name)
  EXECUTE FUNCTION public.sync_profile_display_name_to_posts();
