# Prompt for the IDE AI: U-02 START menu + SELECT (Pokémon-style)

Paste everything below the line into the IDE AI.

---

Read `AI_CONTEXT.md` first (ME-01, P-01, ID-01, U-01) and `docs/ui/handheld-shell.md` (settled shell rules, don't break them). Then build **U-02: a Pokémon-style START menu** for swimming_pool, step by step. Don't write everything at once. Stop after each step so I can test on my iPhone 13.

## Why
Today START opens an "Emotes" sheet with Quality + Music buttons stuffed at the bottom (`GameBoyMobile.tsx`, `showEmoteMenu`). The bag (`StoryHud`), fish book (`FishBook`), name (`NameModal`), help (`HelpModal`), sound/music/quality live in different places. I want ONE home for "manage my stuff", like Pokémon FireRed/LeafGreen: press START → a menu box on the right of the screen, a ▶ cursor, a description box at the bottom.

## Look (FireRed/LeafGreen feel, not a copy)
- Menu box on the **right side inside the game screen**, about 45% of screen width, from the top. White/cream panel, dark navy 2px border with a thin inner border, small radius (4px). In dark mode use `--gb-*`-style tokens (dark panel, light text). No backdrop blur (slow on iPhone); a light dim behind is fine.
- Labels in CAPS with the pixel font (Sabai Pixel / Pixelify Sans), 16px minimum (iOS zoom). A ▶ cursor beside the highlighted row. No emoji in the menu.
- **Description box** across the bottom of the screen (same family as the talk/dialog box): one short line explaining the highlighted item, e.g. BAG → "Check the items you're carrying."
- Menu items, in this order:
  1. **FISH BOOK**: opens the existing FishBook
  2. **BAG**: opens the existing bag (StoryHud)
  3. **{player name}**: the ID card (step 2)
  4. **EMOTE**: the current emote list (moved here from the old sheet) + Dive in / Step out
  5. **OPTION**: settings screen (below)
  6. **HELP**: existing HelpModal
  7. **EXIT**: closes the menu
- Remember the last cursor position when START is pressed again (Pokémon does this).

## Controls (one input router while any menu is open)
- When the menu is open, D-pad and buttons go to the menu ONLY. The player stops walking. This is multiplayer, so the world does NOT pause: other players and NPCs keep moving. Say this clearly in code comments.
- D-pad ↑/↓ move the cursor (wrap around). ◯ = confirm. ✕ = back one level (or close at the top level). START = close from anywhere. Tap/click on a row also works.
- Keyboard (desktop): arrows/WASD move, Enter or Z = confirm, X or Escape = back, and pick a free key for START (check `App.tsx` ~L280–330, ~L520, ~L600 and `Engine.ts` ~L1040 first. Don't break B for bag, Tab, 1–5 emotes or F3).
- Haptic tick on cursor move and confirm (reuse `triggerHaptic`). Cursor/confirm/back sounds through `sound` from `src/game/audio.ts` if it has a fitting blip; respect mute.
- Shell rule: no press animations under the finger.

## SELECT
Keep SELECT = SceneBox (travel between rooms). It works and I use it. Only make sure SELECT closes the START menu if it's open, and START closes SceneBox if that's open. Never two overlays at once.

## OPTION screen (Pokémon OPTION style)
Rows; ↑/↓ choose a row, ←/→ change its value, values shown as `◀ ON ▶`:
- SOUND: ON / OFF (existing `pixel_pool_muted` in audio.ts)
- MUSIC: the levels from `src/game/audio/music.ts`
- QUALITY: the modes from `src/game/quality.ts`
- VIBRATION: ON / OFF (new, saved in localStorage, `triggerHaptic` reads it)
- FLOAT COLOR → opens the existing float picker (`onOpenFloatPicker`)
- CANCEL / ✕ = back
Reuse the existing stores. Don't create a second source of truth. Wrap every localStorage read/write in try/catch.

## ID card (step 2) — prepare for ID-01, don't build the wallet
Pokémon "Trainer Card" feel. Shows: name (with EDIT → existing `NameModal`), **PLAYER ID**, fish caught (from the fish book), items in bag, cards owned (`kind: 'card'`, 0 is fine for now), first-play date.
- Create `src/game/identity/` with one interface the UI reads, e.g.
  `PlayerIdentity { displayName; status: 'guest' | 'wallet'; address: string | null; createdAt }`
  and a `getIdentity()` / `useIdentity()` that today returns a **guest** identity from localStorage.
- Guest state shows `PLAYER ID: GUEST` + one line "Your own Player ID is coming soon." When ID-01 lands, it only swaps the source to the wallet address (show it short: `0x12ab…9f3c`). The UI must not change.
- Do NOT add wallet, crypto, Firebase or PIN code in this task. That's ID-01 (`docs/ai/PROMPT_player_id.md`).

## Code shape
- New `src/components/startMenu/` (e.g. `StartMenu.tsx`, `MenuList.tsx`, `OptionScreen.tsx`, `IdCard.tsx`, `menu.css`) plus a small hook `useMenuStack` (a stack of screens: `root → option`, `root → idCard`…).
- Move emotes out of the old START sheet into the EMOTE screen; delete the old sheet when the new one works. △ stays Chat, ▢ stays Quick Wave.
- Desktop: the same menu must open from the keyboard and look right outside the Game Boy shell.
- No new libraries. Keep it light for iPhone 13. Mind the gotcha in `handheld-shell.md`: the unlayered `* { margin:0; padding:0 }` beats Tailwind spacing, so use inline styles, `gap` or custom CSS.

## Steps (stop after each one and tell me what to test)
1. START menu shell: box, cursor, description box, input router, EMOTE, HELP, EXIT, FISH BOOK, BAG wired. SELECT/START overlay rules.
2. OPTION screen + VIBRATION setting.
3. ID card + `src/game/identity/` guest adapter.
4. (Later, ask me first) BAG pockets like Pokémon: ITEMS / FISH / CARDS / KEY ITEMS using `ItemKind`.

## Done = I can check this list
- [ ] START opens/closes; cursor remembers its row
- [ ] D-pad/◯/✕ never move my character while a menu is open
- [ ] Only one overlay at a time (START menu, SceneBox, chat)
- [ ] Every row opens the right screen, ✕ always goes back one level
- [ ] Settings survive a reload; mute is respected by menu sounds
- [ ] Light + dark mode both readable; no text under 16px; no zoom on hold
- [ ] Desktop keyboard works; old shortcuts (B, Tab, 1–5, F3) still work
- [ ] `npm run build` and `npm run lint` pass; no new dependency

After each step: update `AI_CONTEXT.md` (add a **U-02 · START menu** block with status, decisions, files, next) and one Log line. Work on a branch `feat/start-menu`; I'll test the Vercel preview on my iPhone before merging.

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.
