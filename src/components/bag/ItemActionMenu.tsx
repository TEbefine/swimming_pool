import React from 'react';
import { ACTION_LABEL } from '../../game/story/bagActions';
import type { ActionPopup } from '../gameMenu/menuModel';

interface ItemActionMenuProps {
  popup: ActionPopup;
  onPoint: (index: number, confirm: boolean) => void;
}

/** Small contextual menu over the inventory: the item's real actions, then Cancel. */
export const ItemActionMenu: React.FC<ItemActionMenuProps> = ({ popup, onPoint }) => {
  const rows = [...popup.actions.map((a) => ACTION_LABEL[a]), 'Cancel'];
  return (
    <div className="gm-frame gm-popup" role="menu" aria-label="Item actions" onClick={(e) => e.stopPropagation()}>
      {rows.map((label, i) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          className={`gm-row${i === popup.cursor ? ' is-active' : ''}`}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPoint(i, false); }}
          onClick={(e) => { e.stopPropagation(); onPoint(i, true); }}
        >
          <span className="gm-cursor" aria-hidden="true" />
          <span className="gm-row-label">{label}</span>
        </button>
      ))}
    </div>
  );
};
