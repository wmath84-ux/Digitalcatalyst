// tests/flowpathControlContract.test.mjs
//
// Contract tests for the FlowPath control center.
//
//   FlowPath is becoming the single dashboard that drives My Day
//   + Revision. The contract is:
//
//     1. The server multiplexer (api/_lib/flowpathControl.ts) is
//        reachable at /api/flowpath/control via a Vercel rewrite
//        (Hobby plan 12-function cap, same pattern as the other
//        existing multiplexers).
//
//     2. Every create / update / delete / complete / bulk /
//        broadcast action lands in:
//          - users/{uid}/flowpathActivities/{id}     (master copy)
//          - users/{uid}/myDay/current                (task / reminder
//                                                      / schedule / note)
//          - users/{uid}/revisionTests/{id}           (revision / mcq)
//          - settings/adminAuditLog/entries/{id}      (every action)
//          - settings/adminScheduledJobs/jobs/{id}    (future items)
//
//     3. The cron pinger (api/cron/subscription-renewals.ts) picks
//        up the scheduled jobs at the right time and fires FCM +
//        Web Push + in-app bell.
//
//     4. The client hooks (useFlowPathFirestore + useFlowPathSync)
//        mirror the local 3D flow to the server multiplexer so
//        every FlowPath activity also appears in the user's
//        real My Day / Revision pages.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flowpathControl = fs.readFileSync("api/_lib/flowpathControl.ts", "utf8");
const flowpathAccess = fs.readFileSync("api/_lib/flowpathAccess.ts", "utf8");
const referralLeaderboard = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");
const firestoreRules = fs.readFileSync("firestore.rules", "utf8");
const vercelConfig = fs.readFileSync("vercel.json", "utf8");
const flowpathClient = fs.readFileSync("src/flowpath/lib/flowpathControlClient.ts", "utf8");
const flowpathFirestore = fs.readFileSync("src/flowpath/hooks/useFlowPathFirestore.ts", "utf8");
const flowpathSync = fs.readFileSync("src/flowpath/hooks/useFlowPathSync.ts", "utf8");
const activityEditor = fs.readFileSync("src/flowpath/components/ActivityEditor.tsx", "utf8");
const bulkRevisionCreator = fs.readFileSync("src/flowpath/components/BulkRevisionCreator.tsx", "utf8");
const flowpathView = fs.readFileSync("src/components/flowpath/FlowPathView.tsx", "utf8");
const flowpathTypes = fs.readFileSync("src/flowpath/types/flowpath.ts", "utf8");

/* ------------------------------------------------------------------ */
/*  Server: multiplexer wiring                                        */
/* ------------------------------------------------------------------ */

test("flowpath control multiplexer is routed through referral-leaderboard (Hobby 12-function cap)", () => {
  assert.match(vercelConfig, /\/api\/flowpath\/control/);
  assert.match(vercelConfig, /\/api\/referral-leaderboard/);
  // The dispatcher in referral-leaderboard.ts switches on action.startsWith("flowpath.").
  assert.match(referralLeaderboard, /action\.startsWith\("flowpath\."\)/);
  assert.match(referralLeaderboard, /handleFlowPathControl/);
});

test("flowpath control multiplexer exposes every action kind", () => {
  assert.match(flowpathControl, /flowpath\.list/);
  assert.match(flowpathControl, /flowpath\.create/);
  assert.match(flowpathControl, /flowpath\.bulk/);
  assert.match(flowpathControl, /flowpath\.update/);
  assert.match(flowpathControl, /flowpath\.delete/);
  assert.match(flowpathControl, /flowpath\.complete/);
  assert.match(flowpathControl, /flowpath\.audit/);
  assert.match(flowpathControl, /flowpath\.broadcast/);
});

test("flowpath control multiplexer persists to flowpathActivities (master copy)", () => {
  assert.match(flowpathControl, /collection\("flowpathActivities"\)/);
  assert.match(flowpathControl, /persistActivity/);
});

