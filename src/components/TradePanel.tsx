import React, { useEffect, useState } from 'react';
import { useStory } from '../game/story/storyStore';
import { ITEMS, ITEM_IDS, itemIcon, type ItemId } from '../game/story/items';
import {
  INN_DAILY_LIMIT, giftedToday, givable, innLeftToday, priceAt, sellOne,
  type GiftTarget, type StoryPanel,
} from '../game/story/dalbitPrologue';

// The story's small windows, opened by a dialogue:
//   sell — a buyer's counter (Master Gu: 2 coins, always · the inn: 4 coins, a few, before noon)
//   give — pick something from the bag (or your coins) for Mother / Father
// Same cream-and-brown look as the bag and the dialogue box. ✕ / Esc closes.

const PANEL = 'bg-[#FFF6E5] border-2 border-[#4A2E1A] text-[#4A2E1A] shadow-[0_2px_0_#4A2E1A]';
const BTN = 'pointer-events-auto rounded-sm border-2 border-[#4A2E1A] bg-[#F4D98B] px-2 py-0.5 shadow-[0_2px_0_#4A2E1A] active:translate-y-[1px] disabled:opacity-40 disabled:shadow-none';

const BUYER_NAME = { gu: "Master Gu's scale", inn: 'The inn (back door)' } as const;

interface TradePanelProps {
  panel: StoryPanel;
  compact?: boolean;
  onClose: () => void;
  /** Give mode: the player picked something. App closes the window and shows the reaction. */
  onGive: (to: GiftTarget, what: ItemId | 'coins') => void;
}

export const TradePanel: React.FC<TradePanelProps> = ({ panel, compact = false, onClose, onGive }) => {
  const story = useStory();
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' || e.key.toLowerCase() === 'x') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const text = compact ? 'text-[11px]' : 'text-[15px]';
  const noteFont = { fontFamily: 'var(--font-pixel)', fontSize: compact ? 12 : 16 };
  const icon = compact ? 'w-6 h-6' : 'w-8 h-8';

  let title: string;
  let rows: React.ReactNode;

  if (panel.kind === 'sell') {
    const buyer = panel.buyer;
    title = BUYER_NAME[buyer];
    const items = ITEM_IDS.filter((id) => (story.bag[id] ?? 0) > 0 && priceAt(id, buyer, story) !== null);
    const sell = (id: ItemId, n: number) => {
      let got = 0;
      let sold = 0;
      for (let i = 0; i < n; i++) {
        const c = sellOne(id, buyer);
        if (!c) break;
        got += c;
        sold++;
      }
      if (sold) {
        setNote(buyer === 'gu'
          ? `Master Gu weighs ${sold} ${ITEMS[id].name.toLowerCase()} and drops ${got} coin${got === 1 ? '' : 's'} in your hand.`
          : `The innkeeper counts out ${got} coins, quickly.`);
      }
    };
    rows = items.length === 0 ? (
      <p className="opacity-75 leading-relaxed" style={noteFont}>
        {buyer === 'inn' && innLeftToday(story) <= 0 ? 'The inn has all the fish it needs today.' : 'Nothing here this buyer will take.'}
      </p>
    ) : (
      <ul className="flex flex-col gap-1.5">
        {items.map((id) => {
          const price = priceAt(id, buyer, story)!;
          const have = story.bag[id] ?? 0;
          const max = buyer === 'inn' ? Math.min(have, innLeftToday(story)) : have;
          return (
            <li key={id} className="flex items-center gap-2">
              <ItemIcon id={id} className={icon} />
              <span className="flex-1 min-w-0 truncate">{ITEMS[id].name} ×{have}</span>
              <span className="whitespace-nowrap opacity-80">{price} c</span>
              <button type="button" className={BTN} onClick={() => sell(id, 1)}>Sell 1</button>
              {max > 1 && <button type="button" className={BTN} onClick={() => sell(id, max)}>All ({max})</button>}
            </li>
          );
        })}
      </ul>
    );
    if (buyer === 'inn') {
      rows = (
        <>
          <p className="opacity-75 mb-1" style={noteFont}>Only {INN_DAILY_LIMIT} a day, and only before noon. {innLeftToday(story)} left today.</p>
          {rows}
        </>
      );
    }
  } else {
    const to = panel.to;
    title = `Give to ${to === 'mother' ? 'Mother' : 'Father'}`;
    const items = givable(story);
    const already = giftedToday(to, story);
    rows = (
      <>
        {already && <p className="opacity-75 mb-1" style={noteFont}>You already gave a gift today.</p>}
        <ul className="flex flex-col gap-1.5">
          {story.coins > 0 && (
            <li className="flex items-center gap-2">
              <span className={`${icon} shrink-0 rounded-full bg-[#E0A526] border-2 border-[#4A2E1A]`} />
              <span className="flex-1 min-w-0 truncate">All your coins ({story.coins})</span>
              <button type="button" className={BTN} onClick={() => onGive(to, 'coins')}>Give</button>
            </li>
          )}
          {items.map((id) => (
            <li key={id} className="flex items-center gap-2">
              <ItemIcon id={id} className={icon} />
              <span className="flex-1 min-w-0 truncate">{ITEMS[id].name} ×{story.bag[id]}</span>
              <button type="button" className={BTN} disabled={already} onClick={() => onGive(to, id)}>Give</button>
            </li>
          ))}
          {items.length === 0 && story.coins <= 0 && (
            <li className="opacity-75" style={noteFont}>Your bag is empty. A smile is free.</li>
          )}
        </ul>
      </>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center" style={{ fontFamily: 'var(--font-pixel)' }}>
      <div
        role="dialog"
        aria-label={title}
        className={`pointer-events-auto ${PANEL} rounded-md ${compact ? 'w-[92%] max-h-[92%] p-2' : 'w-[460px] max-h-[70%] p-3'} ${text} flex flex-col gap-2 overflow-hidden`}
      >
        <div className="flex items-center justify-between gap-2">
          <span>{title}</span>
          <span className="flex items-center gap-2">
            <span className="whitespace-nowrap">Coins {story.coins}</span>
            <button type="button" onClick={onClose} className="px-1 hover:text-[#9C4A3E]" aria-label="Close">✕</button>
          </span>
        </div>
        <div className="overflow-y-auto overscroll-contain">{rows}</div>
        {note && <p className="leading-snug border-t border-[#4A2E1A]/30 pt-1.5" style={noteFont}>{note}</p>}
        <button type="button" onClick={onClose} className={`${BTN} self-end`}>Done</button>
      </div>
    </div>
  );
};

const ItemIcon: React.FC<{ id: ItemId; className: string }> = ({ id, className }) => (
  <span className={`relative shrink-0 ${className} rounded-sm`} style={{ background: `${ITEMS[id].color}33` }}>
    <img
      src={itemIcon(id)}
      alt=""
      className="absolute inset-0 w-full h-full"
      draggable={false}
      onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.style.background = ITEMS[id].color; }}
    />
  </span>
);
