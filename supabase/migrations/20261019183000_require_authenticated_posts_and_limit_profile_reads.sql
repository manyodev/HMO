ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  insert_policy record;
BEGIN
  FOR insert_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'posts'
      AND cmd IN ('INSERT', 'ALL')
      AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.posts',
      insert_policy.policyname
    );
  END LOOP;
END;
$$;

CREATE POLICY "Authenticated users can submit posts"
  ON public.posts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = submitted_by);

REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, display_name, username, created_at)
  ON public.profiles
  TO anon, authenticated;
