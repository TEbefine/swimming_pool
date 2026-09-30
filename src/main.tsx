import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Load the pixel font early so canvas text (name tags, speech bubbles) uses it from the first frame
document.fonts?.load('16px "Sabai Pixel"')

const root = createRoot(document.getElementById('root')!)
const testMode = new URLSearchParams(location.search).get('test') // TEST MODE (?test=fishing)
if (testMode === 'fishing' || testMode === 'free') import('./dev/fishingTest.tsx').then(({ mountFishingTest }) => mountFishingTest(root, App, testMode === 'free' ? 'free' : 'story')) // TEST MODE
else if (testMode === 'story') import('./dev/storyTest.tsx').then(({ mountStoryTest }) => mountStoryTest(root, App)) // TEST MODE (?test=story)
else root.render(<App />) // TEST MODE: when deleting src/dev/, keep only: root.render(<App />)
