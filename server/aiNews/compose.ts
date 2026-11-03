// One Gemini call per NPC turns today's official items into short in-character lines.
// The model's output is never trusted: every field is checked in code, and any failure falls
// back to a plain template built from the headline.
import {
  COMPANY_NAME, NPC_COMPANY, domainOf, fitsPage, toPages,
  type NewsNpc, type NpcNews,
} from '../../src/game/content/aiNewsShape.js';
import { normalizeUrl, type FeedItem } from './feeds.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const PERSONA: Record<NewsNpc, string> = {
  tycoon: 'Sir Ledger: a warm, rich grandpa. He calls the player "young friend" and loves gold, coins, treasure and interest metaphors. A big fan of Google and Gemini.',
  nova: 'Nova: cool, casual, says a lot with few words. Dry and confident. A big fan of OpenAI and ChatGPT.',
  clara: 'Clara: gentle and bookish. She likes to explain why something matters. A big fan of Anthropic and Claude.',
};

const FALLBACK_HOOK: Record<NewsNpc, string> = {
  tycoon: 'Hot news from Google, young friend!',
  nova: 'OpenAI dropped something new.',
  clara: 'Anthropic shared something new.',
};

const FALLBACK_WHY: Record<NewsNpc, string> = {
  tycoon: 'Read the source, young friend. Knowledge pays!',
  nova: 'Check the source. Try it yourself.',
  clara: 'Open the source and read a little yourself.',
};

/** Words that mark company business, not something a learner can use. */
const SKIP = /\b(hir(e|es|ing)|joins?|appoint\w*|board|office|earnings|revenue|funding|invest\w*|acquir\w*|lawsuit|court|policy|policies|elections?|midterms?|government|partners?(hip)?s?|customers?|case stud\w*|evaluators?|trust|commitment|fund|paper|research)\b/i;
const RANK: Array<[RegExp, number]> = [
  [/\b(model|gemini \d|gpt-?\d|claude \w+ \d|sonnet|opus|haiku|o\d|flash|pro|introduc\w+|launch\w*|releas\w+)\b/i, 4],
  [/\b(free|promo\w*|offer|discount|students?|trial)\b/i, 3],
  [/\b(new|now|try|feature|update|available|app|tool|mode)\b/i, 2],
];
function score(it: FeedItem): number {
  const text = `${it.title} ${it.summary}`;
  if (SKIP.test(it.title)) return 0;
  for (const [re, s] of RANK) if (re.test(text)) return s;
  return 1;
}

/** Headline-only lines (no Gemini). Returns null if nothing is worth telling. */
export function templateNews(npc: NewsNpc, items: FeedItem[]): NpcNews | null {
  const best = items.map((it) => ({ it, s: score(it) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Date.parse(b.it.publishedAt) - Date.parse(a.it.publishedAt))[0]?.it;
  if (!best) return null;
  return {
    hasNews: true,
    hook: FALLBACK_HOOK[npc],
    more: toPages(best.title, 2),
    why: [FALLBACK_WHY[npc]],
    source: sourceOf(best),
    usedTemplate: true,
  };
}

export function quietNews(): NpcNews {
  return { hasNews: false, hook: '', more: [], why: [], source: null, usedTemplate: false };
}

function sourceOf(it: FeedItem) {
  return { url: it.url, domain: domainOf(it.url), title: it.title.slice(0, 200), publishedAt: it.publishedAt };
}

export interface GeminiOut { hasNews: boolean; url: string; hook: string; more: string[]; why: string[]; mini: string; miniUrl: string }

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hasNews: { type: 'BOOLEAN' },
    url: { type: 'STRING', description: 'Exact url of the chosen item, or "" if hasNews is false.' },
    hook: { type: 'STRING', description: 'One page, max 48 characters.' },
    more: { type: 'ARRAY', items: { type: 'STRING' }, description: '1 or 2 pages, each max 48 characters.' },
    why: { type: 'ARRAY', items: { type: 'STRING' }, description: '1 or 2 pages, each max 48 characters.' },
    mini: { type: 'STRING', description: 'Optional extra page starting "Oh, and", or "".' },
    miniUrl: { type: 'STRING', description: 'Exact url of the item the mini is about, or "".' },
  },
  required: ['hasNews', 'url', 'hook', 'more', 'why', 'mini', 'miniUrl'],
  propertyOrdering: ['hasNews', 'url', 'hook', 'more', 'why', 'mini', 'miniUrl'],
};

