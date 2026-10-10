// ID-01 (c) — the game side of Player ID saves. Talks only to POST /api/items (server/saves/).
// - attachPlayer(address): load the server save → Fish Book + Dalbit story switch to this Player ID.
// - recordPendingCatches(): a Fishing Guide (Nami / Kai) writes this device's pending catches.
// - The Dalbit story saves itself when a day ends (step "d<N>_end").
// Guests (no Player ID, ?test=... pages) never call the server; their saves stay in this browser.
import { useSyncExternalStore } from 'react';
import { attachFishBook, getPendingCatches, pendingOperation, settlePendingCatches } from '../fishing/freeFish';
import type { FishBookEntry, PendingCatch } from '../fishing/freeFish';
import { attachStory, getDraftMeta, getStory, setDraftMeta, storyForSave, subscribeStory } from '../story/storyStore';
import type { StoryState } from '../story/storyStore';

interface StorySave { day: number; step: string; revision: number; savedAt: number; state: StoryState }
interface ServerView {
  revision: number;
  fishBook: Record<string, FishBookEntry & { last?: number }>;
  fishTotal: number;
  lastCatchAt: number | null;
  story: { dalbit: StorySave | null };
  result?: { recorded?: number; newKinds?: string[]; rejected?: { index: number; reason: string }[] };
  replayed?: boolean;
}
export type CloudStatus = 'guest' | 'loading' | 'ready' | 'offline';
export type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

class SaveRequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const IS_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
const CHUNK = 40; // = LIMITS.catchesPerRequest on the server
const MAX_AGE_MS = 7 * 24 * 3600_000;
const MIN_GAP_MS = 3_000; // = LIMITS.minCatchGapMs

let address: string | null = null;
let status: CloudStatus = 'guest';
let storyStatus: StorySaveStatus = 'idle';
let lastCatchAt: number | null = null;
let attachTicket = 0;
const listeners = new Set<() => void>();
let snapshot: { address: string | null; status: CloudStatus; storyStatus: StorySaveStatus } = { address, status, storyStatus };
function emit() {
  snapshot = { address, status, storyStatus };
  listeners.forEach((l) => l());
}
export function useCloud() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot, () => snapshot);
}
export function getCloudAddress() { return address; }

// ---- transport ---------------------------------------------------------------------------------
async function idToken(): Promise<string> {
  const { firebaseAuth } = await import('../../identity/firebaseAuth');
  const user = await firebaseAuth().current();
  if (!user || user.uid !== address) throw new SaveRequestError(401, 'Please unlock your Player ID to save.');
  return user.idToken;
}

async function call(body: Record<string, unknown>): Promise<ServerView> {
  const token = await idToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch('/api/items', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null) as (ServerView & { error?: string }) | null;
    if (!res.ok || !data) throw new SaveRequestError(res.status, data?.error ?? 'Saving is unavailable right now.');
    return data;
  } catch (err) {
    if (err instanceof SaveRequestError) throw err;
    throw new SaveRequestError(0, controller.signal.aborted ? 'Saving timed out.' : 'Could not reach the save server.');
  } finally { clearTimeout(timer); }
}

function newOperationId(): string {
  return `op-${crypto.randomUUID()}`;
}

function applyView(view: ServerView) {
  lastCatchAt = view.lastCatchAt;
  return { entries: view.fishBook, total: view.fishTotal };
}

// ---- attach / detach -----------------------------------------------------------------------------
/** Called by the App whenever the verified Player ID changes (null = guest / signed out). */
export async function attachPlayer(next: string | null): Promise<void> {
  if (IS_TEST || next === address) return;
  const ticket = ++attachTicket;
  address = next;
  if (!next) {
    status = 'guest'; storyStatus = 'idle'; lastCatchAt = null;
    attachFishBook(null);
    attachStory(null, null);
    emit();
    return;
  }
  status = 'loading'; storyStatus = 'idle';
  emit();
  try {
    const view = await call({ op: 'load' });
    if (ticket !== attachTicket) return;
    attachFishBook(next, applyView(view));
    attachStory(next, view.story.dalbit);
    status = 'ready';
  } catch {
    if (ticket !== attachTicket) return;
    // Offline: play on with this device's draft and pending catches; they are sent later.
    attachFishBook(next);
    attachStory(next, null);
    status = 'offline';
  }
  emit();
  void maybeSaveStoryDay();
}

// ---- Fish Book: the Fishing Guide records pending catches -----------------------------------------
export interface RecordResult { recorded: number; newKinds: string[]; dropped: number; error?: string }

