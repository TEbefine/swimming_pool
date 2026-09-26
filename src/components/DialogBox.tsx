import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { DialogScript, DialogNode, DialogLine, PortraitFace, DialogChoice } from '../game/content/dialogues';
import { resolveDialogText, isTipLine } from '../game/content/dialogues';

// =========================================================================
// TUNABLE LAYOUT CONSTANTS
// =========================================================================

const PORTRAIT = {
  narrowHeight: 0.70,   // share of overlay height when w < 420 (phone / GameBoy)
  wideHeight:   0.94,   // share of overlay height on wide screens
  maxWidth:     1.15,   // share of overlay width (allows portrait to scale larger without premature width cap)
  tuck:         24,     // px of the chest cut hidden behind the box top
  rightNarrow:  -10,    // px, may bleed slightly off the right edge
  rightWide:    24,
};

const BOX = {
  narrowMin: 88,
  narrowMax: 118,
  narrowRatio: 0.17,
  wideMin: 110,
  wideMax: 150,
  wideRatio: 0.22,
};

interface DialogBoxProps {
  npcId: string;
  script: DialogScript;
  onLineChange?: (lineIndex: number, pose?: string) => void;
  onClose: () => void;
  directionNudge?: { dx: number; dy: number; timestamp: number } | null;
  confirmTrigger?: number;
}

const CHARS_PER_SEC = 40;
const MAX_LINES_PER_PAGE = 3;
const TIP_LS_KEY = 'pixel_pool_tip_read';

