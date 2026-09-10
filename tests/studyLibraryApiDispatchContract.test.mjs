// My Study Library + course-player AI: shared-function dispatch contracts.
//
// Reported symptom: "Your library couldn't load — The server result couldn't be
// confirmed. Refresh your library before retrying." with a Try again button that
// could never work, and the course-player AI failing at the same time.
//
// Root cause: `/api/personal-course` and `/api/personal-ai` are rewrites onto the
// single deployed `api/referral-leaderboard.ts` function (the Hobby plan caps the
// project at 12 serverless entries), which dispatches on the POST body `action`.
// Any request whose action could not be read — an unparsed body, a POST reduced to
// a GET by an upstream redirect, an action a stale bundle no longer sends — fell
// all the way through to the LEADERBOARD branch and was answered with
// `200 { ok: true, subscribers, users }`. That is `ok` but carries no `data`, so
// every `{ ok, data }` client read it as a failed-but-possibly-committed call:
// the library showed the unconfirmed-write warning and the AI failed generically.
// Both features broke from one cause, and both were unrecoverable from the UI.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const mux = read("api/referral-leaderboard.ts");
const client = read("src/lib/personalCourseClient.ts");
const aiClient = read("src/ai/personalAiClient.ts");
const aiUtil = read("utils/personalAi.js");
const vercel = JSON.parse(read("vercel.json"));

const sharedRoutes = ["personal-course", "personal-ai", "myday", "flowpath/control", "revision/data"];

test("every feature sharing the deployed function is a guarded route", () => {
  for (const route of sharedRoutes) {
    const rewrite = vercel.rewrites.find((item) => item.source === `/api/${route}`);
    assert.ok(rewrite, `/api/${route} is rewritten onto the shared function`);
    assert.equal(rewrite.destination, "/api/referral-leaderboard");
    // Being rewritten in is only half the contract: the dispatcher must also
    // know the path, or its traffic can fall through to the leaderboard.
    assert.ok(mux.includes(`"${route}"`), `${route} is listed in the router's shared-route table`);
  }
});

