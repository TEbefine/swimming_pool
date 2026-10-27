/** The scene's minimum viewing time overlaps real loading; it never replaces it. */
export function createPresentation(minimumMs: number) {
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolve: () => void = () => {};
  const finished = new Promise<void>((done) => { resolve = done; });
  const cancel = () => {
    started = true;
    clearTimeout(timer);
    resolve();
  };
  return {
    finished,
    presented() {
      if (started) return;
      started = true;
      timer = setTimeout(resolve, minimumMs);
    },
    cancel,
  };
}
