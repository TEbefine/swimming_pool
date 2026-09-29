// Story save for "The Heir of Dalbit" — one small state object per story, kept in localStorage.
// Single-player: every visitor has their own save (the multiplayer world around it is unchanged).
// React components read it with useStory(); game code uses getStory() / updateStory().

import { useSyncExternalStore } from 'react';

export type ItemId = 'small_net' | 'mackerel' | 'dried_mackerel' | 'yeot';

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
}

const KEY = 'dalbit_prologue_v1';

function initialState(): StoryState {
  return { version: 1, step: 'd1_wake', day: 1, coins: 0, energy: 10, bag: {}, flags: {}, ledger: [] };
}

function load(): StoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const data = JSON.parse(raw) as Partial<StoryState>;
    if (data.version !== 1) return initialState();
    return { ...initialState(), ...data };
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

export function addCoins(n: number) {
  updateStory((s) => ({ ...s, coins: Math.max(0, s.coins + n) }));
}

export function setEnergy(value: number) {
  updateStory((s) => ({ ...s, energy: Math.max(0, Math.min(10, value)) }));
}

/** Write one line in the Ledger of Echoes (never twice). */
export function addLedger(text: string) {
  updateStory((s) =>
    s.ledger.some((e) => e.text === text) ? s : { ...s, ledger: [...s.ledger, { day: s.day, text }] },
  );
}

/** Start the story again from the first morning. */
export function resetStory() {
  updateStory(() => initialState());
}
