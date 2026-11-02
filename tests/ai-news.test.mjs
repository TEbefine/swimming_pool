// AI News NPCs: feed parsers (saved samples, no network), Gemini output checks, the full job with
// fake fetch/Gemini/Firestore, and the game-side doc reader + dialog builder.
import './register-api-ts.mjs';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// src/ uses Vite's extensionless imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const ts = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(ts)) return nextResolve(ts.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const shape = await import('../src/game/content/aiNewsShape.ts');
const feeds = await import('../server/aiNews/feeds.ts');
const compose = await import('../server/aiNews/compose.ts');
const handler = await import('../server/aiNews/handler.ts');
const client = await import('../src/game/content/aiNewsNpcs.ts');

const fx = (name) => readFileSync(new URL(`./fixtures/ai-news/${name}`, import.meta.url), 'utf8');
const NOW = new Date('2026-11-02T03:00:00Z'); // 10:00 in Bangkok, Nov 2

test('page fitting: 24 letters × 2 rows', () => {
  assert.equal(shape.fitsPage('Quiet day at Google, young friend.'), true);
  assert.equal(shape.fitsPage('x'.repeat(49)), false);
  assert.equal(shape.fitsPage('Google just launched *Gemini 4 Flash* today!'), true);
  assert.equal(shape.fitsPage('unbalanced *mark'), false);
  assert.equal(shape.fitsPage(''), false);
  const pages = shape.toPages('Gemini 4 Flash is rolling out today in the Gemini app and AI Studio for everyone who wants to try it out', 2);
  assert.equal(pages.length, 2);
  assert.ok(pages.every(shape.fitsRows), JSON.stringify(pages));
  assert.ok(pages[1].endsWith('…'));
  assert.deepEqual(shape.toPages('Short headline', 2), ['Short headline']);
  assert.equal(shape.bangkokDate(new Date('2026-11-02T18:00:00Z')), '2026-11-03');
  assert.equal(shape.shortDate('2026-11-02T20:00:00Z'), 'Nov 3');
});

test('whitelist', () => {
  for (const ok of ['https://blog.google/x', 'https://www.blog.google/x', 'https://deepmind.google/a', 'https://developers.googleblog.com/en/a', 'https://firebase.google.com/blog', 'https://openai.com/index/a', 'https://www.anthropic.com/news/a', 'https://claude.com/blog/a'])
    assert.equal(shape.isWhitelisted(ok), true, ok);
  for (const bad of ['http://openai.com/a', 'https://openai.com.evil.io/a', 'https://evilopenai.com/a', 'https://google.com/a', 'javascript:alert(1)', 'not a url'])
    assert.equal(shape.isWhitelisted(bad), false, bad);
});

test('RSS parser: real Anthropic community feed', () => {
  const items = feeds.parseFeed(fx('anthropic-olshansk.xml'), 'anthropic', 'olshansk');
  assert.equal(items.length, 12);
  assert.equal(items[0].title, 'AI for Science expands to foundations and research institutions');
  assert.equal(items[0].url, 'https://www.anthropic.com/news/ai-for-science-expands-foundations-research-institutions');
  assert.equal(items[0].publishedAt, '2026-10-28T00:00:00.000Z');
  assert.ok(items[0].summary.startsWith('We’re highlighting 20'));
});

test('HTML parser: real anthropic.com/news page', () => {
  const items = feeds.parseAnthropicNewsHtml(fx('anthropic-news.html'));
  assert.ok(items.length >= 10, `got ${items.length}`);
  const sci = items.find((i) => i.url.endsWith('/news/ai-for-science-expands-foundations-research-institutions'));
  assert.ok(sci);
  assert.equal(sci.title, 'AI for Science expands to foundations and research institutions');
  assert.equal(sci.publishedAt, '2026-10-28T00:00:00.000Z');
  assert.ok(!items.some((i) => /\/news\/(announcements|policy|product)$/.test(i.url)), 'category links are not articles');
  assert.ok(items.every((i) => shape.isWhitelisted(i.url) && !Number.isNaN(Date.parse(i.publishedAt))));
});

