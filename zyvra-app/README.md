# ZYVRA · Phase 4 early-access social platform

**Your people. Your pulse.** Original Next.js + PostgreSQL social application with a responsive interface, user accounts, posts, direct messages, following, bookmarks, stories, photo posts and a vertical Clips experience.

## Working features
- User accounts, bcrypt password hashes and httpOnly database-backed sessions.
- Shared text/photo/video feed with likes, comments and private saved posts.
- User search, following and personalized Following feed.
- Direct messages restricted to conversation members; visible conversations refresh every 8 seconds, not in hidden tabs.
- 24-hour text and photo stories. **Stories expire from the feed after 24 hours; the public Blob file itself is not automatically deleted yet. Do not post sensitive story photos.**
- Clips feed for MP4/WebM videos. The visible video can play muted and pauses when offscreen or when the browser tab is hidden.
- Public Vercel Blob media uploads via direct browser-to-Blob transfer; Neon stores only metadata. Private login checks, owner-only attachments, database ownership constraints and a 12/day upload-token quota (3 video tokens per 24 hours).
- JPEG, PNG and WebP images up to **5 MB**; MP4 and WebM videos up to **25 MB**.
- A standalone visual demo remains at /preview/index.html, separate from the real database-backed app.

## Deployment status
- Vercel project: zyvra-social, under team dan-1650.
- Protected feature-branch previews; Vercel Authentication is enabled.
- Isolated Neon database: zyvra-development / zyvra_dev. Automatic suspension on idle.
- Vercel Blob store: zyvra-early-access-media (**public access**).
- The CI integration suite runs against a disposable local PostgreSQL instance, **never the Neon database**.
- CI covers accounts, post creation, likes, replies, two-way messages and authorization, follows, bookmarks, expiring stories, media attachment ownership, feed media metadata and Clips queries.
- **A real browser-to-Blob binary upload is not covered by CI and must be manually tested on the protected preview.** Vercel Authentication can block Blob's optional callback; the app uses a separate authenticated media-finalization endpoint and does not depend on the callback to create post records.

## Ubuntu + VS Code local setup
1. Clone an isolated copy; do not reuse an existing project or company database.
2. From the zyvra-app directory, run npm install, then copy .env.example to .env.local.
3. Fill in DATABASE_URL and AUTH_SECRET in .env.local. Generate the secret with openssl rand -hex 48.
4. For uploads locally, obtain the ZYVRA Blob token via Vercel dashboard; never commit or share it.
5. Run these migrations in order against **only** your dedicated development database, with DATABASE_URL loaded in the terminal:
   - psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial.sql
   - psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/002_social_graph_and_stories.sql
   - psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/003_media.sql
   - Existing ZYVRA Neon development has all three migrations. **Do not apply them there again.**
6. Run npm run typecheck, npm test, npm run build, and npm run dev.
7. Open localhost port 3000 and use separate browser sessions to test messaging.

## Media security and limitations
- Uploads require an authenticated account. The server checks each user's path prefix, content type, maximum file size and daily token quota. During finalization the server independently verifies the Blob object instead of trusting a URL supplied by the browser.
- Posts/stories can attach only media owned by the author. A PostgreSQL composite foreign key also enforces ownership.
- Media files and URLs are **publicly accessible**. Do not upload confidential photos, documents or secrets.
- Quotas limit token issuance; abandoned uploads can still consume storage. Media cleanup, retention/deletion, moderation, abuse reporting, copyright handling, video transcoding, real MIME inspection and safer access policies must be added before public release.
- Only compatible MP4/WebM files will play as Clips; no video transcoding or generated thumbnails yet.
- No email verification, password recovery, admin moderation, blocking, private-account settings, account deletion or push notifications yet.
- Direct messages are access controlled but **not end-to-end encrypted**.
- Do not open public registration until moderation, safety and data-deletion workflows are ready.

## Repository
Development code is temporarily in public danny2520/danny2520 on feat/zyvra-social-foundation, in folder zyvra-app. GitHub main is unchanged. Move this app to its own private zyvra-social repository before public hosting.

## Tests
- npm test: static security/contract checks.
- npm run test:integration: requires a disposable PostgreSQL database named zyvra_ci on 127.0.0.1, **not Neon**.
- GitHub Actions uses a disposable PostgreSQL 17 service, applies the three migrations, builds the application and checks account/media/DM authorization without requiring Blob credentials.
