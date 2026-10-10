import { createRoot } from 'react-dom/client'
import './index.css'
import { lazy, Suspense } from 'react'
import { IdentityGate } from './identity/IdentityGate'

// Entry point is mounted once; it is not a Fast Refresh component module.
// oxlint-disable-next-line react/only-export-components
const App = lazy(() => import('./App.tsx'))

// Load both scripts before canvas labels are cached.
document.fonts?.load('16px "Pool Pixel Default"', 'กพฟฬA')

const root = createRoot(document.getElementById('root')!)
const testMode = new URLSearchParams(location.search).get('test') // TEST MODE (?test=fishing)
if (testMode === 'fishing' || testMode === 'free') Promise.all([import('./dev/fishingTest.tsx'), import('./App.tsx')]).then(([{ mountFishingTest }, { default: Game }]) => mountFishingTest(root, Game, testMode === 'free' ? 'free' : 'story')) // TEST MODE
else if (testMode === 'story') Promise.all([import('./dev/storyTest.tsx'), import('./App.tsx')]).then(([{ mountStoryTest }, { default: Game }]) => mountStoryTest(root, Game)) // TEST MODE (?test=story)
else root.render(<IdentityGate>{options => <Suspense fallback={<div role="status">Opening Lumen Bay…</div>}><App {...options} /></Suspense>}</IdentityGate>)

// Keep the game's art on the phone after the first visit (public/sw.js). Production only:
// in `npm run dev` a service worker would get in the way of live reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    setTimeout(() => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }, 3000)
  })
}
