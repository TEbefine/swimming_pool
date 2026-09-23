import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from './game/Engine';
import type { PlayerState, FloatColor, ChatMessage } from './game/types';
import { HeaderBar } from './components/HeaderBar';
import { ActionBar } from './components/ActionBar';
import { ChatBar } from './components/ChatBar';
import { ChatLogDrawer } from './components/ChatLogDrawer';
import { GameBoyMobile } from './components/GameBoyMobile';
import { FloatModal } from './components/FloatModal';
import { NameModal } from './components/NameModal';
import { HelpModal } from './components/HelpModal';
import { Waves } from 'lucide-react';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

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

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
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

    const engine = new GameEngine(canvasRef.current, playerName, floatColor);
    engineRef.current = engine;
    engine.setTouchMoveEnabled(!effectiveIsMobile);
    engine.setCameraFollow(effectiveIsMobile);

    engine.onChatMessageReceived = (msg) => {
      setChatLog((prev) => [...prev.slice(-100), msg]);
    };

    engine.onPlayerCountChange = (count) => {
      setPlayerCount(count);
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
      }, 300);
    };

    init();

    // Sync UI with engine state at 15 FPS
    const syncInterval = setInterval(() => {
      if (engineRef.current) {
        setPlayerState(engineRef.current.localPlayer.state);
        setCurrentAction(engineRef.current.localPlayer.currentAction);
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

  return (
    <div className="relative w-screen h-screen bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1527] text-white">
          <div className="flex items-center gap-3 mb-6 animate-bounce">
            <Waves className="w-9 h-9 text-sky-400" />
            <span
              className="text-lg md:text-xl font-bold tracking-wider text-sky-300"
              style={{ fontFamily: 'var(--font-pixel)' }}
            >
              Sunny Poolside Hangout
            </span>
          </div>
          <div className="w-64 h-4 bg-slate-800 border-2 border-slate-600 rounded-sm p-0.5 overflow-hidden mb-3">
            <div
              className="h-full bg-sky-400 transition-all duration-300 rounded-xs"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-mono tracking-widest animate-pulse">
            LOADING SPRITES & RESORT MAP...
          </p>
        </div>
      )}

      {/* RENDER VIEW: Game Boy Handheld on Mobile vs Desktop Arcade Cabinet */}
      {effectiveIsMobile ? (
        <GameBoyMobile
          canvasRef={setCanvasRef}
          playerState={playerState}
          currentAction={currentAction}
          playerName={playerName}
          floatColor={floatColor}
          playerCount={playerCount}
          chatLog={chatLog}
          onDirectionChange={(dx, dy) => engineRef.current?.setVirtualDpad(dx, dy)}
          onToggleState={() => engineRef.current?.toggleWaterLand()}
          onActionA={() => {
            if (playerState === 'water') {
              engineRef.current?.triggerEmote('happy');
            } else {
              engineRef.current?.triggerEmote('jump');
            }
          }}
          onTriggerEmote={handleTriggerEmote}
          onSendMessage={handleSendMessage}
          onOpenFloatPicker={() => setFloatModalOpen(true)}
          onOpenNameModal={() => setNameModalOpen(true)}
          onOpenHelpModal={() => setHelpModalOpen(true)}
        />
      ) : (
        /* Main Game Screen with Retro Arcade Border */
        <div className="relative w-full h-full max-w-[1280px] max-h-[720px] flex items-center justify-center p-1 sm:p-3">
          <div className="relative w-full h-full flex items-center justify-center bg-slate-900 rounded-lg overflow-hidden border-4 border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            {/* Header UI */}
            <HeaderBar
              roomName="Sunny Poolside"
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
              ref={setCanvasRef}
              width={1024}
              height={576}
              className="w-full h-full object-contain cursor-crosshair"
              style={{
                imageRendering: 'pixelated'
              }}
            />

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
              messages={chatLog}
              currentUserId={engineRef.current?.localPlayer.id || ''}
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
