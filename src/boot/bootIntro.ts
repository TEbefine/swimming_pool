/* ============================================================
   BOOT INTRO — "SWIMMING POOL / by SAP Co." (first open only, like switching on a Game Boy)
   Ported from the approved ui/boot-intro-final.html. The logic, timing, easing, layout and
   colours are Teera's final design: only TypeScript types were added here. Change the knobs in
   BOOT_DEFAULTS only when Teera asks (see ui/boot-intro.md).

   mountBootIntro(parentEl, options) -> Promise (resolves when it ends)
   Also fires a window "boot:done" event.
   parentEl must be positioned (position: relative/absolute) and have a size.
   ============================================================ */
import './boot.css';

export interface BootRow {
  text: string;
  scale: number;
  colors: string[];
}

export interface BootCues {
  appear: number[];
  touch: number[];
  badgeAt: number;
  badgeMs: number;
  sunAt: number;
  poolAt: number;
  sapAt: number;
  fadeAt: number;
  letters: string[];
}

export interface BootOptions {
  rows: BootRow[];
  badge: string;
  startDelay: number;
  stagger: number;
  path: Array<[number, number]>;
  rise: number;
  steps: number[];
  impact: number;
  tilt: number;
  unit: number;
  jumpDelay: number;
  jump: number;
  jumpMs: number;
  bounces: number[];
  squash: number;
  rainbow: boolean;
  rainbowTurns: number;
  pixel: boolean;
  pixelSize: number;
  pixelBadge: number;
  pixelCols: number;
  big: number;
  edgeCrop: number;
  badgeDelay: number;
  badgeMs: number;
  badgeSteps: number;
  sapSteps: number;
  shine: boolean;
  sunDelay: number;
  sunMs: number;
  sunSize: number;
  sunAlpha: number;
  sunLayers: number[];
  poolDelay: number;
  glintMs: number;
  glintStagger: number;
  stars: boolean;
  starMs: number;
  sapDelay: number;
  sapMs: number;
  endHold: number;
  fadeOut: number;
  speed: number;
  /** Skip: on abort the screen fades out quickly (160 ms) and the promise resolves as usual. */
  signal?: AbortSignal;
  /** Tells the caller when things happen (ms from now) so sound can be scheduled exactly. */
  onCues?: (cues: BootCues) => void;
}

