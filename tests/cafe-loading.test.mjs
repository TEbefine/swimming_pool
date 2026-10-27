import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const extension of ['.tsx', '.ts']) {
        const url = new URL(specifier + extension, context.parentURL);
        if (existsSync(url)) return next(url.href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText,
    };
    return next(url, context);
  },
});
const { LoadingScene } = await import('../src/components/LoadingScene.tsx');
const props = { roomId: 'cafe', roomName: 'Weekday Chill Café', progress: 32, ready: false, leaving: false, onEnter() {} };
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(LoadingScene, { ...props, ...overrides }));

test('café startup selects photographic Sun and pixel window rather than the meadow barista', () => {
  const html = render();
  assert.match(html, /sun-cup-v2.webp/);
  assert.match(html, /cafe-window-v2.webp/);
  assert.match(html, /train_day.webp/);
  assert.doesNotMatch(html, /barista_stand|meadow.webp/);
});
test('ready café preserves the startup enter prompt and removes the loading bar', () => {
  const html = render({ ready: true, isMobile: true });
  assert.match(html, /Press ◯/);
  assert.match(html, /Enter Weekday Chill Café/);
  assert.doesNotMatch(html, /cfl-progress/);
});
test('other destinations retain their current loading artwork', () => {
  assert.match(render({ roomId: 'poolside' }), /meadow.webp/);
});