test('RSS/Atom parser: CDATA, entities, Atom alternate link', () => {
  const g = feeds.parseFeed(fx('google-blog.xml'), 'google', 'blog');
  assert.equal(g[0].title, 'Gemini 4 Flash: our fastest model yet');
  assert.equal(g[0].summary, 'Gemini 4 Flash is rolling out today in the Gemini app & AI Studio.');
  const a = feeds.parseFeed(fx('google-developers-atom.xml'), 'google', 'dev');
  assert.equal(a.length, 1);
  assert.equal(a[0].title, 'Try the new Gemini API "Live" mode');
  assert.equal(a[0].url, 'https://developers.googleblog.com/en/gemini-api-live-mode/');
  assert.equal(a[0].publishedAt, '2026-11-01T20:00:00.000Z');
  assert.equal(a[0].summary, 'Developers can try Live mode today.');
});

test('filter: whitelist + 48 h + not told before today', () => {
  const items = feeds.parseFeed(fx('google-blog.xml'), 'google', 'blog');
  const told = new Set([feeds.normalizeUrl('https://www.blog.google/products/gemini/students-free-ai-pro')]);
  const kept = feeds.filterItems(items, NOW, told).map((i) => i.title);
  assert.deepEqual(kept, ['Gemini 4 Flash: our fastest model yet', 'Our new office in Bangkok']);
});

const items = feeds.parseFeed(fx('google-blog.xml'), 'google', 'blog').slice(0, 3);
const good = {
  hasNews: true, url: items[0].url,
  hook: 'Google just dropped *Gemini 4 Flash*!',
  more: ['It is rolling out in the Gemini app today.'],
  mini: 'Oh, and students get AI Pro free!', miniUrl: items[1].url,
  why: ['Ask it to quiz you on any lesson, young friend.'],
};

test('Gemini output is checked in code', () => {
  const v = compose.validateOutput(good, items);
  assert.equal(v.hasNews, true);
  assert.equal(v.usedTemplate, false);
  assert.equal(v.source.url, items[0].url);
  assert.equal(v.source.domain, 'blog.google');
  assert.equal(v.mini, good.mini);
  assert.equal(compose.validateOutput({ hasNews: false }, items), 'quiet');
  assert.equal(compose.validateOutput({ ...good, url: 'https://blog.google/made-up/' }, items), null, 'url must be an input url');
  // Same article with www / no trailing slash / query is accepted; the source keeps the item's real url.
  for (const variant of ['https://www.blog.google/technology/google-deepmind/gemini-4-flash', 'https://blog.google/technology/google-deepmind/gemini-4-flash/?utm=x', ' https://BLOG.google/technology/google-deepmind/gemini-4-flash/ ']) {
    const v2 = compose.validateOutput({ ...good, url: variant }, items);
    assert.ok(v2, variant);
    assert.equal(v2.source.url, 'https://blog.google/technology/google-deepmind/gemini-4-flash/');
  }
  assert.equal(compose.validateOutput({ ...good, url: 'https://blog.google/technology/google-deepmind/gemini-4' }, items), null, 'a different path is not the same article');
  assert.equal(compose.validateOutput({ ...good, hook: 'x'.repeat(49) }, items), null, 'hook ≤ 48');
  assert.equal(compose.validateOutput({ ...good, more: ['a', 'b', 'c'] }, items), null, '≤ 2 pages');
  assert.equal(compose.validateOutput({ ...good, more: ['One page here.', 'Two pages here.'] }, items), null, 'more + mini ≤ 2 pages');
  assert.equal(compose.validateOutput({ ...good, more: ['One page here.', 'Two pages here.'], mini: '' }, items).more.length, 2);
  assert.equal(compose.validateOutput({ ...good, hook: 'We just launched Gemini 4!' }, items), null, 'fans, not the company');
  assert.equal(compose.validateOutput({ ...good, why: [] }, items), null);
  assert.equal(compose.validateOutput({ ...good, miniUrl: items[0].url }, items).mini, undefined, 'mini about the same item is dropped');
  assert.equal(compose.validateOutput('nope', items), null);
});

