// One small AI tip per day for Sir Ledger (the town's AI news walker).
// Evergreen advice only — nothing that goes out of date. Rotates by Bangkok date.

export interface AiTip {
  title: string;
  body: string;
}

export const AI_TIPS: AiTip[] = [
  { title: 'Give context', body: 'Tell the AI who it is for, what you want and show one example. Better input, better answer.' },
  { title: 'Check the facts', body: 'AI can sound very sure and still be wrong. Double-check names, numbers and sources.' },
  { title: 'Keep secrets secret', body: 'Never paste passwords, bank details or private data into a chatbot.' },
  { title: 'Ask for options', body: 'Ask for three ideas, pick the best one, then ask it to improve just that one.' },
  { title: 'Name the format', body: 'Say how you want it: a table, a short list, or three sentences.' },
  { title: 'Fix, don\'t restart', body: 'If the answer misses, say exactly what is wrong. A follow-up usually beats starting over.' },
  { title: 'Make it your tutor', body: 'After you learn something, ask the AI to quiz you with three questions.' },
  { title: 'Give it a role', body: 'Start with "You are a patient teacher..." and the answer changes its whole tone.' },
  { title: 'One step at a time', body: 'Break a big task into small steps and ask for one step at a time.' },
  { title: 'Find the gaps', body: 'Show it your plan and ask: "What did I forget?"' },
  { title: 'Show your work', body: 'For a tricky problem, ask it to explain its reasoning step by step, then check each step.' },
  { title: 'Long reads', body: 'For a long document, ask for a short summary first, then dig into the part you need.' },
  { title: 'Your voice', body: 'Paste something you wrote and ask it to match your style, so it sounds like you.' },
  { title: 'You decide', body: 'Use AI to think faster, not to think less. The final choice is always yours.' },
];

/** Same tip for everyone all day (Asia/Bangkok date). */
export function getAiTipForDate(now: Date = new Date()): AiTip {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now); // YYYY-MM-DD
  const day = Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86_400_000);
  return AI_TIPS[((day % AI_TIPS.length) + AI_TIPS.length) % AI_TIPS.length];
}

// Nova's prompt tricks — how to ask AI better. Evergreen, one per day.
export const PROMPT_TRICKS: AiTip[] = [
  { title: 'Goal first', body: 'Start with "I want ___ so that ___." The AI works better when it knows the why.' },
  { title: 'Show, don\'t tell', body: 'Paste one example of what good looks like. Examples beat long explanations.' },
  { title: 'Let it ask', body: 'Add "Before you answer, ask me 3 questions." You\'ll get a much better fit.' },
  { title: 'Set a limit', body: 'Say "in under 100 words." Short limits make sharper answers.' },
  { title: 'Pick the reader', body: '"Explain it to a 10-year-old" and "explain it to an engineer" give two very different answers.' },
  { title: 'Self-review', body: 'Ask it to point out the weak spots in its own answer, then rewrite it.' },
  { title: 'Say what NOT to do', body: '"No jargon, no emojis, no intro." Rules on what to skip work too.' },
  { title: 'Table it', body: 'Comparing things? Ask for a table. Your eyes will thank you.' },
  { title: 'Keep a prompt stash', body: 'When a prompt works, save it. Reuse beats rewriting.' },
  { title: 'Draft first', body: 'Give it your messy draft to edit. Editing is easier than starting from zero.' },
  { title: 'Honest mode', body: 'Ask "What is the weakest part of my idea?" instead of "Is this good?"' },
  { title: 'Split the job', body: 'Outline first, then write each part. One big ask gives one big blur.' },
];

/** Same trick for everyone all day (Asia/Bangkok date), offset so it doesn't line up with AI_TIPS. */
export function getPromptTrickForDate(now: Date = new Date()): AiTip {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  const day = Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86_400_000) + 5;
  return PROMPT_TRICKS[((day % PROMPT_TRICKS.length) + PROMPT_TRICKS.length) % PROMPT_TRICKS.length];
}

// Clara's thinking habits — how to learn and think clearly WITH AI (not instead of it). Evergreen.
export const THINKING_HABITS: AiTip[] = [
  { title: 'Try first', body: 'Give a problem two minutes of your own thinking before you ask AI. You\'ll understand the answer better.' },
  { title: 'Say it back', body: 'After you learn something, explain it in your own words. If you can\'t, ask again.' },
  { title: 'Open the source', body: 'When an answer names a source, open it and read a little yourself.' },
  { title: 'The other side', body: 'Ask "What would someone who disagrees say?" Good thinking looks at both sides.' },
  { title: 'Small and daily', body: 'One small thing learned every day beats one big cram once a month.' },
  { title: 'Notice feelings', body: 'If an answer feels too perfect, slow down. That\'s the moment to check.' },
  { title: 'Write it down', body: 'Keep one line a day of what you learned. In a month you\'ll see how far you came.' },
  { title: 'Ask why, twice', body: 'Ask "why?" and then "why?" again. The second answer is usually the real one.' },
  { title: 'Sleep on it', body: 'For big decisions, let a night pass. Ideas look clearer in the morning.' },
  { title: 'Teach someone', body: 'Teaching is the fastest way to learn. Share one thing you learned today.' },
  { title: 'Be kind to mistakes', body: 'A wrong answer you understand teaches more than a right answer you copied.' },
  { title: 'One tab at a time', body: 'Focus on one question until it\'s done. Many tabs, little learning.' },
];

/** Same habit for everyone all day (Asia/Bangkok date), offset from the other lists. */
export function getThinkingHabitForDate(now: Date = new Date()): AiTip {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  const day = Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86_400_000) + 9;
  return THINKING_HABITS[((day % THINKING_HABITS.length) + THINKING_HABITS.length) % THINKING_HABITS.length];
}
