-- ZYVRA phase 3: additive social graph, bookmarks and 24-hour text stories.
-- Apply once on the dedicated zyvra_dev database. No destructive statements.
BEGIN;

CREATE TABLE IF NOT EXISTS zyvra_follows (
  follower_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT zyvra_no_self_follow CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS zyvra_follows_following_idx
  ON zyvra_follows (following_id, created_at DESC);

CREATE TABLE IF NOT EXISTS zyvra_bookmarks (
  user_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES zyvra_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS zyvra_bookmarks_post_idx ON zyvra_bookmarks (post_id);

CREATE TABLE IF NOT EXISTS zyvra_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  body varchar(280) NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT zyvra_story_expiration CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS zyvra_stories_active_idx
  ON zyvra_stories (expires_at DESC, created_at DESC);

COMMIT;