test("a request addressed at a shared route can never be answered with leaderboard data", () => {
  // The guard must sit BEFORE the leaderboard query, on both the POST (no
  // action) and the GET (method rewritten) paths.
  assert.match(mux, /sharedRouteAddressed\(reqWithUrl\)/, "the addressed route is resolved once, up front");
  assert.match(mux, /if \(route && route !== "revision\/generate"\)/, "POSTs with no dispatchable action are refused");
  assert.match(mux, /if \(route\) \{/, "GETs on a shared route are refused instead of running the leaderboard");
  assert.match(mux, /code: action \? "UNKNOWN_ACTION" : "MISSING_ACTION"/);
  assert.match(mux, /METHOD_NOT_ALLOWED/);
  // And the refusal names the feature, so the message can never read as a
  // generic "server result couldn't be confirmed" again.
  assert.match(mux, /ROUTE_LABEL\[route\]/);
  const guardAt = mux.search(/if \(route && route !== "revision\/generate"\)/);
  const leaderboardAt = mux.search(/db\.collection\("users"\)\.limit\(200\)\.get\(\)/);
  assert.ok(guardAt > 0 && leaderboardAt > 0 && guardAt < leaderboardAt, "the guard precedes the leaderboard branch");
});

test("an unparsed POST body is recovered from the stream and handed to the feature", () => {
  // Recovering the action is the actual load fix, not just a nicer error.
  assert.match(mux, /const rawBody = await resolveRequestBody\(req\)/);
  assert.match(mux, /req\.body = rawBody/, "the recovered body is written back for the _lib handlers");
  assert.match(mux, /stream\.readableEnded === true \|\| stream\.complete === true/, "a drained stream is never re-read");
  // It must never be able to hang the function.
  assert.match(mux, /RAW_BODY_TIMEOUT_MS = 2_000/);
  assert.match(mux, /setTimeout\(finish, RAW_BODY_TIMEOUT_MS\)/);
  assert.match(mux, /MAX_RAW_BODY_BYTES = 512 \* 1024/, "the raw read is size-capped");
});

test("the revision generator keeps its historical default (no routing regression)", () => {
  // `/api/revision/generate` and direct posts to the function still default to
  // the AI generator; only the OTHER shared routes gained a refusal.
  assert.match(mux, /if \(route && route !== "revision\/generate"\)/);
  assert.match(mux, /return await handleRevisionGenerate\(req, res\)/);
  assert.ok(!existsSync("api/personal-course.ts") && !existsSync("api/personal-ai.ts"),
    "the fix stays inside the shared function instead of adding a 13th entry");
});

test("loading the library is a read: retryable, and never called an unconfirmed write", () => {
  assert.match(client, /const READ_ACTIONS = new Set\(\["personalCourse\.library", "personalCourse\.status", "personalCourse\.list"\]\)/);
  // A failed read must not inherit the mutation-safety warning.
  assert.match(client, /const unconfirmed = !isRead &&/);
  assert.match(client, /Your library couldn't be loaded\. Nothing was changed — try again\./);
  // Writes keep the deliberate warning verbatim.
  assert.match(client, /The server result couldn't be confirmed\. Refresh your library before retrying\./);
  assert.match(client, /so you don't repeat a completed action/);
  assert.match(client, /retryable: boolean;[\s\S]*unconfirmed: boolean;/);
  // A foreign envelope is diagnosed as such.
  assert.match(client, /LIBRARY_ROUTE_UNAVAILABLE/);
  assert.match(client, /didn't answer this request — the shared API replied with a different service's result/);
});

test("a partial library snapshot degrades to an error card, not a render crash", () => {
  assert.match(client, /!Array\.isArray\(result\.modules\) \|\| !Array\.isArray\(result\.savedResources\)/);
  assert.match(client, /"MALFORMED_SNAPSHOT"/);
  // The access block must survive a missing allowedTypes (it feeds typeLimit).
  assert.match(client, /Array\.isArray\(access\.allowedTypes\) \? access\.allowedTypes\.length : 0/);
});

test("the course-player AI reports an undispatched call as retryable, not an outage", () => {  assert.match(aiClient, /const undispatched =/);
  for (const code of ["MISSING_ACTION", "UNKNOWN_ACTION", "METHOD_NOT_ALLOWED", "REQUEST_BODY_UNAVAILABLE"]) {
    assert.ok(aiClient.includes(`"${code}"`), `${code} is recognised as "the AI never ran"`);
  }
  assert.match(aiClient, /code: undispatched \? "AI_ROUTE_UNAVAILABLE" : body\.code/);
  // The Retry button is gated on `retryable`, so this code must set it true.
  const failure = aiUtil.slice(aiUtil.search(/case "AI_ROUTE_UNAVAILABLE":/));
  assert.match(failure.slice(0, 400), /retryable: true/);
  assert.match(failure.slice(0, 400), /kind: "server"/);
});

test("server and client agree on which actions are reads, and the server says so", () => {
  const api = read("api/_lib/personalCourse.ts");
  // Same set on both sides, or a load failure gets mislabelled as a lost write.
  const clientReads = client.match(/const READ_ACTIONS = new Set\(\[([^\]]+)\]/)[1];
  const serverReads = api.match(/const LIBRARY_READ_ACTIONS = new Set\(\[([^\]]+)\]/)[1];
  assert.equal(serverReads.replace(/\s/g, ""), clientReads.replace(/\s/g, ""), "read sets stay in sync");
  for (const action of ["personalCourse.library", "personalCourse.status", "personalCourse.list"]) {
    assert.ok(api.includes(`"${action}"`), `${action} is a server-side read`);
  }
  // An unexpected error while LOADING must not claim the library "couldn't be updated".
  assert.match(api, /const reading = LIBRARY_READ_ACTIONS\.has\(action\)/);
  assert.match(api, /Your library couldn't be loaded\. Nothing was changed — please try again\./);
  assert.match(api, /My Study Library couldn't be updated\. Please try again\./, "writes keep the update wording");
  // `action` is hoisted out of the try so the catch branch can classify the request.
  assert.match(api, /let action = "";\n  try \{/);
});
