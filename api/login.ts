import { createLoginHandler } from '../server/identity/handlers.js';
import { adminServices } from '../server/identity/admin.js';
export const config = { regions: ['sin1'] };
export default createLoginHandler({ env: process.env }, adminServices);
