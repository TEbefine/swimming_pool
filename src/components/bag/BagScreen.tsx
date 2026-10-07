import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStory } from '../../game/story/storyStore';
import {
  ITEM_IDS,
  ITEMS,
  POCKETS,
  pocketOf,
  itemIcon,
  type PocketId,
} from '../../game/story/items';
import { sound } from '../../game/audio';
import { triggerHaptic } from '../../game/haptics';
import { PocketBar } from './PocketBar';
import { ItemList, type BagItemRowData } from './ItemList';
import './bag.css';

export interface BagScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  directionNudge?: { dx: number; dy: number; timestamp: number } | null;
  confirmTrigger?: number;
  cancelTrigger?: number;
}

export const BagScreen: React.FC<BagScreenProps> = ({
  isOpen,
  onClose,
  onBack,
  directionNudge,
  confirmTrigger,
  cancelTrigger,
}) => {
  const story = useStory();

  // Active pocket (0 = ITEMS, 1 = FISH, 2 = CARDS, 3 = KEY ITEMS)
  const [activePocketIndex, setActivePocketIndex] = useState(0);

  // Pokémon feature: each pocket remembers its own cursor row index
  const [pocketCursors, setPocketCursors] = useState<Record<PocketId, number>>({
    items: 0,
    fish: 0,
    cards: 0,
    key: 0,
  });

  const currentPocketId = POCKETS[activePocketIndex].id;

  // Group carried items (> 0) into pockets in ITEM_IDS order
  const pocketItemsMap = useMemo(() => {
    const map: Record<PocketId, BagItemRowData[]> = {
      items: [],
      fish: [],
      cards: [],
      key: [],
    };

    for (const id of ITEM_IDS) {
      const count = story.bag[id] ?? 0;
      if (count > 0) {
        const pocket = pocketOf(id);
        map[pocket].push({ id, count });
      }
    }

    return map;
  }, [story.bag]);

  const itemsInActivePocket = pocketItemsMap[currentPocketId];
  const maxRowIndex = itemsInActivePocket.length; // items.length is the CLOSE BAG row

  // Keep current pocket's cursor bounded
  const currentCursor = Math.max(
    0,
    Math.min(pocketCursors[currentPocketId] ?? 0, maxRowIndex)
  );

  // Navigation handlers
  const changePocket = useCallback((delta: number) => {
    sound.playCursor();
    triggerHaptic(12);
    setActivePocketIndex((prev) => {
      const total = POCKETS.length;
      return (prev + delta + total) % total;
    });
  }, []);

  const moveCursor = useCallback((delta: number) => {
    sound.playCursor();
    triggerHaptic(10);
    setPocketCursors((prev) => {
      const current = prev[currentPocketId] ?? 0;
      const totalRows = maxRowIndex + 1; // items + CLOSE BAG
      const next = (current + delta + totalRows) % totalRows;
      return { ...prev, [currentPocketId]: next };
    });
  }, [currentPocketId, maxRowIndex]);

  const setCursorRow = useCallback((row: number) => {
    setPocketCursors((prev) => ({
      ...prev,
      [currentPocketId]: Math.max(0, Math.min(row, maxRowIndex)),
    }));
  }, [currentPocketId, maxRowIndex]);

  // Confirm action (in Step 1: on CLOSE BAG closes bag; on item plays select)
  const handleConfirm = useCallback(() => {
    if (currentCursor === maxRowIndex) {
      // CLOSE BAG selected
      sound.playBack();
      triggerHaptic(15);
      onBack();
      return;
    }

    // Item selected
    sound.playSelect();
    triggerHaptic(15);
    // In Step 2, this will open the ActionMenu (EAT / CHECK / CANCEL)
  }, [currentCursor, maxRowIndex, onBack]);

  const handleBackAction = useCallback(() => {
    sound.playBack();
    triggerHaptic(15);
    onBack();
  }, [onBack]);

  // Keyboard navigation when bag is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const code = e.code;
      const key = e.key.toLowerCase();

      // B key toggles/closes bag
      if (code === 'KeyB' || key === 'b') {
        e.preventDefault();
        e.stopPropagation();
        handleBackAction();
        return;
      }

      // START key (M, P, `) closes everything
      if (code === 'KeyM' || code === 'KeyP' || code === 'Backquote') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // X or Escape backs out
      if (code === 'KeyX' || code === 'Escape' || key === 'x' || key === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        handleBackAction();
        return;
      }

      // Enter or Z confirms
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyZ' || key === 'enter' || key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
        return;
      }

      // Left / Right changes pocket
      if (code === 'ArrowLeft' || code === 'KeyA' || key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        changePocket(-1);
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD' || key === 'arrowright' || key === 'd') {
        e.preventDefault();
        e.stopPropagation();
        changePocket(1);
        return;
      }

      // Up / Down moves cursor
      if (code === 'ArrowUp' || code === 'KeyW' || key === 'arrowup' || key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(-1);
        return;
      }
      if (code === 'ArrowDown' || code === 'KeyS' || key === 'arrowdown' || key === 's') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(1);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, changePocket, moveCursor, handleConfirm, handleBackAction, onClose]);

  // Mobile D-pad watcher
  const lastNudgeTime = useRef(0);
  useEffect(() => {
    if (!isOpen || !directionNudge) return;
    if (directionNudge.timestamp === lastNudgeTime.current) return;
    lastNudgeTime.current = directionNudge.timestamp;

    const { dx, dy } = directionNudge;
    if (Math.abs(dx) > 0.4) {
      changePocket(dx > 0 ? 1 : -1);
    } else if (Math.abs(dy) > 0.4) {
      moveCursor(dy > 0 ? 1 : -1);
    }
  }, [isOpen, directionNudge, changePocket, moveCursor]);

  // Mobile ◯ confirm watcher
  const lastConfirmTrigger = useRef(0);
  useEffect(() => {
    if (!isOpen || !confirmTrigger) return;
    if (confirmTrigger === lastConfirmTrigger.current) return;
    lastConfirmTrigger.current = confirmTrigger;
    handleConfirm();
  }, [isOpen, confirmTrigger, handleConfirm]);

  // Mobile ✕ cancel watcher
  const lastCancelTrigger = useRef(0);
  useEffect(() => {
    if (!isOpen || !cancelTrigger) return;
    if (cancelTrigger === lastCancelTrigger.current) return;
    lastCancelTrigger.current = cancelTrigger;
    handleBackAction();
  }, [isOpen, cancelTrigger, handleBackAction]);

  if (!isOpen) return null;

  // Active item info for description box
  const activeItemRow = itemsInActivePocket[currentCursor];
  const activeItemDef = activeItemRow ? ITEMS[activeItemRow.id] : null;

  // Build info line: e.g. "Energy +3 · Gu 2c / Inn 4c · Dries → Dried Mackerel · KEY ITEM"
  const infoLineParts: string[] = [];
  if (activeItemDef) {
    if (activeItemDef.energy) {
      infoLineParts.push(`Energy +${activeItemDef.energy}`);
    }
    if (activeItemDef.sell?.gu && activeItemDef.sell?.inn) {
      infoLineParts.push(`Gu ${activeItemDef.sell.gu}c / Inn ${activeItemDef.sell.inn}c`);
    } else if (activeItemDef.sell?.gu) {
      infoLineParts.push(`Gu ${activeItemDef.sell.gu}c`);
    } else if (activeItemDef.sell?.inn) {
      infoLineParts.push(`Inn ${activeItemDef.sell.inn}c`);
    }
    if (activeItemDef.driesTo && ITEMS[activeItemDef.driesTo]) {
      infoLineParts.push(`Dries → ${ITEMS[activeItemDef.driesTo].name}`);
    }
    if (activeItemDef.key) {
      infoLineParts.push('KEY ITEM');
    }
  }

  return (
    <div className="bag-screen-container" onClick={(e) => e.stopPropagation()}>
      {/* 1. Pocket Bar (Top) */}
      <PocketBar
        pockets={POCKETS}
        activePocketIndex={activePocketIndex}
        coins={story.coins}
        onPrevPocket={() => changePocket(-1)}
        onNextPocket={() => changePocket(1)}
      />

      {/* 2. Item List (Middle) */}
      <ItemList
        items={itemsInActivePocket}
        activeRowIndex={currentCursor}
        onHoverIndex={(idx) => {
          if (idx !== currentCursor) {
            sound.playCursor();
            triggerHaptic(10);
            setCursorRow(idx);
          }
        }}
        onConfirmIndex={(idx) => {
          setCursorRow(idx);
          handleConfirm();
        }}
      />

      {/* 3. Description Box (Bottom) */}
      <div className="bag-descbox">
        {activeItemDef ? (
          <>
            <div className="bag-desc-icon-box">
              <img
                src={itemIcon(activeItemRow.id)}
                alt=""
                className="bag-desc-icon"
                draggable={false}
              />
            </div>

            <div className="bag-desc-content">
              <span className="bag-desc-name">{activeItemDef.name}</span>
              <p className="bag-desc-note">{activeItemDef.note}</p>
              {infoLineParts.length > 0 && (
                <span className="bag-desc-infoline">
                  {infoLineParts.join(' · ')}
                </span>
              )}
            </div>
          </>
        ) : (
          /* On CLOSE BAG row */
          <>
            <div className="bag-desc-icon-box">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>

            <div className="bag-desc-content">
              <span className="bag-desc-name">CLOSE BAG</span>
              <p className="bag-desc-note">Close the bag and return to the game.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
