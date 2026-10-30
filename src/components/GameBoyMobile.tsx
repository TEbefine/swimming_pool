import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import type { PlayerState, ChatMessage } from '../game/types';
import { X, Send } from 'lucide-react';
import { triggerHaptic } from '../game/haptics';
import { KEY_INPUTS } from '../identity/policy';
import { ShellTopBand, ShellCreditLine, type ShellStatus, type CreditScene } from './ShellBands';
import type { ComboInput } from '../identity/policy';

interface GameBoyMobileProps {
  canvasRef: React.Ref<HTMLCanvasElement>;
  playerState: PlayerState;
  currentAction: string;
  playerName: string;
  playerCount: number;
  chatLog: ChatMessage[];
  onDirectionChange: (dx: number, dy: number) => void;
  onToggleState: () => void;
  /** ◯ held down / released (e.g. holding lifts the fishing net). */
  onCircleHold?: (down: boolean) => void;
  onActionA: () => void;
  onTriggerEmote: (action: string) => void;
  onSendMessage: (text: string) => void;
  onOpenNameModal: () => void;
  screenOverlay?: React.ReactNode;
  dialogOpen?: boolean;
  onToggleSceneBox?: () => void;
  onToggleStartMenu?: () => void;
  startMenuOpen?: boolean;
  playerInputBlocked?: boolean;
  statusLabel?: string;
  hideStatusBadge?: boolean;
  isPoweredOff?: boolean;
  /** Status light + word in the top band. Defaults to standby when powered off, else ready. */
  status?: ShellStatus;
  /** Which borrowed idea the credit line names. */
  creditScene?: CreditScene;
  identityControls?: {
    onInput: (input: ComboInput) => void;
    onDelete: () => void;
    onConfirm: () => void;
    disabled: boolean;
  };
}

/** One-piece D-pad cross: rounded outer tips, softly filleted inner corners (100×100 box). */
const DPAD_PATH =
  'M40 0H60A7 7 0 0 1 67 7V29A4 4 0 0 0 71 33H93A7 7 0 0 1 100 40V60A7 7 0 0 1 93 67H71A4 4 0 0 0 67 71V93' +
  'A7 7 0 0 1 60 100H40A7 7 0 0 1 33 93V71A4 4 0 0 0 29 67H7A7 7 0 0 1 0 60V40A7 7 0 0 1 7 33H29A4 4 0 0 0 33 29V7' +
  'A7 7 0 0 1 40 0Z';

// Fixed arm targets share the artwork's coordinates, including the lower side wall.
// The centre hub stays inert. Identity input never depends on the socket's box centre.
const IDENTITY_DPAD_ARMS = [
  ['up', 33, 0, 34, 33],
  ['down', 33, 67, 34, 37],
  ['left', 0, 33, 33, 38],
  ['right', 67, 33, 33, 38],
] as const;

/** Speaker grille holes: 4 rows × 5 columns with the top-left corner left solid. */
const SPEAKER_HOLES: ReadonlyArray<readonly [number, number]> = Array.from({ length: 20 }, (_, i) => [Math.floor(i / 5), i % 5] as const)
  .filter(([r, c]) => r + c >= 2);

