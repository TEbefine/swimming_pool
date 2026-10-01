// Pixel Poolside relay — built for a crowd (100–200 people) instead of a handful.
//
// The old relay forwarded every movement packet to every connected phone: with 200 players that
// is ~200,000 messages a second and every phone JSON-parsing ~1,000 messages a second (= heat).
// This relay instead:
//   • keeps each player's latest state and sends ONE batched snapshot per room, 10 times a second
//   • only sends players that moved (a full "keyframe" every 5 s keeps idle players alive)
//   • sends far-away players of the same room 2×/s instead of 10×/s
//   • sends names/colours/speech once ("profiles"), not inside every movement packet
//   • only sends you the people in YOUR room; other rooms just get a head-count
//   • rate-limits chat and floods, caps message size, and drops dead connections
//
// Run:  PORT=3001 node server/wsServer.js     (any Node host: Fly.io, Railway, Render, a VPS…)
// Then build the site with VITE_WS_URL=wss://your-relay.example.com

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const TICK_MS = 100;            // 10 snapshots per second
const KEYFRAME_TICKS = 50;      // full room picture every 5 s
const FAR_EVERY = 5;            // far-away players: every 5th tick (2×/s)
const NEAR_PX = 640;            // "near" = within this many art pixels horizontally
const COUNTS_EVERY = 30;        // room head-counts every 3 s
const MAX_MSGS_PER_SEC = 40;
const CHAT_GAP_MS = 600;
const MAX_TEXT = 200;
const MAX_NAME = 24;

const wss = new WebSocketServer({ port: PORT, maxPayload: 4 * 1024, perMessageDeflate: false });

/** @type {Map<string, Set<Client>>} */
const rooms = new Map();
let tick = 0;

