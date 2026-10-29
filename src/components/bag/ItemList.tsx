import React, { useEffect, useRef } from 'react';
import { ITEMS, type ItemId } from '../../game/story/items';

export interface BagItemRowData {
  id: string;
  name?: string;
  count: number;
  /** Shown instead of ×count (a fish's freshness countdown). */
  right?: string;
}

interface ItemListProps {
  items: readonly BagItemRowData[];
  emptyText?: string;
  active: number;
  /** An action menu is open on top: the cursor stays, but this list takes no input. */
  held: boolean;
  onPoint: (index: number, confirm: boolean) => void;
}

/** Names on the left, quantities right-aligned. Displays story items and caught free fish. */
export const ItemList: React.FC<ItemListProps> = ({ items, emptyText, active, held, onPoint }) => {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the cursor row in view when the list is longer than the box.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active, items.length]);

  if (items.length === 0) {
    return (
      <div className="gm-frame gm-list-frame">
        {emptyText && <p className="gm-empty">{emptyText}</p>}
      </div>
    );
  }

  return (
    <div className={`gm-frame gm-list-frame${held ? ' is-held' : ''}`} role="listbox" aria-label="Items">
      {items.map((it, i) => {
        const isActive = i === active;
        const displayName = it.name ?? ITEMS[it.id as ItemId]?.name ?? it.id;
        return (
          <button
            key={it.id}
            ref={isActive ? activeRef : null}
            type="button"
            role="option"
            aria-selected={isActive}
            className={`gm-row gm-item-row${isActive ? ' is-active' : ''}`}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !held) onPoint(i, false); }}
            onClick={(e) => { e.stopPropagation(); onPoint(i, true); }}
          >
            <span className="gm-cursor" aria-hidden="true" />
            <span className="gm-row-label">{displayName}</span>
            <span className="gm-qty">{it.right ?? `×${it.count}`}</span>
          </button>
        );
      })}
    </div>
  );
};
