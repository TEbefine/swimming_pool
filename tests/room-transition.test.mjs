import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStory } from '../src/components/roomTransition/prepareStory.ts';
import { pickStory, TRANSITION_STORIES } from '../src/components/roomTransition/stories.ts';

test('selects only the destination and avoids repeating when another story exists', () => {
  const first = TRANSITION_STORIES[0];
  const second = { ...first, id: 'second' };
  const other = { ...first, id: 'other', roomId: 'poolside' };
  assert.equal(pickStory([first, second, other], 'cafe', first.id, () => 0).id, 'second');
  assert.equal(pickStory([first, second, other], 'poolside', undefined, () => 0).id, 'other');
  assert.equal(pickStory([first], 'cafe', first.id, () => 0).id, first.id);
  assert.equal(pickStory([first], 'unknown', undefined, () => 0), null);
});


test('a prepared scene reuses two decoded images and failed or cancelled art falls back', async () => {
  const instances = [];
  class FakeImage {
    complete = false;
    set src(value) { this.source = value; }
    removeAttribute() { this.source = ''; }
    async decode() {}
  }
  const make = () => { const image = new FakeImage(); instances.push(image); return image; };
  const controller = new AbortController();
  const pending = prepareStory(TRANSITION_STORIES[0], controller.signal, make);
  assert.equal(instances.length, 2);
  instances.forEach(image => image.onload());
  const result = await pending;
  assert.equal(result.background, instances[0]);
  assert.equal(result.character, instances[1]);
  const failed = prepareStory(TRANSITION_STORIES[0], controller.signal, make);
  instances[2].onerror();
  assert.equal(await failed, null);
  assert.equal(instances[3].source, '');
  const cancel = new AbortController();
  const cancelled = prepareStory(TRANSITION_STORIES[0], cancel.signal, make);
  cancel.abort();
  assert.equal(await cancelled, null);
  assert.equal(instances[4].source, '');
  assert.equal(instances[5].source, '');
});
