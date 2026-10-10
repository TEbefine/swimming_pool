import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Load the pixel font early so canvas text (name tags, speech bubbles) uses it from the first frame
document.fonts?.load('500 12px "IBM Plex Sans Thai"', 'กA') // canvas name tags, bubbles, signs
document.fonts?.load('18px "VT323"', 'A') // English text: VT323
document.fonts?.load('16px "IBM Plex Sans Thai"', 'ก') // Thai text: IBM Plex Sans Thai
document.fonts?.load('500 16px "IBM Plex Sans Thai"', 'ก')

const root = createRoot(document.getElementById('root')!)
const testMode = new URLSearchParams(location.search).get('test') // TEST MODE (?test=fishing)
if (testMode === 'fishing' || testMode === 'free') import('./dev/fishingTest.tsx').then(({ mountFishingTest }) => mountFishingTest(root, App, testMode === 'free' ? 'free' : 'story')) // TEST MODE
else if (testMode === 'story') import('./dev/storyTest.tsx').then(({ mountStoryTest }) => mountStoryTest(root, App)) // TEST MODE (?test=story)
else root.render(<App />) // TEST MODE: when deleting src/dev/, keep only: root.render(<App />)

// Keep the game's art on the phone after the first visit (public/sw.js). Production only:
// in `npm run dev` a service worker would get in the way of live reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    setTimeout(() => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }, 3000)
  })
}
