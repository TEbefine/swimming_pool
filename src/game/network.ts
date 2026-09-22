import type { PlayerData, ChatMessage } from './types';

export type NetworkEventCallback = (type: string, data: unknown) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, Set<NetworkEventCallback>> = new Map();
  private isConnected: boolean = false;
  private localPlayerId: string;

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  constructor(localPlayerId: string) {
    this.localPlayerId = localPlayerId;
    this.setupBroadcastChannel();
    this.setupWebSocket();
  }

  private setupBroadcastChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('pixel_pool_hangout');
        this.channel.onmessage = (event) => {
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
    if (typeof window === 'undefined') return;
    try {
      const wsUrl = `ws://${window.location.hostname}:3001`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connection_change', { connected: true, transport: 'websocket' });
      };

      this.ws.onmessage = (event) => {
        try {
          const { type, data, senderId } = JSON.parse(event.data);
          if (senderId === this.localPlayerId) return;
          this.emit(type, data);
        } catch {
          // ignore malformed msg
        }
      };

      this.ws.onerror = () => {
        // Fallback to BroadcastChannel is active
        this.isConnected = false;
        this.emit('connection_change', { connected: false, transport: 'broadcast_channel' });
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('connection_change', { connected: false, transport: 'broadcast_channel' });
        // Try reconnecting after 5 seconds
        setTimeout(() => this.setupWebSocket(), 5000);
      };
    } catch {
      // WebSocket connection failed, BroadcastChannel active
    }
  }

  public on(event: string, cb: NetworkEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  public off(event: string, cb: NetworkEventCallback) {
    const list = this.listeners.get(event);
    if (list) {
      list.delete(cb);
    }
  }

  private emit(event: string, data: unknown) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((cb) => cb(event, data));
    }
  }

  public broadcastPlayerState(player: PlayerData) {
    const payload = {
      type: 'player_state',
      senderId: this.localPlayerId,
      data: player
    };

    // Broadcast channel
    if (this.channel) {
      this.channel.postMessage(payload);
    }

    // WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public sendChatMessage(message: ChatMessage) {
    const payload = {
      type: 'chat_message',
      senderId: this.localPlayerId,
      data: message
    };

    if (this.channel) {
      this.channel.postMessage(payload);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public sendPlayerLeave(playerId: string) {
    const payload = {
      type: 'player_leave',
      senderId: this.localPlayerId,
      data: { id: playerId }
    };

    if (this.channel) {
      this.channel.postMessage(payload);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public destroy() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}
