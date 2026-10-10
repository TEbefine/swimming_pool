import React from 'react';
import type { FieldId } from '../gameMenu/menuModel';
import { FIELD_IDS, FIELD_DIVIDER_BEFORE } from '../gameMenu/menuModel';
import { MenuList, type MenuRowData } from './MenuList';
import './menu.css';

// The field menu (START). It only DRAWS; the cursor and every input live in gameMenu/menuModel.ts.
// Order: Fish book · Bag · {player name} · Emotes · Options · Help · Resume.

const COPY: Record<FieldId, { label: string; description: string }> = {
  fishbook: { label: 'Fish book', description: "Review the fish you've discovered." },
  bag: { label: 'Bag', description: "Check the items you're carrying." },
  name: { label: '', description: 'View your Player ID, recovery backup and nickname.' },
  emotes: { label: 'Emotes', description: 'Wave, sit, jump and more.' },
  options: { label: 'Options', description: 'Sound, music, vibration and quality.' },
  help: { label: 'Help', description: 'Read how to play.' },
  resume: { label: 'Resume', description: 'Close the menu and keep playing.' },
};

export function fieldDescription(index: number): string {
  return COPY[FIELD_IDS[index]]?.description ?? '';
}

export function fieldRows(playerName: string): MenuRowData[] {
  return FIELD_IDS.map((id, i) => ({
    id,
    label: id === 'name' ? playerName : COPY[id].label,
    dividerAbove: i === FIELD_DIVIDER_BEFORE,
  }));
}

interface StartMenuProps {
  playerName: string;
  active: number;
  onPoint: (index: number, confirm: boolean) => void;
}

export const StartMenu: React.FC<StartMenuProps> = ({ playerName, active, onPoint }) => (
  <nav className="gm-frame gm-panel gm-field" aria-label="Menu">
    <MenuList rows={fieldRows(playerName)} active={active} onPoint={onPoint} />
  </nav>
);
