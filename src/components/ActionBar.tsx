import type { PlayerState } from '../game/types';

interface ActionBarProps {
  playerState: PlayerState;
  currentAction: string;
  onTriggerEmote: (action: string) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  playerState,
  currentAction,
  onTriggerEmote
}) => {
  const isWater = playerState === 'water';

  const landEmotes = [
    { id: 'wave', label: 'Wave', hotkey: '1', emoji: '👋' },
    { id: 'sit', label: 'Sit', hotkey: '2', emoji: '🧘' },
    { id: 'lie', label: 'Lie Down', hotkey: '3', emoji: '🛌' },
    { id: 'surprise', label: 'Surprise', hotkey: '4', emoji: '❗' },
    { id: 'jump', label: 'Jump', hotkey: '5', emoji: '⭐' },
    { id: 'happy', label: 'Happy', emoji: '😄' },
    { id: 'thinking', label: 'Thinking', emoji: '❓' },
  ];

  const waterEmotes = [
    { id: 'wave', label: 'Wave', hotkey: '1', emoji: '👋' },
    { id: 'relax', label: 'Relax Float', hotkey: '2', emoji: '🎵' },
    { id: 'happy', label: 'Happy Splash', hotkey: '3', emoji: '✨' },
    { id: 'surprise', label: 'Surprise', hotkey: '4', emoji: '❗' },
    { id: 'talk', label: 'Chat Pose', hotkey: '5', emoji: '💬' },
  ];

  const activeList = isWater ? waterEmotes : landEmotes;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 pixel-panel shadow-2xl pointer-events-auto max-w-[95vw] overflow-x-auto">
      <div className="text-[9px] font-bold text-sky-400 px-2 uppercase tracking-wider hidden sm:block">
        {isWater ? '🏊 Water' : '🏖️ Land'}
      </div>
      {activeList.map((item) => {
        const isActive = currentAction === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onTriggerEmote(item.id)}
            className={`pixel-btn text-[11px] px-2.5 py-1.5 flex items-center gap-1.5 ${
              isActive ? 'pixel-btn-accent' : ''
            }`}
            title={`${item.label} ${item.hotkey ? `[${item.hotkey}]` : ''}`}
          >
            <span>{item.emoji}</span>
            <span className="hidden md:inline">{item.label}</span>
            {item.hotkey && (
              <span className="hotkey-badge">{item.hotkey}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
