#!/usr/bin/env node
// scripts/check-google-search.mjs
//
// "Restriction None kar diya, phir bhi wahi error" — this script ends that
// argument in about two seconds, on YOUR machine, with the real key.
//
// It asks Google's Custom Search API exactly the way the app does, from three
// angles, and prints Google's OWN status / reason / message for each:
//
//   1. like the BROWSER does — with an Origin and a Referer header, which is
//      what an API key's "HTTP referrers (websites)" restriction judges;
//   2. like the SERVER does — no Origin, no Referer, which is what
//      /api/google-search sends (and why that path survives a restriction);
//   3. through your deployed /api/google-search route, when you pass --api.
//
// Read the verdict at the end: it names the actual cause and the exact click
// that fixes it.
//
// Run:
//   node scripts/check-google-search.mjs <API_KEY> <CX> ["query"]
//   node scripts/check-google-search.mjs --api https://eduvora.shop <KEY> <CX>
//   GOOGLE_SEARCH_API_KEY=… GOOGLE_SEARCH_CX=… node scripts/check-google-search.mjs
//
// The key is only ever sent to googleapis.com (and, with --api, to your own
// deployment in the POST body). It is never written to disk and never logged.

import { classifyGoogleProxyError } from "../api/_lib/googleSearchProxy.ts";

const args = process.argv.slice(2);
let apiOrigin = "";
const rest = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--api") {
    apiOrigin = String(args[index + 1] || "").replace(/\/+$/, "");
    index += 1;
    continue;
  }
  rest.push(args[index]);
}

const apiKey = String(rest[0] || process.env.GOOGLE_SEARCH_API_KEY || "").trim();
const cx = String(rest[1] || process.env.GOOGLE_SEARCH_CX || "").trim();
const query = String(rest[2] || "What is Mimosa pudica").trim();

const say = (text = "") => process.stdout.write(`${text}\n`);
const rule = () => say("─".repeat(72));

if (!apiKey || !cx) {
  say("Usage: node scripts/check-google-search.mjs <API_KEY> <CX> [\"query\"] [--api https://your-site]");
  say("");
  say("API key : Google Cloud → APIs & Services → Credentials");
  say("CX      : https://programmablesearchengine.google.com/ → your engine → Search engine ID");
  process.exit(2);
}

say(`Query    : ${query}`);
say(`API key  : ${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`);
say(`Engine   : ${cx}`);
rule();

const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
endpoint.searchParams.set("key", apiKey);
endpoint.searchParams.set("cx", cx);
endpoint.searchParams.set("q", query);
endpoint.searchParams.set("num", "1");

/** One attempt, reported honestly. */
async function attempt(label, url, init) {
  const startedAt = Date.now();
  say(`▶ ${label}`);
  try {
    const response = await fetch(url, init);
    const ms = Date.now() - startedAt;
    const raw = await response.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    if (response.ok) {
      const items = Array.isArray(body?.items) ? body.items.length : 0;
      const total = body?.searchInformation?.formattedTotalResults || "?";
      say(`  ✓ HTTP ${response.status} in ${ms}ms — ${items} result(s), about ${total} total`);
      if (items) say(`    first: ${String(body.items[0]?.title || "").slice(0, 80)}`);
      say("");
      return { ok: true, status: response.status };
    }
    const classified = classifyGoogleProxyError(response.status, body);
    say(`  ✗ HTTP ${response.status} in ${ms}ms`);
    say(`    reason  : ${classified.reason || "(none given)"}`);
    say(`    code    : ${classified.code}`);
    say(`    message : ${classified.message || raw.slice(0, 240) || "(empty body)"}`);
    say("");
    return { ok: false, status: response.status, code: classified.code, reason: classified.reason, message: classified.message };
  } catch (error) {
    say(`  ✗ network error: ${error?.message || error}`);
    say("    (Is this machine online? Is a proxy/VPN in the way?)");
    say("");
    return { ok: false, code: "network", message: String(error?.message || error) };
  }
}

// 1. The browser's shape: Origin + Referer present. This is what a key's
//    "HTTP referrers (websites)" restriction is checked against.
const browserLike = await attempt(
  "BROWSER-style request (Origin + Referer sent, like the app's page does)",
  endpoint.toString(),
  {
    headers: {
      accept: "application/json",
      origin: "https://eduvora.shop",
      referer: "https://eduvora.shop/",
    },
  },
);

// 2. The server's shape: no Origin, no Referer. A referrer restriction has
//    nothing to match, so this is the path that keeps working.
const serverLike = await attempt(
  "SERVER-style request (no Origin, no Referer — what /api/google-search sends)",
  endpoint.toString(),
  { headers: { accept: "application/json" } },
);

