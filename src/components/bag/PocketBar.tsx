import React from 'react';
import type { PocketDef } from '../../game/story/items';

interface PocketBarProps {
  pockets: readonly PocketDef[];
  active: number;
  onPick: (index: number) => void;
}

/** "KEY ITEMS" → "Key" on the tab; the full name is shown beside the backpack. */
export const tabLabel = (label: string) => {
  const word = label.split(' ')[0].toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
};

export const pocketName = (label: string) => {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/** ◂ Items · Fish · Cards · Key ▸ — left/right on the D-pad moves along it. */
export const PocketBar: React.FC<PocketBarProps> = ({ pockets, active, onPick }) => (
  <div className="gm-pockets" role="tablist" aria-label="Pockets">
    <span className="gm-tri gm-tri-left gm-pocket-arrow" aria-hidden="true" />
    {pockets.map((p, i) => (
      <button
        key={p.id}
        type="button"
        role="tab"
        aria-selected={i === active}
        className={`gm-tab${i === active ? ' is-active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onPick(i); }}
      >
        {tabLabel(p.label)}
      </button>
    ))}
    <span className="gm-tri gm-tri-right gm-pocket-arrow" aria-hidden="true" />
  </div>
);
