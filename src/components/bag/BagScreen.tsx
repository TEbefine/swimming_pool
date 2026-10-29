import React, { useEffect, useState } from 'react';
import { useStory } from '../../game/story/storyStore';
import { ITEMS, POCKETS, itemIcon } from '../../game/story/items';
import { ACTION_HINT, carriedIn } from '../../game/story/bagActions';
import { useFishBook, getPendingCatches, freeIcon } from '../../game/fishing/freeFish';
import { FREE_FISH, TIERS } from '../../game/fishing/freeFishCatalog';
import type { MenuInput, MenuState } from '../gameMenu/menuModel';
import { DescriptionBox } from '../gameMenu/DescriptionBox';
import { HintBar, hintsFor } from '../gameMenu/HintBar';
import { PixelBackpack } from './PixelBackpack';
import { PocketBar, pocketName } from './PocketBar';
import { ItemList } from './ItemList';
import { ItemActionMenu } from './ItemActionMenu';
import { bagUsesEconomy, coolerRows, goodsRows } from './economyRows';
import { gameNow, refreshWallet, useWallet } from '../../game/economy/walletStore';
import './bag.css';

interface BagScreenProps {
  state: MenuState;
  playerName: string;
  compact: boolean;
  isStoryRoom?: boolean;
  hasPlayerId?: boolean;
  onPress: (input: MenuInput) => void;
  onPoint: (index: number, confirm: boolean) => void;
  onPocket: (index: number) => void;
}

const POCKET_EMPTY_TEXT: Record<string, string> = {
  items: 'Nothing here yet.',
  fish: 'No fish yet. Cast a line at the Lake Pier.',
  cards: 'No cards yet.',
  key: 'No key items yet.',
};

const clamp = (i: number, n: number) => Math.max(0, Math.min(i, n - 1));

interface RowItem {
  id: string;
  name: string;
  count: number;
  icon?: string;
  note: string;
  meta: string;
  /** Shown instead of ×count (e.g. a fish's freshness countdown). */
  right?: string;
}

