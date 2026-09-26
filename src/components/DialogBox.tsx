import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { DialogLine } from '../game/content/dialogues';
import { resolveDialogText, isTipLine } from '../game/content/dialogues';

interface DialogBoxProps {
  npcName: string;
  lines: DialogLine[];
  onLineChange?: (lineIndex: number, pose?: string) => void;
  onClose: () => void;
}

const CHARS_PER_SEC = 40;
const TIP_LS_KEY = 'pixel_pool_tip_read';

/** Mark today's tip as read in localStorage. */
function markTipRead(): void {
  try {
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    localStorage.setItem(TIP_LS_KEY, dateStr);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export const DialogBox: React.FC<DialogBoxProps> = ({ npcName, lines, onLineChange, onClose }) => {
  const [lineIndex, setLineIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const charIndexRef = useRef(0);
  const timerRef = useRef<number>(0);

  const currentLine = lines[lineIndex];
  const resolvedText = resolveDialogText(currentLine.text);

  // Notify parent of current pose on line change
  useEffect(() => {
    onLineChange?.(lineIndex, currentLine.pose);

    // If this is the {tip} line, mark it read
    if (isTipLine(currentLine.text)) {
      markTipRead();
    }
  }, [lineIndex, currentLine.pose, currentLine.text, onLineChange]);

  // Typewriter effect
  useEffect(() => {
    charIndexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);

    const interval = 1000 / CHARS_PER_SEC;
    timerRef.current = window.setInterval(() => {
      charIndexRef.current += 1;
      const next = resolvedText.slice(0, charIndexRef.current);
      setDisplayedText(next);
      if (charIndexRef.current >= resolvedText.length) {
        setIsComplete(true);
        window.clearInterval(timerRef.current);
      }
    }, interval);

    return () => {
      window.clearInterval(timerRef.current);
    };
  }, [resolvedText]);

  const advance = useCallback(() => {
    if (!isComplete) {
      // Skip typewriter — show full text immediately
      window.clearInterval(timerRef.current);
      charIndexRef.current = resolvedText.length;
      setDisplayedText(resolvedText);
      setIsComplete(true);
      return;
    }

    if (lineIndex < lines.length - 1) {
      setLineIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [isComplete, lineIndex, lines.length, resolvedText, onClose]);

  // Keyboard: E / O / Enter / Space to advance
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 'e' || key === 'o' || key === 'enter' || key === ' ') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance]);

  return (
    <div
      onClick={advance}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '30%',
        minHeight: '100px',
        maxHeight: '200px',
        cursor: 'pointer',
        zIndex: 30,
        pointerEvents: 'auto',
      }}
    >
      {/* Dialog box container */}
      <div
        style={{
          position: 'absolute',
          inset: '6px',
          background: '#FFF6E5',
          border: '3px solid #4A2E1A',
          borderRadius: '2px',
          display: 'flex',
          flexDirection: 'column',
          imageRendering: 'pixelated',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
        }}
      >
        {/* Name tag tab */}
        <div
          style={{
            position: 'absolute',
            top: '-18px',
            left: '8px',
            background: '#4A2E1A',
            color: '#FFF6E5',
            padding: '2px 10px',
            fontSize: '11px',
            fontFamily: '"Nuan Pixel", monospace',
            fontWeight: 'bold',
            lineHeight: '14px',
            borderRadius: '2px 2px 0 0',
          }}
        >
          {npcName}
        </div>

        {/* Text content */}
        <div
          style={{
            flex: 1,
            padding: '12px 14px 8px',
            fontSize: '14px',
            fontFamily: '"Nuan Pixel", monospace',
            color: '#3A2010',
            lineHeight: '1.5',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {displayedText}
        </div>

        {/* Blinking advance indicator */}
        {isComplete && (
          <div
            style={{
              position: 'absolute',
              bottom: '6px',
              right: '10px',
              fontSize: '12px',
              color: '#4A2E1A',
              animation: 'dialogBlink 0.8s step-start infinite',
              fontFamily: 'monospace',
            }}
          >
            ▼
          </div>
        )}
      </div>

      {/* Keyframe injection for blink animation */}
      <style>{`
        @keyframes dialogBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
