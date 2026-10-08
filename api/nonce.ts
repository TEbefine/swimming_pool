import { createNonceHandler } from '../server/identity/handlers.js';
export const config = { regions: ['sin1'] };
export default createNonceHandler({ env: process.env });
