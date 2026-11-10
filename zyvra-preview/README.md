# ZYVRA — Your people. Your pulse. ✳

**Original, responsive social network concept.** Dark/lime visual identity inspired by common social-platform interaction patterns — not a clone of any one company's interface.

## What is in this GitHub branch

- **Live interactive frontend in [index.html](./index.html)** — zero-build, self-contained browser preview. It has a social timeline, reactions, bookmarks, comments, a text/photo composer, Following feed, story slides and local story uploads, Explore, Clips, conversation screens, notifications and an editable profile.
- **Responsive experience** — desktop three-column layout and mobile bottom navigation.
- **Browser-persisted demo state** — posts, likes, follows, comments, stories, chats and profile edits survive refresh on the same device.

**IMPORTANT:** This is a **local-browser demo**. The chat UI does **not** send messages to other people, demo contact profiles are fictional, and there are no real accounts, database, real-time socket delivery, encrypted DMs, media hosting or moderation yet. It should not be represented as a launched social platform.

## Try the preview on Ubuntu

Option 1: open `index.html` with a browser. Option 2 (recommended): run a tiny local HTTP server:

```bash
git clone --branch feat/zyvra-social-foundation https://github.com/danny2520/danny2520.git zyvra-source
cd zyvra-source/zyvra-preview
python3 -m http.server 8080
```

Open **http://localhost:8080**. You can also open `index.html` with the VS Code Live Server extension.

To verify that the embedded JavaScript parses, run `node verify.mjs` in this folder (Node.js 20+).

## Full Next.js starter package

A more extensive **Next.js 16 + React 19 + TypeScript** starter was created alongside this preview. It includes a componentized social feed, Moments, Explore, Clips, Messages, notifications, saved posts, editable profile, custom CSS, a static verification script, a product roadmap and a GitHub handoff document. The archive is supplied separately in the ChatGPT conversation as `zyvra-social-starter.zip` because the current GitHub connector cannot create a new repository.

When creating the dedicated project, name it **`danny2520/zyvra-social`** and move the Next.js starter source there. Do **not** merge the provisional ZYVRA branch into the unrelated profile repository's main branch.

## Suggested backend architecture

Next.js, PostgreSQL/Neon, email-based or OAuth auth, secure per-conversation authorization, real-time message subscription, object storage for images/video, content moderation, spam/rate controls, and story expiry enforced by the server. Avoid continuous background polling and keep on-demand/serverless costs predictable.

**Brand check:** ZYVRA is a working name; check trademark and domain availability before public commercial launch.