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

interface DialogBoxProps {
  npcId: string;
  script: DialogScript;
  onLineChange?: (lineIndex: number, pose?: string) => void;
  onClose: () => void;
  /** Called every time the dialogue enters a node (including the start node). Used by story mode. */
  onNodeEnter?: (nodeId: string) => void;
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

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  return measureCtx;
}

/** Wrap text using measured width from offscreen canvas context. */
function wrapTextMeasured(text: string, maxWidth: number, font: string): string[] {
  if (!text) return [''];
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = font;
  }

  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) {
        if (!currentLine && i < words.length - 1) continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx ? ctx.measureText(testLine) : { width: testLine.length * 10 };

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        // Check if single word itself exceeds maxWidth
        const wordMetrics = ctx ? ctx.measureText(word) : { width: word.length * 10 };
        if (wordMetrics.width > maxWidth) {
          let chunk = '';
          for (const char of word) {
            const testChunk = chunk + char;
            const chunkWidth = ctx ? ctx.measureText(testChunk).width : testChunk.length * 10;
            if (chunkWidth > maxWidth && chunk) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk = testChunk;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}

/** Split measured lines into pages of MAX_LINES_PER_PAGE lines each. */
function paginateText(lines: string[]): string[] {
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + MAX_LINES_PER_PAGE).join('\n'));
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
  npcId,
  script,
  onLineChange,
  onClose,
  onNodeEnter,
  directionNudge,
  confirmTrigger,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
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

  // Story hook: report every node we enter (keep the latest callback in a ref so it fires once per node)
  const onNodeEnterRef = useRef(onNodeEnter);
  onNodeEnterRef.current = onNodeEnter;
  useEffect(() => {
    onNodeEnterRef.current?.(nodeId);
  }, [nodeId]);

  // Safe node & line extraction
  const node: DialogNode | undefined = script.nodes[nodeId];
  const currentLine: DialogLine | undefined = node?.lines?.[lineIndex];

  // Layout calculations based on overlay dimensions
  const { w, h } = dims;
  const narrow = w > 0 ? w < 420 : true;

  // Box real measured height & inner width with ResizeObserver
  const [boxH, setBoxH] = useState(narrow ? 128 : 140);
  const [boxInnerW, setBoxInnerW] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const updateBox = () => {
      setBoxH(el.offsetHeight || (narrow ? 128 : 140));
      const inner = el.clientWidth - 32;
      if (inner > 0) setBoxInnerW(inner);
    };
    updateBox();
    const ro = new ResizeObserver(() => {
      updateBox();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrow]);

  // Portrait dimensions based on real measured box height
  const portraitHeight = Math.round(h * (narrow ? PORTRAIT.narrowHeight : PORTRAIT.wideHeight));
  const portraitMaxWidth = Math.round(w * PORTRAIT.maxWidth);
  // Portrait sits on the TALK box (its min height), not the measured height, so it never
  // jumps when the choices open and the box grows (the box simply overlaps the chest).
  const baseBoxH = narrow ? 128 : 140;
  const portraitBottom = 10 + baseBoxH - PORTRAIT.tuck;
  const portraitRight = narrow ? PORTRAIT.rightNarrow : PORTRAIT.rightWide;

  const fontSize = narrow ? 26 : 28;
  const accent = script.accent || '#5A3A22';

  // Measure box inner width for wrap calculation (with a slight right safety buffer)
  const innerWidth = Math.max(120, (boxInnerW > 0 ? boxInnerW : (w > 0 ? w - 52 : 300)) - 14);
  const resolvedText = currentLine ? resolveDialogText(currentLine.text) : '';
  const fontSpec = `600 ${fontSize}px 'Pixelify Sans', 'Sabai Pixel', monospace`;

  const pages = useMemo(() => {
    const lines = wrapTextMeasured(resolvedText, innerWidth, fontSpec);
    return paginateText(lines);
  }, [resolvedText, innerWidth, fontSpec]);

  const safePageIndex = pageIndex >= pages.length ? 0 : pageIndex;
  const currentPageText = pages[safePageIndex] ?? '';
  const isLastPage = safePageIndex >= pages.length - 1;
  const isLastLine = node ? lineIndex >= node.lines.length - 1 : true;

  const hasMoreToRead = !isLastPage || !isLastLine || Boolean(node?.next) || Boolean(node?.choices && node.choices.length > 0);
  const showContinueArrow = isComplete && !showChoices && hasMoreToRead;

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

  const hasPortrait = Boolean(script.portraitDir && script.faces && script.faces.length > 0);

  // Preload all portrait faces on mount (only when portraits are defined)
  useEffect(() => {
    if (!hasPortrait || !script.portraitDir || !script.faces) return;
    const paths = script.faces.map(f => `${script.portraitDir}/${f}.webp`);
    preloadImages(paths);
    const t = setTimeout(() => setPortraitVisible(true), 50);
    return () => clearTimeout(t);
  }, [hasPortrait, script.faces, script.portraitDir]);

  // Hide the small NPC canvas sprite while dialog is open ONLY if portrait is present
  useEffect(() => {
    if (!hasPortrait) return;
    onLineChange?.(0, 'hidden');
    return () => {
      onLineChange?.(0, undefined);
    };
  }, [hasPortrait, onLineChange]);

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

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Preserve reading speed while batching characters into fewer React updates.
    const charsPerTick = 2;
    const interval = charsPerTick * 1000 / CHARS_PER_SEC;
    const tick = () => {
      charIndexRef.current = Math.min(currentPageText.length, charIndexRef.current + charsPerTick);
      const next = currentPageText.slice(0, charIndexRef.current);
      setDisplayedText(next);
      if (charIndexRef.current >= currentPageText.length) {
        setIsComplete(true);
        window.clearInterval(timerRef.current);
      }
    };
    const syncPlayback = () => {
      window.clearInterval(timerRef.current);
      if (motion.matches || !currentPageText) {
        charIndexRef.current = currentPageText.length;
        setDisplayedText(currentPageText);
        setIsComplete(true);
      } else if (!document.hidden && charIndexRef.current < currentPageText.length) {
        timerRef.current = window.setInterval(tick, interval);
      }
    };
    syncPlayback();
    document.addEventListener('visibilitychange', syncPlayback);
    motion.addEventListener('change', syncPlayback);

    return () => {
      window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', syncPlayback);
      motion.removeEventListener('change', syncPlayback);
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

  const lastAdvanceTimeRef = useRef(0);

  const advance = useCallback(() => {
    if (showChoices) return;

    const now = performance.now();
    if (now - lastAdvanceTimeRef.current < 150) return;
    lastAdvanceTimeRef.current = now;

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
    const now = performance.now();
    if (now - lastAdvanceTimeRef.current < 150) return;
    lastAdvanceTimeRef.current = now;

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
      if (e.repeat) return;
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

  const portraitSrc = hasPortrait ? `${script.portraitDir}/${currentFace}.webp` : '';
  const prevPortraitSrc = hasPortrait && prevFace ? `${script.portraitDir}/${prevFace}.webp` : null;

  // Debug flag (?debugDialog=1)
  const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugDialog') === '1';

  return (
    <div
      ref={rootRef}
      className="dialog-text-smooth"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        pointerEvents: 'auto',
        fontFamily: "'Pixelify Sans', 'Sabai Pixel', monospace",
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'geometricPrecision',
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
      {hasPortrait && (
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
                    filter: 'drop-shadow(0 8px 18px rgba(40,25,15,.28))',
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
                  filter: 'drop-shadow(0 8px 18px rgba(40,25,15,.28))',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Choices: separate card above the message box, left side (like the old layout) */}
      {showChoices && node?.choices && node.choices.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '10px',
            bottom: `${10 + boxH + 6}px`,
            zIndex: 36,
            width: 'max-content',
            minWidth: '168px',
            maxWidth: 'calc(100% - 20px)',
            background: 'rgba(58, 32, 16, 0.95)',
            border: '2.5px solid #FFF8EC',
            borderRadius: '12px',
            padding: '5px',
            boxShadow: '0 8px 22px rgba(20,10,5,.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {node.choices.map((choice: DialogChoice, idx: number) => {
            const isSelected = idx === choiceIndex;
            return (
              <button
                key={choice.label}
                type="button"
                onMouseEnter={() => setChoiceIndex(idx)}
                onClick={(e) => {
                  e.stopPropagation();
                  setChoiceIndex(idx);
                  goToNode(choice.next);
                }}
                style={{
                  height: '42px',
                  borderRadius: '8px',
                  padding: '0 12px',
                  fontFamily: "'Pixelify Sans', 'Sabai Pixel', monospace",
                  fontSize: narrow ? '20px' : '22px',
                  fontWeight: 600,
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'geometricPrecision',
                  color: isSelected ? '#3A2010' : '#FFF8EC',
                  backgroundColor: isSelected ? '#FFF8EC' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  outline: 'none',
                  transition: 'background-color 0.1s ease, color 0.1s ease',
                }}
              >
                <span
                  style={{
                    width: '12px',
                    display: 'inline-block',
                    flexShrink: 0,
                    fontSize: '18px',
                    lineHeight: 1,
                    color: accent,
                  }}
                >
                  {isSelected ? '▸' : ''}
                </span>
                <span
                  style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {choice.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ============================================= */}
      {/* MESSAGE BOX (bottom 10px, left/right 10px)    */}
      {/* ============================================= */}
      <div
        ref={boxRef}
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
          bottom: '10px',
          left: '10px',
          right: '10px',
          minHeight: narrow ? '128px' : '140px',
          background: '#FFF8EC',
          border: '2.5px solid #5A3A22',
          borderRadius: '16px',
          padding: '20px 16px 14px',
          boxShadow: '0 6px 0 rgba(90,58,34,.18), 0 10px 24px rgba(40,25,15,.25)',
          zIndex: 33,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Name tag pill on top of the box */}
        <div
          style={{
            position: 'absolute',
            top: '-17px',
            right: '14px',
            height: '30px',
            padding: '0 12px 0 5px',
            borderRadius: '999px',
            background: '#5A3A22',
            color: '#FFF8EC',
            fontFamily: "'Pixelify Sans', 'Sabai Pixel', monospace",
            fontSize: '20px',
            fontWeight: 700,
            lineHeight: '30px',
            letterSpacing: '0.02em',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'geometricPrecision',
            boxShadow: '0 2px 6px rgba(40,25,15,.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              border: '2px solid #FFF8EC',
              backgroundColor: accent,
              overflow: 'hidden',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <img
              src={`/sprites/npc/${npcId}/head.webp`}
              alt=""
              onError={(e) => {
                // Fallback for NPCs without a head crop yet
                const img = e.currentTarget;
                if (!img.src.endsWith('/idle.webp')) img.src = `/sprites/npc/${npcId}/idle.webp`;
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top',
                imageRendering: 'pixelated',
              }}
            />
          </div>
          <span style={{ whiteSpace: 'nowrap' }}>{script.name}</span>
        </div>

        {/* Text content */}
        <div
          style={{
            fontFamily: "'Pixelify Sans', 'Sabai Pixel', monospace",
            fontSize: `${fontSize}px`,
            fontWeight: 600,
            lineHeight: 1.45,
            letterSpacing: '0.02em',
            color: '#24160E',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            flex: 1,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'geometricPrecision',
          }}
        >
          {displayedText}
        </div>

        {/* Continue arrow */}
        {showContinueArrow && (
          <div
            className="dialog-bob-arrow"
            style={{
              position: 'absolute',
              right: '14px',
              bottom: '10px',
              color: accent,
              fontFamily: "'Pixelify Sans', 'Sabai Pixel', monospace",
              fontSize: '16px',
              lineHeight: 1,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            ▼
          </div>
        )}
      </div>

      {/* Keyframe injection for bob */}
      <style>{`
        @keyframes dialogBob {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .dialog-bob-arrow {
          animation: dialogBob 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
