import React, { useState } from 'react';
import {
  FREE_BY_ID,
  FREE_FISH,
  READY_SHEETS,
  SEASONS,
  TIERS,
  freeIcon,
  thaiSeason,
  useFishBook,
  type FreeFish,
  type Sheet,
} from '../game/fishing/freeFish';

// The Fish Book (Free Fishing): the wooden storage box from public/ui/fishbook_window.webp,
// Harvest Moon style. Two icon sheets per page (16 kinds each = the 32 slots).
// Caught kinds show their icon + count; unknown kinds are dark shadows.
// Tap / click a slot to read about it. Opens with the "Fish Book" chip or key B.

// Positions measured on the cropped window art (1352 × 953 px, served at half size).
const W = 1352;
const H = 953;
const SLOT = { x0: 104, y0: 149, step: 147, stepY: 148, w: 116, h: 115 };
const PLAQUE = { x: 473, y: 28, w: 407, h: 63 };
const PANEL = { x: 94, y: 745, w: 1161, h: 103 };
const GRID = { x: 96, y: 141, w: 1182, h: 648 };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const box = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
  position: 'absolute',
  left: pct(x, W),
  top: pct(y, H),
  width: pct(w, W),
  height: pct(h, H),
});

/** Page 1 = sheets A + B, page 2 = C + D. A page shows once one of its sheets is ready. */
const PAGES: { title: string; sheets: Sheet[] }[] = [
  { title: 'Fish & Legends', sheets: ['a', 'b'] },
  { title: 'Seasons & Friends', sheets: ['c', 'd'] },
].filter((pg) => pg.sheets.some((sh) => READY_SHEETS.includes(sh as Sheet))) as { title: string; sheets: Sheet[] }[];

const WHERE: Record<string, string> = { near: 'Near the pier', mid: 'Open water', far: 'Deep water', any: 'Anywhere' };
const INK = '#4A2E1A';

/** "Deep water · only at night · Rainy season" — the hint for a kind you haven't caught. */
function hint(f: FreeFish): string {
  const bits = [WHERE[f.where]];
  if (f.time === 'night') bits.push('only at night');
  if (f.time === 'day') bits.push('only in daylight');
  if (f.season) bits.push(`${SEASONS[f.season].label} only`);
  return bits.join(' · ');
}

interface FishBookProps {
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
}

