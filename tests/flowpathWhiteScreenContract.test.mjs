// tests/flowpathWhiteScreenContract.test.mjs
//
// Contract for the FlowPath white-screen fix.
//
//   Symptom: the FlowPath page opened fine, then went fully white a
//   moment later and navigation (Home button, browser Back) died.
//
//   Root cause: the Firestore merge in FlowPathView cast every server
//   `kind` straight onto the local `Activity.type`. The server can
//   store kinds the local ActivityType union does not model
//   ("lecture", or a schedule item whose scheduleType overwrote the
//   type field). ActivityCard / ActivityNode then did
//   `ACTIVITY_TYPE_META[type]` -> undefined -> `meta.color` threw,
//   React unmounted the whole root, and the hash-routed app went dead
//   white.
//
//   The fix, pinned here:
//     1. The merge normalises unmodelled kinds instead of passing
//        them through raw.
//     2. Display meta / icons resolve through fallback-safe helpers
//        (flowPathKindMeta / getFlowKindIcon) — never undefined.
//     3. A dedicated error boundary wraps the FlowPath route so any
//        future crash stays contained with working Retry / Back /
//        Home actions.
//     4. The Firestore poll validates the list shape before setState.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flowPathView = fs.readFileSync("src/components/flowpath/FlowPathView.tsx", "utf8");
const activityCard = fs.readFileSync("src/components/flowpath/ActivityCard.tsx", "utf8");
const activityNode = fs.readFileSync("src/components/flowpath/ActivityNode.tsx", "utf8");
const types = fs.readFileSync("src/flowpath/types/flowpath.ts", "utf8");
const icons = fs.readFileSync("src/components/flowpath/icons.tsx", "utf8");
const boundary = fs.readFileSync("src/components/flowpath/FlowPathErrorBoundary.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const firestoreHook = fs.readFileSync("src/flowpath/hooks/useFlowPathFirestore.ts", "utf8");
const syncHook = fs.readFileSync("src/flowpath/hooks/useFlowPathSync.ts", "utf8");

test("the Firestore merge normalises unmodelled kinds instead of casting them raw", () => {
  // toLocalActivity owns the mapping and checks the kind against the
  // local type table before casting.
  assert.match(flowPathView, /toLocalActivity/);
  assert.match(flowPathView, /LOCAL_ACTIVITY_TYPES\.has\(fp\.kind\)/);
  // The original kind rides along for display purposes.
  assert.match(flowPathView, /flowKind: fp\.kind/);
  // Unmodelled kinds (lecture) are normalised to "other".
  assert.match(flowPathView, /: "other"/);
  // The scheduleType field must never overwrite the activity type again.
  assert.doesNotMatch(flowPathView, /type:\s*fp\.scheduleType/);
  assert.doesNotMatch(flowPathView, /type: fp\.kind\s*[,}]/);
});

test("display meta and icons resolve through fallback-safe helpers", () => {
  assert.match(types, /export function flowPathKindMeta/);
  assert.match(types, /FLOW_PATH_FALLBACK_META/);
  assert.match(icons, /export function getFlowKindIcon/);
  // Cards and nodes must go through the helpers, not raw map lookups.
  assert.match(activityCard, /flowPathKindMeta\(activity\.flowKind \?\? activity\.type\)/);
  assert.match(activityCard, /getFlowKindIcon\(activity\.flowKind \?\? activity\.type\)/);
  assert.match(activityNode, /flowPathKindMeta\(flowKind \?\? type\)/);
  assert.match(activityNode, /getFlowKindIcon\(flowKind \?\? type\)/);
  // No remaining unguarded map lookups on the activity type.
  assert.doesNotMatch(activityCard, /ACTIVITY_TYPE_META\[activity\.type\]/);
  assert.doesNotMatch(activityNode, /ACTIVITY_TYPE_META\[type\]/);
});

test("the FlowPath route is wrapped in an error boundary with working escapes", () => {
  // The boundary must wrap the FlowPath route in main.tsx...
  assert.match(main, /FlowPathErrorBoundary/);
  // The JSX is multi-line (props one per line), so match whitespace-tolerantly.
  assert.match(main, /<FlowPathApp\s+onNavigateToHome/);
  // ...and offer Retry / Back / Home so the user is never stuck on a
  // white screen with dead navigation.
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /Try again/);
  assert.match(boundary, /Go back/);
  assert.match(boundary, /Go to Home/);
  assert.match(boundary, /window\.history\.back\(\)/);
  assert.match(boundary, /hashchange/);
});

test("the Firestore poll validates the list shape before updating state", () => {
  assert.match(firestoreHook, /Array\.isArray\(res\.items\)/);
  assert.match(firestoreHook, /item is FlowPathActivity/);
});

test("the sync hook diffs against a snapshot instead of re-sending every item", () => {
  // Re-sending the whole list on every change re-fired immediate push
  // notifications and forced an id-token refresh per call. The diff
  // must exist: fingerprint snapshot + create/update/delete decisions.
  assert.match(syncHook, /fingerprintOf/);
  assert.match(syncHook, /lastSyncRef/);
  assert.match(syncHook, /known !== fingerprint/);
  // Update with a 404 fallback to create, so a missing server doc
  // recovers instead of retrying forever.
  assert.match(syncHook, /status === 404/);
});
