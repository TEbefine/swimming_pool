import type { TransitionStory } from './stories';
export interface PreparedStory { story: TransitionStory; background: HTMLImageElement; character: HTMLImageElement }

/** Optional artwork only. Failed or cancelled preparation always returns the safe fallback. */
export async function prepareStory(story: TransitionStory, signal: AbortSignal, makeImage = () => new Image()): Promise<PreparedStory | null> {
  const cancel = new AbortController();
  const abortAll = () => cancel.abort();
  if (signal.aborted) return null;
  signal.addEventListener('abort', abortAll, { once: true });
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    if (cancel.signal.aborted) { reject(new Error('cancelled')); return; }
    const image = makeImage();
    image.alt = '';
    image.draggable = false;
    image.fetchPriority = 'low';
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      image.onload = null;
      image.onerror = null;
      cancel.signal.removeEventListener('abort', abort);
      if (ok) resolve(image);
      else { image.removeAttribute('src'); reject(new Error('Story image unavailable')); }
    };
    const abort = () => finish(false);
    image.onload = () => {
      if (typeof image.decode === 'function') void image.decode().then(() => finish(true), () => finish(false));
      else finish(true);
    };
    image.onerror = () => finish(false);
    cancel.signal.addEventListener('abort', abort, { once: true });
    image.src = src;
  });
  try {
    const [background, character] = await Promise.all([load(story.background), load(story.character)]);
    return signal.aborted ? null : { story, background, character };
  } catch { cancel.abort(); return null; }
  finally { signal.removeEventListener('abort', abortAll); }
}
