import React from 'react';

export interface MenuRowData {
  id: string;
  label: string;
  /** Right-aligned value (Options screen). */
  value?: string;
  /** Draw the subtle divider line above this row. */
  dividerAbove?: boolean;
}

interface MenuListProps {
  rows: readonly MenuRowData[];
  active: number;
  /** Mouse/touch: the pointer is over a row (confirm = false) or tapped it (confirm = true). */
  onPoint: (index: number, confirm: boolean) => void;
  /** Show ◂ ▸ around the value of the active row (rows you can change with left/right). */
  adjustable?: boolean;
}

/** The compact vertical list used by the field menu, Emotes and Options. */
export const MenuList: React.FC<MenuListProps> = ({ rows, active, onPoint, adjustable = false }) => (
  <div className="gm-list" role="menu">
    {rows.map((row, i) => {
      const isActive = i === active;
      return (
        <React.Fragment key={row.id}>
          {row.dividerAbove && <div className="gm-divider" aria-hidden="true" />}
          <button
            type="button"
            role="menuitem"
            className={`gm-row${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPoint(i, false); }}
            onClick={(e) => { e.stopPropagation(); onPoint(i, true); }}
          >
            <span className="gm-cursor" aria-hidden="true" />
            <span className="gm-row-label">{row.label}</span>
            {row.value !== undefined && (
              <span className="gm-row-value">
                {adjustable && isActive && <span className="gm-tri gm-tri-left" aria-hidden="true" />}
                {row.value}
                {adjustable && isActive && <span className="gm-tri gm-tri-right" aria-hidden="true" />}
              </span>
            )}
          </button>
        </React.Fragment>
      );
    })}
  </div>
);
