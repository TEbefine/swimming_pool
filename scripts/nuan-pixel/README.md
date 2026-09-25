# Nuan Pixel (นวล Pixel) v2 — source

Thai + Latin pixel font for Pixel Poolside. Every glyph is ASCII art you can edit.

v2 rebuilds every Thai letter on real looped Thai structure. Each letter's skeleton was traced from
Noto Sans Thai Looped (SIL OFL 1.1, see `OFL-reference-NotoSansThaiLooped.txt`) and then
cleaned into 1px pixel strokes by hand. Because the shapes come from an OFL font, Nuan Pixel
is released under the SIL Open Font License 1.1 too.

- `glyphs.py` — Thai consonants, vowels, tone marks, digits (`#` = pixel, `top` = y of first row, baseline y=0)
- `latin.py` — A–Z, a–z, 0–9, punctuation, ♥ ★ ♪ ▼ ▲ ▶ ◀ (auto-scaled to caps 10 / x-height 7)
- `soften.py` — rounds each 3×3 loop head (removes its outer corner)
- `build.py` — pixels → outlines + Thai mark positioning (GPOS mark/mkmk, GSUB for ญ ฐ tails)
- `tracer.py` — the reference tracer used to get real Thai structure onto the grid
- `hbrender.py` — preview: shapes text with HarfBuzz and draws the exact pixels

## Grid
- em = 20px. Thai body y0–y9 (10px), Latin caps 10px, x-height 7px
- 2px gap between Thai letters, 1px between Latin letters
- upper vowels start at y11; tone marks sit at y11 alone, or stack above the vowel
- lower vowels start at y-2; ป ฝ ฟ ฬ push upper marks 2px left

## Rebuild
```
pip install fonttools brotli uharfbuzz pillow scikit-image
python3 build.py          # -> out/NuanPixel-Regular.ttf/.woff2
python3 build.py --bold   # -> out/NuanPixel-Bold.ttf/.woff2
python3 hbrender.py out/NuanPixel-Regular.ttf preview.png "สวัสดีครับ|Pixel Poolside" 6
```
Then copy the `.woff2` files into `public/fonts/`.
