// Story save for "The Heir of Dalbit" — one small state object per story, kept in localStorage.
// Single-player: every visitor has their own save (the multiplayer world around it is unchanged).
// React components read it with useStory(); game code uses getStory() / updateStory().

import { useSyncExternalStore } from 'react';
import { isItemId, type ItemId } from './items';

// Item ids live in items.ts (the item contract); re-exported so older imports keep working.
export type { ItemId } from './items';

export interface LedgerEntry {
  day: number;
  text: string;
}

export interface StoryState {
  version: 1;
  /** Current story beat (see BEATS in dalbitPrologue.ts). */
  step: string;
  day: number;
  coins: number;
  /** 0–10. Fishing and walking use it; food and rest give it back. */
  energy: number;
  bag: Partial<Record<ItemId, number>>;
  flags: Record<string, boolean>;
  /** The Spirit's Ledger of Echoes. */
  ledger: LedgerEntry[];
  /** Biggest fish caught per kind, in cm. */
  records: Partial<Record<ItemId, number>>;
  /** Small counts the story keeps (e.g. "inn_sold_d2" = fish sold to the inn on day 2). */
  counters: Record<string, number>;
}

// The test page (?test=...) plays in its own sandbox save, so testing never touches the real story.
const IS_TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
const GUEST_KEY = IS_TEST ? 'dalbit_test_sandbox' : 'dalbit_prologue_v1';
// With a Player ID (ID-01 c) the device keeps an address-scoped DRAFT while you play; the server keeps
// the real save, written at the end of each day (game/saves/cloud.ts). The draft is never authoritative.
let KEY = GUEST_KEY;
const draftKey = (address: string) => `dalbit_draft_v1_${address}`;
const metaKey = (address: string) => `dalbit_draft_meta_v1_${address}`;
/** Which server save the draft continues from, and the day it last saved. */
export interface DraftMeta { baseRevision: number | null; savedDay: number; pendingOp: { day: number; id: string } | null }
let scope: string | null = null;
let meta: DraftMeta = { baseRevision: null, savedDay: 0, pendingOp: null };

function initialState(): StoryState {
  return { version: 1, step: 'd1_wake', day: 1, coins: 0, energy: 10, bag: {}, flags: {}, ledger: [], records: {}, counters: {} };
}

function load(key = KEY): StoryState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState();
    const data = JSON.parse(raw) as Partial<StoryState>;
    if (data.version !== 1) return initialState();
    // Drop anything in the bag that is no longer an item (renamed/removed ids).
    const bag: StoryState['bag'] = {};
    for (const [id, n] of Object.entries(data.bag ?? {})) {
      if (isItemId(id) && typeof n === 'number' && n > 0) bag[id] = n;
    }
    return { ...initialState(), ...data, bag, records: data.records ?? {}, counters: data.counters ?? {} };
  } catch {
    return initialState();
  }
}

let state: StoryState = load();
const listeners = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage blocked (private window) — the story still works for this visit
  }
}

export function getStory(): StoryState {
  return state;
}

/** Replace the state with a changed copy, save it and tell the UI. */
export function updateStory(change: (s: StoryState) => StoryState) {
  state = change(state);
  save();
  listeners.forEach((l) => l());
}

export function subscribeStory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStory(): StoryState {
  return useSyncExternalStore(subscribeStory, getStory, getStory);
}

// ---- small helpers -------------------------------------------------------

export function setStep(step: string) {
  updateStory((s) => (s.step === step ? s : { ...s, step }));
}

export function setFlag(flag: string, value = true) {
  updateStory((s) => (s.flags[flag] === value ? s : { ...s, flags: { ...s.flags, [flag]: value } }));
}

export function addItem(id: ItemId, n = 1) {
  updateStory((s) => ({ ...s, bag: { ...s.bag, [id]: Math.max(0, (s.bag[id] ?? 0) + n) } }));
}

/** How many of this item are in the bag. */
export function countItem(id: ItemId): number {
  return state.bag[id] ?? 0;
}

