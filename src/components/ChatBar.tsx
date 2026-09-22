import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';

interface ChatBarProps {
  onSendMessage: (text: string) => void;
  onOpenEmotes?: () => void;
}

export const ChatBar: React.FC<ChatBarProps> = ({ onSendMessage }) => {
  const [text, setText] = useState('');
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickPhrases = [
    "Come in the pool! 🏊",
    "Water feels great! 🌊",
    "Nice float ring! ✨",
    "Marco!",
    "Polo! 🎯",
    "Catch me if you can! ⚡"
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSendMessage(text);
      setText('');
      setShowQuickPhrases(false);
    }
  };

  const handleSelectQuick = (phrase: string) => {
    onSendMessage(phrase);
    setShowQuickPhrases(false);
    inputRef.current?.focus();
  };

  // Keyboard shortcut to focus chat: pressing 'Enter' when not focused
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4 pointer-events-auto">
      {/* Quick Phrase Popover */}
      {showQuickPhrases && (
        <div className="mb-2 p-2 pixel-panel flex flex-wrap gap-1.5 shadow-2xl animate-fade-in">
          <div className="w-full text-[9px] text-sky-300 font-bold uppercase tracking-wider mb-1">
            Quick Shouts:
          </div>
          {quickPhrases.map((phrase, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectQuick(phrase)}
              className="pixel-btn text-[10px] py-1 px-2"
            >
              {phrase}
            </button>
          ))}
        </div>
      )}

      {/* Main Chat Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 pixel-panel p-1.5 shadow-2xl">
        <button
          type="button"
          onClick={() => setShowQuickPhrases(!showQuickPhrases)}
          className={`pixel-btn px-2 py-1.5 ${showQuickPhrases ? 'pixel-btn-accent' : ''}`}
          title="Quick Phrases"
        >
          <Smile size={15} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message & press Enter... (Say hi!)"
          maxLength={90}
          className="flex-1 bg-slate-900/90 text-white placeholder-slate-500 text-xs px-3 py-2 rounded border border-slate-700 focus:outline-none focus:border-sky-400 font-mono"
        />

        <button
          type="submit"
          disabled={!text.trim()}
          className="pixel-btn pixel-btn-primary px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Send Message"
        >
          <Send size={13} />
          <span className="hidden sm:inline text-xs">Send</span>
        </button>
      </form>
    </div>
  );
};