/** The Bag. Replaces the whole screen. It only draws: the cursor, pockets and popup live in the menu model. */
export const BagScreen: React.FC<BagScreenProps> = ({
  state,
  playerName,
  compact,
  isStoryRoom = false,
  hasPlayerId = false,
  onPress,
  onPoint,
  onPocket,
}) => {
  const story = useStory();
  const book = useFishBook();
  const wallet = useWallet();
  const economy = bagUsesEconomy(isStoryRoom);
  // Fish age while the Bag is open: tick once a second (and drop the ones that spoiled).
  const [now, setNow] = useState(() => gameNow());
  useEffect(() => {
    if (!economy) return;
    refreshWallet();
    const t = window.setInterval(() => { refreshWallet(); setNow(gameNow()); }, 1000);
    return () => window.clearInterval(t);
  }, [economy]);

  const pocketIndex = clamp(state.pocket, POCKETS.length);
  const pocket = POCKETS[pocketIndex];

  let rows: RowItem[] = [];

  const storyRows = (pocketId: typeof pocket.id): RowItem[] => carriedIn(story.bag, pocketId).map((id) => {
    const item = ITEMS[id];
    const bits: string[] = [];
    if (item.energy) bits.push(`Energy +${item.energy}`);
    if (item.sell?.gu && item.sell?.inn) bits.push(`Gu ${item.sell.gu}c / Inn ${item.sell.inn}c`);
    else if (item.sell?.gu) bits.push(`Gu ${item.sell.gu}c`);
    else if (item.sell?.inn) bits.push(`Inn ${item.sell.inn}c`);
    if (item.driesTo) bits.push(`Dries → ${ITEMS[item.driesTo].name}`);
    if (item.key) bits.push('Key item');
    return { id, name: item.name, count: story.bag[id] ?? 0, icon: itemIcon(id), note: item.note, meta: bits.join(' · ') };
  });

  if (economy && pocket.id === 'fish') {
    // What you CARRY: the cooler. Sold or spoiled fish are gone; the Fish Book keeps the collection.
    rows = [...storyRows('fish'), ...coolerRows(wallet, now)];
  } else if (economy && pocket.id === 'items') {
    rows = [...storyRows('items'), ...goodsRows(wallet, now)];
  } else if (pocket.id === 'fish' && !isStoryRoom) {
    const storyFish: RowItem[] = carriedIn(story.bag, 'fish').map((id) => {
      const item = ITEMS[id];
      const bits: string[] = [];
      if (item.energy) bits.push(`Energy +${item.energy}`);
      if (item.sell?.gu && item.sell?.inn) bits.push(`Gu ${item.sell.gu}c / Inn ${item.sell.inn}c`);
      else if (item.sell?.gu) bits.push(`Gu ${item.sell.gu}c`);
      else if (item.sell?.inn) bits.push(`Inn ${item.sell.inn}c`);
      return {
        id,
        name: item.name,
        count: story.bag[id] ?? 0,
        icon: itemIcon(id),
        note: item.note,
        meta: bits.join(' · '),
      };
    });

    const pendingCatches = getPendingCatches();
    const freeFish: RowItem[] = FREE_FISH.filter((f) => (book.entries[f.id]?.count ?? 0) > 0).map((f) => {
      const entry = book.entries[f.id];
      const count = entry?.count ?? 0;
      const best = entry?.best;
      const pendingCountForFish = pendingCatches.filter((c) => c.fish === f.id).length;
      const bits: string[] = [`${TIERS[f.tier].label} tier`];
      if (best) bits.push(`Best: ${best} cm`);
      if (hasPlayerId && pendingCountForFish > 0) {
        bits.push(`${pendingCountForFish} waiting for Nami/Kai`);
      }
      return {
        id: f.id,
        name: f.name,
        count,
        icon: freeIcon(f.id),
        note: f.note,
        meta: bits.join(' · '),
      };
    });

    rows = [...storyFish, ...freeFish];
  } else {
    rows = carriedIn(story.bag, pocket.id).map((id) => {
      const item = ITEMS[id];
      const bits: string[] = [];
      if (item.energy) bits.push(`Energy +${item.energy}`);
      if (item.sell?.gu && item.sell?.inn) bits.push(`Gu ${item.sell.gu}c / Inn ${item.sell.inn}c`);
      else if (item.sell?.gu) bits.push(`Gu ${item.sell.gu}c`);
      else if (item.sell?.inn) bits.push(`Inn ${item.sell.inn}c`);
      if (item.driesTo) bits.push(`Dries → ${ITEMS[item.driesTo].name}`);
      if (item.key) bits.push('Key item');
      return {
        id,
        name: item.name,
        count: story.bag[id] ?? 0,
        icon: itemIcon(id),
        note: item.note,
        meta: bits.join(' · '),
      };
    });
  }

  const row = rows.length > 0 ? clamp(state.selected[pocket.id] ?? 0, rows.length) : 0;
  const current = rows[row] ?? null;
  const popup = state.popup;
  const h = hintsFor(compact);

  // What the description box says right now.
  let text = isStoryRoom
    ? "Empty. Mother would say that's a good sign you haven't lost anything yet."
    : 'Nothing in this pocket yet.';
  let title = pocketName(pocket.label);
  let meta = '';

  if (current) {
    title = current.name;
    text = current.note;
    meta = current.meta;
  }

  if (state.feedback) {
    text = state.feedback;
  } else if (popup) {
    const action = popup.actions[popup.cursor];
    text = ACTION_HINT[action ?? 'cancel'];
  }

  const hints = popup
    ? [h.move, h.confirm, h.cancel]
    : compact
      ? [h.pocket, h.item, h.select, h.back]
      : [h.pocket, h.item, h.select, h.back, h.close];

  return (
    <div className="gm-bag-frame" data-compact={compact} onClick={() => onPress('back')}>
      <div className="gm-bag" onClick={(e) => e.stopPropagation()}>
        <header className="gm-bag-title">
          <span className="gm-bag-heading">BAG</span>
          <span className="gm-bag-player">{playerName}</span>
        </header>

        <PocketBar pockets={POCKETS} active={pocketIndex} onPick={onPocket} />

        <div className="gm-bag-mid">
          <div className="gm-bag-side">
            <div className="gm-frame gm-pack-tile">
              {current?.icon ? (
                <img
                  className="gm-pack-item-sprite"
                  src={current.icon}
                  alt={current.name}
                  width={compact ? 64 : 88}
                  height={compact ? 64 : 88}
                  draggable={false}
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.onerror = null;
                    img.src = '/sprites/items/mackerel.webp';
                  }}
                />
              ) : (
                <PixelBackpack size={compact ? 64 : 88} />
              )}
            </div>
            <div className="gm-pocket-name">{pocketName(pocket.label)}</div>
            <div className="gm-coins">Coins {(economy ? wallet.coins : story.coins).toLocaleString('en-US')}</div>
          </div>

          <ItemList
            items={rows}
            emptyText={economy && pocket.id === 'fish' ? 'Your cooler is empty. Cast a line at Quiet Bay; the Fish Book keeps every kind you caught.' : POCKET_EMPTY_TEXT[pocket.id]}
            active={row}
            held={!!popup}
            onPoint={onPoint}
          />

          {popup && <ItemActionMenu popup={popup} onPoint={onPoint} />}
        </div>

        <DescriptionBox
          className="gm-bag-desc"
          title={title}
          text={text}
          meta={meta}
          feedback={!!state.feedback}
        />

        <HintBar hints={hints} onPress={onPress} />
      </div>
    </div>
  );
};
