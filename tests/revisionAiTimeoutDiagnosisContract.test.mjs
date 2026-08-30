// tests/revisionAiTimeoutDiagnosisContract.test.mjs
//
// Regression contract for the production bug where BOTH school-provided AI
// and the learner's own/custom AI failed with
// "AI server returned an invalid response.":
//
//   - The shared serverless function (api/referral-leaderboard.ts) hosts the
//     revision AI handler whose provider fetch may legitimately run up to
//     FETCH_MS (45s). vercel.json previously set no maxDuration, so the
//     platform cut long generations mid-flight and returned a non-JSON /
//     empty platform error page. The client's JSON.parse then threw the
//     blanket "invalid response" — identical for every provider, because all
//     of them ride this one route.
//   - Fix: give the function a maxDuration that covers FETCH_MS plus
//     Firestore overhead, keep JSON as the only response shape (rejection
//     guard in the dispatcher), and make the client name the real status
//     (502/503/504 / empty body) as a safe-to-retry timeout instead of the
//     blanket message.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");
const server = fs.readFileSync("api/_lib/revisionGenerate.ts", "utf8");
const leaderboard = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

test("the shared AI function has a platform budget larger than its provider timeout", () => {
  const fetchMatch = server.match(/FETCH_MS\s*=\s*(\d[\d_]*)/);
  assert.ok(fetchMatch, "revisionGenerate keeps a finite provider timeout");
  const fetchMs = Number(fetchMatch[1].replaceAll("_", ""));
  const fnConfig = vercel.functions?.["api/referral-leaderboard.ts"];
  assert.ok(fnConfig, "vercel.json configures the shared AI function");
  assert.ok(Number.isFinite(fnConfig.maxDuration), "maxDuration is configured");
  const budgetMs = fnConfig.maxDuration * 1000;
  assert.ok(
    budgetMs >= fetchMs + 5000,
    `maxDuration (${fnConfig.maxDuration}s) must cover the ${fetchMs / 1000}s provider call plus Firestore overhead`,
  );
});

test("a handler rejection above try/catch still answers JSON, not an unhandled platform error", () => {
  const dispatch = leaderboard.match(
    /handleRevisionGenerate\(req, res\)[\s\S]{0,200}?errorResponse\(res, error/,
  );
  assert.ok(dispatch, "revision dispatch is wrapped so any rejection becomes a JSON errorResponse");
});

test("the client names gateway timeouts / empty bodies instead of the blanket invalid-response error", () => {
  assert.match(aiConfig, /function describeNonJsonAiResponse\(res: Response, raw: string\): string/);
  assert.match(aiConfig, /502 \|\| status === 503 \|\| status === 504/);
  assert.match(aiConfig, /stopped before answering/);
  assert.match(aiConfig, /try again/);
});

test("both AI server call sites route parse failures through the status-aware descriptor", () => {
  const uses = aiConfig.match(/throw new Error\(describeNonJsonAiResponse\(res, raw\)\);/g) || [];
  assert.equal(uses.length, 2, "generateViaServer and completeJsonViaServer both use it");
  const blanket = aiConfig.match(/throw new Error\("AI server returned an invalid response\."\);/g) || [];
  assert.equal(blanket.length, 0, "no blanket parse-error throw remains (string survives only as descriptor fallback)");
});

test("the SPA-fallback detector still guards missing-proxy environments first", () => {
  assert.match(aiConfig, /function isSpaFallback/);
  const gen = aiConfig.indexOf("isSpaFallback(res, raw)");
  const parse = aiConfig.indexOf("describeNonJsonAiResponse(res, raw)");
  assert.ok(gen > -1 && parse > gen, "proxy check runs before JSON parsing");
});
