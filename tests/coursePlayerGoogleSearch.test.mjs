// The Course Player's GOOGLE search, exercised as real code with a stubbed
// network.
//
// The bargain this file proves: the LEARNER's own configuration wins over the
// owner's build-time one (so the school is never billed), the request is
// Google's official Custom Search JSON API and nothing else, and every
// refusal says WHY instead of looking like "no results".
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
    // googleSearch.ts can also send a query through the app's OWN server
    // (/api/google-search) — the path that survives an API key's website
    // restriction. The real apiBase reads `import.meta.env` and walks several
    // origins, which this CJS harness cannot evaluate; a pass-through to the
    // stubbed global fetch keeps that path observable in `calls`.
    if (id.endsWith('utils/apiBase')) {
      return {
        apiFetch: (url, init) => globalThis.fetch(url, init),
        apiUrl: (path) => path,
        isNativeShell: () => false,
      };
    }
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

const google = load('src/course/googleSearch.ts');

/* ── a stubbed network ───────────────────────────────────────────────────── */

let calls = [];
let responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });

const installFetch = () => {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    // A responder can look at the URL and the init: the cascade below sends
    // the same query to two DIFFERENT places (Google, and the app's own
    // /api/google-search), and a test has to be able to answer each.
    value: (url, init) => {
      calls.push(String(url));
      return Promise.resolve().then(() => responder(String(url), init));
    },
  });
};

const isProxyCall = (url) => String(url).includes('/api/google-search');

/** The proxy's own success envelope, as api/_lib/googleSearchProxy.ts sends it. */
const proxyOk = (items) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve({ ok: true, via: 'server', keyOwner: 'own', payload: { items } }),
});

/** A static host answering the SPA's HTML — the route is not deployed there. */
const proxyHtml = () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'text/html; charset=utf-8' },
  json: () => Promise.reject(new Error('not json')),
  text: () => Promise.resolve('<!doctype html><title>App</title>'),
});

/** A whole-web payload shaped exactly like the Custom Search API's. */
const page = (link, title, snippet) => ({
  title,
  link,
  snippet,
  displayLink: link.replace(/^https?:\/\//, '').split('/')[0],
  pagemap: {
    cse_image: [{ src: `https://example.test/${title}.png` }],
    metatags: [{ 'og:site_name': 'Example Site' }],
  },
});

const resetWorld = () => {
  calls = [];
  responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
  installFetch();
  store.clear();
  delete globalThis.__DC_GOOGLE_SEARCH_API_KEY__;
  delete globalThis.__DC_GOOGLE_SEARCH_CX__;
  // The module remembers which keys the BROWSER path was refused for, so the
  // next search goes through the server first. Each case starts clean.
  google.resetGoogleSearchPathMemory?.();
};

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === 'MessagePort') handle.unref?.();
  }
});

/* ── the configuration: whose key is it? ─────────────────────────────────── */

test('no configuration anywhere means no search — and no request at all', async () => {
  resetWorld();
  assert.equal(google.googleSearchAvailable(), false);
  assert.deepEqual(await google.searchGoogle('anything'), []);
  assert.deepEqual(calls, [], 'without a configuration Google must not be called');
});

test("the learner's own configuration beats the owner's, and belongs to that account", () => {
  resetWorld();
  // The owner's shared configuration — the one that would burn the school's
  // quota.
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  assert.deepEqual(google.googleSearchConfig(), { apiKey: 'owner-key', cx: 'owner-cx' });
  assert.equal(google.googleSearchAvailable(), true);
  assert.equal(google.googleSearchOwnerConfigured(), true);

  // The learner brings their own — it wins, so the school pays nothing.
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'device-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'device-cx');
  assert.deepEqual(google.googleSearchConfig(), { apiKey: 'device-key', cx: 'device-cx' });
  assert.equal(google.googleSearchOwnerConfigured(), false);

  // A signed-in learner's ACCOUNT slot beats the device slot — and no other
  // account inherits it.
  store.setItem(google.googleSearchUserKeyStorage('learner-1'), 'account-key');
  store.setItem(google.googleSearchUserCxStorage('learner-1'), 'account-cx');
  assert.deepEqual(google.googleSearchConfig('learner-1'), { apiKey: 'account-key', cx: 'account-cx' });
  assert.deepEqual(google.googleSearchConfig('learner-2'), { apiKey: 'device-key', cx: 'device-cx' });
});

