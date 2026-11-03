// /api/ai-news — the "UPDATE NOW" job (and, in Phase 2, the daily cron).
// fetch official feeds → keep fresh, whitelisted, untold items → Gemini per NPC → validate → Firestore.
import { timingSafeEqual } from 'node:crypto';
import {
  NEWS_NPCS, NPC_COMPANY, bangkokDate,
  type AiNewsDoc, type NewsCompany, type NewsNpc, type NpcNews, type SourceStatus,
} from '../../src/game/content/aiNewsShape.js';
import { companyStatus, fetchAllFeeds, filterItems, normalizeUrl, type Fetcher } from './feeds.js';
import { composeNpc, DEFAULT_GEMINI_MODEL } from './compose.js';

export interface SeenEntry { u: string; d: string }
export interface NewsStore {
  readSeen(): Promise<SeenEntry[]>;
  write(doc: AiNewsDoc, seen: SeenEntry[]): Promise<void>;
}
export interface AiNewsDeps {
  env: Record<string, string | undefined>;
  /** Picks the store for this environment (production or test collections). */
  store: (production: boolean) => NewsStore;
  fetcher?: typeof fetch;
  now?: () => Date;
}
interface Req { method?: string; url?: string; query?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined> }
interface Res { statusCode: number; setHeader(k: string, v: string): void; end(body: string): void }

export const SEEN_LIMIT = 300;

function same(a: string, b: string | undefined): boolean {
  if (!b || !a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function header(req: Req, name: string): string {
  const v = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

function queryKey(req: Req): string {
  const q = req.query?.key;
  if (typeof q === 'string') return q;
  try { return new URL(req.url ?? '', 'http://x').searchParams.get('key') ?? ''; } catch { return ''; }
}

/** ?key= (or X-News-Key header) = NEWS_ADMIN_KEY, or Authorization: Bearer CRON_SECRET (Vercel cron). */
export function authorized(req: Req, env: AiNewsDeps['env']): boolean {
  const key = queryKey(req) || header(req, 'x-news-key');
  if (key && same(key, env.NEWS_ADMIN_KEY)) return true;
  const auth = header(req, 'authorization');
  return auth.startsWith('Bearer ') && same(auth.slice(7), env.CRON_SECRET);
}

function send(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function runAiNews(deps: AiNewsDeps) {
  const now = deps.now?.() ?? new Date();
  const today = bangkokDate(now);
  const production = deps.env.VERCEL_ENV === 'production';
  const store = deps.store(production);
  const fetcher = deps.fetcher ?? fetch;

  let seen: SeenEntry[] = [];
  let seenNote = '';
  try { seen = await store.readSeen(); } catch { seenNote = 'could not read seen list'; }
  // Told on an earlier day = skip. Told today = allowed, so pressing UPDATE NOW twice keeps today's news.
  const toldBefore = new Set(seen.filter((s) => s.d < today).map((s) => s.u));

  const fetched = await fetchAllFeeds(fetcher as unknown as Fetcher);
  const status = {} as Record<NewsCompany, SourceStatus>;
  const fresh = {} as Record<NewsCompany, ReturnType<typeof filterItems>>;
  for (const f of fetched) {
    fresh[f.company] = filterItems(f.items, now, toldBefore);
    status[f.company] = companyStatus(f, fresh[f.company].length);
  }

  const apiKey = deps.env.GEMINI_API_KEY;
  const gemini = apiKey ? { apiKey, model: deps.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, fetcher } : null;
  const composed = await Promise.all(NEWS_NPCS.map((npc) => composeNpc(npc, fresh[NPC_COMPANY[npc]] ?? [], gemini)));

  const npcs = {} as Record<NewsNpc, NpcNews>;
  const notes = {} as Record<NewsNpc, string>;
  const told: string[] = [];
  NEWS_NPCS.forEach((npc, i) => { npcs[npc] = composed[i].news; notes[npc] = composed[i].note; told.push(...composed[i].toldUrls); });

  const doc: AiNewsDoc = { date: today, generatedAt: now.toISOString(), npcs, status };
  const keep = new Map<string, SeenEntry>();
  for (const s of seen) keep.set(s.u, s);
  for (const u of told) { const k = normalizeUrl(u); keep.delete(k); keep.set(k, { u: k, d: today }); }
  const nextSeen = [...keep.values()].slice(-SEEN_LIMIT);

  let saved = true;
  let saveError = '';
  try { await store.write(doc, nextSeen); } catch (e) { saved = false; saveError = String((e as Error)?.message ?? e).slice(0, 120); }

  return {
    ok: saved,
    env: production ? 'production' : 'test',
    collection: production ? 'aiNews' : 'aiNewsTest',
    date: today,
    model: gemini?.model ?? null,
    saved,
    ...(saveError ? { saveError } : {}),
    ...(seenNote ? { seenNote } : {}),
    npcs: Object.fromEntries(NEWS_NPCS.map((npc) => [npc, { ...npcs[npc], note: notes[npc], fresh: (fresh[NPC_COMPANY[npc]] ?? []).length }])),
    status,
  };
}

export function createAiNewsHandler(deps: AiNewsDeps) {
  return async (req: Req, res: Res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { error: 'Use GET or POST.' });
    }
    if (!authorized(req, deps.env)) return send(res, 401, { error: 'Unauthorized' });
    try {
      const summary = await runAiNews(deps);
      return send(res, summary.ok ? 200 : 500, summary);
    } catch {
      return send(res, 500, { error: 'AI news update failed.' });
    }
  };
}
