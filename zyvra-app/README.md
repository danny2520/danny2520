# ZYVRA — Phase 5 safety, identity and media lifecycle

**Your people. Your pulse.** ZYVRA is a protected early-access Next.js + PostgreSQL social platform with personal feeds, photos/video Clips, text/photo stories, private direct-message conversations, following, bookmarks and a mobile-first interface.

## What Phase 5 adds

- Verified email registration. Signup requires an email address, a password and a unique handle. SHA-256 hashed, cryptographically random verification tokens expire in 30 minutes and are single use. A verified address is required for posting, uploading, following, blocking, reporting, messaging and reading other social content.
- Confirmation and resending email links. Login can create a limited session before verification; the UI provides a verification gate. **Real email sending is disabled until the Resend service is configured.** A missing email provider must NOT result in auto-verification or publicly accessible registration.
- Reports: members can report **posts and accounts** for spam, harassment, hate, nudity, violence or other reasons, with optional details and hourly report limits. Story and DM reporting remain future work.
- Moderator review at /moderation. Only the verified email addresses explicitly set in ZYVRA_MODERATOR_EMAILS may view reports and dismiss, hide posts or suspend reported accounts. Hide-post removes any attached media metadata and queues Blob deletion; suspension revokes sessions. Each action is audited. No default or hard-coded moderator account exists.
- Blocking: block/unblock in Explore and Account Settings. Blocking is mutual for discovery, posts, stories and existing conversations, and cancels mutual follows.
- Account Settings at /settings. Members can see account-verification status, unblock people and permanently delete their account by confirming DELETE and reentering their password. Suspended users may sign in to a limited settings-only session and delete their account; they cannot use social APIs.
- Account deletion cascades to ZYVRA account/post/message/media metadata. Direct-message conversations shared with the deleted account are also removed for the other participant. Deleted media enters a durable database-backed Blob cleanup outbox; it may remain accessible until removal succeeds. Safety reports and moderator records can remain in redacted/pseudonymized form for audit.
- Media cleanup: a trigger queues deletions whenever a media record is deleted, including account cascades; best-effort immediate processing plus retries; expiring stories, stale unattached metadata and orphaned Blob objects are progressively cleaned. Cleanup runs manually in the moderator dashboard or from the authenticated maintenance endpoint. A daily Vercel Cron at 03:00 UTC is configured for the production environment **once Phase 5 is promoted to production**.
- Database cleanup also removes old verification tokens, rate-limit attempts, upload grants and completed deletion records.

## Current deployment status

- Isolated GitHub branch: feat/zyvra-social-foundation under public danny2520/danny2520 (folder zyvra-app).
- Vercel project: zyvra-social, deployment protected by Vercel Authentication. Preview URL is pinned by ZYVRA_SITE_URL.
- Neon development database: zyvra-development, database zyvra_dev, isolated from other applications.
- Vercel Blob: zyvra-early-access-media, **public**. Use only non-sensitive media.
- Applied additive migrations 001–005.
- Secrets already configured in Vercel: preview DATABASE_URL, preview AUTH_SECRET, Blob token and CRON_SECRET (preview/production).
- Site URL is set for the protected preview. **Email provider credentials, verified sender domain and an explicit moderator email allowlist are not configured.** Real email delivery and moderator activation require these inputs before testing with actual people.
- CI uses a disposable PostgreSQL 17 service plus a local mock email delivery server. Tests do not create accounts or test uploads in Neon or use a real Resend key. Browser-to-Blob binary upload and actual email delivery still need manual testing.

## Activation: Resend email (required for real signup)

1. Choose a ZYVRA sending domain you control. Create/verify it with your email provider; configure the required DNS records.
2. In Vercel -> ZYVRA -> Settings -> Environment Variables, add **encrypted** RESEND_API_KEY to the preview environment, and ZYVRA_FROM_EMAIL such as "ZYVRA <verify@your-verified-domain.example>".
3. ZYVRA_SITE_URL is already configured for the feature-branch preview. If the public domain changes, update this to that site's actual HTTPS origin; don't use untrusted request Host headers for verification links.
4. In Vercel preview environment variables, set ZYVRA_MODERATOR_EMAILS to your chosen moderator's exact email address. That account must register and verify its email first. Do not set a role by username alone.
5. Redeploy the feature branch to pick up the new environment values. Test two accounts and actual email delivery using separate authorized browser sessions. Never publish secrets in chat or GitHub.
6. Only then plan a public launch, with moderation staffing, appeals, password recovery, blocking, emergency reporting, a privacy policy and monitoring. No real payments or other-company databases should be connected.

## Local setup (Ubuntu + VS Code)

1. Use a **dedicated development database**, never MORGAN, DANTIQ or any business production database.
2. From zyvra-app: npm install; cp .env.example .env.local; set DATABASE_URL and an AUTH_SECRET generated with openssl rand -hex 48.
3. Apply the following migrations **in order** to a NEW local DB using psql:
   - db/001_initial.sql
   - db/002_social_graph_and_stories.sql
   - db/003_media.sql
   - db/004_trust_safety_cleanup.sql
   - db/005_media_orphan_scan.sql
   Example: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial.sql
   Next.js loads .env.local automatically, but psql does not. Do not reapply migrations to the already migrated ZYVRA Neon database.
4. Run npm run typecheck && npm test && npm run build && npm run dev.
5. For integration tests, use only a disposable local database named zyvra_ci on 127.0.0.1. CI will start a local HTTP mock email service; it never sends real email.
6. For media upload tests, use only the dedicated ZYVRA Blob token, not another company's Blob store.

## Limits and security notes

- Email verification is not a substitute for account recovery, anti-bot challenges, abuse detection or a user trust/reputation system.
- Direct messages are session-authorized, **not end-to-end encrypted**. The app does not yet support report-in-message, appeals or advanced moderation evidence retention.
- Blob files are public; expired photo stories leave the feed at 24 hours, but physical deletion is eventual. The maintenance scanner removes untracked Blob files older than 48 hours, rotating through 100 objects per run; daily cron is production-only.
- Posting limits: photo uploads JPEG/PNG/WebP <= 5 MB, video MP4/WebM <= 25 MB, 12 upload grants per day (at most 3 video grants). Binary content inspection, video transcoding, content scanning, child-safety workflows, and copyright handling are still required before public launch.
- Public profiles, posts and report metadata are retained only as appropriate under the implemented workflows. Account deletion removes personal content but audit and safety data may persist; publish clear retention policies before launch.
- All account-changing APIs enforce server authorization. Account deletion additionally requires the current password. Moderator email addresses are never inferred from a username. CRON_SECRET authorizes scheduled maintenance without opening the endpoint publicly.
- Do not claim live signup, public moderation or storage deletion verified until actual email, browser-upload and cleanup tests have passed.

## GitHub repository migration

The connected GitHub app has write access to repositories but cannot **create a new repository**. The isolated ZYVRA code is still in your **public** danny2520/danny2520 repository. To create its dedicated repository:
1. In GitHub create an empty repository named **zyvra-social** owned by danny2520; set visibility to **Private**. Do not initialize with README or other files.
2. Reopen ChatGPT and request the migration. Copy **only the zyvra-app directory** as the new repo root, retaining the app history where practical; keep secrets in Vercel, never in Git.
3. Update Vercel's Git connection to point to the private repo and verify that preview deployments are still protected.
4. Delete the old public ZYVRA feature branch once the migration and deployment are verified. Moving into a private repo does not erase earlier public source history.

Keep MORGAN and the existing profile main branch completely untouched.
