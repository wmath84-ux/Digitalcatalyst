import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const cache = path.resolve('node_modules/.cache/game-world-navigation');
fs.mkdirSync(cache, { recursive: true });
const out = path.join(cache, 'launcher.cjs');
buildSync({ entryPoints: ['src/lib/gameWorld.ts'], bundle: true, format: 'cjs', platform: 'node', outfile: out, define: { 'import.meta.env.BASE_URL': '"/"' } });
const { openGameWorld, gameWorldUrl } = require(out);

for (const device of ['desktop', 'tablet', 'phone']) test(`${device}: Game navigates without a mounted host or dialog API`, () => {
  const saved = new Map();
  const visits = [];
  globalThis.window = {
    sessionStorage: { setItem: (key, value) => saved.set(key, value) },
    location: { pathname: '/', search: '', hash: '#/home', assign: (url) => visits.push(url) },
  };
  openGameWorld();
  assert.deepEqual(visits, ['/game-world/index.html?scene=world&nogate=1']);
  assert.equal(saved.get('dc:game:return-to'), '/#/home');
});

test('blocked storage cannot prevent Game from opening', () => {
  let destination;
  globalThis.window = {
    sessionStorage: { setItem() { throw new Error('blocked'); } },
    location: { pathname: '/', search: '', hash: '#/store', assign(url) { destination = url; } },
  };
  openGameWorld();
  assert.equal(destination, gameWorldUrl());
});

const html = fs.readFileSync('vendor/threejs-world/index.html', 'utf8');
const controls = html.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const [saved, expected] of [
  ['/#/store/purchases', 'https://learning.example/#/store/purchases'],
  ['https://untrusted.example/', 'https://learning.example/#/home'],
  ['/game-world/index.html', 'https://learning.example/#/home'],
]) test(`standalone Back link safely handles return target ${saved}`, () => {
  const dom = new JSDOM(html, { url: 'https://learning.example/game-world/index.html', runScripts: 'outside-only' });
  dom.window.sessionStorage.setItem('dc:game:return-to', saved);
  dom.window.eval(controls);
  assert.equal(dom.window.document.getElementById('world-back').href, expected);
  dom.window.close();
});

test('bundle download failure is visible without a running engine', () => {
  const dom = new JSDOM(html, { url: 'https://learning.example/game-world/index.html', runScripts: 'outside-only' });
  dom.window.eval(controls);
  const script = dom.window.document.querySelector('script[type="module"]');
  script.dispatchEvent(new dom.window.Event('error'));
  assert.match(dom.window.document.getElementById('boot-msg').textContent, /Game files could not load/);
  assert.ok(dom.window.document.getElementById('world-back'));
  assert.ok(dom.window.document.getElementById('world-retry'));
  dom.window.close();
});


test('offline service worker keeps game navigation separate from the app-shell fallback', async () => {
  const handlers = {};
  runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://learning.example' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    URL, Response,
    fetch: async () => { throw new Error('offline'); },
    caches: { match: async () => new Response('cached learning app') },
  });
  const navigate = async (url) => {
    let response;
    handlers.fetch({ request: { mode: 'navigate', url }, respondWith(promise) { response = promise; } });
    return await response;
  };
  const game = await navigate('https://learning.example/game-world/index.html');
  assert.equal(game.status, 503);
  assert.match(await game.text(), /Game needs a connection/);
  const app = await navigate('https://learning.example/');
  assert.equal(await app.text(), 'cached learning app');
});
