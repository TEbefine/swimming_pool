# 🏊 Pixel Poolside Hangout - Real-Time 2D Virtual World

A real-time 2D pixel-art virtual hangout web app where players can walk on poolside decks, swim in the pool with customizable float rings, express themselves with retro emotes, and chat live with friends using 8-bit speech bubbles.

---

## ✨ Features

- **2D Side-Angle Pixel-Art Poolside**: Deck lounges, pool lane lines, pool ladders, umbrellas, and ocean view.
- **Character Animation State Machine**:
  - **On Land**: `idle`, `walk1`, `walk2`, `wave`, `talk`, `happy`, `thinking`, `sit`, `lie`, `jump`.
  - **On Water**: `idle`, `swim`, `wave`, `talk`, `happy`, `relax`, `surprise`.
- **Land ↔ Water Physics**:
  - Stepping into the pool automatically equips your swim ring tube and triggers water splash particles and water buoyancy bobbing.
  - Climb in and out of the water via the deck edges or pool ladders.
- **8 Swim Ring Color Variations**:
  - Pick your favorite tube color anytime: Red, Blue, Pink, Yellow, Black, Green, Purple, or Gray.
- **Dual Controls**:
  - **Keyboard**: WASD or Arrow Keys.
  - **Click/Tap-to-Move**: Mobile and touch-friendly with retro destination marker.
- **Speech Bubbles & Live Proximity Chat**:
  - 8-bit pixel speech bubbles float above avatars for 5 seconds with smooth fadeout.
  - Collapsible message history log drawer.
  - Quick shouts popover (*"Come in the pool! 🏊"*, *"Nice float ring! ✨"*).
- **Hybrid Real-Time Multiplayer**:
  - **BroadcastChannel**: Zero-setup instant multiplayer across browser tabs.
  - **WebSocket Relay**: Built-in Node.js server (`server/wsServer.js`) for multi-device network hangout.
  - Linear interpolation (lerp) for smooth remote movement without stutter.
- **8-Bit Web Audio API Synthesizer**:
  - Footstep clicks, water splash sounds, message chimes, and action emote jingles with persistent mute toggle.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Start the Multiplayer WebSocket Server (Optional)
```bash
npm run server
```
*Note: Cross-tab multiplayer works automatically via `BroadcastChannel` even without starting the WebSocket server!*

### 4. Build for Production
```bash
npm run build
```

---

## 📁 Project Structure

```
├── public/
│   ├── maps/
│   │   └── poolside.png              # Poolside resort scene
│   └── sprites/
│       ├── land/                     # Transparent land animation frames
│       ├── water/                    # Water animation frames for all 8 float colors
│       └── character_manifest.json   # Sprite dimensions & manifest
├── scripts/
│   └── process_assets.py             # Sprite extraction & palette recoloring pipeline
├── server/
│   └── wsServer.js                   # WebSocket relay server
├── src/
│   ├── components/                   # UI overlays (ChatBar, HeaderBar, ActionBar, etc.)
│   ├── game/
│   │   ├── audio.ts                  # Web Audio API 8-bit synthesizer
│   │   ├── Engine.ts                 # Canvas render loop, player physics & lerp
│   │   ├── network.ts                # Hybrid BroadcastChannel + WebSocket manager
│   │   ├── types.ts                  # State machine & networking types
│   │   └── rooms/
│   │       └── poolside.ts           # Modular room configuration
│   ├── App.tsx                       # Main React viewport container
│   ├── main.tsx                      # Entry point
│   └── index.css                     # Retro pixel design system & Tailwind CSS
└── package.json
```

---

## 🎮 Controls

| Action | Control |
| :--- | :--- |
| **Move** | `WASD` / `Arrow Keys` or `Click / Tap anywhere` |
| **Focus Chat** | `Enter` |
| **Wave Emote** | `1` |
| **Sit / Relax** | `2` |
| **Lie / Happy** | `3` |
| **Surprise** | `4` |
| **Jump / Chat Pose** | `5` |
| **Mute Audio** | Header speaker button |
| **Change Float** | Header palette button |

---

## 📜 License
MIT
