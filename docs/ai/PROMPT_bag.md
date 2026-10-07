# Prompt for the IDE AI: U-03 Pokémon-style BAG

Paste everything below the line into the IDE AI.

---

Read `AI_CONTEXT.md` first (ME-01, P-01, ID-01, U-02) and `docs/ui/handheld-shell.md`. Then rebuild the **BAG** as a real Pokémon-style bag (U-03), step by step. Stop after each step so I can test on my iPhone 13. Branch: `feat/bag` (from `feat/start-menu`, or `main` if it's merged).

## What's wrong now
The bag is a small cream popup inside `StoryHud.tsx` (`bagOpen` panel). It covers the Coins/Energy HUD, it's one long list with no pockets, the only action is "Eat", it doesn't work with the D-pad, and it doesn't match the new START menu. I want a bag I'd actually use, like the Pokémon bag (Black/White, ORAS feel): pockets, a cursor list, a description box with a big icon, and an action menu.

## Layout (portrait game screen, adapted from Pokémon's landscape bag)
The bag fills the whole game screen (it covers the HUD; show Coins inside the bag instead).
1. **Pocket bar (top):** `◀  [pocket icon] POCKET NAME  ▶`, with small dots under it showing which pocket you're on (● ○ ○ ○). On the right: `Coins 12`.
2. **Item list (middle, takes the free space):** rows `▶ Mackerel        ×3`. The last row is always `CLOSE BAG`. Highlighted row = ▶ cursor + soft highlight. A thin scrollbar on the right when the list is longer than the box; the list scrolls to keep the cursor visible.
3. **Description box (bottom):** big item icon (48px, `image-rendering: pixelated`) on the left, then the name and `ITEMS[id].note`. One small info line under it, only what exists: `Energy +3` · `Gu 2c / Inn 4c` · `Dries → Dried Mackerel` · `KEY ITEM`.
- Same visual family as the START menu (`src/components/startMenu/menu.css`: cream #FFF8EC panel, navy #1E293B 2px border, inner hairline, 4px radius, pixel font). Dark mode readable. Text 16px minimum. No emoji. No backdrop blur.
- Pocket icons: tiny inline SVGs drawn in pixel style (bag, fish, card, key), 24px. No new image files needed.

## Pockets (one source of truth)
Add `pocketOf(id)` + `POCKETS` in `src/game/story/items.ts`:
- **ITEMS:** kind `food`, `goods`, `tool`, `junk` (not key)
- **FISH:** kind `fish`, `dried`
- **CARDS:** Memory Disk cards (`kind: 'card'`, C-01). Cards don't exist as items yet: show the pocket with an empty state, don't invent card data.
- **KEY ITEMS:** anything with `key: true`
- Order inside a pocket = the order of `ITEM_IDS` (it follows the icon sheet). Hide items with count 0.
- Empty pocket: keep Mother's line, it's part of the story's charm: "Empty. Mother would say that's a good sign you haven't lost anything yet."

## Controls (reuse the START menu input router)
- ←/→ = change pocket (wrap). ↑/↓ = move the cursor (wrap). ◯ = open the action menu for the item (on `CLOSE BAG` → close). ✕ = back. START = close everything.
- Each pocket remembers its own cursor row (Pokémon does this).
- Tap a pocket arrow / a row also works. Swipe left/right on the list changes pocket (optional, only if cheap).
- Keyboard: arrows/WASD, Enter/Z confirm, X/Escape back, **B toggles the bag** (keep B).
- Opened from START → BAG: ✕ goes back to the START menu with the cursor on BAG. Opened from B or the HUD button: ✕ closes.
- The player doesn't walk while the bag is open; the world keeps running (multiplayer). Same rule as U-02.
- Haptic tick + cursor/confirm/back sounds, same as the START menu. Respect mute and VIBRATION.

## Action menu (small box, bottom-right, over the description box)
Opens on ◯ over an item. Only show actions that make sense:
- **EAT**: only if `ITEMS[id].energy`. Uses the existing `eatItem(id)`. If energy is already 10, say "You're not hungry." in the description box and don't use it.
- **CHECK**: a bigger detail view: big icon, full note, every known fact (kind, pocket, sell prices, dries to, energy, catch rarity + size range from `catch`, your record size from `story.records`).
- **TOSS**: not for key items. Opens a Pokémon quantity picker `×01` (↑/↓ ±1, ←/→ ±10, clamps to 1…count), then "Toss 3 Mackerel?" `YES / NO` (cursor starts on NO). Then a line: "Threw away 3 Mackerel."
- **CANCEL**
No GIVE in the bag: gifts stay in the NPC talk flow (`giveTo`), because giving needs a person next to you.

## Prepare for ID-01 (important)
Every change to the bag goes through ONE module, e.g. `src/game/story/bagActions.ts` (`useItem`, `tossItem`), that calls `removeItem` / `eatItem` in `storyStore.ts`. The UI never edits `story.bag` directly. Later, ID-01 points this module at `/api/items` and the server decides. Add a comment saying that. Don't add any Firebase/wallet code now.

## Code shape
- New `src/components/bag/` (`BagScreen.tsx`, `PocketBar.tsx`, `ItemList.tsx`, `ItemDetail.tsx`, `ActionMenu.tsx`, `QuantityPicker.tsx`, `bag.css`).
- `StoryHud.tsx`: remove the old bag panel; its Bag button opens the new bag. Keep the objective and Coins/Energy HUD as they are.
- Mount the bag inside the game screen (mobile shell) and centred over the canvas on desktop.
- Test data: in the `?test=story` sandbox only, add a dev way to fill the bag with one of every item, so I can test pockets and scrolling. Never touch the real save.
- No new libraries. 16 items = no list virtualization needed. Mind the `* { margin:0; padding:0 }` gotcha (use inline styles, `gap` or custom CSS).

## Steps (stop after each one and tell me what to test)
1. Bag screen: pocket bar, pockets, list, cursor memory, scrolling, description box, empty states, open/close from START / B / HUD. Remove the old panel.
2. Action menu: EAT, CHECK, CANCEL + `bagActions.ts`.
3. TOSS: quantity picker + YES/NO confirm.
4. (Later, ask me first) SORT, and new-item "NEW" dots.

## Done = I can check this list
- [ ] Bag opens from START, B and the HUD button; ✕ goes back to the right place
- [ ] ←/→ changes pocket, ↑/↓ moves, each pocket remembers its row
- [ ] Long list scrolls with the cursor; CLOSE BAG is always last
- [ ] Description box shows icon + note + correct info line
- [ ] EAT works and is blocked at full energy; key items can't be tossed
- [ ] TOSS amount is right, NO is the default
- [ ] The bag never covers half the HUD again (it's full screen and shows Coins)
- [ ] Character doesn't move while the bag is open
- [ ] Light + dark mode readable, text ≥16px, no zoom on hold
- [ ] `npm run build` and `npm run lint` pass; no new dependency

After each step: update `AI_CONTEXT.md` (add a **U-03 · Bag** block: status, decisions, files, next) and one Log line.

Speak English, explain like a teacher, and give me 1–2 good vocabulary words with a short definition.
