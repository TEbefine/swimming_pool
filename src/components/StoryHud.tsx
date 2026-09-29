import React from 'react';
import { useStory, type ItemId } from '../game/story/storyStore';
import { objectiveFor } from '../game/story/dalbitPrologue';
import { ITEMS } from '../game/story/items';

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
        <div className={`absolute left-1/2 -translate-x-1/2 ${compact ? 'top-1' : 'top-14'} ${PANEL} rounded-md px-4 py-2 ${text} max-w-[80%] text-center leading-relaxed`}>
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
        <div className={`pointer-events-auto absolute ${compact ? 'right-1 top-[70px] w-[70%]' : 'right-3 top-[200px] w-[380px]'} ${PANEL} rounded-md p-3 ${text}`}>
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
                  <span className="mt-[2px] inline-block w-3 h-3 border border-[#4A2E1A] shrink-0" style={{ background: ITEMS[id].color }} />
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span>{ITEMS[id].name} ×{story.bag[id]}</span>
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
