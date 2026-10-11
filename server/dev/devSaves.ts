// DEV ONLY (`npm run dev`): serves POST /api/items with the REAL save handler and rules
// (server/saves/handlers.ts + rules.ts), but for the fixed TEST Player ID only, stored in
// .dev/saves.json (git-ignored). Delete that file to start the test ID from scratch.
// Never part of a build: Vite applies this plugin to the dev server only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

interface Store { players: Record<string, unknown>; logs: Record<string, unknown> }

export function devSaves(): Plugin {
  return {
    name: 'lumen-dev-saves',
    apply: 'serve',
    configureServer(server) {
      const file = resolve(server.config.root, '.dev/saves.json');
      let store: Store = { players: {}, logs: {} };
      try { store = JSON.parse(readFileSync(file, 'utf8')) as Store; } catch { /* first run */ }
      const persist = () => {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(store, null, 2));
      };
      server.middlewares.use('/api/items', async (req, res) => {
        // Loaded per request so edits to the real handler/rules apply without restarting.
        const { createItemsHandler, DailyLimiter } = await server.ssrLoadModule('/server/saves/handlers.ts');
        const { IpLimiter } = await server.ssrLoadModule('/server/identity/http.ts');
        const { DEV_TEST_ADDRESS, DEV_TEST_TOKEN } = await server.ssrLoadModule('/src/identity/devTestIdentity.ts');
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        // The phone may open the dev server by LAN IP over http; present one fixed dev origin.
        const origin = 'http://localhost';
        req.headers.origin = origin;
        (req as typeof req & { body?: unknown }).body = Buffer.concat(chunks).toString('utf8');
        const handler = createItemsHandler({
          env: { LOGIN_ALLOWED_ORIGINS: origin },
          limiter: new IpLimiter(10_000), playerLimiter: new IpLimiter(10_000), playerDaily: new DailyLimiter(1_000_000),
        }, {
          verifyToken: async (token: string) => {
            if (token !== DEV_TEST_TOKEN) throw new Error('not the dev test token');
            return { uid: DEV_TEST_ADDRESS, walletSignedInAt: Date.now() - 1000, walletLoginOrigin: origin };
          },
          readPlayer: async (address: string) => structuredClone(store.players[address] ?? null),
          transact: async (address: string, id: string, fn: (p: unknown, l: unknown) => { write: { player: unknown; log: unknown } | null; response: unknown }) => {
            const key = `${address}/${id}`;
            const out = fn(structuredClone(store.players[address] ?? null), structuredClone(store.logs[key] ?? null));
            if (out.write) { store.players[address] = out.write.player; store.logs[key] = out.write.log; persist(); }
            return out.response;
          },
        });
        await handler(req, res);
      });
    },
  };
}