export const BOOT_DEFAULTS: BootOptions = {
  // --- what it says (this IS the approved "B2" final screen) ---
  rows: [
    { text: "SWIMMING", scale: 1,   colors: ["#1f4d6b", "#35b0c6"] },                       // 2 colours = smooth blend across the letters
    { text: "POOL",     scale: 1.4, colors: ["#e5484d", "#f5a31a", "#2fb86a", "#3b82f6"] }, // one colour per letter = rainbow
  ],
  badge: "by SAP Co.",

  // --- the flight. Think of a grid where the letter's final spot is X0 Y0 (X: + is right, Y: + is up).
  //     The letter starts BIG below the screen, climbs to the first point of `path` (the peak), then glides
  //     through the other points in order, shrinking to normal size as it lands on the line (Y0). ---
  startDelay: 100,  // ms from the start until the first letter (S) shows up on screen
  stagger: 120,     // ms from one letter to the next — the beat of the pattern (bigger = slower, clearer one-by-one)
  path: [           // [X, Y] points, in grid units. Edit these numbers to change the motion.
    [2, 2],         //   1  the peak: 2 right, 2 up
    [0.7, 1],       //   2  swooping down and in (a round arc, like a ball thrown to the left)
    [0.15, 0],      //   3  touches the line, just a hair to the RIGHT of its spot (this is where the jump begins)
    [0, 0],         //   4  settles left into its spot and stops there (never goes past it)
  ],
  rise: 220,        // ms to climb from below the screen up to point 1
  steps: [120, 80, 80],   // ms to glide from point 1 to 2, 2 to 3, 3 to 4 (one number per step)
  impact: 1.3,      // how fast it is still falling when it touches the line (1 = steady speed, bigger = harder landing, 0 = floats down and stops)
  tilt: 15,         // degrees the climb from below leans (it starts left and moves right). 0 = straight up
  unit: 0.06,       // how big one grid unit is, as a fraction of the screen height (0.06 = about 50px on a phone)
  // --- the jump: each letter jumps by itself the moment it lands on its spot (the next letters keep arriving
  //     meanwhile), like a small heavy ball: squash down, spring up, fall fast, hit and flatten, bounce lower, rest ---
  jumpDelay: 0,     // ms a letter waits on its spot before it jumps (0 = straight away)
  jump: 0.04,       // height of the first jump, as a fraction of the screen height (0.04 = about 34px on a phone)
  jumpMs: 210,      // ms of air time for the first jump. Short = heavy and snappy, long = floaty
  bounces: [0.3, 0.1],     // how high the next bounces go, each as a fraction of the first jump (lower = heavier ball)
  squash: 0.32,     // how flat a letter gets when it lands (0 = rigid, 0.4 = very squishy)

  // --- rainbow: each letter flashes through the rainbow while it flies, and the colour stops (settles on its real
  //     colour) the moment it touches the line (Y0) ---
  rainbow: true,
  rainbowTurns: 1.25,   // how many times round the rainbow before it lands (more = faster flicker)

  // --- the old-console look. Everything (the font stays the same) is drawn with big chunky pixels, like the Game Boy's
  //     160-pixel-wide screen, and the lights are flat stripes and rings instead of soft gradients. ---
  pixel: true,
  pixelSize: 3.5,   // size of each chunky pixel in CSS px, the same on every screen: 3 = fine, 3.5 = in between, 4 = chunky, 5 = very chunky. Set 0 to use pixelCols below instead
  pixelBadge: 2,    // block size for the small "by SAP Co." badge: 2 = a light pixel touch (default), 3 = clearly pixelated, 0 = crisp
  pixelCols: 100,   // (only when pixelSize is 0) roughly how many pixels wide the screen is; block size = screen width / this

  big: 0.82,        // the biggest a letter may be, as a fraction of the screen width (also limited by edgeCrop)
  edgeCrop: 0.06,   // how much of a big letter near the left/right edge may be cut off by the screen, as a fraction of its width

  // --- the badge and the ending ---
  badgeDelay: 200,  // ms after the last letter lands before "by SAP Co." fades in
  badgeMs: 600,     // ms for the badge fade
  badgeSteps: 4,    // the badge appears in this many hard steps (like an old console fade); bigger = smoother
  sapSteps: 12,     // the badge's light band jumps across in this many steps; bigger = smoother
  // --- the finishing light. It travels down the logo: SWIMMING, then POOL, then the pill, each in its own style ---
  shine: true,
  sunDelay: 60,     // ms after the last letter lands before the sun starts
  sunMs: 800,       // SWIMMING: the sun drifts left to right across the whole word in this time
  sunSize: 1.1,     //           how big the round sun is, as a multiple of the letter height (bigger = more of the word lit at once)
  sunAlpha: 0.3,    //           opacity of EACH of the 3 light layers (they stack where they overlap)
  sunLayers: [1, 0.75, 0.4],   // the 3 layers' radii as a share of the sun size: big, medium, small
  poolDelay: 400,   // POOL starts this long after the sun starts (a relay: the glint begins while the sun is still crossing)
  glintMs: 420,     // POOL: how long the white glint takes to cross one letter
  glintStagger: 90, //       ms between one letter's glint and the next (the glint runs along the word)
  stars: false,     //       true = also twinkle a little gold star on each POOL letter
  starMs: 520,      //       how long one star twinkles
  sapDelay: 330,    // "by SAP Co." light starts this long after POOL starts (never before the pill has faded in half way)
  sapMs: 650,       // "by SAP Co.": how long the light bar takes to cross the pill
  endHold: 800,     // ms to keep the finished screen before fading out
  fadeOut: 600,     // ms for the final fade-out

  speed: 1,         // 1 = as designed, 1.5 = 50% faster, 0.75 = slower (scales every time above)
};

const PATH_STEPS = 100;   // how smoothly the curve is drawn (more = smoother, a little heavier)

