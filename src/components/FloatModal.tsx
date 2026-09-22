import React from 'react';
import { X, Check } from 'lucide-react';
import type { FloatColor } from '../game/types';

interface FloatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentColor: FloatColor;
  onSelectColor: (color: FloatColor) => void;
}

export const FloatModal: React.FC<FloatModalProps> = ({
  isOpen,
  onClose,
  currentColor,
  onSelectColor,
}) => {
  if (!isOpen) return null;

  const floatOptions: { id: FloatColor; name: string; bg: string; border: string }[] = [
    { id: 'red', name: 'Classic Red', bg: '#ef4444', border: '#b91c1c' },
    { id: 'blue', name: 'Ocean Blue', bg: '#3b82f6', border: '#1d4ed8' },
    { id: 'pink', name: 'Flamingo Pink', bg: '#ec4899', border: '#be185d' },
    { id: 'yellow', name: 'Sunburst Yellow', bg: '#eab308', border: '#a16207' },
    { id: 'black', name: 'Midnight Black', bg: '#374151', border: '#111827' },
    { id: 'green', name: 'Tropical Green', bg: '#22c55e', border: '#15803d' },
    { id: 'purple', name: 'Grape Purple', bg: '#a855f7', border: '#7e22ce' },
    { id: 'gray', name: 'Steel Gray', bg: '#9ca3af', border: '#4b5563' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="w-full max-w-sm pixel-panel p-4 shadow-2xl animate-fade-in border-2 border-sky-500">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-base">🛟</span>
            <span className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: 'var(--font-pixel)' }}>
              Swim Ring Color
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X size={16} />
          </button>
        </div>

        <p className="text-[11px] text-slate-300 mb-4">
          Choose your favorite swim tube color to wear automatically whenever you enter the pool:
        </p>

        {/* Swatches Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {floatOptions.map((opt) => {
            const isSelected = currentColor === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  onSelectColor(opt.id);
                  onClose();
                }}
                className={`p-2.5 rounded flex items-center gap-2.5 border-2 transition-all ${
                  isSelected
                    ? 'border-white bg-slate-800 shadow-md scale-[1.02]'
                    : 'border-slate-700 bg-slate-900/80 hover:border-slate-500 hover:bg-slate-800/80'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full border border-white/80 shadow flex items-center justify-center shrink-0"
                  style={{ backgroundColor: opt.bg }}
                >
                  {isSelected && <Check size={12} className="text-white drop-shadow" />}
                </div>
                <span className="text-xs text-slate-200 font-semibold">{opt.name}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end">
          <button onClick={onClose} className="pixel-btn pixel-btn-primary text-xs">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
