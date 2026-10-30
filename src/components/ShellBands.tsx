// The two printed bands of the handheld bezel (designed with Teera, 2026-10-30).
// Top band:    "SAP Co." on the left · a live status word + status light on the right.
// Bottom band: a credit line, "[part] inspired by [source]", with a small dusty-rainbow pixel heart.
// We borrow ideas from games we love, so the frame says so plainly, in our own font, never in their logo style.
import React, { useEffect, useState } from 'react';

export type ShellStatus = 'ready' | 'loading' | 'working' | 'standby';

const STATUS_WORD: Record<ShellStatus, string> = {
  ready: 'READY',
  loading: 'LOADING',
  working: 'SAVING',
  standby: 'STANDBY',
};

/** Top band. `roomName` is not printed any more (rooms announce themselves on screen); it stays for screen readers. */
export const ShellTopBand: React.FC<{ status: ShellStatus; roomName?: string; workingWord?: string }> = ({ status, roomName, workingWord }) => {
  const word = status === 'working' && workingWord ? workingWord : STATUS_WORD[status];
  return (
    <div className="gb-top-band">
      <span className="gb-brand">SAP Co.</span>
      <span className="gb-status" role="status" aria-live="polite">
        {roomName && <span className="sr-only">{roomName}. </span>}
        <span className="gb-status-word">{word}</span>
        <span className={`gb-led gb-led-${status}`} aria-hidden="true" />
      </span>
    </div>
  );
};

export type CreditScene = 'design' | 'fishing' | 'battle';

const CREDITS: Record<CreditScene, { part: string; source: string }> = {
  design: { part: 'design', source: 'Game Boy · Nintendo' },
  fishing: { part: 'fishing', source: 'Stardew Valley' },
  battle: { part: 'battle', source: 'Pokémon' },
};

// 7×6 pixel heart. Dusty rainbow in 45° stripes falling top-left → bottom-right (colour = floor((x + y) / 2)).
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const HEART_PX = HEART.flatMap((row, y) => [...row].flatMap((c, x) => (c === 'X' ? [{ x, y, band: Math.min(5, Math.floor((x + y) / 2)) }] : [])));

/** `rows` = how many rows are lit, counted from the bottom (the heart fills up while the line types). */
const PixelHeart: React.FC<{ rows: number }> = ({ rows }) => (
  <svg className="gb-heart" width="14" height="12" viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden="true">
    {HEART_PX.map(({ x, y, band }) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={y >= 6 - rows ? `var(--gb-heart-${band + 1})` : 'var(--gb-heart-off)'} />
    ))}
  </svg>
);

const TYPE_MS = 38;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Bottom band. Types itself in (like the talk box) only when the scene changes; never loops. */
export const ShellCreditLine: React.FC<{ scene: CreditScene }> = ({ scene }) => {
  const { part, source } = CREDITS[scene];
  const lead = `${part} inspired by `;
  const full = lead + source;
  const [shown, setShown] = useState(full.length);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(full.length);
      return;
    }
    setShown(0);
    let k = 0;
    const timer = window.setInterval(() => {
      k += 1;
      setShown(k);
      if (k >= full.length) window.clearInterval(timer);
    }, TYPE_MS);
    return () => window.clearInterval(timer);
  }, [full]);

  const done = shown >= full.length;
  const text = full.slice(0, shown);
  // The heart is full a little before the text ends.
  const rows = done ? 6 : Math.min(6, Math.ceil((shown / full.length) * 6 * 1.6));

  return (
    <div className={`gb-credit ${prefersReducedMotion() ? 'gb-credit-fade' : ''}`} key={prefersReducedMotion() ? scene : undefined}>
      <span className="sr-only">{full}</span>
      <span className="gb-credit-line" aria-hidden="true">
        <PixelHeart rows={rows} />
        <span>
          <span className="gb-credit-part">{text.slice(0, lead.length)}</span>
          <span className="gb-credit-source">{text.slice(lead.length)}</span>
          {/* The untyped rest keeps its space (invisible) so the centred line doesn't slide while typing. */}
          {!done && <span className="gb-credit-part">_</span>}
          {!done && <span style={{ visibility: 'hidden' }}>{full.slice(shown + 1)}</span>}
        </span>
      </span>
    </div>
  );
};
