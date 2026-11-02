// AI News NPCs (game side): read today's doc ONCE per session, then build Sir Ledger / Nova / Clara's
// "AI NEWS" talk from it. No Firebase SDK and no polling: one small REST GET of a public-read doc,
// so low-end phones stay fast. Missing, failed or not-today doc = quiet-day flow (never old news).
import {
  NEWS_NPCS, bangkokDate, fitsPage, isWhitelisted, shortDate,
  type NewsNpc, type NpcNews,
} from './aiNewsShape';
import type { DialogChoice, DialogNode, DialogScript } from './dialogues';

/** Production reads aiNews, previews and `npm run dev` read aiNewsTest (set in vite.config.ts). */
const ENV = typeof import.meta.env !== 'undefined' ? import.meta.env : null;
export const AI_NEWS_COLLECTION: string = ENV?.AI_NEWS_COLLECTION ?? 'aiNewsTest';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/lumen-bay/databases/(default)/documents/${AI_NEWS_COLLECTION}/today`;

type FsValue = {
  stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number; nullValue?: null;
  timestampValue?: string; arrayValue?: { values?: FsValue[] }; mapValue?: { fields?: Record<string, FsValue> };
};

/** Firestore REST typed value → plain JSON. */
export function fromFirestore(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(fromFirestore);
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromFirestore(x)]));
  return undefined;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const pages = (v: unknown, max: number) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []);

/** Keep only well-formed news; anything odd becomes null (= quiet day). */
export function cleanNpcNews(raw: unknown): NpcNews | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.hasNews !== true) return null;
  const src = (r.source ?? {}) as Record<string, unknown>;
  const url = str(src.url);
  const hook = str(r.hook);
  const more = pages(r.more, 2);
  const why = pages(r.why, 2);
  if (!hook || !more.length || !why.length || !isWhitelisted(url)) return null;
  const mini = str(r.mini);
  return {
    hasNews: true, hook, more, why, ...(mini && fitsPage(mini) ? { mini } : {}),
    source: { url, domain: str(src.domain) || new URL(url).hostname.replace(/^www\./, ''), title: str(src.title), publishedAt: str(src.publishedAt) },
    usedTemplate: r.usedTemplate === true,
  };
}

/** Today's lines per NPC, or empty when the doc is missing / not today. */
export function parseNewsDoc(doc: unknown, now: Date = new Date()): Partial<Record<NewsNpc, NpcNews>> {
  if (!doc || typeof doc !== 'object') return {};
  const d = doc as Record<string, unknown>;
  if (d.date !== bangkokDate(now)) return {};
  const npcs = (d.npcs ?? {}) as Record<string, unknown>;
  const out: Partial<Record<NewsNpc, NpcNews>> = {};
  for (const npc of NEWS_NPCS) {
    const n = cleanNpcNews(npcs[npc]);
    if (n) out[npc] = n;
  }
  return out;
}

let cache: { date: string; news: Partial<Record<NewsNpc, NpcNews>> } | null = null;
let loading: Promise<void> | null = null;

/** Called when the town loads. Reads the doc at most once per session; never throws. */
export function loadAiNewsOnce(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch(DOC_URL, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json() as { fields?: Record<string, FsValue> };
      const doc = fromFirestore({ mapValue: { fields: json.fields ?? {} } });
      cache = { date: bangkokDate(), news: parseNewsDoc(doc) };
    } catch {
      cache = { date: bangkokDate(), news: {} };
    }
  })();
  return loading;
}

/** Today's news for this NPC, or null (quiet day). Also null after Bangkok midnight passes mid-session. */
export function newsFor(npc: string, now: Date = new Date()): NpcNews | null {
  if (!cache || cache.date !== bangkokDate(now)) return null;
  return cache.news[npc as NewsNpc] ?? null;
}

/** Test hook. */
export function setAiNewsCache(news: Partial<Record<NewsNpc, NpcNews>> | null, now: Date = new Date()): void {
  cache = news ? { date: bangkokDate(now), news } : null;
  loading = news ? Promise.resolve() : null;
}

export const NEWS_MENU: DialogChoice[] = [
  { label: 'TELL ME MORE', next: 'news_more' },
  { label: 'WHY CARE?', next: 'news_why' },
  { label: 'SOURCE', next: 'news_source' },
  { label: 'BYE', next: 'bye' },
];

/** Same script on a quiet day; on a news day the "news" node becomes hook + TELL ME MORE / WHY CARE? / SOURCE / BYE. */
export function withAiNews(npcId: string, script: DialogScript, now: Date = new Date()): DialogScript {
  if (!(NEWS_NPCS as readonly string[]).includes(npcId)) return script;
  const n = newsFor(npcId, now);
  if (!n || !n.source) return script;
  const date = shortDate(n.source.publishedAt);
  const nodes: Record<string, DialogNode> = {
    ...script.nodes,
    news: { lines: [{ text: n.hook, pose: 'talk', face: 'smile' }], choices: NEWS_MENU },
    news_more: {
      lines: [...n.more, ...(n.mini ? [n.mini] : [])].map((text) => ({ text, pose: 'talk', face: 'explain' as const })),
      choices: NEWS_MENU,
    },
    news_why: { lines: n.why.map((text) => ({ text, pose: 'talk', face: 'explain' as const })), choices: NEWS_MENU },
    news_source: {
      lines: [{ text: `From ${n.source.domain}${date ? ` · ${date}` : ''}`, pose: 'idle', face: 'neutral' }],
      choices: [
        { label: 'OPEN LINK', next: 'bye', href: n.source.url },
        { label: 'TELL ME MORE', next: 'news_more' },
        { label: 'BYE', next: 'bye' },
      ],
    },
  };
  return { ...script, nodes };
}
