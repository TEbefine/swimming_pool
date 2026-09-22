import React, { useState } from 'react';
import { X, User } from 'lucide-react';

interface NameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onSaveName: (name: string) => void;
}

export const NameModal: React.FC<NameModalProps> = ({
  isOpen,
  onClose,
  currentName,
  onSaveName,
}) => {
  const [name, setName] = useState(currentName);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSaveName(name.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="w-full max-w-sm pixel-panel p-4 shadow-2xl animate-fade-in border-2 border-sky-500">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <User size={15} className="text-sky-400" />
            <span className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: 'var(--font-pixel)' }}>
              Set Your Name
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] text-slate-300 mb-1.5 font-semibold">
              Nickname / Sailor Name:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={18}
              autoFocus
              className="w-full bg-slate-900 text-white text-xs px-3 py-2 rounded border border-slate-700 focus:outline-none focus:border-sky-400 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="pixel-btn text-xs">
              Cancel
            </button>
            <button type="submit" className="pixel-btn pixel-btn-primary text-xs">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
