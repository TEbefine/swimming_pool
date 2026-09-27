# DJ — Character Profile (Music Club)

> Status: **concept** (2026-09-26). Next: pixel sprite sheet → identity photo → portraits.
> Fields marked `TODO` are Teera's decisions. Fields marked *(draft)* are proposals: keep, change or delete them.

## AI BRIEF (copy-paste this into any AI first)

```
CHARACTER: [NAME — TODO], the DJ and music host of the Music Club in a cozy pixel-art
community game set in Bangkok. An ORIGINAL character, not based on any real person.
LOOK (draft, lock after the sprite sheet is approved): Thai man, early 20s, K-pop idol
styling. Soft two-block haircut with fluffy bangs, jet-black hair with lavender tips,
one small silver star earring, big white over-ear headphones resting around the neck,
oversized lavender bomber jacket with a small gold star patch on the chest, white
tee, thin silver chain, black wide cargo pants, chunky white sneakers. Bright,
confident smile.
PERSONALITY (draft): stage energy with a kind heart. Hypes people up, never shows off.
Believes every song has a story. Teaches ONE small music thing per night, then plays it.
VOICE (draft): short, upbeat lines; one music word per talk, with its meaning; speaks
English and Thai. Signature goodbye: a K-pop finger heart.
ROLE: hosts the Music Club, picks tonight's genre (jazz, classical, rock, star night),
shares the "track of the day" and its story.
```

## Identity
| Field | Value |
|---|---|
| Name | TODO (ideas: **Dao** ดาว = star, fits "star night" · **Pleng** เพลง = song · **Mint**) |
| Gender / pronouns | he/him (decided 2026-09-26) |
| Age | early 20s |
| Background | *(draft)* trained as a K-pop trainee in Seoul, came home to Bangkok to make music feel close to people again |
| Why a DJ | *(draft)* "A stage is lonely. A club is where music becomes ours." |

## Look (locked details once the sheet is approved)
- soft two-block haircut with fluffy bangs, jet-black hair with **lavender tips**
- big **white over-ear headphones** around the neck (his silhouette at pixel size)
- oversized **lavender bomber** with a small **gold star** patch
- white tee, thin silver chain, black wide cargo pants, chunky white sneakers
- one small silver star earring
- Signature colors: lavender `#B9A3E3` + gold `#E8B84A`

## Personality *(draft)*
- **Hype, then humble.** Cheers you on, then turns the spotlight back to you.
- **Story first.** Every track comes with one line of "why this song matters".
- **Genre host.** Mood changes with the night: jazz = soft and slow, rock = loud and funny, classical = poetic, star night = full idol mode.
- **Small ritual:** ends every talk with a finger heart.

## Voice *(draft)*
| Do | Don't |
|---|---|
| Short lines (≤ 2 sentences) | Long music theory |
| One music word + its meaning ("a *chorus* = the part everyone sings") | Name-dropping real artists |
| Hype the player | Hype himself |
| Playful Thai-English mix | Slang the player can't follow |

Examples:
- EN: "Hey, welcome to the club! Tonight is jazz night. Want to hear the track of the day?"
- TH: "ยินดีต้อนรับเข้าคลับ! คืนนี้แจ๊สไนท์ อยากฟังเพลงประจำวันไหม?"
- Tip: "A *bridge* is the part of a song that takes a new road, then brings you home."
- Goodbye: "See you on the dance floor." → finger heart

## Role in the app
- Music Club room (planned), standing at the DJ booth.
- Talk (◯): greeting → choices (Track of the day / Tonight's genre / Bye).
- Owns the nightly genre; the club's lights and music can follow it.

## Assets & status
| Asset | Status | Where |
|---|---|---|
| Pixel sprite sheet (16 poses) | ⏳ make with the prompt in `prompts.md` §1 | `src/assets/npc_dj_sheet.png` → `public/sprites/npc/dj/` |
| Identity photo (Midjourney) | ⏳ | `references/identity_front.png` |
| Dialogue portraits (PHOTO, 5 faces) | ⏳ neutral, smile, thinking, idea, finger heart | `public/sprites/npc/dj/portrait/` |

## Decision log
| Date | Decision |
|---|---|
| 2026-09-26 | Club NPC = DJ / music host with K-pop idol inspiration (original character) |
| 2026-09-26 | Male idol (he/him); sprite sheet made in ChatGPT |
