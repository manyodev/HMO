ALTER TABLE public.posts
  ADD COLUMN topic text NOT NULL DEFAULT 'Other',
  ADD CONSTRAINT posts_topic_check
    CHECK (
      topic IN (
        'Anime',
        'Cartoon',
        'Comics',
        'K-pop',
        'Movies & TV',
        'Video game',
        'Other'
      )
    );
