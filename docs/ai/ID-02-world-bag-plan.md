# ID-02 · World Bag Architecture Plan

*Status: Plan only (no code). Target: Future ID-02 identity phase.*  
*Scope: Persistent multiplayer inventory in Lumen Bay vs Dalbit story bag.*

---

## 1. Story Bag vs World Bag: Separation & Distinction

### Which bag opens where
- **Story Rooms (`isStoryRoom`)**: Opens **Dalbit Story Bag** (`story.bag`). Holds Kang Yunseul's 16 prologue items (nets, dried fish, yeot, coins). Progression is episodic and resets/continues with Dalbit narrative days.
- **World Rooms (Quiet Bay, Poolside, Café, Club, My Room)**: Opens **Lumen Bay World Bag** (`world.bag`). Holds player-owned items (free fish, card disks, event souvenirs, bay currency). Saved permanently to the Player ID.

### How the player tells them apart
1. **Header Badge**: 
   - Story: `BAG · DALBIT` with Kang Yunseul's name and story coins.
   - World: `BAG · LUMEN BAY` with player handle (`0x...` or name) and Bay Coins.
2. **Backpack Sprite & Palette**:
   - Story bag uses Yunseul's rustic woven travel pack (warm brown/gold palette).
   - World bag uses the modern navy/cream canvas backpack with community pins.
3. **Pockets & Context**:
   - Story bag shows story-only key items (`small_net`, Dalbit ledger).
   - World bag shows free fish, card memory disks, and bay consumables.

---

## 2. Server Authority & Anti-Cheat via `/api/items`

### Ingestion Flow
1. **Catch Event**: Player lands a bite at the Pier or Poolside. Catches buffer locally into `pending_world_catches_<address>`.
2. **Guide Hand-in**: Talking to Nami (day) or Kai (night) triggers a batch upload to `POST /api/items` (`op: 'world.recordCatches'`).
3. **Server Validation**:
   - Server validates species ID against `freeFishCatalog.ts`.
   - Length checks against catalog bounds (`minCm`..`maxCm`).
   - Time spacing: catches must be $\ge 3\text{ s}$ apart, within $\pm 10\text{ min}$ of real clock, correct season and daylight phase.
   - Future anti-cheat: server-issued **Cast Tickets** (HMAC token granted on line cast; validated on bite claim) preventing client-side rarity spoofing.

### Firestore Cost Architecture (100–200 Players)
- **Document Model**: Keep `inventory: Record<string, number>` directly inside the root `players/{address}` document.
  - 65 fish species + cards as integers fits in $< 2\text{ KB}$ (well under the 1 MB document limit).
  - **Zero extra document reads**: loaded in the single document snapshot already fetched during login/sync.
  - **Single Write Transaction**: Recording a batch of 20 catches writes exactly 1 document update + 1 audit log entry.
- **Quota Math on Firebase Spark (Free Tier: 20k writes/day, 50k reads/day)**:
  - 200 players recording catches 4 times/day = 800 write transactions (1,600 writes total including audit log).
  - Uses $\approx 8\%$ of the daily Spark write limit. Highly sustainable with zero server cost.

---

## 3. Item Utilities & Economic Loop

1. **Sell (Vendor Economy)**:
   - Sell common/abundant catches to Market NPCs (or the Café counter) for Bay Coins.
   - Uses catalog prices (`sell.gu` / `sell.inn`).
   - Batched to Firestore on shop exit to prevent write spam.
2. **Gift (NPC Affinity)**:
   - Gift favorite fish to NPCs (Lifeguard, Barista, Spirit) to unlock lore dialogues and rare cards.
3. **Cook (Consumables)**:
   - Combine fish with café ingredients to craft snacks providing temporary stamina or movement buffs.
4. **Trade (Multiplayer P2P — Later Phase)**:
   - 2-player swap interface over WebSocket relay.
   - Commit-reveal transaction signed by both Player ID sessions via `/api/items` (`op: 'trade'`).

---

## 4. Risks & Implementation Sequence

### Core Risks
- **Economy Hyperinflation**: If client-side bite rolls are converted to items before server cast tickets are enforced, bot clients will harvest rare fish endlessly.
- **Write Flooding**: Granular actions (e.g., selling fish one by one) could exhaust the Spark write quota if not queued/batched.
- **Inventory Desync**: Switching between devices with pending unrecorded catches could overwrite or fork inventory state if draft conflicts aren't handled.

### What to Build First
1. **Milestone 1**: **Server Cast Tickets (`/api/cast`)** — Server seeds the bite parameters before catch, eliminating client fish spoofing.
2. **Milestone 2**: **World Bag Schema & Storage** — Add `inventory` mapping to `players/{address}` schema and batch ingestion in `/api/items`.
3. **Milestone 3**: **World Bag Screen Switching** — Dynamically mount World Bag in non-story rooms.
4. **Milestone 4**: **NPC Fish Market** — Nami/Kai fish exchange for Bay Coins.
5. **Milestone 5 (Last)**: **Player-to-Player Trading** — Requires robust escrow and dual-signature verification.
