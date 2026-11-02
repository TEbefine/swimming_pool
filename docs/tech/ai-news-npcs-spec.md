# AI News NPCs — spec (Phase 1: manual update, preview only)

## Context
swimming_pool is a pixel-art walk-and-talk web game, live at swimming-pool-five.vercel.app on Vercel.
Firebase project "lumen-bay" (Spark plan, Firestore in asia-southeast3). Work on branch `dev-test-id`; do NOT touch or merge `main`.

## Goal
Three town NPCs share today's most important OFFICIAL news about "their" AI. Lines are short and in character:
- Sir Ledger (id `tycoon`) = Gemini/Google. Warm rich grandpa, says "young friend", uses gold and money metaphors.
- Nova (id `nova`) = ChatGPT/OpenAI. Cool, casual, few words.
- Clara (id `clara`) = Claude/Anthropic. Gentle, bookish, explains why it matters.

They speak as fans, never as the company: "Google just launched…", never "We launched…".
Envoy is unchanged. No coins, no quiz.

## Talk flow
The NPC's first topic choice becomes "AI NEWS".
- News day: a hook line (1 page, ≤48 chars), then choices TELL ME MORE / WHY CARE? / SOURCE / BYE.
  - TELL ME MORE: ≤2 pages. It may end with one "Oh, and…" mini item.
  - WHY CARE?: ≤2 pages giving one practical way a learner can use it.
  - SOURCE: "From blog.google · Nov 3", plus an option to open the link in a new tab.
- Quiet day: an in-character bridge line, then that NPC's usual tip from the existing lists:
  - Ledger: "Quiet day at Google, young friend." → "So here's a tip worth gold!"
  - Nova: "Nothing new from OpenAI today." → "Lucky you. Prompt trick time."
  - Clara: "No new posts from Anthropic yet." → "Shall I share a thinking habit?"

Talk box: about 24 letters per row, max 2 rows per page; `*word*` = accent-colour highlight.

## Server job: /api/ai-news (Vercel function)
1. Auth: `?key=` matching env NEWS_ADMIN_KEY, OR header `Authorization: Bearer <CRON_SECRET>` (Phase 2 cron). Anything else → 401.
2. Fetch the official feeds in parallel, each with a timeout. One failing feed must not stop the others.
   - Google: https://www.blog.google/rss/ , https://blog.google/products/gemini/rss/ , https://deepmind.google/blog/rss.xml , Google Developers Blog feed
   - OpenAI: https://openai.com/news/rss.xml , https://openai.com/products/release-notes/rss.xml
   - Anthropic (no official RSS): community feed github.com/Olshansk/rss-feeds (feed_anthropic_news.xml); if that fails, parse https://www.anthropic.com/news .
3. Keep only items that pass all three checks:
   - link on the whitelist: blog.google, deepmind.google, developers.googleblog.com, firebase.google.com, openai.com, anthropic.com, claude.com
   - published within the last 48h
   - not already told (told URLs in Firestore `aiNewsMeta/seen`, last 300).
4. One Gemini call per NPC. Model from env GEMINI_MODEL; default = current free-tier Flash-Lite. JSON output with a schema. Prompt rules:
   - Use ONLY facts from the given items. Never add anything.
   - Rank: new model > promo or free offer > new feature you can try > fun extra. Skip company business, hiring, policy, deep research.
   - Nothing important enough → hasNews:false.
   - NPC's voice, inside the character limits.
5. Validate in code; don't trust the model. The returned url must be one of the input urls, the character limits must hold.
   On any failure (Gemini error, bad JSON, invalid output) build a fallback from the headline: hook "Fresh from Google today!", more = the headline trimmed to 2 pages.
6. Write one doc keyed by the Bangkok date.
   - Production (VERCEL_ENV === 'production'): `aiNews/today` + `aiNews/{YYYY-MM-DD}`
   - Everything else: `aiNewsTest/today` + dated copy. Test data must never reach production.
   - Doc shape: `{ date, generatedAt, npcs: { tycoon|nova|clara: { hasNews, hook, more, why, mini?, source:{url,domain,title,publishedAt}, usedTemplate } }, status: { google|openai|anthropic: { state:'ok'|'empty'|'error', message } } }`
7. Respond with a JSON summary: what each NPC will say + status of each source.

