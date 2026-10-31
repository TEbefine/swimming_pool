import { createFishingDeckHandler } from '../server/fishing/deck.js';
import { saveServices } from '../server/saves/admin.js';
import { adminServices } from '../server/identity/admin.js';
export const config = { regions: ['sin1'] };
export default createFishingDeckHandler({ env: process.env }, { readControl: saveServices.readControl, verifyToken: token => adminServices.verifyToken(token) });
