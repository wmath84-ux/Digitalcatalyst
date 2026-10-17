// tests/googleSearchProxy.test.mjs
//
// The Google search SERVER path — `/api/google-search`, the fix for "Google ne
// request rok di".
//
// What this suite proves:
//
//   1. The request that reaches Google carries NO Origin and NO Referer, which
//      is the entire point: a key's "HTTP referrers (websites)" restriction has
//      nothing to match against, so the APK, the PWA, localhost and every
//      preview domain work without a single Google Cloud change.
//   2. The learner's own key travels in the POST BODY, is forwarded, and is
//      never echoed back or written to a header.
//   3. With no learner key, the deployment's own server-side key is used — and
//      when there is none, the answer is an honest 501, not a silent failure.
//   4. Google's own status / reason / message come back verbatim, so the page
//      can stop guessing which 403 it met.
//   5. The school's key is rate-limited per caller; a learner's own key is not
//      (that quota is Google's business, not ours).
//   6. The route really is wired: vercel.json rewrites it onto the shared
//      function (the Hobby 12-function cap) and the dispatcher answers it.

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGoogleSearchUrl,
  clampGoogleProxyInput,
  classifyGoogleProxyError,
  handleGoogleSearch,
  resetGoogleProxyLimiter,
  runGoogleProxySearch,
  serverGoogleSearchAvailable,
  takeServerKeyToken,
} from "../api/_lib/googleSearchProxy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

let calls = [];
let responder = () => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ items: [] })) });

const installFetch = () => {
  globalThis.fetch = (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Promise.resolve().then(() => responder(url, init));
  };
};

const resetWorld = () => {
  calls = [];
  responder = () => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ items: [] })) });
  installFetch();
  resetGoogleProxyLimiter();
  delete process.env.GOOGLE_SEARCH_API_KEY;
  delete process.env.GOOGLE_SEARCH_CX;
  delete process.env.GOOGLE_CSE_API_KEY;
  delete process.env.GOOGLE_CSE_CX;
};

/** A minimal Vercel-shaped response recorder. */
const makeRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[String(name).toLowerCase()] = value;
      return res;
    },
    json(payload) {
      res.body = payload;
    },
    end(payload) {
      res.body = payload;
    },
  };
  return res;
};