test("flowpath control multiplexer mirrors to myDay for My Day kinds", () => {
  // task, reminder, schedule, note go to users/{uid}/myDay/current.
  assert.match(flowpathControl, /mirrorToMyDay/);
  assert.match(flowpathControl, /tasks/);
  assert.match(flowpathControl, /reminders/);
  assert.match(flowpathControl, /schedule/);
  assert.match(flowpathControl, /notes/);
});

test("flowpath control multiplexer routes revision / mcq through handleRevisionData", () => {
  // Revision kinds go through the existing revision handler so Test
  // Bank capacity (PLAN_REQUIRED, TEST_BANK_FULL) and the existing
  // revisionTests doc shape are reused — no duplicate business logic.
  assert.match(flowpathControl, /handleRevisionData/);
  assert.match(flowpathControl, /revision\.data\.create/);
  assert.match(flowpathControl, /kind === "revision"/);
  assert.match(flowpathControl, /kind === "mcq"/);
});

test("flowpath control multiplexer fans out to FCM + Web Push for immediate items", () => {
  // Items with scheduledFor in the past (or null) fire immediately
  // through both transports. The dual fan-out matches the pattern
  // already established in api/push/send.ts and the cron scheduler.
  assert.match(flowpathControl, /fcmPushToUser/);
  assert.match(flowpathControl, /pushToUser/);
  assert.match(flowpathControl, /Promise\.all/);
  assert.match(flowpathControl, /dispatchActivity/);
});

test("flowpath control multiplexer schedules future items in adminScheduledJobs", () => {
  // Items with scheduledFor > now + 10s are NOT fired immediately —
  // they're queued for the cron pinger. The doc includes the payload,
  // the deep link URL, and a recurrence spec for daily/weekly/monthly
  // repeats.
  assert.match(flowpathControl, /scheduleJob/);
  assert.match(flowpathControl, /adminScheduledJobs/);
  assert.match(flowpathControl, /recurrence/);
  assert.match(flowpathControl, /deepLinkForActivity/);
});

test("flowpath control multiplexer writes an audit log entry per action", () => {
  // Every action appends a doc to settings/adminAuditLog/entries
  // with actor, action kind, target uid, summary, and delivery
  // stats. The FlowPath feed (admin only) reads from there.
  assert.match(flowpathControl, /appendAudit/);
  assert.match(flowpathControl, /adminAuditLog/);
  assert.match(flowpathControl, /actorUid/);
  assert.match(flowpathControl, /actorEmail/);
  assert.match(flowpathControl, /delivery/);
});

test("flowpath control multiplexer caps bulk create at 100 items", () => {
  // 100 is the per-call ceiling (was 50; raised so the lecture
  // planner's "schedule every fresh course for every user" admin
  // flow stays bounded but the user-facing picker can still
  // ship a 20-lecture batch in one click).
  assert.match(flowpathControl, /items\.length > 100/);
  assert.match(flowpathControl, /Bulk limit is 100 items\./);
});

test("flowpath control multiplexer allows admin to act on any user", () => {
  // Non-admin can only create for themselves; admin can pick any
  // uid. The check is the approved-admin email + role.
  assert.match(flowpathControl, /wmath84@gmail\.com/);
  assert.match(flowpathControl, /Cannot create for another user/);
});

test("flowpath control multiplexer broadcasts to all users via FCM + Web Push", () => {
  // Marketing-style one-off to all users. Admin only. The fan-out
  // hits both transports; the result reports how many devices
  // each side reached.
  assert.match(flowpathControl, /fcmPushToAllDevices/);
  assert.match(flowpathControl, /pushToAllDevices/);
  assert.match(flowpathControl, /flowpath\.broadcast/);
});

/* ------------------------------------------------------------------ */
/*  Server: access / capabilities                                     */
/* ------------------------------------------------------------------ */