Firebase Admin SDK with env FIREBASE_SERVICE_ACCOUNT (JSON string). Env vars set in Vercel by the owner:
GEMINI_API_KEY, GEMINI_MODEL (optional), FIREBASE_SERVICE_ACCOUNT, NEWS_ADMIN_KEY, CRON_SECRET. Never hardcode, print or commit secrets.

## Admin page ("UPDATE NOW")
Tiny standalone page nothing in the game links to: key input (remembered in localStorage), one big UPDATE NOW button
calling /api/ai-news, readable result (each NPC's lines, ✅/❌ per source). Must work well on iPhone 13.

## Game client
- On town load, read the doc ONCE: production reads aiNews/today; preview + local dev read aiNewsTest/today. Cache for the session, no polling.
- Doc missing, error, or `date` ≠ today (Bangkok) → quiet-day flow. Never show old news as today's.
- Firestore rules: aiNews and aiNewsTest readable by anyone, writable by no client (Admin SDK bypasses rules). aiNewsMeta: no client access.

## NOT in Phase 1
No cron in vercel.json yet. Phase 2, after the lines are approved: add
`{ "path": "/api/ai-news", "schedule": "0 21 * * *" }` (= 04:00–04:59 Bangkok), then merge to main.

---

## Implementation notes (Phase 1, as built)

| Piece | File |
|---|---|
| Shared doc shape, page limits, whitelist, Bangkok date | `src/game/content/aiNewsShape.ts` |
| Feeds: fetch + RSS/Atom/HTML parsers + filters | `server/aiNews/feeds.ts` |
| Gemini prompt, schema, validation, template fallback | `server/aiNews/compose.ts` |
| Job + auth + JSON summary | `server/aiNews/handler.ts` |
| Firestore writes (Admin SDK) | `server/aiNews/admin.ts` |
| Vercel entry | `api/ai-news.ts` |
| Admin page | `public/news-admin.html` → `/news-admin.html` |
| Game: one REST read + dialog builder | `src/game/content/aiNewsNpcs.ts` (used in `App.tsx`, `DialogBox.tsx`) |
| Tests (no network) | `tests/ai-news.test.mjs`, samples in `tests/fixtures/ai-news/` |

Decisions worth knowing:
- **`more` and `why` are arrays of pages** (`string[]`), one string per talk-box page, so limits are checked per page.
- **Character limit** checked in code = ≤48 chars per page (stars not counted), balanced `*` marks, hook 1 page,
  more 1–2 pages (1 if there is a mini), why 1–2 pages, mini must start "Oh, and", be about a *different* input item
  (`miniUrl`), and fit in the 2-page total. Lines in company voice ("We launched…", "our model") are rejected.
- **Fallback `why`** (not in the original spec): a fixed in-character line pointing to the source, e.g.
  "Read the source, young friend. Knowledge pays!". The fallback also skips headlines that look like company business
  (office, funding, hiring, policy, research…); if nothing is left, that NPC has a quiet day.
- **Seen list is per environment**: production uses `aiNewsMeta/seen`, previews use `aiNewsMeta/seenTest`, so test
  runs can never "use up" news before production tells it. Entries are `{u: normalized url, d: Bangkok date}`; only URLs told
  on an *earlier* day are skipped, so pressing UPDATE NOW twice on the same day keeps today's news.
- **Admin key in a header**: the admin page sends `X-News-Key` (also accepted, same check as `?key=`) so the key does not
  land in Vercel request logs. `?key=` still works.
- **Developers Blog feed**: `https://developers.googleblog.com/rss/` with fallback `https://developers.googleblog.com/feeds/posts/default?alt=rss`.
- **Default model**: `gemini-3.5-flash-lite` (stable per ai.google.dev model pages, Nov 2026). Free-tier availability was not
  confirmed from this sandbox; set GEMINI_MODEL to override.
- **Client read** uses the Firestore REST API (one GET, no Firebase SDK in the bundle). Rules allow `get` only (no listing).
- Collection choice is fixed at build time from Vercel's `VERCEL_ENV` (vite.config.ts `AI_NEWS_COLLECTION`), not from the URL.
- The game reads the doc when the town room loads; if the player talks before it arrives, it's a quiet day for that talk.
  After Bangkok midnight in a long session the cached news stops counting as today's.
