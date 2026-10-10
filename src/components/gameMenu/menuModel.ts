// THE MENU BRAIN — one small state machine for the whole in-screen menu system:
//   Field menu (START) → Bag → Item actions     ·     Field menu → Emotes / Options
//
// It is plain TypeScript (no React, no DOM, no sound) so it can be tested with `node --test`.
// Every input source (keyboard, the Game Boy D-pad and buttons, mouse/touch on a row) ends up
// as ONE call: store.press(input). Anything that touches the outside world (sound, opening the
// Fish Book, eating an item…) is reported as an "effect" and carried out by the host.
//
// Back always returns exactly one level:  item actions → Bag → Field menu → gameplay.
// START always closes the whole system.  Cursors are remembered even after the menu closes.

import type { ItemId, PocketId } from '../../game/story/items';

export type MenuInput = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'start' | 'bag';
export type MenuView = 'field' | 'bag' | 'emotes' | 'options';
export type Sfx = 'move' | 'select' | 'back';
export type ItemActionId = 'eat' | 'check';

export type FieldId = 'fishbook' | 'bag' | 'name' | 'emotes' | 'options' | 'help' | 'resume';
export const FIELD_IDS: readonly FieldId[] = ['fishbook', 'bag', 'name', 'emotes', 'options', 'help', 'resume'];
/** The divider is drawn above this entry: everything before it is a "gameplay" entry. */
export const FIELD_DIVIDER_BEFORE = FIELD_IDS.indexOf('options');

export interface ActionPopup {
  itemId: ItemId;
  /** Real actions for this item. "Cancel" is always the extra last row. */
  actions: readonly ItemActionId[];
  cursor: number;
}

export interface MenuState {
  open: boolean;
  /** Screens from the bottom up. [] when closed. The popup (if any) sits above the top one. */
  stack: readonly MenuView[];
  popup: ActionPopup | null;
  field: number;
  emotes: number;
  options: number;
  /** Index into ctx.pocketIds. */
  pocket: number;
  /** Remembered row per pocket (clamped when read, so a used-up item never leaves a bad cursor). */
  selected: Readonly<Record<string, number>>;
  /** One short line shown in the description box after an action. Cleared by the next input. */
  feedback: string | null;
  /** Bumped when an outside setting changed, so views re-read it. */
  tick: number;
}

/** Live facts the machine needs. Built fresh for every input, never cached. */
export interface MenuContext {
  pocketIds: readonly PocketId[];
  itemsIn(pocket: PocketId): readonly ItemId[];
  actionsFor(id: ItemId): readonly ItemActionId[];
  emoteCount: number;
  optionCount: number;
}

export type Effect =
  | { type: 'sfx'; kind: Sfx }
  | { type: 'fishbook' }
  | { type: 'name' }
  | { type: 'help' }
  | { type: 'emote'; index: number }
  | { type: 'option'; index: number; dir: 1 | -1 }
  | { type: 'item-action'; itemId: ItemId; action: ItemActionId };

export interface MenuHost {
  sfx(kind: Sfx): void;
  openFishBook(): void;
  openNameEditor(): void;
  openHelp(): void;
  chooseEmote(index: number): void;
  changeOption(index: number, dir: 1 | -1): void;
  /** Does the action to the real game state and returns one short line to show. */
  runItemAction(itemId: ItemId, action: ItemActionId): string;
  /** The menu opened or closed (freeze/unfreeze the player, close other overlays…). */
  openChanged(open: boolean): void;
}

export interface Step {
  state: MenuState;
  effects: Effect[];
}

export function createInitialState(): MenuState {
  return {
    open: false, stack: [], popup: null,
    field: 0, emotes: 0, options: 0, pocket: 0, selected: {},
    feedback: null, tick: 0,
  };
}

// ---- small helpers ---------------------------------------------------------

const wrap = (i: number, d: number, n: number) => (n <= 0 ? 0 : (i + d + n) % n);
const clamp = (i: number, n: number) => Math.max(0, Math.min(i, n - 1));
const sfx = (kind: Sfx): Effect => ({ type: 'sfx', kind });