test('template fallback skips company business', () => {
  const t = compose.templateNews('tycoon', items);
  assert.equal(t.hook, 'Hot news from Google, young friend!');
  assert.deepEqual(t.more, ['Gemini 4 Flash: our fastest model yet']);
  assert.equal(t.usedTemplate, true);
  assert.equal(compose.templateNews('nova', items).hook, 'OpenAI dropped something new.');
  assert.equal(compose.templateNews('clara', items).hook, 'Anthropic shared something new.');
  for (const npc of ['tycoon', 'nova', 'clara']) assert.ok(shape.fitsRows(compose.templateNews(npc, items).hook), npc);
  assert.equal(compose.templateNews('tycoon', [items[2]]), null, 'office news is not worth telling');
  assert.ok(shape.fitsPage(compose.templateNews('nova', items).hook));
  assert.match(compose.buildPrompt('nova', items), /never "We launched/);
});

// ---- the whole job, no network ----
const FIXTURE_BY_URL = {
  'https://www.blog.google/rss/': 'google-blog.xml',
  'https://developers.googleblog.com/feeds/posts/default?alt=rss': 'google-developers-atom.xml',
  'https://openai.com/news/rss.xml': 'openai-news.xml',
  'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml': 'anthropic-olshansk.xml',
  'https://www.anthropic.com/news': 'anthropic-news.html',
};
function fakeFetch({ gemini, failAnthropicRss = false, finishReason = 'STOP' } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push(url);
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      assert.ok(init.headers['x-goog-api-key']);
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.equal(body.generationConfig.maxOutputTokens, 4096);
      assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
      const prompt = body.contents[0].parts[0].text;
      const out = gemini(prompt);
      if (out instanceof Error) throw out;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text: 'thinking…', thought: true }, { text: typeof out === 'string' ? out : JSON.stringify(out) }] } }] }) };
    }
    if (url === 'https://deepmind.google/blog/rss.xml') { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }
    if (failAnthropicRss && url.includes('Olshansk')) return { ok: false, status: 503, text: async () => '' };
    const name = FIXTURE_BY_URL[url];
    if (!name) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, status: 200, text: async () => fx(name) };
  };
  f.calls = calls;
  return f;
}
function memoryStore() {
  const db = { aiNews: {}, aiNewsTest: {}, meta: {} };
  return {
    db,
    store: (production) => ({
      readSeen: async () => db.meta[production ? 'seen' : 'seenTest'] ?? [],
      write: async (doc, seen) => {
        const c = production ? db.aiNews : db.aiNewsTest;
        c.today = structuredClone(doc); c[doc.date] = structuredClone(doc);
        db.meta[production ? 'seen' : 'seenTest'] = structuredClone(seen);
      },
    }),
  };
}
const geminiByCompany = (prompt) => {
  if (prompt.includes('CHARACTER: Sir Ledger')) return good;
  if (prompt.includes('Nova')) return { hasNews: true, url: 'https://openai.com/index/introducing-gpt-6-mini/', hook: 'GPT-6 mini just landed.', more: ['Now in ChatGPT for all users.'], why: ['Use it to check your English.'], mini: '', miniUrl: '' };
  return { hasNews: false, url: '', hook: '', more: [], why: [], mini: '', miniUrl: '' };
};
const res = () => ({ statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } });

