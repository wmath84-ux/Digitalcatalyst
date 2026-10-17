// tests/coursePlayerQuotaResetHandover.test.mjs
//
// "QUOTA DAILY RESET HOTA HAI — TO Jaise hi user ka quota reset ho, wapas
//  user ke configuration par shift ho jaaye automatically" (owner,
// 2026-10-17).
//
// The learner's own YouTube / Google key has a DAILY budget. When it is
// spent, the MASTER's configuration takes over so the search never breaks —
// but that handover is a PAUSE, not a switch: Google's daily reset comes on
// its own, and the learner's own configuration must come back with it, by
// itself, with nothing to press.
//
// This file proves the whole curve, for both engines:
//   own key first → quota gone → the master takes over → the pause is
//   remembered → the daily reset comes → the own key is back on its own.
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

const music = load('src/course/musicSearch.ts');
const google = load('src/course/googleSearch.ts');
const handover = load('src/course/searchQuotaHandover.ts');

/* ── a stubbed network + a clock we can move ────────────────────────────── */

let calls = [];
let responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
let now = Date.parse('2026-10-17T12:00:00Z');
const realNow = Date.now;
Date.now = () => now;

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

const quotaError = () => ({
  ok: false,
  status: 403,
  json: () => Promise.resolve({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }),
});

const resetWorld = () => {
  calls = [];
  responder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
  installFetch();
  store.clear();
  delete globalThis.__DC_YOUTUBE_API_KEY__;
  delete globalThis.__DC_GOOGLE_SEARCH_API_KEY__;
  delete globalThis.__DC_GOOGLE_SEARCH_CX__;
  now = Date.parse('2026-10-17T12:00:00Z');
};

after(() => {
  Date.now = realNow;
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === 'MessagePort') handle.unref?.();
  }
});

/* ── the reset moment ───────────────────────────────────────────────────── */

test("the daily reset is the next midnight in Google's own reset timezone", () => {
  resetWorld();
  const reset = handover.dailyQuotaResetAt(now);
  assert.ok(reset > now, 'the reset is always in the future');
  // Pacific midnight: the reset lands on 00:00 Pacific time.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: handover.QUOTA_RESET_TIME_ZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(reset));
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  assert.equal(value('hour') % 24, 0, 'the reset is at midnight');
  assert.equal(value('minute'), 0, 'the reset is on the hour');
  // …and it is never more than a day away.
  assert.ok(reset - now <= 26 * 60 * 60 * 1000, 'the reset is within a day');
});

test('the pause is remembered per account, and forgotten the moment it is over', () => {
  resetWorld();
  assert.equal(handover.ownQuotaExhausted('youtube', 'learner-1'), false, 'nothing is paused to begin with');

  const reset = handover.markOwnQuotaExhausted('youtube', 'learner-1');
  assert.ok(reset > now, 'the pause ends at the daily reset');
  assert.equal(handover.ownQuotaExhausted('youtube', 'learner-1'), true, 'the quota is spent');
  assert.equal(handover.ownQuotaExhausted('youtube', 'learner-2'), false, 'another account is not affected');

  // The daily reset comes: the quota is back, and the memory is dropped.
  now = reset + 1000;
  assert.equal(handover.ownQuotaExhausted('youtube', 'learner-1'), false, 'the reset brought the quota back');
  assert.equal(handover.ownQuotaResetAt('youtube', 'learner-1'), 0, 'and the pause is forgotten');
});

/* ── YouTube: the whole curve ───────────────────────────────────────────── */

