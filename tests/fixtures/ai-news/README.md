# AI News feed samples

- `anthropic-olshansk.xml`, `anthropic-news.html`: REAL copies fetched 2026-11-02 (trimmed: first 12 items;
  scripts/styles/svg/image attributes removed from the HTML).
- `google-blog.xml`, `google-developers-atom.xml`, `openai-news.xml`: SYNTHETIC samples written in the
  standard RSS 2.0 / Atom shapes. The build sandbox could not reach blog.google, deepmind.google,
  developers.googleblog.com or openai.com, so these are not copies of the live feeds. Check the parsers
  against the live feeds once deployed (the admin page shows ✅/❌ per source).
