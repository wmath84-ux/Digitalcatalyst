// tests/revisionAiTimeBudgetGuardContract.test.mjs
//
// Regression contract for the production bug where the revision AI server
// died with Vercel's opaque `FUNCTION_INVOCATION_FAILED` 500:
//
//   - The shared serverless function caps at maxDuration:60s.
//   - The repair loop in `generateWithProvider` could issue up to three
//     upstream calls (first + 2 repairs) at 45s each, easily blowing the
//     60s platform cap mid-call. Vercel then killed the function and the
//     user saw a generic 500 with no actionable message.
//   - Fix: a per-handler wall-clock budget (HANDLER_BUDGET_MS) that
//     aborts the repair loop with a structured 502 *before* the platform
//     60s cap kicks in, plus a tighter per-call timeout for repair rounds
//     (FETCH_MS_REPAIR) so the budget can cover both the first call and
//     at least one repair.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync("api/_lib/revisionGenerate.ts", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

test("the server declares a per-handler wall-clock budget under the Vercel maxDuration", () => {
  assert.match(server, /const HANDLER_BUDGET_MS\s*=\s*(\d[\d_]*)/);
  const budgetMatch = server.match(/const HANDLER_BUDGET_MS\s*=\s*(\d[\d_]*)/);
  const budgetMs = Number(budgetMatch[1].replaceAll("_", ""));
  const fnConfig = vercel.functions?.["api/referral-leaderboard.ts"];
  const platformMs = fnConfig?.maxDuration ? fnConfig.maxDuration * 1000 : 60_000;
  assert.ok(
    budgetMs < platformMs,
    `HANDLER_BUDGET_MS (${budgetMs}) must be strictly less than the Vercel maxDuration (${platformMs}) so the guard fires first.`,
  );
  // Keep a reasonable safety margin (5s) for in-flight responses to flush.
  assert.ok(
    platformMs - budgetMs >= 5_000,
    `HANDLER_BUDGET_MS (${budgetMs}) must leave ≥5s of headroom below the Vercel maxDuration (${platformMs}).`,
  );
});

test("the repair loop checks the budget before issuing a new upstream call", () => {
  assert.match(server, /for \(let round = 1; !plan\.ok && round <= MAX_TYPE_REPAIR_ROUNDS/);
  // The guard must be inside the loop and before the upstream call.
  const loopMatch = server.match(/for \(let round = 1; !plan\.ok && round <= MAX_TYPE_REPAIR_ROUNDS[\s\S]*?isBudgetLow\(\)[\s\S]*?throw new TimeBudgetExhausted/);
  assert.ok(loopMatch, "repair loop checks the budget and throws TimeBudgetExhausted before issuing a new call");
});

test("repair rounds use a shorter per-call timeout so they fit under the budget", () => {
  assert.match(server, /const FETCH_MS_REPAIR\s*=\s*(\d[\d_]*)/);
  const repairMatch = server.match(/const FETCH_MS_REPAIR\s*=\s*(\d[\d_]*)/);
  const repairMs = Number(repairMatch[1].replaceAll("_", ""));
  const firstMatch = server.match(/const FETCH_MS\s*=\s*(\d[\d_]*)/);
  const firstMs = Number(firstMatch[1].replaceAll("_", ""));
  assert.ok(
    repairMs < firstMs,
    `FETCH_MS_REPAIR (${repairMs}ms) must be shorter than FETCH_MS (${firstMs}ms) so a first call + a repair fit under the Vercel 60s cap.`,
  );
});

test("TimeBudgetExhausted maps to a structured 502 with a code, not a 500", () => {
  assert.match(server, /class TimeBudgetExhausted extends Error/);
  assert.match(server, /statusCode\s*=\s*502/);
  assert.match(server, /code\s*=\s*"AI_TIME_BUDGET_EXHAUSTED"/);
});

test("the handler refuses to start a reservation when the budget is already low", () => {
  // The check must run *before* reserveUsage so we do not deduct a
  // generation allowance for a request we know will time out. Search only
  // inside the handler body (after `handleRevisionGenerate` is defined) so
  // we don't accidentally match the function definition itself.
  const handlerStart = server.indexOf("export async function handleRevisionGenerate");
  assert.ok(handlerStart > -1, "handler exists");
  const handlerBody = server.slice(handlerStart);
  // The call to reserveUsage is `reservation = await reserveUsage(` —
  // look for the actual call (assignment form) to skip the function def.
  const callIdx = handlerBody.indexOf("reservation = await reserveUsage(");
  const earlyOutIdx = handlerBody.indexOf("isBudgetLow(15_000)");
  assert.ok(callIdx > -1, "reservation call is present in the handler body");
  assert.ok(earlyOutIdx > -1, "isBudgetLow early-out is present in the handler body");
  assert.ok(earlyOutIdx < callIdx, "isBudgetLow early-out runs before the reserveUsage call");
});

test("the per-request budget is reset at the top of the handler", () => {
  assert.match(server, /enterHandler\(\);[\s\S]{0,40}?const user = await requireFirebaseUser/);
});
