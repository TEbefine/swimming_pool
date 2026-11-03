// AI News NPCs: the shape of the daily news doc, shared by the game (browser) and /api/ai-news (server).
// No imports on purpose, so both sides can load it. Spec: docs/tech/ai-news-npcs-spec.md

export const NEWS_NPCS = ['tycoon', 'nova', 'clara'] as const;
export type NewsNpc = typeof NEWS_NPCS[number];
export type NewsCompany = 'google' | 'openai' | 'anthropic';
export const NPC_COMPANY: Record<NewsNpc, NewsCompany> = { tycoon: 'google', nova: 'openai', clara: 'anthropic' };
export const COMPANY_NAME: Record<NewsCompany, string> = { google: 'Google', openai: 'OpenAI', anthropic: 'Anthropic' };

export interface NewsSource { url: string; domain: string; title: string; publishedAt: string }
export interface NpcNews {
  hasNews: boolean;
  /** 1 page. */
  hook: string;
  /** 1–2 pages (with mini: 1 page + mini). */
  more: string[];
  /** 1–2 pages. */
  why: string[];
  /** Optional last page of TELL ME MORE, starts "Oh, and". */
  mini?: string;
  source: NewsSource | null;
  /** true = Gemini failed, lines were built from the headline. */
  usedTemplate: boolean;
}
export interface SourceStatus { state: 'ok' | 'empty' | 'error'; message: string }
export interface AiNewsDoc {
  /** Bangkok date YYYY-MM-DD. */
  date: string;
  generatedAt: string;
  npcs: Record<NewsNpc, NpcNews>;
  status: Record<NewsCompany, SourceStatus>;
}

/** Talk box: about 24 letters per row, 2 rows per page. */
export const ROW_CHARS = 24;
export const PAGE_ROWS = 2;
export const PAGE_CHARS = ROW_CHARS * PAGE_ROWS;

export const NEWS_DOMAINS = ['blog.google', 'deepmind.google', 'developers.googleblog.com', 'firebase.google.com', 'openai.com', 'anthropic.com', 'claude.com'];

/** https link on a whitelisted official domain (or its subdomain). */
export function isWhitelisted(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return NEWS_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

export function domainOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/** Rows the text needs with greedy word wrap (`*` highlight marks don't count). */
export function rowsNeeded(text: string): number {
  const words = text.replace(/\*/g, '').trim().split(/\s+/).filter(Boolean);
  let rows = 0;
  let len = ROW_CHARS + 1; // forces a new row for the first word
  for (const w of words) {
    if (len + 1 + w.length <= ROW_CHARS) { len += 1 + w.length; continue; }
    rows += Math.ceil(w.length / ROW_CHARS);
    len = w.length % ROW_CHARS || ROW_CHARS;
  }
  return rows;
}

/** One talk-box page (the spec limit): non-empty, ≤48 chars, balanced `*` marks. Used to check Gemini. */
export function fitsPage(text: string): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t || t.replace(/\*/g, '').length > PAGE_CHARS) return false;
  return (t.match(/\*/g) ?? []).length % 2 === 0;
}

/** Stricter: also wraps into ≤2 rows of 24 letters. Used when WE cut text into pages (template fallback). */
export function fitsRows(text: string): boolean {
  return fitsPage(text) && rowsNeeded(text) <= PAGE_ROWS;
}

/** Pack text into at most `maxPages` pages; cut with "…" if it doesn't fit. */
export function toPages(text: string, maxPages: number): string[] {
  const words = text.replace(/\*/g, '').trim().split(/\s+/).filter(Boolean)
    .flatMap((w) => (w.length > ROW_CHARS ? w.match(new RegExp(`.{1,${ROW_CHARS}}`, 'g')) ?? [] : [w]));
  const pages: string[] = [];
  let cur = '';
  let cut = false;
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (fitsRows(next)) { cur = next; continue; }
    pages.push(cur);
    cur = w;
    if (pages.length === maxPages) { cut = true; break; }
  }
  if (!cut && cur) pages.push(cur);
  if (cut) {
    // Something was cut: end the last page with "…"
    let last = pages[pages.length - 1];
    while (last.includes(' ') && !fitsRows(last + '…')) last = last.replace(/\s+\S+$/, '');
    pages[pages.length - 1] = fitsRows(last + '…') ? last + '…' : last;
  }
  return pages;
}

/** Bangkok calendar date, YYYY-MM-DD. */
export function bangkokDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

/** "Nov 3" (Bangkok time). */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', month: 'short', day: 'numeric' }).format(d);
}
