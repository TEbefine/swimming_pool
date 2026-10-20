import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { DialogScript, DialogNode, DialogLine, PortraitFace, DialogChoice } from '../game/content/dialogues';
import { resolveDialogText, isTipLine } from '../game/content/dialogues';

// =========================================================================
// TALK SCREEN v2 (approved 2026-10-19 — see project doc ui/talk-screen.md)
// Plain cream bubble · max 2 rows · curved pointer · tilted name tag on the
// right · pixel friendship heart instead of ▼ · outlined portrait that the
// box overlaps by ~6% · "A2 soft" choice card on the left.
// =========================================================================

const INK = '#2B1E14';
const PAPER = '#FFF8EC';
const FONT = "'Pool Pixel Default', monospace";

const MAX_ROWS = 2;

/**
 * All talk-box sizes, scaled to the game screen. Base sizes (s = 1) are tuned for the phone
 * Game Boy screen (~330×450 CSS px on an iPhone 13); bigger screens scale up, tiny phones a little down.
 */
function makeLayout(w: number, h: number) {
  const s = w > 0 && h > 0 ? Math.min(1.4, Math.max(0.85, Math.min(w / 330, h / 450))) : 1;
  const r = (n: number) => Math.round(n * s);
  const border = s >= 1.25 ? 3 : 2;
  const pixel = s >= 1.25 ? 2 : 1.5;           // size of one "pixel" in the heart / arrow art
  const ptr = 0.72 * s;                         // pointer SVG scale
  return {
    s,
    inset: r(5),
    border,
    radius: r(15),
    shadow: `${r(3)}px ${r(3) + 1}px 0 ${INK}`,
    text: r(20),
    lineHeight: r(26),
    padX: r(13),
    oneRow: r(52),                              // box height for 1 row (text centred)
    twoRows: r(76),                             // box height for 2 rows
    heartRoom: r(22),                           // the 2nd row stops this much earlier (heart)
    heartRight: r(10),
    heartBottom: r(8),
    pixel,
    ptr,
    tag: { h: r(24), font: r(13), head: r(17), top: -r(14), right: r(12), padL: r(3), padR: r(9), radius: r(7), gap: r(5) },
    choice: { font: r(17), row: r(30), padY: r(5), padX: r(4), radius: r(14), minW: r(150), gap: r(10), rowPadL: r(9), rowPadR: r(14), arrowSlot: r(14) },
    outline: s >= 1.25 ? 3 : 2,
  };
}

const PORTRAIT = {
  narrowHeight: 0.70,   // share of overlay height when w < 420 (phone / GameBoy)
  wideHeight:   0.94,   // share of overlay height on wide screens
  maxWidth:     1.15,   // share of overlay width
  overlap:      0.06,   // the message box covers the bottom ~6% of the character
  fade:         12,     // px soft fade at the very bottom of the picture
  rightNarrow:  -10,    // px, may bleed slightly off the right edge
  rightWide:    24,
};

// Dark outline + hard shadow around the cut-out photo (2px on phones, 3px on big screens).
// TODO(perf): bake this into the portrait files so low-end phones skip the filter work.
const portraitFilter = (o: number) =>
  `drop-shadow(${o}px 0 0 ${INK}) drop-shadow(-${o}px 0 0 ${INK}) drop-shadow(0 ${o}px 0 ${INK}) drop-shadow(0 -${o}px 0 ${INK}) drop-shadow(${o + 2}px ${o + 2}px 0 rgba(20,10,5,0.45))`;

/** Friendship heart, low → max: black → purple → pink → red. o/b/s/l = outline/base/shade/light, w = shine. */
const HEARTS = [
  { o: '#1A1412', b: '#3B3431', s: '#2A2421', l: '#6B625D', w: 0.3, name: 'stranger' },
  { o: '#2A1636', b: '#5A3A8A', s: '#432A6E', l: '#8A6BB8', w: 0.5, name: 'hello' },
  { o: '#301642', b: '#8550C8', s: '#6A3DAA', l: '#B48AE8', w: 0.75, name: 'friendly' },
  { o: '#3A1640', b: '#B455C8', s: '#9140A8', l: '#DD95EA', w: 0.8, name: 'friend' },
  { o: '#48163A', b: '#E060A8', s: '#BE4A8C', l: '#F59ACB', w: 0.85, name: 'good friend' },
  { o: '#4E1426', b: '#EE4A72', s: '#C9365A', l: '#FF92A8', w: 0.9, name: 'close friend' },
  { o: '#4A0E14', b: '#EE2A36', s: '#C21C28', l: '#FF8C8C', w: 1, name: 'best friend' },
];