test('saving and removing a configuration is per account, and it announces itself', () => {
  resetWorld();
  let notifications = 0;
  const off = google.subscribeGoogleSearchConfig(() => { notifications += 1; });

  assert.equal(google.saveGoogleSearchConfig('my-key', 'my-cx', 'learner-1'), true);
  assert.equal(notifications, 1, 'the page is told at once');
  assert.deepEqual(google.googleSearchConfig('learner-1'), { apiKey: 'my-key', cx: 'my-cx' });
  assert.equal(store.getItem(google.googleSearchUserKeyStorage('learner-1')), 'my-key');

  // A half-filled configuration is refused — both values are needed.
  assert.equal(google.saveGoogleSearchConfig('only-a-key', '', 'learner-2'), false);

  google.clearGoogleSearchConfig('learner-1');
  assert.equal(store.getItem(google.googleSearchUserKeyStorage('learner-1')), null);
  off();
});

/* ── the request ─────────────────────────────────────────────────────────── */

test('the request is the official Custom Search API — nothing else', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'test-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'test-cx');
  await google.searchGoogle('  neural networks  ');
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/customsearch/v1');
  assert.equal(url.searchParams.get('key'), 'test-key');
  assert.equal(url.searchParams.get('cx'), 'test-cx');
  assert.equal(url.searchParams.get('q'), 'neural networks');
  assert.equal(url.searchParams.get('num'), '10');
  // No page scrape, ever.
  assert.doesNotMatch(calls[0], /google\.com\/search|google\.com\/results/);
});

test('results become web rows that open where they live', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'test-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'test-cx');
  responder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [
        page('https://example.test/one', 'First result', 'A short <b>snippet</b>.'),
        page('https://other.test/two', 'Second result', 'Another one.'),
        { title: 'No link at all' },
        { link: 'not-a-url', title: 'Bad link' },
      ],
    }),
  });
  const rows = await google.searchGoogle('kuch bhi');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'First result');
  assert.equal(rows[0].url, 'https://example.test/one');
  assert.equal(rows[0].displayUrl, 'example.test');
  assert.equal(rows[0].source, 'Example Site');
  assert.equal(rows[0].snippet, 'A short snippet.', 'the markup is stripped');
  assert.equal(rows[0].imageUrl, 'https://example.test/First result.png');
});

test("the learner CHOOSES: their own configuration, or the master's", () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');

  // The default: their own configuration first — the school pays nothing.
  assert.equal(google.googleSearchKeySource(), 'mine');
  assert.deepEqual(google.googleSearchConfig(), { apiKey: 'learner-key', cx: 'learner-cx' });
  assert.equal(google.googleSearchPlan().origin, 'own');

  // The choice in Settings: the school's configuration.
  assert.equal(google.setGoogleSearchSource('master'), true);
  assert.equal(google.googleSearchKeySource(), 'master');
  assert.deepEqual(google.googleSearchConfig(), { apiKey: 'owner-key', cx: 'owner-cx' });
  assert.equal(google.googleSearchPlan().origin, 'master');
  assert.equal(google.googleSearchPlan().handover, null, 'the handover only ever goes own → master');

  // The choice belongs to that account: another learner still has their own.
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  assert.equal(google.setGoogleSearchSource('master', 'learner-1'), true);
  assert.equal(google.googleSearchKeySource('learner-1'), 'master');
  assert.equal(google.googleSearchKeySource('learner-2'), 'mine', 'another account is untouched');
  assert.deepEqual(google.googleSearchConfig('learner-2'), { apiKey: 'learner-key', cx: 'learner-cx' });
});

test('the choice is never a trap: the other configuration keeps the search alive', () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  google.setGoogleSearchSource('master');
  assert.deepEqual(google.googleSearchConfig(), { apiKey: 'owner-key', cx: 'owner-cx' });

  // …and when the school has no configuration, the learner's own keeps the
  // search alive.
  delete globalThis.__DC_GOOGLE_SEARCH_API_KEY__;
  delete globalThis.__DC_GOOGLE_SEARCH_CX__;
  assert.deepEqual(google.googleSearchConfig(), { apiKey: 'learner-key', cx: 'learner-cx' });
  assert.equal(google.googleSearchPlan().origin, 'own');
});