test("flowpath access helper mirrors the My Day free-tier gate", () => {
  // The same daily free-allowance counter that api/_lib/myDay.ts
  // uses; non-subscribers get N creations per local day.
  assert.match(flowpathAccess, /freeItemsPerDay/);
  assert.match(flowpathAccess, /dayCount/);
  assert.match(flowpathAccess, /MYDAY_DAILY_FREE_USED/);
});

test("flowpath access helper requires an active subscription for revision kinds", () => {
  // Revision / mcq create needs an active subscription with the
  // `revision` feature. The error code is the same one the
  // existing revision page returns.
  assert.match(flowpathAccess, /PLAN_REQUIRED/);
  assert.match(flowpathAccess, /Revision Studio/);
  assert.match(flowpathAccess, /features\.includes\("revision"\)/);
});

/* ------------------------------------------------------------------ */
/*  Cron: scheduled-job dispatch                                       */
/* ------------------------------------------------------------------ */

test("cron pinger picks up pending FlowPath jobs whose scheduledFor is in the past", () => {
  // The new block in the cron scheduler queries
  // settings/adminScheduledJobs/jobs where status == "pending"
  // and scheduledFor <= now. Failed jobs retry up to 5 times; on
  // success the doc is marked fired (terminal).
  assert.match(cron, /adminScheduledJobs/);
  assert.match(cron, /where\("status", "==", "pending"\)/);
  assert.match(cron, /where\("scheduledFor", "<=", Timestamp\.fromMillis\(now\)\)/);
  assert.match(cron, /status: "fired"/);
  assert.match(cron, /status: "cancelled"/);
  assert.match(cron, /max attempts reached/);
});

test("cron pinger checks the live activity before firing", () => {
  // A deleted or completed activity must NOT produce a phantom
  // push. The cron re-reads the activity doc and skips jobs whose
  // owner doc is gone or status is completed / cancelled.
  assert.match(cron, /activitySnap\.exists/);
  assert.match(cron, /activity\.status === "completed"/);
  assert.match(cron, /activity\.status === "cancelled"/);
});

test("cron pinger fans out scheduled FlowPath jobs through FCM + Web Push", () => {
  // The cron wraps the dual-transport fan-out in a single
  // `sendPush(db, uid, ...)` helper that internally calls
  // fcmPushToUser (installed Android TWA) + the web push
  // fan-out (browsers). Either transport being down does not
  // block the other.
  assert.match(cron, /sendPush/);
  assert.match(cron, /fcmPushToUser/);
  assert.match(cron, /flowpath:/);
});

/* ------------------------------------------------------------------ */
/*  Firestore rules                                                     */
/* ------------------------------------------------------------------ */

test("firestore rules: flowpathActivities is owner-read, admin-write", () => {
  // The user-facing My Day / Revision pages are still owner-
  // writable through their original handlers. flowpathActivities
  // is the master copy the dashboard reads — written by the
  // server multiplexer, not the client.
  assert.match(firestoreRules, /match \/flowpathActivities\/{activityId\}/);
  assert.match(firestoreRules, /allow read: if isOwner\(uid\) \|\| isAdmin\(\)/);
  assert.match(firestoreRules, /allow create, update, delete: if isAdmin\(\)/);
});

test("firestore rules: adminAuditLog and adminScheduledJobs are admin-only", () => {
  // The audit log is read-only for admins (writes go through the
  // Admin SDK which bypasses rules). The scheduled jobs queue is
  // the same.
  assert.match(firestoreRules, /match \/adminAuditLog\/{entryId\}/);
  assert.match(firestoreRules, /allow read: if isAdmin\(\)/);
  assert.match(firestoreRules, /allow write: if false/);
  assert.match(firestoreRules, /match \/adminScheduledJobs\/{jobId\}/);
});

/* ------------------------------------------------------------------ */
/*  Client: control client + Firestore hook + sync hook               */
/* ------------------------------------------------------------------ */

