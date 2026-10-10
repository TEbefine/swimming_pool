// React side of the menu: owns the one MenuStore, the one keyboard entry point and the one
// D-pad adapter. App.tsx talks to the menu ONLY through what this hook returns.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PlayerState } from '../../game/types';
import { POCKETS } from '../../game/story/items';
import { getStory } from '../../game/story/storyStore';
import { carriedIn, itemActionsFor, runItemAction } from '../../game/story/bagActions';
import { sound } from '../../game/audio';
import { triggerHaptic } from '../../game/haptics';
import { getEmoteItems, type EmoteItem } from '../startMenu/EmoteScreen';
import { OPTION_ROWS } from '../startMenu/optionRows';
import { MenuStore, type MenuContext, type MenuHost, type MenuInput, type MenuState, type Sfx } from './menuModel';
import { DpadAdapter, KeyGate, menuInputFromKey } from './menuInput';

/** What the App must do when the menu hands control to something else. */
export interface GameMenuCallbacks {
  openFishBook(): void;
  openNameEditor(): void;
  openHelp(): void;
  /** A normal emote ('wave', 'jump'…). */
  triggerEmote(action: string): void;
  /** The "Dive in / Step out" emote. */
  toggleWaterLand(): void;
  /** The menu opened or closed. */
  openChanged(open: boolean): void;
}

export interface GameMenuApi {
  state: MenuState;
  isOpen: boolean;
  /** True while the Bag (or something inside it) is the screen being shown. */
  bagShown: boolean;
  open(view?: 'field' | 'bag'): void;
  close(): void;
  toggleStart(): void;
  press(input: MenuInput): void;
  point(index: number, confirm: boolean): void;
  setPocket(index: number): void;
  /** The ONE keyboard entry point. Returns true if the key belonged to the menu. */
  handleKey(e: KeyboardEvent): boolean;
  /** The Game Boy D-pad. Call with every event, including the (0, 0) release. */
  feedDpad(dx: number, dy: number): void;
}

const POCKET_IDS = POCKETS.map((p) => p.id);
const FEEDBACK_MS = 3000;

const SFX: Record<Sfx, () => void> = {
  move: () => { sound.playCursor(); triggerHaptic(10); },
  select: () => { sound.playSelect(); triggerHaptic(15); },
  back: () => { sound.playBack(); triggerHaptic(15); },
};

export function useGameMenu(callbacks: GameMenuCallbacks, playerState: PlayerState): GameMenuApi {
  // Always call the newest callbacks / read the newest player state without rebuilding the store.
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const emotes = useRef<EmoteItem[]>([]);
  emotes.current = getEmoteItems(playerState);

  const [{ store, dpad }] = useState(() => {
    const dpadRef: { current: DpadAdapter | null } = { current: null };

    const getContext = (): MenuContext => ({
      pocketIds: POCKET_IDS,
      itemsIn: (pocket) => carriedIn(getStory().bag, pocket), // live, never a stale render's copy
      actionsFor: itemActionsFor,
      emoteCount: emotes.current.length,
      optionCount: OPTION_ROWS.length,
    });

    const host: MenuHost = {
      sfx: (kind) => SFX[kind](),
      openFishBook: () => cb.current.openFishBook(),
      openNameEditor: () => cb.current.openNameEditor(),
      openHelp: () => cb.current.openHelp(),
      chooseEmote: (index) => {
        const item = emotes.current[index];
        if (!item) return;
        if (item.isToggleState) cb.current.toggleWaterLand();
        else cb.current.triggerEmote(item.id);
      },
      changeOption: (index, dir) => OPTION_ROWS[index]?.change(dir),
      runItemAction,
      openChanged: (open) => {
        dpadRef.current?.reset(); // a finger may still be on the D-pad
        cb.current.openChanged(open);
      },
    };

    const store = new MenuStore(getContext, host);
    const dpad = new DpadAdapter((input) => store.press(input));
    dpadRef.current = dpad;
    return { store, dpad };
  });

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  // The feedback line fades by itself (any input also clears it).
  useEffect(() => {
    if (!state.feedback) return;
    const t = setTimeout(() => store.clearFeedback(), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [state.feedback, store]);

  const gate = useRef(new KeyGate());

  return useMemo<GameMenuApi>(() => ({
    state,
    isOpen: state.open,
    bagShown: state.open && state.stack[state.stack.length - 1] === 'bag',
    open: (view) => store.open(view),
    close: () => store.close(),
    toggleStart: () => store.toggleStart(),
    press: (input) => store.press(input),
    point: (index, confirm) => store.point(index, confirm),
    setPocket: (index) => store.setPocket(index),
    handleKey: (e) => {
      if (!store.isOpen) return false;
      const input = menuInputFromKey(e);
      if (!input) return false;
      e.preventDefault();
      if (gate.current.accept(input, e.repeat, performance.now())) store.press(input);
      return true;
    },
    feedDpad: (dx, dy) => dpad.feed(dx, dy),
  }), [state, store, dpad]);
}
