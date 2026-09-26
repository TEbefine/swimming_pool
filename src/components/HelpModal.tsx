import React from 'react';
import { X, HelpCircle, Navigation, Waves, MessageSquare, Sparkles } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="w-full max-w-md pixel-panel p-4 shadow-2xl animate-fade-in border-2 border-sky-500 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <HelpCircle size={15} className="text-sky-400" />
            <span className="text-[16px] font-bold text-white tracking-wider" style={{ fontFamily: 'var(--font-pixel)' }}>
              How to Play
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 text-[16px] text-slate-300">
          {/* Movement */}
          <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
            <div className="flex items-center gap-2 font-bold text-sky-400 mb-1">
              <Navigation size={13} />
              <span>Movement & Controls</span>
            </div>
            <p className="text-[16px] leading-relaxed text-slate-400">
              • <strong className="text-white">WASD</strong> or <strong className="text-white">Arrow Keys</strong> to walk or swim.<br />
              • <strong className="text-white">Click or Tap anywhere</strong> to navigate with click-to-move.<br />
              • Character flips automatically to face your movement direction.
            </p>
          </div>

          {/* Scene Travel & Game Boy Buttons */}
          <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
            <div className="flex items-center gap-2 font-bold text-emerald-400 mb-1">
              <Sparkles size={13} />
              <span>Room Travel & Handheld Buttons</span>
            </div>
            <p className="text-[16px] leading-relaxed text-slate-400">
              • <strong className="text-white">SELECT</strong> / <strong className="text-white">Tab</strong>: Open the Scene Box to travel between rooms (Sunny Poolside, Chill Café, & My Room).<br />
              • <strong className="text-white">△ (Triangle)</strong>: Open mobile chat drawer.<br />
              • <strong className="text-white">START</strong>: Open mobile emotes menu.<br />
              • <strong className="text-white">◯ (Circle)</strong> / <strong className="text-white">Enter</strong>: Talk to NPCs, sit down, or confirm room travel.<br />
              • <strong className="text-white">✕ (Cross)</strong> / <strong className="text-white">Esc</strong>: Stand up, close dialogs, or cancel Scene Box.<br />
              • <strong className="text-white">Dev / Sky</strong>: Add <code className="text-amber-300">?hour=19.5</code> to the URL to preview sunset, city tints, night lighting, and movers.
            </p>
          </div>

          {/* Water & Pool */}
          <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
            <div className="flex items-center gap-2 font-bold text-cyan-400 mb-1">
              <Waves size={13} />
              <span>Swimming & Pool Mechanics</span>
            </div>
            <p className="text-[16px] leading-relaxed text-slate-400">
              • Walking into the pool automatically switches to <strong className="text-white">Water Mode</strong>, equips your float tube, and generates splash ripples.<br />
              • Use pool ladders to climb between the upper deck and water.<br />
              • Customize your swim ring color anytime via the palette icon (Red, Blue, Pink, Yellow, Black, Green, Purple, Gray).
            </p>
          </div>

          {/* Chat */}
          <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
            <div className="flex items-center gap-2 font-bold text-amber-400 mb-1">
              <MessageSquare size={13} />
              <span>Speech Bubbles & Chat</span>
            </div>
            <p className="text-[16px] leading-relaxed text-slate-400">
              • Press <strong className="text-white">Enter</strong> to quickly focus the chat bar.<br />
              • Messages appear in an authentic 8-bit speech bubble above your avatar for 5 seconds.<br />
              • Open another browser tab to hangout and chat with yourself in real time!
            </p>
          </div>

          {/* Emotes */}
          <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
            <div className="flex items-center gap-2 font-bold text-pink-400 mb-1">
              <Sparkles size={13} />
              <span>Expressive Emotes</span>
            </div>
            <p className="text-[16px] leading-relaxed text-slate-400">
              • Press <strong className="text-white">1 to 5</strong> or use the bottom action bar for poses: Wave, Sit/Lie, Relax, Surprise, Jump, Happy, and Thinking.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="pixel-btn pixel-btn-primary text-[16px]">
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
