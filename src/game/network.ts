import type { PlayerData, ChatMessage } from './types';

export type NetworkEventCallback = (type: string, data: unknown) => void;

/** Relay protocol v2 (server/wsServer.js): compact, batched, per room.
 *  Position rows are [id, x, y, facing, action, state]; profile rows [id, name, floatColor, message, messageTime]. */
type PosRow = [string, number, number, 1 | -1, string, 'land' | 'water'];
type ProfRow = [string, string, string, string, number];
interface Profile { name: string; floatColor: string; lastMessage?: string; messageTime?: number }

/** At most this many movement updates per second go to the relay (the relay batches at 10 Hz anyway). */
const SEND_GAP_MS = 100;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, Set<NetworkEventCallback>> = new Map();
  private isConnected: boolean = false;
  private localPlayerId: string;
  private wsUrl: string | null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  // v2 relay state
  private profiles = new Map<string, Profile>();
  private lastPlayer: PlayerData | null = null;
  private lastPos = '';
  private lastProfile = '';
  private lastPosSentAt = 0;
  private trailingTimer: ReturnType<typeof setTimeout> | null = null;
  private room = '';

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  constructor(localPlayerId: string, wsUrl?: string | null) {
    this.localPlayerId = localPlayerId;
    this.wsUrl = wsUrl === undefined ? this.resolveWebSocketUrl() : wsUrl;
    this.setupBroadcastChannel();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleAvailabilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleAvailabilityChange);
      window.addEventListener('offline', this.handleAvailabilityChange);
    }
    this.setupWebSocket();
  }

  private resolveWebSocketUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const configured = import.meta.env?.VITE_WS_URL?.trim();
    if (configured) return configured;
    // The optional Node relay runs separately in development. A production
    // deployment must opt in to its real wss:// endpoint, rather than retrying
    // an unavailable/insecure port on every visitor's phone.
    if (import.meta.env?.DEV && window.location.protocol === 'http:') {
      return `ws://${window.location.hostname}:3001`;
    }
    return null;
  }

  private isActive(): boolean {
    return !this.destroyed
      && (typeof document === 'undefined' || !document.hidden);
  }

  private isAvailable(): boolean {
    return this.isActive()
      && (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  private handleAvailabilityChange = () => {
    if (!this.isAvailable()) {
      this.clearReconnectTimer();
      this.closeWebSocket();
      return;
    }
    this.setupWebSocket();
  };

  private setupBroadcastChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('pixel_pool_hangout');
        this.channel.onmessage = (event) => {
          if (!this.isActive()) return;
          const { type, data, senderId } = event.data;
          if (senderId === this.localPlayerId) return;
          this.emit(type, data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported or error:', e);
    }
  }

  private setupWebSocket() {
    if (!this.wsUrl || !this.isAvailable() || this.ws || this.reconnectTimer !== null) return;
    if (typeof WebSocket === 'undefined') return;
    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed || this.ws !== ws) return;
        this.reconnectAttempt = 0;
        this.setConnected(true);
        this.lastPos = this.lastProfile = '';
        const p = this.lastPlayer;
        ws.send(JSON.stringify({
          type: 'hello', v: 2, id: this.localPlayerId,
          room: p?.roomId ?? '', name: p?.name ?? '', fc: p?.floatColor ?? '',
        }));
        if (p) this.sendCompact(p, true);
      };

      ws.onmessage = (event) => {
        if (!this.isAvailable() || this.ws !== ws) return;
        let msg: { type?: string; data?: unknown; senderId?: string; [k: string]: unknown };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return; // Ignore malformed messages.
        }
        this.handleRelayMessage(msg);
      };

      ws.onerror = () => {
        if (this.ws === ws) this.setConnected(false);
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.setConnected(false);
        this.scheduleReconnect();
      };
    } catch {
      // Invalid URLs and blocked mixed-content connections will not improve
      // through retries. BroadcastChannel remains available.
      this.setConnected(false);
    }
  }

  /** Turn the relay's batched messages back into the engine's simple events. */
  private handleRelayMessage(msg: { type?: string; data?: unknown; senderId?: string; [k: string]: unknown }) {
    switch (msg.type) {
      case 'prof':
        for (const [id, name, floatColor, lastMessage, messageTime] of (msg.p as ProfRow[]) ?? []) {
          this.profiles.set(id, { name, floatColor, lastMessage: lastMessage || undefined, messageTime: messageTime || undefined });
        }
        return;
      case 'snap': {
        const room = String(msg.r ?? '');
        const rows = (msg.p as PosRow[]) ?? [];
        const seen = msg.k ? new Set<string>() : null;
        for (const [id, x, y, facing, currentAction, state] of rows) {
          if (id === this.localPlayerId) continue;
          seen?.add(id);
          const prof = this.profiles.get(id);
          this.emit('player_state', {
            id, x, y, facing, currentAction, state, roomId: room,
            name: prof?.name ?? 'Guest',
            floatColor: prof?.floatColor ?? 'red',
            lastMessage: prof?.lastMessage,
            messageTime: prof?.messageTime,
            timestamp: Date.now(),
          } as PlayerData);
        }
        // A keyframe lists everyone in the room: anyone we still hold who isn't in it has left.
        if (seen) {
          for (const id of this.profiles.keys()) {
            if (!seen.has(id)) {
              this.profiles.delete(id);
              this.emit('player_leave', { id });
            }
          }
        }
        return;
      }
      case 'leave':
        this.profiles.delete(String(msg.id));
        this.emit('player_leave', { id: msg.id });
        return;
      case 'rooms':
        this.emit('room_counts', msg.c);
        return;
      case 'chat_message':
      case 'player_state':
      case 'player_leave':
        if (msg.senderId === this.localPlayerId) return;
        this.emit(msg.type, msg.data);
        return;
      default:
    }
  }

  /** Send our state in the relay's compact form: position only when it changed (≤10/s, the last
   *  one always arrives), name/colour/speech only when those changed. */
  private sendCompact(player: PlayerData, force = false) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const room = player.roomId ?? 'poolside';
    if (room !== this.room) {
      // New room: the relay will send us that room's people; forget the old room's.
      for (const id of this.profiles.keys()) this.emit('player_leave', { id });
      this.profiles.clear();
      this.room = room;
    }
    const profile = JSON.stringify([player.name, player.floatColor, player.lastMessage ?? '', player.messageTime ?? 0]);
    if (profile !== this.lastProfile) {
      this.lastProfile = profile;
      ws.send(JSON.stringify({ type: 'p', d: { name: player.name, fc: player.floatColor, msg: player.lastMessage ?? '', mt: player.messageTime ?? 0 } }));
    }
    const d = [Math.round(player.x), Math.round(player.y), player.facing, player.currentAction, player.state, room];
    const pos = JSON.stringify(d);
    if (pos === this.lastPos && !force) return;
    const now = Date.now();
    const wait = SEND_GAP_MS - (now - this.lastPosSentAt);
    if (wait > 0 && !force) {
      // Too soon: make sure the latest position still goes out at the next slot.
      if (this.trailingTimer === null) {
        this.trailingTimer = setTimeout(() => {
          this.trailingTimer = null;
          if (this.lastPlayer) this.sendCompact(this.lastPlayer);
        }, wait);
      }
      return;
    }
    // Movement is replaceable: avoid an ever-growing queue on slow mobile networks.
    if (ws.bufferedAmount > 64 * 1024) return;
    this.lastPos = pos;
    this.lastPosSentAt = now;
    ws.send(JSON.stringify({ type: 's', d }));
  }

  private setConnected(connected: boolean) {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    this.emit('connection_change', {
      connected,
      transport: connected ? 'websocket' : 'broadcast_channel',
    });
  }

  private scheduleReconnect() {
    if (!this.isAvailable() || this.reconnectTimer !== null) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempt++, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setupWebSocket();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeWebSocket() {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      // Clear callbacks before close: intentional teardown must not reconnect.
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
    }
    this.setConnected(false);
  }

  public on(event: string, cb: NetworkEventCallback) {
    if (this.destroyed) return;
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  public off(event: string, cb: NetworkEventCallback) {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(event, data));
  }

  private send(type: string, data: unknown) {
    if (this.destroyed) return;
    const payload = { type, senderId: this.localPlayerId, data };
    // Other tabs on this device get the simple full message.
    this.channel?.postMessage(payload);
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (type === 'player_state') {
        this.sendCompact(data as PlayerData);
        return;
      }
      this.ws.send(JSON.stringify(payload));
    }
  }

  public broadcastPlayerState(player: PlayerData) {
    if (!this.isActive()) return;
    this.lastPlayer = player;
    this.send('player_state', player);
  }

  public sendChatMessage(message: ChatMessage) {
    this.send('chat_message', message);
  }

  public sendPlayerLeave(playerId: string) {
    this.send('player_leave', { id: playerId });
  }

  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearReconnectTimer();
    if (this.trailingTimer !== null) clearTimeout(this.trailingTimer);
    this.trailingTimer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleAvailabilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleAvailabilityChange);
      window.removeEventListener('offline', this.handleAvailabilityChange);
    }
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
      this.channel = null;
    }
    this.closeWebSocket();
    this.listeners.clear();
  }
}