export async function recordPendingCatches(): Promise<RecordResult> {
  const out: RecordResult = { recorded: 0, newKinds: [], dropped: 0 };
  const who = address;
  if (!who) return out;
  if (status === 'offline') {
    try {
      const view = await call({ op: 'load' });
      if (who !== address) return out;
      settlePendingCatches([], applyView(view), who);
      status = 'ready'; emit();
    } catch (err) {
      return { ...out, error: err instanceof Error ? err.message : 'Saving is unavailable right now.' };
    }
  }
  const now = Date.now();
  let list = getPendingCatches();
  // The server refuses catches older than a week or not after the newest one it already has (e.g.
  // recorded first on another device). Drop those here instead of sending them.
  const stale = list.filter((c) => now - c.caughtAt > MAX_AGE_MS || (lastCatchAt !== null && c.caughtAt - lastCatchAt < MIN_GAP_MS));
  if (stale.length) { settlePendingCatches(stale, undefined, who); out.dropped += stale.length; list = getPendingCatches(); }
  while (list.length && who === address) {
    const chunk: PendingCatch[] = list.slice(0, CHUNK);
    const catches = chunk.map(({ fish, sizeCm, caughtAt }) => ({ fish, sizeCm, caughtAt }));
    const opId = pendingOperation(who, JSON.stringify(catches), newOperationId);
    try {
      const view = await call({ op: 'fishbook.record', operationId: opId, catches });
      if (who !== address) return out; // switched Player ID meanwhile: this answer is not for the current book
      settlePendingCatches(chunk, applyView(view), who);
      const rejected = view.result?.rejected ?? [];
      out.recorded += view.result?.recorded ?? chunk.length - rejected.length;
      out.newKinds.push(...(view.result?.newKinds ?? []));
      if (rejected.length) { out.dropped += rejected.length; out.error = rejected[0].reason; }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Saving is unavailable right now.';
      if (who !== address) return out;
      if (err instanceof SaveRequestError && err.status === 422) {
        // None of these will ever be accepted (bad clock, rules) — drop them so the rest can be saved.
        settlePendingCatches(chunk, undefined, who);
        out.dropped += chunk.length;
        out.error = message;
      } else {
        return { ...out, error: message }; // network / unlock / rate: keep them for next time
      }
    }
    list = getPendingCatches();
  }
  return out;
}

// ---- Dalbit story: save at the end of each day ----------------------------------------------------
let saving = false;
async function maybeSaveStoryDay(): Promise<void> {
  const meta = getDraftMeta();
  const s = getStory();
  if (!address || saving || status !== 'ready' || !meta) return;
  if (s.step !== `d${s.day}_end` || meta.savedDay >= s.day) return;
  saving = true; storyStatus = 'saving'; emit();
  const who = address;
  // Keep the operation id on the device first, so a retry after a crash can't save the day twice.
  const opId = meta.pendingOp?.day === s.day ? meta.pendingOp.id : newOperationId();
  setDraftMeta((m) => ({ ...m, pendingOp: { day: s.day, id: opId } }));
  try {
    const view = await call({ op: 'story.saveDay', operationId: opId, world: 'dalbit', baseRevision: meta.baseRevision, state: storyForSave(s) });
    if (who !== address) return;
    const saved = view.story.dalbit;
    setDraftMeta(() => ({ baseRevision: saved?.revision ?? null, savedDay: saved?.day ?? s.day, pendingOp: null }));
    storyStatus = 'saved';
  } catch (err) {
    if (who !== address) return;
    storyStatus = 'failed';
    if (err instanceof SaveRequestError && err.status === 409) {
      // Saved already or changed on another device: the server copy wins.
      try {
        const view = await call({ op: 'load' });
        if (who === address && view.story.dalbit && view.story.dalbit.day >= s.day) {
          attachStory(who, view.story.dalbit);
          storyStatus = 'saved';
        }
      } catch { /* retry later */ }
    } else if (err instanceof SaveRequestError && err.status === 422) {
      setDraftMeta((m) => ({ ...m, pendingOp: null })); // this state will never pass; a new attempt gets a new id
    }
  } finally {
    saving = false;
    emit();
  }
}

// Offline (load failed): try again on 'online', when the tab comes back, and on a slow backoff.
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 30_000;
function retryOffline() {
  clearTimeout(retryTimer);
  if (status !== 'offline' || !address) { retryDelay = 30_000; return; }
  const a = address;
  address = null; // attachPlayer ignores a repeat of the current address
  void attachPlayer(a);
}
function scheduleRetry() {
  clearTimeout(retryTimer);
  if (status !== 'offline' || !address) { retryDelay = 30_000; return; }
  retryTimer = setTimeout(retryOffline, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
}
listeners.add(scheduleRetry);

if (!IS_TEST && typeof window !== 'undefined') {
  subscribeStory(() => { void maybeSaveStoryDay(); });
  window.addEventListener('online', () => { if (status === 'offline') retryOffline(); else void maybeSaveStoryDay(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && status === 'offline') retryOffline(); });
}
