import { createItemsHandler } from '../server/saves/handlers.js';
import { saveServices } from '../server/saves/admin.js';
export const config = { regions: ['sin1'] };
export default createItemsHandler({ env: process.env }, saveServices);
