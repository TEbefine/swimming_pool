import React from 'react';
import { MenuList } from './MenuList';
import { OPTION_ROWS } from './optionRows';

interface OptionsScreenProps {
  active: number;
  onPoint: (index: number, confirm: boolean) => void;
}

/** Real settings. Values are read each render; the menu bumps `tick` after every change. */
export const OptionsScreen: React.FC<OptionsScreenProps> = ({ active, onPoint }) => (
  <nav className="gm-frame gm-panel gm-field gm-field-wide" aria-label="Options">
    <div className="gm-panel-title">Options</div>
    <MenuList
      rows={OPTION_ROWS.map((o) => ({ id: o.id, label: o.label, value: o.value() }))}
      active={active}
      onPoint={onPoint}
      adjustable
    />
  </nav>
);
