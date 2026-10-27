import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TRANSITION_STORIES } from '../src/components/roomTransition/stories.ts';

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

test('café startup composes the supplied reader, café, garden and ambient layers', () => {
  const html = render();
  for (const layer of ['sun', 'cafe', 'garden', 'leaves', 'steam', 'bird', 'leaf', 'spark']) {
    assert.match(html, new RegExp(`${layer}-v1.webp`));
  }
  assert.doesNotMatch(html, /barista_stand|meadow.webp/);
});
test('automatic entry has a truthful readiness message and no extra enter button', () => {
  const html = render({ ready: true, automatic: true });
  assert.match(html, /The café is ready/);
  assert.doesNotMatch(html, /<button|Press SPACE|cfl-progress/);
});
test('startup keeps the selected variant instead of reverting to the first catalogue entry', () => {
  const html = render({ story: { ...TRANSITION_STORIES[0], id: 'another-reading-scene', character: '/ui/loading/another-sun.webp', line: 'Another small chapter.' } });
  assert.match(html, /another-sun.webp/);
  assert.match(html, /Another small chapter/);
  assert.doesNotMatch(html, /sun-v1.webp/);
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