test("the quota handover: the master's configuration takes over and the search just works", async () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = () => {
    // The stub records every call, so the last URL is the one in hand.
    const key = new URL(calls[calls.length - 1]).searchParams.get('key');
    if (key === 'learner-key') {
      return {
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: 403, errors: [{ reason: 'dailyLimitExceeded' }] } }),
      };
    }
    return { ok: true, json: () => Promise.resolve({ items: [page('https://example.test/one', 'First result', 'A snippet.')] }) };
  };

  const outcome = await google.searchGoogleOutcome('neural networks');
  assert.equal(outcome.rows.length, 1, 'the results arrived anyway');
  assert.equal(outcome.error, null, 'and the learner sees no error at all');
  assert.equal(outcome.usedFallback, true, "the master's configuration took over");
  assert.equal(calls.length, 2, 'the very same query was re-sent with the master configuration');
  assert.equal(new URL(calls[0]).searchParams.get('key'), 'learner-key');
  assert.equal(new URL(calls[0]).searchParams.get('cx'), 'learner-cx');
  assert.equal(new URL(calls[1]).searchParams.get('key'), 'owner-key');
  assert.equal(new URL(calls[1]).searchParams.get('cx'), 'owner-cx');
});

test('the handover happens for a dead quota only — and only when there is somebody to hand over to', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = () => ({
    ok: false,
    status: 403,
    json: () => Promise.resolve({ error: { code: 403, errors: [{ reason: 'dailyLimitExceeded' }] } }),
  });
  let outcome = await google.searchGoogleOutcome('x');
  assert.equal(outcome.error, 'quota', 'with no master configuration the honest error stands');
  assert.equal(outcome.usedFallback, undefined);
  assert.equal(calls.length, 1, 'and the request was not repeated');
});

test('every field the API gives is kept — the picture, the file, the date, the count, the time', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'test-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'test-cx');
  responder = () => ({
    ok: true,
    json: () => Promise.resolve({
      searchInformation: {
        totalResults: '1230000',
        formattedTotalResults: '1,230,000',
        searchTime: 0.42,
        formattedSearchTime: '0.42',
      },
      queries: { nextPage: [{ startIndex: 11, title: 'Google search' }] },
      items: [{
        title: 'Attention is all you need',
        link: 'https://arxiv.example.test/pdf/1706.03762',
        displayLink: 'arxiv.example.test',
        snippet: 'A <b>neural</b> network reads the paper.',
        htmlSnippet: 'A <b>neural</b> network reads the paper.',
        mime: 'application/pdf',
        fileFormat: 'PDF',
        pagemap: {
          cse_image: [{ src: 'https://arxiv.example.test/cover.png', width: 400, height: 300 }],
          cse_thumbnail: [{ src: 'https://arxiv.example.test/thumb.png', width: 120, height: 90 }],
          metatags: [{ 'og:site_name': 'arXiv', 'article:published_time': '2017-06-12T00:00:00Z' }],
        },
      }],
    }),
  });
  const outcome = await google.searchGoogleOutcome('attention');
  assert.equal(outcome.rows.length, 1);
  const row = outcome.rows[0];
  assert.equal(row.source, 'arXiv');
  assert.equal(row.imageUrl, 'https://arxiv.example.test/cover.png');
  assert.equal(row.imageWidth, 400);
  assert.equal(row.thumbnailUrl, 'https://arxiv.example.test/thumb.png');
  assert.equal(row.fileFormat, 'PDF');
  assert.equal(row.mime, 'application/pdf');
  assert.equal(row.snippet, 'A neural network reads the paper.');
  assert.equal(row.htmlSnippet, 'A <b>neural</b> network reads the paper.', "Google's own marks are kept");
  assert.match(row.publishedAt, /2017/);
  // The count and the time, in Google's own words.
  assert.equal(outcome.totalResults, '1,230,000');
  assert.equal(outcome.totalTime, '0.42');
  // And the pager: the next page starts where Google says it does.
  assert.equal(outcome.hasNext, true);
  assert.equal(outcome.nextStart, 11);
  assert.equal(outcome.page, 1);
  assert.equal(outcome.hasPrevious, false);
});

