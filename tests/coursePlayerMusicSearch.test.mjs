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
const video = (id, title, channel) => ({
  id: { videoId: id },
  snippet: {
    title,
    channelTitle: channel,
    thumbnails: {
      default: { url: `https://i.ytimg.com/vi/${id}/default.jpg` },
      medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
      high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
    },
  },
});

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

  // The OWNER's key is the FALLBACK: a learner who brings their own key
  // always wins, because that is what keeps the school out of the quota
  // bill (the owner's key is the one that would be billed).
  globalThis.__DC_YOUTUBE_API_KEY__ = 'injected-key';
  assert.equal(search.youTubeSearchKey(), 'local-key',
    "the learner's own key beats the owner's served key");

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

test("the learner's own key wins over the owner's — and belongs to that account", () => {
  resetWorld();
  // The owner's shared key: the one that would burn the school's quota.
  globalThis.__DC_YOUTUBE_API_KEY__ = 'owner-key';
  assert.equal(search.youTubeSearchKey(), 'owner-key');

  // The learner brings their own key — it wins, so the school pays nothing.
  store.setItem(search.MUSIC_YOUTUBE_KEY_STORAGE, 'learner-key');
  assert.equal(search.youTubeSearchKey(), 'learner-key',
    "the learner's own key beats the owner's");
  assert.equal(search.youTubeSearchAvailable(), true);

  // A signed-in learner's ACCOUNT slot beats the device slot too — and no
  // other account inherits it.
  store.setItem(search.musicYouTubeUserKeyStorage('learner-1'), 'account-key');
  assert.equal(search.youTubeSearchKey('learner-1'), 'account-key');
  assert.equal(search.ownYouTubeKey('learner-1'), 'account-key');
  assert.equal(search.youTubeSearchKey('learner-2'), 'learner-key',
    'another account never inherits this one\'s key');
});

test('saving and removing a key is per account, and it announces itself', () => {
  resetWorld();
  let notifications = 0;
  const off = search.subscribeYouTubeKey(() => { notifications += 1; });

  assert.equal(search.saveYouTubeKey('my-key', 'learner-1'), true);
  assert.equal(notifications, 1, 'the pane is told at once');
  assert.equal(search.youTubeSearchKey('learner-1'), 'my-key');
  assert.equal(store.getItem(search.musicYouTubeUserKeyStorage('learner-1')), 'my-key');

  // No account signed in → the device-wide slot.
  assert.equal(search.saveYouTubeKey('device-key'), true);
  assert.equal(store.getItem(search.MUSIC_YOUTUBE_KEY_STORAGE), 'device-key');

  // Removing the account key leaves the device fallback in place.
  search.clearYouTubeKey('learner-1');
  assert.equal(search.youTubeSearchKey('learner-1'), 'device-key');
  search.clearYouTubeKey();
  assert.equal(search.youTubeSearchKey(), '');
  off();
});

test('removing a key removes the one that is actually in effect', () => {
  resetWorld();
  store.setItem(search.MUSIC_YOUTUBE_KEY_STORAGE, 'device-key');
  store.setItem(search.musicYouTubeUserKeyStorage('learner-1'), 'account-key');

  assert.equal(search.ownYouTubeKeySlot('learner-1'), search.musicYouTubeUserKeyStorage('learner-1'),
    "this account's own key");
  assert.equal(search.ownYouTubeKeySlot('learner-2'), search.MUSIC_YOUTUBE_KEY_STORAGE,
    'another account only has the device one');

  // Removing the ACCOUNT key leaves the device fallback in place.
  search.clearYouTubeKey('learner-1');
  assert.equal(search.youTubeSearchKey('learner-1'), 'device-key');

  // With only the device key, removing THAT is what disconnects.
  search.clearYouTubeKey();
  assert.equal(search.youTubeSearchKey(), '');
});

test('a refused search says WHY it failed — and never throws', async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'test-key';
  const googleError = (code, reason, message) => ({
    ok: false,
    status: code,
    json: () => Promise.resolve({ error: { code, message, errors: [{ reason }] } }),
  });

  responder = () => googleError(403, 'keyInvalid', 'Invalid key');
  let outcome = await search.searchYouTubeOutcome('x');
  assert.deepEqual(outcome.rows, []);
  assert.equal(outcome.error, 'invalid-key');
  assert.ok(outcome.message.length > 0, 'every failure carries a sentence');

  responder = () => googleError(403, 'accessNotConfigured', 'YouTube Data API has not been used in project 1');
  assert.equal((await search.searchYouTubeOutcome('x')).error, 'api-disabled');

  responder = () => googleError(403, 'quotaExceeded', 'Quota exceeded for quota metric');
  assert.equal((await search.searchYouTubeOutcome('x')).error, 'quota');

  responder = () => googleError(403, 'forbidden', 'The request cannot be satisfied because it was made from a disallowed referrer.');
  assert.equal((await search.searchYouTubeOutcome('x')).error, 'referrer');

  // The plain rows are unchanged: a failure is still an empty list.
  assert.deepEqual(await search.searchYouTube('x'), []);
});

test('testing a key costs one unit and names the real problem', async () => {
  resetWorld();
  responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
  const good = await search.testYouTubeKey('test-key');
  assert.equal(good.ok, true);
  const url = new URL(calls[0]);
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/youtube/v3/videos',
    'the cheapest call the Data API offers — one quota unit');
  assert.equal(url.searchParams.get('key'), 'test-key');

  responder = () => ({ ok: false, status: 403, json: () => Promise.resolve({ error: { errors: [{ reason: 'quotaExceeded' }] } }) });
  const bad = await search.testYouTubeKey('test-key');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'quota');
  assert.ok(bad.message.length > 0);
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
  assert.equal(rows[0].thumbnailUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
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
  assert.equal(rows[1].thumbnailUrl, 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg');
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
