# Performance budgets

The goal: smooth and beautiful on an iPhone 13 **for hours**, playable on older phones, and ready
for a 100–200 person crowd. The art never changes between quality levels.

## Rendering

- **The phone canvas is a camera.** In handheld mode the canvas is only as big as what the screen
  shows (455 × 576 art pixels in portrait instead of 1024 × 576); the world is drawn shifted.
  Desktop keeps the full 1024 × 576 world. Never multiply the backing canvas by devicePixelRatio.
- **Sky, city, clouds, birds and trains** are drawn only inside the painting's see-through windows
  (found once from the background's alpha when a room loads).
- **Sprites are ImageBitmaps** (`imageLoader.ts`): decoded once, never re-decoded mid walk cycle,
  and `close()`d when a room is left.
- **Text is cached** (`labelCache.ts`): name tags, speech bubbles, exit signs and talk prompts are
  drawn once into small bitmaps (LRU, 320 entries). Shadows and night lights are cached the same way.
- **Off-screen actors and props are skipped.** In a packed room only the nearest players are drawn
  (Beautiful 120, Balanced 45, Battery 25) and only the 12 nearest name tags.

## Frame rate & heat

| Quality   | moving | still (4 s) | no input (45 s) | ambient specks | players drawn |
|-----------|-------:|------------:|----------------:|---------------:|--------------:|
| Beautiful |     60 |          30 |              20 |           100% |           120 |
| Balanced  |     30 |          15 |              10 |           100% |            45 |
| Battery   |     24 |          10 |               6 |            50% |            25 |

- Defaults: desktop → Beautiful, phones → Balanced, Chromium devices reporting ≤ 2 GB → Battery.
- **Auto** watches how long each frame takes to compute. When the same scene suddenly takes ~2× longer
  for 15 s (a hot, throttled chip) or frames keep arriving late, it steps down one level. It never
  steps back up by itself; the player can always choose (START menu on phones, header on desktop).
- Below the display rate the loop sleeps on a timer instead of waking on every vsync.
- Hidden pages stop rendering, heartbeats, audio and reconnects.

Check on a real phone with `?perf=1`: frames/sec, CPU ms per frame, quality level, % of the world drawn.

## Downloads

- `scripts/optimize_images.py` re-encodes art (256-colour palette or lossless repack, lossy only for
  large pictures) and only keeps a result that is visually identical (PSNR-gated) and ≥ 5% smaller.
  Run it after adding art: `.venv/bin/python scripts/optimize_images.py public/sprites public/maps`.
- Production builds use **Preact** (`vite.config.ts` alias): same React API, ~200 KB less JavaScript.
  `npm run dev` still uses React for fast refresh — test releases with `npm run build && npm run preview`.
- Pixelify Sans is self-hosted (no Google Fonts round trip).
- `public/sw.js` keeps code and art on the phone: repeat visits download nothing up front.
  `vercel.json` sets cache headers. Bump `VERSION` in `sw.js` to force everyone to refetch.

## Multiplayer (crowd relay)

`server/wsServer.js` sends one batched snapshot per room 10×/s, only players who moved, far players
2×/s, names/speech once, and only your own room's people (other rooms get a head-count).
Measured with 200 bots, ~half walking at any time:

|                         | old relay | crowd relay |
|-------------------------|----------:|------------:|
| messages per phone /s   |       968 |           8 |
| download per phone      |  228 KB/s |     25 KB/s |
| relay CPU               |  0.9 core |   0.13 core |

Hosting: the relay keeps rooms in memory, so it needs **one always-on process** (any small Node host
or VPS: `PORT=3001 node server/wsServer.js`). Then set `VITE_WS_URL=wss://…` in Vercel and redeploy.
Vercel Functions WebSockets (beta) pin each connection to whichever instance accepted it, so rooms
would need Redis pub/sub there. When the community outgrows one process, the natural next step is one
Cloudflare Durable Object per room (same logic, rooms scale independently).

## Validation

`npm test` (Node 24+) and `npm run build` before merging. Browser checks: café → pier → café;
pool swim/float; NPC dialogue; keyboard and Game Boy controller; fishing; hide/resume; room changes;
`?perf=1` on a phone for 10+ minutes.
