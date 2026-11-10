-- ZYVRA Phase 4 - image/video attachment metadata only.
-- Files live in public Vercel Blob; never store bytes in Neon.
BEGIN;
CREATE TABLE IF NOT EXISTS zyvra_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  url text NOT NULL UNIQUE,
  pathname text NOT NULL UNIQUE,
  kind varchar(8) NOT NULL CHECK (kind IN ('image','video')),
  content_type varchar(64) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_media_owner_idx ON zyvra_media(owner_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS zyvra_media_owner_fk_idx ON zyvra_media(id,owner_id);

CREATE TABLE IF NOT EXISTS zyvra_media_grants (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES zyvra_users(id) ON DELETE CASCADE,
  kind varchar(8) NOT NULL CHECK (kind IN ('image','video')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zyvra_media_grants_limit_idx ON zyvra_media_grants(owner_id,created_at DESC);

ALTER TABLE zyvra_posts ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES zyvra_media(id);
ALTER TABLE zyvra_stories ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES zyvra_media(id);
CREATE UNIQUE INDEX IF NOT EXISTS zyvra_post_media_unique_idx ON zyvra_posts(media_id) WHERE media_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS zyvra_story_media_unique_idx ON zyvra_stories(media_id) WHERE media_id IS NOT NULL;
-- Database-enforced ownership: media owner must equal content author.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='zyvra_post_media_owner_fk') THEN
   ALTER TABLE zyvra_posts ADD CONSTRAINT zyvra_post_media_owner_fk
     FOREIGN KEY (media_id,author_id) REFERENCES zyvra_media(id,owner_id);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='zyvra_story_media_owner_fk') THEN
   ALTER TABLE zyvra_stories ADD CONSTRAINT zyvra_story_media_owner_fk
     FOREIGN KEY (media_id,author_id) REFERENCES zyvra_media(id,owner_id);
 END IF;
END $$;
COMMIT;