interface DialogBoxProps {
  npcId: string;
  script: DialogScript;
  onLineChange?: (lineIndex: number, pose?: string) => void;
  onClose: () => void;
  /** Called every time the dialogue enters a node (including the start node). Used by story mode. */
  onNodeEnter?: (nodeId: string) => void;
  directionNudge?: { dx: number; dy: number; timestamp: number } | null;
  confirmTrigger?: number;
  /** Friendship level 0–6 (0 = black heart, 6 = red). The points system comes later; every NPC starts at 0. */
  friendship?: number;
}

const CHARS_PER_SEC = 40;
/** Bump when portrait files are replaced, so phones fetch the new art instead of a cached copy. */
const PORTRAIT_REV = '2026-10-19';
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

/** "*word*" marks a highlighted word. Returns the plain text and a highlight flag per character. */
function parseHighlights(raw: string): { plain: string; hl: boolean[] } {
  let plain = '';
  const hl: boolean[] = [];
  let on = false;
  for (const ch of raw) {
    if (ch === '*') { on = !on; continue; }
    plain += ch;
    hl.push(on);
  }
  return { plain, hl };
}

/**
 * Wrap text into rows as [start, end) ranges of `plain`. Row widths alternate: the 1st row of each
 * 2-row page may use `fullW`, the 2nd row only `lastW` (room for the heart).
 */
function wrapRows(plain: string, fullW: number, lastW: number, font: string, size: number): Array<[number, number]> {
  const ctx = getMeasureCtx();
  if (ctx) ctx.font = font;
  const measure = (s: string) => (ctx ? ctx.measureText(s).width : s.length * size * 0.5);
  const rows: Array<[number, number]> = [];
  const limit = () => (rows.length % MAX_ROWS === MAX_ROWS - 1 ? lastW : fullW);

  let paraStart = 0;
  const paragraphs = plain.split('\n');
  for (const para of paragraphs) {
    let start = paraStart;
    const end = paraStart + para.length;
    let lastSpace = -1;
    let i = start;
    while (i < end) {
      if (plain[i] === ' ') lastSpace = i;
      if (i > start && measure(plain.slice(start, i + 1)) > limit()) {
        const cut = lastSpace > start ? lastSpace : i;   // break at the last space, or mid-word for long words / Thai
        rows.push([start, cut]);
        start = plain[cut] === ' ' ? cut + 1 : cut;
        lastSpace = -1;
        i = start;
        continue;
      }
      i++;
    }
    rows.push([start, end]);
    paraStart = end + 1; // skip the '\n'
  }
  // A page that ends with only 1 row also shows the heart: if that row would reach the heart,
  // move its last word down to a 2nd row.
  if (rows.length % MAX_ROWS === 1) {
    const [a, b] = rows[rows.length - 1];
    if (b - a > 1 && measure(plain.slice(a, b)) > lastW) {
      let cut = plain.lastIndexOf(' ', b - 1);
      if (cut > a) {
        rows.splice(rows.length - 1, 1, [a, cut], [cut + 1, b]);
      } else {
        // no space (long word / Thai): move the last few letters, never splitting a Thai mark from its letter
        cut = Math.max(a + 1, b - 3);
        while (cut > a + 1 && /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(plain[cut])) cut--;
        rows.splice(rows.length - 1, 1, [a, cut], [cut, b]);
      }
    }
  }
  return rows.length > 0 ? rows : [[0, 0]];
}

type Page = { text: string; hl: boolean[]; rows: number };

/** Group rows into pages of at most MAX_ROWS rows. */
function paginate(plain: string, hl: boolean[], rows: Array<[number, number]>): Page[] {
  const pages: Page[] = [];
  for (let r = 0; r < rows.length; r += MAX_ROWS) {
    const chunk = rows.slice(r, r + MAX_ROWS);
    let text = '';
    const mask: boolean[] = [];
    chunk.forEach(([a, b], idx) => {
      if (idx > 0) { text += '\n'; mask.push(false); }
      text += plain.slice(a, b);
      for (let k = a; k < b; k++) mask.push(hl[k] ?? false);
    });
    pages.push({ text, hl: mask, rows: chunk.length });
  }
  return pages.length > 0 ? pages : [{ text: '', hl: [], rows: 1 }];
}

/** Preload images into browser cache. */
function preloadImages(paths: string[]): void {
  for (const p of paths) {
    const img = new Image();
    img.src = p;
  }
}

