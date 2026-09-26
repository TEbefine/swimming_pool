// Shared outside world seen through every room's windows.
// Layer order: sky (code) → city panorama → [train / birds] → room image with see-through windows.
// All numbers are in room coordinates (1024×576).

export type RGB = [number, number, number];

/** One wide city panorama shared by all rooms. Sky is transparent — code draws it. */
export const CITY = {
  image: '/maps/city/city_day.webp',
  width: 1086,
  height: 362,
  /** Top edge of the panorama in room coordinates */
  y: -68,
  /** Top of the skytrain deck: a train sprite's BOTTOM edge sits on this line */
  trackY: 150,
} as const;

/** Which horizontal slice of the city each room's windows show. */
export const CITY_OFFSET_X: Record<string, number> = {
  cafe: -31,
  home: -62,
};

/** Warm lamp glows drawn at night (layer 4). */
export const ROOM_LIGHTS: Record<string, { x: number; y: number; radius: number; color: RGB }[]> = {
  cafe: [
    { x: 170, y: 58, radius: 140, color: [255, 214, 150] },
    { x: 555, y: 58, radius: 140, color: [255, 214, 150] },
    { x: 978, y: 58, radius: 120, color: [255, 214, 150] },
  ],
  home: [
    { x: 576, y: 85, radius: 190, color: [255, 205, 140] },   // paper lamp
    { x: 46, y: 150, radius: 120, color: [255, 200, 130] },   // floor lamp shade
    { x: 245, y: 45, radius: 110, color: [255, 190, 120] },   // fairy lights
  ],
};

interface SkyKey {
  hour: number;
  top: RGB;
  bottom: RGB;
  /** Multiply colour for the city panorama (1 = unchanged) */
  cityTint: RGB;
  /** 0 = full day, 1 = full night (dark overlay on the room + lamp glows) */
  night: number;
}

/** Sky keyframes through a Bangkok day. Values between keys are blended. */
export const SKY_KEYS: SkyKey[] = [
  { hour: 0,    top: [18, 22, 52],    bottom: [48, 44, 92],    cityTint: [0.35, 0.38, 0.58], night: 1 },
  { hour: 5.5,  top: [60, 70, 130],   bottom: [240, 160, 130], cityTint: [0.75, 0.65, 0.75], night: 0.5 },
  { hour: 7,    top: [120, 190, 240], bottom: [235, 236, 230], cityTint: [0.95, 0.95, 0.95], night: 0 },
  { hour: 12,   top: [110, 190, 240], bottom: [220, 240, 250], cityTint: [1, 1, 1],          night: 0 },
  { hour: 17,   top: [120, 150, 220], bottom: [250, 200, 150], cityTint: [0.97, 0.88, 0.85], night: 0 },
  { hour: 18.5, top: [110, 112, 190], bottom: [250, 176, 120], cityTint: [0.9, 0.72, 0.75],  night: 0.25 },
  { hour: 19.5, top: [40, 48, 96],    bottom: [120, 96, 150],  cityTint: [0.45, 0.45, 0.62], night: 0.8 },
  { hour: 24,   top: [18, 22, 52],    bottom: [48, 44, 92],    cityTint: [0.35, 0.38, 0.58], night: 1 },
];

/** Current hour (0–24, fractional) in Asia/Bangkok. `?hour=19.5` in the URL overrides it. */
export function bangkokHour(now: Date = new Date()): number {
  if (typeof window !== 'undefined') {
    const forced = new URLSearchParams(window.location.search).get('hour');
    if (forced !== null && !Number.isNaN(Number(forced))) return Number(forced) % 24;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Blended sky state for a given hour. */
export function skyAt(hour: number): Omit<SkyKey, 'hour'> {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1].hour) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - a.hour) / (b.hour - a.hour)));
  return {
    top: mixRGB(a.top, b.top, t),
    bottom: mixRGB(a.bottom, b.bottom, t),
    cityTint: mixRGB(a.cityTint, b.cityTint, t),
    night: mix(a.night, b.night, t),
  };
}
