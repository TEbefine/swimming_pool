// TEST MODE for the Prologue story: /?test=story
// The real game (Game Boy screen + controller on phones) with a sandbox save (dalbit_test_sandbox,
// never the real story) and a TEST chip to jump straight to a part of Day 1.
// To delete: remove src/dev/ and the TEST MODE lines in main.tsx.

import React, { useState } from 'react';
import type { Root } from 'react-dom/client';
import type { GameEngine } from '../game/Engine';
import { getStory, resetStory, updateStory, type StoryState } from '../game/story/storyStore';
import { ITEM_IDS, type ItemId } from '../game/story/items';

type AppComponent = React.FC<{ devOverlay?: React.ReactNode; onEngineReady?: (e: GameEngine) => void }>;

let eng: GameEngine | null = null;

/** Jump points: a save preset + the room and spot to stand in. */
const JUMPS: { label: string; room: string; at?: { x: number; y: number }; state: Partial<StoryState> }[] = [
  { label: 'Morning (start)', room: 'dalbit_yard', state: { step: 'd1_wake' } },
  { label: 'Fishing', room: 'dalbit_river', at: { x: 376, y: 222 }, state: { step: 'd1_fish', bag: { small_net: 1 }, flags: { first_catch: true } } },
  { label: 'Market (5 fish)', room: 'dalbit_market', state: { step: 'd1_market', bag: { small_net: 1, mackerel: 3, yellow_croaker: 1, anchovy: 1 }, flags: { first_catch: true } } },
  { label: 'Dusk (coins + yeot)', room: 'dalbit_yard', at: { x: 330, y: 360 }, state: { step: 'd1_dusk', coins: 9, bag: { small_net: 1, yeot: 1, mackerel: 1 }, counters: { sold_gu: 4 } } },
  { label: 'Night', room: 'dalbit_yard', at: { x: 330, y: 360 }, state: { step: 'd1_night' } },
];

function jump(i: number) {
  const j = JUMPS[i];
  resetStory();
  updateStory((s) => ({ ...s, energy: 10, ...j.state, flags: { ate_breakfast: true, ...j.state.flags } }));
  if (!eng) return;
  void eng.changeRoom(j.room).then(() => {
    if (eng && j.at) {
      eng.localPlayer.x = j.at.x;
      eng.localPlayer.y = j.at.y;
    }
  });
}

const StoryTestChip: React.FC = () => {
  const [open, setOpen] = useState(false);
  const small = window.innerWidth < 768;
  const box = 'bg-[#FFF6E5]/95 border-2 border-[#4A2E1A] text-[#4A2E1A] rounded-md';
  const s = getStory();
  return (
    <div
      className={`pointer-events-auto absolute ${small ? 'left-1 bottom-1 text-[10px] flex-col-reverse' : 'left-3 top-28 text-[13px] flex-col'} z-[8] flex items-start gap-1`}
      style={{ fontFamily: 'var(--font-pixel)' }}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${box} px-1.5 py-0.5 bg-[#F4D98B]`}>
        TEST {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className={`${box} p-1.5 flex flex-col gap-1`}>
          <span className="opacity-70">Jump to (sandbox save):</span>
          {JUMPS.map((j, i) => (
            <button key={j.label} type="button" className="text-left px-1 rounded-sm hover:bg-[#F4D98B]" onClick={() => { jump(i); setOpen(false); }}>
              {j.label}
            </button>
          ))}
          <button
            type="button"
            className="text-left px-1 rounded-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold"
            onClick={() => {
              updateStory((st) => {
                const sampleBag: Partial<Record<ItemId, number>> = {};
                for (const id of ITEM_IDS) {
                  sampleBag[id] = 3;
                }
                return { ...st, bag: { ...st.bag, ...sampleBag } };
              });
              setOpen(false);
            }}
          >
            + Fill Bag (All Items)
          </button>
          <span className="opacity-70 pt-1">step: {s.step} · day {s.day}</span>
          <span className="opacity-70">ledger: {s.ledger.length} echoes</span>
        </div>
      )}
    </div>
  );
};

export function mountStoryTest(root: Root, App: AppComponent) {
  const url = new URL(location.href);
  if (!url.searchParams.get('room')) {
    url.searchParams.set('room', 'dalbit_yard');
    history.replaceState(null, '', url);
  }
  root.render(
    <App
      devOverlay={<StoryTestChip />}
      onEngineReady={(e) => {
        eng = e;
        (window as unknown as { __eng: GameEngine; __jump: (i: number) => void }).__eng = e; // handy in the console
        (window as unknown as { __jump: (i: number) => void }).__jump = jump;
        (window as unknown as { __story: unknown }).__story = { getStory, updateStory };
      }}
    />,
  );
}
