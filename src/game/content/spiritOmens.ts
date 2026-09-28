// Spirit's daily omen: one per day (Bangkok date), the same for everyone.
// Tone rule (Teera, 2026-09-28): omens can be bright or heavy, but always honest.
// It is an old art, not fate. The closing line always hands the day back to the player.

export type OmenTone = 'bright' | 'calm' | 'heavy';

export interface Omen {
  tone: OmenTone;
  sign: string;   // what the old signs show
  advice: string; // one small thing to do today
}

export const OMENS: Omen[] = [
  { tone: 'bright', sign: 'The lanterns burn steady today.', advice: 'Start the thing you keep postponing. Ten minutes is enough.' },
  { tone: 'calm',   sign: 'The lake is still. Nothing pushes, nothing pulls.', advice: 'An ordinary day. Ordinary days build everything.' },
  { tone: 'heavy',  sign: 'The old signs say today is heavy.', advice: 'Go slowly, check twice, and be gentle with yourself.' },
  { tone: 'bright', sign: 'The wind carries voices kindly today.', advice: 'Send the message you have been holding.' },
  { tone: 'calm',   sign: 'The signs are quiet today.', advice: 'Listen more than you speak. Something useful hides in small talk.' },
  { tone: 'bright', sign: 'Seeds like the soil today.', advice: 'Plant one idea: write it down before dinner.' },
  { tone: 'heavy',  sign: "A thin crack runs through today's mirror.", advice: "Small misunderstandings come easily. Say things clearly, and don't take them personally." },
  { tone: 'bright', sign: 'A bird circles twice, then lands. Luck returns.', advice: 'Try again at the thing that failed before.' },
  { tone: 'calm',   sign: 'Two paths look the same today.', advice: 'If you must choose, choose the kinder one.' },
  { tone: 'bright', sign: 'Doors open easily today.', advice: 'Ask the question you were too shy to ask.' },
  { tone: 'heavy',  sign: 'The wind blows against you today.', advice: "Don't fight it. Do the small safe things, and save big decisions for tomorrow." },
  { tone: 'calm',   sign: 'The tea needs time to steep.', advice: "Don't rush an answer. Tomorrow you will know more." },
  { tone: 'bright', sign: 'The moon is generous tonight.', advice: 'Share something: a snack, a tip, a smile.' },
  { tone: 'heavy',  sign: 'The lantern flickers today.', advice: "Guard your energy. Say no to one thing you don't need." },
  { tone: 'calm',   sign: 'Clouds pass slowly today.', advice: 'Finish one old thing before starting a new one.' },
  { tone: 'bright', sign: 'Your shadow walks ahead of you today.', advice: 'Lead, even in something small.' },
  { tone: 'heavy',  sign: "Coins slip easily through today's fingers.", advice: 'Wait a day before buying anything big.' },
  { tone: 'calm',   sign: 'The old tree does not hurry.', advice: 'Rest is part of the work today.' },
  { tone: 'bright', sign: 'The stars line up for learners today.', advice: 'Learn one new word, and use it once.' },
  { tone: 'heavy',  sign: "Stones hide in today's path.", advice: 'Walk carefully. Double-check the road, the message, the date.' },
  { tone: 'calm',   sign: 'The rain is thinking about falling.', advice: 'Carry an umbrella, and a little patience.' },
  { tone: 'bright', sign: "Friends' names glow in today's signs.", advice: "Check on someone you haven't talked to in a while." },
  { tone: 'heavy',  sign: "Smoke hides today's view.", advice: 'If something feels unclear, ask before you act.' },
  { tone: 'bright', sign: 'Water runs clear today.', advice: 'Say what you mean, simply. People will hear it.' },
];

/** Said after every omen, bright or heavy. */
export const OMEN_CLOSING = 'The signs only whisper. Your hands decide the day.';

/** Days since epoch in Bangkok time (UTC+7), so the omen changes at Bangkok midnight. */
function bangkokDayNumber(now: Date = new Date()): number {
  return Math.floor((now.getTime() + 7 * 3600_000) / 86_400_000);
}

/**
 * Today's omen. Steps by 7 (coprime with 24) so the tones don't cluster,
 * and +5 so it never lines up with the other NPCs' daily lists.
 */
export function getTodayOmen(now: Date = new Date()): Omen {
  const day = bangkokDayNumber(now);
  const i = ((day * 7 + 5) % OMENS.length + OMENS.length) % OMENS.length;
  return OMENS[i];
}
