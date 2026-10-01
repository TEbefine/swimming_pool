/** Bound simultaneous image decoding; abandoned rooms must not retain decoded sprites. */
export class ImageLoader {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(privateLimit = 6) {
    this.limit = Math.max(1, privateLimit);
  }
  private readonly limit: number;

  load(src: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
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
          this.active--;
          resolve(ok ? img : null);
          this.drain();
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
