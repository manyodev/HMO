CREATE TABLE public.post_reactions AS
SELECT id AS post_id
FROM public.posts
WITH NO DATA;

ALTER TABLE public.post_reactions
  ALTER COLUMN post_id SET NOT NULL,
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ADD COLUMN reaction_type text NOT NULL
    CHECK (reaction_type IN ('like', 'dislike', 'react')),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT post_reactions_post_id_fkey
    FOREIGN KEY (post_id)
    REFERENCES public.posts (id)
    ON DELETE CASCADE,
  ADD CONSTRAINT post_reactions_post_user_unique
    UNIQUE (post_id, user_id);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post reactions are publicly readable"
  ON public.post_reactions
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = post_reactions.post_id
        AND (
          posts.is_approved IS TRUE
          OR posts.submitted_by = auth.uid()
        )
    )
  );

CREATE POLICY "Users can add their own post reactions"
  ON public.post_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own post reactions"
  ON public.post_reactions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own post reactions"
  ON public.post_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.post_reactions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.post_reactions TO authenticated;
