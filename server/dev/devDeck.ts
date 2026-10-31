// Vite dev-server middleware only. Neither the production API nor the browser imports this module.
import type { Plugin } from 'vite';
import { FISHING_DECK } from '../../src/game/fishing/deckConfig.js';
import { devFishingPolicy } from './devFishingPolicy.js';

export function devDeck(): Plugin {
  return {
    name: 'lumen-dev-fishing-deck', apply: 'serve',
    configureServer(server) {
      // The same reset-local policy guards issuance and saves, even when this plugin is used alone.
      const policy = devFishingPolicy(server.config.root);
      server.middlewares.use('/api/fishing-deck', async (req, res) => {
        const { createFishingDeckHandler } = await server.ssrLoadModule('/server/fishing/deck.ts');
        const { DEV_TEST_ADDRESS, DEV_TEST_TOKEN } = await server.ssrLoadModule('/src/identity/devTestIdentity.ts');
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          const b = Buffer.from(chunk); bytes += b.length;
          if (bytes > FISHING_DECK.requestBodyBytes) { res.statusCode = 413; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end('{"error":"Fishing ticket request is too large."}'); return; }
          chunks.push(b);
        }
        const origin = 'http://localhost'; // fixed TEST ID origin, including phones opening the LAN URL
        req.headers.origin = origin;
        (req as typeof req & { body?: unknown }).body = Buffer.concat(chunks).toString('utf8');
        const handler = createFishingDeckHandler({ env: {
          ECONOMY_API: 'on', LOGIN_ALLOWED_ORIGINS: origin, ...policy,
        } }, { readControl: async () => true,
          verifyToken: async (token: string) => {
          if (token !== DEV_TEST_TOKEN) throw new Error('not the dev test token');
          return { uid: DEV_TEST_ADDRESS, walletSignedInAt: Date.now() - 1000, walletLoginOrigin: origin };
        } });
        await handler(req, res);
      });
    },
  };
}
