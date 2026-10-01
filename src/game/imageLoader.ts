/** A drawable sprite. In browsers it is an ImageBitmap: decoded exactly once and kept ready,
 *  so the browser never re-decodes a webp in the middle of a walk cycle (a measurable cost on
 *  phones when its image-decode cache evicts frames). */
export type Sprite = HTMLImageElement | ImageBitmap;

export function spriteReady(img: Sprite | null | undefined): img is Sprite {
  if (!img || img.width <= 0) return false;
  return !('complete' in img) || img.complete;
}

/** Free a decoded sprite's memory now instead of waiting for garbage collection. */
export function releaseSprite(img: Sprite | null | undefined) {
  if (img && 'close' in img) {
    try { img.close(); } catch { /* already closed */ }
  }
}

async function toBitmap(img: HTMLImageElement): Promise<Sprite> {
  if (typeof createImageBitmap !== 'function') return img;
  try {
    const bitmap = await createImageBitmap(img);
    img.removeAttribute('src');
    return bitmap;
  } catch {
    return img; // e.g. very old Safari: the <img> still draws fine
  }
}

/** Bound simultaneous image decoding; abandoned rooms must not retain decoded sprites. */
export class ImageLoader {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(privateLimit = 6) {
    this.limit = Math.max(1, privateLimit);
  }
  private readonly limit: number;

  load(src: string, signal: AbortSignal): Promise<Sprite | null> {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(null); return; }
      const cancelQueued = () => {
        const index = this.queue.indexOf(start);
        if (index < 0) return;
        this.queue.splice(index, 1);
        signal.removeEventListener('abort', cancelQueued);
        resolve(null);
      };
      const start = () => {
        signal.removeEventListener('abort', cancelQueued);
        if (signal.aborted) { resolve(null); return; }
        this.active++;
        const img = new Image();
        img.decoding = 'async';
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          img.onload = null;
          img.onerror = null;
          signal.removeEventListener('abort', abort);
          if (!ok) img.removeAttribute('src');
          const done = (result: Sprite | null) => {
            this.active--;
            resolve(result);
            this.drain();
          };
          if (!ok) { done(null); return; }
          if (typeof createImageBitmap !== 'function') { done(img); return; }
          void toBitmap(img).then((sprite) => {
            if (signal.aborted) { releaseSprite(sprite); done(null); return; }
            done(sprite);
          });
        };
        const abort = () => finish(false);
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        signal.addEventListener('abort', abort, { once: true });
        img.src = src;
      };
      // Queued requests also need cancellation: active requests may belong to
      // another room and can remain pending long after this signal is aborted.
      signal.addEventListener('abort', cancelQueued, { once: true });
      this.queue.push(start);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.limit && this.queue.length) this.queue.shift()!();
  }
}
