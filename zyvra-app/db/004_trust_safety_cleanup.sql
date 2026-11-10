-- ZYVRA Phase 5 - additive account verification, safety and Blob cleanup outbox.
-- No DROP, TRUNCATE, user-data changes or destructive backfills.
BEGIN;
ALTER TABLE zyvra_users ADD COLUMN IF NOT EXISTS email varchar(254);
ALTER TABLE zyvra_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE zyvra_users ADD COLUMN IF NOT EXISTS account_state varchar(16) NOT NULL DEFAULT 'active' CHECK (account_state IN ('active','suspended'));
CREATE UNIQUE INDEX IF NOT EXISTS zyvra_users_email_unique ON zyvra_users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS zyvra_email_tokens(
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS zyvra_email_tokens_user_idx ON zyvra_email_tokens(user_id,created_at DESC);

ALTER TABLE zyvra_posts ADD COLUMN IF NOT EXISTS moderation_state varchar(16) NOT NULL DEFAULT 'visible' CHECK(moderation_state IN ('visible','hidden'));
CREATE TABLE IF NOT EXISTS zyvra_blocks(
 blocker_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
 blocked_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id),
 CHECK(blocker_id<>blocked_id)
);
CREATE INDEX IF NOT EXISTS zyvra_blocks_blocked_idx ON zyvra_blocks(blocked_id,blocker_id);

CREATE TABLE IF NOT EXISTS zyvra_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid REFERENCES zyvra_users(id) ON DELETE SET NULL,
 target_kind varchar(8) NOT NULL CHECK(target_kind IN ('post','user')),
 target_id uuid NOT NULL,
 reason varchar(16) NOT NULL CHECK(reason IN ('spam','harassment','hate','nudity','violence','other')),
 details varchar(500) NOT NULL DEFAULT '',
 status varchar(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 reviewed_by uuid REFERENCES zyvra_users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_reports_open_idx ON zyvra_reports(status,created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS zyvra_reports_one_open_per_target ON zyvra_reports(reporter_id,target_kind,target_id) WHERE status='open' AND reporter_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS zyvra_moderation_log(
 id bigserial PRIMARY KEY,
 moderator_id uuid REFERENCES zyvra_users(id) ON DELETE SET NULL,
 action varchar(30) NOT NULL,
 target_kind varchar(12) NOT NULL,
 target_id uuid NOT NULL,
 reason varchar(500) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zyvra_media_cleanup(
 url text PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 completed_at timestamptz,
 last_error varchar(160)
);
CREATE INDEX IF NOT EXISTS zyvra_media_cleanup_pending_idx
 ON zyvra_media_cleanup(next_attempt_at,created_at) WHERE completed_at IS NULL;

-- Trigger survives cascading account deletion: a deleted media record always queues Blob deletion.
CREATE OR REPLACE FUNCTION zyvra_queue_blob_cleanup() RETURNS trigger AS $$
BEGIN
  INSERT INTO zyvra_media_cleanup(url) VALUES (OLD.url)
  ON CONFLICT (url) DO UPDATE SET completed_at=NULL,next_attempt_at=now(),last_error=NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS zyvra_media_delete_outbox ON zyvra_media;
CREATE TRIGGER zyvra_media_delete_outbox
 AFTER DELETE ON zyvra_media FOR EACH ROW EXECUTE FUNCTION zyvra_queue_blob_cleanup();
COMMIT;
