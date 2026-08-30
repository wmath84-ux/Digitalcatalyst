// tests/flowpathLectureContract.test.mjs
//
// Contract tests for the FlowPath Lecture Planner. The user
// explicitly asked: "kon sa module kab dekhna hai, unke pass
// dropdowns ho, multiple courses aur unke modules ek saath plan
// kar sake, aur koi bhi product jo checkout pe hai abhi (preview
// only) use bhi schedule kar sake".
//
//   The new flow:
//     • FlowPath + button → radial menu → "Lecture" → 3-step
//       LecturePicker.
//     • Step 1: pick a course (search + category filter, owned
//       first then preview-only with a "Preview" badge).
//     • Step 2: pick a module (skipped for flat courses).
//     • Step 3: schedule (immediate / at time / recurring) +
//       add to queue.
//     • "+ Add another" → loop back to step 1 to add more.
//     • "Schedule all" → single flowpath.bulk call to the server.
//     • Server mirrors each lecture to flowpathActivities with
//       deep-link routing:
//         - owned course: #/course/{productId}?module={moduleId}&lecture={id}
//         - preview course: #/product/{productId}?lecture={id}
//
//   The 11 contract tests below pin every layer: server
//   helpers, multiplexer wiring, deep-link computation, picker
//   read endpoints, picker UI structure, sync hooks.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const flowpathControl = fs.readFileSync("api/_lib/flowpathControl.ts", "utf8");
const flowpathAccess = fs.readFileSync("api/_lib/flowpathAccess.ts", "utf8");
const lecturePlanner = fs.readFileSync("api/_lib/lecturePlanner.ts", "utf8");
const flowpathClient = fs.readFileSync("src/flowpath/lib/flowpathControlClient.ts", "utf8");
const flowpathTypes = fs.readFileSync("src/flowpath/types/flowpath.ts", "utf8");
const lecturePicker = fs.readFileSync("src/flowpath/components/LecturePicker.tsx", "utf8");
const flowpathView = fs.readFileSync("src/components/flowpath/FlowPathView.tsx", "utf8");
const bottomDock = fs.readFileSync("src/components/flowpath/BottomDock.tsx", "utf8");
const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");

/* ------------------------------------------------------------------ */
/*  Server: lecture planner helpers                                   */
/* ------------------------------------------------------------------ */

test("lecture planner reads the user's purchased product ids for preview-only detection", () => {
  // Preview-only = the user does not own the course. The planner
  // reads the same purchasedProductIds + entitlements that the
  // PDP and the course player use.
  assert.match(lecturePlanner, /purchasedProductIds/);
  assert.match(lecturePlanner, /purchasedProductIds/);
  assert.match(lecturePlanner, /collectionGroup\("entitlements"\)/);
});

test("lecture planner walks the same courseContent tree the course player reads", () => {
  // The module list is built from the same nested courseContent
  // shape the course player + AI revision engine read, so the
  // picker can never get out of sync with the actual product.
  assert.match(lecturePlanner, /courseContent/);
  assert.match(lecturePlanner, /flattenModules/);
});

test("lecture planner puts owned courses first, then preview-only", () => {
  // Same UX rule as the home / store pages: things the user
  // already has go to the top of the list, then the ones they
  // can still plan ahead for.
  assert.match(lecturePlanner, /a\.previewOnly !== b\.previewOnly/);
  assert.match(lecturePlanner, /a\.title\.localeCompare/);
});