test('auth: admin key, cron bearer, else 401', async () => {
  const env = { NEWS_ADMIN_KEY: 'admin-test-key', CRON_SECRET: 'cron-test-secret' };
  assert.equal(handler.authorized({ query: { key: 'admin-test-key' }, headers: {} }, env), true);
  assert.equal(handler.authorized({ url: '/api/ai-news?key=admin-test-key', headers: {} }, env), true);
  assert.equal(handler.authorized({ headers: { 'x-news-key': 'admin-test-key' } }, env), true);
  assert.equal(handler.authorized({ headers: { authorization: 'Bearer cron-test-secret' } }, env), true);
  assert.equal(handler.authorized({ query: { key: 'wrong' }, headers: {} }, env), false);
  assert.equal(handler.authorized({ headers: { authorization: 'Bearer admin-test-key' } }, env), false);
  assert.equal(handler.authorized({ query: { key: '' }, headers: {} }, {}), false, 'unset env never matches');
  assert.equal(handler.authorized({ headers: { authorization: 'Bearer ' } }, {}), false);
  const mem = memoryStore();
  const h = handler.createAiNewsHandler({ env, store: mem.store, fetcher: fakeFetch({ gemini: geminiByCompany }), now: () => NOW });
  const r = res();
  await h({ method: 'GET', query: {}, headers: {} }, r);
  assert.equal(r.statusCode, 401);
  assert.deepEqual(mem.db.aiNewsTest, {}, 'nothing written');
  const r2 = res();
  await h({ method: 'DELETE', headers: {} }, r2);
  assert.equal(r2.statusCode, 405);
});

test('job: preview writes aiNewsTest only; lines, sources, seen list', async () => {
  const mem = memoryStore();
  const fetcher = fakeFetch({ gemini: geminiByCompany });
  const h = handler.createAiNewsHandler({ env: { NEWS_ADMIN_KEY: 'k', GEMINI_API_KEY: 'g', VERCEL_ENV: 'preview' }, store: mem.store, fetcher, now: () => NOW });
  const r = res();
  await h({ method: 'POST', query: { key: 'k' }, headers: {} }, r);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.equal(r.body.env, 'test');
  assert.equal(r.body.model, compose.DEFAULT_GEMINI_MODEL);
  assert.deepEqual(mem.db.aiNews, {}, 'test data never reaches production');
  const doc = mem.db.aiNewsTest.today;
  assert.equal(doc.date, '2026-11-02');
  assert.deepEqual(mem.db.aiNewsTest['2026-11-02'], doc);
  assert.equal(doc.npcs.tycoon.hook, good.hook);
  assert.equal(doc.npcs.tycoon.source.url, items[0].url);
  assert.equal(doc.npcs.tycoon.mini, good.mini);
  assert.equal(doc.npcs.nova.hook, 'GPT-6 mini just landed.');
  assert.equal(doc.npcs.nova.mini, undefined, 'no undefined fields for Firestore');
  assert.equal(doc.npcs.clara.hasNews, false, 'Anthropic posts are older than 48 h');
  assert.equal(doc.status.google.state, 'ok');
  assert.match(doc.status.google.message, /deepmind: timeout/);
  assert.equal(doc.status.openai.state, 'ok');
  assert.equal(doc.status.anthropic.state, 'empty');
  assert.ok(fetcher.calls.includes('https://developers.googleblog.com/rss/') && fetcher.calls.includes('https://developers.googleblog.com/feeds/posts/default?alt=rss'), 'dev blog falls back to the 2nd URL');
  assert.ok(!fetcher.calls.includes('https://www.anthropic.com/news'), 'HTML only when the community feed fails');
  assert.deepEqual(mem.db.meta.seenTest.map((s) => s.u).sort(), ['blog.google/products/gemini/students-free-ai-pro', 'blog.google/technology/google-deepmind/gemini-4-flash', 'openai.com/index/introducing-gpt-6-mini'].sort());
  assert.equal(mem.db.meta.seen, undefined, 'production seen list untouched');

  // UPDATE NOW again the same day: today's told items are still allowed.
  const r2 = res();
  await h({ method: 'POST', query: { key: 'k' }, headers: {} }, r2);
  assert.equal(mem.db.aiNewsTest.today.npcs.tycoon.hasNews, true);
  // Next day: they were told already → skipped.
  const h3 = handler.createAiNewsHandler({ env: { NEWS_ADMIN_KEY: 'k', GEMINI_API_KEY: 'g', VERCEL_ENV: 'preview' }, store: mem.store, fetcher, now: () => new Date('2026-11-02T20:00:00Z') });
  await h3({ method: 'POST', query: { key: 'k' }, headers: {} }, res());
  const next = mem.db.aiNewsTest.today;
  assert.equal(next.date, '2026-11-03');
  assert.notEqual(next.npcs.tycoon.source?.url, items[0].url);
  assert.equal(next.npcs.nova.hasNews, false);
});

