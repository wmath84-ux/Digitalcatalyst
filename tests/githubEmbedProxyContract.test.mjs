// tests/githubEmbedProxyContract.test.mjs
//
// Contract for GitHub embeds in the Course Player. github.com/gist pages
// send `frame-ancestors 'none'` + `X-Frame-Options: deny`, so a direct
// iframe is a blank white surface. The client routes those embeds through
// /api/embed-proxy, which fetches server-side, strips the frame-blocking
// headers, and rewrites subresource links. Behaviour tests run the real
// handler against a fake fetch (no network) so they stay deterministic.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { handleEmbedProxy } from "../api/_lib/embedProxy.ts";

const courseEmbed = fs.readFileSync("src/utils/courseEmbed.ts", "utf8");
const proxy = fs.readFileSync("api/_lib/embedProxy.ts", "utf8");
const leaderboard = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
const vercelConfig = fs.readFileSync("vercel.json", "utf8");
const viewer = fs.readFileSync("src/course/ResourceViewer.tsx", "utf8");

// ---------------------------------------------------------------------------
// Fake transport
// ---------------------------------------------------------------------------

const fakeResponse = (html, { ok = true, status = 200, url = "https://github.com/octocat/Hello-World/blob/main/index.html", contentType = "text/html; charset=utf-8" } = {}) => ({
  ok,
  status,
  url,
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
  arrayBuffer: async () => {
    const buffer = Buffer.from(html, "utf8");
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  },
});

class FakeRes {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = "";
    this.jsonBody = null;
  }

  status(code) { this.statusCode = code; return this; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; }
  end(body) { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || ""); return this; }
  json(data) { this.jsonBody = data; return this; }
}

const run = async ({ url, accept = "text/html", method = "GET", fetchImpl, site = "same-origin" }) => {
  const res = new FakeRes();
  await handleEmbedProxy({ method, query: { url }, headers: { accept, "sec-fetch-site": site } }, res, { fetchImpl });
  return res;
};

// ---------------------------------------------------------------------------
// Client wiring
// ---------------------------------------------------------------------------

test("course player routes github.com embeds through the server-side proxy", () => {
  assert.match(courseEmbed, /shouldProxyCourseEmbedUrl/);
  assert.match(courseEmbed, /getCourseEmbedProxyUrl/);
  assert.match(courseEmbed, /\/api\/embed-proxy\?url=\$\{encodeURIComponent\(value\)\}/);
  assert.match(courseEmbed, /GITHUB_FRAME_BLOCKED_HOST/);
  assert.match(courseEmbed, /file\.type === "embed" && raw/);
});

test("only frame-blocking GitHub hosts are proxied; github.io pages stay direct", () => {
  // Client-side host gate targets github.com (incl. gist.github.com).
  assert.ok(courseEmbed.includes("github\\.com$/i"));
  // github.io is never routed through the proxy — GitHub Pages frames fine.
  assert.doesNotMatch(courseEmbed, /github\\.io[\s\S]{0,80}embed-proxy|embed-proxy[\s\S]{0,80}github\\.io/);
});

test("a failed embed keeps an Open original escape hatch in the viewer", () => {
  assert.match(viewer, /Open original/);
  assert.match(viewer, /data-course-viewer-retry/);
  // The escape hatch unwraps proxied GitHub URLs back to the real host.
  assert.match(viewer, /openOriginalHref/);
  assert.match(viewer, /searchParams\.get\("url"\)/);
  assert.match(viewer, /sourceHost/);
});

// ---------------------------------------------------------------------------
// Proxy behaviour (fake fetch — deterministic, no network)
// ---------------------------------------------------------------------------

test("proxy fetches the raw file for github.com blob viewer URLs", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return fakeResponse("<!doctype html><p>hi</p>", { url });
  };
  const res = await run({
    url: "https://github.com/octocat/Hello-World/blob/main/index.html",
    fetchImpl,
  });
  assert.equal(res.statusCode, 200);
  assert.ok(seen[0].startsWith("https://raw.githubusercontent.com/octocat/Hello-World/main/index.html"), seen[0]);
  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(res.headers["x-embed-proxy"], "1");
});