test("the page of results is Google's own index, and the Images tab asks for images", async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'test-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'test-cx');

  await google.searchGoogleOutcome('neural', undefined, null, { start: 21 });
  const paged = new URL(calls[0]);
  assert.equal(paged.searchParams.get('start'), '21', "Google's own pagination index");
  assert.equal(paged.searchParams.get('num'), '10');

  await google.searchGoogleOutcome('neural', undefined, null, { type: 'image' });
  const images = new URL(calls[1]);
  assert.equal(images.searchParams.get('searchType'), 'image');

  // The start index never runs past Google's own limit.
  await google.searchGoogleOutcome('neural', undefined, null, { start: 999 });
  assert.equal(new URL(calls[2]).searchParams.get('start'), '91');
});

test('a refused search says WHY — and never throws', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'test-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'test-cx');
  const googleError = (code, reason, message) => ({
    ok: false,
    status: code,
    json: () => Promise.resolve({ error: { code, message, errors: [{ reason }] } }),
  });

  responder = () => googleError(403, 'keyInvalid', 'API key not valid');
  assert.equal((await google.searchGoogleOutcome('x')).error, 'invalid-key');

  responder = () => googleError(403, 'dailyLimitExceeded', 'Daily Limit Exceeded');
  assert.equal((await google.searchGoogleOutcome('x')).error, 'quota');

  responder = () => googleError(403, 'forbidden', 'The request cannot be satisfied because it was made from a disallowed referrer.');
  assert.equal((await google.searchGoogleOutcome('x')).error, 'referrer');

  responder = () => googleError(403, 'accessNotConfigured', 'Custom Search API has not been used in project 1 before or it is disabled');
  assert.equal((await google.searchGoogleOutcome('x')).error, 'api-disabled');

  responder = () => googleError(400, 'invalid', 'Invalid value for parameter \'cx\'');
  assert.equal((await google.searchGoogleOutcome('x')).error, 'invalid-cx');

  // The plain rows are unchanged: a failure is still an empty list.
  assert.deepEqual(await google.searchGoogle('x'), []);
});

test('testing a configuration is cheap and honest', async () => {
  resetWorld();
  responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
  const good = await google.testGoogleSearchConfig('test-key', 'test-cx');
  assert.equal(good.ok, true);
  const url = new URL(calls[0]);
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/customsearch/v1');
  assert.equal(url.searchParams.get('num'), '1', 'one result is enough to prove it works');
  assert.equal(url.searchParams.get('key'), 'test-key');
  assert.equal(url.searchParams.get('cx'), 'test-cx');

  responder = () => ({ ok: false, status: 403, json: () => Promise.resolve({ error: { errors: [{ reason: 'dailyLimitExceeded' }] } }) });
  const bad = await google.testGoogleSearchConfig('test-key', 'test-cx');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'quota');
  assert.ok(bad.message.length > 0);

  // A half-filled configuration is never even sent.
  calls = [];
  assert.equal((await google.testGoogleSearchConfig('test-key', '')).code, 'no-config');
  assert.deepEqual(calls, []);
});

test('the no-configuration hand-off is a plain Google search URL', () => {
  resetWorld();
  assert.equal(google.googleSearchUrl('ai agents'), 'https://www.google.com/search?q=ai%20agents');
  assert.equal(google.googleSearchUrl('  '), 'https://www.google.com/search?q=');
});

/* ── the cascade: the search simply works, and says which path answered ──── */

test("a referrer-blocked browser search is re-sent through the app's own server — and the results arrive", async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = (url, init) => {
    if (isProxyCall(url)) {
      // The key travels in the POST body, never in a query string.
      assert.equal(init?.method, 'POST');
      assert.doesNotMatch(url, /key=/);
      assert.equal(JSON.parse(init.body).key, 'learner-key');
      return proxyOk([page('https://example.test/one', 'First result', 'A snippet.')]);
    }
    return {
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({
        error: { code: 403, message: 'Requests from referer "https://localhost/" are blocked.', errors: [{ reason: 'ipRefererBlocked' }] },
      }),
    };
  };

  const outcome = await google.searchGoogleOutcome('mimosa pudica');
  assert.equal(outcome.error, null, 'the learner sees no error at all');
  assert.equal(outcome.rows.length, 1, 'the results arrived');
  assert.equal(outcome.via, 'server', 'through the app server');
  assert.equal(outcome.keyFingerprint, google.googleKeyFingerprint('learner-key'), 'the page can say WHICH key answered');
  assert.equal(outcome.attempts.length, 2, 'both paths are recorded');
  assert.match(outcome.attempts[0], /^browser /);
  assert.match(outcome.attempts[1], /^server /);
});

