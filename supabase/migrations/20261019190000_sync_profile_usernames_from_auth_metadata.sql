WITH username_candidates AS (
  SELECT
    profiles.id,
    lower(trim(users.raw_user_meta_data ->> 'username')) AS username,
    row_number() OVER (
      PARTITION BY lower(trim(users.raw_user_meta_data ->> 'username'))
      ORDER BY users.created_at, users.id
    ) AS username_rank
  FROM public.profiles AS profiles
  JOIN auth.users AS users ON users.id = profiles.id
  WHERE lower(trim(users.raw_user_meta_data ->> 'username')) ~ '^[a-z0-9_]{3,24}$'
)
UPDATE public.profiles AS profiles
SET username = candidates.username
FROM username_candidates AS candidates
WHERE profiles.id = candidates.id
  AND candidates.username_rank = 1
  AND profiles.username IS DISTINCT FROM candidates.username
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS existing_profiles
    WHERE lower(existing_profiles.username) = candidates.username
      AND existing_profiles.id <> profiles.id
  );
