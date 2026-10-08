// Test-only resolution: production Node ESM .js imports refer to TS source during Node's source tests.
// Compiled-API smoke tests run in separate processes without this hook.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
const root = new URL('../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(root) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const emitted = new URL(specifier, context.parentURL);
      const source = new URL(emitted.href.slice(0, -3) + '.ts');
      if (!existsSync(emitted) && existsSync(source)) return nextResolve(source.href, context);
    }
    return nextResolve(specifier, context);
  },
});