test("client posts every action with a Firebase id token", () => {
  // The control client must include the auth id token in every
  // call; the server's requireFirebaseUser rejects anonymous
  // requests with a 401.
  assert.match(flowpathClient, /getIdToken/);
  assert.match(flowpathClient, /Authorization: `Bearer \$\{token\}`/);
});

test("client surfaces server error codes (PLAN_REQUIRED, TEST_BANK_FULL)", () => {
  // The client must read the body's `code` field so the UI can
  // show specific recovery hints (subscribe, delete a test,
  // wait for the daily reset) instead of a generic toast.
  assert.match(flowpathClient, /code/);
  assert.match(flowpathClient, /REQUEST_FAILED/);
  assert.match(flowpathClient, /TIMEOUT/);
});

test("client caps request at 25 seconds", () => {
  // A stuck server never freezes the dashboard. The AbortController
  // fires after 25s and the client surfaces TIMEOUT.
  assert.match(flowpathClient, /TIMEOUT_MS = 25_000/);
  assert.match(flowpathClient, /AbortController/);
  assert.match(flowpathClient, /AbortError/);
});

test("useFlowPathFirestore polls every 60s and seeds demo activities on first load", () => {
  // A user with no Firestore docs yet sees a few demo activities
  // so the dashboard is never empty. Polling is a single
  // collection read per user per minute.
  assert.match(flowpathFirestore, /setInterval\(run, 60_000\)/);
  assert.match(flowpathFirestore, /seedActivities/);
});

test("useFlowPathFirestore exposes create / bulk / update / remove / complete / broadcast", () => {
  // Every mutation goes through the server multiplexer. The
  // hook's return shape matches what the dashboard UI needs.
  assert.match(flowpathFirestore, /const create = useCallback/);
  assert.match(flowpathFirestore, /const bulk = useCallback/);
  assert.match(flowpathFirestore, /const update = useCallback/);
  assert.match(flowpathFirestore, /const remove = useCallback/);
  assert.match(flowpathFirestore, /const complete = useCallback/);
  assert.match(flowpathFirestore, /const broadcast = useCallback/);
});

test("useFlowPathSync debounces mutations and queues offline changes", () => {
  // A flurry of local edits becomes one server call (350ms
  // debounce). Offline mutations queue in localStorage and replay
  // on the next online session.
  assert.match(flowpathSync, /350/);
  assert.match(flowpathSync, /flowpath:pending-sync.v1/);
  assert.match(flowpathSync, /replayQueue/);
  assert.match(flowpathSync, /attempts\s*<\s*3/);
});

test("useFlowPathSync translates local Activity to server FlowPathActivity for every kind", () => {
  // task / reminder / schedule / note / revision / mcq each map
  // to the server's per-kind field shape. A version bump or
  // schema change is a one-line tweak in toFlowPathActivity().
  assert.match(flowpathSync, /toFlowPathActivity/);
  assert.match(flowpathSync, /taskPriority/);
  assert.match(flowpathSync, /reminderTime/);
  assert.match(flowpathSync, /scheduleStartTime/);
  assert.match(flowpathSync, /noteColor/);
  assert.match(flowpathSync, /testConfig/);
});

/* ------------------------------------------------------------------ */
/*  Client: ActivityEditor + BulkRevisionCreator                       */
/* ------------------------------------------------------------------ */

test("ActivityEditor handles all 7 activity kinds from a single modal", () => {
  // One modal, six kind tabs (task, reminder, schedule, note,
  // revision, mcq). kind-specific fields appear below the tabs
  // based on the selected kind.
  assert.match(activityEditor, /KIND_TABS/);
  assert.match(activityEditor, /"task"/);
  assert.match(activityEditor, /"reminder"/);
  assert.match(activityEditor, /"schedule"/);
  assert.match(activityEditor, /"note"/);
  assert.match(activityEditor, /"revision"/);
  assert.match(activityEditor, /"mcq"/);
});