/** Pixel friendship heart (11×10 grid drawn at 2×). */
const PixelHeart: React.FC<{ level: number; pixel: number }> = ({ level, pixel }) => {
  const h = HEARTS[Math.max(0, Math.min(HEARTS.length - 1, Math.round(level)))];
  return (
    <svg role="img" aria-label={`Friendship: ${h.name}`} width={11 * pixel} height={10 * pixel} viewBox="0 0 11 10" shapeRendering="crispEdges">
      <path d="M2 0h3v1h-3z M6 0h3v1h-3z M1 1h9v1h-9z M0 2h11v3h-11z M1 5h9v1h-9z M2 6h7v1h-7z M3 7h5v1h-5z M4 8h3v1h-3z M5 9h1v1h-1z" fill={h.o} />
      <path d="M2 1h3v1h-3z M6 1h3v1h-3z M1 2h9v3h-9z M2 5h7v1h-7z M3 6h5v1h-5z M4 7h3v1h-3z M5 8h1v1h-1z" fill={h.b} />
      <path d="M9 3h1v1h-1z M8 4h2v1h-2z M7 5h2v1h-2z M6 6h2v1h-2z M6 7h1v1h-1z M5 8h1v1h-1z" fill={h.s} />
      <path d="M3 1h2v1h-2z M3 2h1v1h-1z M2 3h1v1h-1z" fill={h.l} />
      <path d="M2 2h1v1h-1z" fill="#FFFFFF" opacity={h.w} />
    </svg>
  );
};

/** Small white pixel arrow for the selected choice. */
const PixelArrow: React.FC<{ pixel: number }> = ({ pixel }) => (
  <svg aria-hidden="true" width={4 * pixel} height={7 * pixel} viewBox="0 0 4 7" shapeRendering="crispEdges">
    <path d="M0 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill="#FFFFFF" />
  </svg>
);

