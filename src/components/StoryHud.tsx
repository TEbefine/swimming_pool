import React from 'react';
import { useStory, type ItemId } from '../game/story/storyStore';
import { eatItem, objectiveFor } from '../game/story/dalbitPrologue';
import { ITEMS, itemIcon } from '../game/story/items';

// Story mode overlay for Dalbit rooms: the current objective, coins + energy, and the bag.
// Colours follow the dialogue box (cream #FFF6E5, brown border #4A2E1A) so it feels like one UI.

interface StoryHudProps {
  bagOpen: boolean;
  onToggleBag: () => void;
  /** Smaller layout inside the Game Boy screen. */
  compact?: boolean;
}

const PANEL = 'bg-[#FFF6E5] border-2 border-[#4A2E1A] text-[#4A2E1A] shadow-[0_2px_0_#4A2E1A]';

export const StoryHud: React.FC<StoryHudProps> = ({ bagOpen, onToggleBag, compact = false }) => {
  const story = useStory();
  const objective = objectiveFor(story);
  const items = (Object.keys(story.bag) as ItemId[]).filter((id) => (story.bag[id] ?? 0) > 0);
  const text = compact ? 'text-[12px]' : 'text-[16px]';

  return (
    <div className="pointer-events-none absolute inset-0 z-[4]" style={{ fontFamily: 'var(--font-pixel)' }}>
      {/* Objective */}
      {objective && (
        <div className={`absolute ${compact ? 'left-1 top-1 max-w-[calc(100%-120px)] px-2 py-1 text-left leading-snug' : 'left-1/2 -translate-x-1/2 top-14 max-w-[80%] px-4 py-2 text-center leading-relaxed'} ${PANEL} rounded-md ${text}`}>
          <span className="text-[#9C4A3E]">&gt; </span>
          {objective}
        </div>
      )}

      {/* Coins, energy, bag button */}
      <div className={`absolute ${compact ? 'right-1 top-8' : 'right-3 top-28'} flex flex-col items-end gap-1.5`}>
        <div className={`${PANEL} rounded-md px-2 py-1 ${text} flex items-center gap-2`}>
          <span title="Coins">Coins {story.coins}</span>
          <span className="flex items-center gap-1" title="Energy">
            <span>Energy</span>
            <span className="flex gap-[1px]">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`inline-block ${compact ? 'w-[4px] h-[8px]' : 'w-[6px] h-[12px]'} ${i < story.energy ? 'bg-[#6E9E5A]' : 'bg-[#D8CBB0]'}`} />
              ))}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleBag}
          className={`pointer-events-auto ${PANEL} rounded-md px-2 py-1 ${text} hover:bg-[#F4E6CC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9C4A3E]`}
        >
          Bag {compact ? '' : '[B]'}
        </button>
      </div>

      {/* Bag panel */}
      {bagOpen && (
        <div className={`pointer-events-auto absolute ${compact ? 'right-1 top-[70px] w-[70%] max-h-[calc(100%-76px)]' : 'right-3 top-[200px] w-[380px] max-h-[calc(100%-212px)]'} overflow-y-auto overscroll-contain ${PANEL} rounded-md p-3 ${text}`}>
          <div className="flex items-center justify-between mb-2">
            <span>Bag</span>
            <button type="button" onClick={onToggleBag} className="px-1 hover:text-[#9C4A3E]" aria-label="Close bag">✕</button>
          </div>
          {items.length === 0 ? (
            <p className="opacity-70 leading-relaxed">Empty. Mother would say that's a good sign you haven't lost anything yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((id) => (
                <li key={id} className="flex gap-2 items-start">
                  <span
                    className={`relative shrink-0 ${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-sm`}
                    style={{ background: `${ITEMS[id].color}33` }}
                  >
                    <img
                      src={itemIcon(id)}
                      alt=""
                      className="absolute inset-0 w-full h-full"
                      draggable={false}
                      onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.style.background = ITEMS[id].color; }}
                    />
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span>{ITEMS[id].name} ×{story.bag[id]}</span>
                      {ITEMS[id].energy ? (
                        <button
                          type="button"
                          onClick={() => eatItem(id)}
                          className="rounded-sm border-2 border-[#4A2E1A] bg-[#F4D98B] px-1.5 leading-tight shadow-[0_2px_0_#4A2E1A] active:translate-y-[1px]"
                          title={`Eat: +${ITEMS[id].energy} energy`}
                        >
                          Eat
                        </button>
                      ) : null}
                    </span>
                    <span className="opacity-70 leading-relaxed" style={{ fontFamily: 'Itim, system-ui, sans-serif', fontSize: compact ? 13 : 17 }}>{ITEMS[id].note}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
