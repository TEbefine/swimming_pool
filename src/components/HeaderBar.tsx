import React from 'react';
import { Volume2, VolumeX, MessageSquare, HelpCircle, Palette, User, Gamepad2 } from 'lucide-react';
import { sound } from '../game/audio';
import type { FloatColor } from '../game/types';

interface HeaderBarProps {
  roomName: string;
  playerCount: number;
  playerName: string;
  floatColor: FloatColor;
  onOpenFloatPicker: () => void;
  onOpenNameModal: () => void;
  onOpenHelpModal: () => void;
  onToggleChatLog: () => void;
  chatLogOpen: boolean;
  onToggleMobileMode?: () => void;
  isMobileMode?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  roomName,
  playerCount,
  playerName,
  floatColor,
  onOpenFloatPicker,
  onOpenNameModal,
  onOpenHelpModal,
  onToggleChatLog,
  chatLogOpen,
  onToggleMobileMode,
  isMobileMode,
}) => {
  const [muted, setMuted] = React.useState(sound.isMuted());

  const handleToggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
  };

  const floatColorMap: Record<FloatColor, string> = {
    red: '#ef4444',
    blue: '#3b82f6',
    pink: '#ec4899',
    yellow: '#eab308',
    black: '#374151',
    green: '#22c55e',
    purple: '#a855f7',
    gray: '#9ca3af'
  };

  return (
    <header className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
      {/* Left: Room & Player Info */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="pixel-panel px-3 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🏊</span>
            <div className="flex flex-col">
              <span className="text-[16px] font-bold text-white tracking-wider" style={{ fontFamily: 'var(--font-pixel)' }}>
                {roomName}
              </span>
              <div className="flex items-center gap-2 text-[16px] text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{playerCount} {playerCount === 1 ? 'player' : 'players'} online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Player Name Tag */}
        <button
          onClick={onOpenNameModal}
          className="pixel-panel px-3 py-2 flex items-center gap-2 hover:border-sky-400 transition-colors pointer-events-auto"
          title="Change Name"
        >
          <User size={13} className="text-sky-400" />
          <span className="text-[16px] text-sky-200 font-semibold">{playerName}</span>
        </button>
      </div>

      {/* Right: Actions and Settings */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Float Color Indicator & Trigger */}
        <button
          onClick={onOpenFloatPicker}
          className="pixel-btn flex items-center gap-2"
          title="Select Swim Ring Color"
        >
          <Palette size={13} className="text-amber-400" />
          <div
            className="w-3.5 h-3.5 rounded-full border border-white/60 shadow-sm"
            style={{ backgroundColor: floatColorMap[floatColor] }}
          />
          <span className="hidden sm:inline text-[16px] capitalize">{floatColor}</span>
        </button>

        {/* Audio Mute Toggle */}
        <button
          onClick={handleToggleMute}
          className="pixel-btn"
          title={muted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {muted ? <VolumeX size={14} className="text-rose-400" /> : <Volume2 size={14} className="text-emerald-400" />}
        </button>

        {/* Chat History Toggle */}
        <button
          onClick={onToggleChatLog}
          className={`pixel-btn ${chatLogOpen ? 'pixel-btn-primary' : ''}`}
          title="Toggle Chat History"
        >
          <MessageSquare size={14} />
        </button>

        {/* Toggle Game Boy Handheld Mode */}
        {onToggleMobileMode && (
          <button
            onClick={onToggleMobileMode}
            className={`pixel-btn ${isMobileMode ? 'pixel-btn-accent' : ''}`}
            title="Toggle Game Boy Mode"
          >
            <Gamepad2 size={14} className="text-amber-300" />
            <span className="hidden lg:inline text-[16px]">Game Boy</span>
          </button>
        )}

        {/* Help / Controls Guide */}
        <button
          onClick={onOpenHelpModal}
          className="pixel-btn"
          title="How to Play"
        >
          <HelpCircle size={14} />
        </button>
      </div>
    </header>
  );
};
