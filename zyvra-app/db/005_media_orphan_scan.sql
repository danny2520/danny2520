-- Additive cursor checkpoint for rotating scans of untracked Blob uploads.
BEGIN;
CREATE TABLE IF NOT EXISTS zyvra_media_scan_state (
 singleton boolean PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 cursor text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO zyvra_media_scan_state(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
COMMIT;