export function topView(s: MenuState): MenuView | null {
  return s.stack.length ? s.stack[s.stack.length - 1] : null;
}

/** The pocket the Bag is showing. */
export function activePocket(s: MenuState, ctx: MenuContext): PocketId {
  return ctx.pocketIds[clamp(s.pocket, ctx.pocketIds.length)];
}

/** Row selected in the active pocket (always valid for the current contents; 0 when empty). */
export function selectedRow(s: MenuState, ctx: MenuContext): number {
  const len = ctx.itemsIn(activePocket(s, ctx)).length;
  return len === 0 ? 0 : clamp(s.selected[activePocket(s, ctx)] ?? 0, len);
}

export function selectedItem(s: MenuState, ctx: MenuContext): ItemId | null {
  return ctx.itemsIn(activePocket(s, ctx))[selectedRow(s, ctx)] ?? null;
}

export function closed(s: MenuState): MenuState {
  return { ...s, open: false, stack: [], popup: null, feedback: null };
}

/** Open the system. 'field' = the START menu, 'bag' = straight into the Bag (B key, HUD button). */
export function openState(s: MenuState, view: 'field' | 'bag' = 'field'): MenuState {
  if (!s.open) return { ...s, open: true, stack: [view], popup: null, feedback: null };
  if (view === 'bag' && topView(s) === 'field' && !s.popup) return { ...s, stack: [...s.stack, 'bag'] };
  return s;
}

function popView(s: MenuState): Step {
  const stack = s.stack.slice(0, -1);
  if (stack.length === 0) return { state: closed(s), effects: [sfx('back')] };
  return { state: { ...s, stack }, effects: [sfx('back')] };
}

function move(s: MenuState, key: 'field' | 'emotes' | 'options', d: number, n: number): Step {
  const next = wrap(clamp(s[key], n), d, n);
  return { state: { ...s, [key]: next }, effects: next !== s[key] ? [sfx('move')] : [] };
}

// ---- the reducer -----------------------------------------------------------

export function reduce(prev: MenuState, input: MenuInput, ctx: MenuContext): Step {
  if (!prev.open) return { state: prev, effects: [] };
  const s = prev.feedback ? { ...prev, feedback: null } : prev;

  // START closes the whole system from anywhere (even with a popup open).
  if (input === 'start') return { state: closed(s), effects: [sfx('back')] };

  // A popup owns the input: the list underneath must not react until it closes.
  if (s.popup) return popupStep(s, s.popup, input);

  switch (topView(s)) {
    case 'field': return fieldStep(s, input);
    case 'bag': return bagStep(s, input, ctx);
    case 'emotes': return emotesStep(s, input, ctx);
    case 'options': return optionsStep(s, input, ctx);
    default: return { state: s, effects: [] };
  }
}

function fieldStep(s: MenuState, input: MenuInput): Step {
  const n = FIELD_IDS.length;
  switch (input) {
    case 'up': return move(s, 'field', -1, n);
    case 'down': return move(s, 'field', 1, n);
    case 'back': return { state: closed(s), effects: [sfx('back')] };
    case 'bag': return { state: { ...s, stack: [...s.stack, 'bag'] }, effects: [sfx('select')] };
    case 'confirm': {
      const id = FIELD_IDS[clamp(s.field, n)];
      const out = (effect: Effect): Step => ({ state: closed(s), effects: [sfx('select'), effect] });
      switch (id) {
        case 'fishbook': return out({ type: 'fishbook' });
        case 'name': return out({ type: 'name' });
        case 'help': return out({ type: 'help' });
        case 'resume': return { state: closed(s), effects: [sfx('back')] };
        case 'bag': return { state: { ...s, stack: [...s.stack, 'bag'] }, effects: [sfx('select')] };
        case 'emotes': return { state: { ...s, stack: [...s.stack, 'emotes'] }, effects: [sfx('select')] };
        case 'options': return { state: { ...s, stack: [...s.stack, 'options'] }, effects: [sfx('select')] };
      }
      return { state: s, effects: [] };
    }
    default: return { state: s, effects: [] };
  }
}

