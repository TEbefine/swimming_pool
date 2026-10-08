import { createLoginHandler } from '../server/identity/handlers.ts';
import { adminServices } from '../server/identity/admin.ts';
export default createLoginHandler({ env: process.env }, adminServices);
