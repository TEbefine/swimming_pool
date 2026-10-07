import React from 'react';
import type { PocketId, PocketDef } from '../../game/story/items';

interface PocketBarProps {
  pockets: readonly PocketDef[];
  activePocketIndex: number;
  coins: number;
  onPrevPocket: () => void;
  onNextPocket: () => void;
}

/** 24px inline pixel-style SVGs for each pocket */
function PocketIcon({ id }: { id: PocketId }) {
  switch (id) {
    case 'items':
      // Pixel Rucksack / Bag
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 9V5a3 3 0 0 1 6 0v4" />
          <rect x="4" y="9" width="16" height="12" rx="2" fill="currentColor" fillOpacity="0.15" />
          <line x1="4" y1="14" x2="20" y2="14" />
          <line x1="12" y1="14" x2="12" y2="18" />
        </svg>
      );
    case 'fish':
      // Pixel Fish
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 16s4-8 12-8 6 6 6 6-2 6-6 6-12-8-12-8Z" fill="currentColor" fillOpacity="0.15" />
          <path d="M18 12l4-4v8l-4-4Z" />
          <circle cx="9" cy="11" r="1" fill="currentColor" />
        </svg>
      );
    case 'cards':
      // Pixel Disk / Memory Card
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5V4z" fill="currentColor" fillOpacity="0.15" />
          <rect x="8" y="4" width="8" height="5" />
          <rect x="7" y="13" width="10" height="7" rx="1" />
        </svg>
      );
    case 'key':
      // Pixel Skeleton Key
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="12" r="4" fill="currentColor" fillOpacity="0.15" />
          <line x1="12" y1="12" x2="20" y2="12" />
          <line x1="17" y1="12" x2="17" y2="15" />
          <line x1="20" y1="12" x2="20" y2="16" />
        </svg>
      );
  }
}

export const PocketBar: React.FC<PocketBarProps> = ({
  pockets,
  activePocketIndex,
  coins,
  onPrevPocket,
  onNextPocket,
}) => {
  const currentPocket = pockets[activePocketIndex];

  return (
    <div className="bag-pocket-bar">
      {/* Pocket Switcher */}
      <div className="bag-pocket-selector">
        <button
          type="button"
          onClick={onPrevPocket}
          className="bag-pocket-arrow-btn"
          title="Previous Pocket (←)"
          aria-label="Previous Pocket"
        >
          ◀
        </button>

        <div className="bag-pocket-center">
          <div className="bag-pocket-title-row">
            <span className="text-[#1E293B] dark:text-[#9aa5f2] flex items-center justify-center">
              <PocketIcon id={currentPocket.id} />
            </span>
            <span className="bag-pocket-title">{currentPocket.label}</span>
          </div>

          {/* Dots Indicator: ● ○ ○ ○ */}
          <div className="bag-pocket-dots" aria-hidden="true">
            {pockets.map((p, idx) => (
              <span
                key={p.id}
                className={`bag-pocket-dot ${idx === activePocketIndex ? 'is-active' : ''}`}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onNextPocket}
          className="bag-pocket-arrow-btn"
          title="Next Pocket (→)"
          aria-label="Next Pocket"
        >
          ▶
        </button>
      </div>

      {/* Coins Badge */}
      <div className="bag-coins-badge" title="Your carried coins">
        <span>Coins</span>
        <span className="font-bold">{coins}</span>
      </div>
    </div>
  );
};