function bagStep(s: MenuState, input: MenuInput, ctx: MenuContext): Step {
  const pocket = activePocket(s, ctx);
  const items = ctx.itemsIn(pocket);
  switch (input) {
    case 'up':
    case 'down': {
      if (items.length < 2) return { state: s, effects: [] };
      const next = wrap(selectedRow(s, ctx), input === 'up' ? -1 : 1, items.length);
      return { state: { ...s, selected: { ...s.selected, [pocket]: next } }, effects: [sfx('move')] };
    }
    case 'left':
    case 'right': {
      const n = ctx.pocketIds.length;
      if (n < 2) return { state: s, effects: [] };
      return { state: { ...s, pocket: wrap(clamp(s.pocket, n), input === 'left' ? -1 : 1, n) }, effects: [sfx('move')] };
    }
    case 'confirm': {
      const id = items[selectedRow(s, ctx)];
      if (!id) return { state: s, effects: [] };
      return { state: { ...s, popup: { itemId: id, actions: ctx.actionsFor(id), cursor: 0 } }, effects: [sfx('select')] };
    }
    case 'back':
    case 'bag': return popView(s);
    default: return { state: s, effects: [] };
  }
}

function popupStep(s: MenuState, popup: ActionPopup, input: MenuInput): Step {
  const rows = popup.actions.length + 1; // + Cancel
  switch (input) {
    case 'up':
    case 'down': {
      const cursor = wrap(popup.cursor, input === 'up' ? -1 : 1, rows);
      return { state: { ...s, popup: { ...popup, cursor } }, effects: cursor !== popup.cursor ? [sfx('move')] : [] };
    }
    case 'confirm': {
      const action = popup.actions[popup.cursor]; // undefined = the Cancel row
      if (!action) return { state: { ...s, popup: null }, effects: [sfx('back')] };
      return {
        state: { ...s, popup: null },
        effects: [sfx('select'), { type: 'item-action', itemId: popup.itemId, action }],
      };
    }
    case 'back':
    case 'bag': return { state: { ...s, popup: null }, effects: [sfx('back')] };
    default: return { state: s, effects: [] }; // left/right: the list below stays asleep
  }
}

function emotesStep(s: MenuState, input: MenuInput, ctx: MenuContext): Step {
  switch (input) {
    case 'up': return move(s, 'emotes', -1, ctx.emoteCount);
    case 'down': return move(s, 'emotes', 1, ctx.emoteCount);
    case 'back': return popView(s);
    case 'confirm': {
      if (ctx.emoteCount === 0) return { state: s, effects: [] };
      return { state: closed(s), effects: [sfx('select'), { type: 'emote', index: clamp(s.emotes, ctx.emoteCount) }] };
    }
    default: return { state: s, effects: [] };
  }
}

function optionsStep(s: MenuState, input: MenuInput, ctx: MenuContext): Step {
  const index = clamp(s.options, ctx.optionCount);
  switch (input) {
    case 'up': return move(s, 'options', -1, ctx.optionCount);
    case 'down': return move(s, 'options', 1, ctx.optionCount);
    case 'left': return { state: s, effects: [{ type: 'option', index, dir: -1 }] };
    case 'right':
    case 'confirm': return { state: s, effects: [{ type: 'option', index, dir: 1 }] };
    case 'back': return popView(s);
    default: return { state: s, effects: [] };
  }
}