const googleError = (status, reason, message) => ({
  ok: false,
  status,
  text: () => Promise.resolve(JSON.stringify({ error: { code: status, message, errors: [{ reason }] } })),
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

/* ── the request Google receives ─────────────────────────────────────────── */

test("the forwarded request carries no Origin and no Referer — that IS the fix", async () => {
  resetWorld();
  const res = makeRes();
  await handleGoogleSearch(
    {
      method: "POST",
      body: { q: "Mimosa pudica", key: "learner-key", cx: "learner-cx" },
      // The learner's browser sent both; the function must not pass them on.
      headers: { origin: "capacitor://localhost", referer: "https://localhost/" },
    },
    res,
  );

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://www.googleapis.com/customsearch/v1");
  assert.equal(url.searchParams.get("key"), "learner-key");
  assert.equal(url.searchParams.get("cx"), "learner-cx");
  assert.equal(url.searchParams.get("q"), "Mimosa pudica");
  assert.equal(url.searchParams.get("num"), "10");
  const headers = calls[0].init.headers || {};
  assert.equal(headers.origin, undefined, "no Origin reaches Google");
  assert.equal(headers.referer, undefined, "no Referer reaches Google");

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.via, "server");
  assert.equal(res.body.keyOwner, "own");
  // The key is never handed back to the caller.
  assert.doesNotMatch(JSON.stringify(res.body), /learner-key/);
  assert.equal(res.headers["cache-control"], "no-store", "a keyed answer is never cached");
});

test("Google's own refusal comes back verbatim, classified", async () => {
  resetWorld();
  responder = () => googleError(403, "ipRefererBlocked", 'Requests from referer "https://localhost/" are blocked.');
  const res = makeRes();
  await handleGoogleSearch({ method: "POST", body: { q: "x", key: "k", cx: "c" } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, "referrer");
  assert.equal(res.body.googleStatus, 403);
  assert.equal(res.body.googleReason, "ipRefererBlocked");
  assert.match(res.body.googleMessage, /Requests from referer/);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("the classifier tells an IP restriction, a referrer restriction and an API restriction apart", () => {
  assert.equal(
    classifyGoogleProxyError(403, { error: { message: 'Requests from referer "https://a.test/" are blocked.', errors: [{ reason: "ipRefererBlocked" }] } }).code,
    "referrer",
  );
  assert.equal(
    classifyGoogleProxyError(403, { error: { message: 'Requests from IP address "1.2.3.4" are blocked.', errors: [{ reason: "ipRefererBlocked" }] } }).code,
    "ip-blocked",
  );
  assert.equal(
    classifyGoogleProxyError(403, { error: { message: "Permission denied.", errors: [{ reason: "forbidden" }], status: "PERMISSION_DENIED" } }).code,
    "permission",
  );
  assert.equal(
    classifyGoogleProxyError(403, { error: { message: "Access Not Configured. Custom Search API has not been used in project 1 before or is disabled.", errors: [{ reason: "accessNotConfigured" }] } }).code,
    "api-disabled",
  );
  assert.equal(
    classifyGoogleProxyError(403, { error: { message: "Daily Limit Exceeded", errors: [{ reason: "dailyLimitExceeded" }] } }).code,
    "quota",
  );
  assert.equal(
    classifyGoogleProxyError(400, { error: { message: "Invalid Value for parameter 'cx'", errors: [{ reason: "invalid" }] } }).code,
    "invalid-cx",
  );
});

/* ── whose key is it ─────────────────────────────────────────────────────── */

test("with no learner key the deployment's own server-side key answers", async () => {
  resetWorld();
  process.env.GOOGLE_SEARCH_API_KEY = "server-key";
  process.env.GOOGLE_SEARCH_CX = "server-cx";
  assert.equal(serverGoogleSearchAvailable(), true);

  const res = makeRes();
  await handleGoogleSearch({ method: "GET", query: { q: "photosynthesis" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.keyOwner, "server");
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("key"), "server-key");
  assert.equal(url.searchParams.get("cx"), "server-cx");
});

test("without any configuration the answer is an honest 501, not a silent failure", async () => {
  resetWorld();
  assert.equal(serverGoogleSearchAvailable(), false);
  const res = makeRes();
  await handleGoogleSearch({ method: "GET", query: { q: "photosynthesis" } }, res);

  assert.equal(res.statusCode, 501);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, "no-config");
  assert.match(res.body.error, /GOOGLE_SEARCH_API_KEY/);
  assert.equal(calls.length, 0, "Google was never asked");
});

test("an empty query is refused before anything is sent", async () => {
  resetWorld();
  const res = makeRes();
  await handleGoogleSearch({ method: "POST", body: { q: "   ", key: "k", cx: "c" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("the key never travels in a query string from the browser, only in the body", async () => {
  resetWorld();
  process.env.GOOGLE_SEARCH_API_KEY = "server-key";
  process.env.GOOGLE_SEARCH_CX = "server-cx";
  const res = makeRes();
  // A GET may not carry a learner key: it would land in logs and cache keys.
  await handleGoogleSearch({ method: "GET", query: { q: "x", key: "leaked-key", cx: "leaked-cx" } }, res);
  const url = new URL(calls[0].url);
  assert.notEqual(url.searchParams.get("key"), "leaked-key");
  assert.equal(url.searchParams.get("key"), "server-key");
});

/* ── abuse guards ────────────────────────────────────────────────────────── */

test("the school's key is rate-limited per caller; a learner's own key is not", async () => {
  resetWorld();
  process.env.GOOGLE_SEARCH_API_KEY = "server-key";
  process.env.GOOGLE_SEARCH_CX = "server-cx";
  const headers = { "x-vercel-forwarded-for": "203.0.113.7" };

  let limited = 0;
  for (let index = 0; index < 20; index += 1) {
    const res = makeRes();
    await handleGoogleSearch({ method: "GET", query: { q: "x" }, headers }, res);
    if (res.statusCode === 429) limited += 1;
  }
  assert.ok(limited > 0, "the bucket empties and starts answering 429");
  assert.ok(limited < 20, "…after real requests were served");

  // Another caller has its own bucket.
  const other = makeRes();
  await handleGoogleSearch({ method: "GET", query: { q: "x" }, headers: { "x-vercel-forwarded-for": "198.51.100.9" } }, other);
  assert.equal(other.statusCode, 200);

  // A learner bringing their own key is never limited here.
  resetGoogleProxyLimiter();
  for (let index = 0; index < 20; index += 1) {
    const res = makeRes();
    await handleGoogleSearch({ method: "POST", body: { q: "x", key: "own-key", cx: "own-cx" }, headers }, res);
    assert.equal(res.statusCode, 200);
  }
  assert.equal(takeServerKeyToken("fresh-caller"), true);
});

test("inputs are clamped to Google's own limits", () => {
  assert.deepEqual(clampGoogleProxyInput({ q: "  a   b  ", start: 999, type: "image" }), { q: "a b", start: 91, type: "image" });
  assert.deepEqual(clampGoogleProxyInput({ q: "x", start: -5 }), { q: "x", start: 1, type: "web" });
  assert.equal(clampGoogleProxyInput({ q: "y".repeat(5000) }).q.length, 400);
  assert.match(buildGoogleSearchUrl("k", "c", "q", 21, "image"), /searchType=image/);
  assert.match(buildGoogleSearchUrl("k", "c", "q", 21, "image"), /[?&]start=21/);
});

test("a slow Google is a timeout, not a hang", async () => {
  resetWorld();
  globalThis.fetch = () => new Promise((_resolve, reject) => {
    const error = new Error("aborted");
    error.name = "AbortError";
    setTimeout(() => reject(error), 5);
  });
  const outcome = await runGoogleProxySearch({ q: "x", apiKey: "k", cx: "c" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "timeout");
});

/* ── the wiring ──────────────────────────────────────────────────────────── */

test("the route rides the shared serverless function and the dev server", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const rewrite = vercel.rewrites.find((entry) => entry.source === "/api/google-search");
  assert.ok(rewrite, "vercel.json must rewrite /api/google-search");
  assert.equal(rewrite.destination, "/api/referral-leaderboard?route=google-search");

  const router = fs.readFileSync(path.join(root, "api/referral-leaderboard.ts"), "utf8");
  assert.match(router, /import \{ handleGoogleSearch \} from "\.\/_lib\/googleSearchProxy\.js";/);
  assert.match(router, /"google-search",/);
  assert.match(router, /route === "google-search"/);

  const vite = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
  assert.match(vite, /server\.middlewares\.use\("\/api\/google-search"/, "local dev serves the same handler");
  assert.match(vite, /GOOGLE_SEARCH_API_KEY/, "and reads the server-side key from .env");
});
