import React from 'react';
import { getDraftMeta, useStory } from '../game/story/storyStore';
import { objectiveFor } from '../game/story/dalbitPrologue';
import { useCloud } from '../game/saves/cloud';

// Story mode overlay for Dalbit rooms: the current objective, coins + energy, and the bag.
// Colours follow the dialogue box (cream #FFF6E5, brown border #4A2E1A) so it feels like one UI.

interface StoryHudProps {
  bagOpen: boolean;
  onToggleBag: () => void;
  /** Smaller layout inside the Game Boy screen. */
  compact?: boolean;
}

const PANEL = 'bg-[#FFF6E5] border-2 border-[#4A2E1A] text-[#4A2E1A] shadow-[0_2px_0_#4A2E1A]';

export const StoryHud: React.FC<StoryHudProps> = ({ bagOpen: _bagOpen, onToggleBag, compact = false }) => {
  const story = useStory();
  const objective = objectiveFor(story);
  // Player ID (ID-01 c): the day saves itself at its end — say so, quietly.
  const cloud = useCloud();
  const dayEnd = story.step === `d${story.day}_end`;
  const savedDay = getDraftMeta()?.savedDay ?? 0;
  const saveNote = !cloud.address || !dayEnd ? null
    : savedDay >= story.day ? `Day ${story.day} is saved to your Player ID.`
    : cloud.storyStatus === 'saving' ? 'Saving to your Player ID…'
    : cloud.storyStatus === 'failed' || cloud.status === 'offline' ? 'Not saved yet. It will retry when you are online.' : null;
  const text = compact ? 'text-[12px]' : 'text-[16px]';

  return (
    <div className="pointer-events-none absolute inset-0 z-[4]" style={{ fontFamily: 'var(--font-pixel)' }}>
      {/* Objective */}
      {objective && (
        <div className={`absolute ${compact ? 'left-1 top-1 max-w-[calc(100%-120px)] px-2 py-1 text-left leading-snug' : 'left-1/2 -translate-x-1/2 top-14 max-w-[80%] px-4 py-2 text-center leading-relaxed'} ${PANEL} rounded-md ${text}`}>
          <span className="text-[#9C4A3E]">&gt; </span>
          {objective}
          {saveNote && <div className={`${compact ? 'text-[10px]' : 'text-[13px]'} text-[#6E9E5A]`}>{saveNote}</div>}
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
    </div>
  );
};