/** Mouse/touch: put the cursor of the list that has focus on row `index`; optionally confirm it. */
export function reducePoint(prev: MenuState, index: number, confirm: boolean, ctx: MenuContext): Step {
  if (!prev.open) return { state: prev, effects: [] };
  const s = prev.feedback ? { ...prev, feedback: null } : prev;
  let moved: MenuState = s;
  if (s.popup) {
    const cursor = clamp(index, s.popup.actions.length + 1);
    moved = { ...s, popup: { ...s.popup, cursor } };
  } else {
    switch (topView(s)) {
      case 'field': moved = { ...s, field: clamp(index, FIELD_IDS.length) }; break;
      case 'emotes': moved = { ...s, emotes: clamp(index, ctx.emoteCount) }; break;
      case 'options': moved = { ...s, options: clamp(index, ctx.optionCount) }; break;
      case 'bag': {
        const pocket = activePocket(s, ctx);
        const len = ctx.itemsIn(pocket).length;
        if (len === 0) return { state: s, effects: [] };
        moved = { ...s, selected: { ...s.selected, [pocket]: clamp(index, len) } };
        break;
      }
    }
  }
  if (confirm) return reduce(moved, 'confirm', ctx);
  if (cursorKey(moved) === cursorKey(s)) return { state: s, effects: [] };
  return { state: moved, effects: [sfx('move')] };
}

/** Everything a cursor can change, as one comparable string. */
function cursorKey(s: MenuState): string {
  return [s.field, s.emotes, s.options, JSON.stringify(s.selected), s.popup?.cursor ?? '-'].join('|');
}

// ---- the store (what React subscribes to) ----------------------------------

export class MenuStore {
  private state: MenuState = createInitialState();
  private readonly listeners = new Set<() => void>();
  private readonly getContext: () => MenuContext;
  private readonly host: MenuHost;

  constructor(getContext: () => MenuContext, host: MenuHost) {
    this.getContext = getContext;
    this.host = host;
  }

  getSnapshot = (): MenuState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  get isOpen(): boolean { return this.state.open; }

  press(input: MenuInput) {
    if (!this.state.open) return;
    this.apply(reduce(this.state, input, this.getContext()));
  }

  /** Mouse/touch on a row. */
  point(index: number, confirm: boolean) {
    if (!this.state.open) return;
    this.apply(reducePoint(this.state, index, confirm, this.getContext()));
  }

  /** Mouse/touch on a pocket tab. */
  setPocket(index: number) {
    const s = this.state;
    if (!s.open || s.popup || topView(s) !== 'bag') return;
    const n = this.getContext().pocketIds.length;
    const pocket = clamp(index, n);
    if (pocket === s.pocket) return;
    this.apply({ state: { ...s, pocket, feedback: null }, effects: [sfx('move')] });
  }

  open(view: 'field' | 'bag' = 'field') {
    this.set(openState(this.state, view));
  }

  close() {
    if (this.state.open) this.set(closed(this.state));
  }

  /** START button/key: open the field menu, or close the whole system. */
  toggleStart() {
    if (this.state.open) this.close();
    else this.open('field');
  }

  clearFeedback() {
    if (this.state.feedback) this.set({ ...this.state, feedback: null });
  }

  private apply(step: Step) {
    const wasOpen = this.state.open;
    this.state = step.state;
    for (const e of step.effects) this.run(e);
    this.finish(wasOpen);
  }

  private set(next: MenuState) {
    const wasOpen = this.state.open;
    this.state = next;
    this.finish(wasOpen);
  }

  private finish(wasOpen: boolean) {
    this.listeners.forEach((fn) => fn());
    if (wasOpen !== this.state.open) this.host.openChanged(this.state.open);
  }

  private run(e: Effect) {
    const h = this.host;
    switch (e.type) {
      case 'sfx': h.sfx(e.kind); break;
      case 'fishbook': h.openFishBook(); break;
      case 'name': h.openNameEditor(); break;
      case 'help': h.openHelp(); break;
      case 'emote': h.chooseEmote(e.index); break;
      case 'option':
        h.changeOption(e.index, e.dir);
        this.state = { ...this.state, tick: this.state.tick + 1 };
        break;
      case 'item-action': {
        const feedback = h.runItemAction(e.itemId, e.action);
        // The item may be gone now (last one eaten): keep the cursor on a real row.
        const ctx = this.getContext();
        const pocket = activePocket(this.state, ctx);
        const len = ctx.itemsIn(pocket).length;
        const row = len === 0 ? 0 : clamp(this.state.selected[pocket] ?? 0, len);
        this.state = { ...this.state, feedback, selected: { ...this.state.selected, [pocket]: row } };
        break;
      }
    }
  }
}