export const GameBoyMobile: React.FC<GameBoyMobileProps> = ({
  canvasRef,
  playerState,
  currentAction: _currentAction,
  playerCount,
  chatLog,
  onDirectionChange,
  onToggleState,
  onCircleHold,
  onActionA,
  onTriggerEmote,
  onSendMessage,
  screenOverlay,
  dialogOpen = false,
  onToggleSceneBox,
  onToggleStartMenu,
  startMenuOpen = false,
  playerInputBlocked = false,
  statusLabel = 'Sunny Poolside',
  hideStatusBadge = false,
  isPoweredOff = false,
  status,
  creditScene = 'design',
  identityControls,
}) => {
  const isWater = playerState === 'water';
  const faceButtonClass = `w-[34px] h-[34px] rounded-full minimal-btn flex items-center justify-center cursor-pointer text-white/90 ${identityControls ? '' : 'hover:text-white active:scale-95'} shadow-md`;
  const [activeDir, setActiveDir] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false
  });
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatText, setChatText] = useState('');
  const [showChatHistory, setShowChatHistory] = useState(false);

  const dpadRef = useRef<HTMLDivElement>(null);
  const dpadBoundsRef = useRef<DOMRect | null>(null);
  const isDraggingDpad = useRef(false);
  const controllerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!identityControls) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const input = KEY_INPUTS[event.code];
      if (!input && event.code !== 'Backspace' && event.code !== 'Enter') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || identityControls.disabled) return;
      if (input) identityControls.onInput(input);
      else if (event.code === 'Backspace') identityControls.onDelete();
      else identityControls.onConfirm();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [identityControls]);

  const identityPress = (input: ComboInput) => {
    if (!identityControls) return false;
    if (!identityControls.disabled) identityControls.onInput(input);
    return true;
  };

  // iPhone: a long press on the controller must never open the text magnifier (loupe), the
  // copy/select callout or zoom. CSS user-select isn't enough on iOS Safari, so the touch itself is
  // cancelled here (a native, non-passive listener). Pointer events still fire, and every control
  // below reacts on pointerdown, so taps and holds keep working.
  useEffect(() => {
    const el = controllerRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
    el.addEventListener('touchend', block, { passive: false });
    return () => {
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
      el.removeEventListener('touchend', block);
    };
  }, []);

  // iOS Safari ignores `user-scalable=no`, so a pinch could still zoom the whole handheld.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
    };
  }, []);

  /** Button props: act on finger-down (instant, works with the touch cancelled above).
   *  onClick only handles keyboard activation (detail === 0), so a mouse click doesn't fire twice. */
  const press = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      if (identityControls && !e.isPrimary) return;
      fn();
    },
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) fn();
    },
  });

  // Minimal D-Pad Touch & Drag calculations
  const updateDirectionFromTouch = useCallback((clientX: number, clientY: number) => {
    if (!dpadRef.current) return;
    // The controller stays in place during a gesture; avoid a layout read for every move.
    const rect = dpadBoundsRef.current ?? dpadRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const diffX = clientX - centerX;
    const diffY = clientY - centerY;
    const dist = Math.hypot(diffX, diffY);

    // Dead zone
    const deadZone = rect.width * 0.12;
    if (dist < deadZone) {
      setActiveDir((prev) => prev.up || prev.down || prev.left || prev.right
        ? { up: false, down: false, left: false, right: false } : prev);
      onDirectionChange(0, 0);
      return;
    }

    // Determine 8-way direction based on angle
    const angle = Math.atan2(diffY, diffX) * (180 / Math.PI); // -180 to 180

    let up = false;
    let down = false;
    let left = false;
    let right = false;

    if (angle >= -67.5 && angle <= 67.5) right = true;
    if (angle >= 22.5 && angle <= 157.5) down = true;
    if (angle >= 112.5 || angle <= -112.5) left = true;
    if (angle >= -157.5 && angle <= -22.5) up = true;

    setActiveDir((prev) => prev.up === up && prev.down === down && prev.left === left && prev.right === right
      ? prev : { up, down, left, right });

    let dx = 0;
    let dy = 0;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    onDirectionChange(dx, dy);
  }, [onDirectionChange]);

  const handleDpadPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (identityControls) {
      e.stopPropagation();
      if (!e.isPrimary || identityControls.disabled) return;
      // Mobile hit testing can select a neighbouring button at fractional-pixel edges.
      // Use the original touch point against each explicit arm rectangle, never an angle.
      // WebKit may truncate touch coordinates to CSS pixels; use that pixel's centre.
      const integerTouch = e.pointerType === 'touch' && Number.isInteger(e.clientX) && Number.isInteger(e.clientY);
      const clientX = e.clientX + (integerTouch ? 0.5 : 0);
      const clientY = e.clientY + (integerTouch ? 0.5 : 0);
      for (const [input] of IDENTITY_DPAD_ARMS) {
        const arm = dpadRef.current?.querySelector(`[data-identity-input="${input}"]`);
        if (!arm) continue;
        const bounds = arm.getBoundingClientRect();
        if (clientX >= bounds.left && clientX < bounds.right && clientY >= bounds.top && clientY < bounds.bottom) {
          identityControls.onInput(input); return;
        }
      }
      return; // Hub and empty socket space are inert.
    }
    isDraggingDpad.current = true;
    dpadBoundsRef.current = dpadRef.current?.getBoundingClientRect() ?? null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    triggerHaptic(12);
    updateDirectionFromTouch(e.clientX, e.clientY);
  };

  const handleDpadPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingDpad.current) return;
    e.preventDefault();
    updateDirectionFromTouch(e.clientX, e.clientY);
  };

  const handleDpadPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingDpad.current) return;
    e.preventDefault();
    isDraggingDpad.current = false;
    dpadBoundsRef.current = null;
    setActiveDir({ up: false, down: false, left: false, right: false });
    onDirectionChange(0, 0);
  };

  const handleDpadPointerCancel = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingDpad.current = false;
    dpadBoundsRef.current = null;
    setActiveDir({ up: false, down: false, left: false, right: false });
    onDirectionChange(0, 0);
  };

  // 4 Minimal Buttons Actions
  // Bottom: ✕ (Cross) -> Primary Action (Jump / Splash)
  const handlePressCross = () => {
    if (identityPress('cross')) return;
    triggerHaptic(18);
    onActionA();
  };

  // Right: ◯ (Circle) -> Dive / Step Out (Water ⇄ Land)
  const handlePressCircle = () => {
    window.dispatchEvent(new Event('boot:skip')); // ◯ skips the first-open boot intro (no-op otherwise)
    if (identityPress('circle')) return;
    triggerHaptic(18);
    onToggleState();
  };

  // Left: ▢ (Square) -> Quick Wave Emote
  const handlePressSquare = () => {
    if (identityPress('square')) return;
    if (startMenuOpen || playerInputBlocked) return;
    triggerHaptic(15);
    onTriggerEmote('wave');
  };

  // Top: △ (Triangle) -> Chat Modal
  const handlePressTriangle = () => {
    if (identityPress('triangle')) return;
    if (startMenuOpen || playerInputBlocked) return;
    triggerHaptic(15);
    setShowChatModal((prev) => !prev);
  };

  // SELECT button -> SceneBox
  const handlePressSelect = () => {
    if (identityControls) { if (!identityControls.disabled) identityControls.onDelete(); return; }
    triggerHaptic(15);
    setShowChatModal(false);
    if (onToggleSceneBox) {
      onToggleSceneBox();
    }
  };

  // START button -> Pokémon-style START menu
  const handlePressStart = () => {
    window.dispatchEvent(new Event('boot:skip')); // START skips the first-open boot intro (no-op otherwise)
    if (identityControls) { if (!identityControls.disabled) identityControls.onConfirm(); return; }
    triggerHaptic(15);
    setShowChatModal(false);
    if (onToggleStartMenu) {
      onToggleStartMenu();
    }
  };

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

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className={`relative w-full h-[100dvh] max-w-md mx-auto flex flex-col justify-between overflow-hidden select-none gameboy-body border-x-4 border-t-4 border-b-8 border-[var(--gb-edge)] shadow-2xl ${identityControls ? 'identity-shell' : ''}`}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none'
      }}
    >
      {/* Top console ridge: plain plastic (Teera 2026-10-30). Sound, float ring and help live in the START menu. */}
      <div className="w-full h-5 bg-[var(--gb-ridge)] border-b border-[var(--gb-ridge-line)] shrink-0" aria-hidden="true" />

      {/* ========================================================================= */}
      {/* UPPER SECTION: OLD GAME BOY SCREEN (EXPANDED TO FILL REST OF VIEWPORT) */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 flex flex-col justify-center px-3.5 pt-1 pb-1 relative">
        {/* Game Boy Classic Screen Bezel */}
        <div className="w-full h-full gameboy-bezel flex flex-col justify-between relative">
          {/* Top band: SAP Co. + live status word + status light (2026-10-30) */}
          <ShellTopBand status={status ?? (isPoweredOff ? 'standby' : 'ready')} roomName={statusLabel} />

          {/* Screen Row: Symmetrical Display Window with Balanced Grey Space */}
          <div className="relative flex-1 w-full my-1 min-h-0 overflow-hidden flex items-center justify-center">
            {/* Game Canvas Display Window */}
            <div className="relative w-full h-full gameboy-screen-window rounded overflow-hidden flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={1024}
                height={576}
                className={`w-full h-full object-cover pointer-events-none ${dialogOpen ? 'dialog-world-blur' : 'dialog-world-unblur'}`}
                style={{
                  imageRendering: 'pixelated'
                }}
              />

              {/* Screen overlay slot (dialog box, etc.) */}
              {screenOverlay && (
                <div className="absolute inset-0 z-[5]">
                  {screenOverlay}
                </div>
              )}

              {/* CRT Scanline & Subtle LCD Grid Overlay (hidden during dialog) */}
              {!screenOverlay && (
                <div
                  className="pointer-events-none absolute inset-0 z-10 opacity-10"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)'
                  }}
                />
              )}

              {/* Subtle Screen Glass Corner Glare (hidden during dialog) */}
              {!screenOverlay && (
                <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.10]" />
              )}

              {/* Floating Room Info Badge on Screen (hidden during dialog) */}
              {!screenOverlay && (
                <div className="absolute top-1.5 right-2 z-20 pointer-events-none flex items-center gap-1.5 bg-black/65 px-2 py-0.5 rounded border border-white/10 text-[8px] font-mono text-white/90 shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>{playerCount} online</span>
                </div>
              )}

              {/* Floating Land/Water Badge (hidden during dialog) */}
              {!screenOverlay && !hideStatusBadge && (
                <div className="absolute bottom-1.5 left-2 z-20 pointer-events-none flex items-center gap-1 bg-black/65 px-2 py-0.5 rounded border border-white/10 text-[8px] font-mono text-amber-300 font-bold uppercase shadow-md">
                  <span>{isWater ? '🏊 IN WATER' : '🏖️ ON LAND'}</span>
                </div>
              )}

              {/* Chat bubble preview if recent message */}
              {chatLog.length > 0 && Date.now() - chatLog[chatLog.length - 1].timestamp < 6000 && (
                <div className="absolute bottom-7 left-2 right-2 z-20 pointer-events-none bg-slate-900/95 border border-sky-500/60 rounded p-1.5 text-[16px] text-sky-200 animate-fade-in truncate flex items-center gap-1 shadow-lg">
                  <span className="font-bold text-amber-400">[{chatLog[chatLog.length - 1].senderName}]:</span>
                  <span className="text-white truncate">{chatLog[chatLog.length - 1].text}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom band: credit line, "[part] inspired by [source]" (2026-10-30) */}
          <ShellCreditLine scene={creditScene} />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* LOWER SECTION: COMPACT & STREAMLINED CONTROLLER (กระชับ / ERGONOMIC UX) */}
      {/* ========================================================================= */}
      <div
        ref={controllerRef}
        onContextMenu={(e) => e.preventDefault()}
        className="h-[156px] flex flex-col justify-between px-3 pt-1 pb-1 relative shrink-0"
        style={{
          paddingTop: 10,
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        }}
      >
        {/* Controls Row: Compact, Spacious Thumb Targets (108px sockets) */}
        <div className="flex items-center justify-between w-full my-auto" style={{ paddingLeft: 14, paddingRight: 14 }}>
          {/* ================= MINIMAL STYLE CROSS D-PAD ================= */}
          <div className="flex items-center justify-center">
            {/* Symmetrical Left Recessed Socket (108px) */}
            <div
              ref={dpadRef}
              onPointerDown={handleDpadPointerDown}
              onPointerMove={handleDpadPointerMove}
              onPointerUp={handleDpadPointerUp}
              onPointerCancel={handleDpadPointerCancel}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              className="relative w-[108px] h-[108px] rounded-full minimal-socket flex items-center justify-center cursor-pointer touch-none select-none"
              style={{
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              {/* Chunky one-piece cross (SVG): no text glyphs, so iOS never shows the text loupe on a hold.
                  Press feedback is only the arrow colour (Teera: the finger covers anything else). */}
              <div className={identityControls ? 'relative' : 'pointer-events-none'} style={{ width: 94, height: 98 }}>
                <svg className="pointer-events-none" data-testid="controller-dpad-art" viewBox="0 0 100 104" width="94" height="98" aria-hidden="true" focusable="false">
                  <defs>
                    <linearGradient id="gbDpadFace" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" style={{ stopColor: 'var(--gb-cross-top)' }} />
                      <stop offset="1" style={{ stopColor: 'var(--gb-cross)' }} />
                    </linearGradient>
                    <radialGradient id="gbDpadDimple" cx="50%" cy="42%" r="60%">
                      <stop offset="0" style={{ stopColor: 'var(--gb-cross-base)' }} />
                      <stop offset="1" style={{ stopColor: 'var(--gb-cross)' }} />
                    </radialGradient>
                  </defs>
                  {/* Side wall (gives the key its thickness) */}
                  <path d={DPAD_PATH} transform="translate(0 4)" style={{ fill: 'var(--gb-cross-base)' }} />
                  {/* Face */}
                  <path d={DPAD_PATH} fill="url(#gbDpadFace)" />
                  {/* Top bevel highlight */}
                  <path d={DPAD_PATH} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  {/* Centre dimple */}
                  <circle cx="50" cy="50" r="9" fill="url(#gbDpadDimple)" />
                  {/* Arrows: soft rounded triangles, inset from each tip. Pressed = brighter grey. */}
                  {([
                    ['up', '50,8.5 54.5,15 45.5,15'],
                    ['down', '50,91.5 54.5,85 45.5,85'],
                    ['left', '8.5,50 15,45.5 15,54.5'],
                    ['right', '91.5,50 85,45.5 85,54.5'],
                  ] as const).map(([dir, pts]) => {
                    const c = activeDir[dir] ? 'var(--gb-dpad-arrow-on)' : 'var(--gb-dpad-arrow)';
                    return (
                      <polygon
                        key={dir}
                        points={pts}
                        strokeWidth="3.5"
                        strokeLinejoin="round"
                        style={{ fill: c, stroke: c, transition: 'fill 80ms, stroke 80ms' }}
                      />
                    );
                  })}
                </svg>
                {identityControls && IDENTITY_DPAD_ARMS.map(([input, x, y, width, height]) => <button
                    key={input} type="button" aria-label={`${input} direction`} className="identity-dpad-target"
                    data-identity-input={input} style={{ left: `${x}%`, top: `${y / 104 * 100}%`, width: `${width}%`, height: `${height / 104 * 100}%` }}
                    onClick={event => {
                      if (event.detail === 0 && !identityControls.disabled) identityControls.onInput(input);
                    }}
                  />)}
              </div>
            </div>
          </div>

          {/* ================= 4 MINIMAL BUTTONS: △ ◯ ✕ ▢ (SPACIOUS THUMB TARGETS) ================= */}
          <div className="flex items-center justify-center">
            {/* Symmetrical Right Recessed Socket (108px) */}
            <div
              onContextMenu={(e) => e.preventDefault()}
              className="relative w-[108px] h-[108px] rounded-full minimal-socket flex items-center justify-center select-none"
              style={{
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                touchAction: 'none'
              }}
            >
              {/* Diamond Container with Comfortable Thumb Room */}
              <div className="relative w-full h-full flex items-center justify-center">
                {/* TOP: △ (TRIANGLE / 3) -> Emotes Menu */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2">
                  <button
                    type="button"
                    {...press(handlePressTriangle)}
                    onContextMenu={(e) => e.preventDefault()}
                    className={faceButtonClass}
                    title={identityControls ? 'Triangle (T)' : 'Triangle: Chat'}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      touchAction: 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-none stroke-current stroke-[2.5]">
                      <polygon points="12 4 21 20 3 20" />
                    </svg>
                  </button>
                </div>

                {/* LEFT: ▢ (SQUARE / 4 RECTANGLE) -> Wave Emote */}
                <div className="absolute left-1 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    {...press(handlePressSquare)}
                    onContextMenu={(e) => e.preventDefault()}
                    className={faceButtonClass}
                    title={identityControls ? 'Square (Q)' : 'Square: Wave'}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      touchAction: 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-none stroke-current stroke-[2.5]">
                      <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
                    </svg>
                  </button>
                </div>

                {/* RIGHT: ◯ (CIRCLE / O) -> Toggle Water ⇄ Land */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (identityControls && !e.isPrimary) return;
                      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                      handlePressCircle();
                      if (!identityControls) onCircleHold?.(true);
                    }}
                    onPointerUp={() => { if (!identityControls) onCircleHold?.(false); }}
                    onPointerCancel={() => { if (!identityControls) onCircleHold?.(false); }}
                    onLostPointerCapture={() => { if (!identityControls) onCircleHold?.(false); }}
                    onClick={(e) => { if (e.detail === 0) handlePressCircle(); }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={faceButtonClass}
                    title={identityControls ? 'Circle (O)' : 'Circle: Pool / Land'}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      touchAction: 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-none stroke-current stroke-[2.5]">
                      <circle cx="12" cy="12" r="7.5" />
                    </svg>
                  </button>
                </div>

                {/* BOTTOM: ✕ (CROSS / X) -> Jump / Splash */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                  <button
                    type="button"
                    {...press(handlePressCross)}
                    onContextMenu={(e) => e.preventDefault()}
                    className={faceButtonClass}
                    title={identityControls ? 'Cross (X)' : 'Cross: Jump / Splash'}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      touchAction: 'none'
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-none stroke-current stroke-[2.5]">
                      <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
                      <line x1="18.5" y1="5.5" x2="5.5" y2="18.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lower Row: SELECT & START moved to center-right, plus Speaker Ribs */}
        <div className="relative w-full h-5 flex items-center px-4 shrink-0">
          {/* SELECT & START: two minimal round keys, level and centred.
              The button is a 40×32 touch target; the visible circle sits inside it. */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-8 flex items-start gap-4">
            {[
              { label: 'Select', fn: handlePressSelect, title: identityControls ? 'Delete last press' : 'Select (Scene)' },
              { label: 'Start', fn: handlePressStart, title: identityControls ? 'Confirm code' : 'Start (START Menu)' },
            ].map((key) => (
              <div key={key.label} className="flex flex-col items-center">
                <button
                  type="button"
                  {...press(key.fn)}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-10 h-8 flex items-center justify-center cursor-pointer"
                  title={key.title}
                  aria-label={key.label}
                  style={{
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    touchAction: 'none'
                  }}
                >
                  <span className="gb-round-btn block w-[18px] h-[18px] rounded-full" />
                </button>
                <span className="gb-key-label">
                  {key.label}
                </span>
              </div>
            ))}
          </div>

          {/* Speaker: a small grid of round holes, bottom-right (Teera picked the dot-hole grille, 2026-10-30) */}
          <div className="gb-speaker-grid" aria-hidden="true">
            {SPEAKER_HOLES.map(([r, c]) => (
              <span key={`${r}-${c}`} className="gameboy-speaker-slot" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
            ))}
          </div>
        </div>

        {/* Bottom edge: PHONES */}
        <div className="w-full flex items-center justify-center gap-1 text-[5.5px] font-mono text-[var(--gb-ink-soft)] uppercase tracking-widest shrink-0 -mt-0.5">
          <span>◀ PHONES ▶</span>
        </div>
      </div>

      {/* MOBILE POPUPS: CHAT DRAWER (△ / SELECT) */}

      {/* CHAT POPUP (Triggered by SELECT button) */}
      {showChatModal && (
        <div className="game-overlay-backdrop absolute inset-0 z-50 bg-black/75 flex flex-col justify-end p-4 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#1e293b] border-2 border-sky-400 rounded-lg p-3 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
              <span className="text-[16px] font-bold text-sky-300 font-pixel uppercase">
                💬 Poolside Chat
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChatHistory(!showChatHistory)}
                  className={`text-[16px] px-2 py-0.5 rounded border border-slate-600 ${
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
              <div className="h-32 overflow-y-auto mb-2 p-2 bg-slate-900 rounded border border-slate-800 text-[16px] space-y-1.5">
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
            <div className="text-[16px] text-amber-300 font-bold uppercase tracking-wider mb-1.5">
              Quick Shouts:
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {quickPhrases.map((phrase, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendQuickPhrase(phrase)}
                  className="pixel-btn text-[16px] py-1 px-2"
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
                className="flex-1 bg-slate-900 text-white text-[16px] px-2.5 py-2 rounded border border-slate-700 focus:outline-none focus:border-sky-400 font-pixel"
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