test("proxy never forwards frame-blocking headers to the iframe", () => {
  // The response the handler builds only carries content-type, cache-control
  // and the marker — nothing from the upstream (X-Frame-Options / CSP) is
  // ever set on the response.
  assert.doesNotMatch(proxy, /setHeader\(\s*["']x-frame-options/i);
  assert.doesNotMatch(proxy, /setHeader\(\s*["']content-security-policy/i);
  assert.match(proxy, /setHeader\("x-embed-proxy", "1"\)/);
  assert.match(proxy, /setHeader\("cache-control", CACHE_CONTROL\)/);
});

test("proxy rewrites relative and GitHub-hosted links and drops <base>", async () => {
  // The fake echoes the requested URL back as the response URL, exactly like
  // a real fetch (the blob URL was already upgraded to the raw file).
  const fetchImpl = async (url) =>
    fakeResponse('<base href="https://evil.example/x"><img src="./logo.png"><a href="/octocat/Hello-World/wiki"><link href="https://github.githubassets.com/a.css" rel="stylesheet"><script src="app.js"></script>', { url });
  const res = await run({ url: "https://github.com/octocat/Hello-World/blob/main/index.html", fetchImpl });
  assert.equal(res.statusCode, 200);
  const html = res.body;
  assert.doesNotMatch(html, /<base/i);
  assert.match(html, /src="\/api\/embed-proxy\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2Foctocat%2FHello-World%2Fmain%2Flogo\.png"/);
  assert.match(html, /href="\/api\/embed-proxy\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2Foctocat%2FHello-World%2Fwiki"/);
  assert.match(html, /src="\/api\/embed-proxy\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2Foctocat%2FHello-World%2Fmain%2Fapp\.js"/);
  // External CDN assets stay direct — those hosts allow framing.
  assert.match(html, /https:\/\/github\.githubassets\.com\/a\.css/);
});

test("raw HTML served as text/plain is upgraded to text/html", async () => {
  const fetchImpl = async () =>
    fakeResponse("<h1>page</h1>", { contentType: "text/plain; charset=utf-8", url: "https://raw.githubusercontent.com/octocat/Hello-World/main/index.html" });
  const res = await run({ url: "https://github.com/octocat/Hello-World/blob/main/index.html", fetchImpl });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
});

test("host allowlist: non-GitHub URLs are refused", async () => {
  const res = await run({ url: "https://evil.example/page.html" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.jsonBody.code, "invalid_url");
});

test("cross-site requests are refused to keep the proxy app-only", async () => {
  const res = await run({ url: "https://github.com/octocat/Hello-World", site: "cross-site" });
  assert.equal(res.statusCode, 403);
  assert.equal(res.jsonBody.code, "cross_site_refused");
});

test("upstream failure renders a friendly in-frame error page with an escape link", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  const res = await run({ url: "https://github.com/octocat/Hello-World/blob/main/index.html", fetchImpl });
  assert.equal(res.statusCode, 502);
  assert.match(res.body, /This page could not be loaded/);
  assert.match(res.body, /Open the original page/);
  assert.match(res.body, /github\.com\/octocat\/Hello-World\/blob\/main\/index\.html/);
});

// ---------------------------------------------------------------------------
// Deployment shape: the Hobby plan caps serverless functions at 12
// ---------------------------------------------------------------------------

test("the embed proxy is served through an existing function, not a new one", () => {
  // github.com embeds were added as a NEW api route once — that exceeded
  // Vercel Hobby's 12-function cap and every deployment failed. The proxy
  // now lives in the private _lib helper and is served by the existing
  // referral-leaderboard function through a rewrite.
  assert.ok(!fs.existsSync("api/embed-proxy.ts"), "api/embed-proxy.ts must not exist as its own function");
  assert.match(leaderboard, /handleEmbedProxy/);
  assert.match(leaderboard, /req\.method === "GET" && req\.query\?\.url/);
  assert.match(vercelConfig, /\/api\/embed-proxy/);
  assert.match(vercelConfig, /\/api\/referral-leaderboard/);
});

test("serverless function count stays at or under the Hobby limit of 12", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
  // Vercel deploys every api/*.ts file as a function EXCEPT files whose
  // path segment starts with "_" (private helpers, e.g. api/_lib/*).
  const functions = walk("api").filter(
    (file) => file.endsWith(".ts") && !file.split("/").some((segment) => segment.startsWith("_")),
  );
  assert.ok(functions.length <= 12, `serverless functions exceed the Hobby limit: ${functions.length} -> ${functions.join(", ")}`);
});
