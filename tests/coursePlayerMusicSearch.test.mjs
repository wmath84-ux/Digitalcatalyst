// The YouTube search path, exercised as real code with a stubbed network.
//
// Option A from the Music hand-off: `VITE_YOUTUBE_API_KEY` (build) →
// `window.__DC_YOUTUBE_API_KEY__` (serve time) → `localStorage` (the owner's
// own override). This file proves the three sources, the request the Data API
// actually receives, how results become library rows, and that a broken key,
// an exhausted quota or no key at all never breaks the pane.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://learn.example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const store = dom.window.localStorage;

const cache = new Map();

/** Transpile + run a repo source file, resolving its relative imports. */
function load(file) {
  const resolved = path.resolve(file);
  if (cache.has(resolved)) return cache.get(resolved);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const resolve = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(resolved), id);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
      }
      throw new Error(`cannot resolve ${id} from ${resolved}`);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
  cache.set(resolved, mod.exports);
  return mod.exports;
}

const search = load('src/course/musicSearch.ts');

/* ── a stubbed network ───────────────────────────────────────────────────── */

let calls = [];
let responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });

const installFetch = () => {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (url) => {
      calls.push(String(url));
      return Promise.resolve(responder());
    },
  });
};

/** A whole-video payload shaped exactly like the Data API's. */
const video = (id, title, channel) => ({ id: { videoId: id }, snippet: { title, channelTitle: channel } });

const resetWorld = () => {
  calls = [];
  responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
  installFetch();
  store.clear();
  delete globalThis.__DC_YOUTUBE_API_KEY__;
};

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === 'MessagePort') handle.unref?.();
  }
});

/* ── the key: three sources, one order ───────────────────────────────────── */

test('no key anywhere means no key — and no request is made', async () => {
  resetWorld();
  assert.equal(search.youTubeSearchKey(), '');
  assert.equal(search.youTubeSearchAvailable(), false);
  assert.deepEqual(await search.searchYouTube('arijit singh'), []);
  assert.deepEqual(calls, [], 'without a key YouTube must not be called at all');
});

test('the build-time constant, the injected global and the local override all work, in that order', () => {
  resetWorld();
  store.setItem(search.MUSIC_YOUTUBE_KEY_STORAGE, 'local-key');
  assert.equal(search.youTubeSearchKey(), 'local-key');

  globalThis.__DC_YOUTUBE_API_KEY__ = 'injected-key';
  assert.equal(search.youTubeSearchKey(), 'injected-key', 'a served global beats the local override');

  delete globalThis.__DC_YOUTUBE_API_KEY__;
  assert.equal(search.youTubeSearchKey(), 'local-key');

  // Whitespace is not a key.
  store.setItem(search.MUSIC_YOUTUBE_KEY_STORAGE, '   ');
  assert.equal(search.youTubeSearchKey(), '');
  assert.equal(search.youTubeSearchAvailable(), false);

  // And the un-substituted HTML placeholder is not one either — a build with
  // no .env value must not start sending "%VITE_YOUTUBE_API_KEY%" to Google.
  globalThis.__DC_YOUTUBE_API_KEY__ = '%VITE_YOUTUBE_API_KEY%';
  assert.equal(search.youTubeSearchKey(), '');
  assert.equal(search.youTubeSearchAvailable(), false);
  delete globalThis.__DC_YOUTUBE_API_KEY__;
});

test('storage that refuses reads never breaks the search', () => {
  resetWorld();
  const real = Object.getOwnPropertyDescriptor(dom.window, 'localStorage');
  Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  assert.equal(search.youTubeSearchKey(), '');
  assert.equal(search.youTubeSearchAvailable(), false);
  Object.defineProperty(dom.window, 'localStorage', { configurable: true, value: real.value });
});

test('a key appearing (or clearing) is announced live, and unsubscribes cleanly', () => {
  resetWorld();
  let notifications = 0;
  const off = search.subscribeYouTubeKey(() => { notifications += 1; });
  dom.window.dispatchEvent(new dom.window.Event(search.MUSIC_YOUTUBE_KEY_EVENT));
  assert.equal(notifications, 1);
  dom.window.dispatchEvent(new dom.window.Event('storage'));
  assert.equal(notifications, 2);
  off();
  dom.window.dispatchEvent(new dom.window.Event(search.MUSIC_YOUTUBE_KEY_EVENT));
  assert.equal(notifications, 2, 'after unsubscribe nothing fires');
});

/* ── the request ─────────────────────────────────────────────────────────── */

