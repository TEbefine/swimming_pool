import React, { useRef, useState, useCallback } from 'react';
import type { PlayerState, FloatColor, ChatMessage } from '../game/types';
import { Volume2, VolumeX, User, HelpCircle, X, Send } from 'lucide-react';
import { sound } from '../game/audio';

interface GameBoyMobileProps {
  canvasRef: React.Ref<HTMLCanvasElement>;
  playerState: PlayerState;
  currentAction: string;
  playerName: string;
  floatColor: FloatColor;
  playerCount: number;
  chatLog: ChatMessage[];
  onDirectionChange: (dx: number, dy: number) => void;
  onToggleState: () => void;
  onActionA: () => void;
  onTriggerEmote: (action: string) => void;
  onSendMessage: (text: string) => void;
  onOpenFloatPicker: () => void;
  onOpenNameModal: () => void;
  onOpenHelpModal: () => void;
}

export const GameBoyMobile: React.FC<GameBoyMobileProps> = ({
  canvasRef,
  playerState,
  currentAction,
  playerName,
  floatColor,
  playerCount,
  chatLog,
  onDirectionChange,
  onToggleState,
  onActionA,
  onTriggerEmote,
  onSendMessage,
  onOpenFloatPicker,
  onOpenNameModal,
  onOpenHelpModal
}) => {
  const [muted, setMuted] = useState(sound.isMuted());
  const [activeDir, setActiveDir] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false
  });
  const [showEmoteMenu, setShowEmoteMenu] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatText, setChatText] = useState('');
  const [showChatHistory, setShowChatHistory] = useState(false);

  const dpadRef = useRef<HTMLDivElement>(null);
  const isDraggingDpad = useRef(false);

  const handleToggleMute = () => {
    const isNowMuted = sound.toggleMute();
    setMuted(isNowMuted);
  };

  // Helper for subtle vibration
  const triggerHaptic = (ms: number = 10) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch {
      // Ignore vibration errors
    }
  };

  // D-Pad Touch & Drag calculations
  const updateDirectionFromTouch = useCallback((clientX: number, clientY: number) => {
    if (!dpadRef.current) return;
    const rect = dpadRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const diffX = clientX - centerX;
    const diffY = clientY - centerY;
    const dist = Math.hypot(diffX, diffY);

    // Dead zone
    const deadZone = rect.width * 0.12;
    if (dist < deadZone) {
      setActiveDir({ up: false, down: false, left: false, right: false });
      onDirectionChange(0, 0);
      return;
    }

    // Determine 8-way direction based on angle
    const angle = Math.atan2(diffY, diffX) * (180 / Math.PI); // -180 to 180

    let up = false;
    let down = false;
    let left = false;
    let right = false;

    // Angle breakdown:
    // Right: -22.5 to 22.5
    // Down-Right: 22.5 to 67.5
    // Down: 67.5 to 112.5
    // Down-Left: 112.5 to 157.5
    // Left: > 157.5 or < -157.5
    // Up-Left: -157.5 to -112.5
    // Up: -112.5 to -67.5
    // Up-Right: -67.5 to -22.5

    if (angle >= -67.5 && angle <= 67.5) right = true;
    if (angle >= 22.5 && angle <= 157.5) down = true;
    if (angle >= 112.5 || angle <= -112.5) left = true;
    if (angle >= -157.5 && angle <= -22.5) up = true;

    setActiveDir({ up, down, left, right });

    let dx = 0;
    let dy = 0;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    onDirectionChange(dx, dy);
  }, [onDirectionChange]);

  const handleDpadPointerDown = (e: React.PointerEvent) => {
    isDraggingDpad.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    triggerHaptic(12);
    updateDirectionFromTouch(e.clientX, e.clientY);
  };

  const handleDpadPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingDpad.current) return;
    updateDirectionFromTouch(e.clientX, e.clientY);
  };

  const handleDpadPointerUp = () => {
    if (!isDraggingDpad.current) return;
    isDraggingDpad.current = false;
    setActiveDir({ up: false, down: false, left: false, right: false });
    onDirectionChange(0, 0);
  };

  const handleDpadPointerCancel = () => {
    isDraggingDpad.current = false;
    setActiveDir({ up: false, down: false, left: false, right: false });
    onDirectionChange(0, 0);
  };

  // Button A action (Emote / Splash / Jump)
  const handlePressA = () => {
    triggerHaptic(18);
    onActionA();
  };

  // Button B action (Toggle Water ⇄ Land)
  const handlePressB = () => {
    triggerHaptic(18);
    onToggleState();
  };

  // SELECT button (Chat)
  const handlePressSelect = () => {
    triggerHaptic(15);
    setShowChatModal((prev) => !prev);
    setShowEmoteMenu(false);
  };

  // START button (Emotes menu)
  const handlePressStart = () => {
    triggerHaptic(15);
    setShowEmoteMenu((prev) => !prev);
    setShowChatModal(false);
  };

  const isWater = playerState === 'water';

  const emotesList = isWater ? [
    { id: 'wave', label: 'Wave', emoji: '👋' },
    { id: 'relax', label: 'Relax Float', emoji: '🎵' },
    { id: 'happy', label: 'Happy Splash', emoji: '✨' },
    { id: 'surprise', label: 'Surprise', emoji: '❗' },
    { id: 'talk', label: 'Chat Pose', emoji: '💬' }
  ] : [
    { id: 'wave', label: 'Wave', emoji: '👋' },
    { id: 'sit', label: 'Sit Down', emoji: '🧘' },
    { id: 'lie', label: 'Lie Down', emoji: '🛌' },
    { id: 'surprise', label: 'Surprise', emoji: '❗' },
    { id: 'jump', label: 'Jump', emoji: '⭐' },
    { id: 'happy', label: 'Happy', emoji: '😄' },
    { id: 'thinking', label: 'Thinking', emoji: '❓' }
  ];

  const quickPhrases = [
    "Come in the pool! 🏊",
    "Water feels great! 🌊",
    "Nice float ring! ✨",
    "Marco!",
    "Polo! 🎯",
    "Catch me if you can! ⚡"
  ];

  const handleSendQuickPhrase = (phrase: string) => {
    onSendMessage(phrase);
    setShowChatModal(false);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatText.trim()) {
      onSendMessage(chatText.trim());
      setChatText('');
      setShowChatModal(false);
    }
  };

  const floatColorMap: Record<FloatColor, string> = {
    red: '#ef4444',
    blue: '#3b82f6',
    pink: '#ec4899',
    yellow: '#eab308',
    black: '#374151',
    green: '#22c55e',
    purple: '#a855f7',
    gray: '#9ca3af'
  };

  return (
    <div className="relative w-full h-[100dvh] max-w-md mx-auto flex flex-col justify-between overflow-hidden select-none gameboy-body border-x-4 border-t-4 border-b-8 border-[#b8b8ae] shadow-2xl">
      {/* Top Console Ridge with OFF/ON indicator */}
      <div className="w-full h-5 bg-[#cfcfc6] border-b border-[#a8a89f] flex items-center justify-between px-4 text-[8px] font-mono text-[#78786f] uppercase tracking-wider shrink-0">
        <div className="flex items-center gap-1.5">
          <span>◀ OFF</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#9e9e94]"></span>
          <span>ON ▶</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleMute}
            className="text-[9px] hover:text-black transition-colors"
            title="Toggle Sound"
          >
            {muted ? <VolumeX size={12} className="text-rose-600 inline" /> : <Volume2 size={12} className="text-emerald-700 inline" />}
          </button>
          <button
            onClick={onOpenFloatPicker}
            className="flex items-center gap-1 hover:text-black transition-colors"
            title="Change Float Ring"
          >
            <div
              className="w-3 h-3 rounded-full border border-black/40"
              style={{ backgroundColor: floatColorMap[floatColor] }}
            />
          </button>
          <button
            onClick={onOpenNameModal}
            className="flex items-center gap-1 hover:text-black transition-colors"
            title="Change Name"
          >
            <User size={11} className="inline text-sky-800" />
            <span className="max-w-[70px] truncate font-bold text-slate-800">{playerName}</span>
          </button>
          <button
            onClick={onOpenHelpModal}
            className="hover:text-black"
            title="Help"
          >
            <HelpCircle size={12} className="inline text-slate-700" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UPPER SECTION: GAME BOY SCREEN (74% OF TOTAL HEIGHT FOR MAX VIEWPORT) */}
      {/* ========================================================================= */}
      <div className="h-[74%] flex flex-col justify-center px-3 pt-1 pb-1 relative shrink-0">
        {/* Game Boy Screen Bezel */}
        <div className="w-full h-full gameboy-bezel p-2 flex flex-col justify-between relative rounded-t-xl rounded-br-xl rounded-bl-[32px]">
          {/* Bezel Header: DOT MATRIX WITH STEREO SOUND & Accent Lines */}
          <div className="w-full flex items-center justify-between pb-1 border-b border-black/30 shrink-0">
            {/* Left stripes */}
            <div className="flex flex-col gap-0.5 w-10">
              <div className="h-[2px] w-full bg-[#9d174d]"></div>
              <div className="h-[2px] w-full bg-[#1e3a8a]"></div>
            </div>

            {/* Center text */}
            <span className="text-[7.5px] font-sans font-bold tracking-widest text-[#d1d5db] uppercase text-center px-1">
              DOT MATRIX WITH STEREO SOUND
            </span>

            {/* Right stripes */}
            <div className="flex flex-col gap-0.5 w-10">
              <div className="h-[2px] w-full bg-[#9d174d]"></div>
              <div className="h-[2px] w-full bg-[#1e3a8a]"></div>
            </div>
          </div>

          {/* Screen Container Row with Battery Strip on the Left and Canvas Window */}
          <div className="relative flex-1 w-full flex items-center gap-2 my-1 min-h-0 overflow-hidden">
            {/* Battery Indicator on Grey Bezel Frame (NOT on canvas!) */}
            <div className="flex flex-col items-center justify-center gap-1 shrink-0 px-1 pointer-events-none">
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 shadow-[0_0_8px_#ef4444] border border-red-800 animate-pulse"></div>
              <span className="text-[6.5px] font-sans font-black tracking-tighter text-[#c0c7d4] uppercase">
                BATTERY
              </span>
            </div>

            {/* Game Canvas Display Window (MAP IS 100% FULL WITH ZERO BLACK BARS!) */}
            <div className="relative flex-1 h-full gameboy-screen-window rounded border-2 border-[#2b313d] overflow-hidden flex items-center justify-center">
              {/* CANVAS ELEMENT: Screen can NOT be touched for movement */}
              <canvas
                ref={canvasRef}
                width={1024}
                height={576}
                className="w-full h-full object-cover pointer-events-none"
                style={{
                  imageRendering: 'pixelated'
                }}
              />

              {/* CRT Scanline & Subtle LCD Grid Overlay */}
              <div
                className="pointer-events-none absolute inset-0 z-10 opacity-10"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)'
                }}
              />

              {/* Subtle Screen Glass Corner Glare */}
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.12]" />

              {/* Floating Room Info Badge on Screen */}
              <div className="absolute top-1.5 right-2 z-20 pointer-events-none flex items-center gap-1.5 bg-black/65 px-2 py-0.5 rounded border border-white/10 text-[8px] font-mono text-white/90 shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{playerCount} online</span>
              </div>

              {/* Floating Land/Water Badge */}
              <div className="absolute bottom-1.5 left-2 z-20 pointer-events-none flex items-center gap-1 bg-black/65 px-2 py-0.5 rounded border border-white/10 text-[8px] font-mono text-amber-300 font-bold uppercase shadow-md">
                <span>{isWater ? '🏊 IN WATER' : '🏖️ ON LAND'}</span>
              </div>

              {/* Chat bubble preview if recent message */}
              {chatLog.length > 0 && Date.now() - chatLog[chatLog.length - 1].timestamp < 6000 && (
                <div className="absolute bottom-7 left-2 right-2 z-20 pointer-events-none bg-slate-900/95 border border-sky-500/60 rounded p-1.5 text-[9px] text-sky-200 animate-fade-in truncate flex items-center gap-1 shadow-lg">
                  <span className="font-bold text-amber-400">[{chatLog[chatLog.length - 1].senderName}]:</span>
                  <span className="text-white truncate">{chatLog[chatLog.length - 1].text}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bezel Bottom Status Bar */}
          <div className="w-full flex items-center justify-between text-[8px] text-[#9ca3af] font-mono px-1 shrink-0 pt-0.5">
            <span className="text-[#e2e8f0] font-bold">Sunny Poolside</span>
            {currentAction !== 'idle' && currentAction !== 'tread' && (
              <span className="text-sky-300 font-bold">({currentAction})</span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LOWER SECTION: COMPACT GAME BOY CONTROLLER (ONLY 26% HEIGHT - ULTRA TIGHT) */}
      {/* ========================================================================= */}
      <div className="h-[26%] flex flex-col justify-between px-4 pt-0.5 pb-1 relative shrink-0">
        {/* Game Boy Classic Blue Branding */}
        <div className="flex items-baseline gap-1 pl-1 shrink-0">
          <span className="text-[#152377] font-sans font-bold text-xs tracking-tight">Nintendo</span>
          <span
            className="text-[#152377] font-sans font-black italic text-sm tracking-wider"
            style={{ transform: 'skewX(-6deg)' }}
          >
            GAME BOY
          </span>
          <span className="text-[#152377] text-[7.5px] font-sans font-bold align-top">TM</span>
        </div>

        {/* Main Controls Row: D-Pad (Left) and A/B Buttons (Right) */}
        <div className="flex items-center justify-between w-full px-1">
          {/* ================= D-PAD (DIRECTIONAL CROSS) ================= */}
          <div className="flex flex-col items-center">
            <div
              ref={dpadRef}
              onPointerDown={handleDpadPointerDown}
              onPointerMove={handleDpadPointerMove}
              onPointerUp={handleDpadPointerUp}
              onPointerCancel={handleDpadPointerCancel}
              className="relative w-20 h-20 flex items-center justify-center rounded-full bg-[#c7c7be] shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),0_1px_1px_rgba(255,255,255,0.4)] touch-none cursor-pointer"
            >
              {/* Cross Base Container */}
              <div className="relative w-18 h-18 flex items-center justify-center">
                {/* Horizontal bar of cross */}
                <div className="absolute w-18 h-6 bg-[#1f2024] rounded-sm shadow-[0_2px_0_#0f1012,0_3px_5px_rgba(0,0,0,0.4)] flex items-center justify-between px-1">
                  <span
                    className={`text-[8px] text-white/50 transition-colors ${
                      activeDir.left ? 'text-amber-400 font-bold scale-125' : ''
                    }`}
                  >
                    ◀
                  </span>
                  <span
                    className={`text-[8px] text-white/50 transition-colors ${
                      activeDir.right ? 'text-amber-400 font-bold scale-125' : ''
                    }`}
                  >
                    ▶
                  </span>
                </div>

                {/* Vertical bar of cross */}
                <div className="absolute h-18 w-6 bg-[#1f2024] rounded-sm shadow-[0_2px_0_#0f1012,0_3px_5px_rgba(0,0,0,0.4)] flex flex-col items-center justify-between py-1">
                  <span
                    className={`text-[8px] text-white/50 transition-colors ${
                      activeDir.up ? 'text-amber-400 font-bold scale-125' : ''
                    }`}
                  >
                    ▲
                  </span>
                  <span
                    className={`text-[8px] text-white/50 transition-colors ${
                      activeDir.down ? 'text-amber-400 font-bold scale-125' : ''
                    }`}
                  >
                    ▼
                  </span>
                </div>

                {/* Center indented thumb circle */}
                <div className="relative z-10 w-5 h-5 rounded-full gameboy-dpad-center border border-black/40 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-[#18181b]/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]"></div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= A & B ACTION BUTTONS ================= */}
          <div className="flex flex-col items-end pr-1">
            {/* Diagonal buttons housing */}
            <div
              className="flex items-center gap-2.5 bg-[#c7c7be] p-1.5 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),0_1px_1px_rgba(255,255,255,0.4)]"
              style={{ transform: 'rotate(-25deg)' }}
            >
              {/* B BUTTON (Dive / Land Switch) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handlePressB}
                  className="w-9 h-9 rounded-full gameboy-action-btn flex items-center justify-center border border-[#9d174d]/50 cursor-pointer active:scale-95 transition-transform"
                  title="Toggle Water / Land"
                >
                  <span className="text-[8px] text-white/90 font-bold">
                    {isWater ? '🏖️' : '🏊'}
                  </span>
                </button>
                <div className="flex flex-col items-center mt-0.5">
                  <span className="text-[10px] font-black text-[#152377] font-sans">B</span>
                </div>
              </div>

              {/* A BUTTON (Action: Splash / Jump / Wave) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handlePressA}
                  className="w-9 h-9 rounded-full gameboy-action-btn flex items-center justify-center border border-[#9d174d]/50 cursor-pointer active:scale-95 transition-transform"
                  title="Primary Action (Splash / Jump)"
                >
                  <span className="text-[8px] text-white/90 font-bold">
                    {isWater ? '✨' : '👋'}
                  </span>
                </button>
                <div className="flex flex-col items-center mt-0.5">
                  <span className="text-[10px] font-black text-[#152377] font-sans">A</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center Lower: SELECT & START Buttons (Centered on console) + Speaker Grille */}
        <div className="relative w-full flex items-center justify-center pt-0 pb-0.5">
          {/* SELECT & START in exact center */}
          <div className="flex items-center gap-5" style={{ transform: 'rotate(-25deg)' }}>
            {/* SELECT BUTTON -> Opens Chat Drawer */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={handlePressSelect}
                className="w-10 h-3 rounded-full gameboy-pill-btn cursor-pointer active:scale-95"
                title="Select (Open Chat)"
              />
              <span className="text-[7px] font-black text-[#152377] font-sans tracking-wider uppercase mt-0.5">
                SELECT
              </span>
            </div>

            {/* START BUTTON -> Opens Emote Picker */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={handlePressStart}
                className="w-10 h-3 rounded-full gameboy-pill-btn cursor-pointer active:scale-95"
                title="Start (Open Emotes Menu)"
              />
              <span className="text-[7px] font-black text-[#152377] font-sans tracking-wider uppercase mt-0.5">
                START
              </span>
            </div>
          </div>

          {/* 6 Diagonal Speaker Grille Slots on Bottom-Right */}
          <div className="absolute right-2 bottom-0 flex items-center gap-0.5 pointer-events-none" style={{ transform: 'rotate(-28deg)' }}>
            <div className="w-1.5 h-4 rounded-full gameboy-speaker-slot"></div>
            <div className="w-1.5 h-5 rounded-full gameboy-speaker-slot"></div>
            <div className="w-1.5 h-6 rounded-full gameboy-speaker-slot"></div>
            <div className="w-1.5 h-6 rounded-full gameboy-speaker-slot"></div>
            <div className="w-1.5 h-5 rounded-full gameboy-speaker-slot"></div>
            <div className="w-1.5 h-4 rounded-full gameboy-speaker-slot"></div>
          </div>
        </div>

        {/* Bottom edge: PHONES */}
        <div className="w-full flex items-center justify-center gap-1 text-[6px] font-mono text-[#8b8b80] uppercase tracking-widest shrink-0">
          <span>◀ PHONES ▶</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE POPUPS: EMOTE MENU (START) & CHAT DRAWER (SELECT) */}
      {/* ========================================================================= */}

      {/* EMOTE MENU (Triggered by START button) */}
      {showEmoteMenu && (
        <div className="absolute inset-0 z-50 bg-black/75 flex flex-col justify-end p-4 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#1e293b] border-2 border-amber-400 rounded-lg p-3 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
              <span className="text-xs font-bold text-amber-300 font-pixel uppercase">
                {isWater ? '🏊 Water Emotes' : '🏖️ Land Emotes'}
              </span>
              <button
                onClick={() => setShowEmoteMenu(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {emotesList.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    triggerHaptic(12);
                    onTriggerEmote(item.id);
                    setShowEmoteMenu(false);
                  }}
                  className={`pixel-btn text-[11px] py-2 px-2.5 flex items-center justify-start gap-2 ${
                    currentAction === item.id ? 'pixel-btn-accent' : ''
                  }`}
                >
                  <span className="text-sm">{item.emoji}</span>
                  <span className="font-semibold truncate">{item.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                triggerHaptic(15);
                onToggleState();
                setShowEmoteMenu(false);
              }}
              className="w-full pixel-btn pixel-btn-primary py-2 text-xs font-bold justify-center"
            >
              {isWater ? '🏖️ Step Out to Land' : '🏊 Dive into Pool'}
            </button>
          </div>
        </div>
      )}

      {/* CHAT POPUP (Triggered by SELECT button) */}
      {showChatModal && (
        <div className="absolute inset-0 z-50 bg-black/75 flex flex-col justify-end p-4 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#1e293b] border-2 border-sky-400 rounded-lg p-3 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
              <span className="text-xs font-bold text-sky-300 font-pixel uppercase">
                💬 Poolside Chat
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChatHistory(!showChatHistory)}
                  className={`text-[10px] px-2 py-0.5 rounded border border-slate-600 ${
                    showChatHistory ? 'bg-sky-600 text-white' : 'text-slate-300'
                  }`}
                >
                  History
                </button>
                <button
                  onClick={() => setShowChatModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Chat History Drawer */}
            {showChatHistory && (
              <div className="h-32 overflow-y-auto mb-2 p-2 bg-slate-900 rounded border border-slate-800 text-[10px] space-y-1.5">
                {chatLog.length === 0 ? (
                  <div className="text-slate-500 italic">No messages yet. Say hi!</div>
                ) : (
                  chatLog.slice(-15).map((msg) => (
                    <div key={msg.id} className="leading-tight">
                      <span className="font-bold text-sky-300">{msg.senderName}: </span>
                      <span className="text-slate-200">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Quick Shouts */}
            <div className="text-[9px] text-amber-300 font-bold uppercase tracking-wider mb-1.5">
              Quick Shouts:
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {quickPhrases.map((phrase, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendQuickPhrase(phrase)}
                  className="pixel-btn text-[10px] py-1 px-2"
                >
                  {phrase}
                </button>
              ))}
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleChatSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Type message..."
                maxLength={80}
                className="flex-1 bg-slate-900 text-white text-xs px-2.5 py-2 rounded border border-slate-700 focus:outline-none focus:border-sky-400 font-mono"
              />
              <button
                type="submit"
                disabled={!chatText.trim()}
                className="pixel-btn pixel-btn-primary px-3 py-2 disabled:opacity-40"
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