export const FishBook: React.FC<FishBookProps> = ({ open, onToggle, compact = false }) => {
  const book = useFishBook();
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string>(FREE_FISH[0].id);
  const [detail, setDetail] = useState(false); // phone: the big info card over the grid
  const caughtKinds = FREE_FISH.filter((f) => book.entries[f.id]).length;
  const season = thaiSeason();

  const pg = PAGES[Math.min(page, PAGES.length - 1)];
  const onPage = FREE_FISH.filter((f) => pg.sheets.includes(f.sheet));
  const pageCaught = onPage.filter((f) => book.entries[f.id]).length;
  const selFish = FREE_BY_ID[sel] ?? FREE_FISH[0];
  const selEntry = book.entries[selFish.id];
  const turn = (d: number) => {
    const p = (page + d + PAGES.length) % PAGES.length;
    setPage(p);
    setDetail(false);
    const first = FREE_FISH.find((f) => PAGES[p].sheets.includes(f.sheet));
    if (first) setSel(first.id);
  };

  // text sizes scale with the window (cqw = % of its width); phones get a readable minimum
  const fs = (cqw: number, minPx: number) => `max(${minPx}px, ${cqw}cqw)`;

  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" style={{ fontFamily: 'var(--font-pixel)', containerType: 'size' }}>
      {/* the chip that opens it */}
      <button
        type="button"
        onClick={onToggle}
        className={`pointer-events-auto absolute ${compact ? 'right-1 top-1 text-[10px] px-1.5 py-0.5' : 'right-3 top-16 text-[13px] px-2 py-1'} rounded-md border-2 border-[#4A2E1A] bg-[#F4D98B] text-[#4A2E1A] shadow-[0_2px_0_#4A2E1A] active:translate-y-[1px]`}
      >
        Fish Book {caughtKinds}/{FREE_FISH.length}{compact ? '' : ' [B]'}
      </button>

      {open && (
        <div
          className="pointer-events-auto absolute left-1/2"
          style={{
            // fit inside the screen both ways (phones in portrait are tall and narrow)
            ...(compact
              ? { top: '50%', transform: 'translate(-50%, -50%)', width: `min(96cqw, ${(96 * W) / H}cqh)` }
              : { top: 88, transform: 'translateX(-50%)', width: `min(640px, 92cqw, calc((100cqh - 110px) * ${(W / H).toFixed(3)}))` }),
            aspectRatio: `${W} / ${H}`,
            containerType: 'inline-size',
            backgroundImage: 'url(/ui/fishbook_window.webp)',
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 4px 0 rgba(43,27,18,0.55))',
          }}
          role="dialog"
          aria-label="Fish Book"
        >
          {/* season, on the wood left of the plaque */}
          <span
            style={{ ...box(96, 30, 360, 60), display: 'flex', alignItems: 'center', gap: '0.6cqw', fontSize: fs(1.9, 7), color: '#FFF6E5', textShadow: `0 0.2cqw 0 ${INK}` }}
            title={`${SEASONS[season].label} (${SEASONS[season].months})`}
          >
            <span style={{ width: '1.4cqw', height: '1.4cqw', borderRadius: '50%', background: SEASONS[season].color, boxShadow: `0 0 0 0.25cqw ${INK}` }} />
            {SEASONS[season].label}
          </span>

          {/* page turn + title in the plaque */}
          {PAGES.length > 1 && (
            <button type="button" onClick={() => turn(-1)} aria-label="Previous page"
              style={{ ...box(412, 32, 56, 56), fontSize: fs(2.6, 9), color: '#FFF6E5', textShadow: `0 0.2cqw 0 ${INK}` }}>◀</button>
          )}
          <div style={{ ...box(PLAQUE.x, PLAQUE.y, PLAQUE.w, PLAQUE.h), display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, fontSize: fs(2.2, 8), whiteSpace: 'nowrap' }}>
            {pg.title} · {pageCaught}/{onPage.length}
          </div>
          {PAGES.length > 1 && (
            <button type="button" onClick={() => turn(1)} aria-label="Next page"
              style={{ ...box(885, 32, 56, 56), fontSize: fs(2.6, 9), color: '#FFF6E5', textShadow: `0 0.2cqw 0 ${INK}` }}>▶</button>
          )}

          {/* totals + close, on the wood right of the plaque */}
          <span style={{ ...box(950, 30, 250, 60), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: fs(1.8, 7), color: '#FFF6E5', textShadow: `0 0.2cqw 0 ${INK}`, whiteSpace: 'nowrap' }}>
            {caughtKinds}/{FREE_FISH.length} kinds · {book.total} caught
          </span>
          <button type="button" onClick={onToggle} aria-label="Close Fish Book"
            style={{ ...box(1262, 0, 90, 90), fontSize: fs(2.8, 10), color: '#FFF6E5', textShadow: `0 0.25cqw 0 ${INK}` }}>✕</button>

          {/* the 32 slots (empty ones wait for a sheet that isn't cut yet) */}
          {Array.from({ length: 32 }, (_, i) => {
            const f = onPage[i];
            const c = i % 8;
            const r = Math.floor(i / 8);
            const pos = box(SLOT.x0 + c * SLOT.step, SLOT.y0 + r * SLOT.stepY, SLOT.w, SLOT.h);
            if (!f) return <span key={i} style={{ ...pos, background: 'rgba(74,46,26,0.10)' }} />;
            return (
              <Slot key={f.id} style={pos} fish={f} count={book.entries[f.id]?.count ?? 0} selected={f.id === selFish.id}
                onPick={() => { setSel(f.id); if (compact) setDetail(true); }} />
            );
          })}

          {/* info panel */}
          <div style={{ ...box(PANEL.x + 34, PANEL.y + 6, PANEL.w - 68, PANEL.h - 12), display: 'flex', alignItems: 'center', gap: '1.2cqw', color: INK, minWidth: 0 }}>
            <FishIcon fish={selFish} caught={!!selEntry} style={{ height: '100%', aspectRatio: '1', flex: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '0.3cqw' }}>
              <InfoTitle fish={selFish} entry={selEntry} size={fs(2.1, 8)} />
              {!compact && (
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: fs(1.9, 9), opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selEntry ? selFish.note : `${hint(selFish)} · not caught yet`}
                </span>
              )}
            </div>
          </div>

          {/* phone: big readable card over the grid; tap to close */}
          {compact && detail && (
            <button type="button" onClick={() => setDetail(false)}
              style={{ ...box(GRID.x, GRID.y, GRID.w, GRID.h), background: '#FFF6E5', border: `0.4cqw solid ${INK}`, borderRadius: '1cqw', display: 'flex', alignItems: 'center', gap: '3cqw', padding: '3cqw', textAlign: 'left', color: INK }}>
              <FishIcon fish={selFish} caught={!!selEntry} style={{ width: '30%', aspectRatio: '1', flex: 'none' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1.5cqw', minWidth: 0 }}>
                <InfoTitle fish={selFish} entry={selEntry} size="max(10px, 4cqw)" />
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 'max(11px, 4.4cqw)', lineHeight: 1.25 }}>
                  {selEntry ? selFish.note : `${hint(selFish)}. Not caught yet.`}
                </span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const InfoTitle: React.FC<{ fish: FreeFish; entry?: { count: number; best: number | null }; size: string }> = ({ fish, entry, size }) => (
  <span style={{ fontSize: size, display: 'flex', flexWrap: 'wrap', columnGap: '0.8em', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
    <span style={{ background: TIERS[fish.tier].color, color: '#fff', padding: '0 0.35em', borderRadius: 2, fontSize: '0.8em' }}>{TIERS[fish.tier].label}</span>
    <span>{entry ? fish.name : '???'}</span>
    {entry && <span style={{ opacity: 0.7 }}>×{entry.count}</span>}
    {entry?.best != null && <span style={{ opacity: 0.7 }}>best {entry.best} cm</span>}
    {entry && fish.release && <span style={{ opacity: 0.7 }}>released ♡</span>}
  </span>
);

const Slot: React.FC<{ fish: FreeFish; count: number; selected: boolean; style: React.CSSProperties; onPick: () => void }> = ({ fish, count, selected, style, onPick }) => (
  <button
    type="button"
    onClick={onPick}
    style={{
      ...style,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: selected ? `0 0 0 0.35cqw #FFFFFF, inset 0 0 0 0.35cqw ${TIERS.legend.color}` : undefined,
      borderRadius: '0.3cqw',
    }}
    aria-label={count ? fish.name : 'Unknown fish'}
  >
    <FishIcon fish={fish} caught={count > 0} style={{ width: '82%', height: '82%' }} />
    {/* tier stripe */}
    <span style={{ position: 'absolute', left: '8%', right: '8%', bottom: '5%', height: '6%', borderRadius: 99, background: TIERS[fish.tier].color, opacity: count ? 1 : 0.5 }} />
    {count > 1 && (
      <span style={{ position: 'absolute', right: '3%', top: '3%', fontSize: 'max(7px, 1.3cqw)', lineHeight: 1, padding: '0.15cqw 0.3cqw', borderRadius: 2, background: INK, color: '#FFF6E5' }}>{count}</span>
    )}
  </button>
);

/** The fish's icon; unknown fish = dark shadow. Falls back to a stand-in if the icon is missing. */
const FishIcon: React.FC<{ fish: FreeFish; caught: boolean; style: React.CSSProperties }> = ({ fish, caught, style }) => (
  <img
    src={freeIcon(fish.id)}
    alt=""
    draggable={false}
    style={{ ...style, objectFit: 'contain', filter: caught ? undefined : 'brightness(0) opacity(0.3)' }}
    onError={(e) => {
      const img = e.currentTarget;
      img.onerror = null;
      img.src = '/sprites/items/mackerel.webp';
    }}
  />
);
