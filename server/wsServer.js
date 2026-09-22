import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

console.log(`[Pixel Poolside] WebSocket relay server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    // Broadcast message to all other connected clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
  });

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });
});

wss.on('error', (err) => {
  console.error('WebSocket server error:', err);
});
