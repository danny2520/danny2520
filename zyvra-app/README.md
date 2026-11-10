# ZYVRA · Phase 2 live social foundation

**Your people. Your pulse.** ZYVRA is an original social platform concept with a functional PostgreSQL-backed early-access application.

## Current capabilities
- Create accounts with bcrypt-hashed passwords; sign in and sign out using opaque, hashed server-side session tokens.
- Compose text posts and see a shared feed, like and reply.
- Search for members and start private 1-to-1 chats (only chat members can retrieve or send messages).
- Responsive dark mobile/desktop interface, plus the original standalone visual demo under /preview/index.html.
- PostgreSQL persisted auth attempt throttling and secure httpOnly session cookies. Data is not stored in localStorage in the live application.

**What is not live yet:** photo/video upload, Snap-style stories, clips, push notifications, following, realtime WebSockets, moderation/reporting, password reset/email verification, production observability and automated content safety. Messaging currently refreshes every 8 seconds while the chat is visible, not while hidden.

## Local setup (Ubuntu + VS Code)
1. Create a **dedicated development database**. Do NOT reuse any existing company's database.
2. In this directory, run:
   - npm install
   - cp .env.example .env.local
   - Fill in DATABASE_URL and a randomly generated AUTH_SECRET (at least 32 characters) in .env.local
3. Apply the **non-destructive, initial schema** once to your dedicated dev database:
   - First load DATABASE_URL into your terminal from .env.local (the Next.js dev server loads .env.local automatically, but psql does not):
   - export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local | sed 's/^"//;s/"$//')"
   - psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial.sql
   - unset DATABASE_URL
   - If psql isn't present: sudo apt install postgresql-client
4. Run:
   - npm run typecheck
   - npm test
   - npm run build
   - npm run dev
5. Open http://localhost:3000. Sign up two test users in two separate browsers and send messages to test two-way chat.

**Neon**: use a dedicated dev branch/project with the pooler connection string for runtime and a direct connection for one-time schema setup. In Vercel, configure DATABASE_URL and AUTH_SECRET in project environment variables; never commit .env.local. Do not run migrations from the build command.

## Architecture
- Next.js App Router, React, PostgreSQL/pg, bcryptjs, Node crypto.
- Route handlers under src/app/api. Sensitive endpoints check the authenticated session, request origin and JSON validation.
- Users, posts, likes, comments, conversations, conversation memberships, messages and sessions use parameterized SQL queries.
- The database maintains a membership foreign key for message senders and user-specific authorization on message reads.
- A simple API-first setup keeps server logic separate from UI. Account data is never trusted from browser-supplied user IDs.
- Session tokens never appear in API JSON payloads.

## Important constraints
This is **an early-access development foundation**. It is not a production-ready social network. Before opening public registration, implement email verification, password recovery, abuse prevention, privacy controls, moderation, account deletion, media safety, monitoring, privacy policy and adequate load testing. The initial database schema has not been applied by these code commits.

The original UI demo still runs locally in the browser without real accounts. It is intentionally labeled as a visual preview.

## Repository note
This folder is staged on the isolated GitHub branch feat/zyvra-social-foundation, inside danny2520/danny2520, because the connected GitHub tools could not create the intended separate private repository. Move this directory into a new dedicated private repo before production hosting. Keep the original profile main branch unchanged.