test('job: production collections; Gemini failure → headline template; HTML fallback for Anthropic', async () => {
  const mem = memoryStore();
  const fetcher = fakeFetch({ gemini: () => 'not json at all', failAnthropicRss: true });
  const summary = await handler.runAiNews({ env: { GEMINI_API_KEY: 'g', VERCEL_ENV: 'production', GEMINI_MODEL: 'gemini-test-model' }, store: mem.store, fetcher, now: () => new Date('2026-10-29T03:00:00Z') });
  assert.equal(summary.env, 'production');
  assert.equal(summary.model, 'gemini-test-model');
  assert.deepEqual(mem.db.aiNewsTest, {});
  const doc = mem.db.aiNews.today;
  assert.equal(doc.date, '2026-10-29');
  assert.ok(fetcher.calls.includes('https://www.anthropic.com/news'));
  assert.match(doc.status.anthropic.message, /Olshansk.*HTTP 503/);
  // Oct 29: only the Oct 27 Google post is fresh; Gemini failed → headline template
  assert.equal(doc.npcs.tycoon.usedTemplate, true);
  assert.equal(doc.npcs.tycoon.hook, 'Hot news from Google, young friend!');
  assert.deepEqual(doc.npcs.tycoon.more, ['An old post']);
  assert.match(summary.npcs.tycoon.note, /bad JSON/);
  // Anthropic Oct 28 post is fresh; Gemini failed → template, but "AI for Science expands…" is research → quiet
  assert.equal(doc.npcs.clara.usedTemplate, false);
  assert.match(summary.npcs.clara.note, /quiet|template/);
  assert.ok(mem.db.meta.seen !== undefined && mem.db.meta.seenTest === undefined);
});

test('job: Gemini invalid output → template from headline', async () => {
  const mem = memoryStore();
  const bad = () => ({ ...good, url: 'https://blog.google/invented/' });
  await handler.runAiNews({ env: { GEMINI_API_KEY: 'g' }, store: mem.store, fetcher: fakeFetch({ gemini: bad }), now: () => NOW });
  const t = mem.db.aiNewsTest.today.npcs.tycoon;
  assert.equal(t.usedTemplate, true);
  assert.equal(t.hook, 'Hot news from Google, young friend!');
  assert.deepEqual(t.more, ['Gemini 4 Flash: our fastest model yet']);
  const n = mem.db.aiNewsTest.today.npcs.nova;
  assert.equal(n.usedTemplate, true);
  assert.equal(n.hook, 'OpenAI dropped something new.');
  assert.deepEqual(n.more, ['Introducing GPT-6 mini']);
});

test('job: finishReason other than STOP → template, note names the reason', async () => {
  const mem = memoryStore();
  const summary = await handler.runAiNews({ env: { GEMINI_API_KEY: 'g' }, store: mem.store, fetcher: fakeFetch({ gemini: () => '{"hasNews": tr', finishReason: 'MAX_TOKENS' }), now: () => NOW });
  assert.equal(summary.npcs.tycoon.note, 'template (MAX_TOKENS)');
  assert.equal(summary.npcs.tycoon.usedTemplate, true);
  assert.equal(summary.npcs.nova.note, 'template (MAX_TOKENS)');
  // No candidate at all (prompt blocked) is also reported.
  const blocked = async (url, init) => url.startsWith('https://generativelanguage')
    ? { ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }
    : fakeFetch({ gemini: () => good })(url, init);
  const s2 = await handler.runAiNews({ env: { GEMINI_API_KEY: 'g' }, store: memoryStore().store, fetcher: blocked, now: () => NOW });
  assert.equal(s2.npcs.tycoon.note, 'template (BLOCKED_SAFETY)');
});