/** Mark today's tip as read in localStorage. */
function markTipRead(): void {
  try {
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    localStorage.setItem(TIP_LS_KEY, dateStr);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/** Split resolved text into pages of MAX_LINES_PER_PAGE lines each.
 *  Uses measured charsPerLine based on inner box width. */
function paginateText(text: string, charsPerLine: number): string[] {
  if (!text) return [''];
  const words = text.split(' ');
  const allLines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const test = currentLine ? currentLine + ' ' + word : word;
    if (test.length > charsPerLine) {
      if (currentLine) allLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) allLines.push(currentLine);

  // Group into pages of max 3 lines each
  const pages: string[] = [];
  for (let i = 0; i < allLines.length; i += MAX_LINES_PER_PAGE) {
    pages.push(allLines.slice(i, i + MAX_LINES_PER_PAGE).join('\n'));
  }
  return pages.length > 0 ? pages : [''];
}

/** Preload images into browser cache. */
function preloadImages(paths: string[]): void {
  for (const p of paths) {
    const img = new Image();
    img.src = p;
  }
}

export const DialogBox: React.FC<DialogBoxProps> = ({
  npcId: _npcId,
  script,
  onLineChange,
  onClose,
  directionNudge,
  confirmTrigger,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure overlay dimensions with ResizeObserver
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setDims({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };
    updateSize();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDims({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Graph state
  const [nodeId, setNodeId] = useState(script.start);
  const [lineIndex, setLineIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);

  // Typewriter state
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const charIndexRef = useRef(0);
  const timerRef = useRef<number>(0);

  // Choice state
  const [showChoices, setShowChoices] = useState(false);
  const [choiceIndex, setChoiceIndex] = useState(0);

  // Portrait face state (for crossfade)
  const [currentFace, setCurrentFace] = useState<PortraitFace>('neutral');
  const [prevFace, setPrevFace] = useState<PortraitFace | null>(null);
  const [faceTransition, setFaceTransition] = useState(false);

  // Portrait entering/exiting
  const [portraitVisible, setPortraitVisible] = useState(false);
  const [portraitExiting, setPortraitExiting] = useState(false);

  // Lean animation trigger
  const [leanKey, setLeanKey] = useState(0);

  // Safe node & line extraction
  const node: DialogNode | undefined = script.nodes[nodeId];
  const currentLine: DialogLine | undefined = node?.lines?.[lineIndex];

  // Layout calculations based on overlay dimensions
  const { w, h } = dims;
  const narrow = w > 0 ? w < 420 : true;

  // Box height based on BOX constants
  const boxRatio = narrow ? BOX.narrowRatio : BOX.wideRatio;
  const boxMin = narrow ? BOX.narrowMin : BOX.wideMin;
  const boxMax = narrow ? BOX.narrowMax : BOX.wideMax;
  const boxH = Math.min(boxMax, Math.max(boxMin, Math.round(h * boxRatio) || boxMin));

  // Portrait dimensions based on PORTRAIT constants
  const portraitHeight = Math.round(h * (narrow ? PORTRAIT.narrowHeight : PORTRAIT.wideHeight));
  const portraitMaxWidth = Math.round(w * PORTRAIT.maxWidth);
  const portraitBottom = boxH - PORTRAIT.tuck;
  const portraitRight = narrow ? PORTRAIT.rightNarrow : PORTRAIT.rightWide;

  const fontSize = narrow ? 8 : 9;
  const lineHeight = 1.9;
  const paddingX = narrow ? 12 : 16;
  const boxPadding = narrow ? '8px 12px' : '12px 16px';

  // Paginate by measurement (charsPerLine = inner box width / fontSize)
  const boxInnerWidth = Math.max(80, (w || 320) - 12 - paddingX * 2);
  const charsPerLine = Math.max(10, Math.floor(boxInnerWidth / fontSize));

  const resolvedText = currentLine ? resolveDialogText(currentLine.text) : '';
  const pages = useMemo(() => paginateText(resolvedText, charsPerLine), [resolvedText, charsPerLine]);
  const safePageIndex = pageIndex >= pages.length ? 0 : pageIndex;
  const currentPageText = pages[safePageIndex] ?? '';
  const isLastPage = safePageIndex >= pages.length - 1;
  const isLastLine = node ? lineIndex >= node.lines.length - 1 : true;

  const closingRef = useRef(false);
  const lastConfirmRef = useRef(confirmTrigger);
  const lastNudgeTsRef = useRef<number | null>(directionNudge?.timestamp ?? null);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPortraitExiting(true);
    setTimeout(() => {
      onClose();
    }, 280);
  }, [onClose]);

  // Guard: if node or line is missing, warn and close safely
  useEffect(() => {
    if (!node || !currentLine) {
      console.warn(`[DialogBox] Missing dialog node "${nodeId}" or line ${lineIndex} for script`, script);
      handleClose();
    }
  }, [node, currentLine, nodeId, lineIndex, script, handleClose]);

  // Preload all portrait faces on mount
  useEffect(() => {
    const paths = script.faces.map(f => `${script.portraitDir}/${f}.webp`);
    preloadImages(paths);
    const t = setTimeout(() => setPortraitVisible(true), 50);
    return () => clearTimeout(t);
  }, [script.faces, script.portraitDir]);

  // Hide the small NPC canvas sprite while dialog is open; restore on close
  useEffect(() => {
    onLineChange?.(0, 'hidden');
    return () => {
      onLineChange?.(0, 'idle');
    };
  }, [onLineChange]);

  // Update face when line changes
  useEffect(() => {
    if (!currentLine) return;
    const newFace = currentLine.face ?? 'neutral';
    if (newFace !== currentFace) {
      setPrevFace(currentFace);
      setCurrentFace(newFace);
      setFaceTransition(true);
      const t = setTimeout(() => {
        setFaceTransition(false);
        setPrevFace(null);
      }, 160);
      return () => clearTimeout(t);
    }
  }, [nodeId, lineIndex, currentLine, currentFace]);

  // Tip tracking
  useEffect(() => {
    if (!currentLine) return;
    if (isTipLine(currentLine.text)) {
      markTipRead();
    }
  }, [currentLine]);

  // Typewriter effect
  useEffect(() => {
    charIndexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);

    const interval = 1000 / CHARS_PER_SEC;
    timerRef.current = window.setInterval(() => {
      charIndexRef.current += 1;
      const next = currentPageText.slice(0, charIndexRef.current);
      setDisplayedText(next);
      if (charIndexRef.current >= currentPageText.length) {
        setIsComplete(true);
        window.clearInterval(timerRef.current);
      }
    }, interval);

    return () => {
      window.clearInterval(timerRef.current);
    };
  }, [currentPageText]);

  // Navigate to a graph node
  const goToNode = useCallback((nextNodeId: string) => {
    setNodeId(nextNodeId);
    setLineIndex(0);
    setPageIndex(0);
    setShowChoices(false);
    setChoiceIndex(0);
    setLeanKey(k => k + 1);
  }, []);

  const advance = useCallback(() => {
    if (showChoices) return;

    if (!isComplete) {
      // Skip typewriter — show full page text immediately
      window.clearInterval(timerRef.current);
      charIndexRef.current = currentPageText.length;
      setDisplayedText(currentPageText);
      setIsComplete(true);
      return;
    }

    if (!isLastPage) {
      setPageIndex(p => p + 1);
      setLeanKey(k => k + 1);
      return;
    }

    if (!isLastLine) {
      setLineIndex(i => i + 1);
      setPageIndex(0);
      setLeanKey(k => k + 1);
      return;
    }

    // Last line of node: check for choices or auto-continue
    if (node?.choices && node.choices.length > 0) {
      setShowChoices(true);
      setChoiceIndex(0);
      return;
    }

    // Auto-continue to next node
    if (node?.next) {
      goToNode(node.next);
      return;
    }

    // End of dialog
    handleClose();
  }, [showChoices, isComplete, isLastPage, isLastLine, node, currentPageText, goToNode, handleClose]);

  const confirmChoice = useCallback(() => {
    if (!showChoices || !node?.choices) return;
    const choice = node.choices[choiceIndex];
    if (choice) {
      goToNode(choice.next);
    }
  }, [showChoices, node, choiceIndex, goToNode]);

  // Latest callback and state refs for trigger effects
  const advanceRef = useRef(advance);
  const confirmChoiceRef = useRef(confirmChoice);
  const showChoicesRef = useRef(showChoices);
  const nodeRef = useRef(node);

  useEffect(() => {
    advanceRef.current = advance;
    confirmChoiceRef.current = confirmChoice;
    showChoicesRef.current = showChoices;
    nodeRef.current = node;
  });

  // Stale trigger fix: confirmTrigger watcher with lastConfirmRef check
  useEffect(() => {
    if (!confirmTrigger || confirmTrigger === lastConfirmRef.current) return;
    lastConfirmRef.current = confirmTrigger;
    if (showChoicesRef.current) {
      confirmChoiceRef.current();
    } else {
      advanceRef.current();
    }
  }, [confirmTrigger]);

  // Direction nudge watcher with lastNudgeTsRef check
  useEffect(() => {
    if (!directionNudge || !directionNudge.timestamp) return;
    if (directionNudge.timestamp === lastNudgeTsRef.current) return;
    lastNudgeTsRef.current = directionNudge.timestamp;
    if (!showChoicesRef.current) return;
    const { dy } = directionNudge;
    if (dy < -0.4) {
      setChoiceIndex(i => Math.max(0, i - 1));
    } else if (dy > 0.4) {
      const maxIdx = (nodeRef.current?.choices?.length ?? 1) - 1;
      setChoiceIndex(i => Math.min(maxIdx, i + 1));
    }
  }, [directionNudge]);

  // Keyboard handlers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();

      if (key === 'escape' || key === 'x') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (showChoicesRef.current) {
        if (key === 'arrowup' || key === 'w') {
          e.preventDefault();
          setChoiceIndex(i => Math.max(0, i - 1));
        } else if (key === 'arrowdown' || key === 's') {
          e.preventDefault();
          const maxIdx = (nodeRef.current?.choices?.length ?? 1) - 1;
          setChoiceIndex(i => Math.min(maxIdx, i + 1));
        } else if (key === 'e' || key === 'o' || key === 'enter' || key === ' ') {
          e.preventDefault();
          confirmChoiceRef.current();
        }
      } else {
        if (key === 'e' || key === 'o' || key === 'enter' || key === ' ') {
          e.preventDefault();
          advanceRef.current();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  if (!node || !currentLine) {
    return null;
  }

  const portraitSrc = `${script.portraitDir}/${currentFace}.webp`;
  const prevPortraitSrc = prevFace ? `${script.portraitDir}/${prevFace}.webp` : null;

  // Debug flag (?debugDialog=1)
  const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugDialog') === '1';

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        pointerEvents: 'auto',
        fontFamily: "'Press Start 2P', 'Itim', sans-serif",
      }}
    >
      {/* ============================================= */}
      {/* DEBUG OVERLAY (?debugDialog=1)               */}
      {/* ============================================= */}
      {isDebug && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            zIndex: 50,
            background: 'rgba(0,0,0,0.85)',
            color: '#00ff66',
            fontFamily: 'monospace',
            fontSize: '8px',
            padding: '4px 6px',
            borderRadius: '3px',
            lineHeight: '1.4',
            pointerEvents: 'none',
            border: '1px solid rgba(0,255,100,0.4)',
          }}
        >
          node:{nodeId} | line:{lineIndex} | page:{safePageIndex + 1}/{pages.length}
          <br />
          complete:{String(isComplete)} | choices:{String(showChoices)} ({choiceIndex})
          <br />
          face:{currentFace} | overlay:{w}×{h} | boxH:{boxH}
          <br />
          portrait:{portraitMaxWidth}×{portraitHeight}
        </div>
      )}

      {/* ============================================= */}
      {/* PORTRAIT (right side, chest cut hidden)      */}
      {/* ============================================= */}
      <div
        className={`dialog-portrait-container ${portraitVisible && !portraitExiting ? 'dialog-portrait-enter' : ''} ${portraitExiting ? 'dialog-portrait-exit' : ''}`}
        style={{
          position: 'absolute',
          right: `${portraitRight}px`,
          bottom: `${portraitBottom}px`,
          height: `${portraitHeight}px`,
          maxWidth: `${portraitMaxWidth}px`,
          zIndex: 31,
          pointerEvents: 'none',
          transformOrigin: 'bottom center',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
        }}
      >
        {/* Continuous breathing wrapper */}
        <div
          className="dialog-portrait-breathe"
          style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            transformOrigin: 'bottom center',
          }}
        >
          {/* Lean wrapper (re-triggered on each new line / page) */}
          <div
            key={leanKey}
            className="dialog-portrait-lean"
            style={{
              position: 'relative',
              height: '100%',
              display: 'flex',
              alignItems: 'flex-end',
              transformOrigin: 'bottom center',
            }}
          >
            {/* Previous face (crossfade out) */}
            {prevPortraitSrc && faceTransition && (
              <img
                src={prevPortraitSrc}
                alt=""
                className="dialog-portrait-face-out"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  height: '100%',
                  width: 'auto',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  objectPosition: 'right bottom',
                  imageRendering: 'auto',
                  filter: 'drop-shadow(-8px 8px 14px rgba(20,12,8,0.45))',
                }}
              />
            )}
            {/* Current face */}
            <img
              src={portraitSrc}
              alt={script.name}
              className={faceTransition ? 'dialog-portrait-face-in' : ''}
              style={{
                height: '100%',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                objectPosition: 'right bottom',
                imageRendering: 'auto',
                filter: 'drop-shadow(-8px 8px 14px rgba(20,12,8,0.45))',
              }}
            />
          </div>
        </div>
      </div>

      {/* ============================================= */}
      {/* CHOICE PANEL (above the box, LEFT side)      */}
      {/* ============================================= */}
      {showChoices && node && node.choices && (
        <div
          style={{
            position: 'absolute',
            left: '6px',
            bottom: `${boxH + 6}px`,
            zIndex: 35,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '6px',
            background: 'rgba(58, 32, 16, 0.94)',
            backdropFilter: 'blur(4px)',
            border: '3px solid #FFF6E5',
            borderRadius: '4px',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {node.choices.map((choice: DialogChoice, idx: number) => (
            <button
              key={choice.label}
              onClick={(e) => {
                e.stopPropagation();
                setChoiceIndex(idx);
                goToNode(choice.next);
              }}
              style={{
                padding: '5px 12px',
                background: idx === choiceIndex ? '#FFF6E5' : 'transparent',
                color: idx === choiceIndex ? '#4A2E1A' : '#FFF6E5',
                border: idx === choiceIndex ? '2px solid #4A2E1A' : '2px solid transparent',
                fontFamily: "'Press Start 2P', 'Itim', sans-serif",
                fontSize: `${fontSize}px`,
                lineHeight: '1.6',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.08s',
              }}
            >
              {idx === choiceIndex ? '\u25B6 ' : '  '}{choice.label}
            </button>
          ))}
        </div>
      )}

      {/* ============================================= */}
      {/* DIALOG BOX (bottom, full width - 12px)       */}
      {/* ============================================= */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (showChoices) {
            confirmChoiceRef.current();
          } else {
            advanceRef.current();
          }
        }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: '6px',
          right: '6px',
          height: `${boxH}px`,
          zIndex: 33,
          cursor: 'pointer',
        }}
      >
        {/* Box body */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#FFF6E5',
            border: '4px solid #4A2E1A',
            boxShadow: '0 -3px 16px rgba(0,0,0,0.35)',
          }}
        >
          {/* Name plate tab (right side, under portrait) */}
          <div
            style={{
              position: 'absolute',
              top: '-20px',
              right: narrow ? '8px' : '14px',
              background: '#4A2E1A',
              color: '#FFF6E5',
              padding: '3px 12px',
              fontSize: '8px',
              fontFamily: "'Press Start 2P', 'Itim', sans-serif",
              lineHeight: '14px',
              borderRadius: '3px 3px 0 0',
            }}
          >
            {script.name}
          </div>

          {/* Text content */}
          <div
            style={{
              padding: boxPadding,
              fontSize: `${fontSize}px`,
              fontFamily: "'Press Start 2P', 'Itim', sans-serif",
              color: '#3A2010',
              lineHeight: String(lineHeight),
              overflow: 'hidden',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              maxHeight: '100%',
            }}
          >
            {displayedText}
          </div>

          {/* Blinking advance indicator */}
          {isComplete && !showChoices && (
            <div
              style={{
                position: 'absolute',
                bottom: '6px',
                right: '10px',
                fontSize: '10px',
                color: '#4A2E1A',
                fontFamily: 'monospace',
              }}
              className="dialog-blink"
            >
              {'\u25BC'}
            </div>
          )}
        </div>
      </div>

      {/* Keyframe injection for blink */}
      <style>{`
        @keyframes dialogBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .dialog-blink {
          animation: dialogBlink 0.8s step-start infinite;
        }
      `}</style>
    </div>
  );
};
