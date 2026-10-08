// ============================================================================
// TEST MODE — open the game with  ?test=fishing
// The REAL game starts at the river mouth, Yunseul standing near the end of the pier,
// with a SANDBOX save (never the real story), infinite energy, and a small TEST chip
// (top-left) to pick the next fish and see results. Fish with your normal controls:
// walk to the pier end and press ◯ (or E).
//
// To delete test mode later:
//   1. delete the folder  src/dev/
//   2. in src/main.tsx remove the lines marked "TEST MODE" (keep: root.render(<App />))
// ============================================================================

import React, { useState, useSyncExternalStore } from 'react';
import type { Root } from 'react-dom/client';
import type { GameEngine } from '../game/Engine';
import { TUNING, type FishingPhase } from '../game/story/fishing';
import { FISHING_SPOT, setFishingTestHooks } from '../game/story/fishingSession';
import { ITEMS, ITEM_IDS, type ItemId } from '../game/story/items';
import { FREE_BY_ID, FREE_FISH, TIERS, resetFishBook } from '../game/fishing/freeFish';
import { getStory, resetStory, setEnergy, setStep, subscribeStory } from '../game/story/storyStore';

// ---- results ------------------------------------------------------------
interface Result { phase: FishingPhase; fish: string | null; secs: number }
let results: Result[] = [];
let forceFish: string | null = null;
let kind: 'story' | 'free' = 'story';
let lastCast = '';
const listeners = new Set<() => void>();
let version = 0; // bumps on every change so the chip re-renders
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const useResults = () => {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => version);
  return results;
};

function applyHooks() {
  setFishingTestHooks({
    forceFish,
    onCast: (info) => {
      const zone = TUNING.zone(info.distance);
      lastCast = `${Math.round(info.distance * 100)}% · ${zone}${info.nice ? ' · Nice!' : ''}`;
      emit();
    },
    onResult: (phase, fish, secs) => {
      results = [{ phase, fish, secs }, ...results].slice(0, 200);
      emit();
    },
  });
}

function prepareSandbox() {
  setStep('d1_fish'); // fishing unlocked, objective = "Fish from the end of the pier"
  setEnergy(10);
}

// ---- start --------------------------------------------------------------
type AppComponent = React.FC<{ devOverlay?: React.ReactNode; onEngineReady?: (e: GameEngine) => void }>;

export function mountFishingTest(root: Root, App: AppComponent, which: 'story' | 'free' = 'story') {
  kind = which;
  // start at the pier (story: river mouth · free: Fishing Pier)
  const room = which === 'free' ? 'lake_pier' : 'dalbit_river';
  const url = new URL(location.href);
  if (url.searchParams.get('room') !== room) {
    url.searchParams.set('room', room);
    history.replaceState(null, '', url);
  }
  prepareSandbox();
  // infinite energy
  subscribeStory(() => {
    if (getStory().energy < 10) setEnergy(10);
  });
  applyHooks();
  root.render(<App devOverlay={<FishingTestChip />} onEngineReady={placePlayer} />);
}

/** Put Yunseul on the pier, a few steps from the fishing spot. */
function placePlayer(engine: GameEngine) {
  (window as unknown as { __eng: GameEngine }).__eng = engine; // test mode: handy in the browser console
  const fc = engine.getRoom().fishing; // front-facing rooms (Quiet Bay): stand on the front edge
  engine.localPlayer.x = fc ? 420 : FISHING_SPOT.x - 36;
  engine.localPlayer.y = fc ? fc.standY : FISHING_SPOT.y;
  engine.localPlayer.facing = 1;
}

// ---- the TEST chip --------------------------------------------------------
const LABEL: Record<string, string> = { caught: 'Caught', escaped: 'Escaped', scared: 'Too early', stolen: 'Too slow' };
const CATCHABLE = ITEM_IDS.filter((id) => ITEMS[id].catch);

const FishingTestChip: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState<string>(forceFish ?? '');
  const r = useResults();
  const small = window.innerWidth < 768;

  const count = (p: string) => r.filter((x) => x.phase === p).length;
  const reels = r.filter((x) => x.phase === 'caught' || x.phase === 'escaped');
  const avg = reels.length ? reels.reduce((a, x) => a + x.secs, 0) / reels.length : 0;
  const caught = count('caught');

  const box = 'bg-[#FFF6E5]/95 border-2 border-[#4A2E1A] text-[#4A2E1A] rounded-md';
  return (
    <div
      className={`pointer-events-auto absolute ${small ? 'left-1 top-7 text-[10px]' : 'left-3 top-28 text-[13px]'} z-[7] flex flex-col items-start gap-1`}
      style={{ fontFamily: 'var(--font-pixel)' }}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${box} px-1.5 py-0.5 bg-[#F4D98B]`}>
        TEST {open ? '▾' : '▸'} {r.length > 0 && !open ? `${caught}/${r.length}` : ''}
      </button>
      {open && (
        <div className={`${box} p-2 flex flex-col gap-1.5 ${small ? 'w-[200px]' : 'w-[260px]'}`}>
          <label className="flex flex-col gap-0.5">
            Next fish
            <select
              value={force}
              onChange={(e) => {
                const v = e.target.value;
                setForce(v);
                forceFish = v || null;
                applyHooks();
              }}
              className="border border-[#4A2E1A] rounded bg-white px-1"
            >
              <option value="">Random (real chances)</option>
              {kind === 'free'
                ? FREE_FISH.map((f) => (
                    <option key={f.id} value={f.id}>{TIERS[f.tier].label} · {f.name}{f.time ? ` (${f.time})` : ''}</option>
                  ))
                : CATCHABLE.map((id) => (
                    <option key={id} value={id}>{ITEMS[id].name} · d{ITEMS[id].catch!.difficulty}</option>
                  ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-x-2">
            <span>Last cast</span><span data-testid="last-cast">{lastCast || '-'}</span>
            <span>Casts</span><span>{r.length}</span>
            <span>Caught</span><span>{caught}{r.length ? ` (${Math.round((caught / r.length) * 100)}%)` : ''}</span>
            <span>Escaped</span><span>{count('escaped')}</span>
            <span>Too early</span><span>{count('scared')}</span>
            <span>Too slow</span><span>{count('stolen')}</span>
            <span>Avg reel</span><span>{avg ? `${avg.toFixed(1)} s` : '-'}</span>
          </div>
          {r.length > 0 && (
            <ul className="max-h-[70px] overflow-y-auto opacity-75">
              {r.slice(0, 12).map((x, i) => (
                <li key={i}>{LABEL[x.phase] ?? x.phase}{x.fish ? ` · ${ITEMS[x.fish as ItemId]?.name ?? FREE_BY_ID[x.fish]?.name ?? x.fish}` : ''}{x.secs ? ` · ${x.secs.toFixed(1)}s` : ''}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="border border-[#4A2E1A] rounded px-1 py-0.5 hover:bg-[#F4E6CC]"
            onClick={() => { if (kind === 'free') resetFishBook(); else { resetStory(); prepareSandbox(); } results = []; emit(); }}
          >
            {kind === 'free' ? 'Reset Fish Book' : 'Reset sandbox'}
          </button>
        </div>
      )}
    </div>
  );
};
