// src/utils/apiBase.ts contract + runtime coverage.
//
// Background (2026-09-16, "My Study Library couldn't load"): the SPA and the
// API are hosted separately. When the origin the page loads from does not run
// the Vercel serverless functions (DNS moved to static hosting, missing
// production deployment), every /api/* request returns the SPA's index.html
// and the Study Library — plus every other API feature — fails with "Your
// library couldn't be loaded. Please try again.". The client now falls back
// across the known Vercel API origins; these tests pin that contract.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "src/utils/apiBase.ts"), "utf8");
const corsSource = fs.readFileSync(path.join(root, "api/_lib/cors.ts"), "utf8");

/* ── Source contract ──────────────────────────────────────────────────────── */

test("apiBase knows BOTH Vercel production origins (custom domain + default URL)", () => {
  assert.match(source, /eduvora\.shop/);
  assert.match(source, /digitalcatalyst\.vercel\.app/);
  assert.match(source, /VERCEL_DEFAULT_API_ORIGIN\s*=\s*"https:\/\/digitalcatalyst\.vercel\.app"/);
});

test("an HTML answer on an /api/* path means the API is not on that host — fall through to the next origin", () => {
  assert.match(source, /isHtmlResponse/);
  assert.match(source, /text\/html/i);
  // The fallback loop must keep going past HTML answers instead of returning them.
  assert.match(source, /if \(isHtmlResponse\(res\)\) continue;/);
});

test("a network-level failure falls through to the next origin, but an abort never retries", () => {
  assert.match(source, /catch \(error\)/);
  assert.match(source, /AbortError/);
  assert.match(source, /throw error/);
  assert.match(source, /lastError = error/);
});

test("JSON answers — success or error — are final and never retried on another origin", () => {
  // The only `return res` inside the loop must be gated on the NOT-HTML case.
  const loop = source.slice(source.indexOf("for (const candidate of candidates)"), source.indexOf("if (lastResponse) return lastResponse;"));
  const returns = (loop.match(/return res;/g) || []).length;
  assert.equal(returns, 1, "exactly one fast-path return inside the candidate loop");
  assert.doesNotMatch(loop, /status\s*===\s*4|status\s*===\s*5/, "no status-based retries (a JSON error envelope is the real API)");
});

test("non-API paths are never rewritten or retried", () => {
  assert.match(source, /if \(!isApiPath\(input\)\) return fetch\(input, init\);/);
  assert.match(source, /u\.pathname\.startsWith\("\/api\/"\)/);
});

test("local dev never leaks a dev page's /api/* traffic at the production API", () => {
  assert.match(source, /isDevOrigin/);
  assert.match(source, /host === "localhost"/);
});

test("the native shell and Firebase Hosting origins skip same-origin (their /api/* is the device / index.html)", () => {
  assert.match(source, /isNativeShell\(\)/);
  assert.match(source, /\.firebaseapp\.com|\*\/index\.html/);
  assert.match(source, /host\.endsWith\("\.firebaseapp\.com"\) \|\| host\.endsWith\("\.web\.app"\)/);
});

test("CORS accepts the Firebase Hosting SPA origins so the client's cross-origin retry is readable", () => {
  assert.match(corsSource, /"web\.app"/);
  assert.match(corsSource, /"firebaseapp\.com"/);
  assert.match(corsSource, /"eduvora\.shop"/);
  assert.match(corsSource, /"vercel\.app"/);
});

/* ── Runtime behaviour (bundled module, stubbed window + fetch) ───────────── */

