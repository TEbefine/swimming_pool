# Default game font — Pool Pixel Default 0.4

Both Thai and English use the same self-hosted pixel font across the UI, menus, dialogue, inputs, and canvas labels. This follows Teera’s Pixelify Sans reference, with stable square strokes and synthetic bold disabled.

## Custom letterforms

- English E/e/T/K retain the requested straight-arm, open-counter revisions.
- พ, ฟ and ฬ share the compact five-cell body of ผ/ฝ, with straight side stems and the same central crossing. Their distinct heads, raised stem and crown remain recognizable. ผ and ฝ are unchanged.
- ข retains its reduced head.
- All 44 Thai consonants ก–ฮ, plus ฤ/ฦ, Thai vowels, tone marks, digits and punctuation are included (661 encoded characters total).

## Integration

`src/index.css` loads `public/fonts/PoolPixelDefault-Regular.woff2?v=0.4` and sets the shared font tokens and input defaults. HTML preloading, dialogue wrapping measurements and canvas labels use the same face. The versioned URL bypasses old font cache entries without clearing saved player data or cached artwork.

Canvas labels use measured glyph bounds and at least 3 px of vertical clearance for stacked Thai marks. Dialogue keeps its existing 18 px size, zero tracking and 29–30 px line height. The installable TTF is also included in `public/fonts/`.

This change is based on main at 9b1c3cc and preserves its current menu, bag, fishing and world updates. No identity-preview branch changes are included.

## Validation

- Font coverage, Thai shaping and TTF/WOFF2 mapping checks pass. พ/ฟ/ฬ keep their revised base glyphs with above/below vowels and tone marks.
- Production build passes TypeScript and Vite.
- Chrome desktop 1200×900 and phone 390×844 load Pool Pixel Default, with no page errors or horizontal page overflow.
- Dialogue fits its content area; name-tag marks have at least 3 px clearance. The current field menu has been visually checked at phone size.
- Physical iPhone 13 review remains pending.

## Credits

English derives from Pixelify Sans Regular: Copyright 2021 The Pixelify Sans Project Authors, https://github.com/eifetx/Pixelify-Sans.

Thai derives from SyDi Ume 72x12: Copyright (c) 2021 SyyDai, Saamkhaih Kyakya. Original reserved name SyDi Ume 72x12. https://github.com/MemoThai/aseprite-thai-font.

Both sources and the renamed derivative use SIL OFL 1.1. Retain `PixelifySans-OFL.txt` and `SyDiUme-OFL.txt` with redistributed fonts.
