# Handheld shell (mobile Game Boy frame)

**Status: v1 FINISHED (2026-10-01).** Teera: "I love it". This is the first Game Boy–style controller. Treat these as settled; change only when Teera asks.
Code: `src/components/GameBoyMobile.tsx` + the `.gameboy-*` / `--gb-*` rules in `src/index.css`.

## Decisions (Teera)
- **Follows the phone's light/dark mode.** All shell colours are `--gb-*` tokens on `.gameboy-body`; light = the classic grey, dark = a matte "black edition" (`@media (prefers-color-scheme: dark)`). `index.html` has two `theme-color` metas (light #d4d4cf / dark #101114) so the iPhone status bar matches.
- **Screen frame (bezel):** side padding 24px (Teera asked for a wider grey frame). Top and bottom bands are fixed-height rows. Top band (24px): the room name is exactly centred across and up/down; an invisible twin of the power LED on the left balances it. Bottom band (32px): the logo is centred with even space. Corners `border-radius: 10px 10px 44px 10px`: one soft curve bottom-right (the old clip-path diagonal cut was "ugly").
- **Screen:** `border-radius: 4px 4px 22px 4px`, a small cute curve bottom-right that echoes the frame.
- **Logo:** "Nintendo GAME BOY™" printed on the grey frame under the screen, Game Boy Color style (`--gb-bezel-ink` grey + `--gb-bezel-logo` light blue). Teera tried "Lumen Bay" and didn't like it. Keep Nintendo for now; a new name is a later conversation.
- **SELECT / START:** two minimal round keys (18px circle, 40×32 tap area), level, centred, labels underneath. Not the angled pills.
- **D-pad:** one-piece SVG cross (rounded tips, side wall for thickness, centre dimple). Arrows = small rounded triangles near each arm's outer edge with a little gap. D-pad and button cluster sit the same distance (14px) from each edge.
- **Press feedback = arrow colour only.** The pressed arrow turns brighter grey (**no yellow/amber**). Teera: tilt/sink effects are "not worth it" because the finger covers the control and nobody sees them. Don't add press animations under the finger.
- **No zoom on hold:** arrows are drawn shapes, not text glyphs (text triggered the iOS magnifier). Pinch (`gesturestart`) and double-tap zoom are blocked on the shell.

## Known gotcha
`* { margin: 0; padding: 0 }` in `index.css` is unlayered, so it beats every Tailwind padding/margin class (`px-*`, `pt-*`, `mt-*`…). Use inline styles, `gap`, or custom CSS for spacing until the reset is moved into `@layer base` (that fix needs a visual check of menus/popups/dialog).
