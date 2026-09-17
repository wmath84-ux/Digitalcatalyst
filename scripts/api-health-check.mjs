#!/usr/bin/env node
// scripts/api-health-check.mjs
//
// Probes the deployed API layer and fails (exit 1) when NO known Vercel
// origin answers /api/* with the JSON envelope the app expects.
//
// Why this exists (2026-09-16, "My Study Library couldn't load"):
//   The SPA and the API are hosted separately. When the origin users load the
//   site from stopped running the serverless functions — the production
//   Vercel deployment went missing while eduvora.shop kept serving the static
//   SPA — every /api/* request came back as index.html and every
//   API-backed feature (Study Library, My Day sync, AI Mentor, subscription
//   gate …) degraded at once. The outage was invisible until a user reported
//   it. This check turns that failure mode into a RED GitHub Actions run
//   within one polling interval.
//
// Probe: GET /api/referral-leaderboard — a public, unauthenticated, cheap
// endpoint that only succeeds when (a) a Vercel function answers the path,
// (b) Firebase Admin is configured, and (c) Firestore is reachable.
//
// Run:  node scripts/api-health-check.mjs   (used by .github/workflows/api-health-check.yml)

const PROBE_PATH = "/api/referral-leaderboard";
const TIMEOUT_MS = 40_000;

// The two production origins that can run the serverless functions, in the
// same order the client tries them (src/utils/apiBase.ts).
//
// Both are overridable because neither is stable across hosting setups:
//   • eduvora.shop only answers /api/* while its DNS points at the Vercel
//     project. If it points at Firebase Hosting instead, it answers every path
//     with the SPA and this probe reports it as unhealthy (correctly).
//   • The Vercel default domain depends on the account scope. A project inside
//     a *team* is NOT at plain `digitalcatalyst.vercel.app` — its generated
//     domains carry the team slug. Set API_HEALTH_ORIGINS (comma-separated) to
//     the real Production alias from Vercel → Project → Settings → Domains.
const CONFIGURED_ORIGINS = (process.env.API_HEALTH_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const ORIGINS = CONFIGURED_ORIGINS.length
  ? CONFIGURED_ORIGINS
  : ["https://eduvora.shop", "https://digitalcatalyst.vercel.app"];

function classify(status, contentType, body) {
  if (contentType.includes("html")) {
    return { healthy: false, detail: "answered with HTML (static host — no API function at this path)" };
  }
  if (status !== 200) {
    return { healthy: false, detail: `HTTP ${status} (${body.slice(0, 160).replace(/\s+/g, " ")})` };
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.ok === true) return { healthy: true, detail: "JSON ok:true" };
    const code = parsed && (parsed.code || parsed.error) ? ` — ${String(parsed.code || parsed.error).slice(0, 80)}` : "";
    return { healthy: false, detail: `JSON ok:false${code}` };
  } catch {
    return { healthy: false, detail: `non-JSON body (${body.slice(0, 160).replace(/\s+/g, " ")})` };
  }
}

async function probe(origin) {
  const url = `${origin.replace(/\/+$/, "")}${PROBE_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body = await res.text();
    const result = classify(res.status, res.headers.get("content-type") || "", body);
    result.url = url;
    result.status = res.status;
    return result;
  } catch (error) {
    return {
      url,
      healthy: false,
      detail: error?.name === "AbortError" ? `timed out after ${TIMEOUT_MS} ms` : `request failed: ${error?.message || error}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const origin of ORIGINS) {
  const result = await probe(origin);
  results.push(result);
  const mark = result.healthy ? "✅" : "❌";
  console.log(`${mark} ${result.url} — ${result.status ? `HTTP ${result.status}, ` : ""}${result.detail}`);
}

if (results.some((result) => result.healthy)) {
  console.log("\nAPI health check passed: at least one Vercel origin is serving the API.");
  process.exit(0);
}

console.error("\nAPI health check FAILED: no origin is serving the API.");
console.error("User-facing impact: My Study Library shows \"Your library couldn't be loaded\",");
console.error("and My Day sync, AI Mentor, the subscription gate and revision are degraded.");
console.error("\nFix: restore a production deployment on the Vercel project `digitalcatalyst`");
console.error("(Settings → Git → reconnect the GitHub integration, or `vercel --prod`),");
console.error("then re-run this check. The app itself falls back to the Vercel default");
console.error("URL automatically — see src/utils/apiBase.ts and docs/deployment-checklist.md §6.");
process.exit(1);