export const DialogBox: React.FC<DialogBoxProps> = ({
  npcId,
  script,
  onLineChange,
  onClose,
  onNodeEnter,
  directionNudge,
  confirmTrigger,
  friendship = 0,
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
  const [displayedCount, setDisplayedCount] = useState(0);
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

  // Re-measure text once the pixel font has loaded (the first measure may use the fallback font)
  const [fontTick, setFontTick] = useState(0);

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
  const L = useMemo(() => makeLayout(w, h), [w, h]);

  // Box inner width (measured) for text wrapping
  const [boxInnerW, setBoxInnerW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const updateBox = () => {
      const inner = el.clientWidth - L.padX * 2;
      if (inner > 0) setBoxInnerW(inner);
    };
    updateBox();
    const ro = new ResizeObserver(() => updateBox());
    ro.observe(el);
    return () => ro.disconnect();
  }, [L.padX]);

  const accent = script.accent || '#5A3A22';
  const fontSpec = `500 ${L.text}px ${FONT}`;

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.load) return;
    let alive = true;
    document.fonts.load(fontSpec, 'A').then(() => { if (alive) setFontTick((t) => t + 1); }).catch(() => {});
    return () => { alive = false; };
  }, [fontSpec]);

  const innerWidth = Math.max(120, boxInnerW > 0 ? boxInnerW : (w > 0 ? w - L.inset * 2 - L.border * 2 - L.padX * 2 : 300));
  const resolvedText = currentLine ? resolveDialogText(currentLine.text) : '';

  const pages = useMemo(() => {
    const { plain, hl } = parseHighlights(resolvedText);
    const rows = wrapRows(plain, innerWidth - 2, innerWidth - L.heartRoom, fontSpec, L.text);
    return paginate(plain, hl, rows);
    // fontTick: re-wrap once the pixel font is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedText, innerWidth, fontSpec, fontTick, L.heartRoom, L.text]);

  const safePageIndex = pageIndex >= pages.length ? 0 : pageIndex;
  const currentPage = pages[safePageIndex] ?? { text: '', hl: [], rows: 1 };
  const currentPageText = currentPage.text;
  const isLastPage = safePageIndex >= pages.length - 1;
  const isLastLine = node ? lineIndex >= node.lines.length - 1 : true;

  // Box height follows the text: 1 row → short box, 2 rows → tall box (never more than 2 rows)
  const boxH = currentPage.rows <= 1 ? L.oneRow : L.twoRows;

  // Portrait: fixed size/position; the box covers its bottom ~6% (measured against the short box)
  const portraitHeight = Math.round(h * (narrow ? PORTRAIT.narrowHeight : PORTRAIT.wideHeight));
  const portraitMaxWidth = Math.round(w * PORTRAIT.maxWidth);
  const portraitBottom = L.inset + L.oneRow - Math.round(portraitHeight * PORTRAIT.overlap);
  const portraitRight = narrow ? PORTRAIT.rightNarrow : PORTRAIT.rightWide;

  const pointerRight = Math.max(
    Math.round(100 * L.s),
    Math.round(portraitRight + portraitHeight * 0.5 - L.inset - (50 - 21) * L.ptr),
  );

  const showHeart = isComplete && !showChoices;

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
    const paths = script.faces.map(f => `${script.portraitDir}/${f}.webp?v=${PORTRAIT_REV}`);
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
    setDisplayedCount(0);
    setIsComplete(false);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Preserve reading speed while batching characters into fewer React updates.
    const charsPerTick = 2;
    const interval = charsPerTick * 1000 / CHARS_PER_SEC;
    const tick = () => {
      charIndexRef.current = Math.min(currentPageText.length, charIndexRef.current + charsPerTick);
      setDisplayedCount(charIndexRef.current);
      if (charIndexRef.current >= currentPageText.length) {
        setIsComplete(true);
        window.clearInterval(timerRef.current);
      }
    };
    const syncPlayback = () => {
      window.clearInterval(timerRef.current);
      if (motion.matches || !currentPageText) {
        charIndexRef.current = currentPageText.length;
        setDisplayedCount(currentPageText.length);
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

  // Visible text split into plain / highlighted runs
  const segments = useMemo(() => {
    const out: Array<{ text: string; hl: boolean }> = [];
    const n = Math.min(displayedCount, currentPageText.length);
    for (let k = 0; k < n; k++) {
      const ch = currentPageText[k];
      const hl = currentPage.hl[k] ?? false;
      const last = out[out.length - 1];
      if (last && last.hl === hl) last.text += ch;
      else out.push({ text: ch, hl });
    }
    return out;
  }, [displayedCount, currentPageText, currentPage.hl]);

  // Navigate to a graph node
  const goToNode = useCallback((nextNodeId: string) => {
    setNodeId(nextNodeId);
    setLineIndex(0);
    setPageIndex(0);
    setShowChoices(false);
    setChoiceIndex(0);
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
      setDisplayedCount(currentPageText.length);
      setIsComplete(true);
      return;
    }

    if (!isLastPage) {
      setPageIndex(p => p + 1);
      return;
    }

    if (!isLastLine) {
      setLineIndex(i => i + 1);
      setPageIndex(0);
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

  const portraitSrc = hasPortrait ? `${script.portraitDir}/${currentFace}.webp?v=${PORTRAIT_REV}` : '';
  const prevPortraitSrc = hasPortrait && prevFace ? `${script.portraitDir}/${prevFace}.webp?v=${PORTRAIT_REV}` : null;
  const fadeMask = `linear-gradient(180deg, #000 0, #000 calc(100% - ${PORTRAIT.fade}px), transparent 100%)`;

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
        fontFamily: FONT,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'geometricPrecision',
      }}
    >
      {/* Soft dim over the scene (no blur — cheaper on phones and keeps the room readable) */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(43,30,20,0.28)', pointerEvents: 'none' }} />

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
          node:{nodeId} | line:{lineIndex} | page:{safePageIndex + 1}/{pages.length} | rows:{currentPage.rows}
          <br />
          complete:{String(isComplete)} | choices:{String(showChoices)} ({choiceIndex})
          <br />
          face:{currentFace} | overlay:{w}×{h} | scale:{L.s.toFixed(2)} | boxH:{boxH} | textW:{innerWidth}
          <br />
          portrait:{portraitMaxWidth}×{portraitHeight} bottom:{portraitBottom}
        </div>
      )}

      {/* ============================================= */}
      {/* PORTRAIT (outlined; the box covers its bottom) */}
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
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            WebkitMaskImage: fadeMask,
            maskImage: fadeMask,
          }}
        >
          <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
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
                  filter: portraitFilter(L.outline),
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
                filter: portraitFilter(L.outline),
              }}
            />
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* CHOICES — "A2 soft" card, left, above the box  */}
      {/* ============================================= */}
      {showChoices && node?.choices && node.choices.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: `${L.inset}px`,
            bottom: `${L.inset + boxH + L.choice.gap}px`,
            zIndex: 36,
            width: 'max-content',
            minWidth: `${L.choice.minW}px`,
            maxWidth: `calc(100% - ${L.inset * 2 + 6}px)`,
            boxSizing: 'border-box',
            background: '#3A2A1E',
            border: `${L.border}px solid ${INK}`,
            borderRadius: `${L.choice.radius}px`,
            padding: `${L.choice.padY}px ${L.choice.padX}px`,
            boxShadow: L.shadow,
            display: 'flex',
            flexDirection: 'column',
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
                  height: `${L.choice.row}px`,
                  padding: `0 ${L.choice.rowPadR}px 0 ${L.choice.rowPadL}px`,
                  fontFamily: FONT,
                  fontSize: `${L.choice.font}px`,
                  fontWeight: 400,
                  color: isSelected ? '#FFFFFF' : '#B8A28C',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  outline: 'none',
                }}
              >
                <span style={{ width: `${L.choice.arrowSlot}px`, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                  {isSelected ? <PixelArrow pixel={L.pixel} /> : null}
                </span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {choice.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ============================================= */}
      {/* MESSAGE BOX                                    */}
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
          bottom: `${L.inset}px`,
          left: `${L.inset}px`,
          right: `${L.inset}px`,
          height: `${boxH}px`,
          boxSizing: 'border-box',
          background: PAPER,
          border: `${L.border}px solid ${INK}`,
          borderRadius: `${L.radius}px`,
          padding: `0 ${L.padX}px`,
          boxShadow: L.shadow,
          zIndex: 33,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Curved pointer — its line runs along the top border so the join is seamless */}
        <svg
          aria-hidden="true"
          width={60 * L.ptr}
          height={22 * L.ptr}
          viewBox="-10 0 60 22"
          style={{
            position: 'absolute',
            // keep the SVG's line (y = 16.5) exactly on the middle of the box's top border
            top: `${-L.border / 2 - 16.5 * L.ptr}px`,
            // point at the middle of the portrait (portraits are about as wide as they are tall), clear of the name tag
            right: `${pointerRight}px`,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <path d="M6 16.5 C12 16.5 14.5 13.5 17 9 C18.6 6.2 19.6 5 21 5 C22.4 5 23.4 6.2 25 9 C27.5 13.5 30 16.5 36 16.5 L36 22 L6 22 Z" fill={PAPER} />
          <path
            d="M-10 16.5 H6 C12 16.5 14.5 13.5 17 9 C18.6 6.2 19.6 5 21 5 C22.4 5 23.4 6.2 25 9 C27.5 13.5 30 16.5 36 16.5 H52"
            fill="none"
            stroke={INK}
            strokeWidth={L.border / L.ptr}
            strokeLinejoin="round"
            strokeLinecap="butt"
          />
        </svg>

        {/* Name tag — right side, tilted */}
        <div
          style={{
            position: 'absolute',
            top: `${L.tag.top}px`,
            right: `${L.tag.right}px`,
            transform: 'rotate(-3deg)',
            height: `${L.tag.h}px`,
            boxSizing: 'border-box',
            padding: `0 ${L.tag.padR}px 0 ${L.tag.padL}px`,
            borderRadius: `${L.tag.radius}px`,
            background: accent,
            border: `${L.border}px solid ${INK}`,
            boxShadow: `2px 2px 0 ${INK}`,
            color: PAPER,
            fontFamily: FONT,
            fontSize: `${L.tag.font}px`,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: `${L.tag.gap}px`,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: `${L.tag.head}px`,
              height: `${L.tag.head}px`,
              borderRadius: '50%',
              backgroundColor: PAPER,
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
                else img.style.visibility = 'hidden'; // not an NPC (e.g. a board): no head
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

        {/* Text — max 2 rows, centred vertically in the box */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: `${L.text}px`,
            fontWeight: 500,
            lineHeight: `${L.lineHeight}px`,
            letterSpacing: 0,
            color: INK,
            whiteSpace: 'pre',
            overflow: 'hidden',
            width: '100%',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'geometricPrecision',
          }}
        >
          {segments.length === 0
            ? ' '
            : segments.map((s, i) => (
                <span key={i} style={s.hl ? { color: accent } : undefined}>{s.text}</span>
              ))}
        </div>

        {/* Friendship heart (where ▼ used to be) */}
        {showHeart && (
          <div className="dialog-heart-beat" style={{ position: 'absolute', right: `${L.heartRight}px`, bottom: `${L.heartBottom}px`, lineHeight: 0, pointerEvents: 'none' }}>
            <PixelHeart level={friendship} pixel={L.pixel} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes dialogHeartBeat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1px); }
        }
        .dialog-heart-beat {
          animation: dialogHeartBeat 1.4s steps(2, end) infinite;
        }
      `}</style>
    </div>
  );
};
