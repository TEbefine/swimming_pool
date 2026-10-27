import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import type { RoomDefinition } from '../game/types';
import { rooms, isRoomOpen, scheduleLabel, closedLabel } from '../game/rooms';
import { sound } from '../game/audio';
import { Lock } from 'lucide-react';

export interface SceneBoxProps {
  isOpen: boolean;
  currentRoomId: string;
  playerCountByRoom: Record<string, number>;
  onTravel: (roomId: string) => void;
  onClose: () => void;
  /** Direction nudge from mobile D-Pad or gamepad ({dx, dy}) */
  directionNudge?: { dx: number; dy: number; timestamp: number } | null;
  /** Confirm trigger from mobile ◯ button */
  confirmTrigger?: number;
}

const COLS = 3;
/** The window shows 3 columns × 2 rows (6 maps); the rest scroll into view (wheel / swipe / D-pad). */
const VISIBLE_ROWS = 2;

// Every map you can travel to, in order. Story rooms (dalbit_*) stay out: you only enter them through the story.
// fish_shop is only registered where the money system is on (rooms/index.ts), so filter by what exists.
const MAP_ROOM_IDS: string[] = ['town', 'poolside', 'cafe', 'home', 'club', 'lake_pier', 'fish_shop', 'arrival_hall', 'temple'].filter((id) => rooms[id]);
// Fill the last row (and at least the 3×2 window) with locked "???" slots = maps still to come.
const SLOT_ROOM_IDS: (string | null)[] = [
  ...MAP_ROOM_IDS,
  ...Array(Math.max(COLS * VISIBLE_ROWS, Math.ceil(MAP_ROOM_IDS.length / COLS) * COLS) - MAP_ROOM_IDS.length).fill(null),
];
const TOTAL_ROWS = Math.ceil(SLOT_ROOM_IDS.length / COLS);
const PAGES = Math.max(1, Math.ceil(TOTAL_ROWS / VISIBLE_ROWS));