export function buildPrompt(npc: NewsNpc, items: FeedItem[]): string {
  const company = COMPANY_NAME[NPC_COMPANY[npc]];
  const list = items.slice(0, 12).map((it, i) => [
    `ITEM ${i + 1}`,
    `url: ${it.url}`,
    `date: ${it.publishedAt}`,
    `title: ${it.title}`,
    it.summary ? `summary: ${it.summary.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
  return `You write talk-box lines for a town character in a cozy pixel-art game for people learning about AI and English.

CHARACTER: ${PERSONA[npc]}
They talk about ${company} as a FAN, never as the company. Say "${company} just launched...", never "We launched..." or "our model".

RULES
1. Use ONLY facts written in the ITEMS below. Never add names, numbers, dates, prices, features or claims that are not in them. If unsure, say less.
2. Pick the ONE most important item for a learner. Importance: new model > promo or free offer > new feature you can try > fun extra.
3. Skip company business, funding, partnerships, customers, hiring, people joining, offices, policy, safety reports, legal news and deep research papers.
4. If no item is important enough, return hasNews false, url "", hook "", more [], why [], mini "", miniUrl "".
5. Size: the talk box shows 24 letters per row and 2 rows per page. EVERY string below is one page of AT MOST 48 characters, spaces included.
   - hook: 1 page that makes the player curious.
   - more: 1 or 2 pages about what it is. If you write a mini, more must be exactly 1 page.
   - mini: optional. One page starting "Oh, and" about a DIFFERENT important item, with its url in miniUrl. Otherwise "" and "".
   - why: 1 or 2 pages giving ONE practical way a learner can use it.
   - url: the exact url of the chosen item, copied from the list.
6. Stay in character. Simple, friendly English. No emojis, no hashtags, no links in the text.
7. You may wrap at most one key word per page in *asterisks* to highlight it.

ITEMS (from official ${company} sources, last 48 hours)
${list}`;
}

/** Company voice ("We launched…", "our model") is not allowed: they are fans. */
const FIRST_PERSON = /\b(we|we've|we're)\s+(just\s+|have\s+)?(launch\w*|releas\w*|announc\w*|buil\w*|ship\w*|made|introduc\w*)\b|\bour (new |latest )?(model|models|product|team|company|app|research)\b/i;

/** Strict check of Gemini's JSON. Returns null if anything is off. */
export function validateOutput(out: unknown, items: FeedItem[]): NpcNews | 'quiet' | null {
  if (!out || typeof out !== 'object') return null;
  const o = out as Partial<GeminiOut>;
  if (o.hasNews === false) return 'quiet';
  if (o.hasNews !== true) return null;
  const byUrl = new Map(items.map((it) => [normalizeUrl(it.url), it]));
  // Same article = same normalized url (www, trailing slash, query may differ); the source keeps the item's real url.
  const chosen = typeof o.url === 'string' ? byUrl.get(normalizeUrl(o.url.trim())) : undefined;
  if (!chosen) return null;
  const pages = (v: unknown, min: number, max: number) =>
    Array.isArray(v) && v.length >= min && v.length <= max && v.every((p) => typeof p === 'string' && fitsPage(p)) ? (v as string[]).map((p) => p.trim()) : null;
  const hook = typeof o.hook === 'string' && fitsPage(o.hook) ? o.hook.trim() : null;
  const why = pages(o.why, 1, 2);
  let more = pages(o.more, 1, 2);
  let mini: string | undefined;
  if (typeof o.mini === 'string' && o.mini.trim()) {
    const m = o.mini.trim();
    const other = typeof o.miniUrl === 'string' ? byUrl.get(normalizeUrl(o.miniUrl)) : undefined;
    if (fitsPage(m) && /^oh,? and\b/i.test(m) && other && other !== chosen) {
      mini = m;
      if (more && more.length > 1) more = null; // mini must fit inside 2 pages
    }
    // A broken mini is dropped; it never fails the whole answer.
  }
  if (!hook || !more || !why) return null;
  const all = [hook, ...more, ...why, ...(mini ? [mini] : [])];
  if (all.some((t) => FIRST_PERSON.test(t) || /https?:\/\//i.test(t))) return null;
  return { hasNews: true, hook, more, why, ...(mini ? { mini } : {}), source: sourceOf(chosen), usedTemplate: false };
}

export interface GeminiConfig { apiKey: string; model: string; fetcher: typeof fetch; timeoutMs?: number }

export async function callGemini(cfg: GeminiConfig, prompt: string): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const res = await cfg.fetcher(url, {
    method: 'POST',
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA,
        // Gemini 3 counts thinking tokens inside maxOutputTokens: keep thinking low so the JSON isn't cut.
        thinkingConfig: { thinkingLevel: 'low' } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json() as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  const first = data.candidates?.[0];
  // Anything but a normal stop (MAX_TOKENS, SAFETY, …) means the JSON may be cut: the note shows the reason.
  const finish = first?.finishReason ?? (data.promptFeedback?.blockReason ? `BLOCKED_${data.promptFeedback.blockReason}` : 'NO_CANDIDATE');
  if (finish !== 'STOP') throw new Error(finish);
  const text = first?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(text);
}

export interface ComposeResult { news: NpcNews; note: string; toldUrls: string[] }

/** Lines for one NPC. Never throws. */
export async function composeNpc(npc: NewsNpc, items: FeedItem[], gemini: GeminiConfig | null): Promise<ComposeResult> {
  if (items.length === 0) return { news: quietNews(), note: 'no new items', toldUrls: [] };
  const fallback = (note: string): ComposeResult => {
    const t = templateNews(npc, items);
    return t ? { news: t, note: `template (${note})`, toldUrls: [t.source!.url] } : { news: quietNews(), note: `quiet (${note}; nothing worth telling)`, toldUrls: [] };
  };
  if (!gemini) return fallback('GEMINI_API_KEY missing');
  let raw: unknown;
  try { raw = await callGemini(gemini, buildPrompt(npc, items)); } catch (e) {
    const err = e as { name?: string; message?: string };
    return fallback(err?.name === 'TimeoutError' ? 'Gemini timeout' : err?.name === 'SyntaxError' ? 'bad JSON' : String(err?.message ?? 'Gemini error').slice(0, 60));
  }
  const v = validateOutput(raw, items);
  if (v === 'quiet') return { news: quietNews(), note: 'Gemini: nothing important', toldUrls: [] };
  if (!v) return fallback('Gemini output failed checks');
  const told = [v.source!.url];
  const miniUrl = (raw as GeminiOut).miniUrl;
  if (v.mini && typeof miniUrl === 'string') told.push(miniUrl);
  return { news: v, note: 'Gemini', toldUrls: told };
}