// ---- game side ----
test('client: Firestore REST decode + only today\'s doc counts', () => {
  const rest = { mapValue: { fields: {
    date: { stringValue: '2026-11-02' },
    npcs: { mapValue: { fields: { tycoon: { mapValue: { fields: {
      hasNews: { booleanValue: true }, hook: { stringValue: 'Hi!' },
      more: { arrayValue: { values: [{ stringValue: 'More.' }] } }, why: { arrayValue: { values: [{ stringValue: 'Why.' }] } },
      usedTemplate: { booleanValue: false }, n: { integerValue: '3' }, nothing: { nullValue: null },
      source: { mapValue: { fields: { url: { stringValue: 'https://blog.google/a/' }, domain: { stringValue: 'blog.google' }, title: { stringValue: 'A' }, publishedAt: { stringValue: '2026-11-02T01:00:00Z' } } } },
    } } } } } },
  } } };
  const doc = client.fromFirestore(rest);
  assert.equal(doc.npcs.tycoon.n, 3);
  assert.equal(client.parseNewsDoc(doc, NOW).tycoon.hook, 'Hi!');
  assert.deepEqual(client.parseNewsDoc(doc, new Date('2026-11-02T18:00:00Z')), {}, 'yesterday\'s doc is never today\'s news');
  assert.deepEqual(client.parseNewsDoc(null, NOW), {});
  const evil = structuredClone(doc); evil.npcs.tycoon.source.url = 'javascript:alert(1)';
  assert.deepEqual(client.parseNewsDoc(evil, NOW), {}, 'non-whitelisted link is dropped');
});

test('client: dialog — news day menu and quiet day fallback', async () => {
  const { dialogues } = await import('../src/game/content/dialogues.ts');
  for (const id of ['tycoon', 'nova', 'clara']) {
    assert.deepEqual(dialogues[id].nodes.greet.choices[0], { label: 'AI NEWS', next: 'news' });
    assert.ok(dialogues[id].nodes.news.lines.every((l) => l.text.includes('{') || shape.fitsPage(l.text)));
  }
  assert.equal(dialogues.tycoon.nodes.news.lines[0].text, 'Quiet day at Google, young friend.');
  assert.equal(dialogues.nova.nodes.news.lines[2].text, '{promptTrick}');
  assert.equal(dialogues.envoy.nodes.greet.choices[0].next, 'news', 'Envoy unchanged');

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  client.setAiNewsCache(null);
  assert.equal(client.withAiNews('tycoon', dialogues.tycoon, NOW), dialogues.tycoon, 'not loaded → quiet day');
  await client.loadAiNewsOnce(NOW);
  const n = compose.validateOutput(good, items);
  client.setAiNewsCache({ tycoon: n }, NOW);
  const s = client.withAiNews('tycoon', dialogues.tycoon, NOW);
  assert.equal(s.nodes.news.lines[0].text, good.hook);
  assert.deepEqual(s.nodes.news.choices.map((c) => c.label), ['TELL ME MORE', 'WHY CARE?', 'SOURCE', 'BYE']);
  assert.deepEqual(s.nodes.news_more.lines.map((l) => l.text), [...good.more, good.mini]);
  assert.deepEqual(s.nodes.news_why.lines.map((l) => l.text), good.why);
  assert.equal(s.nodes.news_source.lines[0].text, 'From blog.google · Nov 1');
  assert.equal(s.nodes.news_source.choices[0].href, items[0].url);
  assert.equal(client.withAiNews('nova', dialogues.nova, NOW), dialogues.nova, 'Nova quiet');
  assert.equal(client.withAiNews('envoy', dialogues.envoy, NOW), dialogues.envoy);
  assert.equal(client.withAiNews('tycoon', dialogues.tycoon, new Date('2026-11-02T18:00:00Z')), dialogues.tycoon, 'after Bangkok midnight → quiet');
  assert.equal(dialogues.tycoon.nodes.news.lines[0].text, 'Quiet day at Google, young friend.', 'base script not mutated');
  await client.loadAiNewsOnce(new Date('2026-11-02T18:00:00Z'));
  client.setAiNewsCache(null);
  globalThis.fetch = realFetch;
});

