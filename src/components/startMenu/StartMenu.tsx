import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PlayerState } from '../../game/types';
import { sound } from '../../game/audio';
import { triggerHaptic } from '../../game/haptics';
import { useMenuStack } from './useMenuStack';
import { MenuList, type MenuItem } from './MenuList';
import { EmoteScreen, getEmoteItems } from './EmoteScreen';
import './menu.css';

export interface StartMenuProps {
  isOpen: boolean;
  playerName: string;
  playerState: PlayerState;
  onClose: () => void;
  onOpenFishBook: () => void;
  onOpenBag: () => void;
  onOpenNameModal: () => void;
  onOpenHelpModal: () => void;
  onTriggerEmote: (action: string) => void;
  onToggleState: () => void;
  onOpenOption?: () => void;
  directionNudge?: { dx: number; dy: number; timestamp: number } | null;
  confirmTrigger?: number;
  cancelTrigger?: number;
}

export const StartMenu: React.FC<StartMenuProps> = ({
  isOpen,
  playerName,
  playerState,
  onClose,
  onOpenFishBook,
  onOpenBag,
  onOpenNameModal,
  onOpenHelpModal,
  onTriggerEmote,
  onToggleState,
  onOpenOption,
  directionNudge,
  confirmTrigger,
  cancelTrigger,
}) => {
  const { currentScreen, push, pop, reset, isRoot } = useMenuStack('root');

  // Pokémon feature: Remember the last cursor position across menu sessions
  const [rootCursor, setRootCursor] = useState(0);
  const [emoteCursor, setEmoteCursor] = useState(0);

  // Root menu items in specified order:
  // 1. FISH BOOK, 2. BAG, 3. {player name}, 4. EMOTE, 5. OPTION, 6. HELP, 7. EXIT
  const rootItems: MenuItem[] = useMemo(() => [
    { id: 'fishbook', label: 'FISH BOOK', description: "Review the fish you've discovered." },
    { id: 'bag', label: 'BAG', description: "Check the items you're carrying." },
    { id: 'trainer_card', label: playerName.toUpperCase(), description: 'Check your Trainer Card and stats.' },
    { id: 'emote', label: 'EMOTE', description: 'Express yourself with fun poses.' },
    { id: 'option', label: 'OPTION', description: 'Adjust sound, vibration, and settings.' },
    { id: 'help', label: 'HELP', description: 'Read tips and game instructions.' },
    { id: 'exit', label: 'EXIT', description: 'Close the menu.' },
  ], [playerName]);

  const emoteItems = useMemo(() => getEmoteItems(playerState), [playerState]);

  // Keep cursor indices bounded
  const activeRootIdx = Math.max(0, Math.min(rootCursor, rootItems.length - 1));
  const activeEmoteIdx = Math.max(0, Math.min(emoteCursor, emoteItems.length - 1));

  // Determine current description text based on active screen and cursor
  const currentDescription = useMemo(() => {
    if (currentScreen === 'emote') {
      return emoteItems[activeEmoteIdx]?.description || '';
    }
    return rootItems[activeRootIdx]?.description || '';
  }, [currentScreen, activeEmoteIdx, activeRootIdx, emoteItems, rootItems]);

  // Navigation handlers with sound & haptic tick
  const moveCursor = useCallback((delta: number) => {
    sound.playCursor();
    triggerHaptic(10);

    if (currentScreen === 'emote') {
      setEmoteCursor((prev) => {
        const total = emoteItems.length;
        return (prev + delta + total) % total;
      });
    } else {
      setRootCursor((prev) => {
        const total = rootItems.length;
        return (prev + delta + total) % total;
      });
    }
  }, [currentScreen, emoteItems.length, rootItems.length]);

  // Back action: pop screen or close menu
  const handleBack = useCallback(() => {
    sound.playBack();
    triggerHaptic(15);
    if (!isRoot) {
      pop();
    } else {
      onClose();
    }
  }, [isRoot, pop, onClose]);

  // Confirm action for current item
  const handleConfirm = useCallback(() => {
    sound.playSelect();
    triggerHaptic(15);

    if (currentScreen === 'emote') {
      const selected = emoteItems[activeEmoteIdx];
      if (!selected) return;
      if (selected.isToggleState) {
        onToggleState();
      } else {
        onTriggerEmote(selected.id);
      }
      onClose();
      return;
    }

    const selected = rootItems[activeRootIdx];
    if (!selected) return;

    switch (selected.id) {
      case 'fishbook':
        onOpenFishBook();
        onClose();
        break;
      case 'bag':
        onOpenBag();
        onClose();
        break;
      case 'trainer_card':
        // Step 1: placeholder / opens existing NameModal until Step 3 ID Card
        onOpenNameModal();
        onClose();
        break;
      case 'emote':
        push('emote');
        break;
      case 'option':
        if (onOpenOption) {
          onOpenOption();
        } else {
          push('option');
        }
        break;
      case 'help':
        onOpenHelpModal();
        onClose();
        break;
      case 'exit':
        onClose();
        break;
    }
  }, [
    currentScreen,
    emoteItems,
    activeEmoteIdx,
    rootItems,
    activeRootIdx,
    onToggleState,
    onTriggerEmote,
    onClose,
    onOpenFishBook,
    onOpenBag,
    onOpenNameModal,
    push,
    onOpenOption,
    onOpenHelpModal,
  ]);

  // Reset menu stack when opened fresh
  useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  // Keyboard navigation when menu is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const code = e.code;
      const key = e.key.toLowerCase();

      // Close menu with START key (M or P or `)
      if (code === 'KeyM' || code === 'KeyP' || code === 'Backquote') {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }

      // Back / cancel with X or Escape
      if (code === 'KeyX' || code === 'Escape' || key === 'x' || key === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }

      // Confirm with Enter or Z
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyZ' || key === 'enter' || key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
        return;
      }

      // Navigate Up
      if (code === 'ArrowUp' || code === 'KeyW' || key === 'arrowup' || key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(-1);
        return;
      }

      // Navigate Down
      if (code === 'ArrowDown' || code === 'KeyS' || key === 'arrowdown' || key === 's') {
        e.preventDefault();
        e.stopPropagation();
        moveCursor(1);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, handleBack, handleConfirm, moveCursor]);

  // Mobile D-pad nudge watcher
  const lastNudgeTime = useRef(0);
  useEffect(() => {
    if (!isOpen || !directionNudge) return;
    if (directionNudge.timestamp === lastNudgeTime.current) return;
    lastNudgeTime.current = directionNudge.timestamp;

    const { dy } = directionNudge;
    if (dy < -0.4) {
      moveCursor(-1);
    } else if (dy > 0.4) {
      moveCursor(1);
    }
  }, [isOpen, directionNudge, moveCursor]);

  // Mobile ◯ confirm trigger watcher
  const lastConfirmTrigger = useRef(0);
  useEffect(() => {
    if (!isOpen || !confirmTrigger) return;
    if (confirmTrigger === lastConfirmTrigger.current) return;
    lastConfirmTrigger.current = confirmTrigger;
    handleConfirm();
  }, [isOpen, confirmTrigger, handleConfirm]);

  // Mobile ✕ cancel trigger watcher
  const lastCancelTrigger = useRef(0);
  useEffect(() => {
    if (!isOpen || !cancelTrigger) return;
    if (cancelTrigger === lastCancelTrigger.current) return;
    lastCancelTrigger.current = cancelTrigger;
    handleBack();
  }, [isOpen, cancelTrigger, handleBack]);

  if (!isOpen) return null;

  return (
    <div
      className="start-menu-backdrop"
      onClick={(e) => {
        // Clicking backdrop closes menu
        if (e.target === e.currentTarget) {
          handleBack();
        }
      }}
    >
      {/* Menu Box on the Right Side (inside game screen) */}
      <div className="start-menu-panel" onClick={(e) => e.stopPropagation()}>
        {currentScreen === 'root' && (
          <MenuList
            items={rootItems}
            activeIndex={activeRootIdx}
            onHoverIndex={(idx) => {
              if (idx !== rootCursor) {
                sound.playCursor();
                triggerHaptic(10);
                setRootCursor(idx);
              }
            }}
            onConfirmIndex={(idx) => {
              setRootCursor(idx);
              handleConfirm();
            }}
          />
        )}

        {currentScreen === 'emote' && (
          <EmoteScreen
            playerState={playerState}
            activeIndex={activeEmoteIdx}
            onHoverIndex={(idx) => {
              if (idx !== emoteCursor) {
                sound.playCursor();
                triggerHaptic(10);
                setEmoteCursor(idx);
              }
            }}
            onConfirmIndex={(idx) => {
              setEmoteCursor(idx);
              handleConfirm();
            }}
            onBack={handleBack}
          />
        )}
      </div>

      {/* Description Box across the bottom of the screen */}
      <div className="start-menu-descbox" onClick={(e) => e.stopPropagation()}>
        <p className="start-menu-desc-text">
          {currentDescription}
        </p>
      </div>
    </div>
  );
};