test('once a key is refused in the browser, the next search goes to the server first', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = (url) => (isProxyCall(url)
    ? proxyOk([page('https://example.test/two', 'Second result', 'Another.')])
    : {
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: { code: 403, message: 'Requests from referer "x" are blocked.', errors: [{ reason: 'ipRefererBlocked' }] } }),
      });

  await google.searchGoogleOutcome('first');
  calls = [];
  const second = await google.searchGoogleOutcome('second');
  assert.equal(second.rows.length, 1);
  assert.equal(isProxyCall(calls[0]), true, 'the wasted 403 is not repeated');
  assert.equal(calls.length, 1, 'one request, straight to the path that works');

  // A success on the browser path clears the memory again.
  google.resetGoogleSearchPathMemory();
});

test('when the server route is not deployed, the browser’s own honest error stands', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = (url) => (isProxyCall(url)
    ? proxyHtml()
    : {
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: { code: 403, message: 'Requests from IP address "203.0.113.4" are blocked.', errors: [{ reason: 'ipRefererBlocked' }] } }),
      });

  const outcome = await google.searchGoogleOutcome('x');
  assert.equal(outcome.error, 'ip-blocked', 'the precise cause, not a generic "referrer"');
  assert.match(outcome.googleMessage, /IP address/);
  assert.equal(outcome.googleStatus, 403);
  google.resetGoogleSearchPathMemory();
});

test('a key that is simply wrong hands the search to the other configuration', async () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = (url) => {
    const key = new URL(url).searchParams.get('key');
    if (key === 'learner-key') {
      return {
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: { code: 403, message: 'API key not valid', errors: [{ reason: 'keyInvalid' }] } }),
      };
    }
    return { ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ items: [page('https://example.test/three', 'Third', 'Snippet.')] }) };
  };

  const outcome = await google.searchGoogleOutcome('x');
  assert.equal(outcome.error, null);
  assert.equal(outcome.rows.length, 1);
  assert.equal(outcome.usedFallback, true, "the school's configuration took over");
  assert.equal(outcome.keyOwner, 'master');
});

/* ── which key is actually in effect ─────────────────────────────────────── */

test('the report names the key in effect and the slot it came from', () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key-abcdef';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.googleSearchUserKeyStorage('learner-1'), 'account-key-xyz');
  store.setItem(google.googleSearchUserCxStorage('learner-1'), 'account-cx');
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'device-key-123');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'device-cx');

  // The account slot wins over the device slot…
  const own = google.googleSearchConfigReport('learner-1');
  assert.equal(own.slot, 'account');
  assert.equal(own.origin, 'own');
  assert.equal(own.fingerprint, google.googleKeyFingerprint('account-key-xyz'));
  assert.equal(own.handover?.fingerprint, google.googleKeyFingerprint('owner-key-abcdef'));
  assert.equal(own.handover?.slot, 'build');

  // …another account falls back to the device slot…
  assert.equal(google.googleSearchConfigReport('learner-2').slot, 'device');

  // …and choosing the school's key says so plainly.
  google.setGoogleSearchSource('master', 'learner-1');
  const master = google.googleSearchConfigReport('learner-1');
  assert.equal(master.slot, 'build');
  assert.equal(master.origin, 'master');
  assert.equal(master.handover, null);
});

test('the diagnosis says which path works, in Google’s own words', async () => {
  resetWorld();
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  responder = (url) => (isProxyCall(url)
    ? { ok: true, status: 200, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ ok: true, via: 'server', keyOwner: 'own', payload: { items: [] } }) }
    : {
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: { code: 403, message: 'Requests from referer "https://localhost/" are blocked.', errors: [{ reason: 'ipRefererBlocked' }] } }),
      });

  const report = await google.diagnoseGoogleSearch();
  assert.equal(report.direct.ok, false);
  assert.equal(report.direct.code, 'referrer');
  assert.match(report.direct.googleMessage, /blocked/);
  assert.equal(report.server.ok, true);
  assert.equal(report.usable, true, 'the search can still run');
  assert.match(report.verdict, /Server path se search chalu hai/);
  assert.ok(report.steps.length > 0, 'and the fix is spelled out');
  assert.match(report.steps.join(' '), /Application restrictions/);
  assert.equal(report.config.fingerprint, google.googleKeyFingerprint('learner-key'));
  google.resetGoogleSearchPathMemory();
});
