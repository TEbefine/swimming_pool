import React, { useEffect, useRef } from 'react';
import { ITEMS, type ItemId } from '../../game/story/items';

export interface BagItemRowData {
  id: ItemId;
  count: number;
}

interface ItemListProps {
  items: BagItemRowData[];
  activeRowIndex: number;
  onHoverIndex: (index: number) => void;
  onConfirmIndex: (index: number) => void;
}

export const ItemList: React.FC<ItemListProps> = ({
  items,
  activeRowIndex,
  onHoverIndex,
  onConfirmIndex,
}) => {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to keep active row in view
  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeRowIndex]);

  const closeBagIndex = items.length;

  return (
    <div ref={listContainerRef} className="bag-item-list-container">
      {items.length === 0 && (
        <div className="bag-empty-notice">
          Empty. Mother would say that's a good sign you haven't lost anything yet.
        </div>
      )}

      {items.map((it, idx) => {
        const itemDef = ITEMS[it.id];
        const isActive = idx === activeRowIndex;

        return (
          <button
            key={it.id}
            ref={isActive ? activeRowRef : null}
            type="button"
            className={`bag-item-row ${isActive ? 'is-active' : ''}`}
            onPointerEnter={() => onHoverIndex(idx)}
            onClick={(e) => {
              e.stopPropagation();
              onHoverIndex(idx);
              onConfirmIndex(idx);
            }}
          >
            <div className="bag-item-left">
              <span className="bag-cursor" aria-hidden="true">
                {isActive ? '▶' : ''}
              </span>
              <span className="bag-item-name">{itemDef.name}</span>
            </div>

            <span className="bag-item-qty">×{it.count}</span>
          </button>
        );
      })}

      {/* The last row is always CLOSE BAG */}
      <button
        ref={activeRowIndex === closeBagIndex ? activeRowRef : null}
        type="button"
        className={`bag-item-row ${activeRowIndex === closeBagIndex ? 'is-active' : ''}`}
        onPointerEnter={() => onHoverIndex(closeBagIndex)}
        onClick={(e) => {
          e.stopPropagation();
          onHoverIndex(closeBagIndex);
          onConfirmIndex(closeBagIndex);
        }}
      >
        <div className="bag-item-left">
          <span className="bag-cursor" aria-hidden="true">
            {activeRowIndex === closeBagIndex ? '▶' : ''}
          </span>
          <span className="bag-item-name uppercase font-bold text-slate-600 dark:text-slate-400">
            CLOSE BAG
          </span>
        </div>
      </button>
    </div>
  );
};