/** Take items out of the bag (selling, giving, eating). Returns false and changes nothing if there aren't enough. */
export function removeItem(id: ItemId, n = 1): boolean {
  if (countItem(id) < n) return false;
  addItem(id, -n);
  return true;
}

export function addCoins(n: number) {
  updateStory((s) => ({ ...s, coins: Math.max(0, s.coins + n) }));
}

export function setEnergy(value: number) {
  updateStory((s) => ({ ...s, energy: Math.max(0, Math.min(10, value)) }));
}

/** Add to a story counter (see StoryState.counters). */
export function addCounter(key: string, n = 1) {
  updateStory((s) => ({ ...s, counters: { ...s.counters, [key]: (s.counters[key] ?? 0) + n } }));
}

export function getCounter(key: string): number {
  return state.counters[key] ?? 0;
}

/** Write one line in the Ledger of Echoes (never twice). */
export function addLedger(text: string) {
  updateStory((s) =>
    s.ledger.some((e) => e.text === text) ? s : { ...s, ledger: [...s.ledger, { day: s.day, text }] },
  );
}

/** Remember a fish size. Returns true when it's a new record for that kind (and not the first one). */
export function recordSize(id: ItemId, cm: number): boolean {
  const best = state.records[id];
  if (best !== undefined && cm <= best) return false;
  updateStory((s) => ({ ...s, records: { ...s.records, [id]: cm } }));
  return best !== undefined;
}

/** Start the story again from the first morning. */
export function resetStory() {
  updateStory(() => initialState());
}

// ---- Player ID hooks (called by game/saves/cloud.ts only) --------------------------------------
interface CloudStory { revision: number; day: number; state: StoryState }

/** Switch the story to a Player ID's draft (or back to the guest save with null).
 *  The server save wins when the draft is missing or continues an older save (another device saved later). */
export function attachStory(address: string | null, cloud: CloudStory | null) {
  if (IS_TEST) return;
  scope = address;
  if (!address) {
    KEY = GUEST_KEY;
    meta = { baseRevision: null, savedDay: 0, pendingOp: null };
    state = load();
  } else {
    KEY = draftKey(address);
    let stored: DraftMeta | null = null;
    try { stored = JSON.parse(localStorage.getItem(metaKey(address)) ?? 'null') as DraftMeta | null; } catch { stored = null; }
    const hasDraft = (() => { try { return localStorage.getItem(KEY) !== null; } catch { return false; } })();
    if (cloud && (!hasDraft || !stored || stored.baseRevision !== cloud.revision)) {
      state = { ...initialState(), ...cloud.state };
      meta = { baseRevision: cloud.revision, savedDay: cloud.day, pendingOp: null };
    } else if (hasDraft && stored) {
      state = load();
      meta = stored;
    } else {
      // First time with this Player ID: carry on from this browser's guest story (checked at day end).
      state = load(GUEST_KEY);
      meta = { baseRevision: null, savedDay: 0, pendingOp: null };
    }
    saveMeta();
  }
  save();
  listeners.forEach((l) => l());
}
function saveMeta() {
  if (!scope) return;
  try { localStorage.setItem(metaKey(scope), JSON.stringify(meta)); } catch { /* storage blocked */ }
}
export function getDraftMeta(): DraftMeta | null {
  return scope ? meta : null;
}
export function setDraftMeta(change: (m: DraftMeta) => DraftMeta) {
  if (!scope) return;
  meta = change(meta);
  saveMeta();
  listeners.forEach((l) => l());
}
/** The state as the server expects it: no empty bag stacks, no false flags. */
export function storyForSave(s: StoryState = state): StoryState {
  const bag: StoryState['bag'] = {};
  for (const [id, n] of Object.entries(s.bag)) if (n && n > 0) bag[id as ItemId] = n;
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(s.flags)) if (v) flags[k] = true;
  return { version: 1, step: s.step, day: s.day, coins: s.coins, energy: s.energy, bag, flags, ledger: s.ledger, records: s.records, counters: s.counters };
}
