// React side of the menu: owns the one MenuStore, the one keyboard entry point and the one
// D-pad adapter. App.tsx talks to the menu ONLY through what this hook returns.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PlayerState } from '../../game/types';
import { POCKETS, type ItemId } from '../../game/story/items';
import { getStory } from '../../game/story/storyStore';
import { carriedIn, itemActionsFor, runItemAction } from '../../game/story/bagActions';
import { FREE_BY_ID, FREE_FISH, TIERS } from '../../game/fishing/freeFishCatalog';
import { getFishBook } from '../../game/fishing/freeFish';
import { sound } from '../../game/audio';
import { triggerHaptic } from '../../game/haptics';
import { getEmoteItems, type EmoteItem } from '../startMenu/EmoteScreen';
import { OPTION_ROWS } from '../startMenu/optionRows';
import { MenuStore, type MenuContext, type MenuHost, type MenuInput, type MenuState, type Sfx } from './menuModel';
import { DpadAdapter, KeyGate, menuInputFromKey } from './menuInput';
import { bagUsesEconomy, coolerIds, coolerRows, goodsIds, goodsRows, COOLER_PREFIX, GOODS_PREFIX } from '../bag/economyRows';
import { gameNow, getWallet, refreshWallet, useBagItem } from '../../game/economy/walletStore';
import { SHOP_BY_ID } from '../../game/economy/shopCatalog';

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

export function useGameMenu(callbacks: GameMenuCallbacks, playerState: PlayerState, isStoryRoom = false): GameMenuApi {
  // Always call the newest callbacks / read the newest player state without rebuilding the store.
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const isStory = useRef(isStoryRoom);
  isStory.current = isStoryRoom;
  const emotes = useRef<EmoteItem[]>([]);
  emotes.current = getEmoteItems(playerState);

  const [{ store, dpad }] = useState(() => {
    const dpadRef: { current: DpadAdapter | null } = { current: null };
    const storeRef: { current: MenuStore | null } = { current: null };

    const getContext = (): MenuContext => ({
      pocketIds: POCKET_IDS,
      itemsIn: (pocket) => {
        // ECO-02(d): with the money system on, FISH = the cooler you carry, ITEMS = story items + shop goods.
        if (bagUsesEconomy(isStory.current)) {
          if (pocket === 'fish') return [...carriedIn(getStory().bag, 'fish'), ...coolerIds(getWallet())];
          if (pocket === 'items') return [...carriedIn(getStory().bag, 'items'), ...goodsIds(getWallet())];
        }
        if (pocket === 'fish' && !isStory.current) {
          const book = getFishBook();
          const free = FREE_FISH.filter((f) => (book.entries[f.id]?.count ?? 0) > 0).map((f) => f.id);
          const storyFish = carriedIn(getStory().bag, 'fish');
          return [...storyFish, ...free];
        }
        return carriedIn(getStory().bag, pocket);
      },
      actionsFor: (id) => {
        if (id.startsWith(COOLER_PREFIX)) return ['check'];
        if (id.startsWith(GOODS_PREFIX)) {
          const g = getWallet().goods.find((x) => GOODS_PREFIX + x.uid === id);
          return g && SHOP_BY_ID[g.id]?.use === 'ice' ? ['use', 'check'] : ['check'];
        }
        return FREE_BY_ID[id] ? ['check'] : itemActionsFor(id as ItemId);
      },
      linkIn: () => null,
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
      runItemAction: (itemId, action) => {
        if (itemId.startsWith(COOLER_PREFIX)) {
          const row = coolerRows(refreshWallet(), gameNow()).find((r) => r.id === itemId);
          return row ? `${row.name}: ${row.meta}. Sell it to Gen at the Harbour Fish Shop.` : 'That fish is gone.';
        }
        if (itemId.startsWith(GOODS_PREFIX)) {
          const row = goodsRows(refreshWallet(), gameNow()).find((r) => r.id === itemId);
          if (!row) return "You don't have that any more.";
          if (action !== 'use') return `${row.name}: ${row.note}`;
          // The server spends the ice (dev / preview) or the device does (sandbox). The answer arrives later.
          void useBagItem(itemId.slice(GOODS_PREFIX.length)).then((r) => {
            storeRef.current?.showFeedback(r.ok ? r.message : r.message || 'Not now.');
            storeRef.current?.refresh();
          });
          return 'Icing your cooler…';
        }
        if (FREE_BY_ID[itemId]) {
          const f = FREE_BY_ID[itemId];
          const entry = getFishBook().entries[itemId];
          const best = entry?.best ? ` Best: ${entry.best} cm.` : '';
          return `${f.name} (${TIERS[f.tier].label} tier).${best}`;
        }
        return runItemAction(itemId as ItemId, action);
      },
      openChanged: (open) => {
        dpadRef.current?.reset(); // a finger may still be on the D-pad
        cb.current.openChanged(open);
      },
    };

    const store = new MenuStore(getContext, host);
    storeRef.current = store;
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
