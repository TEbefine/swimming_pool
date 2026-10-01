/** A bounded canvas animation: hidden pages do no work, and false ends it completely. */
export function startVisibleAnimation(
  draw: (now: number) => boolean,
  fps: number,
  page: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document,
  frames: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> = window,
): () => void {
  const interval = 1000 / fps;
  let frame: number | null = null;
  let lastDraw: number | null = null;
  let finished = false;

  const tick = (now: number) => {
    frame = null;
    if (finished || page.hidden) return;
    const elapsed = lastDraw === null ? interval : now - lastDraw;
    // A small tolerance avoids dropping every other frame due to timestamp rounding.
    if (elapsed + 0.1 >= interval) {
      const intervals = Math.max(1, Math.floor((elapsed + 0.1) / interval));
      lastDraw = now - Math.max(0, elapsed - intervals * interval);
      if (!draw(now)) {
        finished = true;
        return;
      }
    }
    frame = frames.requestAnimationFrame(tick);
  };

  const visibilityChanged = () => {
    if (frame !== null) frames.cancelAnimationFrame(frame);
    frame = null;
    lastDraw = null;
    if (!finished && !page.hidden) frame = frames.requestAnimationFrame(tick);
  };

  page.addEventListener('visibilitychange', visibilityChanged);
  visibilityChanged();
  return () => {
    finished = true;
    if (frame !== null) frames.cancelAnimationFrame(frame);
    page.removeEventListener('visibilitychange', visibilityChanged);
  };
}
