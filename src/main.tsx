import { createRoot } from 'react-dom/client'
import './index.css'
import { lazy, Suspense } from 'react'
import { IdentityGate } from './identity/IdentityGate'
import { DEV_TEST_ADDRESS } from './identity/devTestIdentity'

// Entry point is mounted once; it is not a Fast Refresh component module.
// oxlint-disable-next-line react/only-export-components
const App = lazy(() => import('./App.tsx'))

// Load both scripts before canvas labels are cached.
document.fonts?.load('16px "Pool Pixel Default"', 'กพฟฬA')

const root = createRoot(document.getElementById('root')!)
const testMode = new URLSearchParams(location.search).get('test') // TEST MODE (?test=fishing)
if (testMode === 'fishing' || testMode === 'free') Promise.all([import('./dev/fishingTest.tsx'), import('./App.tsx')]).then(([{ mountFishingTest }, { default: Game }]) => mountFishingTest(root, Game, testMode === 'free' ? 'free' : 'story')) // TEST MODE
else if (testMode === 'story') Promise.all([import('./dev/storyTest.tsx'), import('./App.tsx')]).then(([{ mountStoryTest }, { default: Game }]) => mountStoryTest(root, Game)) // TEST MODE (?test=story)
// npm run dev: play as the fixed TEST Player ID — no wallet/12 words (Web Crypto doesn't exist on a phone
// opening the dev server over http), saves go to .dev/saves.json. `?realid=1` shows the real identity flow.
else if (import.meta.env.DEV && !new URLSearchParams(location.search).has('realid')) root.render(<>
  <div style={{ position: 'fixed', left: 4, bottom: 4, zIndex: 9999, pointerEvents: 'none', font: '11px monospace', padding: '1px 5px', borderRadius: 3, background: '#F4D98B', color: '#4A2E1A', opacity: 0.9 }}>TEST ID · dev saves</div>
  <Suspense fallback={<div role="status">Opening Lumen Bay…</div>}><App playerId={DEV_TEST_ADDRESS} /></Suspense>
</>)
else root.render(<IdentityGate>{options => <Suspense fallback={<div role="status">Opening Lumen Bay…</div>}><App {...options} /></Suspense>}</IdentityGate>)

// Keep the game's art on the phone after the first visit (public/sw.js). Production only:
// in `npm run dev` a service worker would get in the way of live reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    setTimeout(() => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }, 3000)
  })
}