class Client {
  constructor(ws) {
    this.ws = ws;
    this.id = null;
    this.room = null;
    /** [x, y, facing, action, state] */
    this.pos = [0, 0, 1, 'idle', 'land'];
    this.profile = { name: 'Guest', fc: 'red', msg: '', mt: 0 };
    this.dirtyNear = false;   // moved since the last tick
    this.dirtyFar = false;    // moved since the last far tick
    this.profileDirty = false;
    this.alive = true;
    this.windowStart = Date.now();
    this.msgs = 0;
    this.lastChat = 0;
  }
  send(obj) {
    if (this.ws.readyState !== 1) return;
    // A phone on a bad connection: drop replaceable updates rather than piling them up.
    if (obj.type === 'snap' && !obj.k && this.ws.bufferedAmount > 128 * 1024) return;
    this.ws.send(JSON.stringify(obj));
  }
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
const roomOf = (name) => {
  let set = rooms.get(name);
  if (!set) rooms.set(name, (set = new Set()));
  return set;
};
const posRow = (c) => [c.id, ...c.pos];
const profRow = (c) => [c.id, c.profile.name, c.profile.fc, c.profile.msg, c.profile.mt];

function leaveRoom(c) {
  if (!c.room) return;
  const set = rooms.get(c.room);
  if (set) {
    set.delete(c);
    for (const other of set) other.send({ type: 'leave', id: c.id });
    if (set.size === 0) rooms.delete(c.room);
  }
  c.room = null;
}

function joinRoom(c, room) {
  if (c.room === room) return;
  leaveRoom(c);
  c.room = room;
  const set = roomOf(room);
  set.add(c);
  // The newcomer gets everyone already here at once; everyone else hears about them next tick.
  const others = [...set].filter((o) => o !== c && o.id);
  c.send({ type: 'prof', p: others.map(profRow) });
  c.send({ type: 'snap', r: room, k: 1, p: others.map(posRow) });
  c.dirtyNear = c.dirtyFar = true;
  c.profileDirty = true;
}

function handle(c, raw) {
  const now = Date.now();
  if (now - c.windowStart > 1000) { c.windowStart = now; c.msgs = 0; }
  if (++c.msgs > MAX_MSGS_PER_SEC) return;
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;

  if (m.type === 'hello') {
    c.id = str(m.id, 32) || `anon_${Math.random().toString(36).slice(2, 8)}`;
    c.profile.name = str(m.name, MAX_NAME) || 'Guest';
    c.profile.fc = str(m.fc, 12) || 'red';
    joinRoom(c, str(m.room, 32) || 'poolside');
    c.send({ type: 'welcome', v: 2 });
    return;
  }
  if (!c.id) return;

  if (m.type === 's' && Array.isArray(m.d)) {
    const [x, y, f, a, st, room] = m.d;
    c.pos = [num(x), num(y), f === -1 ? -1 : 1, str(a, 24) || 'idle', st === 'water' ? 'water' : 'land'];
    c.dirtyNear = c.dirtyFar = true;
    const r = str(room, 32);
    if (r && r !== c.room) joinRoom(c, r);
  } else if (m.type === 'p' && m.d) {
    c.profile = {
      name: str(m.d.name, MAX_NAME) || c.profile.name,
      fc: str(m.d.fc, 12) || c.profile.fc,
      msg: str(m.d.msg, MAX_TEXT),
      mt: num(m.d.mt),
    };
    c.profileDirty = true;
  } else if (m.type === 'chat_message' && m.data && c.room) {
    if (now - c.lastChat < CHAT_GAP_MS) return;
    c.lastChat = now;
    const d = m.data;
    const msg = {
      id: str(d.id, 40), senderId: c.id, senderName: c.profile.name,
      text: str(d.text, MAX_TEXT), timestamp: now, roomId: c.room,
    };
    if (!msg.text) return;
    for (const other of rooms.get(c.room) ?? []) if (other !== c) other.send({ type: 'chat_message', data: msg });
  } else if (m.type === 'player_leave') {
    leaveRoom(c);
  }
}

function step() {
  tick++;
  const keyframe = tick % KEYFRAME_TICKS === 0;
  const farTick = tick % FAR_EVERY === 0;
  for (const [room, set] of rooms) {
    const members = [...set].filter((c) => c.id);
    const anyMoved = members.some((c) => c.dirtyNear || (farTick && c.dirtyFar));
    const profiles = members.filter((c) => c.profileDirty).map(profRow);
    if (anyMoved || keyframe || profiles.length) {
      for (const viewer of members) {
        const theirs = profiles.filter((p) => p[0] !== viewer.id);
        if (theirs.length) viewer.send({ type: 'prof', p: theirs });
        const rows = [];
        for (const c of members) {
          if (c === viewer) continue;
          const near = Math.abs(c.pos[0] - viewer.pos[0]) <= NEAR_PX;
          if (keyframe || (near && c.dirtyNear) || (!near && farTick && c.dirtyFar)) rows.push(posRow(c));
        }
        if (rows.length || keyframe) viewer.send({ type: 'snap', r: room, k: keyframe ? 1 : 0, p: rows });
      }
    }
    for (const c of members) {
      c.dirtyNear = false;
      if (farTick || keyframe) c.dirtyFar = false;
      c.profileDirty = false;
    }
  }
  if (tick % COUNTS_EVERY === 0) {
    const counts = {};
    for (const [room, set] of rooms) counts[room] = set.size;
    const msg = { type: 'rooms', c: counts };
    for (const c of clients.values()) c.send(msg);
  }
}

/** @type {Map<import('ws').WebSocket, Client>} */
const clients = new Map();

wss.on('connection', (ws) => {
  const c = new Client(ws);
  clients.set(ws, c);
  ws.on('message', (data) => handle(c, data.toString()));
  ws.on('pong', () => { c.alive = true; });
  const bye = () => { leaveRoom(c); clients.delete(ws); };
  ws.on('close', bye);
  ws.on('error', bye);
});

setInterval(step, TICK_MS);
// Drop phones that vanished without saying goodbye (tunnel, airplane mode, crashed tab).
setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) { ws.terminate(); continue; }
    c.alive = false;
    ws.ping();
  }
}, 15000);

wss.on('error', (err) => console.error('WebSocket server error:', err));
console.log(`[Pixel Poolside] crowd relay on ws://localhost:${PORT} (10 Hz snapshots, per-room)`);