export async function mountBootIntro(parent: HTMLElement, options: Partial<BootOptions> = {}): Promise<void> {
  const o: BootOptions = { ...BOOT_DEFAULTS, ...options };
  const T = (ms: number) => ms / o.speed;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canAnimate = typeof Element.prototype.animate === "function";

  // wait (max 1s) for the fonts so letters never swap font mid-animation
  const t0 = performance.now();
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('italic 800 16px "Rubik"'),
        document.fonts.load('16px "VT323"'),
      ]),
      new Promise((r) => setTimeout(r, 1000)),
    ]);
  } catch { /* fall back to system fonts */ }
  const waited = performance.now() - t0;                                  // time spent waiting for fonts counts towards startDelay

  // ---- colours: blend across a list of colour stops ----
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const colorAt = (stops: string[], t: number) => {
    if (stops.length === 1) return stops[0];
    const p = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1), a = Math.floor(p), f = p - a;
    const A = hex(stops[a]), B = hex(stops[a + 1]);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(",")})`;
  };

  const hsl2rgb = (h: number, s: number, l: number) => {                  // h in degrees, s and l 0..1 -> [r,g,b] 0..255
    const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  };

  // ---- build the DOM ----
  const el = document.createElement("div");
  el.className = "boot";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${o.rows.map((r) => r.text).join(" ")} ${o.badge}`);

  const stage = document.createElement("div"); stage.className = "boot__stage";
  const mid = document.createElement("div");   mid.className = "boot__mid";
  const title = document.createElement("h1");  title.className = "boot__title"; title.setAttribute("aria-hidden", "true");
  mid.appendChild(title);

  const letters: HTMLSpanElement[] = [];
  const rowEls = o.rows.map((r, ri) => {
    const row = document.createElement("span");
    row.className = "boot__row";
    if (r.scale !== 1) row.style.fontSize = `${r.scale}em`;
    const chars = [...r.text];
    chars.forEach((ch, i) => {
      const s = document.createElement("span");
      s.className = "boot__ch";
      s.textContent = ch; s.dataset.ch = ch; s.dataset.row = String(ri);   // data-ch feeds the light effect
      s.style.color = colorAt(r.colors, chars.length > 1 ? i / (chars.length - 1) : 0);
      row.appendChild(s);
      letters.push(s);                                     // S W I M M I N G P O O L, in reading order
    });
    title.appendChild(row);
    return row;
  });

  const badge = document.createElement("div");
  badge.className = "boot__badge"; badge.textContent = o.badge; badge.setAttribute("aria-hidden", "true");
  stage.append(mid, badge);
  el.appendChild(stage);
  parent.appendChild(el);

  // ---- safety: if a fallback font makes row 1/2 wider than the screen, shrink (never enlarge) ----
  const widest = Math.max(...rowEls.map((r) => r.getBoundingClientRect().width));
  title.style.setProperty("--k", String(Math.min(1, (el.clientWidth * 0.92) / widest)));

  // ---- the chunky-pixel look: an SVG filter that keeps one sample per block and blows it up to the whole block ----
  if (o.pixel) {
    const Pt = Math.max(1, o.pixelSize > 0 ? o.pixelSize : Math.round((el.clientWidth / o.pixelCols) * 2) / 2);     // title block size in CSS px (3 = fine, 3.5 = in between, 4 = chunky)
    // one filter per block size: sample a q x q patch in the middle of every P x P block, then grow it by m on every side to fill the block
    const makeFilter = (P: number) => {
      const id = `boot-pixel-${Math.random().toString(36).slice(2, 8)}`, q = Number.isInteger(P) && P % 2 === 0 && P > 2 ? 2 : 1, m = P <= 2 ? 1 : (P - q) / 2;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
      // the filter covers the whole screen (the letters fly in from below the title block)
      svg.innerHTML = `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${el.clientWidth}" height="${el.clientHeight}" color-interpolation-filters="sRGB">
        <feFlood x="${m}" y="${m}" width="${q}" height="${q}"/><feComposite width="${P}" height="${P}"/><feTile result="grid"/>
        <feComposite in="SourceGraphic" in2="grid" operator="in"/>${m > 0 ? `<feMorphology operator="dilate" radius="${m}"/>` : ""}</filter>`;
      el.appendChild(svg);
      return `url(#${id})`;
    };
    if (Pt > 1) mid.style.filter = makeFilter(Pt);
    // the badge text is small, so it gets finer blocks than the title (or none: pixelBadge 0) -- chunky blocks would eat the letters
    if (o.pixelBadge > 1) badge.style.filter = makeFilter(o.pixelBadge);
  }

  // ---- timeline (everything derives from the knobs, so one change keeps it all in sync) ----
  const n = letters.length;
  const ST = T(o.stagger), D0 = Math.max(0, T(o.startDelay) - waited);   // when the first letter appears (counted from the call)
  const letterMs = T(o.rise + o.steps.reduce((a, b) => a + b, 0));
  // the jump: a short crouch, then a hop for the first jump and one for each bounce (a lower bounce is also a shorter one)
  const hops = [1, ...o.bounces], JM = T(o.jumpMs);
  const hopMs = hops.map((h) => JM * Math.sqrt(h)), CROUCH = JM * 0.14, SETTLE = T(70);
  const jumpMsTotal = CROUCH + hopMs.reduce((a, b) => a + b, 0) + SETTLE;
  const badgeMs = T(o.badgeMs);
  const fadeMs = T(o.fadeOut);

  // ---- how big each letter is up front ----
  // per row: as big as fits (equal size inside a row), but letters near the screen's left/right edge are not cut off much
  const cw = el.clientWidth, ch = el.clientHeight;
  const rowOf: number[] = [];  o.rows.forEach((r, ri) => [...r.text].forEach(() => rowOf.push(ri)));
  const fit = letters.map((s) => {
    const fs = parseFloat(getComputedStyle(s).fontSize), x = s.offsetLeft + s.offsetWidth / 2, crop = o.edgeCrop * cw;
    const half = Math.min(x + crop, cw + crop - x);                        // room to the nearest screen edge
    return Math.max(fs, (2 * half) / (s.offsetWidth / fs));                // biggest font size that fits
  });
  const bigPx = o.rows.map((_, ri) => Math.min(o.big * cw, ch * 0.4, ...fit.filter((_, i) => rowOf[i] === ri)));
  const slot = letters.map((s, i) => {
    const k = bigPx[rowOf[i]] / parseFloat(getComputedStyle(s).fontSize);  // how many times bigger than its final size
    const cy = s.offsetTop + s.offsetHeight / 2;
    return { k, y0: ch - cy + (s.offsetHeight * k) / 2 + 4 };              // how far below its spot it starts: just out of sight
  });

  // ---- play ----
  let finished = false;
  const done = () => { if (finished) return; finished = true; el.remove(); window.dispatchEvent(new CustomEvent("boot:done")); };

  if (!canAnimate) {                                       // very old browser: show the finished screen, then leave
    return new Promise<void>((resolve) => setTimeout(() => { done(); resolve(); }, D0 + (n - 1) * ST + letterMs + jumpMsTotal + T(o.endHold)));
  }

  // ---- the flight ----
  const RISE = T(o.rise), STEPS = o.steps.map(T);
  const UNIT = Math.min(o.unit * ch, 0.13 * cw);                           // one grid unit in px
  const smooth = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const outCubic = (u: number) => 1 - Math.pow(1 - u, 3);

  // a smooth curve through the points that never overshoots them: it stops dead at turning points (the peak, the
  // far-left point) and at the end, so the letter eases in and out of each turn instead of bouncing past
  const curve = (ts: number[], vs: number[], endK = 0) => {
    const n = ts.length, m = vs.map(() => 0);
    for (let q = 1; q < n - 1; q++) {
      const s0 = (vs[q] - vs[q - 1]) / (ts[q] - ts[q - 1]), s1 = (vs[q + 1] - vs[q]) / (ts[q + 1] - ts[q]);
      m[q] = s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1);
    }
    if (endK > 0 && n > 1) m[n - 1] = endK * (vs[n - 1] - vs[n - 2]) / (ts[n - 1] - ts[n - 2]);   // arrive still moving
    return (t: number) => {
      let q = 0; while (q < n - 2 && t > ts[q + 1]) q++;
      const d = ts[q + 1] - ts[q], u = Math.min(1, Math.max(0, (t - ts[q]) / d)), u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * vs[q] + (u3 - 2 * u2 + u) * d * m[q] + (-2 * u3 + 3 * u2) * vs[q + 1] + (u3 - u2) * d * m[q + 1];
    };
  };
  const knots = [0, RISE]; STEPS.forEach((d) => knots.push(knots[knots.length - 1] + d));   // the time of each point, from the letter's start
  const landIdx = Math.max(1, o.path.findIndex(([, y]) => y === 0) + 1);   // the first point on the line (Y0): size is normal by then
  const lean = Math.tan((o.tilt * Math.PI) / 180);

  const lands: number[] = [], touch: number[] = [], appear: number[] = [];   // when each letter is on its spot / first touches the line
  letters.forEach((s, i) => {
    let delay = D0 + i * ST;                               // when this letter first shows up on screen
    appear[i] = reduced ? delay * 0.5 : delay;
    if (reduced) {                                         // reduced motion: letters simply fade in, no flying
      s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: delay * 0.5, fill: "both", easing: "ease-out" });
      lands[i] = delay * 0.5 + 350; touch[i] = lands[i];
      return;
    }
    const { k, y0 } = slot[i];
    // keep a big letter near the right edge from flying mostly off the screen: shrink its sideways travel if needed
    const room = cw + o.edgeCrop * cw - (s.offsetLeft + s.offsetWidth / 2 + (s.offsetWidth * k) / 2);
    const f = Math.min(1, Math.max(0.45, room / Math.max(1, Math.max(...o.path.map(([x]) => x)) * UNIT)));
    const px = o.path.map(([x, y]) => [x * UNIT * f, -y * UNIT]);          // grid -> screen px (screen Y points down)
    const pl = landIdx - 1;                                                // the path point where it touches the line
    const fx = curve(knots.slice(1), px.map((p) => p[0]));
    const fyDrop = pl >= 1 ? curve(knots.slice(1, landIdx + 1), px.slice(0, pl + 1).map((p) => p[1]), o.impact) : null;
    const fy = pl >= 1 ? (t: number) => (t >= knots[landIdx] ? px[pl][1] : fyDrop!(t))   // falls onto the line at speed, then stays on it
                       : curve(knots.slice(1), px.map((p) => p[1]));
    const x0 = px[0][0] - (y0 - px[0][1]) * lean;                         // start below the screen, to the left, so the climb leans right
    const at = (x: number, y: number, sc: number) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    const frames: Keyframe[] = [];
    const cx0 = s.offsetLeft + s.offsetWidth / 2, cy0 = s.offsetTop + s.offsetHeight / 2;
    let seenAt = -1;                                       // how long into its flight the letter first comes into view
    for (let j = 0; j <= PATH_STEPS; j++) {
      const ms = (j / PATH_STEPS) * letterMs;
      let x: number, y: number;
      if (ms <= RISE) {                                                    // 1) climb to point 1: fast launch, slows to a stop at the peak
        const e = outCubic(ms / RISE);
        x = x0 + (px[0][0] - x0) * e;
        y = y0 + (px[0][1] - y0) * e;
      } else { x = fx(ms); y = fy(ms); }                                   // 2) glide through the other points
      const w = smooth((ms - 0.85 * RISE) / (knots[landIdx] - 0.85 * RISE));   // size: big up to the peak, normal when it reaches the line
      if (seenAt < 0) {                                    // is any part of the letter on the screen yet?
        const sc = Math.pow(k, 1 - w), hw = 0.42 * s.offsetWidth * sc, hh = 0.42 * s.offsetHeight * sc;
        if (cx0 + x + hw > 0 && cx0 + x - hw < cw && cy0 + y + hh > 0 && cy0 + y - hh < ch) seenAt = ms;
      }
      frames.push({
        transform: j === PATH_STEPS ? "translate(0px, 0px) scale(1)" : at(x, y, Math.pow(k, 1 - w)),
        opacity: 1, offset: j / PATH_STEPS, easing: "linear",
      });
    }
    delay -= Math.max(0, seenAt);                          // start the flight already under way, so the letter is in view at its time
    lands[i] = delay + letterMs; touch[i] = delay + knots[landIdx];
    s.animate(frames, { duration: letterMs, delay, fill: "both" });
    if (o.rainbow) {                                       // flashes through 8 flat colours (like a palette swap), snaps to the real colour at the touch (Y0)
      const real = (s.style.color.match(/\d+/g) || [0, 0, 0]).map(Number), touchMs = knots[landIdx];
      const cf: Keyframe[] = [], cnt = Math.max(6, Math.round(touchMs / T(55))), h0 = i % 8;
      for (let j = 0; j < cnt; j++) {
        const hue = ((h0 + Math.round(o.rainbowTurns * 8 * j / cnt)) % 8) * 45;      // 0, 45, 90 ... 315 degrees
        cf.push({ color: `rgb(${hsl2rgb(hue, 0.95, 0.56).join(",")})`, offset: (touchMs / letterMs) * (j / cnt), easing: "step-end" });
      }
      cf.push({ color: `rgb(${real.join(",")})`, offset: touchMs / letterMs }, { color: `rgb(${real.join(",")})`, offset: 1 });
      s.animate(cf, { duration: letterMs, delay, fill: "both", easing: "linear" });
    }
  });

  // ---- the rest of the timeline, now that we know when each letter lands ----
  const landAt = Math.max(...lands);                                       // the last letter is on its spot
  const jumpStart = (i: number) => lands[i] + T(o.jumpDelay);              // letter i jumps the moment it lands
  const jumpEnd = jumpStart(n - 1) + jumpMsTotal;
  const badgeAt = landAt + T(o.badgeDelay);
  const sunAt = landAt + T(o.sunDelay), poolAt = sunAt + T(o.poolDelay);
  const sapAt = Math.max(poolAt + T(o.sapDelay), badgeAt + badgeMs * 0.5);
  const lightEnd = o.shine && !reduced ? sapAt + T(o.sapMs) : 0;
  const fadeAt = Math.max(badgeAt + badgeMs, jumpEnd, lightEnd) + T(o.endHold);
  // optional: tell the caller when things happen (ms from now) so sound can be scheduled exactly, e.g. with Web Audio
  if (typeof o.onCues === "function") o.onCues({ appear, touch, badgeAt, badgeMs, sunAt, poolAt, sapAt, fadeAt, letters: letters.map((l) => l.textContent ?? "") });

  // ---- the jump (one per letter, starting one after another) ----
  const jumpFrames = (s: HTMLElement) => {
    const hBox = s.offsetHeight, H = o.jump * ch, sq = o.squash;
    const starts: number[] = []; let acc = CROUCH; hops.forEach((_, q) => { starts.push(acc); acc += hopMs[q]; });   // when each hop starts
    const impacts = hops.map((_, q) => starts[q] + hopMs[q]);                                              // when each hop ends (hits the ground)
    const amt = hops.map((_, q) => sq * [1, 0.55, 0.3, 0.15][Math.min(q, 3)]);                            // later impacts squash less
    const bump = (d: number) => { d = Math.max(0, 1 - Math.abs(d)); return d * d; };
    const frames: Keyframe[] = [], N = Math.max(24, Math.round(jumpMsTotal / 16));
    for (let j = 0; j <= N; j++) {
      const t = (j / N) * jumpMsTotal;
      let up = 0, sy = 1, sx = 1;
      if (t < CROUCH) {                                                    // crouch: squash down, ready to spring
        const c = smooth(t / CROUCH) * sq * 0.75;
        sy -= c; sx += c * 0.5;
      } else {
        for (let q = 0; q < hops.length; q++) {
          if (t >= starts[q] && t <= impacts[q]) {                         // in the air: a parabola, stretched along the way it is moving
            const u = (t - starts[q]) / hopMs[q];
            up = hops[q] * H * (1 - Math.pow(Math.abs(1 - 2 * u), 1.6));   // a pointed top: hardly any hang time, so it feels heavy
            const st = 0.12 * Math.abs(1 - 2 * u) * (q === 0 ? 1 : 0.6);
            sy += st; sx -= st * 0.5;
          }
        }
      }
      impacts.forEach((ti, q) => { const b = bump((t - ti) / T(60)) * amt[q]; sy -= b; sx += b * 0.55; });    // flatten when it hits
      if (j === N) { up = 0; sy = 1; sx = 1; }
      frames.push({ transform: `translate(0px, ${(((1 - sy) * hBox) / 2 - up).toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`, offset: j / N, easing: "linear" });
    }
    return frames;
  };
  if (!reduced) letters.forEach((s, i) => s.animate(jumpFrames(s), { duration: jumpMsTotal, delay: jumpStart(i), fill: "none" }));

  badge.animate(
    reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: "translateY(.5em)" }, { opacity: 1, transform: "none" }],
    { duration: badgeMs, delay: badgeAt, fill: "both", easing: `steps(${o.badgeSteps}, end)` }      // appears in a few hard steps, like an old console fade
  );

  // ---- the finishing light: SWIMMING = the sun, POOL = white glint, pill = light bar ----
  if (o.shine && !reduced) {
    const pseudo = (node: HTMLElement, kf: Keyframe[], opts: KeyframeAnimationOptions, which: string) => { try { node.animate(kf, { ...opts, pseudoElement: which }); } catch { /* old browser: skip the light */ } };
    const rowStart: number[] = []; { let c = 0; o.rows.forEach((r, ri) => { rowStart[ri] = c; c += [...r.text].length; }); }
    // the sun: one band of light moves through the whole first row; every letter just shows the part of it that is over that letter
    const sunLetters = letters.filter((_, i) => rowOf[i] === 0);
    if (sunLetters.length) {
      const rowL = sunLetters[0].offsetLeft, last = sunLetters[sunLetters.length - 1], rowR = last.offsetLeft + last.offsetWidth;
      const Wb = o.sunSize * sunLetters[0].offsetHeight;                   // the sun is a circle Wb wide and Wb tall
      const ws = o.sunLayers.map((k) => Wb * k);                           // the three layers' diameters, all centred on the same ball
      sunLetters.forEach((s) => {
        s.style.setProperty("--sun-a", String(o.sunAlpha));
        ws.forEach((w, n) => s.style.setProperty(`--sun-w${n + 1}`, `${w.toFixed(1)}px`));
        const cy = s.offsetHeight / 2;                                     // centred on the letter, top to bottom
        const at = (cx: number) => ws.map((w) => `${(cx - w / 2).toFixed(1)}px ${(cy - w / 2).toFixed(1)}px`).join(", ");
        const c0 = rowL - Wb / 2 - s.offsetLeft, c1 = rowR + Wb / 2 - s.offsetLeft;   // ball centre: fully off the left edge -> fully off the right edge
        pseudo(s, [{ backgroundPosition: at(c0) }, { backgroundPosition: at(c1) }],
          { duration: T(o.sunMs), delay: sunAt, easing: "ease-in-out", fill: "none" }, "::after");
      });
    }
    letters.forEach((s, i) => {
      if (rowOf[i] === 0) return;
      const k = i - rowStart[rowOf[i]];
      pseudo(s, [{ backgroundPosition: "130% 0" }, { backgroundPosition: "-30% 0" }],
        { duration: T(o.glintMs), delay: poolAt + k * T(o.glintStagger), easing: "ease-in-out", fill: "none" }, "::after");
      if (o.stars) {
        const d = poolAt + k * T(o.glintStagger), dur = T(o.starMs);
        pseudo(s, [{ opacity: 0, transform: "scale(0) rotate(-60deg)" }, { opacity: 1, transform: "scale(1.2) rotate(0deg)", offset: 0.4 }, { opacity: 0, transform: "scale(0) rotate(60deg)" }],
          { duration: dur, delay: d, easing: "ease-in-out", fill: "none" }, "::before");
      }
    });
    pseudo(badge, [{ transform: "translateX(-170%) skewX(-20deg)" }, { transform: "translateX(520%) skewX(-20deg)" }],
      { duration: T(o.sapMs), delay: sapAt, easing: `steps(${o.sapSteps}, end)`, fill: "none" }, "::after");      // the band jumps across in blocks
  }

  const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, delay: fadeAt, fill: "forwards", easing: "ease-in-out" });
  // skip: options.signal (an AbortSignal). On abort the screen fades out quickly (160 ms) and the promise resolves as usual.
  let skipFade: Animation | null = null;
  if (o.signal) {
    const skip = () => {
      if (skipFade || finished) return;
      const op = getComputedStyle(el).opacity;
      skipFade = el.animate([{ opacity: op }, { opacity: 0 }], { duration: 160, fill: "forwards" });
      fade.cancel();
    };
    if (o.signal.aborted) skip(); else o.signal.addEventListener("abort", skip, { once: true });
  }
  try { await fade.finished; } catch { /* cancelled: skipped or element removed */ }
  if (skipFade) { try { await (skipFade as Animation).finished; } catch { /* removed */ } }
  done();
}
