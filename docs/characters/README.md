# Character Bible

The single source of truth for every character in the app (NPCs now, maybe players' avatars later).
If a detail about a character isn't written here, it isn't decided yet.

## Why here (in the project) and not only in Google Drive

- **One truth, no drift.** The game code, the IDE (Antigravity), and every AI read the same files.
  Copies in Drive / Notion / chats go stale — treat them as *mirrors*, never the original.
- **Version history.** Git remembers every change: when a name, look or voice changed, and why.
- **Machine-readable.** `character.json` can be imported by the game (name, colors, asset paths).
- **Share images?** Upload the `references/` folder to Google Drive when you need to show someone.
  Edit here first, then mirror.

## Folder layout

```
docs/characters/
  README.md            ← this file
  _style-guide.md      ← art rules every character must follow (sizes, scale, formats)
  barista/
    profile.md         ← who they are: AI BRIEF (copy-paste), look, personality, voice, role
    prompts.md         ← every prompt used, per tool, with a version log
    character.json     ← machine-readable facts for the game
    references/        ← APPROVED images only (identity photo, turnaround, portraits)
```

## Using a character with any AI

1. Open `<character>/profile.md` and copy the **AI BRIEF** block at the top.
2. Paste it as the first message in ChatGPT / Midjourney / Antigravity / Claude.
3. Attach the approved identity image from `references/` when the tool accepts images.
4. When you approve a new image, save it in `references/` and log the prompt in `prompts.md`.

## New character checklist

- [ ] Copy the `barista/` folder, rename it (lowercase id, e.g. `librarian`)
- [ ] Fill `profile.md` (name, look, personality, voice) — decisions first, images second
- [ ] Generate identity image → approve → save to `references/identity_front.png`
- [ ] Generate expressions / turnaround with the same reference → approve → save
- [ ] Pixel sprite sheet (4×4) + dialogue portraits (8 frames) → cut into `public/sprites/npc/<id>/`
- [ ] Fill `character.json` and log everything in `prompts.md`
