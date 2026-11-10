-- ZYVRA 0.2: execute once, only against a new dedicated development database.
-- No destructive operations. Never execute against MORGAN, DANTIQ or Velqentis databases.

BEGIN;

CREATE TABLE IF NOT EXISTS zyvra_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle varchar(24) NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name varchar(80) NOT NULL,
  bio varchar(160) NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zyvra_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_sessions_user_idx ON zyvra_sessions (user_id);

CREATE TABLE IF NOT EXISTS zyvra_auth_attempts (
  id bigserial PRIMARY KEY,
  ip_hash char(64) NOT NULL,
  action varchar(24) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_auth_attempts_limit_idx
  ON zyvra_auth_attempts (ip_hash, action, created_at DESC);

CREATE TABLE IF NOT EXISTS zyvra_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  body varchar(500) NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_posts_recent_idx ON zyvra_posts (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS zyvra_likes (
  user_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES zyvra_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS zyvra_likes_post_idx ON zyvra_likes(post_id);

CREATE TABLE IF NOT EXISTS zyvra_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES zyvra_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  body varchar(300) NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_comments_post_idx ON zyvra_comments(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS zyvra_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_key varchar(73) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zyvra_conversation_members (
  conversation_id uuid NOT NULL REFERENCES zyvra_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS zyvra_conversation_members_user_idx
  ON zyvra_conversation_members(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS zyvra_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES zyvra_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  body varchar(2000) NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zyvra_messages_sender_is_member
    FOREIGN KEY (conversation_id, sender_id)
    REFERENCES zyvra_conversation_members(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS zyvra_messages_thread_idx
  ON zyvra_messages(conversation_id, created_at DESC, id DESC);

COMMIT;
