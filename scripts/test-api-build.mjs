// Uses the official Vercel Node production builder. No project pull, credentials or network calls.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { FileFsRef, streamToBuffer } from '@vercel/build-utils';
const require = createRequire(import.meta.url);
const { build } = require('@vercel/node');
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'lumen-api-build-'));
const files = {};
async function collect(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[path] = new FileFsRef({ fsPath: join(root, path) });
  }
}
for (const path of ['api', 'server/identity']) await collect(path);
for (const path of ['package.json', 'tsconfig.json', 'src/identity/loginMessage.ts']) files[path] = new FileFsRef({ fsPath: join(root, path) });
const regionConfig = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
assert.deepEqual(regionConfig.regions, ['sin1']);
assert.deepEqual(regionConfig.functions['api/*.ts'].regions, ['sin1']);
const childProgram = `
import assert from 'node:assert/strict';
const module = await import(process.argv[1]);
assert.equal(typeof module.default, 'function');
assert.deepEqual(module.config.regions, ['sin1']);
const headers = {};
const res = { statusCode: 0, setHeader(k, v) { headers[k] = v; }, end(body) { this.body = body; } };
await module.default({ method: 'GET' }, res);
assert.equal(res.statusCode, 405);
assert.deepEqual(JSON.parse(res.body), { error: 'Use POST to sign in.' });
assert.equal(headers['Cache-Control'], 'no-store');
assert.equal(headers['Allow'], 'POST');
assert.equal(headers['X-Lumen-Function-Region'], 'sin1');
`;
try {
  for (const entrypoint of ['api/nonce.ts', 'api/login.ts']) {
    const diagnostics = [];
    const originalError = console.error;
    console.error = (...args) => { diagnostics.push(args.join(' ')); originalError(...args); };
    let result;
    try { result = await build({ files, entrypoint, workPath: root, repoRootPath: root,
      config: { zeroConfig: true },
      // Keep production compilation/tracing; only skip already-completed installation/download.
      meta: { isDev: false, skipDownload: true, runNpmInstallSet: new Set([join(root, 'package.json')]) },
    }); } finally { console.error = originalError; }
    assert.ok(!diagnostics.some(line => /error TS\d+/.test(line)), `Vercel TypeScript errors: ${diagnostics.join('\n')}`);
    const lambda = result.output;
    assert.deepEqual(lambda.regions, ['sin1'], `${entrypoint}: emitted function must explicitly request Singapore`);
    assert.equal(lambda.runtime, 'nodejs24.x');
    const output = join(temporary, entrypoint.replace(/[/.]/g, '-'));
    for (const [path, file] of Object.entries(lambda.files)) {
      const target = join(output, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await streamToBuffer(await file.toStreamAsync()));
    }
    const emitted = join(output, entrypoint.replace(/\.ts$/, '.js'));
    const source = await readFile(emitted, 'utf8');
    assert.ok(!/from\s+['"][^'"]+\.ts['"]/.test(source), 'Emitted handler must not import TypeScript source');
    // Fresh Node process, isolated traced output, no source-resolution hook or Firebase credentials.
    const env = { ...process.env, VERCEL_REGION: 'sin1' };
    delete env.FIREBASE_SERVICE_ACCOUNT; delete env.NONCE_SECRET; delete env.NODE_OPTIONS;
    const smoke = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram, emitted], { env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(smoke.status, 0, `${entrypoint}: compiled import/GET failed\n${smoke.stderr}`);
    if (entrypoint === 'api/nonce.ts') {
      const broken = source.replace(/(from\s+['"][^'"]+)\.js(['"])/, '$1.ts$2');
      assert.notEqual(broken, source, 'negative fixture must reproduce a .ts runtime import');
      await writeFile(emitted, broken);
      const failure = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram, emitted], { env, encoding: 'utf8', timeout: 30_000 });
      assert.notEqual(failure.status, 0, 'compiled smoke must reject the original broken import');
      assert.match(failure.stderr, /ERR_MODULE_NOT_FOUND/);
    }
    console.log(`PASS: Vercel-built ${entrypoint.replace(/\.ts$/, '.js')} imports and GET returns 405 JSON; emitted region sin1.`);
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