test('client: no news → re-read at most once per 10 minutes; news found → no more reads', async () => {
  const { dialogues } = await import('../src/game/content/dialogues.ts');
  const realFetch = globalThis.fetch;
  const docJson = (withNews) => ({ fields: {
    date: { stringValue: '2026-11-02' },
    npcs: { mapValue: { fields: withNews ? { tycoon: { mapValue: { fields: {
      hasNews: { booleanValue: true }, hook: { stringValue: 'Gold news, young friend!' },
      more: { arrayValue: { values: [{ stringValue: 'More.' }] } }, why: { arrayValue: { values: [{ stringValue: 'Why.' }] } },
      source: { mapValue: { fields: { url: { stringValue: 'https://blog.google/a/' }, domain: { stringValue: 'blog.google' }, title: { stringValue: 'A' }, publishedAt: { stringValue: '2026-11-02T01:00:00Z' } } } },
    } } } } : {} } },
  } });
  let reads = 0;
  let published = false;
  globalThis.fetch = async (url) => {
    assert.match(url, /firestore\.googleapis\.com\/v1\/projects\/lumen-bay\/databases\/\(default\)\/documents\/aiNewsTest\/today$/);
    reads++;
    return { ok: true, status: 200, json: async () => docJson(published) };
  };
  try {
    client.setAiNewsCache(null);
    const t0 = NOW.getTime();
    const at = (min) => new Date(t0 + min * 60_000);
    await client.loadAiNewsOnce(at(0)); // town load
    assert.equal(reads, 1);
    published = true; // UPDATE NOW pressed after the town loaded
    // Talks within 10 minutes: quiet, no extra reads.
    assert.equal(client.withAiNews('tycoon', dialogues.tycoon, at(1)), dialogues.tycoon);
    await client.loadAiNewsOnce(at(9));
    assert.equal(reads, 1);
    // First talk after 10 minutes: still quiet for THIS talk, but it starts one read...
    assert.equal(client.withAiNews('tycoon', dialogues.tycoon, at(11)), dialogues.tycoon);
    assert.equal(client.withAiNews('tycoon', dialogues.tycoon, at(11)), dialogues.tycoon, 'in-flight read is shared');
    await client.loadAiNewsOnce(at(11));
    assert.equal(reads, 2);
    // ...and the next talk shows the news.
    assert.equal(client.withAiNews('tycoon', dialogues.tycoon, at(12)).nodes.news.lines[0].text, 'Gold news, young friend!');
    // News found: quiet NPCs never trigger more reads, even much later the same day.
    assert.equal(client.withAiNews('nova', dialogues.nova, at(60)), dialogues.nova);
    await client.loadAiNewsOnce(at(120));
    assert.equal(reads, 2);
    // A failed retry after midnight doesn't throw; the old day's news is not shown.
    globalThis.fetch = async () => { reads++; throw new Error('offline'); };
    const tomorrow = new Date('2026-11-02T18:00:00Z');
    assert.equal(client.withAiNews('tycoon', dialogues.tycoon, tomorrow), dialogues.tycoon);
    await client.loadAiNewsOnce(tomorrow);
    assert.equal(reads, 3);
    assert.equal(client.newsFor('tycoon', tomorrow), null);
  } finally {
    client.setAiNewsCache(null);
    globalThis.fetch = realFetch;
  }
});
