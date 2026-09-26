# Barista — Character Profile

> Status: **identity approved (Midjourney v1)** — see references/identity_front.png. Fields marked `TODO` are Teera's decisions.
> Fields marked *(draft)* are proposals — keep, change or delete.

## AI BRIEF (copy-paste this into any AI first)

```
CHARACTER: [NAME — TODO], the barista of the Weekday Chill Café in a cozy pixel-art
community game set in Bangkok.
LOOK (locked): Thai, late 20s, chin-length wavy dark-brown bob, round thin-rimmed
glasses, olive-green wool beret, cream short-sleeve shirt with rolled sleeves, dark-brown
apron with a small green leaf emblem, beige trousers, brown shoes. Warm, calm face.
PERSONALITY (draft): calm listener, notices how you feel, curious, gently funny,
never lectures. Teaches ONE small useful thing per day, then lets it go.
VOICE (draft): short sentences, warm, a little playful; speaks English and Thai;
ends conversations light, never heavy. Core idea: "สอนแล้วเบาขึ้น" — teach, then feel lighter.
ROLE: hosts the café on weekdays, shares the daily tip, welcomes new players.
```

## Identity
| Field | Value |
|---|---|
| Name | TODO (ideas: **Pan** ปัน = to share · **Bao** เบา = light · **Kaew** แก้ว = cup / precious) |
| Gender / pronouns | TODO |
| Age | late 20s |
| Home | small apartment in Bangkok, rides the skytrain to the café |
| Why a barista | *(draft)* believes a good cup and one good idea can change someone's day |

## Look (locked details — every image must keep these)
- olive-green wool beret
- round thin-rimmed glasses
- chin-length, slightly wavy dark-brown bob
- cream short-sleeve shirt, sleeves rolled
- dark-brown apron with a small green **leaf** emblem
- beige trousers, brown shoes

## Personality *(draft)*
- **Notices people.** First line often reacts to *you*: "You look a little tired today."
- **Curious.** Asks one question back instead of giving long answers.
- **Light.** Teaches one thing, then moves on — no lectures, no guilt.
- **Small ritual:** ends every visit with a wai.

## Voice *(draft)*
| Do | Don't |
|---|---|
| Short lines (≤ 2 sentences) | Paragraphs |
| One idea per tip | Lists of rules |
| Warm humor | Sarcasm |
| Plain words, then one "new word" with meaning | Jargon without explanation |

Examples:
- EN: "Good afternoon! You look a little tired today. Want to hear today's tip?"
- TH: "วันนี้ดูเหนื่อยๆ นะ อยากฟังเรื่องเล็กๆ ของวันนี้ไหม?"
- Goodbye: "Take it easy today. See you tomorrow." → wai

## Role in the app
- Weekdays in the café, standing behind the bar (`BARISTA_SPOT`).
- Talk (◯): greeting → choices (Today's tip / About the café / Bye).
- Owns the daily tip; the notice board mirrors it.
- Future: remembers returning players, reacts to streaks ("3 days in a row!").

## Assets & status
| Asset | Status | Where |
|---|---|---|
| Pixel sprite sheet (16 poses) | ✅ done | `src/assets/npc_barista_sheet.png` → `public/sprites/npc/barista/` |
| Identity photo (Midjourney) | ✅ done | `references/identity_front.png` |
| Expression set | ✅ done (smile, thinking, idea, wai) | `references/expressions_v1.png` |
| Turnaround (front/side/back) | ⏳ optional | `references/` |
| Dialogue portraits (PHOTO, 5 faces) | ✅ done: neutral, smile, thinking, idea, wai | `public/sprites/npc/barista/portrait/` (made with `scripts/process_portraits.py`) |

## Decision log
| Date | Decision |
|---|---|
| 2026-09-25 | Look defined (beret, glasses, apron with leaf) — pixel sheet approved |
| 2026-09-26 | Stands behind the plain bar; talk opens visual-novel style portrait |
| 2026-09-26 | Real-person identity to be created in Midjourney, then pixel versions drawn from it |
| 2026-09-26 | Identity approved: Midjourney V8.2 identity + 4 expressions via Edit Model; hair = chin-length wavy bob |
| 2026-09-26 | Dialogue portraits use the real photo (not pixel art) — cut out, aligned by the beret, 760×1000 |
