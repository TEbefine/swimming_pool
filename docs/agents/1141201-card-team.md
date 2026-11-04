---
code: 1141201
name: Card Team
status: active
owner: Teera
main AI: ChatGPT (with Midjourney for the art)
created: 2026-11-04
---

# 1141201 · Card Team

When Teera writes **1141201**, it means: act as the Card Team for swimming_pool.
The Card Team turns a **locked or approved** NPC story into a finished card: text, art prompt, checked art.
Claude then builds the card and puts it in the game.

## The pipeline
| Step | Who | What comes out |
|---|---|---|
| 0. Story | 1141336 (Gemini + Teera) | `docs/characters/<id>/story.md` with status **locked** or **approved** |
| 1. Card brief | 1141201 (ChatGPT) | Card text (title, short line, shutter story), type, code, the scene, the identity clue |
| 2. Art prompts | 1141201 (ChatGPT) | 2–3 Midjourney V8 prompts that follow the card art rules |
| 3. Generate | **Teera** in Midjourney | Picks 1–2 images |
| 4. Check | 1141201 (ChatGPT) | A pass/fail checklist for each image + what to fix |
| 5. Realism fix | 1141201 (ChatGPT image edit) | Final art, one change per edit, face checked against the identity image |
| 6. Approve | **Teera** | "approved" |
| 7. Build | Claude | Art + data into `docs/cards/`, the card in the prototype, then into the game (bag item `kind: 'card'`) |

Hand-off from ChatGPT to Claude: Teera downloads the final art (PNG, original file, not a screenshot) and copies ChatGPT's **CARD HAND-OFF** block, then tells Claude: `1141201 deliver <id>` + the block + the image.

## Rules
- **Never make a card from a story that isn't locked or approved.** Never invent story facts: if the card needs a fact the story doesn't have, ask Teera.
- Every card follows `docs/cards/card-tiers.md` (repo) and `cards/card-front-spec.md` (claude.ai Project).
- Card title = the name of the moment, not the NPC. Common = "The First ___". Rare = the dream's name. Legend = only The Creator (never for NPCs).
- All tiers are **fine-art photographs** (one series look). **No text, logo, frame or border in the art** — the frame and words are added in code.
- **Keep the top ~15% of every artwork as empty sky or background** (the metal shutter covers it).
- Common · Before: warm dawn light, low angle, hands in focus, film grain, quiet dignity. Keep **ONE identity clue** from the NPC's current look. Attach the NPC's identity photo at low weight for the face shape.
- Midjourney V8: `--ar 3:4 --v 8`; **only ONE `--no`** per prompt. Moderation: don't combine age numbers with appearance words; avoid "not a real celebrity" and celebrity words.
- ChatGPT edits drift: change one thing per edit, and compare the face with the identity photo every time.

## Card codes
Barcode code format `SAP-[B/D/C][###]`: B = Before (Common), D = Dream (Rare), C = Creator. The code goes in the barcode only, never printed as text.
| Code | Card | NPC | Status |
|---|---|---|---|
| SAP-B001 | The First Crate (Wealth) | tycoon (Sir Ledger) | art done |
| SAP-B002 | The First Cup (Craft) | barista (Pan) | **next** |
| SAP-D001 | Dream High (Spirit) | yunseul | prototype |
| SAP-C001 | The Creator | spirit | done |

Build note for Claude: `docs/cards/assets/frame_common.png` has the SAP-B001 barcode baked in. New Common cards need their own barcode (draw it in code from the code, or a frame per card).

## Types (header strip colour)
Wealth #C99234 · Wisdom #3F5E8C · Heart #B5544B · Courage #C0692E · **Craft #6F7A3A (the type table's example is the barista)** · Spirit #857C99.
