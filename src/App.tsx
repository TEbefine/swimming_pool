import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GameEngine } from './game/Engine';
import type { PlayerState, FloatColor, ChatMessage, ContextActionId, RoomDefinition } from './game/types';
import { getRoomForToday } from './game/rooms';
import { HeaderBar } from './components/HeaderBar';
import { ActionBar } from './components/ActionBar';
import { ChatBar } from './components/ChatBar';
import { ChatLogDrawer } from './components/ChatLogDrawer';
import { GameBoyMobile } from './components/GameBoyMobile';
import { FloatModal } from './components/FloatModal';
import { NameModal } from './components/NameModal';
import { HelpModal } from './components/HelpModal';
import { DialogBox } from './components/DialogBox';
import { SceneBox } from './components/SceneBox';
import { dialogues } from './game/content/dialogues';
import type { DialogLine } from './game/content/dialogues';
import { Waves } from 'lucide-react';

/** Context-action IDs that should route through engine.interact(). */
const INTERACT_ACTIONS: ReadonlySet<ContextActionId> = new Set<ContextActionId>(['talk', 'sit', 'stand', 'read']);

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Room state stored in React state (runtime room travel)
  const [currentRoom, setCurrentRoom] = useState<RoomDefinition>(() => getRoomForToday());

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [playerState, setPlayerState] = useState<PlayerState>('land');
  const [currentAction, setCurrentAction] = useState<string>('idle');
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('pixel_pool_player_name') || 'Sailor' + Math.floor(Math.random() * 900 + 100);
  });
  const [floatColor, setFloatColor] = useState<FloatColor>(() => {
    return (localStorage.getItem('pixel_pool_float_color') as FloatColor) || 'red';
  });

  const [playerCount, setPlayerCount] = useState(1);
  const [playerCountByRoom, setPlayerCountByRoom] = useState<Record<string, number>>({});
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatLogOpen, setChatLogOpen] = useState(false);

  // Mobile layout state
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [forceHandheld, setForceHandheld] = useState<boolean | null>(null);

  const effectiveIsMobile = forceHandheld !== null ? forceHandheld : isMobile;

  // Modals
  const [floatModalOpen, setFloatModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // =========================================================================
  // SCENE BOX STATE
  // =========================================================================
  const [sceneBoxOpen, setSceneBoxOpen] = useState(false);
  const [sceneBoxDpadNudge, setSceneBoxDpadNudge] = useState<{ dx: number; dy: number; timestamp: number } | null>(null);
  const [sceneBoxConfirmTrigger, setSceneBoxConfirmTrigger] = useState<number>(0);

  // =========================================================================
  // DIALOG STATE
  // =========================================================================
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogNpcId, setDialogNpcId] = useState<string | null>(null);
  const [dialogLines, setDialogLines] = useState<DialogLine[]>([]);
  const [dialogNpcName, setDialogNpcName] = useState('');
  const advanceDialogRef = useRef<(() => void) | null>(null);

  /** Open a dialog with the given NPC. */
  const openDialog = useCallback((npcId: string) => {
    const script = dialogues[npcId];
    if (!script) return;
    const engine = engineRef.current;
    if (!engine) return;

    setDialogNpcId(npcId);
    setDialogNpcName(script.name);
    setDialogLines(script.lines);
    setDialogOpen(true);

    // Freeze movement + set NPC facing toward player
    engine.setDialogFrozen(true, npcId);
    engine.faceNpcTowardPlayer(npcId);
  }, []);

  /** Close the current dialog and play post-dialog wai. */
  const closeDialog = useCallback(() => {
    const engine = engineRef.current;
    const npcId = dialogNpcId;

    setDialogOpen(false);
    setDialogNpcId(null);
    setDialogLines([]);
    setDialogNpcName('');

    if (engine) {
      engine.setDialogFrozen(false);
      if (npcId) {
        // Play 'wai' for 1.5s then return to idle
        engine.setNpcPose(npcId, 'wai', 1500);
      }
    }
  }, [dialogNpcId]);

  /** Handle line changes during dialog to update NPC pose. */
  const handleDialogLineChange = useCallback((_lineIndex: number, pose?: string) => {
    const engine = engineRef.current;
    if (!engine || !dialogNpcId) return;
    if (pose) {
      engine.setNpcPose(dialogNpcId, pose);
    }
  }, [dialogNpcId]);

  // =========================================================================
  // TRAVEL / ROOM CHANGE
  // =========================================================================
  const handleTravel = useCallback(async (roomId: string) => {
    setSceneBoxOpen(false);
    const engine = engineRef.current;
    if (!engine) return;
    await engine.changeRoom(roomId);
  }, []);

  // =========================================================================
  // ◯ BUTTON / E KEY / O KEY — unified interact handler
  // =========================================================================
  const handleCircleAction = useCallback(() => {
    // If SceneBox is open → confirm travel on currently selected slot
    if (sceneBoxOpen) {
      setSceneBoxConfirmTrigger(Date.now());
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    // If dialog is open → advance it
    if (dialogOpen) {
      advanceDialogRef.current?.();
      return;
    }

    // Check context action
    const ctx = engine.getContextAction();
    if (INTERACT_ACTIONS.has(ctx.id)) {
      engine.interact();
    } else {
      // Fallback: toggleWaterLand
      engine.toggleWaterLand();
    }
  }, [sceneBoxOpen, dialogOpen]);

  // =========================================================================
  // ✕ BUTTON — jump / splash, cancel SceneBox, or advances dialog
  // =========================================================================
  const handleCrossAction = useCallback(() => {
    // If SceneBox is open → close it
    if (sceneBoxOpen) {
      setSceneBoxOpen(false);
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    // If dialog is open → advance it
    if (dialogOpen) {
      advanceDialogRef.current?.();
      return;
    }

    if (engine.localPlayer.state === 'water') {
      engine.triggerEmote('happy');
    } else {
      engine.triggerEmote('jump');
    }
  }, [sceneBoxOpen, dialogOpen]);

  // =========================================================================
  // KEYBOARD: Tab for SceneBox, E and O for ◯
  // =========================================================================
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.key === 'Tab') {
        e.preventDefault();
        setSceneBoxOpen((prev) => !prev);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'e' || key === 'o') {
        e.preventDefault();
        handleCircleAction();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCircleAction]);

  // =========================================================================
  // ENGINE SETUP
  // =========================================================================

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setCanvasRefCb = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node && engineRef.current && node !== engineRef.current.getCanvas()) {
      engineRef.current.setCanvas(node);
      engineRef.current.setTouchMoveEnabled(!effectiveIsMobile);
      engineRef.current.setCameraFollow(effectiveIsMobile);
    }
  }, [effectiveIsMobile]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTouchMoveEnabled(!effectiveIsMobile);
      engineRef.current.setCameraFollow(effectiveIsMobile);
    }
  }, [effectiveIsMobile]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;

    const engine = new GameEngine(canvasRef.current, currentRoom, playerName, floatColor);
    engineRef.current = engine;
    setLocalPlayerId(engine.localPlayer.id);
    engine.setTouchMoveEnabled(!effectiveIsMobile);
    engine.setCameraFollow(effectiveIsMobile);

    engine.onChatMessageReceived = (msg) => {
      setChatLog((prev) => [...prev.slice(-100), msg]);
    };

    engine.onPlayerCountChange = (count) => {
      setPlayerCount(count);
      setPlayerCountByRoom(engine.getPlayerCountByRoom());
    };

    engine.onRoomChanged = (newRoom) => {
      setCurrentRoom(newRoom);
      setPlayerCountByRoom(engine.getPlayerCountByRoom());
    };

    // onInteract: open dialog when NPC talk is triggered
    engine.onInteract = (targetId: string, actionId?: ContextActionId) => {
      if (actionId === 'talk' && dialogues[targetId]) {
        openDialog(targetId);
      }
    };

    const init = async () => {
      setLoadProgress(30);
      await engine.loadAssets();
      if (cancelled) return; // Don't start a destroyed engine
      setLoadProgress(100);
      setTimeout(() => {
        if (cancelled) return;
        setLoading(false);
        engine.start();
        setPlayerCountByRoom(engine.getPlayerCountByRoom());
      }, 300);
    };

    init();

    // Sync UI with engine state at 15 FPS
    const syncInterval = setInterval(() => {
      if (engineRef.current) {
        setPlayerState(engineRef.current.localPlayer.state);
        setCurrentAction(engineRef.current.localPlayer.currentAction);
        setPlayerCountByRoom(engineRef.current.getPlayerCountByRoom());
      }
    }, 66);

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleSelectFloatColor = (color: FloatColor) => {
    setFloatColor(color);
    localStorage.setItem('pixel_pool_float_color', color);
    engineRef.current?.setFloatColor(color);
  };

  const handleSaveName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('pixel_pool_player_name', name);
    engineRef.current?.setPlayerName(name);
  };

  const handleSendMessage = (text: string) => {
    engineRef.current?.sendChat(text);
  };

  const handleTriggerEmote = (action: string) => {
    engineRef.current?.triggerEmote(action);
  };

  // Chat log only shows messages for current room
  const visibleChatLog = useMemo(() => {
    return chatLog.filter((m) => (m.roomId || 'poolside') === currentRoom.roomId);
  }, [chatLog, currentRoom.roomId]);

  // =========================================================================
  // OVERLAY ELEMENTS (DialogBox & SceneBox)
  // =========================================================================
  const dialogBoxElement = dialogOpen ? (
    <DialogBox
      npcName={dialogNpcName}
      lines={dialogLines}
      onLineChange={handleDialogLineChange}
      onClose={closeDialog}
    />
  ) : null;

  const sceneBoxElement = sceneBoxOpen ? (
    <SceneBox
      isOpen={sceneBoxOpen}
      currentRoomId={currentRoom.roomId}
      playerCountByRoom={playerCountByRoom}
      onTravel={handleTravel}
      onClose={() => setSceneBoxOpen(false)}
      directionNudge={sceneBoxDpadNudge}
      confirmTrigger={sceneBoxConfirmTrigger}
    />
  ) : null;

  // Advance dialog with simulated keyboard event
  useEffect(() => {
    if (dialogOpen) {
      advanceDialogRef.current = () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
      };
    } else {
      advanceDialogRef.current = null;
    }
  }, [dialogOpen]);

  return (
    <div className="relative w-screen h-screen bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1527] text-white">
          <div className="flex items-center gap-3 mb-6 animate-bounce">
            <Waves className="w-9 h-9 text-sky-400" />
            <span
              className="text-[24px] md:text-xl font-bold tracking-wider text-sky-300"
              style={{ fontFamily: 'var(--font-pixel)' }}
            >
              {currentRoom.name}
            </span>
          </div>
          <div className="w-64 h-4 bg-slate-800 border-2 border-slate-600 rounded-sm p-0.5 overflow-hidden mb-3">
            <div
              className="h-full bg-sky-400 transition-all duration-300 rounded-xs"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <p className="text-[16px] text-slate-400 font-mono tracking-widest animate-pulse">
            LOADING SPRITES & RESORT MAP...
          </p>
        </div>
      )}

      {/* RENDER VIEW: Game Boy Handheld on Mobile vs Desktop Arcade Cabinet */}
      {effectiveIsMobile ? (
        <GameBoyMobile
          canvasRef={setCanvasRefCb}
          playerState={playerState}
          currentAction={currentAction}
          playerName={playerName}
          floatColor={floatColor}
          playerCount={playerCount}
          chatLog={visibleChatLog}
          onDirectionChange={(dx, dy) => {
            if (sceneBoxOpen) {
              if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
                setSceneBoxDpadNudge({ dx, dy, timestamp: Date.now() });
              }
            } else if (!dialogOpen) {
              engineRef.current?.setVirtualDpad(dx, dy);
            }
          }}
          onToggleState={handleCircleAction}
          onActionA={handleCrossAction}
          onTriggerEmote={handleTriggerEmote}
          onSendMessage={handleSendMessage}
          onOpenFloatPicker={() => setFloatModalOpen(true)}
          onOpenNameModal={() => setNameModalOpen(true)}
          onOpenHelpModal={() => setHelpModalOpen(true)}
          onToggleSceneBox={() => setSceneBoxOpen((prev) => !prev)}
          screenOverlay={
            <>
              {dialogBoxElement}
              {sceneBoxElement}
            </>
          }
        />
      ) : (
        /* Main Game Screen with Retro Arcade Border */
        <div className="relative w-full h-full max-w-[1280px] max-h-[720px] flex items-center justify-center p-1 sm:p-3">
          <div className="relative w-full h-full flex items-center justify-center bg-slate-900 rounded-lg overflow-hidden border-4 border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            {/* Header UI */}
            <HeaderBar
              roomName={currentRoom.name}
              playerCount={playerCount}
              playerName={playerName}
              floatColor={floatColor}
              onOpenFloatPicker={() => setFloatModalOpen(true)}
              onOpenNameModal={() => setNameModalOpen(true)}
              onOpenHelpModal={() => setHelpModalOpen(true)}
              onToggleChatLog={() => setChatLogOpen(!chatLogOpen)}
              chatLogOpen={chatLogOpen}
              onToggleMobileMode={() => setForceHandheld((prev) => (prev === true ? false : true))}
              isMobileMode={effectiveIsMobile}
            />

            {/* Canvas Viewport */}
            <canvas
              ref={setCanvasRefCb}
              width={1024}
              height={576}
              className="w-full h-full object-contain cursor-crosshair"
              style={{
                imageRendering: 'pixelated'
              }}
            />

            {/* Desktop dialog overlay (above canvas, below scanlines) */}
            {dialogBoxElement && (
              <div className="absolute inset-0 z-[5]">
                {dialogBoxElement}
              </div>
            )}

            {/* Desktop SceneBox overlay */}
            {sceneBoxElement && (
              <div className="absolute inset-0 z-[6]">
                {sceneBoxElement}
              </div>
            )}

            {/* Action & Emotes Bar */}
            <ActionBar
              playerState={playerState}
              currentAction={currentAction}
              onTriggerEmote={handleTriggerEmote}
              onToggleState={() => engineRef.current?.toggleWaterLand()}
            />

            {/* Bottom Chat Bar */}
            <ChatBar onSendMessage={handleSendMessage} />

            {/* Chat Log Drawer */}
            <ChatLogDrawer
              isOpen={chatLogOpen}
              onClose={() => setChatLogOpen(false)}
              messages={visibleChatLog}
              currentUserId={localPlayerId}
            />

            {/* CRT scanline effect subtle overlay */}
            <div
              className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)'
              }}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <FloatModal
        isOpen={floatModalOpen}
        onClose={() => setFloatModalOpen(false)}
        currentColor={floatColor}
        onSelectColor={handleSelectFloatColor}
      />

      <NameModal
        isOpen={nameModalOpen}
        onClose={() => setNameModalOpen(false)}
        currentName={playerName}
        onSaveName={handleSaveName}
      />

      <HelpModal
        isOpen={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
      />
    </div>
  );
};

export default App;