// 3. Your own deployed proxy, when asked for.
let deployed = null;
if (apiOrigin) {
  rule();
  deployed = await attempt(`DEPLOYED proxy  POST ${apiOrigin}/api/google-search`, `${apiOrigin}/api/google-search`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", origin: "https://eduvora.shop" },
    body: JSON.stringify({ q: query, start: 1, type: "web", key: apiKey, cx }),
  });
  if (!deployed.ok && /cannot POST|not found|404|405/i.test(`${deployed.message || ""} ${deployed.status || ""}`)) {
    say("  ↳ That deployment does not have the /api/google-search route yet.");
    say("    Deploy this branch (api/_lib/googleSearchProxy.ts + the vercel.json rewrite) and re-run.");
    say("");
  }
}

/* ── The verdict ─────────────────────────────────────────────────────────── */
rule();
say("VERDICT");
rule();

const FIX = {
  referrer: [
    "The key has an HTTP-referrer (websites) restriction and this origin is not on it.",
    "Fix: Google Cloud → APIs & Services → Credentials → this key → Application restrictions → None → SAVE.",
    "Then wait 1–5 minutes; Google propagates the change slowly.",
    "Or leave the restriction on and let the app use its SERVER path (/api/google-search), which sends no Referer at all.",
  ],
  "ip-blocked": [
    "The key has an IP-address restriction, and this machine's IP is not on the list.",
    "Fix: Credentials → this key → Application restrictions → None (device IPs change constantly, so a list cannot work for an app).",
    "The SERVER path avoids this entirely — requests then come from your deployment, not from the device.",
  ],
  permission: [
    "Google refused with 403 but did not name a referrer/IP cause.",
    "Most often: Credentials → this key → API restrictions → 'Don't restrict key' (or tick 'Custom Search API').",
    "Also check the project's billing account is active — a paused billing account 403s every API.",
  ],
  "api-disabled": [
    "The Custom Search API is not enabled in THIS key's project.",
    "Fix: https://console.cloud.google.com/apis/library/customsearch.googleapis.com → pick the right project → Enable.",
  ],
  "invalid-key": [
    "Google does not recognise this key at all.",
    "Re-copy it (leading/trailing spaces are common), and check you are editing the SAME project the key belongs to.",
  ],
  "invalid-cx": [
    "The Search Engine ID (cx) is wrong, or belongs to another Google account.",
    "Fix: https://programmablesearchengine.google.com/ → your engine → copy the 'Search engine ID' (looks like 0123456789abcdef:abcdefg).",
  ],
  quota: [
    "The free daily quota (100 queries/day) is used up.",
    "It resets at midnight Pacific time. Save a second key/engine in Settings — the app hands over automatically.",
  ],
  network: [
    "This machine could not reach googleapis.com at all — a local network/VPN/DNS problem, not a key problem.",
  ],
};

if (browserLike.ok && serverLike.ok) {
  say("✓ The key and the engine are both fine, from a browser AND from a server.");
  say("  If the app still shows an error, it is using a DIFFERENT key than the one you just tested:");
  say("  open Settings → Google search → 'Diagnose karo' — it prints the key actually in effect");
  say("  (aapki key vs build ki school key) and where it was read from.");
} else if (!browserLike.ok && serverLike.ok) {
  say("✓ The key works — but ONLY when no browser Origin/Referer is attached.");
  say("  That is a key RESTRICTION problem, not a broken key:");
  for (const line of FIX[serverLike.code ? "permission" : browserLike.code] || FIX[browserLike.code] || []) say(`  · ${line}`);
  say("");
  say("  The app's server path (/api/google-search) sends no Referer, so search keeps working");
  say("  from the APK, the PWA, localhost and every preview domain — no Google Cloud change needed.");
} else if (browserLike.ok && !serverLike.ok) {
  say("? Odd: the browser-style call worked and the server-style one did not.");
  say("  Google can rate-limit an identical request a few seconds apart — re-run in a minute.");
} else {
  const code = browserLike.code || serverLike.code || "unknown";
  // A machine that cannot reach Google at all is not a key problem, and saying
  // so in the headline matters — the rest of this script is about keys.
  if (code === "network" || code === "timeout") {
    say(`✗ Both paths failed before Google ever answered (${code}) — this is a NETWORK problem, not a key problem.`);
  } else {
    say(`✗ Both paths failed → the problem is the KEY / ENGINE itself (Google says: ${code}).`);
  }
  say(`  Google's own words: “${browserLike.message || serverLike.message || "(none)"}”`);
  for (const line of FIX[code] || []) say(`  · ${line}`);
  if (!FIX[code]) say("  · Read Google's message above — it names the cause precisely.");
}

if (deployed) {
  say("");
  say(deployed.ok
    ? "✓ Your deployed /api/google-search route works — the app can always fall back to it."
    : `✗ Your deployed /api/google-search route answered ${deployed.status || deployed.code} — see the output above.`);
}

process.exit(browserLike.ok || serverLike.ok || deployed?.ok ? 0 : 1);
