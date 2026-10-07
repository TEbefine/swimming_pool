import React from 'react';
import type { PlayerState } from '../../game/types';

export interface EmoteItem {
  id: string;
  label: string;
  description: string;
  isToggleState?: boolean;
}

interface EmoteScreenProps {
  playerState: PlayerState;
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onConfirmIndex: (index: number) => void;
  onBack: () => void;
}

export function getEmoteItems(playerState: PlayerState): EmoteItem[] {
  const isWater = playerState === 'water';
  if (isWater) {
    return [
      { id: 'wave', label: 'WAVE', description: 'Wave hello to players nearby.' },
      { id: 'relax', label: 'RELAX FLOAT', description: 'Float peacefully on the water.' },
      { id: 'happy', label: 'HAPPY SPLASH', description: 'Splash water joyfully.' },
      { id: 'surprise', label: 'SURPRISE', description: 'Show surprise or shock.' },
      { id: 'talk', label: 'CHAT POSE', description: 'Strike a conversational pose.' },
      { id: 'toggle_state', label: 'STEP OUT', description: 'Step out onto dry land.', isToggleState: true },
    ];
  }

  return [
    { id: 'wave', label: 'WAVE', description: 'Wave hello to players nearby.' },
    { id: 'sit', label: 'SIT DOWN', description: 'Take a restful seat on the floor.' },
    { id: 'lie', label: 'LIE DOWN', description: 'Lie down and relax by the pool.' },
    { id: 'surprise', label: 'SURPRISE', description: 'Show surprise or shock.' },
    { id: 'jump', label: 'JUMP', description: 'Jump with excitement!' },
    { id: 'happy', label: 'HAPPY', description: 'Celebrate with a happy pose.' },
    { id: 'thinking', label: 'THINKING', description: 'Ponder and think deeply.' },
    { id: 'toggle_state', label: 'DIVE IN', description: 'Dive into the pool water.', isToggleState: true },
  ];
}

export const EmoteScreen: React.FC<EmoteScreenProps> = ({
  playerState,
  activeIndex,
  onHoverIndex,
  onConfirmIndex,
  onBack,
}) => {
  const items = getEmoteItems(playerState);

  return (
    <div className="flex flex-col gap-0.5 w-full">
      <div className="start-menu-header">
        <span className="start-menu-header-title">EMOTE</span>
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] font-pixel text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          [✕ BACK]
        </button>
      </div>

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
