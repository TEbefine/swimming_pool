// Official AI news feeds: fetch (with timeouts, one failure never stops the others) and parse.
// No XML library: RSS 2.0 / Atom are read with small, tolerant regexes. Tested with saved samples
// in tests/fixtures/ai-news/ (tests/ai-news.test.mjs).
import { isWhitelisted, type NewsCompany, type SourceStatus } from '../../src/game/content/aiNewsShape.js';

export interface FeedItem {
  company: NewsCompany;
  title: string;
  url: string;
  /** ISO time. */
  publishedAt: string;
  summary: string;
  feed: string;
}

type Parser = 'xml' | 'anthropic-html';
interface FeedSource { name: string; urls: string[]; parser: Parser }
interface CompanyFeeds { company: NewsCompany; feeds: FeedSource[]; /** Feeds tried one after another: the next only if the previous failed or was empty. */ chain?: FeedSource[] }

export const FEEDS: CompanyFeeds[] = [
  { company: 'google', feeds: [
    { name: 'blog.google', urls: ['https://www.blog.google/rss/'], parser: 'xml' },
    { name: 'gemini', urls: ['https://blog.google/products/gemini/rss/'], parser: 'xml' },
    { name: 'deepmind', urls: ['https://deepmind.google/blog/rss.xml'], parser: 'xml' },
    // Two known addresses for the Developers Blog feed; the second is tried if the first fails.
    { name: 'developers', urls: ['https://developers.googleblog.com/rss/', 'https://developers.googleblog.com/feeds/posts/default?alt=rss'], parser: 'xml' },
  ] },
  { company: 'openai', feeds: [
    { name: 'openai-news', urls: ['https://openai.com/news/rss.xml'], parser: 'xml' },
    { name: 'openai-release-notes', urls: ['https://openai.com/products/release-notes/rss.xml'], parser: 'xml' },
  ] },
  // Anthropic has no official RSS: community mirror first, then the official news page.
  { company: 'anthropic', feeds: [], chain: [
    { name: 'anthropic-rss (Olshansk)', urls: ['https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml'], parser: 'xml' },
    { name: 'anthropic.com/news', urls: ['https://www.anthropic.com/news'], parser: 'anthropic-html' },
  ] },
];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text content of a tag value: CDATA unwrapped, tags removed, entities decoded, spaces squashed. */
function clean(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Feeds often entity-encode their HTML: decode, strip tags, decode again.
  return decodeEntities(decodeEntities(unwrapped).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tag(block: string, names: string[]): string {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'));
    if (m && m[1].trim()) return m[1];
  }
  return '';
}

function atomLink(block: string): string {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const attr = (a: string, k: string) => a.match(new RegExp(`\\b${k}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? '';
  const alt = links.find((a) => attr(a, 'href') && (!attr(a, 'rel') || attr(a, 'rel') === 'alternate'));
  return alt ? decodeEntities(attr(alt, 'href')) : '';
}

function toIso(raw: string): string {
  const d = new Date(clean(raw));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** RSS 2.0 <item> or Atom <entry>. Items with no link or no date are dropped. */
export function parseFeed(xml: string, company: NewsCompany, feed: string): FeedItem[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const out: FeedItem[] = [];
  for (const b of blocks) {
    const title = clean(tag(b, ['title']));
    let url = clean(tag(b, ['link']));
    if (!/^https?:\/\//.test(url)) url = atomLink(b);
    if (!/^https?:\/\//.test(url)) {
      const guid = clean(tag(b, ['guid', 'id']));
      if (/^https?:\/\//.test(guid)) url = guid;
    }
    const publishedAt = toIso(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const summary = clean(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 400);
    if (title && url && publishedAt) out.push({ company, title, url: url.trim(), publishedAt, summary, feed });
  }
  return out;
}

const NEWS_CATEGORIES = new Set(['announcements', 'features', 'partnerships', 'product', 'policy', 'safeguards', 'security', 'research', 'societal-impacts', 'economic-research', 'interpretability', 'alignment', 'news']);

/** anthropic.com/news: article links that wrap a heading, with the nearest <time>. Dates are day-only (UTC midnight). */
export function parseAnthropicNewsHtml(html: string): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  const re = /<a\b[^>]*href="(\/news\/[a-z0-9-]+)"[^>]*>([\s\S]{0,800}?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const path = m[1];
    const slug = path.slice(6);
    if (seen.has(slug) || NEWS_CATEGORIES.has(slug)) continue;
    const heading = m[2].match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (!heading) continue;
    const title = clean(heading[1]);
    const at = m.index ?? 0;
    const after = html.slice(at, at + 2500).match(/<time\b[^>]*>([^<]+)<\/time>/i);
    const beforeAll = [...html.slice(Math.max(0, at - 1500), at).matchAll(/<time\b[^>]*>([^<]+)<\/time>/gi)];
    const raw = after?.[1] ?? beforeAll[beforeAll.length - 1]?.[1] ?? '';
    const d = new Date(clean(raw) + ' UTC');
    if (!title || Number.isNaN(d.getTime())) continue;
    seen.add(slug);
    out.push({ company: 'anthropic', title, url: 'https://www.anthropic.com' + path, publishedAt: d.toISOString(), summary: '', feed: 'anthropic.com/news' });
  }
  return out;
}

export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const MAX_BYTES = 3_000_000;
async function fetchText(fetcher: Fetcher, url: string, timeoutMs: number): Promise<string> {
  const res = await fetcher(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'LumenBayNewsBot/1.0 (+https://swimming-pool-five.vercel.app)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

function why(e: unknown): string {
  const err = e as { name?: string; message?: string };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout';
  return String(err?.message ?? e).slice(0, 80);
}

interface FeedResult { name: string; items: FeedItem[]; error?: string }

async function readFeed(fetcher: Fetcher, company: NewsCompany, src: FeedSource, timeoutMs: number): Promise<FeedResult> {
  let lastError = '';
  for (const url of src.urls) {
    try {
      const body = await fetchText(fetcher, url, timeoutMs);
      const items = src.parser === 'xml' ? parseFeed(body, company, src.name) : parseAnthropicNewsHtml(body);
      if (items.length === 0 && src.parser === 'xml' && !/<(rss|feed|rdf:RDF)\b/i.test(body)) throw new Error('not a feed');
      return { name: src.name, items };
    } catch (e) { lastError = why(e); }
  }
  return { name: src.name, items: [], error: lastError };
}

export interface CompanyFetch { company: NewsCompany; items: FeedItem[]; feeds: FeedResult[] }

/** All companies and all feeds in parallel. Never throws. */
export async function fetchAllFeeds(fetcher: Fetcher, timeoutMs = 7000): Promise<CompanyFetch[]> {
  return Promise.all(FEEDS.map(async ({ company, feeds, chain }) => {
    const results = await Promise.all(feeds.map((f) => readFeed(fetcher, company, f, timeoutMs)));
    for (const src of chain ?? []) {
      const r = await readFeed(fetcher, company, src, timeoutMs);
      results.push(r);
      if (!r.error && r.items.length > 0) break;
    }
    return { company, items: results.flatMap((r) => r.items), feeds: results };
  }));
}

export const FRESH_MS = 48 * 3600_000;
const SKEW_MS = 2 * 3600_000;

/** Whitelisted link, published in the last 48 h, not already told before today. Deduped by URL, newest first. */
export function filterItems(items: FeedItem[], now: Date, toldBeforeToday: Set<string>): FeedItem[] {
  const byUrl = new Map<string, FeedItem>();
  for (const it of items) {
    const t = Date.parse(it.publishedAt);
    if (!isWhitelisted(it.url)) continue;
    if (!(t >= now.getTime() - FRESH_MS && t <= now.getTime() + SKEW_MS)) continue;
    if (toldBeforeToday.has(normalizeUrl(it.url))) continue;
    const key = normalizeUrl(it.url);
    if (!byUrl.has(key)) byUrl.set(key, it);
  }
  return [...byUrl.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/** Same article = same URL without query/hash/trailing slash/www. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch { return url; }
}

export function companyStatus(f: CompanyFetch, fresh: number): SourceStatus {
  const failed = f.feeds.filter((r) => r.error);
  const okFeeds = f.feeds.filter((r) => !r.error);
  const fails = failed.map((r) => `${r.name}: ${r.error}`).join('; ');
  if (okFeeds.length === 0) return { state: 'error', message: `All feeds failed (${fails})` };
  const base = `${fresh} new item${fresh === 1 ? '' : 's'} from ${okFeeds.map((r) => r.name).join(', ')}`;
  return { state: fresh > 0 ? 'ok' : 'empty', message: failed.length ? `${base}. Failed: ${fails}` : base };
}