test("ActivityEditor supports immediate, datetime, and recurring schedule modes", () => {
  // Three schedule modes. Recurring writes a `recurrence` field
  // with daily/weekly/monthly freq. Datetime computes an epoch
  // ms. Immediate leaves scheduledFor null.
  assert.match(activityEditor, /scheduleMode === "immediate"/);
  assert.match(activityEditor, /scheduleMode === "datetime"/);
  assert.match(activityEditor, /scheduleMode === "recurring"/);
  assert.match(activityEditor, /recurrence/);
});

test('ActivityEditor surfaces a live "Will fire on ..." footer preview', () => {
  // The footer tells the user exactly when the activity will
  // fire before they submit. This catches "I thought I picked
  // next Monday" mistakes before they happen.
  assert.match(activityEditor, /Will fire on/);
  assert.match(activityEditor, /Fires immediately on save/);
});

test("BulkRevisionCreator supports 2-5 slots with the Easy/Medium/Hard preset", () => {
  // The "2-3 tests at once" flow the user explicitly asked for.
  // 5 is the UI cap; the server bulk limit is 50. Easy / Medium /
  // Hard preset auto-fills each slot with the right question
  // count and minute estimate so an admin can ship a graduated
  // practice set in one click.
  assert.match(bulkRevisionCreator, /Easy \/ Medium \/ Hard/);
  assert.match(bulkRevisionCreator, /applyPresetEazyMediumHard/);
  assert.match(bulkRevisionCreator, /slots\.length >= 5/);
  assert.match(bulkRevisionCreator, /batchId/);
});

test("BulkRevisionCreator shares a single batchId across every slot", () => {
  // The audit feed groups the slots as one logical action;
  // the user's Revision bank shows them as a cluster.
  assert.match(bulkRevisionCreator, /batch-\$\{Date\.now\(\)\.toString\(36\)\}/);
  assert.match(bulkRevisionCreator, /batchIndex: i/);
});

/* ------------------------------------------------------------------ */
/*  Client: FlowPathView integration                                   */
/* ------------------------------------------------------------------ */

test("FlowPathView wires useFlowPathFirestore so admin-created items appear in the dashboard", () => {
  // The 3D flow's local state (localStorage) is the visual
  // source of truth; the Firestore snapshot is the system
  // source of truth. The view merges them so cross-device +
  // admin-created items show up alongside the user's own.
  assert.match(flowpathView, /useFlowPathFirestore/);
  assert.match(flowpathView, /mergedItems/);
  assert.match(flowpathView, /firestoreItems/);
  assert.match(flowpathView, /buildRows\(mergedItems, config\)/);
});

test("FlowPathView wires useFlowPathSync so every local mutation mirrors to the server", () => {
  // Without the sync hook, a user-created FlowPath activity
  // would never appear in the real My Day page. The sync
  // hook calls the server multiplexer on every change.
  assert.match(flowpathView, /useFlowPathSync\(items\)/);
});

/* ------------------------------------------------------------------ */
/*  Type contract: client and server agree on shape                    */
/* ------------------------------------------------------------------ */

test("client FlowPathActivity type matches the server's shape", () => {
  // The client type and the server type carry the same fields.
  // Adding a new field requires a matching change in both
  // places; the contract test catches any drift.
  const fields = [
    "id", "uid", "kind", "title", "description", "scheduledFor",
    "status", "createdBy", "createdAt", "updatedAt", "taskPriority",
    "taskSubject", "taskStatus", "scheduleStartTime", "scheduleEndTime",
    "scheduleType", "noteColor", "reminderTime", "testConfig",
    "testId", "source", "batchId", "batchIndex", "lastDelivery",
  ];
  for (const field of fields) {
    assert.match(flowpathTypes, new RegExp(`\\b${field}\\b`), `client type missing ${field}`);
    assert.match(flowpathControl, new RegExp(`\\b${field}\\b`), `server type missing ${field}`);
  }
});
