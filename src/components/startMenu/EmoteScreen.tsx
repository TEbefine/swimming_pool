import React from 'react';
import type { PlayerState } from '../../game/types';
import { MenuList } from './MenuList';

export interface EmoteItem {
  id: string;
  label: string;
  description: string;
  isToggleState?: boolean;
}

export function getEmoteItems(playerState: PlayerState): EmoteItem[] {
  const isWater = playerState === 'water';
  if (isWater) {
    return [
      { id: 'wave', label: 'Wave', description: 'Wave hello to players nearby.' },
      { id: 'relax', label: 'Relax float', description: 'Float peacefully on the water.' },
      { id: 'happy', label: 'Happy splash', description: 'Splash water joyfully.' },
      { id: 'surprise', label: 'Surprise', description: 'Show surprise or shock.' },
      { id: 'talk', label: 'Chat pose', description: 'Strike a conversational pose.' },
      { id: 'toggle_state', label: 'Step out', description: 'Step out onto dry land.', isToggleState: true },
    ];
  }

  return [
    { id: 'wave', label: 'Wave', description: 'Wave hello to players nearby.' },
    { id: 'sit', label: 'Sit down', description: 'Take a restful seat on the floor.' },
    { id: 'lie', label: 'Lie down', description: 'Lie down and relax by the pool.' },
    { id: 'surprise', label: 'Surprise', description: 'Show surprise or shock.' },
    { id: 'jump', label: 'Jump', description: 'Jump with excitement!' },
    { id: 'happy', label: 'Happy', description: 'Celebrate with a happy pose.' },
    { id: 'thinking', label: 'Thinking', description: 'Ponder and think deeply.' },
    { id: 'toggle_state', label: 'Dive in', description: 'Dive into the pool water.', isToggleState: true },
  ];
}

interface EmoteScreenProps {
  items: readonly EmoteItem[];
  active: number;
  onPoint: (index: number, confirm: boolean) => void;
}

export const EmoteScreen: React.FC<EmoteScreenProps> = ({ items, active, onPoint }) => (
  <nav className="gm-frame gm-panel gm-field" aria-label="Emotes">
    <div className="gm-panel-title">Emotes</div>
    <MenuList rows={items.map((e) => ({ id: e.id, label: e.label }))} active={active} onPoint={onPoint} />
  </nav>
);