test("lecture module lookup avoids the esbuild-unparseable typeof db.collection type query", () => {
  // `typeof db.collection("siteProducts").doc(String).get` is a
  // type query Vercel's esbuild bundler cannot parse, which broke the
  // build of the shared `api/referral-leaderboard` function (the one
  // that serves `/api/myday`). The lookup must stay a plain early-return
  // loop so the whole function bundles cleanly.
  assert.doesNotMatch(lecturePlanner, /typeof\s+db\.collection\(/);
  assert.match(lecturePlanner, /return\s+modules\.map\(\(m\) =>/);
});

/* ------------------------------------------------------------------ */
/*  Server: multiplexer wiring                                       */
/* ------------------------------------------------------------------ */

test("flowpath.lecture.courses action is wired and reads through the multiplexer", () => {
  // The LecturePicker calls this with the search query. The
  // multiplexer returns the owned + preview courses the user
  // can schedule.
  assert.match(flowpathControl, /flowpath\.lecture\.courses/);
  assert.match(flowpathControl, /getLectureCourses\(targetUid, q\)/);
});

test("flowpath.lecture.modules action is wired and reads through the multiplexer", () => {
  // Step 2 of the picker calls this with the picked course's id
  // and gets back the full module list. 404 on missing product
  // is handled by the planner helper.
  assert.match(flowpathControl, /flowpath\.lecture\.modules/);
  assert.match(flowpathControl, /getLectureModules\(productId\)/);
});

test("flowpath.create validates lecture productId and module, and falls back to the first module if the picked one was deleted", () => {
  // A scheduled item that references a now-deleted module must
  // not fail the whole schedule — fall back to the first
  // available module so the user still gets a notification.
  assert.match(flowpathControl, /getLectureModules\(productId\)/);
  assert.match(flowpathControl, /modules\.length === 0/);
  assert.match(flowpathControl, /fall back to the first module/);
});

test("flowpath.create sets lecturePreviewOnly by comparing against the user's purchased product ids", () => {
  // Preview-only = the user does not own the course. The deep
  // link then routes to the product page instead of the course
  // player.
  assert.match(flowpathControl, /getPurchasedProductIds/);
  assert.match(flowpathControl, /lecturePreviewOnly = !owned/);
});

test("flowpath.create also handles lectures in the bulk path with the same fallback rules", () => {
  // A 2-3 test batch (or a 5-lecture course batch) must apply
  // the same validation per item. Failures on one item do not
  // abort the whole batch.
  assert.match(flowpathControl, /if \(activity\.kind === "lecture"\)/);
  assert.match(flowpathControl, /fall back to the first/);
  assert.match(flowpathControl, /lecturePreviewOnly/);
});

test("flowpath control multiplexer deep-links a lecture to the course player when owned", () => {
  // Owned courses open the course player at the chosen module
  // (or the course root when no module is picked). The
  // `lecture=...` query lets the player highlight the
  // scheduling context.
  assert.match(flowpathControl, /case "lecture":/);
  assert.match(flowpathControl, /#\/course\//);
  assert.match(flowpathControl, /lecture=\$\{encodeURIComponent\(activity\.id\)\}/);
});

test("flowpath control multiplexer deep-links a preview lecture to the product page", () => {
  // Preview courses (the user has not bought yet) deep-link to
  // the product page so the bell tap lands on the buy flow.
  assert.match(flowpathControl, /lecturePreviewOnly/);
  assert.match(flowpathControl, /#\/product\//);
});

test("flowpath control multiplexer raises the bulk cap from 50 to 100 to support the multi-course batch", () => {
  // The user can pick several courses with several modules each
  // in one batch. The server cap is now 100 (was 50) so a
  // future "schedule every fresh course for every user" admin
  // flow stays bounded.
  assert.match(flowpathControl, /items\.length > 100/);
  assert.match(flowpathControl, /Bulk limit is 100 items\./);
});

/* ------------------------------------------------------------------ */
/*  Server: access gate (every user can schedule lectures)            */
/* ------------------------------------------------------------------ */

test("lecture kind bypasses the My Day free-tier counter and the revision subscription gate", () => {
  // Lectures are plan-ahead content; the user can schedule a
  // course they may not even own yet. No gate. Preview-only is
  // an explicit UX affordance, not a permission check.
  assert.match(flowpathAccess, /kind === "lecture"/);
  assert.match(flowpathAccess, /canCreate: true/);
});

/* ------------------------------------------------------------------ */
/*  Server: cron dispatch (lecture fires at scheduled time)          */
/* ------------------------------------------------------------------ */

test("cron pinger routes lecture bell entries to the product target with the course productId", () => {
  // The bell entry for a fired lecture carries productId =
  // lectureProductId so the notifications page can route the
  // tap to the course or the PDP.
  assert.match(cron, /activity\.kind === "lecture"/);
  assert.match(cron, /activity\.lectureProductId \|\| jobActivityId/);
  assert.match(cron, /category: activity\.kind === "revision" \|\| activity\.kind === "mcq" \|\| activity\.kind === "lecture"/);
});

/* ------------------------------------------------------------------ */
/*  Client: type contract                                              */
/* ------------------------------------------------------------------ */

test("FlowPathActivity type carries every lecture field on both client and server", () => {
  // The shape drift test the rest of the file relies on.
  const fields = [
    "lectureProductId", "lectureProductTitle", "lectureModuleId",
    "lectureModuleTitle", "lectureEstimatedMinutes", "lecturePreviewOnly",
    "lectureProgress",
  ];
  for (const field of fields) {
    assert.match(flowpathTypes, new RegExp(`\\b${field}\\b`), `client type missing ${field}`);
    assert.match(flowpathControl, new RegExp(`\\b${field}\\b`), `server type missing ${field}`);
  }
});

test("FLOW_PATH_KIND_META includes lecture (cyan accent) for the 3D node", () => {
  // The dashboard paints lecture nodes cyan so they stand out
  // from purple tasks, amber reminders, etc.
  assert.match(flowpathTypes, /FLOW_PATH_KIND_META/);
  assert.match(flowpathTypes, /lecture: \{ label: "Lecture", color: "#22d3ee"/);
});

/* ------------------------------------------------------------------ */
/*  Client: control client helpers                                    */
/* ------------------------------------------------------------------ */

test("control client exposes flowpathLectureCourses + flowpathLectureModules", () => {
  // Thin wrappers around the server's read endpoints so the
  // picker doesn't have to spell out the action body.
  assert.match(flowpathClient, /flowpathLectureCourses/);
  assert.match(flowpathClient, /flowpathLectureModules/);
  assert.match(flowpathClient, /flowpath\.lecture\.courses/);
  assert.match(flowpathClient, /flowpath\.lecture\.modules/);
});

/* ------------------------------------------------------------------ */
/*  Client: LecturePicker (3-step wizard)                            */
/* ------------------------------------------------------------------ */

test("LecturePicker renders a 3-step step indicator", () => {
  // Pick course → Pick module → Schedule. The active step
  // highlights; completed steps turn green.
  assert.match(lecturePicker, /Step 1/);
  assert.match(lecturePicker, /Step 2/);
  assert.match(lecturePicker, /Step 3/);
  assert.match(lecturePicker, /data-step-indicator/);
  assert.match(lecturePicker, /bg-emerald-500/);
});

test("LecturePicker step 1 includes a search input and a course grid with a Preview badge for non-owned courses", () => {
  assert.match(lecturePicker, /data-field="course-search"/);
  assert.match(lecturePicker, /data-course-list/);
  assert.match(lecturePicker, /data-course-preview/);
  assert.match(lecturePicker, /Preview · not purchased/);
});

test("LecturePicker step 2 shows the module list with a numbered selector", () => {
  // Modules are listed with their order number so the user
  // can see at a glance that "Module 1" is the first topic.
  assert.match(lecturePicker, /data-module-list/);
  assert.match(lecturePicker, /data-module-id/);
  assert.match(lecturePicker, /data-module-selected/);
});

test("LecturePicker step 3 has 3 schedule modes (immediate / datetime / recurring)", () => {
  // Recurring on lectures = "every day" — the user typically
  // wants "read this module every morning at 9 AM" so the
  // engine regenerates each occurrence 24h ahead.
  assert.match(lecturePicker, /"immediate"/);
  assert.match(lecturePicker, /"datetime"/);
  assert.match(lecturePicker, /"recurring"/);
  assert.match(lecturePicker, /data-schedule-mode/);
});

test("LecturePicker shows a 'Preview only' warning when the user picks a course they don't own", () => {
  // The warning is shown on step 3 so the user knows the bell
  // tap will land on the product page (not the player) until
  // they buy. No second-guessing on the day the alarm fires.
  assert.match(lecturePicker, /don't own this course yet/);
  assert.match(lecturePicker, /product page/);
});

test("LecturePicker caps the visible queue at 20 so the modal stays usable", () => {
  // The user can pick "Add another" repeatedly; the cap is 20
  // because each lecture adds a card to the bottom of the
  // modal. The server bulk cap is 100 (admin future-proofing).
  assert.match(lecturePicker, /MAX_BATCH = 20/);
});

test("LecturePicker collects all queued lectures into one flowpath.bulk call", () => {
  // Single submit = single network call. The ActivityEditor
  // does the same for tasks / reminders / etc.
  assert.match(lecturePicker, /flowpath\.bulk/);
  assert.match(lecturePicker, /queued lecture/);
});

/* ------------------------------------------------------------------ */
/*  Client: FlowPathView wiring                                       */
/* ------------------------------------------------------------------ */

test("FlowPathView opens the LecturePicker from the + radial menu", () => {
  // Picking "Lecture" in the radial menu sets lecturePickerOpen
  // = true and skips the regular CreateModal entirely.
  assert.match(flowpathView, /LecturePicker/);
  assert.match(flowpathView, /setLecturePickerOpen\(true\)/);
  assert.match(flowpathView, /id === "lecture"/);
});

test("FlowPathView also exposes a dedicated 'Lectures' button in the BottomDock", () => {
  // The user explicitly asked for "kon sa module kab dekhna
  // hai" — a direct shortcut is friendlier than going through
  // the + menu.
  assert.match(bottomDock, /onPlanLectures/);
  assert.match(bottomDock, /Lectures/);
  assert.match(flowpathView, /onPlanLectures/);
  assert.match(flowpathView, /setLecturePickerOpen\(true\)/);
});

test("FlowPathView's radial menu includes a 'Lecture' entry with the cyan accent", () => {
  // Same surface as the other 6 kinds. The icon is BookOpen
  // (the lecture metaphor).
  assert.match(flowpathView, /id: "lecture"/);
  assert.match(flowpathView, /label: "Lecture"/);
  assert.match(flowpathView, /#22d3ee/);
});
