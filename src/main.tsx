import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Load the pixel font early so canvas text (name tags, speech bubbles) uses it from the first frame
document.fonts?.load('16px "Nuan Pixel"')

createRoot(document.getElementById('root')!).render(
  <App />,
)
