import React from 'react';
import type { MenuInput } from './menuModel';

export interface Hint {
  /** The button glyph or key name, drawn in gold. */
  keys: string;
  label: string;
  /** If set, clicking the hint does that (handy with a mouse). */
  input?: MenuInput;
}

interface HintBarProps {
  hints: readonly Hint[];
  onPress: (input: MenuInput) => void;
}

/** Small control hints along the bottom edge of the screen. */
export const HintBar: React.FC<HintBarProps> = ({ hints, onPress }) => (
  <div className="gm-hints">
    {hints.map((h) => (
      <button
        key={h.keys + h.label}
        type="button"
        className="gm-hint"
        tabIndex={-1}
        disabled={!h.input}
        onClick={(e) => { e.stopPropagation(); if (h.input) onPress(h.input); }}
      >
        <span className="gm-key">{h.keys}</span> {h.label}
      </button>
    ))}
  </div>
);

// Game Boy glyphs on the handheld; real key names on a desktop keyboard.
export const hintsFor = (compact: boolean) => ({
  move: { keys: compact ? '▲▼' : '↑↓', label: 'Move' } satisfies Hint,
  item: { keys: compact ? '▲▼' : '↑↓', label: 'Item' } satisfies Hint,
  change: { keys: compact ? '◀▶' : '←→', label: 'Change' } satisfies Hint,
  pocket: { keys: compact ? '◀▶' : '←→', label: 'Pocket' } satisfies Hint,
  select: { keys: compact ? '◯' : 'Z', label: 'Select', input: 'confirm' } satisfies Hint,
  confirm: { keys: compact ? '◯' : 'Z', label: 'Confirm', input: 'confirm' } satisfies Hint,
  back: { keys: compact ? '✕' : 'X', label: 'Back', input: 'back' } satisfies Hint,
  cancel: { keys: compact ? '✕' : 'X', label: 'Cancel', input: 'back' } satisfies Hint,
  close: { keys: compact ? 'START' : 'M', label: 'Close', input: 'start' } satisfies Hint,
});