test("YouTube: the own key first, the master on a dead quota, and the own key back after the reset", async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'owner-key';
  store.setItem(music.MUSIC_YOUTUBE_KEY_STORAGE, 'learner-key');

  // 1 · the learner's own key goes first.
  const plan = music.youTubeSearchPlan();
  assert.equal(plan.key, 'learner-key');
  assert.equal(plan.origin, 'own');
  assert.equal(plan.handover, 'owner-key', 'the master is the background handover');

  // 2 · the quota is gone → the master takes over, silently.
  responder = () => {
    const key = new URL(calls[calls.length - 1]).searchParams.get('key');
    if (key === 'learner-key') return quotaError();
    return { ok: true, json: () => Promise.resolve({ items: [] }) };
  };
  const outcome = await music.searchYouTubeOutcome('koi bhi gaana');
  assert.equal(outcome.error, null, 'the learner sees no error');
  assert.equal(outcome.usedFallback, true, "the master's key took over");
  assert.equal(calls.length, 2, 'the very same query was re-sent with the master key');

  // 3 · the pause is remembered: the master leads until the reset.
  const paused = music.youTubeSearchPlan();
  assert.equal(paused.key, 'owner-key', 'the master is in charge while the quota is spent');
  assert.equal(paused.origin, 'master');
  calls = [];
  await music.searchYouTubeOutcome('phir se');
  assert.equal(calls.length, 1, 'the spent key is not asked again');
  assert.equal(new URL(calls[0]).searchParams.get('key'), 'owner-key');

  // 4 · the daily reset comes: the learner's own key is back, on its own.
  now = handover.dailyQuotaResetAt(now) + 1000;
  const restored = music.youTubeSearchPlan();
  assert.equal(restored.key, 'learner-key', 'the own key is back — nobody pressed anything');
  assert.equal(restored.origin, 'own');
  calls = [];
  await music.searchYouTubeOutcome('phir se');
  assert.equal(new URL(calls[0]).searchParams.get('key'), 'learner-key', 'the own key is tried first again');
});

test("YouTube: a NEW key is a fresh budget — the old pause is dropped", async () => {
  resetWorld();
  globalThis.__DC_YOUTUBE_API_KEY__ = 'owner-key';
  store.setItem(music.MUSIC_YOUTUBE_KEY_STORAGE, 'learner-key');
  responder = () => {
    const key = new URL(calls[calls.length - 1]).searchParams.get('key');
    if (key === 'learner-key') return quotaError();
    return { ok: true, json: () => Promise.resolve({ items: [] }) };
  };
  await music.searchYouTubeOutcome('gaana');
  assert.equal(handover.ownQuotaExhausted('youtube'), true, 'the quota is spent');

  music.saveYouTubeKey('fresh-key');
  assert.equal(handover.ownQuotaExhausted('youtube'), false, 'a new key starts with a fresh daily budget');
  assert.equal(music.youTubeSearchPlan().key, 'fresh-key');
});

/* ── Google: the same curve ─────────────────────────────────────────────── */

test('Google: the own configuration first, the master on a dead quota, the own one back after the reset', async () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');

  const plan = google.googleSearchPlan();
  assert.equal(plan.apiKey, 'learner-key');
  assert.equal(plan.origin, 'own');
  assert.equal(plan.handover.apiKey, 'owner-key');

  responder = () => {
    const key = new URL(calls[calls.length - 1]).searchParams.get('key');
    if (key === 'learner-key') return quotaError();
    return { ok: true, json: () => Promise.resolve({ items: [] }) };
  };
  const outcome = await google.searchGoogleOutcome('kuch bhi');
  assert.equal(outcome.error, null, 'the learner sees no error');
  assert.equal(outcome.usedFallback, true, "the master's configuration took over");
  assert.equal(calls.length, 2, 'the very same query was re-sent');

  const paused = google.googleSearchPlan();
  assert.equal(paused.apiKey, 'owner-key', 'the master is in charge while the quota is spent');
  assert.equal(paused.origin, 'master');

  now = handover.dailyQuotaResetAt(now) + 1000;
  const restored = google.googleSearchPlan();
  assert.equal(restored.apiKey, 'learner-key', 'the own configuration is back — nobody pressed anything');
  assert.equal(restored.origin, 'own');
});

test('Google: a NEW configuration is a fresh budget — the old pause is dropped', () => {
  resetWorld();
  globalThis.__DC_GOOGLE_SEARCH_API_KEY__ = 'owner-key';
  globalThis.__DC_GOOGLE_SEARCH_CX__ = 'owner-cx';
  store.setItem(google.GOOGLE_SEARCH_KEY_STORAGE, 'learner-key');
  store.setItem(google.GOOGLE_SEARCH_CX_STORAGE, 'learner-cx');
  handover.markOwnQuotaExhausted('google');
  assert.equal(handover.ownQuotaExhausted('google'), true);
  google.saveGoogleSearchConfig('fresh-key', 'fresh-cx');
  assert.equal(handover.ownQuotaExhausted('google'), false, 'a new configuration starts fresh');
});
