import React, { useEffect, useRef } from 'react';
import { X, MessageSquare } from 'lucide-react';
import type { ChatMessage, FloatColor } from '../game/types';

interface ChatLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  currentUserId: string;
}

export const ChatLogDrawer: React.FC<ChatLogDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  currentUserId,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const floatColorMap: Record<FloatColor, string> = {
    red: '#ef4444',
    blue: '#3b82f6',
    pink: '#ec4899',
    yellow: '#eab308',
    black: '#475569',
    green: '#22c55e',
    purple: '#a855f7',
    gray: '#9ca3af'
  };

  return (
    <div className="absolute top-16 right-3 bottom-20 z-40 w-80 max-w-[90vw] pixel-panel flex flex-col p-3 shadow-2xl pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-sky-400" />
          <span className="text-[16px] font-bold text-white tracking-wider" style={{ fontFamily: 'var(--font-pixel)' }}>
            Chat Log
          </span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
          <X size={15} />
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {messages.length === 0 ? (
          <div className="text-center text-[16px] text-slate-500 py-10">
            No messages yet.<br />Say hello in the pool! 👋
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            });
            const colorDot = msg.floatColor ? floatColorMap[msg.floatColor] : '#38bdf8';

            return (
              <div
                key={msg.id}
                className={`p-2 rounded border text-[16px] ${
                  isMe
                    ? 'bg-sky-950/40 border-sky-800/60 ml-3'
                    : 'bg-slate-900/60 border-slate-800 mr-3'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: colorDot }}
                    />
                    <span className={isMe ? 'text-sky-300' : 'text-slate-200'}>
                      {msg.senderName}
                    </span>
                  </div>
                  <span className="text-[16px] text-slate-500">{timeStr}</span>
                </div>
                <div className="text-slate-100 font-mono text-[16px] break-words">
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
