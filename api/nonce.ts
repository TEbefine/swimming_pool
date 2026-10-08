import { createNonceHandler } from '../server/identity/handlers.ts';
export default createNonceHandler({ env: process.env });