const dir = path.join(root, "node_modules/.tmp-api-origin-fallback");
fs.mkdirSync(dir, { recursive: true });
const outfile = path.join(dir, "apiBase.mjs");
await build({
  entryPoints: [path.join(root, "src/utils/apiBase.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});

const html = (page = "<html><body>SPA</body></html>") =>
  new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubWindow({ hostname = "eduvora.shop", origin = `https://${hostname}` } = {}) {
  globalThis.window = {
    location: { hostname, origin, protocol: "https:", href: `${origin}/` },
  };
}
const oldWindow = globalThis.window;
const oldFetch = globalThis.fetch;

let fetchCalls = [];
let fetchImpl = () => Promise.resolve(html());
function setFetch(impl) {
  fetchImpl = impl;
  fetchCalls = [];
  globalThis.fetch = (url, init) => {
    fetchCalls.push(String(url));
    return fetchImpl(String(url), init);
  };
}

after(() => {
  globalThis.window = oldWindow;
  globalThis.fetch = oldFetch;
  fs.rmSync(dir, { recursive: true, force: true });
});

const apiBase = await import(pathToFileURL(outfile).href);

test("healthy same-origin: ONE fetch, no fallback", async () => {
  stubWindow({ hostname: "eduvora.shop" });
  setFetch(() => json({ ok: true, data: { n: 1 } }));
  const res = await apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" });
  assert.equal((await res.json()).ok, true);
  assert.deepEqual(fetchCalls, ["/api/personal-course"], "same-origin answer is final");
});

test("static host (HTML) on the page origin → falls back to the Vercel origins and returns the JSON", async () => {
  stubWindow({ hostname: "my-website-761e9.web.app", origin: "https://my-website-761e9.web.app" });
  setFetch((url) => {
    if (url.startsWith("https://eduvora.shop/")) return Promise.resolve(html());
    if (url.startsWith("https://digitalcatalyst.vercel.app/")) return Promise.resolve(json({ ok: true, data: { healed: true } }));
    return Promise.resolve(html());
  });
  const res = await apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" });
  assert.equal((await res.json()).data.healed, true);
  assert.equal(fetchCalls.length, 2, "eduvora.shop HTML → vercel.app JSON");
  assert.ok(fetchCalls[1].startsWith("https://digitalcatalyst.vercel.app/api/personal-course"));
});

test("eduvora.shop HTML → digitalcatalyst.vercel.app HTML: the LAST response is returned so callers can still report a clear error", async () => {
  stubWindow({ hostname: "my-website-761e9.web.app", origin: "https://my-website-761e9.web.app" });
  setFetch(() => Promise.resolve(html()));
  const res = await apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" });
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.equal(fetchCalls.length, 2);
});

test("network failure on the first origins → retry reaches the Vercel default origin", async () => {
  stubWindow({ hostname: "eduvora.shop" });
  setFetch((url) => {
    if (url.startsWith("https://digitalcatalyst.vercel.app/")) return Promise.resolve(json({ ok: true, data: { via: "vercel-default" } }));
    return Promise.reject(new TypeError("Failed to fetch"));
  });
  const res = await apiBase.apiFetch("/api/myday", { method: "POST", body: "{}" });
  assert.equal((await res.json()).data.via, "vercel-default");
  assert.deepEqual(fetchCalls, ["/api/myday", "https://eduvora.shop/api/myday", "https://digitalcatalyst.vercel.app/api/myday"]);
});

test("a JSON error envelope (500) is the real API speaking — returned as-is, never retried", async () => {
  stubWindow({ hostname: "eduvora.shop" });
  setFetch(() => json({ ok: false, code: "SERVER_ERROR", message: "boom" }, 500));
  const res = await apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "SERVER_ERROR");
  assert.equal(fetchCalls.length, 1, "JSON errors must not fan out to other origins (double-write risk)");
});

test("an aborted request propagates the AbortError immediately — no origin fan-out", async () => {
  stubWindow({ hostname: "eduvora.shop" });
  setFetch(() => Promise.reject(new DOMException("Aborted", "AbortError")));
  await assert.rejects(
    () => apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(fetchCalls.length, 1);
});

test("non-API paths are fetched exactly once and never rewritten", async () => {
  stubWindow({ hostname: "eduvora.shop" });
  setFetch(() => json({ ok: true }));
  await apiBase.apiFetch("/some/page");
  assert.deepEqual(fetchCalls, ["/some/page"]);
});

test("native shell (Capacitor): the first attempt goes straight to the production origin, then the Vercel default", async () => {
  globalThis.window = {
    Capacitor: { isNativePlatform: () => true },
    location: { hostname: "localhost", origin: "https://localhost", protocol: "https:", href: "https://localhost/" },
  };
  setFetch((url) => {
    if (url.startsWith("https://eduvora.shop/")) return Promise.resolve(html());
    if (url.startsWith("https://digitalcatalyst.vercel.app/")) return Promise.resolve(json({ ok: true, data: { app: true } }));
    return Promise.reject(new Error("unexpected origin: " + url));
  });
  const res = await apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" });
  assert.equal((await res.json()).data.app, true);
  assert.equal(fetchCalls[0], "https://eduvora.shop/api/personal-course", "never the device's own origin");
  assert.equal(fetchCalls.length, 2);
});

test("local dev: same-origin only — the production origins are never called", async () => {
  stubWindow({ hostname: "localhost", origin: "http://localhost:5173" });
  setFetch(() => json({ ok: true }));
  await apiBase.apiFetch("/api/personal-course", { method: "POST", body: "{}" });
  assert.deepEqual(fetchCalls, ["/api/personal-course"]);
});