test('the request is the official Data API search — nothing else', async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'test-key';
  await search.searchYouTube('  arijit singh songs  ');
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/youtube/v3/search');
  assert.equal(url.searchParams.get('part'), 'snippet');
  assert.equal(url.searchParams.get('type'), 'video');
  assert.equal(url.searchParams.get('maxResults'), '12');
  assert.equal(url.searchParams.get('q'), 'arijit singh songs');
  assert.equal(url.searchParams.get('key'), 'test-key');
  // No other endpoint, and no page scrape.
  assert.doesNotMatch(calls[0], /youtube\.com\/results|googlevideo/);
});

test('results become library rows that play in the same embed the lessons use', async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'test-key';
  responder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [
        video('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley'),
        video('9bZkp7q19f0', 'GANGNAM STYLE', 'officialpsy'),
      ],
    }),
  });
  const rows = await search.searchYouTube('koi bhi gaana');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].provider, 'youtube');
  assert.equal(rows[0].source, 'link');
  assert.equal(rows[0].title, 'Never Gonna Give You Up');
  assert.equal(rows[0].subtitle, 'Rick Astley');
  assert.equal(rows[0].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(
    rows[0].embedUrl,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&enablejsapi=1',
  );
  // The same video twice (a search and a paste) is ONE row — the id is stable.
  assert.equal(rows[0].id, load('src/course/musicLibrary.ts').parseMusicLink('https://youtu.be/dQw4w9WgXcQ').id);
});

test('malformed rows are dropped, never rendered as dead buttons', async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'test-key';
  responder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [
        video('dQw4w9WgXcQ', 'Real video', 'Channel'),
        { id: { videoId: 'tooshort' }, snippet: { title: 'Bad id' } },
        { id: { kind: 'youtube#channel', channelId: 'UC123' }, snippet: { title: 'A channel' } },
        { snippet: { title: 'No id at all' } },
        null,
        video('9bZkp7q19f0', '', ''),
      ],
    }),
  });
  const rows = await search.searchYouTube('x');
  assert.deepEqual(rows.map((row) => row.url), [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=9bZkp7q19f0',
  ]);
  // An empty title falls back, and an empty channel becomes the platform's name.
  assert.equal(rows[1].title, 'YouTube video');
  assert.equal(rows[1].subtitle, 'YouTube');
});

test('a refused or broken search is an empty list — never a throw', async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'test-key';
  responder = () => ({ ok: false, status: 403, json: () => Promise.resolve({ error: { code: 403 } }) });
  assert.deepEqual(await search.searchYouTube('x'), [], 'quota exhausted');
  responder = () => ({ ok: true, json: () => Promise.reject(new Error('bad json')) });
  assert.deepEqual(await search.searchYouTube('x'), [],
    'a body that is not JSON');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, writable: true, value: () => Promise.reject(new Error('offline')),
  });
  assert.deepEqual(await search.searchYouTube('x'), [], 'offline');
  // A blank query is not a request either.
  calls = [];
  assert.deepEqual(await search.searchYouTube('   '), []);
  assert.deepEqual(calls, []);
});

/* ── the hand-off and the oEmbed title ───────────────────────────────────── */

test('the no-key hand-off is a plain YouTube search URL', () => {
  resetWorld();
  assert.equal(search.youTubeSearchUrl('arijit singh'), 'https://www.youtube.com/results?search_query=arijit%20singh');
  assert.equal(search.youTubeSearchUrl('  '), 'https://www.youtube.com/results?search_query=');
});

test('the oEmbed lookup asks the platform itself for the real name', async () => {
  resetWorld();
  const lib = load('src/course/musicLibrary.ts');
  const youTube = lib.parseMusicLink('https://youtu.be/dQw4w9WgXcQ');
  const cloud = lib.parseMusicLink('https://soundcloud.com/artist/song');
  const spotify = lib.parseMusicLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  const file = lib.parseMusicLink('https://cdn.test/song.mp3');
  assert.match(search.musicOEmbedUrl(youTube), /^https:\/\/www\.youtube\.com\/oembed\?format=json&url=/);
  assert.match(search.musicOEmbedUrl(cloud), /^https:\/\/soundcloud\.com\/oembed\?format=json&url=/);
  assert.match(search.musicOEmbedUrl(spotify), /^https:\/\/open\.spotify\.com\/oembed\?url=/);
  assert.equal(search.musicOEmbedUrl(file), '', 'a direct file needs no lookup');

  responder = () => ({ ok: true, json: () => Promise.resolve({ title: 'Never Gonna Give You Up', author_name: 'Rick Astley' }) });
  assert.equal(await search.resolveMusicTitle(youTube), 'Never Gonna Give You Up');
  assert.equal(await search.resolveMusicTitle(file), '', 'and asks nothing for a file');
  assert.equal(calls.length, 1);
  responder = () => ({ ok: false, json: () => Promise.resolve({}) });
  assert.equal(await search.resolveMusicTitle(youTube), '');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, writable: true, value: () => Promise.reject(new Error('offline')),
  });
  assert.equal(await search.resolveMusicTitle(youTube), '');
});