export const SceneBox: React.FC<SceneBoxProps> = ({
  isOpen,
  currentRoomId,
  playerCountByRoom,
  onTravel,
  onClose,
  directionNudge,
  confirmTrigger
}) => {
  // Find initial slot corresponding to current room
  const initialIdx = useMemo(() => {
    const idx = SLOT_ROOM_IDS.indexOf(currentRoomId);
    return idx >= 0 ? idx : 0;
  }, [currentRoomId]);

  const [cursorIdx, setCursorIdx] = useState(initialIdx);
  const [shaking, setShaking] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [gridMaxH, setGridMaxH] = useState<number | undefined>(undefined);

  // Every time the box opens, the cursor starts on the map you're in
  useEffect(() => {
    if (isOpen) setCursorIdx(initialIdx);
  }, [isOpen, initialIdx]);

  // The scroll window is exactly VISIBLE_ROWS rows tall, whatever the screen width (tiles keep their 16:10 shape)
  useLayoutEffect(() => {
    if (!isOpen) return;
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const first = grid.children[0] as HTMLElement | undefined;
      if (!first) return;
      const cs = getComputedStyle(grid);
      const gap = parseFloat(cs.rowGap) || 0;
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      setGridMaxH(Math.ceil(first.offsetHeight * VISIBLE_ROWS + gap * (VISIBLE_ROWS - 1) + pad));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [isOpen]);

  // Keep the cursor's tile in view: jump straight to it when the box opens (after the window has its
  // 2-row height), glide when the D-pad moves past the window
  const jumpedOnOpen = useRef(false);
  useEffect(() => {
    if (!isOpen) { jumpedOnOpen.current = false; return; }
    if (gridMaxH === undefined) return;
    const tile = tileRefs.current[cursorIdx];
    if (!tile) return;
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: jumpedOnOpen.current ? 'smooth' : 'auto' });
    jumpedOnOpen.current = true;
  }, [isOpen, cursorIdx, gridMaxH]);

  // Resolve room for each slot
  const slots: (RoomDefinition | null)[] = useMemo(() => {
    return SLOT_ROOM_IDS.map((id) => (id && rooms[id] ? rooms[id] : null));
  }, []);

  const selectedRoom = slots[cursorIdx];
  const isSelectedOpen = selectedRoom ? isRoomOpen(selectedRoom) : false;
  const isSelectedCurrent = selectedRoom ? selectedRoom.roomId === currentRoomId : false;

  const triggerShake = useCallback(() => {
    sound.playBuzzer();
    setShaking(true);
    setTimeout(() => {
      setShaking(false);
    }, 400);
  }, []);

  // Handle travel attempt on specific slot index
  const handleAttemptTravel = useCallback((idx: number) => {
    const targetRoom = slots[idx];
    if (!targetRoom) {
      // Locked slot
      triggerShake();
      return;
    }

    if (targetRoom.roomId === currentRoomId) {
      // Already here
      triggerShake();
      return;
    }

    if (!isRoomOpen(targetRoom)) {
      // Closed room
      triggerShake();
      return;
    }

    // Success: travel
    sound.playSelect();
    onTravel(targetRoom.roomId);
  }, [slots, currentRoomId, triggerShake, onTravel]);

  // Movement helpers: ◀ ▶ walk through the list (wrapping to the next / previous row), ▲ ▼ move a row
  const moveCursor = useCallback((dx: number, dy: number) => {
    sound.playCursor();
    setCursorIdx((prev) => {
      const last = SLOT_ROOM_IDS.length - 1;
      if (dx !== 0) return Math.max(0, Math.min(last, prev + dx));
      return Math.max(0, Math.min(last, prev + dy * COLS));
    });
  }, []);

  const cursorPage = Math.floor(Math.floor(cursorIdx / COLS) / VISIBLE_ROWS);
  /** Header ◀ ▶: jump a whole page (3×2) */
  const jumpPage = useCallback((dir: number) => {
    sound.playCursor();
    setCursorIdx((prev) => Math.max(0, Math.min(SLOT_ROOM_IDS.length - 1, prev + dir * COLS * VISIBLE_ROWS)));
  }, []);

  // Mobile D-pad nudge watcher
  useEffect(() => {
    if (!isOpen || !directionNudge) return;
    const { dx, dy } = directionNudge;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
      const stepX = dx > 0.4 ? 1 : dx < -0.4 ? -1 : 0;
      const stepY = dy > 0.4 ? 1 : dy < -0.4 ? -1 : 0;
      moveCursor(stepX, stepY);
    }
  }, [isOpen, directionNudge, moveCursor]);

  // Mobile ◯ confirm trigger watcher
  useEffect(() => {
    if (!isOpen || !confirmTrigger) return;
    handleAttemptTravel(cursorIdx);
  }, [isOpen, confirmTrigger, cursorIdx, handleAttemptTravel]);

  // Keyboard navigation & controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === 'escape' || key === 'tab') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(-1, 0);
        return;
      }
      if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(1, 0);
        return;
      }
      if (key === 'arrowup' || key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(0, -1);
        return;
      }
      if (key === 'arrowdown' || key === 's') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(0, 1);
        return;
      }

      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleAttemptTravel(cursorIdx);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, cursorIdx, moveCursor, handleAttemptTravel, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="game-overlay-backdrop absolute inset-0 z-20 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-[2px] animate-fade-in select-none"
      onClick={(e) => {
        // Clicking backdrop closes
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-[540px] bg-[#12192c] border-2 border-sky-400 rounded-sm shadow-[0_0_24px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-white font-mono ${
          shaking ? 'animate-[shake_0.4s_ease-in-out]' : ''
        }`}
        style={{ fontFamily: 'var(--font-pixel)' }}
      >
        {/* Top Header: Retro PC-box title */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1b2640] border-b-2 border-sky-500">
          <div className="flex items-center gap-2">
            <span className="text-[14px] sm:text-[16px] text-amber-300 font-bold tracking-wider flex items-center gap-1">
              SCENES
              <button type="button" onClick={() => jumpPage(-1)} className={cursorPage > 0 ? 'text-amber-300' : 'text-slate-600'} aria-label="Previous page">◀</button>
              {cursorPage + 1}/{PAGES}
              <button type="button" onClick={() => jumpPage(1)} className={cursorPage < PAGES - 1 ? 'text-amber-300' : 'text-slate-600'} aria-label="Next page">▶</button>
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[12px] sm:text-[14px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* 3×2 window of map slots — scrolls to show the rest */}
        <div
          ref={gridRef}
          className="p-2 sm:p-3 bg-[#0d1424] grid grid-cols-3 gap-2 sm:gap-2.5 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#38bdf8_#0d1424]"
          style={{ maxHeight: gridMaxH, scrollPaddingBlock: 10 }}
        >
          {slots.map((room, idx) => {
            const isSelected = cursorIdx === idx;
            const isHere = room?.roomId === currentRoomId;
            const open = room ? isRoomOpen(room) : false;

            return (
              <div
                key={idx}
                ref={(el) => { tileRefs.current[idx] = el; }}
                onClick={() => {
                  if (cursorIdx !== idx) {
                    sound.playCursor();
                    setCursorIdx(idx);
                  } else {
                    handleAttemptTravel(idx);
                  }
                }}
                className={`relative aspect-[16/10] rounded overflow-hidden cursor-pointer border-2 transition-all flex flex-col items-center justify-center ${
                  isSelected
                    ? 'border-amber-400 ring-2 ring-amber-300 ring-offset-1 ring-offset-[#0d1424] shadow-[0_0_12px_rgba(251,191,36,0.6)] animate-pulse'
                    : 'border-slate-700 bg-slate-900/80 hover:border-slate-500'
                }`}
              >
                {room ? (
                  <>
                    {/* Room Thumbnail */}
                    <img
                      src={room.thumbnail}
                      alt={room.name}
                      className={`w-full h-full object-cover select-none ${
                        !open ? 'grayscale brightness-50 contrast-125' : ''
                      }`}
                      draggable={false}
                    />

                    {/* Room Icon (Emoji badge, top-left) */}
                    <div className="game-overlay-backdrop absolute top-1 left-1 px-1 py-0.5 bg-black/70 backdrop-blur-xs rounded text-[12px] sm:text-[14px] leading-none border border-slate-600">
                      {room.icon}
                    </div>

                    {/* "★ HERE" badge if current room */}
                    {isHere && (
                      <div className="absolute top-1 right-1 px-1 py-0.5 bg-amber-400 text-slate-950 font-bold text-[9px] sm:text-[10px] rounded shadow-xs tracking-wider">
                        ★ HERE
                      </div>
                    )}

                    {/* Closed room status banner */}
                    {!open && (
                      <div className="absolute inset-x-0 bottom-0 bg-red-900/90 text-red-200 text-center text-[10px] sm:text-[11px] font-bold py-0.5 border-t border-red-500 tracking-wider">
                        {closedLabel(room)}
                      </div>
                    )}
                  </>
                ) : (
                  /* Empty / Locked Slot */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/70 text-slate-500 gap-1 p-1">
                    <Lock size={16} className="text-slate-600" />
                    <span className="text-[12px] sm:text-[14px] font-bold tracking-widest text-slate-600">
                      ???
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Info Bar: room name · N online · schedule · action hints */}
        <div className="px-3 py-2 bg-[#172138] border-t-2 border-sky-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[11px] sm:text-[13px]">
          {selectedRoom ? (
            <div className="flex flex-wrap items-center gap-1.5 text-slate-200">
              <span className="font-bold text-sky-300">
                {selectedRoom.name}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-300">
                {playerCountByRoom[selectedRoom.roomId] ?? 1} online
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-200">
                {scheduleLabel(selectedRoom)}
              </span>
            </div>
          ) : (
            <div className="text-slate-400 italic">
              Locked Area · <span className="text-slate-500">—</span>
            </div>
          )}

          {/* Controller button action hints */}
          <div className="flex items-center gap-2 text-slate-300 font-bold tracking-wider self-end sm:self-auto shrink-0">
            {selectedRoom && isSelectedOpen && !isSelectedCurrent ? (
              <span className="text-amber-300">◯ Go</span>
            ) : (
              <span className="text-slate-500">◯ Go</span>
            )}
            <span className="text-slate-400">✕ Back</span>
          </div>
        </div>
      </div>

      {/* Embedded Shake Keyframe */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
};
