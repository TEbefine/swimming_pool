import { createAiNewsHandler } from '../server/aiNews/handler.js';
import { newsStore } from '../server/aiNews/admin.js';
export const config = { regions: ['sin1'], maxDuration: 60 };
export default createAiNewsHandler({ env: process.env, store: newsStore });
