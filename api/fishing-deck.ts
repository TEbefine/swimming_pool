import { createFishingDeckHandler } from '../server/fishing/deck.js';
import { adminServices } from '../server/identity/admin.js';
export const config = { regions: ['sin1'] };
export default createFishingDeckHandler({ env: process.env }, { verifyToken: token => adminServices.verifyToken(token) });
