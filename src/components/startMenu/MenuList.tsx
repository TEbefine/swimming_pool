import React from 'react';

export interface MenuItem {
  id: string;
  label: string;
  description: string;
}

interface MenuListProps {
  items: MenuItem[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onConfirmIndex: (index: number) => void;
}

export const MenuList: React.FC<MenuListProps> = ({
  items,
  activeIndex,
  onHoverIndex,
  onConfirmIndex,
}) => {
  return (
    <div className="flex flex-col gap-0.5 w-full">
      {items.map((item, idx) => {
        const isActive = idx === activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            className={`start-menu-row ${isActive ? 'is-active' : ''}`}
            onPointerEnter={() => onHoverIndex(idx)}
            onClick={(e) => {
              e.stopPropagation();
              onHoverIndex(idx);
              onConfirmIndex(idx);
            }}
          >
            <span className="start-menu-cursor" aria-hidden="true">
              {isActive ? '▶' : ''}
            </span>
            <span className="start-menu-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
