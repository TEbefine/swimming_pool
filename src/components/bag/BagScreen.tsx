import React from 'react';
import { useStory } from '../../game/story/storyStore';
import { ITEMS, POCKETS, itemIcon } from '../../game/story/items';
import { ACTION_HINT, carriedIn } from '../../game/story/bagActions';
import type { MenuInput, MenuState } from '../gameMenu/menuModel';
import { DescriptionBox } from '../gameMenu/DescriptionBox';
import { HintBar, hintsFor } from '../gameMenu/HintBar';
import { PixelBackpack } from './PixelBackpack';
import { PocketBar, pocketName } from './PocketBar';
import { ItemList } from './ItemList';
import { ItemActionMenu } from './ItemActionMenu';
import './bag.css';

interface BagScreenProps {
  state: MenuState;
  playerName: string;
  compact: boolean;
  onPress: (input: MenuInput) => void;
  onPoint: (index: number, confirm: boolean) => void;
  onPocket: (index: number) => void;
}

const clamp = (i: number, n: number) => Math.max(0, Math.min(i, n - 1));

/** The Bag. Replaces the whole screen. It only draws: the cursor, pockets and popup live in the menu model. */
export const BagScreen: React.FC<BagScreenProps> = ({ state, playerName, compact, onPress, onPoint, onPocket }) => {
  const story = useStory();
  const pocketIndex = clamp(state.pocket, POCKETS.length);
  const pocket = POCKETS[pocketIndex];
  const rows = carriedIn(story.bag, pocket.id).map((id) => ({ id, count: story.bag[id] ?? 0 }));
  const row = rows.length ? clamp(state.selected[pocket.id] ?? 0, rows.length) : 0;
  const current = rows[row];
  const item = current ? ITEMS[current.id] : null;
  const popup = state.popup;
  const h = hintsFor(compact);

  // What the description box says right now.
  let text = 'Nothing in this pocket yet.';
  let meta = '';
  if (item) {
    text = item.note;
    const bits: string[] = [];
    if (item.energy) bits.push(`Energy +${item.energy}`);
    if (item.sell?.gu && item.sell?.inn) bits.push(`Gu ${item.sell.gu}c / Inn ${item.sell.inn}c`);
    else if (item.sell?.gu) bits.push(`Gu ${item.sell.gu}c`);
    else if (item.sell?.inn) bits.push(`Inn ${item.sell.inn}c`);
    if (item.driesTo) bits.push(`Dries → ${ITEMS[item.driesTo].name}`);
    if (item.key) bits.push('Key item');
    meta = bits.join(' · ');
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
              <PixelBackpack size={compact ? 64 : 88} />
            </div>
            <div className="gm-pocket-name">{pocketName(pocket.label)}</div>
            <div className="gm-coins">Coins {story.coins}</div>
          </div>

          <ItemList items={rows} active={row} held={!!popup} onPoint={onPoint} />

          {popup && <ItemActionMenu popup={popup} onPoint={onPoint} />}
        </div>

        <DescriptionBox
          className="gm-bag-desc"
          title={item ? item.name : pocketName(pocket.label)}
          text={text}
          meta={meta}
          icon={current ? itemIcon(current.id) : undefined}
          feedback={!!state.feedback}
        />

        <HintBar hints={hints} onPress={onPress} />
      </div>
    </div>
  );
};
