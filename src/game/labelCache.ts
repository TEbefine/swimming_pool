/** Text is the most expensive thing a 2D canvas draws (glyph shaping + anti-aliasing, every frame).
 *  Name tags, speech bubbles and signs barely ever change, so each one is drawn once into a small
 *  bitmap and then stamped with a single drawImage. Bounded LRU: 200 players never grow it forever. */

export interface Label {
  canvas: HTMLCanvasElement;
  /** Where the label's anchor point sits inside the bitmap (draw at anchorX - ax, anchorY - ay). */
  ax: number;
  ay: number;
}

const PIXEL_FONT = '"Sabai Pixel"';

export class LabelCache {
  private map = new Map<string, Label>();
  private measure: CanvasRenderingContext2D | null = null;
  private readonly limit: number;

  constructor(limit = 256) {
    this.limit = limit;
    if (typeof document !== 'undefined' && document.fonts) {
      // Labels drawn before the pixel font arrived used a fallback font: redraw them.
      document.fonts.addEventListener?.('loadingdone', () => this.clear());
    }
  }

  get size() { return this.map.size; }

  clear() { this.map.clear(); }

  /** True once the pixel font is ready; before that, labels are drawn live (and not cached). */
  fontReady(): boolean {
    try {
      return typeof document === 'undefined' || !document.fonts || document.fonts.check(`16px ${PIXEL_FONT}`);
    } catch {
      return true;
    }
  }

  get<T extends Label>(key: string, build: () => T | null): T | null {
    const hit = this.map.get(key) as T | undefined;
    if (hit) {
      // refresh LRU position
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    if (!this.fontReady()) return null;
    const label = build();
    if (!label) return null;
    this.map.set(key, label);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as string);
    return label;
  }

  measureCtx(): CanvasRenderingContext2D {
    if (!this.measure) this.measure = document.createElement('canvas').getContext('2d')!;
    return this.measure;
  }
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

// ---------------------------------------------------------------------------
// Drawing recipes. Each draws in its own local coordinates, so the same code
// paints a cached bitmap or (before the font loads) the live canvas.
// ---------------------------------------------------------------------------

export function nameTagSize(ctx: CanvasRenderingContext2D, text: string) {
  ctx.font = `16px ${PIXEL_FONT}, monospace`;
  const boxW = ctx.measureText(text).width + 12;
  return { boxW, boxH: 20 };
}

/** Name tag pill with its top-left corner at (bx, by). */
export function drawNameTag(ctx: CanvasRenderingContext2D, text: string, isMe: boolean, bx: number, by: number, boxW: number) {
  const boxH = 20;
  ctx.fillStyle = isMe ? 'rgba(15, 32, 67, 0.85)' : 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = isMe ? '#4fc3f7' : '#90a4ae';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, boxW, boxH);
  ctx.font = `16px ${PIXEL_FONT}, monospace`;
  ctx.fillStyle = isMe ? '#e1f5fe' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + boxW / 2, by + boxH / 2 + 1);
}

export function buildNameTag(cache: LabelCache, text: string, isMe: boolean): Label {
  const { boxW } = nameTagSize(cache.measureCtx(), text);
  const [c, g] = makeCanvas(boxW + 2, 22);
  drawNameTag(g, text, isMe, 1, 1, boxW);
  // anchor = bottom centre of the pill
  return { canvas: c, ax: 1 + boxW / 2, ay: 21 };
}

export function wrapBubbleText(ctx: CanvasRenderingContext2D, text: string, maxLineWidth = 180): string[] {
  ctx.font = `16px ${PIXEL_FONT}, monospace`;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = words[0] || '';
  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i];
    if (ctx.measureText(test).width < maxLineWidth) current = test;
    else { lines.push(current); current = words[i]; }
  }
  lines.push(current);
  return lines;
}

/** Speech bubble whose tail tip sits at (x, tipY). */
export function drawSpeechBubble(ctx: CanvasRenderingContext2D, lines: string[], x: number, bottomY: number) {
  ctx.font = `16px ${PIXEL_FONT}, monospace`;
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
  const lineHeight = 24;
  const padX = 10;
  const padY = 8;
  const bw = maxW + padX * 2;
  const bh = lines.length * lineHeight + padY * 2;
  const bx = Math.floor(x - bw / 2);
  const by = Math.floor(bottomY - bh);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#1a1a24';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 6, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 6, by + bh);
  ctx.fill();
  ctx.strokeStyle = '#1a1a24';
  ctx.beginPath();
  ctx.moveTo(x - 6, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 6, by + bh);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 5, by + bh - 2, 10, 3);
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + padX, by + padY + i * lineHeight);
  return { bw, bh };
}

export function buildSpeechBubble(cache: LabelCache, text: string): Label {
  const m = cache.measureCtx();
  const lines = wrapBubbleText(m, text);
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, m.measureText(l).width);
  const bw = maxW + 20;
  const bh = lines.length * 24 + 16;
  const pad = 2;
  const [c, g] = makeCanvas(bw + pad * 2 + 2, bh + pad * 2 + 8);
  const x = pad + 1 + Math.ceil(bw / 2);
  drawSpeechBubble(g, lines, x, pad + bh);
  // anchor = the point the live code called (x, y): bubble bottom edge, horizontally centred
  return { canvas: c, ax: x, ay: pad + bh };
}

/** Small "◯" talk prompt; anchor = (x, y) as passed by the engine before the bob. */
export function drawPromptBubble(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bx = Math.floor(x - 12);
  const by = Math.floor(y - 18);
  const bw = 24;
  const bh = 16;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#4A2E1A';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 3, by + bh);
  ctx.lineTo(x, by + bh + 4);
  ctx.lineTo(x + 3, by + bh);
  ctx.fill();
  ctx.strokeStyle = '#4A2E1A';
  ctx.beginPath();
  ctx.moveTo(x - 3, by + bh);
  ctx.lineTo(x, by + bh + 4);
  ctx.lineTo(x + 3, by + bh);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, by + bh - 1, 4, 2);
  ctx.fillStyle = '#4A2E1A';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◯', x, by + bh / 2);
}

export function buildPromptBubble(): Label {
  const [c, g] = makeCanvas(30, 26);
  drawPromptBubble(g, 15, 21);
  return { canvas: c, ax: 15, ay: 21 };
}

/** Exit sign ("< Lumen Bay"): top-left at (x, y), returns its width. */
export function exitSignWidth(ctx: CanvasRenderingContext2D, label: string) {
  ctx.font = `12px ${PIXEL_FONT}, monospace`;
  return Math.ceil(ctx.measureText(label).width) + 12;
}

export function drawExitSign(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, w: number) {
  ctx.fillStyle = '#4A2E1A';
  ctx.fillRect(x - 2, y - 2, w + 4, 22);
  ctx.fillStyle = '#FFF6E5';
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = '#4A2E1A';
  ctx.font = `12px ${PIXEL_FONT}, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 6, y + 10);
}

export function buildExitSign(cache: LabelCache, label: string): Label & { w: number } {
  const w = exitSignWidth(cache.measureCtx(), label);
  const [c, g] = makeCanvas(w + 4, 22);
  drawExitSign(g, label, 2, 2, w);
  return { canvas: c, ax: 2, ay: 2, w };
}
