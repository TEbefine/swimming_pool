/** Daily tips shown by NPCs. Picked by day-of-year in Asia/Bangkok time. */
export interface Tip {
  title: string;
  body: string;
}

export const tips: Tip[] = [
  { title: 'Stay Hydrated', body: 'Drink at least 8 glasses of water a day — your body will thank you!' },
  { title: 'Take a Break', body: 'Every 45 minutes, stand up, stretch, and look away from your screen.' },
  { title: 'Deep Breaths', body: 'Try 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s. Instant calm.' },
  { title: 'Small Steps', body: "You don't have to do everything at once. One small step today still counts." },
  { title: 'Celebrate Wins', body: 'Finished a task? No matter how small, give yourself a pat on the back.' },
  { title: 'Sunshine Boost', body: 'Get 15 minutes of morning sunlight — it helps regulate your sleep cycle.' },
  { title: 'Be Kind', body: 'A small act of kindness can brighten someone\'s entire day. Including yours.' },
];

/** Get the tip for a given date (defaults to today in Asia/Bangkok). */
export function getTipForDate(date: Date = new Date()): Tip {
  // Day-of-year in Asia/Bangkok timezone
  const bangkokStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
  const [y, m, d] = bangkokStr.split('-').map(Number);
  const start = new Date(y, 0, 1);
  const dayOfYear = Math.floor((new Date(y, m - 1, d).getTime() - start.getTime()) / 86400000) + 1;
  return tips[dayOfYear % tips.length];
}
